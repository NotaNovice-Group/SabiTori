"""Reference values from the Python side, so the TypeScript tests prove parity.

  python make_fixtures.py --model ../model/minilm --out ../test/fixtures/encoder-parity.json
Token ids come from the Python `tokenizers` library with the exported tokenizer.json; embeddings
from onnxruntime (Python) on the exported int8 model.
"""
import argparse, json
from pathlib import Path
import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

STRINGS = [
    "Votre facture ENEO de 24 500 FCFA est disponible.",
    "Your CAMWATER bill is 4,800 XAF. Pay before 25/03/2025.",
    "Vous avez reçu 15 000 FCFA de NGONO Paul. Solde: 32 400 FCFA. Réf. 8839201",
    "Composez *126# ou #150*1# pour confirmer.",
    "Rendez-vous à l’hôpital demain à 8h30, apportez le carnet de santé.",
    "L'huissier vous somme de payer « 150 000 FCFA » sous huit jours…",
    "ÉCOLE PRIMAIRE DE BONAMOUSSADI: réunion des parents vendredi",
    "https://momo.mtn.cm/verify?id=42&x=1",
    "Appelez le +237 677 12 34 56 / 699-00-11-22 maintenant!!!",
    "😀 Félicitations!! Vous avez gagné 5.000.000 F. Envoyez 10 000 F.",
    "  espaces   multiples \t et\nretours à la ligne  ",
    "ﬁnancement № 12 ½ tasse ① ㎏",
    "Dear customer, your account no. 0012345678 has been credited.",
    "Mbarga, ngwa ke? Tu viens ce soir ou quoi?",
    "Ñandú ünï çödé ßtraße",
    "a",
    "",
    "00237677123456",
    "MTN MoMo: Retrait de 10,000 XAF effectué le 12-05-2025 à 14:32. Frais: 150 XAF. Solde: 55,300 XAF. ID: 7762210984",
    ("Lorem ipsum facture électricité payer avant le délai sinon coupure. " * 30),
]

ap = argparse.ArgumentParser()
ap.add_argument("--model", required=True)
ap.add_argument("--out", required=True)
a = ap.parse_args()
m = Path(a.model)
tok = Tokenizer.from_file(str(m / "tokenizer.json"))
tok.enable_truncation(128)
sess = ort.InferenceSession(str(m / "encoder.int8.onnx"), providers=["CPUExecutionProvider"])
cases = []
for i, s in enumerate(STRINGS):
    e = tok.encode(s)
    c = {"text": s, "ids": e.ids}
    if i in (0, 3, 10, 18, 19):
        v = sess.run(None, {"input_ids": np.array([e.ids], dtype=np.int64), "attention_mask": np.array([e.attention_mask], dtype=np.int64)})[0][0]
        c["embedding"] = [round(float(x), 5) for x in v]
    cases.append(c)
Path(a.out).parent.mkdir(parents=True, exist_ok=True)
Path(a.out).write_text(json.dumps({"cases": cases}, ensure_ascii=False, indent=0), "utf8")
print("wrote", a.out, len(cases))
