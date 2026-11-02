// Runs in the page: the app's encoder classifier (onnxruntime-web wasm, one thread) on the MAIN
// thread, as in the app, and times classify() per message. Driven by ../encoder-bench.mjs.
import { createEncoderClassifier } from '@sabitori/understand';
import { createRulesClassifier, extractFacts } from '@sabitori/core';

const w = window as unknown as Record<string, unknown>;
w.bench = async (rows: Array<Record<string, any>>, region: any, lexicons: any[], modelUrl: string, wasmUrl: string) => {
  const t0 = performance.now();
  const rules = createRulesClassifier(region, lexicons);
  const cls = await createEncoderClassifier({ baseUrl: modelUrl, fallback: rules, wasmBaseUrl: wasmUrl });
  const load = performance.now() - t0;
  const SOURCE: Record<string, string> = { sms: 'paste', whatsapp: 'share', letter: 'photo' };
  const lat: number[] = [];
  for (const r of rows) {
    const input = { text: r.text, source: SOURCE[r.source] ?? 'paste', receivedAt: r.receivedAt, region: 'CM', sender: r.sender };
    const facts = extractFacts(r.text, { region, lexicons, receivedAt: r.receivedAt });
    const t = performance.now();
    await cls.classify(input as any, facts);
    lat.push(performance.now() - t);
  }
  lat.sort((a, b) => a - b);
  const q = (p: number) => lat[Math.min(lat.length - 1, Math.floor(lat.length * p))]!;
  return { loadMs: Math.round(load), n: lat.length, medianMs: Math.round(q(0.5)), p95Ms: Math.round(q(0.95)), maxMs: Math.round(lat[lat.length - 1]!) };
};
w.ready = true;
