# SabiTori language packs

A language pack is what lets SabiTori speak and show messages in one language.
Each language has its own folder here. This guide is for community members who
want to add a language, or help with one that is already here.

Thank you for helping. Every language you add means one more person who can
understand an official message without needing French or English.

## What is in a pack

```
packs/
  index.json            the list of packs the app may offer
  README.md             this guide
  <tag>/
    manifest.json       the language's name, voice, licence and status
    phrases.json        every sentence SabiTori can say, in this language
    rules.json          how numbers, money, dates and phone numbers are said (see docs/pack-rules.md)
    audio/              recorded voice clips (only for recorded languages)
      index.json        the list of clips and their files: {"clips":[{"id":"num.1","file":"num.1.m4a"}]}
```

A pack never contains `recorder-notes.json`. That is the Recorder's working file (review notes, who recorded
what); it must not be put in `packs/` or published. `node scripts/check-packs.mjs` and
`node scripts/guard-packs.mjs` fail when it is there, and the update publisher refuses it.

- `<tag>` is a short code for the language, such as `fr` (French) or `ewo` (Ewondo).
  Use ISO 639-1 where it exists, otherwise ISO 639-3.
- `phrases.json` has one entry for each sentence in the catalog
  (`packages/core/src/catalog.ts`). The key, such as `scam.likely`, never changes.
  Only the text is translated.
- Some words are slots, written like `{date}` or `{phone}`. Keep every slot exactly
  as written. You may move it anywhere in the sentence.
- `status` says whether a sentence has been checked. `draft` means it still needs a
  second speaker to confirm it. `reviewed` means it has been confirmed. A recorded pack
  does not speak a `draft` sentence: the next language of its fallback list speaks it,
  until a second speaker, who did not record it, has reviewed it.
- `rules.json` may be missing while the pack is `in_recording`: the pack is then read as having
  no rules, and each sentence with a number, money, date or phone slot is spoken in the next fallback
  language. A Recorder export always includes at least a minimal `rules.json`.

## Steps to add a language

1. **Claim the language.** Tell the SabiTori maintainers which language you are
   working on, so two groups do not start the same work. Add the language's
   folder and manifest with `status` set to `in_recording`. The app does not offer
   a language until its status changes.

2. **Translate the text.** Work through every key in the catalog. Use short
   sentences and everyday words. Where a word has no clear translation, say so
   in a note to the reviewers rather than inventing a word. Never write a
   sentence for a language you do not speak. Leave `phrases.json` as `{}` until
   people who speak the language have written the text.

3. **Record the audio.** Use the Recorder app (in `apps/recorder`) to record each
   sentence, or each part of a sentence with slots, and the words for numbers, months and
   money. Export the zip, unzip it into `packs/<tag>/`. Clips are `.webm` or `.m4a` files in
   `audio/` and are listed, with their file names, in `audio/index.json`. Record in a quiet
   room, at a steady pace, and speak the way people speak at the market, not as in a reading.

4. **Ask a second speaker to review.** A different person from the one who
   translated or recorded should check each sentence for meaning, tone and
   correct pronunciation. Only then change its `status` to `reviewed`.

5. **Choose a licence.** The community decides how the language may be reused.
   Set `license` in the manifest to the licence chosen, using an SPDX identifier
   such as `CC-BY-SA-4.0`. Leave `LicenseRef-community-decides` only until the
   choice is made: a `beta` or `stable` pack needs a real licence. The English and French
   packs use `CC-BY-4.0`.

6. **Get consent.** Every speaker and translator decides two separate things: whether
   their name appears in `contributors`, and whether their voice may be recorded **and
   published** (with the date they agreed). The Recorder keeps both, and leaves the
   clips of a speaker who has not agreed to the voice out of the zip. Put a name in
   the file only after that person has agreed in writing. A speaker may ask for their
   recordings to be removed at any time.

7. **Check the pack.** Run `node scripts/check-packs.mjs` from the repository
   root. It checks the format, the slots and the status of every entry, and it
   prints how much of the pack is done. Fix every error it reports before you
   ask for the pack to go live.

8. **Raise the status when it is ready.** Change `status` in the manifest from
   `in_recording` to `beta` when most sentences are reviewed, and to `stable`
   when every sentence has reviewed text and audio. `check-packs` enforces what the
   status promises:

   | Status | What `node scripts/check-packs.mjs` requires |
   |---|---|
   | `in_recording` | valid files; `audio/index.json` matches the clip files |
   | `beta` | the above, a real SPDX licence, a `rules.json` |
   | `stable` | the above, every catalog key `reviewed`, with audio (recorded packs) or text (voice packs), at least one contributor, no clip that nothing uses, every clip a sentence needs listed in the index |

   Bump `version` each time you publish a change, for example `0.1.0` to `0.2.0`.

## Notes for every contributor

- Never write a sentence that says a message is safe. The app only says that no
  warning signs were found.
- The text must help people understand. It must not give advice beyond asking
  someone, calling a number, or checking.
- If you are not sure about a word, ask a native speaker. A short, clear
  sentence is better than a clever one.
