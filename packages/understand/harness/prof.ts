import { Wllama } from '@wllama/wllama';
import { buildMessages, buildGrammar } from '../src/prompt';
(async () => {
  console.log('LOADED isolated=' + (self as any).crossOriginIsolated + ' hc=' + navigator.hardwareConcurrency);
  const w = new Wllama({ default: '/wllama/wllama.wasm', 'single-thread/wllama.wasm': '/wllama/wllama.wasm', 'multi-thread/wllama.wasm': '/wllama/wllama.wasm' } as any, { allowOffline: true } as any);
  const blob = await (await fetch('/model.gguf')).blob();
  let t = performance.now();
  await w.loadModel([blob], { n_ctx: 2048 } as any);
  console.log('RESULT load ' + Math.round(performance.now() - t) + 'ms multi=' + (w as any).isMultithread?.());
  const msgs = buildMessages({ text: "ENEO: Cher client, votre facture N° 2026110045 d'un montant de 18 450 FCFA est disponible. Veuillez régler avant le 25/11/2026 pour éviter la coupure.", source: 'paste', receivedAt: '2026-10-31', region: 'CM' } as any);
  const flat = msgs.map((m: any) => m.content).join('\n');
  const toks = { length: Math.round(flat.length / 3.5) };
  console.log('RESULT approx_prompt_tokens ' + toks.length);
  const texts=['Dear parent, school fees of 45,000 FCFA for the second term must be paid before 30 November 2026.','Felicitations! Vous avez gagne 500 000 FCFA. Envoyez 2 000 F de frais et votre code secret.','DGSN: Votre carte nationale d identite est prete. Venez la retirer au commissariat.'];
  for (const g of [true, true, true]) { const tx = texts.shift()!; const m2 = buildMessages({ text: tx, source: 'paste', receivedAt: '2026-10-31', region: 'CM' } as any);
    t = performance.now();
    const r = await w.createChatCompletion({ messages: m2 as any, ...(g ? { grammar: buildGrammar() } : {}), temperature: 0, top_k: 1, max_tokens: 48 } as any);
    console.log('RESULT ' + tx.slice(0,20) + ' grammar=' + g + ' ' + Math.round(performance.now() - t) + 'ms ' + JSON.stringify(r.choices[0]?.message?.content));
  }
  console.log('DONE');
})().catch(e => console.log('ERROR ' + (e?.stack || e)));
