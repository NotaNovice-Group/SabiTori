# Teaching SabiTori to read a language (`packs/<tag>/reading.json`)

SabiTori **speaks** a language from recorded clips (see [`languages.md`](languages.md) and [`pack-rules.md`](pack-rules.md)).
It **reads** a message with a small list of words per language: the reading lexicon. Today only French and English
have one, so a message written in Cameroonian Pidgin is read with French and English words, and gets fewer fields
right than the others (the per-language table in
[`packages/understand/eval/results-rules.md`](../packages/understand/eval/results-rules.md) shows it).

This page is for a speaker who wants to fix that. No programming is needed: the lexicon is a JSON file of word
lists. Pidgin (`wes`) is the first language that needs one; the same steps work for any language people write
their messages in.

## Who should write it

Someone who reads and writes the language every day, and a **second speaker** who checks the lists before they
are used. Machine-written word lists are not accepted: a draft exists from an AI assistant for Pidgin, and it is
kept off `main` on purpose, because words a speaker would not use teach the app to misread real messages.

## What goes in the file

Copy [`packs/en/reading.json`](../packs/en/reading.json) to `packs/wes/reading.json`, set `"tag": "wes"` and
`"name"`, then replace each English list with the words people really write in Pidgin messages. Keep every key; a
list may be empty. Write words in lower case, without accents unless the language needs them.

| Key | What it lists | Example (English file) |
|---|---|---|
| `stopwords` | small words to ignore | `the`, `your`, `please` |
| `months`, `weekdays` | each month (January first) and each day (Sunday first), with short forms | `["january", "jan"]` |
| `relativeDays` | words for today, tomorrow... with their offset in days | `"tomorrow": 1` |
| `dateLeadWords`, `deadlineWords` | words before a date, words that make it a deadline | `before`, `due date` |
| `currencyWords`, `amountWords`, `balanceWords` | money words | `fcfa`, `amount`, `new balance` |
| `penaltyWords` | words before a penalty or late fee, never the amount to pay | `penalty`, `late fee` |
| `referenceLabels`, `contactWords`, `shortCodeLabels` | labels before a reference, a phone to call, a USSD code | `invoice no`, `call`, `dial` |
| `kinds` | words that say what the message is about, per kind (bill, mobile money, health, school...) | `electricity`, `hospital` |
| `actions` | words that say what to do, per action (pay, go, bring a document, call...) | `please pay`, `bring` |
| `urgency` | words for urgent and soon | `immediately`, `this week` |
| `scam` | words scams use: secret code, "send it back", prize, fee, block threat, time pressure | `pin`, `by mistake` |
| `promoWords` | advertising words | `promo`, `bonus` |

The `scam` lists only **add** warnings; they never make a message look safe. If you are unsure about a scam word,
leave it out and note it for the reviewer.

## Measure it

From the repository root, after `pnpm install`:

```bash
node $(ls -d node_modules/.pnpm/vite-node@*/node_modules/vite-node/vite-node.mjs | head -1) packages/understand/eval/run-rules.mjs --split=train --lang=wes --packs=fr,en,wes
```

This reads only the Pidgin messages of the **train** split, with your lexicon loaded, and prints how many have
kind, action and urgency all right, and how many scams get a warning and genuine messages a false alarm. Compare
with the same command without `,wes` in `--packs`. It never changes the published results.

Rules for measuring, so the numbers stay honest:

- Look at mistakes on the **train** split only. Do not open `unseen.jsonl` or study test-split errors: those sets
  are how everyone checks the work afterwards.
- A change that raises the score but adds words a speaker would not write is not kept.
- False alarms count as much as missed scams.

## Turn it on

When the second speaker has checked the file:

1. Set `"reads": true` in `packs/wes/manifest.json` (the app only loads lexicons of packs that read).
2. Add both speakers to `contributors` in the manifest, with their agreement.
3. Open a pull request. The maintainers then re-run the published results with the new lexicon and update
   `results-rules.md`, `results.json` and the model card in the same pull request.
