# Accessibility

SabiTori is for people who cannot read an official message: people who are blind or have low vision, people who
do not read French or English, people who read slowly. This page says what is built in, what is checked by
machines on every change, and what has **not** been checked yet.

## Built in

- **Listening is the default.** A card is spoken section by section; the scam warning, when there is one, is
  always first on screen and first in speech (`apps/app/e2e/flows.spec.ts`).
- **Buttons say their name.** With "Listen first" on, the first tap speaks a button's name and the second acts, so
  the screen can be explored by ear. A tap from TalkBack (double-tap) or the keyboard acts at once: that person
  already heard the name from their screen reader (`apps/app/src/components/SpeakingButton.tsx`).
- **Never colour alone.** Urgency is a colour, an icon and a spoken word; every fact on a card can show where it
  is in the message.
- **Reading support.** The typeface is SIL's Andika, made for beginning readers, with the full character set so
  tone marks of Cameroonian languages display. Text scales to 200 % without anything going off screen.
- **Calm motion.** With the system's reduced-motion setting, progress animations stop.
- **Focus.** Each new screen puts focus on its title; sheets keep focus inside until closed.

## Checked by machines

| Check | What | How often |
| --- | --- | --- |
| Full audit | 163 screen states at 360 x 780, text at 100 / 150 / 200 %, light and dark: axe-core WCAG 2.2 AA plus target size, spacing, names, clipping, overlap, headings, focus. Result on 2026-11-17: **0 violations, 0 failures** (`apps/app/a11y-report.md`) | `node apps/app/scripts/a11y.mjs` |
| Browser tests | axe-core WCAG 2.1 AA on 8 screens in light and dark, and 200 % text on a 320 px screen with no sideways scrolling (`apps/app/e2e/a11y.spec.ts`) | every change (`pnpm e2e`) |
| Unit tests | listen-first behaviour, assistive taps, sheet focus trap (`apps/app/test/a11y.test.ts`) | every change |

## Not checked yet

Automated checks find missing labels and poor contrast; they cannot say whether the app is usable. **No blind,
low-vision or non-reading person has tested SabiTori yet.** That is the first job of the pilot (docs/impact.md,
"Accessibility" metric): supervised sessions with TalkBack on the participants' own phones, and with people who do
not read, recorded with their consent. Until then, read the results above as "no known barrier", not as
"accessible".

[OWNER: name the disability organisation that will run or review these sessions, once one has agreed.]
