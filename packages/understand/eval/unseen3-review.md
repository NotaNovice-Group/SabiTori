# unseen3.jsonl label review

- **Who:** u3-reviewer (independent; read only the README "Record format" and "Labelling rules", `packages/core/src/types.ts` lines 75-125, and `unseen3.jsonl`; no model output).
- **What was checked:** all 150 rows, fields `expected.kind`, `expected.action`, `expected.urgency` and `scam`, against the written labelling rules. Urgency was recomputed from each row's own `receivedAt` to the stated deadline (day 7 = urgent, day 8 = soon, passed = urgent; today/tonight/within N hours, legal or health emergency = urgent; no deadline or dated no-action notice = info). Weekday names in the texts were checked against the calendar (all consistent).
- **Date:** 2026-11-19

## Changes

None. No label clearly breaks a written rule.

| id | field | old | new | rule |
|---|---|---|---|---|
| (none) | | | | |

## Debatable, left unchanged

| id | field | label | why debatable |
|---|---|---|---|
| u3-058, u3-060, u3-106 | urgency | urgent | Fixed-length treatment courses (7, 3, 5 days) with no stated deadline. Ongoing treatments (u3-009, u3-039, u3-070) are `info`. The set treats a short course as an action ending within 7 days; the rule does not say so explicitly. |
| u3-134 | urgency | urgent (action `nothing`) | OTP "expire dans 5 minutes" matches "within N minutes", but the message needs no action, which points to `info`. Compare u3-138 (no-action notice "tonight", labelled `info`). |
| u3-096 | action | reply | Sending "PROB + numero" to 8080 to get results is close to "dialling a menu code for information" (`nothing`), but the rule only names menu codes. |
| u3-011 | urgency | urgent | The deposit has no explicit deadline; the label uses the rentree date (7 Sept, day 7). |
| u3-111, u3-129 | action | pay | Operator renewal reminders ("recharge before 23:59", "renouvelez via *157#") could be read as offers (`nothing`/`info`); they ask to keep an existing pass, so `pay` stands. |
| u3-021, u3-050, u3-069, u3-137 | action | unclear | The ask is "do it at this link" (verify, register, click). No ACTION_KIND fits a link visit, so `unclear` is defensible; u3-069 also asks for ID and MoMo numbers (could be `reply`). |
| u3-002, u3-034 | kind | legal | Landlord court threat and fake gendarmerie arrest threat; `other` / `administrative` are possible readings. Consistent with u3-079 and u3-100. |
| u3-066, u3-083, u3-127 | scam | caution | Genuine-looking operator notices with a suspension threat (`account_block_threat`). Exactly one weak signal gives `caution`; "genuine look-alike" would give `no_signs`. |

## Validation

150 lines, each valid JSON, 150 unique ids, every `kind`/`action`/`urgency`/`scam` value in its allowed list. File not modified.
