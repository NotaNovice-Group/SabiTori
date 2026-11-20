// Dev server for the Piper benchmark page. Serves apps/app/public (packs, piper runtime) at "/".
// Run `pnpm --filter @sabitori/app build` once first so apps/app/public/piper and the voices exist.
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(new URL('.', import.meta.url));
const repo = fileURLToPath(new URL('../../../', import.meta.url));
export default {
  root: here,
  publicDir: `${repo}apps/app/public`,
  resolve: { alias: { '@sabitori/speech': `${repo}packages/speech/src/index.ts`, '@sabitori/core': `${repo}packages/core/src/index.ts` } },
  // BENCH_COI=1: cross-origin isolated page (SharedArrayBuffer), so onnxruntime-web can use several threads.
  server: {
    port: Number(process.env.PORT ?? 5391),
    strictPort: true,
    fs: { allow: [repo] },
    ...(process.env.BENCH_COI === '1' ? { headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' } } : {}),
  },
  optimizeDeps: { noDiscovery: true },
};
