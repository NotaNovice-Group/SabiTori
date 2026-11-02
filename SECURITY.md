# Security policy

## Report a vulnerability privately

Please do not open a public issue or pull request for a security problem. Email
**[OWNER: security contact email]** with the subject "SabiTori security".

Include, if you can:

- what you found, and where (file, screen or update step);
- the steps to reproduce it, and the app version or build;
- what an attacker could do with it, and who would be affected.

We will reply to confirm we have your report. You may report anonymously, or ask to be credited
when the fix is published.

## What is in scope

- **The update signing key and the update client.** Signature bypass, rollback to an older
  version, changes to the signed file list, or a way to install unsigned files. See
  [`docs/updates.md`](docs/updates.md).
- **Scam detection bypasses.** A crafted message that hides a warning, gets a message judged as
  having "no warning signs" when it has them, or makes a card state a fact that is not in the
  original text.
- **Privacy leaks.** Any way message text, photos or identifying data leave the phone, including
  through the optional update or error-report features.

Out of scope: problems in third-party models or libraries (please report them upstream, and tell us
too), social engineering of volunteers, and ordinary bugs with no security effect. Ordinary bugs
go in the bug report template.

## Response expectations

- We acknowledge a report within **[OWNER: acknowledgement time, for example 3 working days]**.
- We give you an initial assessment and a plan within **[OWNER: assessment time]**.
- We agree a disclosure date with you before anything is published, and fix a confirmed problem
  as quickly as we can.

If the update signing key may be compromised, tell us at once. Apps already installed cannot
accept updates signed with a new key, so that case needs a new app release.
