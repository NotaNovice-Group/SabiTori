"""Export paraphrase-multilingual-MiniLM-L12-v2 as a small on-device ONNX encoder.

What it does
  1. Loads the sentence-transformers model (Apache-2.0, 118M parameters, 250k-token vocabulary).
  2. Prunes the vocabulary to 30,000 pieces (the embedding table is 96M of the 118M parameters; the
     12 transformer layers are only 21M). Kept: every piece the TRAIN texts and pack lexicons use, every
     single Latin character, then (--fill freq, the default) every piece needed to spell the most
     frequent French and English words of a general word-frequency list (Hermit Dave FrequencyWords,
     OpenSubtitles 2018, pinned by commit and sha256), interleaved by rank, lower-case and Capitalised,
     and finally the best-scoring Unigram pieces if room is left. --fill score is the old strategy (no
     word list: best Unigram scores only). Kept pieces keep their exact weights; a word whose pieces are
     all kept tokenises exactly as in the original model; a dropped piece is split into smaller kept ones.
  3. Stores the embedding table as int8 (one scale per row), then exports encoder + mean pooling to
     ONNX and int8-quantises the MatMuls dynamically.
  4. Writes the pruned tokenizer.json next to it, and a fidelity check: cosine between the exported
     (pruned + int8) model's sentence embeddings and the original fp32 model's, on HELD-OUT text only
     (the test split, the unseen set and train/heldout-sentences.txt; none of it chooses any piece).

Usage: python export.py --out ../model/minilm --corpus ../eval/messages.jsonl \
         --corpus ../../../packs/fr/reading.json --corpus ../../../packs/en/reading.json \
         --heldout ../eval/messages.jsonl:test --heldout ../eval/unseen.jsonl --heldout heldout-sentences.txt
"""
from __future__ import annotations

import argparse, hashlib, json, re, shutil, sys, tempfile, urllib.request
from pathlib import Path

import numpy as np
import torch
from huggingface_hub import hf_hub_download
from sentence_transformers import SentenceTransformer
from tokenizers import Tokenizer

MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
TOKENIZER_SOURCE = MODEL  # the vocabulary always comes from the original model (a fine-tune keeps it)
# Characters that French/English text uses; a vocabulary piece made only of these is a candidate.
LATIN = re.compile(r"^[▁A-Za-z0-9À-ÖØ-öø-ÿŒœŸ'’“”«»‘’.,;:!?%/\\()\[\]{}<>@#*&+=_|~^$€£°…–—-]+$")


# General word-frequency lists (Hermit Dave, FrequencyWords, built from OpenSubtitles 2018).
# Content licence CC-BY-SA-4.0, code MIT. Used only to CHOOSE which of the original tokenizer's pieces
# are kept: no word, count or other content of the list is copied into any shipped file.
FREQ_COMMIT = "525f9b560de45753a5ea01069454e72e9aa541c6"
FREQ_LISTS = {
    "fr": ("content/2018/fr/fr_50k.txt", "f81f7c570b6433764da99aa30f4dfb08d81c5926301377b709af23a13b1f9596"),
    "en": ("content/2018/en/en_50k.txt", "5351ff405b1126ef555791dd4d9798a48e3e9a501a9fc481a9da957752cfb458"),
}


def freq_words(lang: str, cache: Path) -> list[str]:
    path, sha = FREQ_LISTS[lang]
    f = cache / f"{lang}_50k.{FREQ_COMMIT[:12]}.txt"
    if not f.exists():
        cache.mkdir(parents=True, exist_ok=True)
        url = f"https://raw.githubusercontent.com/hermitdave/FrequencyWords/{FREQ_COMMIT}/{path}"
        f.write_bytes(urllib.request.urlopen(url, timeout=60).read())
    got = hashlib.sha256(f.read_bytes()).hexdigest()
    if got != sha:
        raise SystemExit(f"{f}: sha256 {got} != pinned {sha}")
    return [l.split(" ")[0] for l in f.read_text("utf8").splitlines() if l.strip()]


def corpus_texts(paths: list[str]) -> list[str]:
    out: list[str] = []
    for p in map(Path, paths):
        files = [p] if p.is_file() else sorted(p.rglob("*.json")) + sorted(p.rglob("*.jsonl"))
        for f in files:
            if f.suffix == ".jsonl":
                for line in f.read_text("utf8").splitlines():
                    if line.strip():
                        d = json.loads(line)
                        if isinstance(d, dict) and d.get("split", "train") != "train":
                            continue  # test/unseen rows never influence any choice, not even which tokens are kept
                        out.append(d["text"] if isinstance(d, dict) and "text" in d else json.dumps(d, ensure_ascii=False))
            else:
                try:
                    out.append(json.dumps(json.loads(f.read_text("utf8")), ensure_ascii=False))
                except Exception:
                    pass
    return out


