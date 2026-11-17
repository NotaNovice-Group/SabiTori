# Cameroonian Pidgin reading words (draft)

`reading.json` lets SabiTori's keyword rules read messages written in Cameroonian Pidgin (most SMS between people,
and some from businesses). It is a **draft written without a native speaker**: forms were taken from the
synthetic training messages in `packages/understand/eval` (train split only; the test and unseen sets were not looked
at). It must be reviewed by two native speakers before it is called done; until then treat it like any draft pack.

Pidgin writes dates and amounts like English, so the month and weekday lists are the English ones. `stopwords` is
empty on purpose: a message in Pidgin is still detected as English or unknown, never as a third language, which keeps
every fact rule unchanged. Only Pidgin-specific forms are listed ("make you go", "I don send you", "return am", "go
block"); words Pidgin shares with English come from `packs/en/reading.json`.
