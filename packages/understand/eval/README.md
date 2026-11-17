# SabiTori evaluation dataset

`messages.jsonl` is a labelled set of 320 **synthetic** messages (split into `train` and `test`), and `unseen.jsonl` a second, independent set of 100 synthetic messages written to avoid the generator's templates (split `unseen`, evaluation only; see below). Both are in the style of what people in Cameroon receive: SMS, photographed letters and WhatsApp messages in French, English and Cameroonian Pidgin English. They exist to measure the understanding step (message kind, required action, urgency) and the scam check, and to compare the rule-based classifier with on-device models.

- **Synthetic.** Every message was written for this dataset. None is a copy of a real message. Names are obviously fictional (`Exemple`, `Fictif`, `Modèle`, `Sample`, `Demo`, `Test`) and every phone number is in a fictional range (`677 00 xx xx`, `699 00 xx xx`, `233 00 xx xx`). Organisation names such as ENEO, CAMWATER, MTN MoMo, Orange Money, Afriland, SGC, UBA, BICEC, DGSN appear only to mimic the style of real senders. No message here comes from them, and a scam message that imitates one of them is imitating it on purpose, as a test case. Schools, hospitals, clinics, laboratories and councils use invented names in `messages.jsonl`; `unseen.jsonl` also names a few real public institutions (for example a regional hospital, a university, CNPS, DGI, a council) to mimic real senders, and no message in it comes from them either.
- **Licence: CC-BY-SA-4.0** (both datasets, this README and the generator under `gen/`). The rest of the repository keeps its own licence.
- **Pidgin lines need native review.** The 48 messages with `"lang": "wes"` were written without a native speaker. The orthography, grammar and register of Cameroonian Pidgin English are plausible but unchecked, and real SMS spelling varies a lot by region and by person. Treat the `wes` rows as a smoke test only, never as evidence of how well a model reads Pidgin. Before any reported result uses them, have native speakers of Cameroonian Pidgin English (Kamtok) rewrite or confirm each line and its labels. The French and English wording should also get a native read.

## Record format

One JSON object per line:

```json
{"id":"sbt-001","lang":"fr","source":"sms","text":"...","receivedAt":"2026-10-31",
 "sender":{"kind":"name","value":"ENEO"},
 "expected":{"kind":"electricity_bill","action":"pay","urgency":"soon"},
 "scam":"no_signs","split":"train","synthetic":true}
```

| Field | Values |
|---|---|
| `lang` | `fr`, `en`, `wes` (Cameroonian Pidgin) |
| `source` | `sms`, `letter` (photo or scan, so OCR-like), `whatsapp` |
| `receivedAt` | always `2026-10-31`; relative and absolute dates are anchored to it |
| `sender.kind` | `name` (with `value`), `number` (with `value`, E.164), `unknown` |
| `expected.kind` | one of `MESSAGE_KINDS` in `packages/core/src/types.ts` |
| `expected.action` | one of `ACTION_KINDS` |
| `expected.urgency` | `info`, `soon`, `urgent` |
| `scam` | `likely_scam`, `caution`, `no_signs` (never "safe") |
| `split` | `train` or `test` (`unseen` in `unseen.jsonl`) |
| `synthetic` | `true` for every row of `messages.jsonl` and `unseen.jsonl` |
| `author` | `unseen.jsonl` only: `reviewer` (who wrote the row) |

`expected` has the same shape as `EvalCase.expected` in `src/evaluate.ts`, so rows convert directly to eval cases (see `run-rules.mjs`).

## Labelling rules

**Kind** is what the message is about (the company or institution it is from or concerns), following the catalog in `packages/core/src/catalog.ts`. A scam keeps the kind of what it pretends to be (a fake MoMo message is `mobile_money`, a fake DGSN message is `administrative`). `other` is for messages that fit none of the nine topics (parcel links, family and friends, job-offer scams, promotions from businesses outside the nine topics). A promotion or prize draw from (or pretending to be from) a phone operator is `telecom`.

**Action** is the one thing the message asks of the reader. A scam is labelled with what it asks, not with what the reader should do: a wrong-transfer message asks to send money back (`pay`), a PIN request asks to reply (`reply`), a fake prize asks to call or pay. `unclear` is for messages with a link and no stated action, or with no readable ask. `nothing` is for receipts and notices that need no response. Dialling a menu code for information (`*155#`) is `nothing`, not an obligation. A genuine promotion or offer ("double your recharge today only", "reply YES to activate your bonus") is `nothing` with urgency `info`: it asks for nothing the reader owes, and "today only" is marketing, not a deadline. A fake prize that asks for a fee is still labelled with what it asks (`pay`).

