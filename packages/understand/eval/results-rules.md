# Rules baseline results

Classifier: `rules@1` (region CM, lexicons fr + en, no `wes` lexicon exists yet). Split: `test` (96 messages).
Regenerate: see the header of `run-rules.mjs`. Deterministic: same dataset gives the same numbers.
Brackets: 95% percentile bootstrap interval over messages (10000 resamples, seed 20261102; `stats.mjs`). The published comparison with the encoder is in `results-encoder.md` / `results.json`.

## Accuracy

| Field | Accuracy [95% CI] |
|---|---|
| kind | 86.5% [79.2–92.7] |
| action | 76.0% [67.7–84.4] |
| urgency | 87.5% [80.2–93.8] |
| all three right | 59.4% [50.0–68.8] |
| scam level (assessScam) | 100.0% [100.0–100.0] |

Mean rules confidence: 0.67. Classifier errors: 0.

## By language

| Lang | n | kind | action | urgency | all three [95% CI] | scam level |
|---|---|---|---|---|---|---|
| fr | 38 | 84.2% | 76.3% | 89.5% | 60.5% [44.7–76.3] | 100.0% |
| en | 43 | 93.0% | 86.0% | 90.7% | 72.1% [58.1–86.1] | 100.0% |
| wes | 15 | 73.3% | 46.7% | 73.3% | 20.0% [0.0–40.0] | 100.0% |

## Scam level confusion (rows = expected, columns = predicted)

| expected \ predicted | likely_scam | caution | no_signs | recall |
|---|---|---|---|---|
| likely_scam | 18 | 0 | 0 | 100.0% |
| caution | 0 | 4 | 0 | 100.0% |
| no_signs | 0 | 0 | 74 | 100.0% |

Any warning on scam/caution messages: 22/22 (100.0%). Warning on no-signs messages (false alarms): 0/74 (0.0%).

## Confusion summary (most frequent errors, expected -> predicted)

### kind

- bank -> mobile_money: 3
- administrative -> health: 1
- administrative -> legal: 1
- bank -> administrative: 1
- bank -> telecom: 1
- health -> other: 1
- legal -> administrative: 1
- legal -> other: 1

### action

- nothing -> unclear: 5
- pay -> unclear: 5
- go_to_place -> unclear: 4
- reply -> unclear: 3
- call -> go_to_place: 2
- nothing -> pay: 2
- bring_document -> go_to_place: 1
- unclear -> nothing: 1

### urgency

- info -> soon: 5
- info -> urgent: 4
- urgent -> info: 2
- urgent -> soon: 1

### scam level

- caution -> likely_scam: 0
- caution -> no_signs: 0
- likely_scam -> caution: 0
- likely_scam -> no_signs: 0
- no_signs -> caution: 0
- no_signs -> likely_scam: 0

## Per-label recall

### kind

| Label | n | recall |
|---|---|---|
| administrative | 9 | 77.8% |
| bank | 12 | 58.3% |
| electricity_bill | 9 | 100.0% |
| health | 9 | 88.9% |
| legal | 7 | 71.4% |
| mobile_money | 16 | 93.8% |
| other | 5 | 60.0% |
| school | 9 | 100.0% |
| telecom | 12 | 100.0% |
| water_bill | 8 | 100.0% |

### action

| Label | n | recall |
|---|---|---|
| bring_document | 9 | 88.9% |
| call | 8 | 75.0% |
| collect | 7 | 100.0% |
| go_to_place | 11 | 63.6% |
| nothing | 19 | 63.2% |
| pay | 23 | 78.3% |
| reply | 9 | 66.7% |
| take_medicine | 4 | 100.0% |
| unclear | 6 | 83.3% |

### urgency

| Label | n | recall |
|---|---|---|
| info | 54 | 83.3% |
| soon | 18 | 100.0% |
| urgent | 24 | 87.5% |

## For reference: all 320 messages

kind 86.9%, action 80.9%, urgency 91.9%, all three 65.0% (rules need no training, so train and test are comparable).
