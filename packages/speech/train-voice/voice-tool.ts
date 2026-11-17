/**
 * Voice recipe tool (README.md in this folder). Run from the repository root with vite-node:
 *
 *   VN=$(ls -d node_modules/.pnpm/vite-node@*\/node_modules/vite-node/vite-node.mjs | head -1)
 *   node $VN packages/speech/train-voice/voice-tool.ts dataset <unzipped pack folder> <out folder> [--community-agreed]
 *   node $VN packages/speech/train-voice/voice-tool.ts check <voice.onnx.json> <unzipped pack folder>
 *
 * dataset: writes <out>/metadata.csv and <out>/wavs/<id>.wav (22,050 Hz mono, with ffmpeg) for Piper's
 * preprocessing. check: tells whether the app can use a trained voice for that pack.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDataset, checkVoice, metadataCsv, needsAgreement, type ExportedPack } from './dataset';

const [cmd, a, b, ...rest] = process.argv.slice(2);
const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const readPack = (dir: string): ExportedPack => ({
  manifest: readJson(join(dir, 'manifest.json')),
  phrases: readJson(join(dir, 'phrases.json')),
  index: readJson(join(dir, 'audio', 'index.json')),
});
const fail = (msg: string): never => {
  console.error(msg);
  process.exit(1);
};

if (cmd === 'dataset' && a && b) {
  const pack = readPack(a);
  if (needsAgreement(pack) && !rest.includes('--community-agreed'))
    fail(`The ${pack.manifest.tag} pack has no licence yet (${pack.manifest.license ?? 'none'}). Train a voice from it only with the community's written agreement, then pass --community-agreed.`);
  const { rows, skipped, missing } = buildDataset(pack);
  if (!rows.length) fail('No phrase clips with audio in this pack.');
  mkdirSync(join(b, 'wavs'), { recursive: true });
  writeFileSync(join(b, 'metadata.csv'), metadataCsv(rows));
  const ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
  let seconds = 0;
  for (const r of rows) {
    const src = join(a, 'audio', r.file);
    if (!existsSync(src)) fail(`Missing audio file ${src}`);
    if (!ffmpeg) continue;
    const out = join(b, 'wavs', `${r.id}.wav`);
    const res = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-ac', '1', '-ar', '22050', '-sample_fmt', 's16', out]);
    if (res.status !== 0) fail(`ffmpeg failed on ${src}: ${res.stderr}`);
    seconds += (readFileSync(out).length - 44) / (22050 * 2);
  }
  console.log(`${rows.length} clips written to ${b}/metadata.csv${ffmpeg ? `, ${seconds < 120 ? `${seconds.toFixed(1)} seconds` : `${(seconds / 60).toFixed(1)} minutes`} of audio in ${b}/wavs` : ' (ffmpeg not found: convert audio/ to 22,050 Hz mono wavs/<id>.wav yourself)'}.`);
  if (skipped.length) console.log(`${skipped.length} single-word clips (numbers, dates, names) not used: ${skipped.slice(0, 8).join(', ')}${skipped.length > 8 ? ' ...' : ''}`);
  if (missing.length) console.log(`${missing.length} phrase pieces have no recording yet: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ' ...' : ''}`);
} else if (cmd === 'check' && a && b) {
  const pack = readPack(b);
  const texts = Object.values(pack.phrases).map((p) => p.text.replace(/\{\w+\}/g, ' '));
  const r = checkVoice(readJson(a), texts);
  if (r.ok) console.log(`OK: the app can use this voice for ${pack.manifest.tag} (${texts.length} phrases checked).`);
  else fail(`Not usable yet:\n- ${r.problems.join('\n- ')}`);
} else {
  fail('Usage: voice-tool.ts dataset <pack folder> <out folder> [--community-agreed] | check <voice.onnx.json> <pack folder>');
}
