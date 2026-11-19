// Builds site/privacy.html and site/privacy-fr.html from docs/privacy.md and docs/privacy.fr.md.
// Run after editing either policy: npx -y -p marked node scripts/site-privacy.mjs  (or with marked installed).
import { readFileSync, writeFileSync } from "node:fs";
import { marked } from "marked";

const pages = [
  ["docs/privacy.md", "site/privacy.html", "en", "Privacy policy", "Back to SabiTori", "privacy-fr.html", "Français",
    "Privacy policy of SabiTori: your messages and photos never leave your phone. No accounts, no ads, no analytics."],
  ["docs/privacy.fr.md", "site/privacy-fr.html", "fr", "Politique de confidentialité", "Retour à SabiTori", "privacy.html", "English",
    "Politique de confidentialité de SabiTori : vos messages et vos photos ne quittent jamais votre téléphone. Ni compte, ni publicité, ni mesure d'audience."],
];
const slug = (t) => t.toLowerCase().replace(/<[^>]+>/g, "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
const SITE = "https://sabitori.pages.dev";
for (const [src, out, lang, title, back, other, otherName, desc] of pages) {
  const slug = out.replace("site/", "").replace(".html", ""), otherSlug = other.replace(".html", ""), otherLang = lang === "en" ? "fr" : "en";
  let body = marked.parse(readFileSync(src, "utf8"));
  body = body.replace(/<h2>(.*?)<\/h2>/g, (_, t) => `<h2 id="${slug(t)}">${t}</h2>`);
  writeFileSync(out, `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · SabiTori</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${SITE}/${slug}">
<link rel="alternate" hreflang="${lang}" href="${SITE}/${slug}">
<link rel="alternate" hreflang="${otherLang}" href="${SITE}/${otherSlug}">
<link rel="icon" href="img/mark.svg" type="image/svg+xml">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Andika:wght@400;700&family=Young+Serif&display=swap">
<link rel="stylesheet" href="styles.css">
</head>
<body>
<main class="doc">
<p class="doc__nav"><a class="link" href="./">← ${back}</a> · <a class="link" href="${other}">${otherName}</a></p>
${body}
</main>
</body>
</html>
`);
  console.log(out);
}
