# Improvement loop

An automated loop works through this list from 2026-11-08 to 2026-11-10 (UTC). Each run takes the first
open item, ships it as one PR that must pass CI before it is merged, and adds a line to the log at the
bottom. People can reorder, add or strike items at any time; the loop re-reads this file every run.

## Rules every run follows

- One focused change per PR, branch `loop/<short-name>`, merged only when GitHub CI is green. Check the real
  run (`gh api repos/NotaNovice-Group/sabitori/commits/<sha>/check-runs`); the local gate does not download the
  Piper voices, so it can pass where GitHub fails.
- If GitHub Actions cannot start ("an Actions budget is preventing further use"), the gate is
  `scripts/ci-local.sh` (the same steps as `ci.yml`, Android build included). Merge only when every step
  prints PASS, and paste its output into the PR as a comment. Any other CI failure must be fixed.
- Never touch signing keys, secrets, release tags or `.github/workflows/release.yml` secrets handling.
- Never write a number into docs that was not produced by a run in this repository; never claim users,
  partners, pilots or recordings that do not exist. `[OWNER]` placeholders stay until the owner fills them.
- After any change to rules or lexicons, re-select the encoder thresholds on train
  (`node packages/understand/eval/run-encoder.mjs --select-threshold --write`), regenerate the results, and keep the
  change only if the unseen set does not get worse. `packages/understand/test/thresholds-protocol.test.ts` fails if
  the shipped thresholds differ from what the selection picks.
- After regenerating results, run `node scripts/numbers.mjs` (`docs/numbers.md`, the page to quote from; a test
  fails if it is stale).
- Never weaken a safety rule (facts from code only, never "safe", scam warnings first) to make a test pass.
- After editing any document, run `node scripts/owner-todo.mjs` (keeps `docs/OWNER-TODO.md` line numbers right).
- Owner instruction (2026-11-17): proceed with implementation every time there are open todos; do not stop to ask.
  The Mozilla deadline is Fri 20 Nov; prefer items that strengthen the application.
- If an item is blocked twice, mark it `blocked:` with the reason and move on.
- When the list is empty, find the next real bug or gap (failing edge case, accessibility issue, slow path,
  missing test) and add it here before working on it.

## Backlog (top first)

- [x] **Release workflow without secrets.** `release.yml` now stops in its first step, naming the missing
      signing secrets, instead of after a full test and build. (An unsigned release APK artifact was dropped:
      it cannot be installed; CI already uploads the debug APK.)
- [x] **End-to-end tests of the built app.** `apps/app/e2e/flows.spec.ts` (`pnpm e2e`, in CI and
      `scripts/ci-local.sh`): first run, pasted bill to full card, facts-only card, two scam examples (warning first
      on screen and first in speech, no money section), offline after load, no request to another host, delete.
- [x] **End-to-end: reminders and photo capture.** Web reminder downloads an .ics with the deadline; a rendered
      bill photo goes through on-device OCR to a card with the right amount (about 4 s headless). Native reminders
      need a device: covered by unit tests only.
  Was: Reminder set and cancel on a card with a deadline; a photo
      through OCR to a card (slow: keep it in a separate, tagged test).
- [x] **Web: network lost while the model downloads.** The encoder and the Piper worker now fetch the
      onnxruntime wasm themselves and hand it over, so a failed download is a normal error (rules and the phone's
      voice answer) instead of an uncaught abort; both retry later (the encoder also when the browser comes back
      online). Covered by a unit test and an e2e test that blocks the wasm.
- [x] **Fact extraction fuzzing.** `packages/core/test/fuzz.test.ts`: 1,500 seeded noisy inputs (no throw, exact
      spans, real dates, whole positive amounts, E.164 phones), 300 through the whole pipeline, 10 pathological
      inputs under 3 s each, 400 OCR-style bill variants. Found and fixed: "18 450,00 FCFA" (all-zero minor unit)
      was not read; real decimals ("15,50") are still refused. Rules eval unchanged.
- [x] **Rules accuracy.** Errors studied on the TRAIN split only; the unseen set was measured, never inspected.
      Rules now use the 7-day urgent window of the labels and the card; information notices stay `info`; more fr/en
      action phrases. All three right, rules alone: test 44.8% -> 51.0%, unseen 25.0% -> 30.0%; encoder + rules:
      test 69.8% -> 75.0%, unseen 41.0% -> 46.0% (regenerated with `run-rules.mjs`, `run-encoder.mjs`, `model-card.mjs`).
- [x] **Re-select encoder thresholds after the rules change.** Done on train OOF only: kind 0.85, action 0.6,
      urgency 0.85. Encoder + rules: test 75.0%, unseen 44.0% (46.0% with the old thresholds; not used to choose).
      Grant draft numbers still to update (owner's Claude Doc).
  Was: `run-encoder.mjs --select-threshold` (train OOF only)
      now prefers different action/urgency thresholds; re-select, sync `apps/app/public/models/minilm/heads.json`,
      re-run the published results. Also update the grant draft's numbers (owner's Claude Doc) afterwards.
- [ ] blocked: **Pidgin reading words.** A draft lexicon was written (branch `loop/pidgin-reading`, train-split Pidgin
      all-three 11/33 -> 23/33) but is NOT merged: words written without a native speaker would read as bypassing
      the community. Needs two native speakers to review it first; then merge and re-run the published results.
- [x] **Scam detection breadth.** `packages/core/test/scam-breadth.test.ts`: nine fr/en scam patterns (fake
      transfer, prize fee, account block, fake agent, fake power-cut payment, job fee), each with the real message it
      imitates. Found and fixed: a genuine one-time-code SMS ("Your MTN MoMo confirmation code is 482913") was
      rated likely scam because the secret phrase itself counted as the asking verb. Scam level on the eval sets
      unchanged (test 94.8%, unseen 92.0%).
- [x] **Pilot counter (off by default).** `VITE_PILOT=1` builds count, on the phone only and per ISO week, messages
      explained by source, facts-only cards, scam warnings, listens, reminders and practice; Settings shows the totals
      with Share and Reset (`apps/app/src/lib/pilot.ts`, docs/impact.md "Pilot build"). No message content is stored.
- [x] **Voice training recipe.** Done: `packages/speech/train-voice/` (README, `voice-tool.ts dataset|check`, tests).
  Was: `packages/speech/train-voice/`: documented, reproducible steps and scripts to
      fine-tune a Piper voice with `phoneme_type: "text"` from a Recorder export, plus a check that the result
      loads in the app's Piper runtime. No trained voice is claimed.
- [x] **Low-end phone performance.** `apps/app/bench/perf.mjs`: start, pasted bill to card, model download, heap,
      JS size, at 1x and 4x CPU throttle. Slowest was the first card (word-list regexes compiled for words not in the
      message); a literal prefilter in `text.ts` cut it from 3.4 s to 1.3 s at 4x with identical results. Numbers in
      `docs/model.md`, "App start and card time". Time to first audio was already measured (Voices, Measurements).
