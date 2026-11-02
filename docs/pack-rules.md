# Pack rules (`packs/<tag>/rules.json`)

`rules.json` tells SabiTori how your language says **numbers, money, dates and phone numbers**. It is data, not code. A community adds a language by recording clips and writing this file.

Everything the rules say is broken into **tokens**. Each token has a **clip id** and a **text**:

- Text-to-speech packs (French, English) speak the text.
- Recorded packs play one clip per token: `audio/<clip id>.webm` or `.m4a`, as `audio/index.json` says.

Run `requiredClips(pack)` (or the recorder app) to get the exact list of clips a pack needs.

## Clip ids

| Id | Meaning |
|---|---|
| `num.7`, `num.70` | an atom: a number word |
| `num.80.bound` | the bound form of an atom, when it has its own recording (`boundClip`, below) |
| `num.money.7`, `num.day.3`, `num.year.2` | an atom of a context's own number set (below) |
| `scale.100`, `scale.1000` | a scale word (hundred, thousand ...) |
| `scale.100.plural` | the plural form of a scale word with its own recording (`pluralClip`) |
| `scale.money.100` | a scale word of a context's own number set |
| `join.and` | a joiner word (silent joiners such as a hyphen have no clip) |
| `join.money.and` | a joiner of a context's own number set |
| `month.1` .. `month.12` | month names |
| `weekday.1` .. `weekday.7` | weekdays, Monday = 1 |
| `day.12` | a day-of-month word that replaces the number (ordinals) |
| `rel.today`, `rel.tomorrow`, `rel.yesterday` | relative day words |
| `currency.XAF` | a currency word (singular and plural use the same clip unless `pluralClip` is set) |
| `currency.XAF.plural` | the plural currency word, with its own recording (`pluralClip`) |
| `word.of` | a small word used by templates as `{w:of}` |
| `sender.<id>` | an official sender's name (id from `regions/<CODE>/region.json`) |
| `pause.short` | optional short silence between phone groups; skipped when missing |

Clip ids use letters (upper case too: `currency.XAF`), digits and `_ . -`, at most 100 characters, no `..`. The update channel accepts exactly the same spelling.

A recorded pack must ship `audio/index.json`, listing the clips it really has **with their file names**:

```json
{ "clips": [ { "id": "money.amount.0", "file": "money.amount.0.m4a" }, { "id": "num.1", "file": "num.1.webm" } ] }
```

