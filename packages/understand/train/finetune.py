#!/usr/bin/env python3
"""
Fine-tunes the sentence encoder together with three linear heads (kind, action, urgency) on TRAIN rows only.

Why: with the encoder frozen, three logistic regressions on its embeddings leave action and urgency weak on text
written by someone else. Letting the encoder itself learn the task moves related messages together.

Honesty rules (same as train.py):
- Only rows with split "train" are used. The test split and the unseen sets are never read here.
- Thresholds and the calibration temperature come from OUT-OF-FOLD predictions: the train rows are cut into
  5 folds, a model is fine-tuned on 4 and predicts the 5th, so every out-of-fold prediction comes from a model
  that never saw that row. Those go to oof.json for run-encoder.mjs --select-threshold.
- The shipped model is then fine-tuned once on all train rows with the same settings.

Output (--out): a sentence-transformers folder (for export.py --base), heads.json (W, b, temperature, for the
L2-normalised embedding, the same format train.py writes), oof.json and finetune-report.json.

  python finetune.py --data ../eval/messages.jsonl --extra ../eval/train-extra.jsonl \
      --extra ../eval/train-gen/g1.jsonl ... --out ../model/minilm-ft
"""
from __future__ import annotations

import argparse
import json
import math
import random
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from scipy.optimize import minimize_scalar
from scipy.special import softmax
from sentence_transformers import SentenceTransformer
from sklearn.model_selection import StratifiedKFold

BASE = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
LABELS = {
    "kind": ["electricity_bill", "water_bill", "mobile_money", "telecom", "bank", "health", "school", "administrative", "legal", "other"],
    "action": ["pay", "bring_document", "go_to_place", "call", "reply", "collect", "take_medicine", "nothing", "unclear"],
    "urgency": ["info", "soon", "urgent"],
}
FIELDS = list(LABELS)
SCALE = 20.0  # heads see a unit vector; the scale is folded into W at export
MAX_LEN = 128  # the app's token budget (encoder.ts)


def device() -> torch.device:
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def seed_all(s: int) -> None:
    random.seed(s)
    np.random.seed(s)
    torch.manual_seed(s)


class Net(torch.nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.st = SentenceTransformer(BASE, device="cpu")
        self.st.max_seq_length = MAX_LEN
        dim = self.st.get_sentence_embedding_dimension()
        self.heads = torch.nn.ModuleDict({f: torch.nn.Linear(dim, len(l)) for f, l in LABELS.items()})

    def embed(self, texts: list[str], dev: torch.device) -> torch.Tensor:
        prep = getattr(self.st, "preprocess", None) or self.st.tokenize
        feats = {k: (v.to(dev) if torch.is_tensor(v) else v) for k, v in prep(texts).items()}
        out = self.st(feats)["sentence_embedding"]  # mean pooling, as exported
        return F.normalize(out, dim=-1)

    def forward(self, texts: list[str], dev: torch.device) -> dict[str, torch.Tensor]:
        e = self.embed(texts, dev)
        return {f: SCALE * h(e) for f, h in self.heads.items()}


def train_one(rows: list[dict], epochs: int, lr: float, seed: int, dev: torch.device, batch: int = 8,
              smoothing: float = 0.05, freeze_emb: bool = True, weights: dict[str, float] | None = None) -> Net:
    seed_all(seed)
    net = Net().to(dev)
    if freeze_emb:
        # The word-embedding table is 96M of the 118M parameters and is pruned to 30k rows at export; keeping it
        # frozen makes a step ~3x cheaper on CPU and keeps kept pieces identical to the pruned table.
        net.st[0].auto_model.embeddings.word_embeddings.weight.requires_grad_(False)
    enc_params = [p for p in net.st.parameters() if p.requires_grad]
    w = weights or {f: 1.0 for f in FIELDS}
    opt = torch.optim.AdamW([{"params": enc_params, "lr": lr}, {"params": net.heads.parameters(), "lr": 2e-3}], weight_decay=0.01)
    steps = epochs * math.ceil(len(rows) / batch)
    warm = max(1, int(0.1 * steps))
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1.0, (s + 1) / warm) * max(0.0, (steps - s) / max(1, steps - warm)))
    y = {f: torch.tensor([LABELS[f].index(r["expected"][f]) for r in rows]) for f in FIELDS}
    net.train()
    for ep in range(epochs):
        order = np.random.permutation(len(rows))
        tot = 0.0
        for i in range(0, len(rows), batch):
            idx = order[i : i + batch]
            logits = net([rows[j]["text"] for j in idx], dev)
            loss = sum(w[f] * F.cross_entropy(logits[f], y[f][idx].to(dev), label_smoothing=smoothing) for f in FIELDS)
            opt.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(net.parameters(), 1.0)
            opt.step()
            sched.step()
            tot += float(loss) * len(idx)
        print(f"    epoch {ep + 1}/{epochs} loss {tot / len(rows):.3f}", flush=True)
    net.eval()
    return net