- [x] **Accessibility sweep.** (PR #19: axe-core WCAG 2.1 AA on 8 screens, both themes, 200% text.)
  Was: Screen-reader order, focus after navigation, 200% text, reduced motion, colour
      contrast in both themes; add the cases to the a11y test.
- [x] **Recorder robustness.** Found and fixed: when a call or another app took the microphone, the recorder
      stopped by itself and `stop()` waited forever for an event that had already fired (stuck on "saving"). Now a
      lost microphone, leaving the page, or 30 s without pressing stop end the recording, keep what was recorded and
      say why; an empty recording counts as silent (`apps/recorder/test/mic.test.ts`). Full storage and older exports
      were already covered (`review3.test.ts`).
- [x] **OCR: school-fee tables.** School notices were the weakest document type (33% of facts): Tesseract skipped
      the text inside ruled tables. `eraseRules` (tables only, thin lines with paper on both sides) lifts fact recall
      75.0% -> 83.6%, precision 97.2% -> 97.5%, pages fully right 16 -> 20 of 30, school 33% -> 64%, no type worse.
- [x] **Real-message evaluation ready for the pilot.** `eval/anonymise.ts` drafts anonymised rows from consented
      messages (phones to fictional ranges, reference numbers re-drawn, amounts/dates/codes kept, possible names listed
      for the two reviewers); `run-rules.mjs --split=real` and `run-encoder.mjs --data` score `messages.real.jsonl`.
- [x] **Demo video shot list.** `docs/video-script.md`: a two-minute, one-take script using only what the app does today
      (offline, scam warning first, photo to card, fact source, reminder, listen-first), with what not to claim.
- [x] **Scam false alarms and an impersonation gap (train split only).** A utility's switchboard (fixed line, named
      sender) no longer counts as "call this number"; "will be closed" threatens only an account, line or SIM;
      "félicitations" alone needs a fee in the same sentence; an ALL-CAPS organisation prefix from a mobile number is
      sender_mismatch. Train: false alarms 6/157 -> 0/157, misses 4 -> 3 (one is Pidgin, blocked). Test: warnings
      21/22 -> 22/22, false alarms 3/74 -> 0/74. Unseen unchanged (17/21, 2/79).
- [x] **Action words (train split only).** Receipts and notices with nothing to do (credited, approved, renewed, holiday
      greetings, maintenance) and payment demands worded "send {amount}", "rembourser", "approvisionner votre compte"
      were "unclear". Rules alone, all three right: test 51.0% -> 59.4%, unseen 30.0% -> 34.0%. Encoder + rules:
      test 75.0% -> 76.0%, unseen 44.0% -> 47.0%. A "send it back" scam is now action pay; its card still warns
      first and never says to pay (new test).
- [x] **OCR letters inside numbers.** `fixOcrDigits` (facts.ts) reads O/l/I/| as digits only where the number is not
      in doubt (between digits, a thousands group, a date part), keeping offsets and the original `raw`; a leading
      confusable ("l5 000") is still refused. Encoder + rules, test: 76.0% -> 77.1%; unseen and photos unchanged.