`file` is always `<id>.webm` or `<id>.m4a` (a phone's browser records one or the other; the Recorder keeps each clip as it was recorded). An entry may also be just the clip id, `"num.1"`, which means `num.1.webm`: packs exported before clips could be `.m4a` keep working. The registry builds every clip URL from the index and refuses a recorded pack without it. It exposes `missingClips` (what `requiredClips` needs that the index lacks). A clip that is not in the index counts as missing when a phrase is rendered, so the phrase is spoken in another language before playback starts; a half-recorded amount is never played.

`scripts/check-packs.mjs` requires the index entries and the files in `audio/` to match one to one (an indexed clip without its file, or a file the index does not list, is an error) and allows only `.webm` and `.m4a` files.

A pack with **no `rules.json`** is read as having no rules: phrases without slots play as recorded, and each phrase with a number, money, date or phone slot is spoken in the next language of the fallback chain. A pack exported by the Recorder (or created by `scripts/new-language.mjs`) always has at least a minimal valid `rules.json` (the digits 0-9). Only a missing file (HTTP 404) means "no rules"; a file that is there but invalid is an error that stops the pack from loading.

**Draft phrases are not spoken.** A phrase whose `status` is `draft` has not been confirmed by a second speaker. Recorded packs, and packs below `beta`, skip it exactly like a missing phrase: the next language of the fallback chain speaks. (A `beta` or `stable` pack with a synthetic voice, like the French and English packs, keeps speaking its drafts.) Tester builds can pass `includeDrafts: true` in the render context to hear every draft. The pack's own `status` is in `manifest.json` and comes back from `registry.list()` for the app to decide what to offer (`stable` and `beta` yes, `in_recording` and `planned` no).

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

**How far numbers go.** The largest number the rules can compose is derived from the scales, not from an assumption about thousands: below the smallest scale `s1` every number up to `s1 - 1` is composed additively, and the multiplier of each scale must itself be composable and below that scale, so `cap_k = s_k * (min(s_k - 1, cap_(k-1)) + 1) - 1`. Base 10 with 100, 1000 and 1 000 000 composes up to 999 999 999 999; base 20 with scales 20, 400 and 8000 composes up to 63 999 999. `maxNumber(rules.numbers)` says it. **Above it a number cannot be said**: an amount, a date or a count above the cap throws `SpeechRuleError` and that phrase falls back to a language that can say it. Reading a large amount digit by digit would be said, but not as an amount, so it never happens. Phone groups are the exception and keep reading digit by digit. A pack with no scales can compose numbers only up to its largest atom. `node scripts/check-packs.mjs` probes the rules up to 1 000 000 000 and warns when the largest composable number is below it (add a larger scale). Below the smallest scale, additive reading ("forty" + "five") only starts at atoms of 10 or more: a number the rules cannot build (12 with atoms 0-9 and a scale of 100) is not spoken wrongly as "nine three", the phrase falls back to another language. A pack whose atoms stop below 10 with no scales gets a warning from `scripts/check-packs.mjs`; add the atoms (10, 11 ...) or scales.

Limits: a scale value is a whole number of at least 2 and unique; `overrides` must not loop (a `{ "number": 13 }` inside the override of 13 is rejected); one number may use at most 2000 rule steps; amounts above 2^53 are refused rather than rounded.

**Atoms with two forms.** `"80": { "text": "quatre-vingts", "bound": "quatre-vingt" }`. `text` is used when nothing follows, `bound` when more number words follow ("quatre-vingt-un"). Same clip: the final "s" of French is silent. When the two forms sound different, add `"boundClip": true`: the bound form then has its own clip `num.80.bound`, and the Recorder lists both.

**Scales with a plural.** `"plural": "cents"` with `pluralWhen` picks the plural word. It shares the scale's clip unless `"pluralClip": true`, which gives it its own clip `scale.100.plural`.

**Number sets for a context.** Many Cameroonian languages count differently depending on what is counted. `numbers.contexts` holds an overlay for each of three contexts: `money` (the amount of a sum of money), `day` (a day of the month that is not in `dates.days`) and `year` (a year). An overlay may contain `atoms`, `scales`, `joiners`, `join` and `overrides`; whatever it does not list is inherited from the base set.

```json
"numbers": {
  "atoms": { "0": "...", "1": "mɔ́ɔ", "2": "bɛ́ɛ", "...": "..." },
  "contexts": {
    "money": { "atoms": { "1": "ɓɔ́ɔ" }, "scales": [ { "value": 1000, "word": "ŋgɔ́n" } ] },
    "year":  { "atoms": { "2": "bɛ́ɛ̀" } }
  }
}
```

An entry that comes from an overlay has the context in its clip id (`num.money.1`, `scale.money.1000`, `join.money.and`); an entry it inherits keeps the base id (`num.money.5` is not needed when 5 is the same word). `requiredClips` lists exactly the clips that are needed. The same applies to the bound and plural flags above.

*What this is, and is not.* The rules choose words by where the number is said (money, day, year) and by what follows it (bound forms, plurals). They do not choose a word by the class of a noun a number is counting, because a counted noun is not a slot: in a recorded phrase the noun is part of a text piece that is recorded as a whole, in whatever agreement the speaker says. A language whose numbers agree with an arbitrary noun class should record the phrases with those nouns as text, and use `contexts` for the three places a number is spoken on its own.

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

`template` parts are separated by spaces and are `{amount}`, `{currency}`, `{link}` or `{w:key}` (a word from `words`). Literal text is not allowed: every spoken word needs a clip id. `{link}` is replaced by the word only when the amount is a multiple of `multipleOf` ("deux millions DE francs"). `singularFor` lists the amounts that use the singular (default `[1]`). Put the currency before `{amount}` for languages that say it first. An unknown currency code is spoken as its ISO code. `{ "text": "franc", "plural": "francs", "pluralClip": true }` records the plural as its own clip `currency.XAF.plural`. An amount must be a whole number the number rules can compose (see "How far numbers go"); a decimal amount or one above the cap throws `SpeechRuleError` and the phrase falls back.

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

Dates never include an article unless the template says one with `{w:the}`: the catalog phrase supplies the preposition ("Do it by {date}", "avant le {date}"). `{date}` renders "12 novembre" in French and "the eleventh of November" in English (`days` with the ordinals, `"the {day} of {month}"` written as `{w:the} {day} {w:of} {month}`), so "Do it by the eleventh of November." is a sentence. An impossible date ("2027-02-29") or a value that is not `YYYY-MM-DD` throws `SpeechRuleError`; the phrase falls back.

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

A number from another country (`+33612345678`, `0033...`) does not follow the region's grouping. It is read digit by digit, country code included, in groups of `phones.foreignGroupSize` digits (default 3): "three three six, one two three, four five six, seven eight". A group of a local number that is above the number cap is read digit by digit too; phones are the one place where digit reading stays.

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
- `requiredClips(pack, { region })` lists every clip, including context, bound and plural clips. Numbers up to `maxNumber` only ever use clips from this list.
- `node scripts/check-packs.mjs` runs the same `validateRules`, prints warnings (numbers the rules cannot say, atoms that stop below 10, a number range below 1 000 000 000), requires `rules.json` for `stable` and `beta` packs (a warning for `in_recording`: the pack is read as having no rules), requires `reading.json` (12 month lists, 7 weekday lists) when the manifest says `reads: true`, and enforces the status promises: see `packs/README.md` (`stable`: every key reviewed with audio or text, a real SPDX licence, a contributor, no stale clips; `beta`: a real licence; every pack: the audio index matches the files, no `recorder-notes.json`).
- `rulesWarnings(rules)` (the same warnings, as a function) probes every number from 0 to 1999 and the powers of ten up to 1 000 000 000 in each number context that exists.

## Scaling to 200 languages

The design is data, one folder per language, so adding a language adds files, not code. These are the points that matter when there are hundreds of them.

**What is implemented now**

- **Per-language update lists.** One signed `index.json` listing every clip of every language would be tens of thousands of entries. `scripts/updates-publish.mjs --per-language` writes a short signed root index (regions, `packs/index.json`, and a `languages` map) plus one file list per language, `packs/<tag>/index.json`, whose sha256 is pinned in the signed root. A phone asks for the languages it needs, `client.check({ tags: ['lns', 'fr'] })` or the client's `tags` option, and downloads only those lists and their files, so a phone that speaks two languages never downloads the other 198. Languages added or dropped later are fetched or removed without a new sequence. A flat index (no `--per-language`) still works and is what older apps understand. See `docs/updates.md`.
- **One manifest fetch.** The registry reads each manifest once and shares it (`registry.manifests()`), including with the Piper voice resolver (`createPacksVoiceResolver(..., { list: () => registry.manifests() })`), and one broken manifest is skipped instead of hiding the others.
- **Index order is the order.** Voice resolution for languages that share a BCP 47 prefix follows `packs/index.json`, never the order in which requests finish; parts carry their pack tag and voice id, so two languages can have separate voices.
- **Content is checked before it is trusted.** The update client and the publish script run the same validators as the app on every JSON file. `scripts/check-packs.mjs` enforces each pack's status, the audio index, licences and privacy.
- **Per-language failure is local.** A phrase, a slot or a whole language that cannot be said falls back along the pack's own chain; a broken voice is switched off by itself without hiding the others.

**What to do as the number grows (not yet built)**

- `list()` fetches every manifest at startup. At a few hundred packs, put a small summary (tag, autonym, status, voice kind) in `packs/index.json` so the language list needs one request; manifests are then fetched for the language chosen.
- The app should load the packs of the languages the person uses (and their fallbacks) instead of calling `get` for every listed tag. The registry is already lazy and cached per tag.
- Packs that share a family (for example many Grassfields languages) repeat number systems. A `rules.json` could `extend` a family file in `packs/_families/`; today each language has its own complete file, which is simple to review.
- Voices: a trained Piper model is 20-60 MB. Publish voices with `--voices <tag>` and `--per-language` so only the language a person picks is downloaded; keep the loaded-voice limit (`maxLoadedVoices`) small on phones.
- Tooling: `check-packs` prints one row per language; with hundreds, add `--only <tag>` and run it per pack in CI.
