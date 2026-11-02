# Encoder classifier results (test split, n=97)

Classifier: `minilm-l12-int8@1`, confidence thresholds {"kind":0.85,"action":0.55,"urgency":0.65} (chosen on the train split, out-of-fold; the test split was not used for any choice).

| System | kind | action | urgency | all three |
| --- | --- | --- | --- | --- |
| rules@1 (baseline) | 86.6% | 63.9% | 75.3% | 44.3% |
| encoder alone (threshold 0) | 85.6% | 83.5% | 81.4% | 61.9% |
| **encoder + rules (default)** | 92.8% | 85.6% | 83.5% | 69.1% |

Fields where the combined answer differs from rules: kind 8, action 33, urgency 15 of 97.

Node latency (onnxruntime-web wasm, this machine): median 49 ms, p95 97 ms per message.

## By message language (rules -> encoder + rules)

| Lang | n | kind | action | urgency |
| --- | --- | --- | --- | --- |
| wes | 15 | 73.3% -> 93.3% | 33.3% -> 80.0% | 60.0% -> 66.7% |
| en | 44 | 93.2% -> 95.5% | 72.7% -> 88.6% | 77.3% -> 86.4% |
| fr | 38 | 84.2% -> 89.5% | 65.8% -> 84.2% | 78.9% -> 86.8% |

Pidgin (`wes`) rows were written without a native speaker: a smoke test only (see eval/README.md).

## Combined errors (first 25)

- "UBA: Your account maintenance fee of 2.500 FCFA was debited today." expected bank/nothing/info got bank/nothing/urgent (conf 0.63, rules bank/unclear/urgent)
- "HIGH COURT OF LIMBE SUMMONS You are summoned to appear before the court on December 13, 2026 at l1:00, court 5" expected legal/go_to_place/soon got legal/go_to_place/urgent (conf 0.75, rules legal/go_to_place/soon)
- "Di pikin go drink di syrup 5 ml three times for day. No stop am even if e don well." expected health/take_medicine/info got other/nothing/info (conf 0.2, rules other/take_medicine/info)
- "MTN: Your 13GB internet bundle expires on 05/11/2026. Recharge 5.000 FCFA to renew it." expected telecom/pay/urgent got telecom/pay/soon (conf 0.77, rules telecom/unclear/soon)
- "UBA: Compte inactif. Votre compte sera fermé le 30/11/2026 si aucune opération n'est effectuée. Passez en agen" expected bank/go_to_place/soon got bank/unclear/urgent (conf 0.64, rules bank/unclear/soon)
- "SGC: Retrait DAB de 65000 F effectué le 29 octobre 2026 à Bertoua. Solde: 100000 francs CFA." expected bank/nothing/info got bank/unclear/info (conf 0.64, rules mobile_money/unclear/info)
- "School go close November 7, 2026 for holiday. Una pikin go resume Monday." expected school/nothing/info got school/nothing/soon (conf 0.53, rules school/unclear/soon)
- "Bonsoir, je me suis trompé de numéro, je vous ai envoyé 24,500 FCFA par erreur. Merci de me renvoyer l'argent " expected mobile_money/pay/info got mobile_money/call/info (conf 0.59, rules mobile_money/unclear/info)
- "ELECAM: Mise à jour du fichier électoral. Présentez-vous au bureau de Yaoundé avant le 18/11/2026 avec votre C" expected administrative/go_to_place/soon got administrative/go_to_place/urgent (conf 0.71, rules administrative/go_to_place/soon)
- "Etude notariale Me Test: Signature de l'acte de vente le 19 novembre 2026 à 11h. Prière de vous présenter avec" expected legal/go_to_place/soon got administrative/go_to_place/soon (conf 0.63, rules administrative/go_to_place/soon)
- "Gendarmerie say yu get case. Send 55000 XAF to 677 00 23 44 for avoid prison." expected legal/pay/urgent got legal/pay/info (conf 0.64, rules legal/unclear/info)
- "UBA: Abeg send yu PIN and password make we open yu account again, e don block." expected bank/reply/info got bank/unclear/info (conf 0.21, rules mobile_money/unclear/info)
- "Deposit successful: 11.500 F CFA has been added to your Orange Money account by agent Mercy. Transaction 37898" expected mobile_money/nothing/info got mobile_money/pay/info (conf 0.74, rules mobile_money/nothing/info)
- "Maroua Council: Recruitment test results are published: concours-sample.cm/r/0276" expected administrative/unclear/info got health/nothing/info (conf 0.21, rules health/unclear/info)
- "MTN: Vous êtes l'heureux gagnant du tirage au sort, vous gagnez 48 Go gratuits. Pour recevoir, envoyez 1.500 f" expected telecom/pay/info got mobile_money/pay/info (conf 0.9, rules telecom/unclear/info)
- "Bonjour, votre casier judiciaire est prêt. Vous pouvez le retirer au greffe du tribunal de Bamenda, avec la qu" expected administrative/collect/info got legal/pay/info (conf 0.72, rules legal/collect/info)
- "ENEO: Votre demande de changement de compteur est acceptée. Présentez-vous à l'agence de Limbe le 7 novembre 2" expected electricity_bill/go_to_place/urgent got electricity_bill/go_to_place/soon (conf 0.7, rules electricity_bill/go_to_place/soon)
- "MTN: You are the lucky winner of our draw, you win 71GB free data. To receive it, send 3000 FCFA to 677 00 40 " expected telecom/pay/info got telecom/unclear/info (conf 0.72, rules telecom/unclear/info)
- "Di banker say make you kam Douala branch 7 November 2026 for 10:30 for sign di papers." expected bank/go_to_place/urgent got bank/go_to_place/soon (conf 0.53, rules bank/unclear/soon)
- "MTN MoMo: You have received 70000 XAF from Mercy Fictif. New balance: 75,00O XAF. This was sent in error, kind" expected mobile_money/pay/info got mobile_money/nothing/info (conf 0.89, rules mobile_money/nothing/soon)
- "BICEC - Agence de Buea Objet: mise à jour de votre dossier c1ient Nous vous prions d'apporter un justificatif " expected bank/bring_document/urgent got administrative/bring_document/urgent (conf 0.44, rules administrative/go_to_place/soon)
- "CAMWATER: Yu bill never pay. Send 22.000 FCFA to 699006227 bifor 5pm or dem go cut yu water." expected water_bill/pay/urgent got water_bill/pay/info (conf 0.88, rules water_bill/pay/info)
- "Barrister Demo Chambers: Please bring the documents of your case (land title, plan, receipts) to our office be" expected legal/bring_document/soon got other/bring_document/soon (conf 0.2, rules other/bring_document/soon)
- "Nexttel: Your line is not registered. Please bring a copy of your ID card to the Buea shop before November 4, " expected telecom/bring_document/urgent got telecom/go_to_place/soon (conf 0.59, rules telecom/bring_document/soon)
- "Demo Health Centre: To reschedule your appointment, call 233 00 72 97 from Monday to Friday." expected health/call/info got health/call/soon (conf 0.63, rules health/go_to_place/soon)
