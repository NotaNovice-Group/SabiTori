# Licence for language packs

This applies to everything in `packs/`: translated text, recorded voices and clips, number,
date and money rules, and the datasets made from them. The software in the rest of the repository
is covered by the MPL-2.0 licence in [`LICENSE`](../LICENSE), not by this file.

## The default: CC-BY-SA-4.0

Unless a pack's manifest says otherwise, pack content is licensed under the
[Creative Commons Attribution-ShareAlike 4.0 International licence](https://creativecommons.org/licenses/by-sa/4.0/legalcode).

In short: you may use, share and adapt the content, including for money, if you credit the people
who made it and share your adaptations under the same licence.

## The community decides

Each pack has a `license` field in its `manifest.json`. A language community can choose another
licence there, as an SPDX identifier (for example `CC-BY-4.0` or `CC-BY-NC-4.0`). The value in the
manifest is the licence for that pack and overrides the default above.

The English and French packs set `CC-BY-4.0` in their manifests.

## `LicenseRef-community-decides`

This value means the community has not chosen a licence yet. It is not a licence. Until a
community replaces it, the pack's content is not released for reuse: do not copy, redistribute or
adapt it.

## Speakers and consent

Recordings and voices are used with each speaker's written consent, for the licence that the
community chooses. A speaker can ask for their recordings to be removed at any time.

## Other material

Models, fonts and libraries that SabiTori uses keep their own licences. See
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).