- [x] **Thresholds re-selected after the action-word change (#31).** The rules changed, so the train out-of-fold
      selection now picks action 0.75 (was 0.6); the shipped heads.json is brought back in line with the documented
      procedure. Encoder + rules all-three: test 77.1% -> 75.0%, unseen 47.0% (unchanged). An overdue-deadline urgency
      rule was tried in the same run and dropped (no held-out gain; it would have moved thresholds again).
- [x] **Threshold protocol guard.** A test fails when heads.json differs from train-only selection (the #31 slip).
- [x] **One command to check every number.** `pnpm reproduce [--ocr]` re-runs all evaluations and reports whether the
      committed results came out byte-identical (OCR: accuracy columns). README "Check our numbers".
- [x] **Accessibility statement.** `docs/accessibility.md`; the full audit script could not run on a fresh install
      (`@axe-core/playwright` missing): added, re-run on today's code, 163 states, 0 violations.
- [x] **Scripts run on any machine.** Nine browser scripts (benchmarks, audit, screenshots, icons) hard-coded this
      container's Chromium path; `scripts/chromium-path.mjs` uses $CHROMIUM, else a preinstalled one, else Playwright's own.
- [x] **English path in the browser tests.** Every flow test ran in French; a new e2e test checks an English bill card
      (English text, amount in English words, no French leaking) and that an English scam card warns first.
- [x] **Appointments are ON a date.** A card whose task is to go somewhere said "Do it by {date}"; it now says
      "Be there on {date}" / "Présentez-vous le {date}" (new phrase `deadline.on`, draft until a speaker reviews it).
- [x] **Appointment time.** A time written right after the date ("le 20/11/2026 à 9h00", "at 9:30") is read into
      `card.deadlineTime` (checked against the text) and spoken for places to go: "Présentez-vous le vingt-deux
      novembre à neuf heures" / "Be there on ... at nine o'clock" (number slots; phrases draft; recorded packs fall back).
- [x] **Reminders at the appointment time.** With a time on the card, the reminder on the day comes two hours before
      (not before 06:00, always before the appointment) and the calendar file is a timed event with a 2-hour alert.
- [x] **Appointment time on screen.** The date on the card shows the time too ("dimanche 22 novembre, 09:00").
- [x] **Named senders.** A sender the phone shows as a name but not on the official list was "we do not know who
      sent this"; it is now said as a claim ("This message says it is from Hôpital Régional"), never as "is from".
- [x] **Probe: ambiguous words.** Fresh probe messages (not eval data) showed "retrait" (collecting a document read as
      mobile money), "pension" (a CNPS pension read as school fees) and planned outages read as urgent tasks. Specific
      wording instead of the bare words; outage words as nothing-to-do. Thresholds unchanged after re-selection.
      Unseen all-three, encoder + rules: 47.0% -> 49.0% (rules alone 34.0% -> 35.0%); test unchanged.
- [x] **Probe 2: sent receipts.** "Vous avez envoyé / You have sent ..." mobile money receipts were "unclear"; now
      nothing to do. Eval unchanged (no such messages); thresholds unchanged. Other probes (loan, job, SIM-swap, fake
      police scams; GCE slip; vaccine reminder) read as intended.
- [x] **Probe 3: court summons.** "Cité à comparaître à l'audience du ... à 8h30" had no action; court-appearance words
      join go_to_place (fr/en), so the card says when to be there. Thresholds re-selected (action 0.75 -> 0.65):
      encoder + rules test 75.0% -> 77.1%, unseen 49.0% unchanged.
- [x] **Probe 4: formats.** "tomorrow at 3pm" (12-hour times) is now read; a notice that asks for nothing (a planned
      water cut) said "Do it by {date}", now "It is on {date}" / "C'est le {date}" (new phrase `deadline.date`, draft).
- [x] **Start dates.** "Collect your slip from Monday 23rd November" said "Do it by": a date right after a start word
      (from, à partir du, dès le) is now spoken "From {date}" / "À partir du {date}" (new phrase `deadline.from`, draft).
- [x] **Probe 5: amounts.** With a late fee next to the deadline ("Pénalité de retard 720 FCFA si paiement après le
      05/12"), the card showed the penalty instead of the bill (2 of 7 multi-amount probes). New lexicon field
      `penaltyWords`: such amounts are never chosen unless all are. Also "Frais: 1ère tranche" no longer yields an amount
      of 1. Eval, thresholds and the OCR benchmark reproduce unchanged.
- [x] **Probe 6: which date.** A moved appointment ("du 20/11 reporté au 27/11", "moved to 25 November") gave the OLD
      date; new lexicon field `rescheduleWords` makes the new date win (with its time). "jusqu au" without apostrophe is
      a deadline word. Issue dates, periods and receipts already lost to the due date. Eval reproduces unchanged.
- [x] **Probe 7: contacts.** A short bill ("ENEO: Facture 15 000 FCFA avant le ...") fell to facts only (action unclear);
      "facture {n}" / "bill {n}" are pay words now. "Call me back urgently on 650 ..." from an unknown mobile got no
      warning; "urgently" is a time-pressure word. The rule that a merely claimed company never hands out a mobile
      number as its help line is kept (test). Headline results unchanged; paired counts regenerated.
- [x] **Probe 8: false alarms.** A delivered one-time code that says it "expires in 5 minutes" got a caution (time
      pressure). Expiry wording no longer counts in a message that delivers a code; asking for the code, or other rush
      words, still do. A link or a menu code from an unverified sender stays a caution (labelling rule). Scam eval unchanged.
- [x] **Probe 9: missed scams.** Family emergency with a "broken phone" ("mon téléphone est gâté, envoie vite"),
      advance fee ("$2 million to send you ... small fee") and credential phishing ("entrez vos identifiants") were missed
      or under-warned; scam words added (fr/en), genuine twins tested. Unseen scams warned 17/21 -> 18/21, false alarms
      unchanged (2/79); train/test unchanged; thresholds unchanged.
- [x] **One page of numbers to quote.** `docs/numbers.md`, generated from the result files by `scripts/numbers.mjs`,
      checked by `pnpm reproduce` and a test; README points to it.
- [x] **Probe 10: English-region notices.** "Second term starts on Monday 4 January" was a deadline ("Do it by");
      start words now include starts/begins/reopens on, débute/commence/reprend le, rentrée le. A CDC water cut for
      maintenance fell to facts only; English and French outage wording joins nothing-to-do. Eval unchanged.
- [x] **Probe 11: SMS-style French.** "rdv ... svp venir" is a place to go; "pr travaux ... desole pr la gene" asks for
      nothing. Tried and dropped: "tel"/"contact" as contact words, which cleared a landlord's rent reminder but let
      "Félicitations! Envoyez 10 000 FCFA de frais. Tel 677..." through. The landlord case stays flagged (known
      trade-off, test documents it). Eval unchanged.
- [x] **Probe 12: forwarded hoaxes.** "The government offers 50 000 FCFA aid ... pay 2 000 FCFA fees" got only a caution
      (link); aid/grant wording joins the prize words, so aid-for-a-fee is a likely scam; a real aid announcement stays
      quiet (test). Chain letters ("forward to 15 contacts") stay without a warning: harmless, and no honest signal fits.
- [x] **Speed claim re-checked.** On today's (slower) container the term prefilter saves about a quarter (2.08 -> 1.56 s
      at 4x with the model loaded), not 2.6x; no regression from the words added since. docs/model.md, numbers page and
      changelog now say so.
- [x] **Times as people say them.** A render sweep (all examples and new phrases, fr/en, no leaked placeholders) found
      "at fifteen o'clock" in English. Afternoon/evening times now use the 12-hour clock with the part of the day:
      "at three p.m.", "à trois heures de l'après-midi", "du soir" (four new draft phrases).
- [x] **Invitations.** "Venez nombreux", "sont invités", "all members are invited", "présence obligatoire" are a place
      to go, so a church vigil or a parents' meeting says when to be there. Eval and thresholds unchanged.
- [x] **Facts-only dates.** A facts-only card (the app did not understand what is asked) said "Do it by {date}" for any
      date; it now says "by" only when the message puts a deadline word before the date, else "It is on {date}".
- [x] **Browser test for today's dates.** One e2e test checks, in the built app, the appointment time on screen and in
      speech, a moved appointment's new date, and a start date that is not a deadline.
- [x] **Cards for the benchmark documents.** A test reads the 30 OCR-benchmark documents (bills, school-fee notices,
      hospital letters, mobile-money receipts) from their true text and checks the card's amount, date and appointment
      time. All 30 right today; any later change that breaks a fact choice on a real-shaped document fails it.
- [x] **Docs and OWNER-TODO tidy.** Changelog and this log brought up to date after #16-#25; OWNER-TODO regenerated.
- [x] **Annual totals on photo cards.** Measured the card itself on the 30 OCR'd benchmark photos (not just the
      facts): the amount shown was wrong on 4 pages, 3 of them school notices showing the annual total instead of the
      instalment due. An annual total (`annualTotalWords`) is now the amount only when it is in the deadline's clause,
      otherwise the card shows the instalment, or no amount if the total is all that was read. Amount right 26/30 -> 27/30, wrong 4 -> 2 (both OCR
      misreads: "Total annvet", 13 280 for 13 250); dates unchanged (25 right, 0 wrong). Understanding results unchanged.
- [x] **OCR-garbled month names.** Of the 5 photo cards with no date, one lost it to a garbled month ("27 noveribwe
      2026"). The fact reader now reads a word close to a month name between a day and a 4-digit year (edit distance 2
      for 7+ letters, 1 for 6, "rn"/"ri" read as "m"; never for short names or when two months are as close). Photo
      fact recall 83.6% -> 84.3%, precision 97.5% unchanged; understanding results byte-identical. The other 4 are
      text OCR never returned (day missing, year read as 6026).
- [x] **"You sent money" receipts are not a call trap.** Run over the 30 genuine benchmark photos, 4 mobile-money
      "Vous avez envoyé ... à SAMUEL FOTSO (677465100)" receipts got a caution: the person paid was read as a number
      the message asks you to call. A number close after the "sent" words (`scam.moneySent`, fr + en), in the same
      sentence with no call or pay word between, is now excused like a "reçu de" sender. False cautions on the photos
      7 -> 3 (OCR) and 9 -> 5 (true text); the 5 left are CAMWATER bills with a mobile "service clientèle" number,
      kept on purpose until the official helplines in regions/CM/region.json are confirmed. Scam results on the test
      and unseen sets unchanged; tests keep "call this number" and "sent by mistake" scams warning.
- [x] **Probe 13: "send money to this number".** 14 new messages (9 scams, 5 genuine). Missed: "I am stranded ...
      send 20,000 FCFA to this number" from a mobile number (no number written, so `pay_to_personal_number` never
      fired), a "invest 50 000, receive 200 000 in 7 days" scheme, and a marabout advert (no money asked; left).
      Money + a send word + "this number"/"ce numéro" (`scam.thisNumberWords`) in one sentence, from an unverified
      mobile number, is now `pay_to_personal_number`. Unseen scam level 92.0% -> 93.0% (warned 18/21 and false alarms
      2/79 unchanged; train and test no new false alarm). All 5 genuine probes stay clean.
