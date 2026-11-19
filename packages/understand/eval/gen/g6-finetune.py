"""g6: a primary ask next to an optional 'call for info' line (action = the ask), plus contrast rows where calling is
the ask. Written from the labelling rules in eval/README.md. Synthetic; fictional names and numbers."""
import datetime as dt, json, random
random.seed(6)
MONTHS_FR = "janvier février mars avril mai juin juillet août septembre octobre novembre décembre".split()
MONTHS_EN = "January February March April May June July August September October November December".split()
def fmt(d, lang):
    s = random.choice(["num", "word"])
    if s == "num": return f"{d.day:02d}/{d.month:02d}/{d.year}"
    return f"{d.day} {MONTHS_FR[d.month-1]} {d.year}" if lang == "fr" else f"{d.day} {MONTHS_EN[d.month-1]} {d.year}"
def num(): return random.choice(["677 00", "699 00", "233 00"]) + f" {random.randint(10,99)} {random.randint(10,99)}"
def amt(): return f"{random.choice([3,5,7,12,15,18,22,25,30,45,60,75])} {random.choice(['000','500'])}"
TRAIL = {
 "fr": ["Pour tout renseignement, appelez le {n}.", "Infos au {n}.", "Pour plus d'informations, contactez le {n}.", "En cas de question, appelez le {n} aux heures de bureau.", "Service client: {n}."],
 "en": ["Call {n} for info.", "For more information call {n}.", "Questions? Call {n}.", "Enquiries: {n} (office hours).", "If you need help, call our hotline {n}."],
 "wes": ["If you get question, call {n}.", "For more info call {n}.", "Call {n} if you no understand.", "Any wahala, call {n}."],
}
# (kind, sender, action, {lang: [text with {a} amount, {d} date]})
BASE = [
 ("school", "name:Collège Exemple", "pay", {
   "fr": ["Collège Exemple: les frais de scolarité du 2e trimestre ({a} F) sont à régler avant le {d}.", "APEE Lycée Démo: la cotisation de {a} FCFA doit être versée au plus tard le {d}."],
   "en": ["Demo College: second term fees of {a} FCFA must be paid before {d}.", "PTA Sample School: please pay the PTA levy of {a} F by {d}."],
   "wes": ["Demo School: your pikin fees na {a} F. Pay am before {d}.", "PTA levy na {a} F, make una pay am before {d} for school bursary."]}),
 ("electricity_bill", "name:ENEO", "pay", {
   "fr": ["ENEO: votre facture de {a} FCFA est due. Payez avant le {d} pour éviter la coupure."],
   "en": ["ENEO: your bill of {a} FCFA is due. Pay before {d} to avoid disconnection."],
   "wes": ["ENEO: yu light bill na {a} F. Pay am before {d} make dem no cut yu light."]}),
 ("water_bill", "name:CAMWATER", "pay", {
   "fr": ["CAMWATER: facture impayée de {a} FCFA. Réglez avant le {d}."],
   "en": ["CAMWATER: unpaid water bill {a} FCFA. Settle it before {d}."],
   "wes": ["CAMWATER: yu water bill na {a} F, e never pay. Pay before {d}."]}),
 ("administrative", "name:Mairie Démo", "bring_document", {
   "fr": ["Mairie Démo: votre dossier d'acte de naissance est incomplet. Déposez une copie de la CNI du père avant le {d}."],
   "en": ["Demo Council: your marriage file is incomplete. Bring two passport photos and a CNI copy before {d}."],
   "wes": ["Council Demo: yu file no complete. Bring yu CNI copy and two photo before {d}."]}),
 ("bank", "name:Afriland First Bank", "bring_document", {
   "fr": ["Afriland: pour mettre à jour votre compte, apportez votre CNI valide et un plan de localisation à l'agence avant le {d}."],
   "en": ["UBA: to update your account, bring a valid ID card and a utility bill to your branch before {d}."],
   "wes": ["Bank: bring yu new ID card for agency before {d} make dem update yu account."]}),
 ("health", "name:Hôpital Démo", "go_to_place", {
   "fr": ["Hôpital Démo: vous avez rendez-vous en consultation de cardiologie le {d} à 8h. Présentez-vous à l'accueil."],
   "en": ["Demo Hospital: your follow-up appointment is on {d} at 9am. Please come to the outpatient desk."],
   "wes": ["Demo Clinic: yu appointment na {d} for 8 o'clock. Come for di clinic early."]}),
 ("school", "name:Lycée Démo", "go_to_place", {
   "fr": ["Lycée Démo: réunion des parents le {d} à 15h dans la salle polyvalente. Présence obligatoire."],
   "en": ["Sample High School: parents' meeting on {d} at 2pm in the main hall. Attendance is compulsory."],
   "wes": ["Demo School: parents meeting na {d} for 3pm. All parents must come."]}),
 ("administrative", "name:DGSN", "collect", {
   "fr": ["DGSN: votre CNI est disponible. Retirez-la au centre d'identification avant le {d}."],
   "en": ["DGSN: your passport is ready. Collect it at the emigration office before {d}."],
   "wes": ["DGSN: yu ID card don ready. Come take am for di centre before {d}."]}),
 ("health", "name:Laboratoire Exemple", "collect", {
   "fr": ["Laboratoire Exemple: vos résultats d'analyse sont prêts. Passez les récupérer avant le {d}."],
   "en": ["Sample Lab: your test results are ready. Pick them up at the lab before {d}."],
   "wes": ["Lab Demo: yu result don ready. Come collect am before {d}."]}),
 ("telecom", "name:Orange", "bring_document", {
   "fr": ["Orange: votre ligne n'est pas identifiée. Présentez votre CNI en agence avant le {d} pour éviter la suspension."],
   "en": ["MTN: your SIM is not registered. Bring your ID card to an MTN shop before {d} to avoid suspension."],
   "wes": ["MTN: yu SIM never register. Bring yu ID card for MTN shop before {d} or dem go block am."]}),
 ("health", "name:Centre de Santé Démo", "take_medicine", {
   "fr": ["Centre de Santé Démo: rappel, prenez votre comprimé contre la tension chaque matin, sans interruption."],
   "en": ["Demo Health Centre: reminder, take your diabetes tablets every morning and evening after food."],
   "wes": ["Health Centre: no forget, take yu pressure medicine every morning, no stop am."]}),
 ("school", "name:Université Exemple", "reply", {
   "fr": ["Université Exemple: confirmez votre inscription en répondant OUI à ce message avant le {d}."],
   "en": ["Sample University: confirm your place by replying YES to this SMS before {d}."],
   "wes": ["Demo University: reply YES for dis message before {d} make dem keep yu place."]}),
]
# receipts with a trailer: nothing/info
RECEIPTS = [
 ("electricity_bill", "name:ENEO", {"fr": "ENEO: paiement de {a} FCFA reçu. Merci.", "en": "ENEO: payment of {a} FCFA received. Thank you.", "wes": "ENEO: we don receive yu {a} F. Tank you."}),
 ("school", "name:Collège Exemple", {"fr": "Collège Exemple: nous accusons réception de {a} F pour les frais de scolarité. Merci.", "en": "Demo College: we have received {a} FCFA for school fees. Thank you.", "wes": "Demo School: we don receive {a} F for yu pikin fees. Tank you."}),
 ("water_bill", "name:CAMWATER", {"fr": "CAMWATER: votre règlement de {a} FCFA a bien été enregistré.", "en": "CAMWATER: your payment of {a} FCFA has been recorded.", "wes": "CAMWATER: yu payment of {a} F don enter."}),
]
# contrast: calling IS the ask
CALLS = [
 ("health", "name:Hôpital Démo", {"fr": "Hôpital Démo: votre rendez-vous du {d} doit être confirmé. Appelez le {n} pour le confirmer.", "en": "Demo Hospital: please call {n} to confirm your appointment of {d}.", "wes": "Demo Hospital: call {n} make you confirm yu appointment for {d}."}),
 ("bank", "name:SGC", {"fr": "SGC: une anomalie a été détectée sur votre dossier de prêt. Appelez votre conseiller au {n} avant le {d}.", "en": "SGC: there is an issue with your loan file. Call your adviser on {n} before {d}.", "wes": "Bank: problem dey for yu loan file. Call yu adviser for {n} before {d}."}),
 ("school", "name:Lycée Démo", {"fr": "Lycée Démo: le surveillant général souhaite vous parler de votre enfant. Appelez le {n} avant le {d}.", "en": "Sample High School: the discipline master needs to speak with you about your child. Please call {n} before {d}.", "wes": "Demo School: di discipline master wan talk with you about yu pikin. Call {n} before {d}."}),
]
rows = []
def recv():
    return dt.date(2026, random.randint(1, 12), random.randint(1, 28))
