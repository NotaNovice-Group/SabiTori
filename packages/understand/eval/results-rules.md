# Rules baseline results

Classifier: `rules@1` (region CM, lexicons fr + en, no `wes` lexicon exists yet). Split: `test` (97 messages).
Regenerate: see the header of `run-rules.mjs`. Deterministic: same dataset gives the same numbers.

## Accuracy

| Field | Accuracy |
|---|---|
| kind | 86.6% |
| action | 63.9% |
| urgency | 75.3% |
| all three right | 44.3% |
| scam level (assessScam) | 94.8% |

Mean rules confidence: 0.66. Classifier errors: 0.

## By language

| Lang | n | kind | action | urgency | all three | scam level |
|---|---|---|---|---|---|---|
| fr | 38 | 84.2% | 65.8% | 78.9% | 42.1% | 94.7% |
| en | 44 | 93.2% | 72.7% | 77.3% | 56.8% | 93.2% |
| wes | 15 | 73.3% | 33.3% | 60.0% | 13.3% | 100.0% |

## Scam level confusion (rows = expected, columns = predicted)

| expected \ predicted | likely_scam | caution | no_signs | recall |
|---|---|---|---|---|
| likely_scam | 17 | 1 | 1 | 89.5% |
| caution | 0 | 4 | 0 | 100.0% |
| no_signs | 1 | 2 | 71 | 95.9% |

Any warning on scam/caution messages: 22/23 (95.7%). Warning on no-signs messages (false alarms): 3/74 (4.1%).

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

- pay -> unclear: 14
- nothing -> unclear: 7
- go_to_place -> unclear: 5
- reply -> unclear: 3
- call -> go_to_place: 2
- nothing -> pay: 2
- bring_document -> go_to_place: 1
- pay -> nothing: 1

### urgency

- urgent -> soon: 11
- info -> soon: 8
- info -> urgent: 3
- urgent -> info: 2

### scam level

- no_signs -> caution: 2
- likely_scam -> caution: 1
- likely_scam -> no_signs: 1
- no_signs -> likely_scam: 1
- caution -> likely_scam: 0
- caution -> no_signs: 0

## Per-label recall

### kind

| Label | n | recall |
|---|---|---|
| administrative | 9 | 77.8% |
| bank | 12 | 58.3% |
| electricity_bill | 9 | 100.0% |
| health | 9 | 88.9% |
| legal | 7 | 71.4% |
| mobile_money | 17 | 94.1% |
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
| go_to_place | 11 | 54.5% |
| nothing | 17 | 47.1% |
| pay | 25 | 40.0% |
| reply | 10 | 70.0% |
| take_medicine | 4 | 100.0% |
| unclear | 6 | 100.0% |

### urgency

| Label | n | recall |
|---|---|---|
| info | 54 | 79.6% |
| soon | 18 | 100.0% |
| urgent | 25 | 48.0% |

## For reference: all 320 messages

kind 86.6%, action 62.8%, urgency 78.4%, all three 45.0% (rules need no training, so train and test are comparable).
