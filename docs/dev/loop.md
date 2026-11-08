# Improvement loop

An automated loop works through this list from 2026-11-08 to 2026-11-10 (UTC). Each run takes the first
open item, ships it as one PR that must pass CI before it is merged, and adds a line to the log at the
bottom. People can reorder, add or strike items at any time; the loop re-reads this file every run.

## Rules every run follows

- One focused change per PR, branch `loop/<short-name>`, merged only when CI is green.
- If GitHub Actions cannot start ("an Actions budget is preventing further use"), the gate is
  `scripts/ci-local.sh` (the same steps as `ci.yml`, Android build included). Merge only when every step
  prints PASS, and paste its output into the PR as a comment. Any other CI failure must be fixed.
- Never touch signing keys, secrets, release tags or `.github/workflows/release.yml` secrets handling.
- Never write a number into docs that was not produced by a run in this repository; never claim users,
  partners, pilots or recordings that do not exist. `[OWNER]` placeholders stay until the owner fills them.
- Never weaken a safety rule (facts from code only, never "safe", scam warnings first) to make a test pass.
- If an item is blocked twice, mark it `blocked:` with the reason and move on.
- When the list is empty, find the next real bug or gap (failing edge case, accessibility issue, slow path,
  missing test) and add it here before working on it.

## Backlog (top first)

- [x] **Release workflow without secrets.** `release.yml` now stops in its first step, naming the missing
      signing secrets, instead of after a full test and build. (An unsigned release APK artifact was dropped:
      it cannot be installed; CI already uploads the debug APK.)
- [ ] **End-to-end tests of the built app.** Playwright against the production web build: first run, language
      choice, paste a bill, card spoken in order (scam first), facts-only path, likely-scam path, offline (no
      network requests at all), reminders. Run in CI.
- [ ] **Fact extraction fuzzing.** Property tests for amounts, dates, phones and USSD codes on noisy OCR-like
      input (spacing, O/0, l/1, cut lines). Every fact must keep a valid span; nothing may throw.
- [ ] **Unseen-set accuracy.** Find the most common error classes on `eval` unseen messages (41% all-three
      right) and fix them in rules or training data without touching the unseen set itself. Re-run and publish
      the new numbers with the eval script only.
- [ ] **Scam detection breadth.** Add test cases and rules for current Cameroonian scam patterns already
      described in the region data (fake MoMo reversal, prize fee, account block, fake agent number), each with
      a negative twin (the real message) so false alarms are measured too.
- [ ] **Pilot counter (off by default).** A build flag that counts events on the phone only (messages explained,
      replays, scam warnings shown), shows them to the person on a screen, and lets them share the numbers by
      themselves. No network, no message text (`docs/impact.md`).
- [ ] **Voice training recipe.** `packages/speech/train-voice/`: documented, reproducible steps and scripts to
      fine-tune a Piper voice with `phoneme_type: "text"` from a Recorder export, plus a check that the result
      loads in the app's Piper runtime. No trained voice is claimed.
- [ ] **Low-end phone performance.** Measure cold start, time to first audio and memory with 4x CPU throttle;
      cut whatever is slowest (lazy-load, smaller chunks). Record the before and after numbers in `docs/model.md`.
- [ ] **Accessibility sweep.** Screen-reader order, focus after navigation, 200% text, reduced motion, colour
      contrast in both themes; add the cases to the a11y test.
- [ ] **Recorder robustness.** Interrupted recording, full storage, re-import of an older export, very long
      phrases; tests for each.
- [ ] **Docs and OWNER-TODO tidy.** Make sure every doc matches the code after the changes above.

## Log

| Date (UTC) | PR | What changed | Tests |
| --- | --- | --- | --- |
| 2026-11-08 | #5 | Loop plan; fixed a flaky crash-report test (random Sentry ids); `scripts/ci-local.sh` gate | 1,362 passed |
| 2026-11-08 | #6 | `release.yml` fails fast with the names of missing signing secrets | 1,362 passed |