**Urgency**:
- `urgent`: the deadline is within 7 days of `receivedAt` (day 7 counts), or it has already passed, or the message says "today", "tonight" or "within N minutes/hours", or it is a legal or health emergency (arrest threat, emergency admission).
- `soon`: a dated action further than 7 days away (day 8 and beyond).
- `info`: no deadline, or a dated notice that needs no action (for example a planned power cut, a holiday).

**Scam level** follows the signals in `types.ts` (`SCAM_SIGNALS`) and the rule in `packages/core/src/scam.ts`: `likely_scam` when any strong signal is present (`asks_pin`, `sender_mismatch`, `wrong_transfer`, `prize_fee`, `fake_balance`, `pay_to_personal_number`), when two or more signals are present, or when a `*...#` code carries a number or amount; `caution` for exactly one weaker signal (`link`, `time_pressure`, `account_block_threat`, `asks_to_call_number`, `ussd_instruction`); `no_signs` otherwise. `sender_mismatch` is labelled whenever a message claims to be an organisation but arrives from an ordinary mobile number, including organisations (banks, courts) that are not yet in `regions/CM/region.json`. A genuine message with a link, or one that tells the reader to dial a menu code, is `caution`, because SabiTori cannot verify it. Genuine look-alikes are labelled `no_signs`: real receipts and bank notices that say "ne communiquez jamais votre code" or "never share your PIN", real school results that say "Félicitations", a real utility giving its landline.

## What is in it

By construction, 320 messages:

| Dimension | Counts |
|---|---|
| Language | fr 144 (45%), en 128 (40%), wes 48 (15%) |
| Source | sms 238, whatsapp 54, letter 28 |
| Kind | mobile_money 54, bank 40, telecom 41, administrative 30, electricity_bill 30, health 30, school 30, water_bill 28, legal 22, other 15 |
| Action | pay 82, nothing 61, go_to_place 38, call 33, collect 27, reply 27, bring_document 26, unclear 16, take_medicine 10 |
| Urgency | info 176, urgent 90, soon 54 |
| Scam level | no_signs 231, likely_scam 69, caution 20 (89 messages, 28%, flagged) |
| Split | train 224, test 96 |

Test split by kind: mobile_money 16, bank 12, telecom 12, administrative 9, electricity_bill 9, health 9, school 9, water_bill 8, legal 7, other 5. By language: fr 38, en 43, wes 15. By scam level: no_signs 74, likely_scam 18, caution 4.

Every kind and every action appears at least 10 times (`take_medicine` is the smallest, with exactly 10: 4 fr, 3 en, 3 wes). About 10% of the messages (32) are OCR-noisy: every `letter` plus four SMS screenshots, with `O`/`0` and `l`/`1` swaps, dropped accents, stray spaces and lines broken mid-sentence.

Scam signals covered (messages declaring each signal; a message can carry several, and the file stores only the level, not the signals): `sender_mismatch` 57, `pay_to_personal_number` 27, `time_pressure` 23, `link` 20, `account_block_threat` 16, `asks_to_call_number` 11, `asks_pin` 10, `wrong_transfer` 9, `prize_fee` 9, `ussd_instruction` 6, `fake_balance` 5. The signal list lives in the templates and is printed by `build-dataset.mjs`.

## Split

Stratified by `expected.kind`: within each kind the messages are shuffled with a fixed seed (`20261031`) and the first 30% (rounded) become `test`, the rest `train`. The split is deterministic for a given set of templates; adding or editing templates reshuffles ids and splits, so regenerate once, then treat the file as frozen for any published result. Real rows (below) keep their own split.

## Known limits

- Each template (one wording) produces exactly one message, so no test message repeats a train wording; but templates share structure and senders, so train and test are not independent in style. Measured: the nearest train message of each test message has a character 4-gram Jaccard similarity of median about 0.2 and never above 0.5 (digits masked), while its embedding cosine has median about 0.72. A model can therefore look better on the test split than on real mail; the unseen set exists to show that gap. Judge a model on real consented messages when you have them.
- The author of the templates also knows the rules lexicons, so the rules baseline is probably optimistic, especially on scam level.
- Most messages are short and clean. Real SMS has typos, mixed languages, missing accents and unusual date formats beyond what the generator produces.
- `wes` is unreviewed (see above) and the `fr`/`en` lexicons have no Pidgin entries, so the rules baseline is expected to do poorly on `wes`.

## Unseen set (`unseen.jsonl`)

100 messages (fr 40, en 38, wes 22; sms 67, whatsapp 24, letter 9) written to avoid the generator's templates: new wording, senders and domains (tontines and njangi, rent, CNPS pensions, campaigns of the health ministry, councils, courts, universities, transport, parcels, family requests for money), more Pidgin, OCR-noisy letters. 30 were written during a review of this repository (R5, 2026-11-02), separately from the generator; 70 more were added in the same spirit. Every row has `"split": "unseen"`, `"synthetic": true` and `"author": "reviewer"`, and is labelled by the rules above (five dates of the reviewer's rows were corrected to match the weekday, and one urgency to the 7-day rule). It is used only for evaluation: never for training, vocabulary choice or thresholds. The only decision it informed is documented in `model/minilm/model-card.md` (vocabulary fill strategy). Same caveats as the main set: synthetic, small, written by people who know the rules, and Pidgin unreviewed.

