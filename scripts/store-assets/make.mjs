// Builds the store images in docs/store/assets from the app screenshots in site/img.
// Needs Google Chrome (or set CHROME to another Chromium). Run: node scripts/store-assets/make.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "..", "docs", "store", "assets");
const chrome = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const page = pathToFileURL(join(here, "slide.html")).href;

const slides = {
  en: [
    ["home.png", "Hear your papers, out loud", "Bills, school letters, mobile money SMS. Free, with no account.", ""],
    ["photo.png", "Take a photo of the paper", "Or share an SMS from another app.", ""],
    ["card-bill.png", "What to do, by when, how much", "Shown as pictures and spoken, section by section.", "green"],
    ["card-scam.png", "Scam warnings come first", "SabiTori never tells you a message is safe.", "red"],
    ["language.png", "Works offline, in your language", "French and English today. Your messages stay on your phone.", ""],
  ],
  fr: [
    ["home.png", "Écoutez vos papiers à voix haute", "Factures, lettres de l'école, SMS mobile money. Gratuit, sans compte.", ""],
    ["photo.png", "Prenez le papier en photo", "Ou partagez un SMS depuis une autre application.", ""],
    ["card-bill.png", "Quoi faire, pour quand, combien", "En images et à voix haute, partie par partie.", "green"],
    ["card-scam.png", "L'alerte arnaque passe en premier", "SabiTori ne dit jamais qu'un message est sûr.", "red"],
    ["language.png", "Sans internet, dans votre langue", "Français et anglais aujourd'hui. Vos messages restent sur votre téléphone.", ""],
  ],
};
// App Store Connect (Nov 2026) asks for the 6.3 inch size in its default iPhone slot.
const sizes = { "play-phone": [1080, 1920], "ios-6.3": [1206, 2622], "ios-6.9": [1320, 2868], "ios-6.5": [1284, 2778], "ios-ipad-13": [2064, 2752] };

function shot(file, w, h, params) {
  mkdirSync(dirname(file), { recursive: true });
  const url = page + "?" + new URLSearchParams(params).toString();
  execFileSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
    `--window-size=${w},${h}`, "--virtual-time-budget=8000", "--allow-file-access-from-files",
    `--screenshot=${file}`, url], { stdio: "ignore" });
  console.log(file.slice(out.length + 1), `${w}x${h}`);
}

for (const [lang, list] of Object.entries(slides)) {
  // The French sets reuse the English app screenshots until French ones are captured (see docs/store/README.md).
  for (const [dir, [w, h]] of Object.entries(sizes)) {
    list.forEach(([img, h1, sub, theme], i) =>
      shot(join(out, dir, lang, `${i + 1}-${img}`), w, h, { kind: "phone", img, h: h1, sub, theme }));
  }
}
shot(join(out, "play-feature-graphic-en.png"), 1024, 500, { kind: "feature", h: "Hear your papers in your language", sub: "Works offline" });
shot(join(out, "play-feature-graphic-fr.png"), 1024, 500, { kind: "feature", h: "Écoutez vos papiers dans votre langue", sub: "Sans internet" });
shot(join(out, "icon-512.png"), 512, 512, { kind: "icon" });
shot(join(out, "icon-1024.png"), 1024, 1024, { kind: "icon" });