- [x] **Investment-doubling scams.** New signal `promised_return` (strong): "invest/placez X ... receive/récupérez
      Y" with Y at least 1.5 x X, or a stand-alone promise ("doublez votre argent", "guaranteed profit"); words in
      `scam.investWords`, `gainWords`, `returnPromises` (fr + en). A verified name does not excuse it. "Cotisez",
      "misez" and "stake" left out (tontines, licensed betting). Phrase `scam.signal.promised_return` is draft until a
      speaker reviews it. Train/test/unseen scam results unchanged (no false alarm added); tests cover tontine,
      savings and school-fee look-alikes.
- [x] **One-minute demo video, reproducible.** `apps/app/bench/demo/` (record.mjs, stage.html, assemble.py) records
      the built app driven by script: pasted bill spoken in English, scam warned first, bench photo 04 read to a card.
      60 s at 1920x1080 for a voice-over; the only edit is a ~3 s cut of the OCR wait, stated in docs/video-script.md.
- [x] **Redesign and picture card.** New visual world (DESIGN.md: warm paper, brand green, saffron listen; guided by
      the impeccable craft floor and taste rules: no side bars, no hyphenated words, one icon system). Picture card
      for deaf and non-reading users (action symbol, calendar page with days left, CFA notes and coins; stop sign only
      on a scam) and vibration on scam cards. Unit tests for the picture helpers; a11y and e2e re-run in the gate.
- [x] **Probe 14: Cameroon scam patterns.** 59 new messages (36 scams, 23 genuine look-alikes; fr, en, Pidgin) in
      `packages/core/test/probe14-scams.test.ts`. Before: 6 scams under-warned (5 no warning: army recruitment fee,
      SONARA "frais de dossier ... contact 677", stranded-abroad romance, Pidgin accident, "forward me the code I sent by
      mistake"; 1 caution only: "reply with the code you will receive") and 4 genuine flagged (job advert "envoyez
      votre CV au 677", an operator's warning about the code trick, a tontine "sur ce numéro", a results notice with a
      link). Fixed 8 of 10: all 36 scams warn (romance as a caution); two new signals `offer_fee` (strong) and
      `distress_money` (caution), draft phrases; job adverts and operator warnings clean. Left, documented in the test:
      the tontine "send to this number" (same words as the probe-13 scam) and the link caution (labelling rule). Rules
      eval unchanged: train warned 64/67, false alarms 0/157; test 22/22, 0/74; unseen 18/21, 2/79 (scam level 93.0%).
      Thresholds unchanged (kind 0.85, action 0.65, urgency 0.85); `pnpm reproduce` byte-identical.
- [x] **iOS project.** `apps/app/ios` (Capacitor 8, Swift Package Manager), Info.plist camera/photo texts, reminders
      no longer call the Android-only notification channel on iOS, settings link uses `app-settings:` on iOS, an
      unsigned simulator build workflow (`.github/workflows/ios.yml`) and `docs/ios.md`. Not built or run on a Mac,
      simulator or iPhone yet (this machine is Linux); share-sheet intake is Android-only for now.
- [x] **Card loading state.** For about 0.75 s while a card was prepared the screen showed only "Show someone" and
      "Delete" (seen in the demo recording). It now shows the card's shape (skeleton, static with reduced motion) and
      the footer buttons appear with the card.
- [x] **Landing page.** `site/` (static, no build): what it does, demo video, scam warnings first, who it is for,
      privacy, languages, test numbers with their limits, open source. Screenshots of the redesigned app (English, 2x)
      and the 60 s demo; `site/_headers` and `docs/site.md` for Cloudflare Pages (owner connects the repository).
      axe-core WCAG 2.2 AA: 0 violations at 1440 and 390, light and dark.
- [x] **Accessibility audit after the redesign.** `node apps/app/scripts/a11y.mjs` re-run on the redesigned app with the
      picture card: 163 screen states, WCAG 2.2 AA plus manual-class checks, 0 violations, 0 failures.
- [x] **Browser test for the picture card.** In the built app: a bill shows the pay symbol, the date and notes; a
      scam shows only the stop sign (no pay symbol, money or date) and vibrates three long pulses; a bill does not
      vibrate. Pictures stay hidden from screen readers.
- [x] **Dark mode pass on the redesign.** The scam stop sign and scam icon turned pastel salmon in dark mode (the dark
      urgent text colour); they now use a solid stop red (`--stop`) with a white symbol in both themes. Settings'
      language rows left a large gap (play button wrapped under the name); names are one size smaller there, the
      button stays beside them, and no name is cut mid-word.
- [x] **Scam screenshots through the photo path.** Scams are often forwarded as WhatsApp screenshots. A browser test
      renders a prize-fee SMS as a phone screenshot, reads it with on-device OCR, and checks the card: likely scam,
      warning first, no money section, no paying or money picture, no request to another host.
