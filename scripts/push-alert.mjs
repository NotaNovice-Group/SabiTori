/**
 * Send one scam alert as an instant push (docs/updates.md, "Instant scam alerts").
 *
 *   node <vite-node.mjs from node_modules/.pnpm/vite-node@...> scripts/push-alert.mjs <alert-id> [--region CM] [--dry-run]
 *   (vite-node runs the alert checks from packages/connect; plain node cannot, and the script then refuses to send)
 *
 * The alert must already be in regions/<CC>/alerts.json and pass the same checks as alerts sent by update (short,
 * French and English, no link, phone number or USSD code). It is sent to two Firebase topics, alerts-<CC>-fr and
 * alerts-<CC>-en, each in its language. Phones subscribe to a topic; nobody keeps a list of phones.
 *
 * Needs FCM_SERVICE_ACCOUNT: the path of the Firebase service-account JSON (never commit it).
 */
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { messagesFor } from './lib/push-message.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const fail = (m) => { console.error(`push-alert: ${m}`); process.exit(1); };

async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
  });
  if (!r.ok) fail(`token request failed (${r.status})`);
  return (await r.json()).access_token;
}

async function main() {
  const id = process.argv[2];
  if (!id || id.startsWith('--')) fail('usage: node scripts/push-alert.mjs <alert-id> [--region CM] [--dry-run]');
  const region = arg('region', 'CM');
  const mod = await import(join(root, 'packages/connect/src/content.ts')).catch(() => null);
  if (!mod?.parseAlerts) fail('the alert checks could not load: run this script with vite-node (see the header)');
  const raw = JSON.parse(readFileSync(join(root, 'regions', region, 'alerts.json'), 'utf8'));
  let alerts;
  try {
    alerts = mod.parseAlerts(raw);
  } catch (e) {
    fail(`regions/${region}/alerts.json is not valid: ${e instanceof Error ? e.message : e}`);
  }
  const alert = alerts.find((a) => a.id === id) ?? fail(`no alert "${id}" in regions/${region}/alerts.json`);
  const msgs = messagesFor(alert, region);
  if (process.argv.includes('--dry-run')) return console.log(JSON.stringify(msgs, null, 1));
  const path = process.env.FCM_SERVICE_ACCOUNT ?? fail('set FCM_SERVICE_ACCOUNT to the service-account JSON path');
  const sa = JSON.parse(readFileSync(path, 'utf8'));
  const token = await accessToken(sa);
  for (const m of msgs) {
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(m),
    });
    console.log(`${m.message.topic}: ${r.ok ? 'sent' : `failed (${r.status})`}`);
    if (!r.ok) process.exitCode = 1;
  }
}

await main();
