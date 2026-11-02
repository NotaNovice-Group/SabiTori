# SabiTori design system

Mode: **Operate**, on a phone, often outdoors in bright light, used by people who may not read,
may have a learning, visual or motor disability, and own a low-cost Android phone.
Precision and restraint, not decoration. Every rule below has a reason from that scene.

## The idea

**A message, held up and spoken.** The product's one signature element is the *spoken card*:
sections light up one at a time as they are spoken, like a finger following the words.
Everything else stays quiet so that this moment carries the screen.

## Type

- **Andika** (SIL, OFL), self-hosted via `@fontsource/andika`, weights 400 and 700.
  Chosen because it was designed for beginning readers (single-storey a and g, clear I/l/1),
  and because it covers African Latin letters (ɓ ɗ ŋ ɛ ɔ ə ƴ, combining tone marks)
  that most UI faces cannot render. Never fall back to Inter/Roboto for content.
- Scale (rem, root 16px, follows the system font-size setting; never fixed px for text):
  `0.9375` small · `1.125` body · `1.375` title · `1.75` section lead · `2.25` card headline.
  Five sizes, far apart. Body is 18px because users read slowly or not at all.
- Line height 1.4 body, 1.2 headings. Sentence case everywhere. No uppercase tracking labels.
- Numbers (amounts, dates, phone numbers) use `font-variant-numeric: tabular-nums` and bold.

## Colour

Colour carries meaning (urgency, scam) and almost nothing else. Chrome is ink on stone.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--ground` | `#EEF0EC` | `#111614` | App background, a low-chroma stone |
| `--surface` | `#FFFFFF` | `#1A211E` | Card body, one tone step from ground |
| `--surface-2` | `#E3E6E1` | `#232B27` | Pressed states, quiet fills |
| `--ink` | `#121A16` | `#EEF2EF` | Text, primary buttons (filled ink) |
| `--ink-2` | `#46524C` | `#A9B5AF` | Secondary text (≥ 4.5:1 on surface) |
| `--focus` | `#1D5FD1` | `#7FA8F5` | Focus ring only |
| `--info` | `#1E6B48` | `#5CC293` | Green: only information |
| `--soon` | `#8A5300` | `#E3A94A` | Amber: act soon |
| `--urgent` | `#B3261E` | `#FF8A80` | Red: urgent, and scam warnings |
| `--info-tint` / `--soon-tint` / `--urgent-tint` | 10% of the hue on surface | 18% on surface | Section background when lit |

- Urgency is never colour alone: each level has its own symbol and spoken sentence.
- Status notes (for example a voice not yet recorded) are `--ink-2`, never a hue: hues carry urgency and scam meaning only.
- Light theme is the default (sunlight). Dark theme is a full scheme, not an invert.
- No gradients, no glass, no glows, no drop shadows. Separation is a tone step or space.

## Shape and space

- Buttons: fully round (pill or circle). Cards and sections: 12px radius. Nothing in between.
- Touch targets: **at least 56×56px**, 12px apart (larger than Material's 48 for motor disabilities).
- Spacing steps: 4, 8, 12, 16, 24, 32, 48. Screen side gutter 16px (20px from 400px wide).
- One primary action per screen, filled ink, full width at the bottom within thumb reach.

## Symbols

- Icons from `lucide-react` only, stroke 2, size 28–32 in sections, 24 in buttons.
  Every icon sits next to a word or is spoken on touch; an icon is never the only label for a
  reader *or* a listener.
- Section symbols: scam `ShieldAlert`, sender `Building2`, about `FileText`, action `Hand`,
  deadline `CalendarClock`, money `Banknote`, help `Phone`, urgency: info `Info`,
  soon `Clock`, urgent `TriangleAlert`.

## The card

The card answers one question: **what must I do, and by when?**

- Order: scam warning → header (sender, subject; compact) → lead block (urgency word, action,
  date, amount, one Remind button) → help (phone + Call) → quiet no-signs line → Show someone.
- The lead block carries the largest text (`1.75rem`). `2.25rem` is reserved for the helper view.
- Urgency appears once, on the first line of the lead block: hue + symbol + one word. The
  catalog sentence is spoken, never printed. Never a filled slab. "Urgent" only when the
  deadline is within 7 days or passed (enforced in core).
- "No warning signs found" is spoken first but shown last, as a small `--ink-2` line with the
  plain `Shield` glyph. Never a box, never green.
- A fact's value is its own button (tabular bold, trailing `Search` glyph); tapping it opens the
  original message with that fact highlighted.
- The bottom dock is sticky, edge-to-edge on `--ground`, with safe-area padding; content always
  rests above it. No rounded floating tray.

## Motion

- One authored moment: the active spoken section brightens its tint and grows a 4px ink bar
  on its inline-start edge that fills as the sentence plays (progress, not decoration).
  200ms ease-out in, 120ms out.
- Everything else is instant. `prefers-reduced-motion`: no fill animation, the bar shows full.

## Voice and copy

- Copy comes from the phrase catalog (`packages/core/src/catalog.ts`), never hard-coded.
- Controls name their action ("Take a photo of a message", "Call"). Never "Get started",
  "Learn more", "Submit".
- Every button speaks its own name on long-press; in listen-first mode, on first tap
  (second tap acts).
- Never say "safe". Never use the word "AI" in the interface.

## Browser surfaces

Theme selection, caret, focus ring (3px `--focus`, 2px offset), scrollbars and tap highlight
(`-webkit-tap-highlight-color: transparent` plus a visible pressed state).

## Bans (from the taste and impeccable skills, applied to this product)

Eyebrow labels; emoji as icons; gradient text; cards with icon in a tinted circle as structure;
hairline dividers everywhere; monospace as costume; "01/02/03" numbering; floating blurred nav;
hover-lift; fade-up on every block; centred everything; placeholder lorem ipsum; invented stats.
