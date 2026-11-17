# Owner checklist

Every `[OWNER: ...]` placeholder in the repository, with its file and line. Only the founder can fill these:
they are decisions, facts about the publisher, or results of steps outside the code. A reviewer who sees one
reads "unfinished", so fill or remove them before the repository is public. `packages/understand/test/model-card.test.ts`
checks that this list matches the files (regenerate it with `node scripts/owner-todo.mjs` after editing a document).

Total: 98 placeholders in 11 files.

## `CHANGELOG.md` (3)

- [ ] `CHANGELOG.md:40` release date, once released.
- [ ] `CHANGELOG.md:71` French review status; resolve before release.
- [ ] `CHANGELOG.md:72` official numbers verification in `regions/CM/region.json`; remove this note once every entry is verified.

## `CODE_OF_CONDUCT.md` (1)

- [ ] `CODE_OF_CONDUCT.md:39` contact email

## `SECURITY.md` (3)

- [ ] `SECURITY.md:6` security contact email
- [ ] `SECURITY.md:34` acknowledgement time, for example 3 working days
- [ ] `SECURITY.md:35` assessment time

## `docs/impact.md` (1)

- [ ] `docs/impact.md:49` pilot partner, place and dates, once agreed

## `docs/privacy.fr.md` (16)

- [ ] `docs/privacy.fr.md:3` date de dernière mise à jour
- [ ] `docs/privacy.fr.md:16` éditeur — fondateur à titre individuel ou structure à but non lucratif
- [ ] `docs/privacy.fr.md:16` adresse postale
- [ ] `docs/privacy.fr.md:17` adresse e-mail de contact
- [ ] `docs/privacy.fr.md:18` délégué à la protection des données, s'il est obligatoire ou désigné : nom et contact
- [ ] `docs/privacy.fr.md:83` durée de conservation des journaux du serveur de mises à jour
- [ ] `docs/privacy.fr.md:152` accord de traitement des données avec Sentry : signé, et date.
- [ ] `docs/privacy.fr.md:178` durée définie dans le projet Sentry
- [ ] `docs/privacy.fr.md:179` notre propre durée
- [ ] `docs/privacy.fr.md:181` durée de conservation des journaux du serveur de mises à jour, ou « aucun journal conservé par nous »
- [ ] `docs/privacy.fr.md:208` public cible et âge minimum, et position de l'application au regard de la politique Google Play pour les familles.
- [ ] `docs/privacy.fr.md:220` nom et contact de l'autorité
- [ ] `docs/privacy.fr.md:222` adresse e-mail de contact
- [ ] `docs/privacy.fr.md:239` raison sociale
- [ ] `docs/privacy.fr.md:240` adresse postale
- [ ] `docs/privacy.fr.md:241` adresse e-mail de contact

## `docs/privacy.md` (18)

- [ ] `docs/privacy.md:3` date of last update
- [ ] `docs/privacy.md:16` publisher — individual founder or charitable vehicle
- [ ] `docs/privacy.md:16` postal address
- [ ] `docs/privacy.md:17` contact email
- [ ] `docs/privacy.md:18` data protection officer, if one is required or appointed: name and contact
- [ ] `docs/privacy.md:82` name, country and operator of the server that hosts the updates
- [ ] `docs/privacy.md:85` update-server log retention
- [ ] `docs/privacy.md:152` data processing agreement with Sentry: signed, and date.
- [ ] `docs/privacy.md:178` retention period set in the Sentry project
- [ ] `docs/privacy.md:179` our own retention period
- [ ] `docs/privacy.md:181` update-server log retention, or "none kept by us"
- [ ] `docs/privacy.md:207` target audience and minimum age policy, and the app's position under the Google Play Families policy.
- [ ] `docs/privacy.md:219` name and contact of the authority
- [ ] `docs/privacy.md:221` contact email
- [ ] `docs/privacy.md:233` how changes are announced outside the app, for example in the store listing.
- [ ] `docs/privacy.md:237` legal name
- [ ] `docs/privacy.md:238` postal address
- [ ] `docs/privacy.md:239` contact email

## `docs/release.md` (16)

- [ ] `docs/release.md:3` ...
- [ ] `docs/release.md:15` ...
- [ ] `docs/release.md:27` whether a separate English review is required, or it is covered by the same check.
- [ ] `docs/release.md:32` device list.
- [ ] `docs/release.md:44` ...
- [ ] `docs/release.md:52` ...
- [ ] `docs/release.md:65` publisher — individual founder or charitable vehicle
- [ ] `docs/release.md:65` Play Console account type, and whether its verification is complete.
- [ ] `docs/release.md:66` default language.
- [ ] `docs/release.md:70` confirm
- [ ] `docs/release.md:70` target audience and age policy, content-rating questionnaire result, and each answer checked against the current Play policy.
- [ ] `docs/release.md:72` the testing requirement that applies to this account on the day you submit.
- [ ] `docs/release.md:90` the current upload-key reset process in the Play Console help.
- [ ] `docs/release.md:116` whether CI uploads to Play, or the AAB is uploaded by hand.
- [ ] `docs/release.md:136` Sentry organisation and project names.
- [ ] `docs/release.md:169` testing period.

