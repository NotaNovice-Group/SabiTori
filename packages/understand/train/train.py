"""Train three logistic-regression heads (kind, action, urgency) on the int8 ONNX encoder's embeddings.

  python train.py --model ../model/minilm --data ../eval/messages.jsonl

Only the `train` split is used (5-fold CV picks C and the temperature). The `test` split is
scored once at the end for the model card and is never used for any choice.
Writes <model>/heads.json and <model>/oof.json (out-of-fold calibrated probabilities on train,
used by `eval/run-encoder.mjs --select-threshold` to pick the confidence threshold).
"""
from __future__ import annotations

import argparse, json
from pathlib import Path

import numpy as np
import onnxruntime as ort
from scipy.optimize import minimize_scalar
from scipy.special import log_softmax, softmax
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold
from tokenizers import Tokenizer

LABELS = {
    "kind": ["electricity_bill", "water_bill", "mobile_money", "telecom", "bank", "health", "school", "administrative", "legal", "other"],
    "action": ["pay", "bring_document", "go_to_place", "call", "reply", "collect", "take_medicine", "nothing", "unclear"],
    "urgency": ["info", "soon", "urgent"],
}


class Encoder:
    def __init__(self, model_dir: Path) -> None:
        self.tok = Tokenizer.from_file(str(model_dir / "tokenizer.json"))
        self.tok.enable_truncation(128)
        self.sess = ort.InferenceSession(str(model_dir / "encoder.int8.onnx"), providers=["CPUExecutionProvider"])

    def embed(self, texts: list[str]) -> np.ndarray:
        out = []
        for t in texts:
            e = self.tok.encode(t)
            v = self.sess.run(None, {"input_ids": np.array([e.ids], dtype=np.int64), "attention_mask": np.array([e.attention_mask], dtype=np.int64)})[0][0]
            out.append(v / max(np.linalg.norm(v), 1e-9))
        return np.array(out, dtype=np.float64)


def fit(X: np.ndarray, y: np.ndarray, n_cls: int, C: float) -> tuple[np.ndarray, np.ndarray]:
    """Weights for all n_cls classes; classes absent from y get a strongly negative bias."""
    clf = LogisticRegression(C=C, max_iter=2000)
    clf.fit(X, y)
    W = np.zeros((n_cls, X.shape[1]))
    b = np.full(n_cls, -20.0)
    W[clf.classes_] = clf.coef_ if len(clf.classes_) > 2 else np.vstack([-clf.coef_[0] / 2, clf.coef_[0] / 2])
    b[clf.classes_] = clf.intercept_ if len(clf.classes_) > 2 else np.array([-clf.intercept_[0] / 2, clf.intercept_[0] / 2])
    return W, b


def nll(logits: np.ndarray, y: np.ndarray, T: float) -> float:
    return float(-log_softmax(logits / T, axis=1)[np.arange(len(y)), y].mean())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--data", required=True)
    args = ap.parse_args()
    mdir = Path(args.model)
    rows = [json.loads(l) for l in Path(args.data).read_text("utf8").splitlines() if l.strip()]
    train = [r for r in rows if r.get("split") == "train"]
    test = [r for r in rows if r.get("split") == "test"]
    print(f"train {len(train)}  test {len(test)}")
    enc = Encoder(mdir)
    Xtr = enc.embed([r["text"] for r in train])
    Xte = enc.embed([r["text"] for r in test]) if test else None

    heads, oof_out, report = {}, {}, {}
    for field, labels in LABELS.items():
        idx = {l: i for i, l in enumerate(labels)}
        y = np.array([idx[r["expected"][field]] for r in train])
        counts = np.bincount(y, minlength=len(labels))
        k = int(min(5, max(2, counts[counts > 0].min())))
        skf = StratifiedKFold(n_splits=k, shuffle=True, random_state=0)
        best = None
        for C in [1, 3, 10, 30, 100, 300, 1000]:
            oof = np.full((len(y), len(labels)), -20.0)
            for a, b_ in skf.split(Xtr, y):
                W, b = fit(Xtr[a], y[a], len(labels), C)
                oof[b_] = Xtr[b_] @ W.T + b
            acc = float((oof.argmax(1) == y).mean())
            loss = nll(oof, y, 1.0)
            print(f"  {field:8s} C={C:<4} cv-acc={acc:.3f} cv-nll={loss:.3f}")
            if best is None or loss < best[0]:
                best = (loss, C, oof, acc)
        _, C, oof, acc = best
        T = float(minimize_scalar(lambda t: nll(oof, y, t), bounds=(0.2, 10), method="bounded").x)
        W, b = fit(Xtr, y, len(labels), C)
        heads[field] = {"labels": labels, "W": np.round(W, 5).tolist(), "b": np.round(b, 5).tolist(), "temperature": round(T, 4), "C": C}
        p = softmax(oof / T, axis=1)
        oof_out[field] = {"pred": [labels[i] for i in p.argmax(1)], "conf": np.round(p.max(1), 4).tolist(), "probs": np.round(p, 4).tolist(), "gold": [labels[i] for i in y]}
        report[field] = {"cv_accuracy": round(acc, 4), "C": C, "temperature": round(T, 3)}
        print(f"  -> {field}: C={C} T={T:.2f} cv-acc={acc:.3f}")
    (mdir / "heads.json").write_text(json.dumps({"version": 1, "dim": int(Xtr.shape[1]), "normalise": True, "heads": heads}, separators=(",", ":")), "utf8")
    (mdir / "oof.json").write_text(json.dumps({"rows": [{k: r.get(k) for k in ("id", "text", "source", "receivedAt", "sender")} for r in train], "fields": oof_out}, ensure_ascii=False), "utf8")
    (mdir / "train-report.json").write_text(json.dumps({"n_train": len(train), "cv": report}, indent=1), "utf8")

    if Xte is not None and len(test):  # one look, for the model card; no choice depends on it
        for field, labels in LABELS.items():
            h = heads[field]
            logits = Xte @ np.array(h["W"]).T + np.array(h["b"])
            pred = [labels[i] for i in logits.argmax(1)]
            print(f"  test {field}: {np.mean([p == r['expected'][field] for p, r in zip(pred, test)]):.3f}")


if __name__ == "__main__":
    main()
