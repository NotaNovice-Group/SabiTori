import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

it('docs/numbers.md matches the result files (regenerate with node scripts/numbers.mjs)', () => {
  const r = spawnSync(process.execPath, ['scripts/numbers.mjs', '--check'], { cwd: resolve(__dirname, '../../..'), encoding: 'utf8' });
  expect(r.status, r.stderr).toBe(0);
});
