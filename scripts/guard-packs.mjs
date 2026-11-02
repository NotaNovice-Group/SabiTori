#!/usr/bin/env node
/**
 * Guard for packs/: fails when a file that must never be shipped is inside it (recorder-notes.json).
 *   node scripts/guard-packs.mjs [dir]      (default: packs/)
 * Run by check-packs.mjs and updates-publish.mjs, and usable alone (CI, pre-commit).
 */
import { join } from 'node:path';
import { resolve } from 'node:path';
import { findForbiddenPackFiles, forbiddenMessage } from './lib/guard.mjs';
import { root } from './lib/ts.mjs';

const dir = resolve(process.argv[2] ?? join(root, 'packs'));
const found = findForbiddenPackFiles(dir);
for (const f of found) console.error(`error: ${forbiddenMessage(f)}`);
if (found.length) process.exit(1);
console.log(`OK: no forbidden files in ${dir}.`);