@torch.no_grad()
def predict(net: Net, rows: list[dict], dev: torch.device) -> dict[str, np.ndarray]:
    out = {f: [] for f in FIELDS}
    for i in range(0, len(rows), 64):
        lg = net([r["text"] for r in rows[i : i + 64]], dev)
        for f in FIELDS:
            out[f].append(lg[f].float().cpu().numpy())
    return {f: np.concatenate(v) for f, v in out.items()}


def nll(logits: np.ndarray, y: np.ndarray, T: float) -> float:
    p = softmax(logits / T, axis=1)
    return float(-np.mean(np.log(np.clip(p[np.arange(len(y)), y], 1e-12, 1))))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--extra", action="append", default=[])
    ap.add_argument("--out", required=True)
    ap.add_argument("--epochs", type=int, default=4)
    ap.add_argument("--lr", type=float, default=3e-5)
    ap.add_argument("--folds", type=int, default=5)
    ap.add_argument("--seed", type=int, default=20261119)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--smoothing", type=float, default=0.05, help="label smoothing")
    ap.add_argument("--train-emb", action="store_true", help="also train the word-embedding table (slow on CPU)")
    ap.add_argument("--w-action", type=float, default=1.0, help="loss weight of the action head")
    ap.add_argument("--tag", default="")
    ap.add_argument("--final-only", metavar="CV_DIR", help="skip the out-of-fold run: reuse oof.json and cv-*.json from a --cv-only run with the same settings, train only the shipped model")
    ap.add_argument("--cv-only", action="store_true", help="only the out-of-fold run (to compare settings); no final model")
    args = ap.parse_args()
    dev = device()
    rows = [r for r in (json.loads(l) for l in Path(args.data).read_text("utf8").splitlines() if l.strip()) if r.get("split") == "train"]
    for extra in args.extra:
        rows += [r for r in (json.loads(l) for l in Path(extra).read_text("utf8").splitlines() if l.strip()) if r.get("split") == "train"]
    ids = [r["id"] for r in rows]
    assert len(set(ids)) == len(ids), "duplicate ids in the train rows"
    print(f"train rows {len(rows)} on {dev}  epochs {args.epochs} lr {args.lr} batch {args.batch} smoothing {args.smoothing} "
          f"train-emb {args.train_emb} w-action {args.w_action}", flush=True)
    opts = dict(batch=args.batch, smoothing=args.smoothing, freeze_emb=not args.train_emb,
                weights={"kind": 1.0, "action": args.w_action, "urgency": 1.0})
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    if args.final_only:  # same settings, out-of-fold part already done
        import shutil
        cvdir = Path(args.final_only)
        rep = [json.loads(p.read_text("utf8")) for p in cvdir.glob("cv-*.json")]
        assert len(rep) == 1, "expected one cv-*.json in " + str(cvdir)
        report = rep[0]
        for k in ("epochs", "lr", "batch", "smoothing", "w_action", "n_train"):
            want = {"epochs": args.epochs, "lr": args.lr, "batch": args.batch, "smoothing": args.smoothing, "w_action": args.w_action, "n_train": len(rows)}[k]
            assert report[k] == want, f"{k}: cv run {report[k]} != {want}"
        temps = {f: report["cv"][f]["temperature"] for f in FIELDS}
        shutil.copy(cvdir / "oof.json", out / "oof.json")
        t0 = time.time() - report["seconds_cv"]
        return final(args, rows, opts, temps, report, out, dev, t0)

    # 1. out-of-fold predictions (thresholds, temperature, the honest train-side estimate)
    strat = np.array([LABELS["kind"].index(r["expected"]["kind"]) * 3 + LABELS["urgency"].index(r["expected"]["urgency"]) for r in rows])
    skf = StratifiedKFold(n_splits=args.folds, shuffle=True, random_state=0)
    oof = {f: np.zeros((len(rows), len(LABELS[f])), dtype=np.float64) for f in FIELDS}
    t0 = time.time()
    for k, (a, b) in enumerate(skf.split(np.zeros(len(rows)), strat)):
        print(f"  fold {k + 1}/{args.folds}: train {len(a)} predict {len(b)}", flush=True)
        net = train_one([rows[i] for i in a], args.epochs, args.lr, args.seed + k, dev, **opts)
        pr = predict(net, [rows[i] for i in b], dev)
        for f in FIELDS:
            oof[f][b] = pr[f]
        del net
    gold = {f: np.array([LABELS[f].index(r["expected"][f]) for r in rows]) for f in FIELDS}
    report = {"n_train": len(rows), "epochs": args.epochs, "lr": args.lr, "batch": args.batch, "smoothing": args.smoothing,
              "train_emb": args.train_emb, "w_action": args.w_action, "folds": args.folds, "seconds_cv": round(time.time() - t0), "cv": {}}
    temps = {}
    for f in FIELDS:
        T = float(minimize_scalar(lambda t: nll(oof[f], gold[f], t), bounds=(0.2, 10), method="bounded").x)
        temps[f] = T
        report["cv"][f] = {"cv_accuracy": round(float((oof[f].argmax(1) == gold[f]).mean()), 4), "temperature": round(T, 3)}
    allok = np.all([oof[f].argmax(1) == gold[f] for f in FIELDS], axis=0)
    report["cv_all_three"] = round(float(allok.mean()), 4)
    print(json.dumps(report, indent=1), flush=True)
    tag = args.tag or f"e{args.epochs}-lr{args.lr:g}"
    (out / f"cv-{tag}.json").write_text(json.dumps(report, indent=1), "utf8")

    fields_out = {}
    for f in FIELDS:
        p = softmax(oof[f] / temps[f], axis=1)
        fields_out[f] = {"pred": [LABELS[f][i] for i in p.argmax(1)], "conf": np.round(p.max(1), 4).tolist(), "probs": np.round(p, 4).tolist(), "gold": [LABELS[f][i] for i in gold[f]]}
    (out / "oof.json").write_text(json.dumps({"rows": [{k: r.get(k) for k in ("id", "text", "source", "receivedAt", "sender")} for r in rows], "fields": fields_out}, ensure_ascii=False), "utf8")
    if args.cv_only:  # oof.json is still written so run-encoder.mjs --select-threshold can score the setting combined
        return

    return final(args, rows, opts, temps, report, out, dev, t0)


def final(args, rows, opts, temps, report, out, dev, t0) -> None:
    # 2. the shipped model: all train rows, same settings
    print("  final model on all train rows", flush=True)
    net = train_one(rows, args.epochs, args.lr, args.seed, dev, **opts)
    net.st.to("cpu").save(str(out / "st"))
    heads = {}
    for f, h in net.heads.items():
        W = (SCALE * h.weight.detach().cpu().numpy()).astype(np.float64)
        b = h.bias.detach().cpu().numpy().astype(np.float64)
        heads[f] = {"labels": LABELS[f], "W": np.round(W, 5).tolist(), "b": np.round(b, 5).tolist(), "temperature": round(temps[f], 4), "C": 0}
    dim = len(heads["kind"]["W"][0])
    (out / "heads.json").write_text(json.dumps({"version": 1, "dim": dim, "normalise": True, "heads": heads}, separators=(",", ":")), "utf8")
    report["seconds_total"] = round(time.time() - t0)
    (out / "finetune-report.json").write_text(json.dumps(report, indent=1), "utf8")
    print("done", flush=True)


if __name__ == "__main__":
    main()
