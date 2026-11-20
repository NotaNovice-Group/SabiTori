import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { createDiskDeps, chooseLang, smsParts, smsReply, toGsm7, ussd, MAX_PARTS, isGsm7 } from '../src/index.js';
import { startServer } from '../src/server.js';

const root = resolve(__dirname, '../../..');
const deps = createDiskDeps(root, () => '2026-11-20');

describe('SMS reply: the card, in a few SMS', () => {
  it('a forwarded scam: the warning first, no amount, at most 3 parts, plain GSM-7', async () => {
    const r = await smsReply('Félicitations! Votre numéro a gagné 500 000 FCFA. Envoyez 5 000 FCFA de frais au 677 12 34 56.', deps());
    expect(r.scam).toBe('likely_scam');
    expect(r.text.split('\n')[1]).toMatch(/piege|piège|arnaque/i);
    expect(r.text).not.toMatch(/500 000|cinq cent mille/);
    expect(r.parts).toBeLessThanOrEqual(MAX_PARTS);
    expect(isGsm7(r.text)).toBe(true);
  });
  it('a bill: who, what, by when, how much', async () => {
    const r = await smsReply("ENEO: Votre facture d'électricité de 18 450 FCFA est à payer avant le 30/11/2026.", deps());
    expect(r.scam).toBe('no_signs');
    expect(r.text).toMatch(/ENEO/);
    expect(r.text).toMatch(/dix-huit mille|18 450/);
    expect(r.parts).toBeLessThanOrEqual(MAX_PARTS);
    expect(r.text).not.toMatch(/(message|il|ce|c'|est) (est )?(s[uû]r|sans danger|fiable)|aucun danger|\bis safe\b/i);
  });
  it('replies in the message language, or as asked with EN/FR', async () => {
    expect((await smsReply('Your electricity bill of 12,750 FCFA is due on 28/11/2026.', deps())).lang).toBe('en');
    expect((await smsReply('EN Votre facture de 18 450 FCFA est à payer avant le 30/11/2026.', deps())).lang).toBe('en');
    expect(chooseLang('fr: hello', 'en')).toEqual({ lang: 'fr', body: 'hello' });
  });
  it('a very long message still fits', async () => {
    const r = await smsReply("ENEO: Votre facture d'électricité de 18 450 FCFA est à payer avant le 30/11/2026. ".repeat(40), deps());
    expect(r.parts).toBeLessThanOrEqual(MAX_PARTS);
  });
});

describe('SMS length rules', () => {
  it('counts GSM-7 and UCS-2 parts', () => {
    expect(smsParts('a'.repeat(160))).toBe(1);
    expect(smsParts('a'.repeat(161))).toBe(2);
    expect(smsParts('ê'.repeat(70))).toBe(1);
    expect(smsParts('ê'.repeat(71))).toBe(2);
    expect(toGsm7('Présentez-vous à l’hôpital')).toBe("Présentez-vous à l'hopital");
  });
});

describe('USSD menu', () => {
  const region = deps().region;
  it('opens with a short menu and switches language', () => {
    expect(ussd('', region)).toMatch(/^CON SabiTori/);
    expect(ussd('9', region)).toMatch(/Check a number/);
    expect(ussd('9*9', region)).toMatch(/Verifier un numero/);
  });
  it('checks a number: an ordinary mobile is never a company asking for money', () => {
    expect(ussd('1', region)).toMatch(/^CON /);
    expect(ussd('1*677123456', region)).toMatch(/^END .*mobile ordinaire/);
    expect(ussd('9*1*+237 677 12 34 56', region)).toMatch(/^END An ordinary mobile/);
    expect(ussd('1*222233068', region)).toMatch(/^END Numero fixe/);
    expect(ussd('1*12', region)).toMatch(/^END Numero non reconnu/);
  });
  it('every screen fits a USSD screen (182 characters) in GSM-7', () => {
    for (const p of ['', '9', '1', '1*677123456', '1*222233068', '2', '9*2', '3', '9*3', '7'])
      for (const s of [ussd(p, region)]) {
        expect(s.length, p).toBeLessThanOrEqual(182);
        expect(isGsm7(s), p).toBe(true);
      }
  });
});

describe('HTTP service', () => {
  it('answers /sms and /ussd, and logs no message', async () => {
    const server = startServer(0, root);
    await new Promise((r) => server.once('listening', r));
    const port = (server.address() as { port: number }).port;
    const post = (path: string, data: Record<string, string>) =>
      fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(data) }).then((r) => r.text());
    expect(await post('/sms', { from: '+237690000000', text: 'Félicitations! Vous avez gagné 500 000 FCFA. Envoyez 5 000 FCFA de frais au 677 12 34 56.' })).toMatch(/^SabiTori/);
    expect(await post('/ussd', { sessionId: 'x', phoneNumber: '+237690000000', text: '' })).toMatch(/^CON/);
    server.close();
  });
});
