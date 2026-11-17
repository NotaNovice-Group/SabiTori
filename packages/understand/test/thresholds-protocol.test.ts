import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The published method: the encoder's confidence thresholds are chosen on the train split (out-of-fold) only.
 * When the rules or lexicons change, that choice can change too; this test fails until heads.json is re-selected
 * (`node packages/understand/eval/run-encoder.mjs --select-threshold --write`) and the results regenerated, so the
 * shipped thresholds always match the documented procedure.
 */
const root = resolve(__dirname, '../../..');

describe('encoder thresholds follow the published procedure', () => {
  it('heads.json holds the thresholds that train-only selection picks today', () => {
    const r = spawnSync(process.execPath, ['packages/understand/eval/run-encoder.mjs', '--select-threshold'], { cwd: root, encoding: 'utf8', timeout: 120_000 });
    expect(r.status, r.stderr).toBe(0);
    const line = r.stdout.split('\n').find((l) => l.startsWith('BEST thresholds'));
    expect(line, r.stdout).toBeTruthy();
    const best = JSON.parse(line!.slice(line!.indexOf('{'), line!.indexOf('}') + 1)) as Record<string, number>;
    const shipped = JSON.parse(readFileSync(resolve(root, 'packages/understand/model/minilm/heads.json'), 'utf8')).thresholds;
    expect(shipped).toEqual(best);
  }, 180_000);
});