- [x] **Vibration works in the Android app.** The scam vibration (#70) called `navigator.vibrate`, which the Android
      web view ignores without the VIBRATE permission; the manifest had none. Added (normal permission, no prompt);
      privacy policy section 6, Data safety notes, release checklist and ARCHITECTURE updated. Not yet felt on a
      phone (no device here).
- [x] **Picture card on a caution.** A caution (for example a water bill whose customer-service number is a mobile)
      showed the same full-width stop sign as a likely scam and hid the bill. It now starts with an amber warning tile,
      and every picture follows the card's own sections: no money or date picture when the card does not say them, no
      action picture when the action is unclear. Browser test on a CAMWATER caution.
- [x] **Scam rows in the message list.** A likely scam was listed like a bill: its amount ("FCFA 5,000") and date
      beside it, which reads as "pay 5,000 by then". The row now shows the red stop sign as its picture and no amount
      or date; caution and ordinary rows unchanged. Browser test.
- [x] **Landing screenshots follow the app.** `site/img/home.png` still showed a scam listed with its amount (fixed in
      #81); all five landing screenshots retaken from the current build (English, 2x); only the home screen changed.
- [x] **Claimed sender in the message list.** A pasted or photographed ENEO bill was listed as "Unknown sender" though
      its card says "This message says it is from ENEO". The row now reads "Says: ENEO" / "Dit : ENEO" (a claim, not
      a fact). A likely scam keeps "Unknown sender" so the list never repeats a scam's claim. Browser test.
- [x] **Probe 15: public-service messages.** 12 genuine messages of kinds not probed before (vaccination campaign,
      voter registration, census, court summons, tax, pension, birth certificate, school reports, internet renewal,
      hospital appointment, school closure, operator bonus). 3 misreadings fixed: "Amenez vos enfants au centre"
      and "Présence des parents obligatoire" were "unclear" (now go to a place; go_to_place words fr/en); a pension
      "disponible à partir du 25 novembre" was urgent because the start date was near (a near start date no longer
      makes a card urgent unless urgent words say so). Train/test/unseen unchanged; thresholds unchanged.
- [x] **Probe 16: English official messages.** 10 messages as written in the North-West and South-West (bills, water
      cut, antenatal visit, school fees, nets campaign, bank debit, business tax, data bundle, university, pharmacy).
      2 misreadings fixed: "must be paid by" was "unclear" (pay words fr/en: "must/to/should be paid", "doit/doivent
      être payé(e)(s)", never a bare "be paid", which a pension "will be paid" would match); a late fine that is only
      a consequence ("attracts a fine of 10,000 FCFA") was shown as the amount (when every amount is a penalty, one is
      shown only if a pay word is in its clause). Rules alone: test 60.4% -> 61.5%, second unseen set 44% -> 45%;
      encoder + rules unchanged on every set; thresholds unchanged (0.75 / 0.7 / 0.75 after the owner's retrain).
- [x] **"5 mille" is an amount.** 17 ways people write amounts probed: standard forms all read; "5 mille" (how
      people write 5 000 FCFA in an SMS, common in "send money" scams) was not an amount, so "Envoie-moi 15 mille sur
      ce numéro" had no money fact. `thousandWords` (fr: mille, milles): 1-3 digits (one decimal) before it, with or
      without a currency. "10k" and amounts in words ("cinq mille") left out (ambiguous / rare). Every evaluation
      unchanged, OCR benchmark included; thresholds unchanged.
- [x] **"Avant fin novembre" is a date.** 17 date forms probed (5/12, 05-12-2026, 5 déc., 5th December, Dec 5th,
      d'ici vendredi, 1er décembre, 05/12/26, 5.12.2026, jusqu'au 31/12, until 31st Dec...): all read except "fin
      novembre" / "end of November", common on bills and school notices, which gave no date. `monthEndWords` (fr: fin,
      fin du mois de, fin de; en: end of, the end of) + a month name = its last day (leap years too). Every evaluation
      unchanged, OCR benchmark included.
- [x] **Phones and several dates probed; "fixé au" moves a date.** 15 phone forms (+237, 00237, dashes, dots,
      brackets, landlines, two numbers with a slash) all read, and the two invalid ones (leading 0, one digit short)
      are refused. 8 messages with several dates: 7 right; "initialement le 20/11, il est fixé au 27/11" chose the old
      date. Reschedule words added (fr: fixé(e) au, désormais le/au, désormais lieu le, reprogrammé(e) au; en: now set
      for, will now be on, will now hold on). Every evaluation unchanged, OCR benchmark included.
- [x] **Landing page numbers generated.** The landing page still quoted 51.0% on the second unseen set after the
      owner's retrain moved it to 57.0% (and its rules-alone and p values). Its understanding and scam rows are now
      written by `scripts/numbers.mjs` between markers, from the same result files as docs/numbers.md, and checked
      by `numbers.mjs --check` and `pnpm reproduce`. Links in genuine official messages were also probed: every link
      is a caution by design (labels), and allowing official sites needs confirmed domains (owner), so unchanged.
- [x] **Pidgin pack passes the update checks; main green again.** The owner's Pidgin commit put 156 app screen strings
      (`app.*`) in packs/wes/phrases.json. scripts/check-packs.mjs allows that, but the shared validator
      (`packages/speech/src/validate.ts`, used by the update publisher and the pack registry) refused every `app.*`
      key, so the connect tests (publish round trip, content validation) failed on main and the publisher refused to
      publish. `app.*` entries are now accepted as plain texts (shape and status checked; check-packs still checks
      the key list and slots). Unit tests (every repo pack validates) and a browser test (Pidgin home screen shows
      the pack's own words). The pack registry runs the same validator, so before this fix the app could not load the
      Pidgin pack and fell back to English/French silently (an engine test that expected the fallback now sees the
      Pidgin text; it moved to a pack that really has no rules). Also: `pnpm reproduce` was not byte-identical on main (urgency threshold table from the
      retrain); regenerated, headline numbers unchanged.
- [x] **Pidgin cards checked end to end.** With the Pidgin pack now loading (#89), a bill card and a scam card were
      rendered in Pidgin: every section is said in Pidgin ("This message look like wayo. No send money..."), the
      warning comes first and a scam card has no money section. Engine regression test. The Pidgin wording is the
      owner's draft and still needs a native speaker's review.
- [x] **Photo cards measured and published.** `packages/understand/eval/run-photo-cards.mjs` scores the card a person
      sees on the 30 OCR-benchmark photos (shipped OCR text, rules path) against each photo's amount due and deadline,
      and the same photos' true text: amount 27/30 right (2 wrong, 1 not shown), date 21/25 dated pages right (0 wrong,
      4 not shown), 0 genuine photos warned as a likely scam; true text 30/30 and 25/25. Written to
      `results/cards.json`, quoted in docs/numbers.md, re-run and checked by `pnpm reproduce`.
- [x] **Landing photo row generated, with the card numbers.** The landing page's photo row (fact recall and
      precision) is now generated with the understanding and scam rows, and adds what the card shows: right amount on
      27 of 30 photos, right date on 21 of 25, wrong and not-shown counts, no false likely-scam.
- [x] **Probe 17: scams in SMS shorthand.** 9 messages (6 scams, 3 genuine) in the shorthand people really text
      ("stp envoi 15 000f sur ce num", "pls send 5000 frs to this nbr", "snd me 10 000 for dis numba 677..."). 1 scam
      unwarned, 2 only a caution. Added: shorthand "this number" words (fr: ce num, ce no, ce nmr, ce nbr; en: this
      num/nbr/numba, dis number/numba/num/nbr), "snd" as a send word, and a number grouped in thousands right after a
      send or pay word as an amount without a currency ("envoie-moi 15.000"; never a year, a bare 3-digit number, a
      phone or a distance). All 6 now likely scam; genuine shorthand stays clean. First unseen set scams warned
      18/21 -> 20/21, false alarms 2/79 unchanged; no new false alarm on any split; second unseen set unchanged;
      thresholds unchanged; OCR benchmark unchanged.
- [x] **How it works, in pictures, on the empty home screen.** A first-time user who does not read saw only text.
      The empty state now starts with three picture tiles: camera -> card -> speaker (the picture card's style,
      hidden from screen readers, which hear the same steps). App-side only (the owner's open #93 touches the core).
- [x] **"Who sent it?" in pictures.** The Paste screen's sender choices were words only. Each now has a picture
      (building = a name, phone = a number, question mark = I do not know); the chosen one keeps its check beside the
      picture, never colour alone. `SegOption.icon` is optional, so the Settings choices are unchanged.
- [x] **Settings choices in pictures.** On/off (switch on, switch off), voice speed (rabbit, turtle, snail) and how
      long messages are kept (calendar of a month, of a week, crossed calendar) now carry pictures, as the Paste
      sender choices do (#96); the chosen one keeps its check.
- [x] **Practice examples in pictures; screen titles keep their words whole.** The practice list now shows each
      example's kind picture (lightning = electricity bill, drop = water, phone = mobile money, gift = prize, heart =
      hospital, cap = school; the prize stays neutral, it is the lesson). Screen titles were split mid-word
      ("d'entraînem / ent") beside the Back and Home buttons: the title is now as wide as its longest word and takes
      its own line when that does not fit; never wider than the screen (200 % text on 320 px: no overflow).
- [x] **Full accessibility audit after the sticky top bar: 194 failures -> 0.** The owner's sticky top bar
      (Home on every screen) made the audit fail 194 manual checks. Two real problems: at large text the bar grew tall
      and covered the content (it now scrolls away when taller than 15% of the screen, like the dock), and content
      scrolled into view could end under it (html `scroll-padding-top` and section scroll margins now use its
      measured height: WCAG 2.2 focus not obscured). The audit now treats content scrolling under the sticky bar like
      under the dock (by design). Practice names at 200 % drop below their picture instead of breaking mid-word.
      Re-run: 163 states, 0 axe violations, 0 manual failures.
- [x] **Landing screenshots follow the app again.** Retaken from the current build (English, 2x): talking-drum mark,
      Home button, "Says: ENEO", stop sign on the scam row, Pidgin in the language list. The owner's demo video is
      unchanged.
- [x] **README up to date, its numbers generated.** The README still said 18 of 21 scams warned on the first unseen
      set (20 of 21 since #94), "French or English" only, and nothing of the picture card, vibration, iOS project or
      card numbers from photos. Its scam and photo sentences are now generated by `scripts/numbers.mjs` (checked by
      `--check` and `pnpm reproduce`), with the photo-card numbers; the first paragraph names the picture card,
      vibration, iOS (untested) and Pidgin (draft); the language table gives Pidgin its beta status.
- [x] **Stale claims swept.** Every decimal percentage in the docs and the landing page now comes from a generated
      block. The video shot list still said "French and English only": it now says Pidgin is a draft needing a native
      speaker, and shows the picture card and the scam stop sign and vibration in two existing shots.
- [x] **Probe 18: genuine shorthand money talk.** Probe 17 read a thousands-grouped number after "send/envoie" as
      money; 8 genuine family, school and tontine messages that talk about sending money (past tense, someone else
      sending, a receipt, a reminder) were checked: no warning on any. Permanent test. Main also checked after the
      owner's fine-tuned encoder (#93): `pnpm reproduce` byte-identical.
- [x] **Speed re-measured after the fine-tuned encoder.** `apps/app/bench/perf.mjs 4 5` on today's main: card tapped
      at once 2,454 ms and 2,098 ms (two runs of 5), 1,773 ms once the model has loaded. The quoted range was "1.3 to
      2.3 s": now "1.3 to 2.5 s", in docs/numbers.md (generated), the landing page and docs/model.md. Not a phone.
- [x] **iOS privacy manifest.** The App Store requires `PrivacyInfo.xcprivacy`; the iOS project had none. Added and
      bundled (project.pbxproj resources): no tracking, no tracking domains; optional error reports declared as crash
      data, not linked, not tracking; UserDefaults with reason CA92.1. docs/ios.md App Store steps point to it. Not
      built in Xcode here (Linux): the iOS workflow or a Mac build will be the first check.
- [x] **Robustness: any input gives a card, quickly.** Empty text, spaces, emoji, a 5,600-character bill, 5,000
      digits, OCR junk, punctuation, 800 amounts, 400 dates, 400 phone numbers: no throw, every one under 60 ms here.
      Permanent test with a 2 s bound. (Also checked: the live landing page at sabitori.pages.dev follows main.)
- [x] **SMS and USSD for phones with no internet (design + prototype).** `docs/sms-ussd.md`: why (Cameroon 17.1 M
      people offline in 2025, Africa ~1 B not using mobile internet, scam losses per INTERPOL, all sourced), how
      (forward an SMS, get the card back; a USSD menu), three network routes (relay phone first: the card is made on a
      local Android phone, offline; short code; USSD code), privacy and owner tasks. `packages/gateway`: `smsReply`
      (the app's card as at most 3 GSM-7 SMS, scam first, no amount on a scam), `ussd` (stateless menu, screens of at
      most 182 characters), a provider-neutral HTTP service that stores and logs no message. 9 tests. Not deployed.
- [x] **Relay build: a phone that answers forwarded SMS, offline.** `SmsRelayPlugin` (receive while relaying, send
      multi-part, screen kept on), a `relay` build type that alone adds RECEIVE_SMS and SEND_SMS (own app id
      `cm.sabitori.app.relay`), `scripts/build-relay.sh`. In the app (relay build only, `VITE_RELAY=1`): a Relay SMS
      screen with counts only, and `lib/relay.ts` (only Cameroonian mobile senders, 5 per number and 60 per hour,
      reply = the app's card through the shared `@sabitori/gateway/compose`). Built here: the relay APK lists the
      two SMS permissions, the store APK none (aapt). Tests: rules, replies, manifests. Not yet on a real phone.

## Log

| Date (UTC) | PR | What changed | Tests |
| --- | --- | --- | --- |
| 2026-11-08 | #5 | Loop plan; fixed a flaky crash-report test (random Sentry ids); `scripts/ci-local.sh` gate | 1,362 passed |
| 2026-11-08 | #6 | `release.yml` fails fast with the names of missing signing secrets | 1,362 passed |
| 2026-11-08 | #7 | Playwright end-to-end tests of the built app (8 flows), run in CI and the local gate | 1,362 unit + 8 e2e passed |
| 2026-11-08 | #8 | Model download cut on the web: quiet fallback and retry instead of an uncaught abort (encoder and Piper worker) | 1,363 unit + 9 e2e passed |
| 2026-11-08 | #9 | e2e: web reminder (.ics) and photo through OCR to a card | 1,363 unit + 11 e2e passed |
| 2026-11-08 | #10 | Fuzz/property tests for fact extraction; amounts written with ",00" are now read | 1,377 unit + 11 e2e passed |
| 2026-11-08 | #11 | Rules: 7-day urgent window, info notices stay info, more fr/en action phrases; published results regenerated | 1,379 unit + 11 e2e passed |
| 2026-11-08 | #12 | Encoder thresholds re-selected on train after the rules change; results regenerated; `scripts/owner-todo.mjs` | 1,379 unit + 11 e2e passed |
| 2026-11-17 | #13 | Scam/twin pairs; a delivered one-time code is no longer flagged as a scam | 1,397 unit + 11 e2e passed |
| 2026-11-17 | #14 | Pilot counter build flag (on-phone counts, participant shares) | 1,402 unit + 11 e2e passed |
| 2026-11-17 | #15 | e2e: scam-first check no longer depends on which voice speaks (GitHub CI bundles Piper) | 1,402 unit + 12 e2e |
| 2026-11-17 | #16 | Honest docs: pack licences, "French or English today", scam recall and OCR error rates next to the headline | 1,402 unit + 12 e2e passed |
| 2026-11-17 | #17 | Reading-lexicon guide for speakers; rules eval can measure a draft list | 1,402 unit + 12 e2e passed |
| 2026-11-17 | #18 | Optional LLM only in `VITE_LLM=1` builds (store APK 8.7 MB smaller) | local gate (Actions budget) |
| 2026-11-17 | #19 | Accessibility sweep: axe-core on 8 screens x 2 themes, 200% text; About overflow fixed | local gate (Actions budget) |
| 2026-11-17 | #20 | CI builds a pilot APK on pushes to main | local gate (Actions budget) |
| 2026-11-17 | #21 | Pilot build: on-phone timing in bands | local gate (Actions budget) |
| 2026-11-17 | #22 | e2e: delete-test race on slow runners fixed; Playwright results uploaded on failure | local gate (Actions budget) |
| 2026-11-17 | #23 | First card 3.4 s -> 1.3 s at 4x CPU throttle (term prefilter, identical results); `apps/app/bench/perf.mjs` | local gate (Actions budget) |
| 2026-11-17 | #24 | Recorder: interrupted recordings no longer hang; 30 s limit; stop when the page is left | local gate (Actions budget) |
| 2026-11-17 | #25 | Voice training recipe and tools (no voice claimed) | 1,426 unit + 37 e2e passed (local gate, #18-#25 together) |
| 2026-11-17 | #27 | OCR: table rules erased before reading; fact recall 75.0% -> 83.6%, school notices 33% -> 64% | local gate (Actions budget) |
| 2026-11-17 | #28 | Real-message evaluation tooling: anonymiser draft tool, `--split=real` | local gate (Actions budget) |
| 2026-11-17 | #29 | Demo video shot list for the application (`docs/video-script.md`) | local gate (Actions budget) |
| 2026-11-17 | #30 | Scam rules: fewer false alarms, bank-prefix impersonation; test warnings 22/22, false alarms 0/74 | local gate (Actions budget) |
| 2026-11-17 | #31 | Action words: unseen all-three 44.0% -> 47.0% (encoder + rules), rules alone 30.0% -> 34.0% | local gate (Actions budget) |
| 2026-11-17 | #32 | Facts: OCR O/l inside numbers read as digits (unambiguous spots only); test all-three 77.1% | local gate (Actions budget) |
| 2026-11-17 | #33 | Encoder thresholds re-selected on train after #31 (action 0.6 -> 0.75); test all-three 75.0%, unseen 47.0% | local gate (Actions budget) |
| 2026-11-17 | #34 | Guard test: shipped thresholds must equal train-only selection; loop rule added | local gate (Actions budget) |
| 2026-11-17 | #35 | `pnpm reproduce`: every published number re-run and compared (byte-identical today) | local gate (Actions budget) |
| 2026-11-17 | #36 | Accessibility statement; a11y audit script fixed (missing dependency) and re-run: 0 violations | local gate (Actions budget) |
| 2026-11-17 | #37 | Browser scripts no longer hard-code a machine-specific Chromium path | local gate (Actions budget) |
| 2026-11-17 | #38 | e2e: English interface (bill card in English, scam warning first); fresh clone verified end to end | local gate (Actions budget) |
| 2026-11-17 | #39 | Appointment cards say "be there on {date}" instead of "do it by" | local gate (Actions budget) |
| 2026-11-17 | #40 | Appointment cards say the time: "Be there on {date} at nine o'clock" | local gate (Actions budget) |
| 2026-11-17 | #41 | Reminders and calendar file use the appointment time (2 h before; timed event) | local gate (Actions budget) |
| 2026-11-17 | #42 | Card shows the appointment time next to the date | local gate (Actions budget) |
| 2026-11-17 | #43 | Named senders said as a claim ("says it is from") instead of "unknown" | local gate (Actions budget) |
| 2026-11-18 | #44 | Ambiguous words (retrait, pension) and outage notices; unseen all-three 47.0% -> 49.0% | local gate (Actions budget) |
| 2026-11-18 | #45 | "You have sent" receipts are nothing to do; second probe round otherwise clean | local gate (Actions budget) |
| 2026-11-18 | #46 | Court summons read as "go to a place" with time; thresholds re-selected; test 77.1%, unseen 49.0% | local gate (Actions budget) |
| 2026-11-18 | #47 | am/pm times read; notices with nothing to do give a date, not a deadline | local gate (Actions budget) |
| 2026-11-18 | #48 | Start dates ("from Monday 23rd", "à partir du") no longer spoken as deadlines | local gate (Actions budget) |
| 2026-11-18 | #49 | Penalties are never the amount to pay; ordinals after a label are not amounts | local gate (Actions budget) |
| 2026-11-18 | #50 | Moved appointments give the new date, not the old one | local gate (Actions budget) |
| 2026-11-18 | #51 | Short bills read as pay; "call me back urgently" lure warned | local gate (Actions budget) |
| 2026-11-18 | #52 | Delivered codes that say when they expire are not pressure (false alarm removed) | local gate (Actions budget) |
| 2026-11-18 | #53 | Family-emergency, advance-fee and credential-phishing scams caught; unseen scams 18/21 | local gate (Actions budget) |
| 2026-11-18 | #54 | `docs/numbers.md`: generated page of every number to quote, kept current by test and reproduce | local gate (Actions budget) |
| 2026-11-18 | #55 | Term start dates and maintenance cuts read correctly (English-region probes) | local gate (Actions budget) |
| 2026-11-18 | #56 | SMS-style French (rdv, pr travaux); landlord-vs-scam trade-off documented | local gate (Actions budget) |
| 2026-11-18 | #57 | Fake government aid that asks a fee is a likely scam | local gate (Actions budget) |
| 2026-11-18 | #58 | Speed claim re-measured on another machine and softened (1.3-2.3 s; gain machine-dependent) | local gate (Actions budget) |
| 2026-11-18 | #59 | Spoken times: "three p.m." / "trois heures de l'après-midi" instead of "fifteen o'clock" | local gate (Actions budget) |
| 2026-11-18 | #60 | Invitations (venez nombreux, are invited) say when to be there | local gate (Actions budget) |
| 2026-11-18 | #61 | Facts-only cards say "by" only when the message does | local gate (Actions budget) |
| 2026-11-18 | #62 | e2e: appointment time, moved appointment, start date (built app) | local gate (Actions budget) |
| 2026-11-18 | #63 | Test: right amount, date and time on the 30 benchmark documents | local gate (Actions budget) |
| 2026-11-18 | #64 | Annual total is not the amount due on photo cards (wrong amounts 4 -> 2 of 30) | local gate (Actions budget) |
| 2026-11-19 | #65 | OCR-garbled month names read between a day and a year; photo fact recall 83.6% -> 84.3% | local gate (Actions budget) |
| 2026-11-19 | #66 | Mobile-money "you sent" receipts no longer cautioned (photo false cautions 7 -> 3) | local gate (Actions budget) |
| 2026-11-19 | #67 | "Send money to this number" from a mobile number warns; unseen scam level 92.0% -> 93.0% | local gate (Actions budget) |
| 2026-11-19 | #68 | Investment-doubling scams warn (new signal promised_return, draft phrase) | local gate (Actions budget) |
| 2026-11-19 | #69 | Reproducible one-minute demo video (real app, scripted; OCR wait cut ~3 s, disclosed) | local gate (Actions budget) |
| 2026-11-19 | #70 | Redesign (warm paper, brand green, saffron listen) + picture card and scam vibration for deaf/non-reading users | local gate (Actions budget) |
| 2026-11-19 | #71 | Probe 14: 59 scam/look-alike messages; job-fee and emergency-money signals, code-theft and SIM-swap code asks caught; eval unchanged | local gate (Actions budget) |
| 2026-11-19 | #72 | iOS project (Capacitor, SPM), iOS-safe reminders/settings, unsigned simulator CI; untested on Apple hardware | local gate (Actions budget) |
| 2026-11-19 | #73 | Card loading skeleton instead of an empty page with Delete | local gate (Actions budget) |
| 2026-11-19 | #74 | Landing page (site/), Cloudflare Pages config, redesigned screenshots and demo video | local gate (Actions budget) |
| 2026-11-19 | #75 | Full accessibility audit re-run after the redesign: 163 states, 0 violations | local gate (Actions budget) |
| 2026-11-19 | #76 | e2e: picture card on a bill; scam shows only the stop sign and vibrates | local gate (Actions budget) |
| 2026-11-19 | #77 | Dark mode: solid stop red for scam signs; settings language rows tidy | local gate (Actions budget) |
| 2026-11-19 | #78 | e2e: a scam SMS screenshot read by OCR warns first and shows no paying | local gate (Actions budget) |
| 2026-11-19 | #79 | Android VIBRATE permission so the scam vibration works in the app; privacy and store docs updated | local gate (Actions budget) |
| 2026-11-19 | #80 | Picture card: amber tile on a caution, pictures follow the card sections | local gate (Actions budget) |
| 2026-11-19 | #81 | Message list: a likely scam shows the stop sign, no amount or date | local gate (Actions budget) |
| 2026-11-19 | #82 | Landing home screenshot: scam row without amount | local gate (Actions budget) |
| 2026-11-19 | #83 | Message list names the claimed sender ("Says: ENEO"), never for a likely scam | local gate (Actions budget) |
| 2026-11-19 | #84 | Probe 15: public-service messages; "amenez", "présence des parents", near start date not urgent | local gate (Actions budget) |
| 2026-11-19 | #85 | Probe 16: English official messages; "must be paid", consequence-only fines not shown as the amount | local gate (Actions budget) |
| 2026-11-19 | #86 | "5 mille" read as 5 000 FCFA (SMS amounts in thousands); evaluations unchanged | local gate (Actions budget) |
| 2026-11-19 | #87 | "Avant fin novembre" / "end of November" read as the last day of the month | local gate (Actions budget) |
| 2026-11-19 | #88 | Phone and multi-date probes; "fixé au" / "now set for" move an appointment | local gate (Actions budget) |
| 2026-11-19 | #89 | Landing page numbers generated from the results (57.0% second unseen set) and checked by reproduce | local gate (Actions budget) |
| 2026-11-19 | #89 | Pidgin app strings accepted by the shared pack validator (main tests green again); reproduce byte-identical again | local gate (Actions budget) |
| 2026-11-19 | #90 | Pidgin cards checked end to end (warning first, no money on a scam); regression test | local gate (Actions budget) |
| 2026-11-19 | #91 | Photo cards published: right amount 27/30, right date 21/25, no false likely-scam (reproducible) | local gate (Actions budget) |
| 2026-11-19 | #92 | Landing photo row generated with the card numbers (27/30 amounts, 21/25 dates) | local gate (Actions budget) |
| 2026-11-19 | #94 | Probe 17: SMS-shorthand scams; first unseen scams warned 18/21 -> 20/21, no new false alarm | local gate (Actions budget) |
| 2026-11-19 | #95 | Empty home screen shows how it works in three pictures | local gate (Actions budget) |
| 2026-11-20 | #96 | Paste: "Who sent it?" choices carry pictures | local gate (Actions budget) |
| 2026-11-20 | #97 | Settings choices carry pictures (on/off, voice speed, keep messages) | local gate (Actions budget) |
| 2026-11-20 | #98 | Practice examples carry pictures; screen titles never split mid-word | local gate (Actions budget) |
| 2026-11-20 | #99 | Accessibility audit back to 0 failures after the sticky top bar (tall bar scrolls away, scroll padding) | local gate (Actions budget) |
| 2026-11-20 | #100 | Landing screenshots retaken from the current app | local gate (Actions budget) |
| 2026-11-20 | #101 | README: features of the week, scam and photo numbers generated (20 of 21 first unseen) | local gate (Actions budget) |
| 2026-11-20 | #102 | Video shot list: Pidgin draft, picture card, stop sign and vibration | local gate (Actions budget) |
| 2026-11-20 | #103 | Probe 18: genuine shorthand money talk stays clean (regression test); main reproduces after #93 | local gate (Actions budget) |
| 2026-11-20 | #104 | Speed re-measured after the fine-tuned encoder: range now 1.3 to 2.5 s (stand-in, not a phone) | local gate (Actions budget) |
| 2026-11-20 | #105 | iOS privacy manifest (App Store requirement), bundled; untested on a Mac | local gate (Actions budget) |
| 2026-11-20 | #108 | Robustness test: odd and huge inputs never throw or hang | local gate (Actions budget) |
| 2026-11-20 | #109 | SMS and USSD for phones with no internet: design (sourced numbers), prototype gateway | local gate (Actions budget) |
| 2026-11-20 | #110 | Relay build: an Android phone with a local SIM answers forwarded SMS with the card, offline | local gate (Actions budget) |
