# Pack rules (`packs/<tag>/rules.json`)

`rules.json` tells SabiTori how your language says **numbers, money, dates and phone numbers**. It is data, not code. A community adds a language by recording clips and writing this file.

Everything the rules say is broken into **tokens**. Each token has a **clip id** and a **text**:

- Text-to-speech packs (French, English) speak the text.
- Recorded packs play one clip per token: `audio/<clip id>.webm`.

Run `requiredClips(pack)` (or the recorder app) to get the exact list of clips a pack needs.

## Clip ids

| Id | Meaning |
|---|---|
| `num.7`, `num.70` | an atom: a number word |
| `scale.100`, `scale.1000` | a scale word (hundred, thousand ...) |
| `join.and` | a joiner word (silent joiners such as a hyphen have no clip) |
| `month.1` .. `month.12` | month names |
| `weekday.1` .. `weekday.7` | weekdays, Monday = 1 |
| `day.12` | a day-of-month word that replaces the number (ordinals) |
| `rel.today`, `rel.tomorrow`, `rel.yesterday` | relative day words |
| `currency.XAF` | a currency word (singular and plural use the same clip) |
| `word.of` | a small word used by templates as `{w:of}` |
| `sender.<id>` | an official sender's name (id from `regions/<CODE>/region.json`) |
| `pause.short` | optional short silence between phone groups; skipped when missing |

A recorded pack must ship `audio/index.json`, `{ "clips": ["num.1", "scale.100", ...] }`, listing the clips it really has. The registry refuses a recorded pack without it, and exposes `missingClips` (what `requiredClips` needs that the index lacks). A clip that is not in the index counts as missing when a phrase is rendered, so the phrase is spoken in another language before playback starts; a half-recorded amount is never played.

If a clip, phrase or slot cannot be rendered in a recorded pack, that phrase is spoken in the first language of the fallback chain that can (the pack's `fallback` list, then the terminal fallback, then the catalog's English text). The terminal fallback is `ctx.terminalFallback` when given, else the region's offered languages in order, else `en`. The card shows which language was used. If a clip still fails to play, the player skips the rest of that section and calls `onError(sectionIndex, error)`, so the app can re-render that section in a fallback language.

## Top level

```json
{ "formatVersion": 1, "numbers": {}, "money": {}, "dates": {}, "phones": {}, "words": {} }
```

Only `formatVersion` and `numbers` are required. A missing section makes phrases that need it fall back.

## numbers

```json
"numbers": {
  "atoms":     { "0": "zero", "1": "one", "...": "...", "20": "twenty", "30": "thirty" },
  "scales":    [ { "value": 100, "word": "hundred", "join": [{ "token": "and", "when": { "remainderLt": 100 } }] } ],
  "joiners":   { "and": { "text": "and" }, "hyphen": { "text": "-", "silent": true } },
  "join":      [ { "token": "hyphen" } ],
  "overrides": { "70-79": { "base": 60 } }
}
```

How a number `n` is said (first rule that applies):

1. **Override**: `overrides` has an exact key (`"80"`) or an inclusive range (`"70-79"`). Exact keys win.
2. **Atom**: `atoms` has `n`. Atoms 0-9 are required (they are also used to read digits one by one). Add as many as your language has single words for (20, 30 ... for French).
3. **Scale**: take the largest scale `s` with `s.value <= n`. `q = n / s.value`, remainder `r = n % s.value`. Say the multiplier `q` (recursively), the scale word, then the joiner (from `s.join`) and the remainder. `omitOne` drops the multiplier when `q` is 1 ("cent", "mille", "ten"). `order: "scale_first"` puts the scale word first. `pluralWhen` + `plural` choose a plural form of the word (`"multiple"`, or `"multiple_final"` when nothing follows). The multiplier is "final" for bound forms only when `multiplierFinal` is true.
4. **Additive**: below the smallest scale, take the largest atom `a <= n`, then the joiner from the top-level `join`, then the rest. 45 = "forty" + "five".