def heldout_texts(specs: list[str]) -> dict[str, list[str]]:
    """'file.jsonl:split' (rows of that split), 'file.jsonl' (all rows) or 'file.txt' (one sentence per line)."""
    out: dict[str, list[str]] = {}
    for spec in specs:
        path, _, split = spec.partition(":") if not Path(spec).exists() else (spec, "", "")
        p = Path(path)
        if p.suffix == ".jsonl":
            rows = [json.loads(l) for l in p.read_text("utf8").splitlines() if l.strip()]
            out[f"{p.name}{':' + split if split else ''}"] = [r["text"] for r in rows if not split or r.get("split") == split]
        else:
            out[p.name] = [l.strip() for l in p.read_text("utf8").splitlines() if l.strip() and not l.startswith("#")]
    return out


def choose_vocab(tok: Tokenizer, texts: list[str], budget: int, fill: str = "freq", cache: Path | None = None) -> list[int]:
    tj = json.loads(tok.to_str())
    vocab = tj["model"]["vocab"]  # [[piece, score], ...] id == index
    keep = set(range(4))  # <s> <pad> </s> <unk>
    for t in texts:  # every piece the corpus needs
        keep.update(tok.encode(t).ids)
    # all single characters of the Latin set so unseen words always decompose
    for i, (piece, _) in enumerate(vocab):
        if i >= 4 and LATIN.match(piece) and len(piece.replace("▁", "")) <= 1:
            keep.add(i)
    if fill == "freq":
        # every piece needed to spell frequent fr/en words exactly as the original tokenizer does
        lists = [freq_words(l, cache or Path(__file__).parent / ".cache") for l in ("fr", "en")]
        for rank in range(max(map(len, lists))):
            add: set[int] = set()
            for words in lists:
                if rank < len(words):
                    for v in {words[rank], words[rank].capitalize()}:
                        add.update(tok.encode(v, add_special_tokens=False).ids)
            if len(keep | add) > budget:
                break
            keep |= add
    # fill the rest with the best-scoring Latin pieces (Unigram log-probabilities)
    cands = sorted((i for i, (p, _) in enumerate(vocab) if i >= 4 and i not in keep and LATIN.match(p)), key=lambda i: -vocab[i][1])
    for i in cands:
        if len(keep) >= budget:
            break
        keep.add(i)
    return sorted(keep)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--base", default=None, help="a fine-tuned copy of the encoder (sentence-transformers folder from finetune.py); default: the original")
    ap.add_argument("--corpus", action="append", default=[])
    ap.add_argument("--vocab", type=int, default=30000, help="vocabulary pieces to keep")
    ap.add_argument("--fill", choices=["freq", "score"], default="freq", help="how to fill the budget after the corpus pieces")
    ap.add_argument("--heldout", action="append", default=[], help="held-out text for the fidelity check: file.jsonl[:split] or file.txt")
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    st = SentenceTransformer(args.base or MODEL, device="cpu")
    st.eval()
    n_params = sum(p.numel() for p in st.parameters())  # before the vocabulary is pruned
    hf = st[0].auto_model
    full_tok = Tokenizer.from_file(hf_hub_download(TOKENIZER_SOURCE, "tokenizer.json"))
    texts = corpus_texts(args.corpus)
    keep = choose_vocab(full_tok, texts, args.vocab, args.fill)
    remap = {old: new for new, old in enumerate(keep)}
    held = heldout_texts(args.heldout)
    if not held:
        raise SystemExit("pass at least one --heldout set: the fidelity check never uses training text")
    sets = list(held.items())
    sample = [t for _, ts in sets for t in ts]
    ref = st.encode(sample, convert_to_numpy=True, batch_size=32)  # original model, before we touch it
    print(f"vocab: {len(full_tok.get_vocab())} -> {len(keep)} (fill={args.fill}); corpus texts: {len(texts)}")

    # ---- pruned tokenizer.json -------------------------------------------------------------
    tj = json.loads(full_tok.to_str())
    tj["model"]["vocab"] = [tj["model"]["vocab"][o] for o in keep]
    tj["model"]["unk_id"] = remap[tj["model"]["unk_id"]]
    tj["added_tokens"] = [dict(t, id=remap[t["id"]]) for t in tj["added_tokens"] if t["id"] in remap]
    (out / "tokenizer.json").write_text(json.dumps(tj, ensure_ascii=False), "utf8")
    (out / "tokenizer_config.json").write_text(json.dumps({
        "tokenizer_class": "XLMRobertaTokenizerFast", "model_max_length": 128,
        "bos_token": "<s>", "eos_token": "</s>", "pad_token": "<pad>", "unk_token": "<unk>",
        "pad_token_id": remap[1], "bos_token_id": remap[0], "eos_token_id": remap[2], "unk_token_id": remap[3],
    }, indent=1), "utf8")
    Tokenizer.from_file(str(out / "tokenizer.json"))  # must load

    # ---- int8 embedding table --------------------------------------------------------------
    w = hf.embeddings.word_embeddings.weight.detach()[torch.tensor(keep)]
    scale = (w.abs().amax(dim=1, keepdim=True) / 127.0).clamp_min(1e-8)
    q = torch.round(w / scale).clamp(-127, 127).to(torch.int8)

    class Int8Embedding(torch.nn.Module):
        def __init__(self) -> None:
            super().__init__()
            self.register_buffer("q", q)
            self.register_buffer("scale", scale)

        def forward(self, ids: torch.Tensor) -> torch.Tensor:
            return self.q[ids].to(torch.float32) * self.scale[ids]

    class Encoder(torch.nn.Module):
        def __init__(self) -> None:
            super().__init__()
            self.m = hf
            self.m.embeddings.word_embeddings = Int8Embedding()

        def forward(self, input_ids: torch.Tensor, attention_mask: torch.Tensor) -> torch.Tensor:
            h = self.m(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state
            m = attention_mask.unsqueeze(-1).to(h.dtype)
            return (h * m).sum(1) / m.sum(1).clamp_min(1e-9)

    enc = Encoder().eval()
    tmp = Path(tempfile.mkdtemp())
    fp32 = tmp / "encoder.fp32.onnx"
    ids = torch.tensor([[remap[0], 10, 11, 12, remap[2]]])
    with torch.no_grad():
        torch.onnx.export(
            enc, (ids, torch.ones_like(ids)), str(fp32),
            input_names=["input_ids", "attention_mask"], output_names=["sentence_embedding"],
            dynamic_axes={"input_ids": {0: "batch", 1: "seq"}, "attention_mask": {0: "batch", 1: "seq"}, "sentence_embedding": {0: "batch"}},
            opset_version=17, dynamo=False,
        )
    from onnxruntime.quantization import QuantType, quantize_dynamic
    from onnxruntime.quantization.shape_inference import quant_pre_process
    pre = tmp / "encoder.pre.onnx"
    try:
        quant_pre_process(str(fp32), str(pre), skip_symbolic_shape=True)
    except Exception as e:  # pre-processing is an optimisation only
        print("pre-process skipped:", e)
        shutil.copy(fp32, pre)
    final = out / "encoder.int8.onnx"
    quantize_dynamic(str(pre), str(final), weight_type=QuantType.QInt8, op_types_to_quantize=["MatMul"])
    print("encoder.int8.onnx:", round(final.stat().st_size / 1e6, 2), "MB")

    # ---- check: quantised+pruned vs original sentence embeddings ---------------------------
    import onnxruntime as ort
    sess = ort.InferenceSession(str(final), providers=["CPUExecutionProvider"])
    ptok = Tokenizer.from_file(str(out / "tokenizer.json"))
    ptok.enable_truncation(128)
    otok = Tokenizer.from_file(hf_hub_download(TOKENIZER_SOURCE, "tokenizer.json"))
    otok.enable_truncation(128)
    cos, same_tokens = [], []
    for i, t in enumerate(sample):
        e = ptok.encode(t)
        v = sess.run(None, {"input_ids": np.array([e.ids], dtype=np.int64), "attention_mask": np.array([e.attention_mask], dtype=np.int64)})[0][0]
        cos.append(float(v @ ref[i] / (np.linalg.norm(v) * np.linalg.norm(ref[i]))))
        same_tokens.append(e.tokens == otok.encode(t).tokens)  # pruning changed nothing for this text
    per_set, k = {}, 0
    for name, ts in sets:
        c = np.array(cos[k:k + len(ts)])
        per_set[name] = {"n": len(ts), "cosine_mean": round(float(c.mean()), 4), "cosine_min": round(float(c.min()), 4),
                         "below_0.95": int((c < 0.95).sum()), "same_tokenisation": int(sum(same_tokens[k:k + len(ts)]))}
        k += len(ts)
    stats = {"heldout_only": True, "n": len(sample), "cosine_mean": round(float(np.mean(cos)), 4), "cosine_min": round(float(np.min(cos)), 4), "sets": per_set}
    print("exported vs original (held-out):", json.dumps(stats, indent=1))
    (out / "export-info.json").write_text(json.dumps({
        "source": MODEL, "fine_tuned": bool(args.base), "source_params": n_params, "exported_params": int(sum(int(np.prod(i.dims)) if i.dims else 1 for i in __import__("onnx").load(str(final)).graph.initializer)), "kept_vocab": len(keep), "fill": args.fill,
        "freq_lists": {"repo": "hermitdave/FrequencyWords", "commit": FREQ_COMMIT, "files": {k: v[0] for k, v in FREQ_LISTS.items()}, "sha256": {k: v[1] for k, v in FREQ_LISTS.items()}} if args.fill == "freq" else None,
        "dim": int(w.shape[1]),
        "onnx_bytes": final.stat().st_size, "cosine_vs_original": stats, "max_len": 128,
        "pad_id": remap[1], "ids": {"bos": remap[0], "eos": remap[2]},
    }, indent=1), "utf8")


if __name__ == "__main__":
    sys.exit(main())