## `docs/store/data-safety.md` (8)

- [ ] `docs/store/data-safety.md:3` ...
- [ ] `docs/store/data-safety.md:21` contact email
- [ ] `docs/store/data-safety.md:21` confirm that the publisher can delete reports in the Sentry project; if the form asks for a web address, use the privacy policy contact section.
- [ ] `docs/store/data-safety.md:52` confirm this against Play's current definitions. If your reading is stricter, mark them as shared to Sentry. Sentry does not use the data for its own purposes.
- [ ] `docs/store/data-safety.md:54` update host operator and log retention.
- [ ] `docs/store/data-safety.md:72` retention period set in the Sentry project
- [ ] `docs/store/data-safety.md:73` if a review is done before release, state it.
- [ ] `docs/store/data-safety.md:74` the answer must match the target audience chosen in the Play Console.

## `docs/store/listing.en.md` (12)

- [ ] `docs/store/listing.en.md:3` ...
- [ ] `docs/store/listing.en.md:39` French review status. Remove this line before publication if the French review in docs/release.md is not finished.
- [ ] `docs/store/listing.en.md:55` public URL of the privacy policy
- [ ] `docs/store/listing.en.md:56` contact email
- [ ] `docs/store/listing.en.md:57` publisher — individual founder or charitable vehicle
- [ ] `docs/store/listing.en.md:64` Play Console category at submission.
- [ ] `docs/store/listing.en.md:74` content-rating questionnaire answer about content that discusses financial scams.
- [ ] `docs/store/listing.en.md:76` content-rating questionnaire result.
- [ ] `docs/store/listing.en.md:78` final target audience and age policy.
- [ ] `docs/store/listing.en.md:108` product website, if any
- [ ] `docs/store/listing.en.md:109` contact email
- [ ] `docs/store/listing.en.md:110` public URL of the privacy policy

## `docs/store/listing.fr.md` (12)

- [ ] `docs/store/listing.fr.md:3` ...
- [ ] `docs/store/listing.fr.md:39` état de la relecture du français. Supprimez cette ligne avant publication si la relecture décrite dans docs/release.md n'est pas terminée.
- [ ] `docs/store/listing.fr.md:55` adresse publique de la politique de confidentialité
- [ ] `docs/store/listing.fr.md:56` adresse e-mail de contact
- [ ] `docs/store/listing.fr.md:57` éditeur — fondateur à titre individuel ou structure à but non lucratif
- [ ] `docs/store/listing.fr.md:62` catégorie dans la Play Console au moment de l'envoi.
- [ ] `docs/store/listing.fr.md:72` réponse du questionnaire de classement sur le contenu qui traite des arnaques financières.
- [ ] `docs/store/listing.fr.md:74` résultat du questionnaire de classement.
- [ ] `docs/store/listing.fr.md:76` choix final du public cible et politique d'âge.
- [ ] `docs/store/listing.fr.md:106` site du produit, s'il existe
- [ ] `docs/store/listing.fr.md:107` adresse e-mail de contact
- [ ] `docs/store/listing.fr.md:108` adresse publique de la politique de confidentialité

## `docs/sustainability.md` (8)

- [ ] `docs/sustainability.md:23` pay rate per speaker per session, and total per language
- [ ] `docs/sustainability.md:24` estimate for extra recording sessions and GPU rental
- [ ] `docs/sustainability.md:25` estimate
- [ ] `docs/sustainability.md:27` hosting estimate, if an update server is run
- [ ] `docs/sustainability.md:28` maintainer time
- [ ] `docs/sustainability.md:46` publisher — individual founder or charitable vehicle
- [ ] `docs/sustainability.md:57` publisher — individual founder or charitable vehicle
- [ ] `docs/sustainability.md:58` first partner, once agreed in writing.

## Checks without a placeholder

- [ ] Have a native speaker of Cameroonian Pidgin confirm the gloss of the name "SabiTori" in `README.md` line 3.
- [ ] Choose the applicant and publisher: an individual founder, a charitable vehicle (gUG or e.V.) or a fiscal sponsor; then replace every "publisher" placeholder above with the same name.
- [ ] Make the repository public (the GPL written offer in `THIRD_PARTY_NOTICES.md` points to it).
- [ ] Measure OCR, model and voice speed on at least two real low-cost Android phones, and replace "not yet measured on a phone" in `README.md` and `docs/model.md` with the measurements and the phone models.
- [ ] Verify the official senders in `regions/CM/region.json`; review `packs/fr/phrases.json` with a native French speaker.
