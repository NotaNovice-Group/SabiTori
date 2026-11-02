/**
 * Lets the maintenance scripts import the TypeScript sources of the packages (validators, update paths) so a
 * file is judged by the same code the app uses. Node strips the types but does not map ".js" specifiers to ".ts"
 * nor the workspace package names, so a tiny resolver does:
 *   "./x.js" -> "./x.ts" when only the .ts exists
 *   "@sabitori/core" -> packages/core/src/index.ts
 *   "@sabitori/speech/validate" -> packages/speech/src/contract.ts
 */
import { register } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let registered = false;

export function registerTs() {
  if (registered) return;
  registered = true;
  const hooks = `
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const MAP = ${JSON.stringify({
    '@sabitori/core': pathToFileURL(join(root, 'packages/core/src/index.ts')).href,
    '@sabitori/speech/validate': pathToFileURL(join(root, 'packages/speech/src/contract.ts')).href,
    '@sabitori/speech': pathToFileURL(join(root, 'packages/speech/src/index.ts')).href,
  })};
export async function resolve(spec, context, next) {
  if (MAP[spec]) return { url: MAP[spec], shortCircuit: true };
  if (/^\\.\\.?\\//.test(spec) && spec.endsWith('.js') && context.parentURL) {
    const ts = new URL(spec.slice(0, -3) + '.ts', context.parentURL);
    if (existsSync(fileURLToPath(ts))) return { url: ts.href, shortCircuit: true };
  }
  return next(spec, context);
}
`;
  register('data:text/javascript,' + encodeURIComponent(hooks));
}

/** Imports a TypeScript source file of the repo, e.g. importTs('packages/speech/src/contract.ts'). */
export async function importTs(rel) {
  registerTs();
  return import(pathToFileURL(join(root, rel)).href);
}
