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
 * set CHROMIUM to use another browser (default: scripts/chromium-path.mjs).
 * Exits with status 1 when any fallback happened (a `fallback` event, an utterance spoken by the system
 * voice, or Piper disabled for the session): a run with a fallback did not measure Piper.
 */
import { chromium } from '../../../apps/app/node_modules/@playwright/test/index.mjs'; // playwright lives in apps/app
import { chromiumPath } from '../../../scripts/chromium-path.mjs';
const FR = ['Vous avez reçu 5 000 francs de votre opérateur.', 'Ne partagez jamais votre code secret avec personne.', 'Le rendez-vous est prévu demain à dix heures au centre de santé.'];
const EN = ['You have received 5,000 francs from your operator.', 'Never share your secret code with anyone.', "Your appointment is tomorrow at ten o'clock at the health centre."];
const [throttle, mode] = [Number(process.argv[2] ?? 1), process.argv[3] ?? 'worker'];
const url = process.env.BENCH_URL ?? 'http://localhost:5391/';
const b = await chromium.launch({ executablePath: chromiumPath(), args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
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
const fallbacks = Object.entries(out).flatMap(([lang, r]) => [
  ...(r.rows ?? []).flatMap((row) => (row.events ?? []).filter((e) => e.type === 'fallback').map((e) => `${lang}: fallback ${e.reason}${e.detail ? ` (${e.detail})` : ''}`)),
  ...(r.systemFallbackUtterances ? [`${lang}: ${r.systemFallbackUtterances} utterance(s) spoken by the system voice`] : []),
  ...(r.disabled ? [`${lang}: Piper disabled for the session`] : []),
]);
if (fallbacks.length) {
  console.error(`FAIL: ${fallbacks.length} fallback event(s); these numbers are not Piper measurements:\n  ${fallbacks.join('\n  ')}`);
  process.exit(1);
}