## Results

<!-- results:eval-summary -->
Rules baseline on the test split (96 messages): kind 86.5% [79.2–92.7], action 76.0% [67.7–84.4], urgency 88.5% [81.3–94.8], all three right 60.4% [51.0–69.8], scam level 100.0% [100.0–100.0].
On the unseen set (100 messages): all three right 34.0% [25.0–43.0], scam level 92.0% [86.0–97.0].
Encoder results and paired tests: `results-encoder.md`; machine-readable: `results.json` (both generated by `run-encoder.mjs`).
<!-- /results:eval-summary -->

`results-rules.md` has the full rules report (confusions, per-label recall). Run it from the repository root:

```sh
node node_modules/.pnpm/vite-node@3.2.4/node_modules/vite-node/vite-node.mjs packages/understand/eval/run-rules.mjs
```

`--split=train|all|unseen` evaluates another split (and does not overwrite `results-rules.md`); `--no-write` prints only. The encoder and the published tables: `node packages/understand/eval/run-encoder.mjs` (writes `results.json` and `results-encoder.md`), then `node packages/understand/eval/model-card.mjs` (regenerates the tables in the README, docs and model card from `results.json`). If the `vite-node@3.2.4` folder is missing after an install, use `ls node_modules/.pnpm | grep vite-node`.

## Regenerating the synthetic rows

`messages.jsonl` is generated: `node packages/understand/eval/build-dataset.mjs`. The templates are in `gen/fr.mjs`, `gen/en.mjs` and `gen/wes.mjs` (one wording per message, with labels and scam signals next to the text) and the helpers in `gen/lib.mjs`. The output is byte-identical on every run. Fix a label or wording in the template, then regenerate; do not hand-edit `messages.jsonl`. `test/dataset.test.ts` checks the result.

Label changes on 2026-11-02 (after review R5): genuine operator promotions are now `telecom`/`nothing`/`info` (sbt-089, sbt-135 "double your recharge today only", were `pay`/`urgent`; sbt-086, sbt-160, sbt-296 "reply YES to activate your bonus", were `reply`), and the Pidgin MTN prize-fee scam (sbt-315) is `telecom` like its French and English counterparts (was `mobile_money`). sbt-057 (a fake MTN prize asking for a fee) was checked against the rules and keeps `telecom`/`pay`/`info`. Text, ids and RNG draws are unchanged; the kind change moved one message (sbt-064) from test to train, so the test split is now 96 messages.

## Adding real, consented, anonymised messages

Real messages must never be mixed into the synthetic file.

1. Get explicit, informed consent from the person who received the message, in writing, saying the text will be published under CC-BY-SA-4.0. Do not accept messages from people who cannot consent freely, and never collect from someone else's phone.
2. Anonymise before the text leaves the phone (or the collector's computer). `anonymise.ts` does a first pass and
   writes draft rows: it moves phone numbers to the fictional ranges, gives reference, account, meter and ID numbers
   random digits of the same shape, keeps amounts, dates, times, menu codes and links, and lists words that may be
   names. It never decides that a message is anonymous:

   ```bash
   VN=$(ls -d node_modules/.pnpm/vite-node@*/node_modules/vite-node/vite-node.mjs | head -1)
   node $VN packages/understand/eval/anonymise.ts raw.txt draft.jsonl --lang fr --source sms --received 2026-11-20
   ```

   Then, by hand: replace personal names with obviously fictional ones, phone numbers with `677 00 xx xx` / `699 00 xx xx` numbers (keep the same format and separators), account, meter, ID and reference numbers with random digits of the same length, and addresses and workplaces with generic ones. Keep the senders that are companies (ENEO, MTN) only if the sender is the point of the message. Two people must check the result.
3. Put them in `messages.real.jsonl` (same format) with `"synthetic": false` and ids like `real-001`. `test/dataset.test.ts` validates that file when it exists. Put real rows in `test` only if no model was tuned on them, and keep the 70/30 balance per kind.
4. Have a native speaker label each message independently of the model output. For `wes` and any other language, the labeller must read the language natively.
5. Never commit a screenshot, a contact name or a raw export.
6. Measure: `node $VN packages/understand/eval/run-rules.mjs --split=real` (rules) and
   `node packages/understand/eval/run-encoder.mjs --data packages/understand/eval/messages.real.jsonl --json /tmp/real.json --out /tmp/real.md`
   (encoder + rules; rows with `"split": "test"`). Both print or write elsewhere; the published synthetic results
   are not touched. Report real-message results with their n and confidence interval, next to the synthetic ones.
