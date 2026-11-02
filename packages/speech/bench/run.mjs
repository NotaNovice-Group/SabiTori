#!/usr/bin/env node
/**
 * Piper latency benchmark in headless Chromium.
 *
 *   cd apps/app && ./node_modules/.bin/vite --config ../../packages/speech/bench/vite.config.mjs &   # the page
 *   node packages/speech/bench/run.mjs <cpuThrottle> <worker|main>   (e.g. `4 main`)
 *
 * - `worker`: the real code path (inference in a Web Worker). Chromium's CPU throttling does NOT slow workers.
 * - `main`: the same runtime on the page's main thread, which the throttling does slow. Use `main` with
 *   throttle 4 to emulate a phone about 4x slower than this machine.
 * Prints per sentence: time to first audio (speak() to the first sample going to the audio device),
 * and real-time factor (synthesis seconds per second of audio). Never runs `playwright install`:
 * point CHROMIUM at an installed browser (default: /opt/pw-browsers).
 */
import { chromium } from '../../../apps/app/node_modules/@playwright/test/index.mjs'; // playwright lives in apps/app
const FR = ['Vous avez reçu 5 000 francs de votre opérateur.', 'Ne partagez jamais votre code secret avec personne.', 'Le rendez-vous est prévu demain à dix heures au centre de santé.'];
const EN = ['You have received 5,000 francs from your operator.', 'Never share your secret code with anyone.', "Your appointment is tomorrow at ten o'clock at the health centre."];
const [throttle, mode] = [Number(process.argv[2] ?? 1), process.argv[3] ?? 'worker'];
const url = process.env.BENCH_URL ?? 'http://localhost:5391/';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const out = {};
for (const [lang, sents] of [['fr-FR', FR], ['en-GB', EN]]) {
  const p = await b.newPage();
  p.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await p.goto(url);
  await p.waitForFunction('window.ready === true');
  if (throttle > 1) await (await p.context().newCDPSession(p)).send('Emulation.setCPUThrottlingRate', { rate: throttle });
  out[lang] = await p.evaluate(([l, s, m]) => window.bench(l, s, true, m), [lang, sents, mode]);
  await p.close();
}
console.log(JSON.stringify({ throttle, mode, ...out }, null, 1));
await b.close();
