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
- [ ] **Docs and OWNER-TODO tidy.** Make sure every doc matches the code after the changes above.

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
