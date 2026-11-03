# frequency fill (shipped) vs Unigram-score fill (before)

## test (n=96)

| System | field | frequency fill (shipped) | Unigram-score fill (before) | frequency fill (shipped) - Unigram-score fill (before) |
| --- | --- | --- | --- | --- |
| encoder alone | kind | 88.5% [81.3–94.8] | 87.5% [80.2–93.8] | +1.0 pts [0.0–3.1], 1 vs 0, p = 1.000 |
| encoder alone | action | 87.5% [80.2–93.8] | 82.3% [74.0–89.6] | +5.2 pts [-1.0–11.5], 7 vs 2, p = 0.180 |
| encoder alone | urgency | 84.4% [77.1–91.7] | 80.2% [71.9–87.5] | +4.2 pts [0.0–9.4], 5 vs 1, p = 0.219 |
| encoder alone | all three | 68.8% [59.4–77.1] | 62.5% [52.1–71.9] | +6.3 pts [0.0–13.5], 9 vs 3, p = 0.146 |
| encoder + rules | kind | 93.8% [88.5–97.9] | 94.8% [89.6–99.0] | -1.0 pts [-3.1–0.0], 0 vs 1, p = 1.000 |
| encoder + rules | action | 83.3% [76.0–90.6] | 78.1% [69.8–86.5] | +5.2 pts [-1.0–11.5], 7 vs 2, p = 0.180 |
| encoder + rules | urgency | 81.3% [72.9–88.5] | 82.3% [74.0–89.6] | -1.0 pts [-6.3–3.1], 2 vs 3, p = 1.000 |
| encoder + rules | all three | 69.8% [60.4–78.1] | 65.6% [56.3–75.0] | +4.2 pts [-3.1–11.5], 8 vs 4, p = 0.388 |

## unseen (n=100)

| System | field | frequency fill (shipped) | Unigram-score fill (before) | frequency fill (shipped) - Unigram-score fill (before) |
| --- | --- | --- | --- | --- |
| encoder alone | kind | 78.0% [70.0–86.0] | 79.0% [71.0–87.0] | -1.0 pts [-3.0–0.0], 0 vs 1, p = 1.000 |
| encoder alone | action | 58.0% [48.0–68.0] | 54.0% [44.0–64.0] | +4.0 pts [-1.0–10.0], 6 vs 2, p = 0.289 |
| encoder alone | urgency | 58.0% [48.0–67.0] | 59.0% [49.0–68.0] | -1.0 pts [-5.0–3.0], 2 vs 3, p = 1.000 |
| encoder alone | all three | 34.0% [25.0–43.0] | 33.0% [24.0–42.0] | +1.0 pts [-3.0–5.0], 3 vs 2, p = 1.000 |
| encoder + rules | kind | 94.0% [89.0–98.0] | 91.0% [85.0–96.0] | +3.0 pts [0.0–7.0], 3 vs 0, p = 0.250 |
| encoder + rules | action | 57.0% [47.0–66.0] | 56.0% [46.0–66.0] | +1.0 pts [-5.0–7.0], 5 vs 4, p = 1.000 |
| encoder + rules | urgency | 67.0% [58.0–76.0] | 65.0% [56.0–74.0] | +2.0 pts [-2.0–6.0], 3 vs 1, p = 0.625 |
| encoder + rules | all three | 41.0% [31.0–51.0] | 38.0% [29.0–47.0] | +3.0 pts [-2.0–8.0], 5 vs 2, p = 0.453 |

## Fidelity: cosine of exported vs original fp32 sentence embeddings (held-out text only)

| Set | n | frequency fill (shipped) mean / min | Unigram-score fill (before) mean / min |
| --- | --- | --- | --- |
| messages.jsonl:test | 96 | 0.982 / 0.908 | 0.960 / 0.763 |
| unseen.jsonl | 100 | 0.976 / 0.861 | 0.946 / 0.699 |
| heldout-sentences.txt | 80 | 0.990 / 0.941 | 0.854 / 0.289 |
| all held-out | 276 | 0.982 / 0.861 | 0.924 / 0.289 |

Size: frequency fill (shipped) 34.2 MB (30000 pieces), Unigram-score fill (before) 34.2 MB (30000 pieces).