Numbers above `largest scale * 1000 - 1` are read digit by digit. A pack with no scales can compose numbers only up to its largest atom; above that they are read digit by digit. Below the smallest scale, additive reading ("forty" + "five") only starts at atoms of 10 or more: a number the rules cannot build (12 with atoms 0-9 and a scale of 100) is not spoken wrongly as "nine three", the phrase falls back to another language. A pack whose atoms stop below 10 with no scales gets a warning from `scripts/check-packs.mjs`; add the atoms (10, 11 ...) or scales.

Limits: a scale value is a whole number of at least 2 and unique; `overrides` must not loop (a `{ "number": 13 }` inside the override of 13 is rejected); one number may use at most 2000 rule steps; amounts above 2^53 are refused rather than rounded.

**Atoms with two forms.** `"80": { "text": "quatre-vingts", "bound": "quatre-vingt" }`. `text` is used when nothing follows, `bound` when more number words follow ("quatre-vingt-un"). Same clip.

**Joiners.** `joiners` maps a key to a word. `{ "silent": true }` joiners (hyphens) are glued to their neighbours and have no clip. A `JoinChoice` list picks the first entry whose `when` holds. Conditions look at the remainder: `remainderEq` (list), `remainderLt`, `remainderGte`.

**Overrides.** Two shapes:

```json
"70-79": { "base": 60 }                                  // say 60, joiner, then n-60: 71 = 60 + 11
"81-99": { "base": 80, "join": [{ "token": "hyphen" }] }  // custom joiner
"13":    { "say": [ { "atom": 3 }, { "join": "and" }, { "scale": 10 } ] }  // explicit sequence
```

`say` items: `{ "atom": n }`, `{ "scale": n }`, `{ "join": key }`, `{ "number": n }` (recursion).

### French in short

- atoms 0-20, 30, 40, 50, 60, and 80 (two forms)
- `join`: "et" when the remainder is 1 or 11 (21, 31, 61, 71), else a hyphen
- overrides: 70-79 = 60 + 10..19, 81-99 = 80 + 1..19 with a hyphen
- scales: cent (plural "cents" only when final), mille (never plural, multiplier not final), million/milliard (plural when multiple, multiplier final)

This gives 71 "soixante et onze", 80 "quatre-vingts", 81 "quatre-vingt-un", 200 "deux cents", 201 "deux cent un", 200 000 "deux cent mille", 80 000 000 "quatre-vingts millions".

## money

```json
"money": {
  "template": "{amount} {link} {currency}",
  "currencies": { "XAF": { "text": "franc CFA", "plural": "francs CFA" } },
  "singularFor": [0, 1],
  "link": { "word": "de", "multipleOf": 1000000 }
}
```

`template` parts are separated by spaces and are `{amount}`, `{currency}`, `{link}` or `{w:key}` (a word from `words`). Literal text is not allowed: every spoken word needs a clip id. `{link}` is replaced by the word only when the amount is a multiple of `multipleOf` ("deux millions DE francs"). `singularFor` lists the amounts that use the singular (default `[1]`). Put the currency before `{amount}` for languages that say it first. An unknown currency code is spoken as its ISO code.

French: "15 000 francs CFA" = "quinze mille francs CFA". English: "fifteen thousand CFA francs".

## dates

```json
"dates": {
  "months": ["janvier", "..."],
  "weekdays": ["lundi", "..."],
  "days": { "1": "premier" },
  "templates": { "full": "{day} {month} {year}", "noYear": "{day} {month}" },
  "omitCurrentYear": true,
  "yearStyle": "cardinal",
  "relative": { "today": "today", "tomorrow": "tomorrow", "yesterday": "yesterday" }
}
```

