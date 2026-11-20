#!/usr/bin/env node
/**
 * Kokoro speed benchmark in headless Chromium (onnxruntime-web wasm, 1 thread: the app's setting).
 *
 *   pnpm --filter @sabitori/app build     # once: stages apps/app/public/{kokoro,piper,ort}
 *   cd apps/app && ./node_modules/.bin/vite --config ../../packages/speech/bench/vite.config.mjs &   # the page
 *   node packages/speech/bench/kokoro-run.mjs [wavDir]
 *   BENCH_URL='http://localhost:5391/kokoro.html?model=model_quantized.onnx' node ...   (another model file in public/kokoro/)
 *
 * Prints, per language: model load time, then per sentence synthesis time, audio length and real-time factor
 * (synthesis seconds per second of audio; the first sentence includes the first-run warm-up), then time to first
 * audio through createKokoroTts. With `wavDir`, writes the synthesized sentences as 24 kHz WAV files there.
 * Never runs `playwright install`: set CHROMIUM to use another browser (default: scripts/chromium-path.mjs).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '../../../apps/app/node_modules/@playwright/test/index.mjs'; // playwright lives in apps/app
import { chromiumPath } from '../../../scripts/chromium-path.mjs';

const EN = [
  'Your electricity bill of twelve thousand five hundred francs must be paid before the end of the month, at any ENEO agency.',
  'Never share your secret code with anyone, not even with someone who says they work for your bank.',
];
const FR = [
  "Votre facture d'électricité de douze mille cinq cents francs doit être payée avant la fin du mois, dans une agence ENEO.",
  'Ne partagez jamais votre code secret avec personne, même pas avec quelqu’un qui dit travailler pour votre banque.',
];
const url = process.env.BENCH_URL ?? 'http://localhost:5391/kokoro.html';
const wavDir = process.argv[2];

function wav(b64, rate) {
  const pcm = Buffer.from(b64, 'base64');
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

const b = await chromium.launch({ executablePath: chromiumPath(), args: ['--no-sandbox'] });
const out = {};
for (const [lang, bcp47, folder, sents] of [['en', 'en-GB', 'en', EN], ['fr', 'fr-FR', 'fr', FR]]) {
  const p = await b.newPage();
  p.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await p.goto(url);
  await p.waitForFunction('window.ready === true');
  const r = await p.evaluate(([f, s]) => window.benchKokoro(f, s), [folder, sents]);
  if (wavDir) {
    mkdirSync(wavDir, { recursive: true });
    r.wavs.forEach((w, i) => writeFileSync(join(wavDir, `kokoro-${lang}-${i + 1}.wav`), wav(w, r.sampleRate)));
  }
  delete r.wavs;
  const t = await p.evaluate(([l, f, s]) => window.ttfaKokoro(l, f, s), [bcp47, folder, sents]);
  out[lang] = { ...r, ttfa: t };
  await p.close();
}
console.log(JSON.stringify(out, null, 1));
await b.close();
