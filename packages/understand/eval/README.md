# SabiTori evaluation dataset

`messages.jsonl` is a labelled set of 320 **synthetic** messages in the style of what people in Cameroon receive: SMS, photographed letters and WhatsApp messages in French, English and Cameroonian Pidgin English. It exists to measure the understanding step (message kind, required action, urgency) and the scam check, and to compare the rule-based classifier with on-device models.

- **Synthetic.** Every message was written for this dataset. None is a copy of a real message. Names are obviously fictional (`Exemple`, `Fictif`, `Modèle`, `Sample`, `Demo`, `Test`) and every phone number is in a fictional range (`677 00 xx xx`, `699 00 xx xx`, `233 00 xx xx`). Organisation names such as ENEO, CAMWATER, MTN MoMo, Orange Money, Afriland, SGC, UBA, BICEC, DGSN appear only to mimic the style of real senders. No message here comes from them, and a scam message that imitates one of them is imitating it on purpose, as a test case. Schools, hospitals, clinics, laboratories and councils use invented names.
- **Licence: CC-BY-SA-4.0** (dataset, README and the generator under `gen/`). The rest of the repository keeps its own licence.
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
| `split` | `train` or `test` |
| `synthetic` | `true` for every row of `messages.jsonl` |

`expected` has the same shape as `EvalCase.expected` in `src/evaluate.ts`, so rows convert directly to eval cases (see `run-rules.mjs`).

## Labelling rules

**Kind** is what the message is about (the company or institution it is from or concerns), following the catalog in `packages/core/src/catalog.ts`. A scam keeps the kind of what it pretends to be (a fake MoMo message is `mobile_money`, a fake DGSN message is `administrative`). `other` is for messages that fit none of the nine topics (parcel links, family and friends, job-offer scams, promotions).

**Action** is the one thing the message asks of the reader. A scam is labelled with what it asks, not with what the reader should do: a wrong-transfer message asks to send money back (`pay`), a PIN request asks to reply (`reply`), a fake prize asks to call or pay. `unclear` is for messages with a link and no stated action, or with no readable ask. `nothing` is for receipts and notices that need no response. Dialling a menu code for information (`*155#`) is `nothing`, not an obligation.

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
| Kind | mobile_money 55, bank 40, telecom 40, administrative 30, electricity_bill 30, health 30, school 30, water_bill 28, legal 22, other 15 |
| Action | pay 84, nothing 56, go_to_place 38, call 33, collect 27, bring_document 26, reply 30, unclear 16, take_medicine 10 |
| Urgency | info 174, urgent 92, soon 54 |
| Scam level | no_signs 231, likely_scam 69, caution 20 (89 messages, 28%, flagged) |
| Split | train 223, test 97 |

Test split by kind: mobile_money 17, bank 12, telecom 12, administrative 9, electricity_bill 9, health 9, school 9, water_bill 8, legal 7, other 5. By language: fr 38, en 44, wes 15. By scam level: no_signs 74, likely_scam 19, caution 4.

Every kind and every action appears at least 10 times (`take_medicine` is the smallest, with exactly 10: 4 fr, 3 en, 3 wes). About 10% of the messages (32) are OCR-noisy: every `letter` plus four SMS screenshots, with `O`/`0` and `l`/`1` swaps, dropped accents, stray spaces and lines broken mid-sentence.

Scam signals covered (messages declaring each signal; a message can carry several, and the file stores only the level, not the signals): `sender_mismatch` 57, `pay_to_personal_number` 27, `time_pressure` 23, `link` 20, `account_block_threat` 16, `asks_to_call_number` 11, `asks_pin` 10, `wrong_transfer` 9, `prize_fee` 9, `ussd_instruction` 6, `fake_balance` 5. The signal list lives in the templates and is printed by `build-dataset.mjs`.

## Split

Stratified by `expected.kind`: within each kind the messages are shuffled with a fixed seed (`20261031`) and the first 30% (rounded) become `test`, the rest `train`. The split is deterministic for a given set of templates; adding or editing templates reshuffles ids and splits, so regenerate once, then treat the file as frozen for any published result. Real rows (below) keep their own split.

## Known limits

- The same template (one wording) is used once per message, but messages from different templates share structure. Train and test are not independent in wording, so a fine-tuned model can look better here than on real mail. Judge a model on real consented messages when you have them.
- The author of the templates also knows the rules lexicons, so the rules baseline is probably optimistic, especially on scam level.
- Most messages are short and clean. Real SMS has typos, mixed languages, missing accents and unusual date formats beyond what the generator produces.
- `wes` is unreviewed (see above) and the `fr`/`en` lexicons have no Pidgin entries, so the rules baseline is expected to do poorly on `wes`.

## Rules baseline

`results-rules.md` has the latest run of the rule-based classifier on the test split (97 messages): kind 86.6%, action 63.9%, urgency 75.3%, all three right 44.3%, scam level 94.8%. Run it from the repository root:

```sh
node node_modules/.pnpm/vite-node@3.2.4/node_modules/vite-node/vite-node.mjs packages/understand/eval/run-rules.mjs
```

`--split=train|all` evaluates another split (and does not overwrite `results-rules.md`); `--no-write` prints only. If the `vite-node@3.2.4` folder is missing after an install, use `ls node_modules/.pnpm | grep vite-node`.

## Regenerating the synthetic rows

`messages.jsonl` is generated: `node packages/understand/eval/build-dataset.mjs`. The templates are in `gen/fr.mjs`, `gen/en.mjs` and `gen/wes.mjs` (one wording per message, with labels and scam signals next to the text) and the helpers in `gen/lib.mjs`. The output is byte-identical on every run. Fix a label or wording in the template, then regenerate; do not hand-edit `messages.jsonl`. `test/dataset.test.ts` checks the result.

## Adding real, consented, anonymised messages

Real messages must never be mixed into the synthetic file.

1. Get explicit, informed consent from the person who received the message, in writing, saying the text will be published under CC-BY-SA-4.0. Do not accept messages from people who cannot consent freely, and never collect from someone else's phone.
2. Anonymise before the text leaves the phone: replace personal names with obviously fictional ones, phone numbers with `677 00 xx xx` / `699 00 xx xx` numbers (keep the same format and separators), account, meter, ID and reference numbers with random digits of the same length, and addresses and workplaces with generic ones. Keep the senders that are companies (ENEO, MTN) only if the sender is the point of the message. Two people must check the result.
3. Put them in `messages.real.jsonl` (same format) with `"synthetic": false` and ids like `real-001`. `test/dataset.test.ts` validates that file when it exists. Put real rows in `test` only if no model was tuned on them, and keep the 70/30 balance per kind.
4. Have a native speaker label each message independently of the model output. For `wes` and any other language, the labeller must read the language natively.
5. Never commit a screenshot, a contact name or a raw export.