- `months`: exactly 12. `weekdays`: exactly 7, Monday first.
- `days`: words that replace the number for some days (ordinals, "premier").
- `templates`: `full` has the year, `noYear` does not. Optional `fullWeekday` / `noYearWeekday` are used when `includeWeekday` is true. Parts: `{day} {month} {year} {weekday} {w:key}`.
- `omitCurrentYear` (default true): leave the year out when it equals the year of today (or of the slot's `relativeTo`).
- `yearStyle`: `cardinal` ("two thousand twenty-seven") or `century_pairs` ("twenty twenty-seven").
- `relative`: when the date is today, tomorrow or yesterday, say only this word. The phrase around the date must still be grammatical ("Do it by tomorrow"). The French pack leaves `relative` out because its phrases say "avant le {date}".

Dates never include an article: phrases supply it. `{date}` renders "12 novembre" in French and "12 November" in English.

## phones

```json
"phones": {
  "countryCode": "omit",
  "groups": [1, 2, 2, 2, 2],
  "groupsByLength": { "4": [2, 2] },
  "defaultGroupSize": 2,
  "read": "number",
  "pause": { "text": "," }
}
```

The country code is dropped when it matches the region's (`+237...`), unless `countryCode` is `"say"` (read digit by digit). The national number is split into `groups` (or `groupsByLength[digit count]`; extra digits use `defaultGroupSize`). Each group is read as a number (`read: "number"`) or digit by digit (`"digits"`); `groupRead` overrides per group index. Leading zeros are always said ("05" = "zero five"). `pause.text` is the punctuation TTS uses between groups; recorded packs may include a silent `pause.short` clip.

French: `6 77 12 34 56` = "six, soixante-dix-sept, douze, trente-quatre, cinquante-six". English uses the same structure: "six, seventy-seven, twelve, thirty-four, fifty-six".

## words

`"words": { "of": "of" }` are small words for templates: `{w:of}`. Clip id `word.of`.

## Worked example: HYPOTHETICAL language "Xan"

**This language does not exist.** The syllables are invented to show the mechanism: base-10 composition "ten-and-three" for 13 and number-after-noun money order. Do not copy these words into a real pack. Real packs get their words from native speakers.

```json
{
  "formatVersion": 1,
  "numbers": {
    "atoms": { "0": "nul", "1": "ka", "2": "lo", "3": "mi", "4": "su", "5": "ne", "6": "pa", "7": "to", "8": "ve", "9": "ru" },
    "joiners": { "and": { "text": "ye" } },
    "scales": [
      { "value": 10,   "word": "zan",  "omitOne": true, "join": [{ "token": "and" }] },
      { "value": 100,  "word": "baro", "omitOne": true, "join": [{ "token": "and" }] },
      { "value": 1000, "word": "toko", "omitOne": true, "join": [{ "token": "and" }] }
    ]
  },
  "money": { "template": "{currency} {amount}", "currencies": { "XAF": { "text": "fra" } } }
}
```

| Number | Said | Clips |
|---|---|---|
| 7 | to | `num.7` |
| 10 | zan | `scale.10` |
| 13 | zan ye mi | `scale.10`, `join.and`, `num.3` |
| 20 | lo zan | `num.2`, `scale.10` |
| 25 | lo zan ye ne | `num.2`, `scale.10`, `join.and`, `num.5` |
| 342 | mi baro ye su zan ye lo | `num.3`, `scale.100`, `join.and`, `num.4`, `scale.10`, `join.and`, `num.2` |

Money 13 XAF with the currency first: "fra zan ye mi" = `currency.XAF`, `scale.10`, `join.and`, `num.3`.

To say a language's 13 as a single irregular word, add `"overrides": { "13": { "say": [ { "atom": 13 } ] } }` and record `num.13`.

This example is checked by `packages/speech/test/hypothetical.test.ts`.

## Checking a pack

- The registry validates `manifest.json`, `phrases.json` and `rules.json` when loading, every value, not just the shape (words are non-empty strings, scale values whole numbers of at least 2, months exactly 12, phone group sizes at least 1, clip ids only letters, digits, `_ . -`, no `..`, tags like `fr` or `pcm-CM`). It names the problem ("numbers.atoms is missing \"3\"", "dates.templates.full: {w:of} is not in words").
- `requiredClips(pack, { region })` lists every clip. Numbers up to 999 999 999 only ever use clips from this list.
- `node scripts/check-packs.mjs` runs the same `validateRules`, prints warnings (numbers the rules cannot say, atoms that stop below 10), requires `rules.json` for `stable` and `beta` packs (a warning for `in_recording`), and requires `reading.json` (12 month lists, 7 weekday lists) when the manifest says `reads: true`.