def deadline(r):
    days = random.choice([1, 2, 3, 5, 6, 7, 8, 9, 12, 15, 20, 30])
    return r + dt.timedelta(days=days), days
def sender(s):
    k, v = s.split(":", 1); return {"kind": k, "value": v}
def add(lang, text, r, kind, s, action, urg, source, body=None):
    # the sender is the organisation the text names first ("ENEO: ..."), else the group's default
    head = [p.split(":")[0] for p in [body or text] if ":" in p.split(".")[0]]
    snd = {"kind": "name", "value": head[0].strip()} if head and len(head[0]) < 40 and not head[0].strip()[0].isdigit() else sender(s)
    rows.append({"id": "", "lang": lang, "source": source, "text": text, "receivedAt": r.isoformat(), "sender": snd,
                 "expected": {"kind": kind, "action": action, "urgency": urg}, "scam": "no_signs", "split": "train",
                 "synthetic": True, "author": "finetune-g6"})
for kind, s, action, by in BASE:
    for lang, texts in by.items():
        for t in texts:
            for _ in range(3):
                r = recv(); d, days = deadline(r)
                urg = "info" if action == "take_medicine" else ("urgent" if days <= 7 else "soon")  # ongoing treatment: info
                body = t.format(a=amt(), d=fmt(d, lang))
                trail = random.choice(TRAIL[lang]).format(n=num())
                text = f"{body} {trail}" if random.random() < 0.8 else f"{trail} {body}"
                add(lang, text, r, kind, s, action, urg, random.choice(["sms", "sms", "whatsapp"]), body)
for kind, s, by in RECEIPTS:
    for lang, t in by.items():
        for _ in range(3):
            r = recv()
            add(lang, f"{t.format(a=amt())} {random.choice(TRAIL[lang]).format(n=num())}", r, kind, s, "nothing", "info", "sms")
for kind, s, by in CALLS:
    for lang, t in by.items():
        for _ in range(2):
            r = recv(); d, days = deadline(r)
            add(lang, t.format(n=num(), d=fmt(d, lang)), r, kind, s, "call", "urgent" if days <= 7 else "soon", "sms")
random.shuffle(rows)
for i, x in enumerate(rows): x["id"] = f"ft-{i+1:03d}"
with open(__import__("pathlib").Path(__file__).resolve().parent.parent / "train-gen" / "g6.jsonl", "w") as f:
    for x in rows: f.write(json.dumps(x, ensure_ascii=False) + "\n")
print(len(rows))
