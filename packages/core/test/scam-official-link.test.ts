import { describe, expect, it } from 'vitest';
import { assessScam, extractFacts } from '../src/index.js';
import { isOfficialLink, linkHost } from '../src/scam.js';
import type { MessageInput } from '../src/types.js';
import { ctx, lexicons, msg, region } from './helpers.js';

const assess = (text: string, sender?: MessageInput['sender']) =>
  assessScam({ ...msg(text, sender), source: 'photo' }, extractFacts(text, ctx), region, lexicons);

// A real MTN business card photographed on an iPhone (Apple Vision text): it was called a scam because of www.mtn.cm.
const CARD = `Ngoba Audrey
API Business Development and Special Verticals
M:+(237) 677 55 95 00
T:+(237) 679 00 90 00
F: +(237) 679 00 90 45
Audrey.Ngoba@mtn.com
Mobile Money Corporation Ltd
Bonapriso Rue Njo Njo Immeuble 942
P.O. Box 15574 Douala
www.mtn.cm`;

describe("a company's own website is not a scam sign", () => {
  it('the MTN business card shows no signs', () => {
    expect(assess(CARD)).toMatchObject({ level: 'no_signs', signals: [] });
  });
  it('bills and letters that print the official site', () => {
    for (const t of [
      'ENEO Cameroon. Facture N° 4471. Montant: 27 639 FCFA. Payez avant le 05/11. Infos: www.eneo.cm',
      'CAMWATER: votre facture de 8 450 FCFA est disponible sur https://camwater.cm/espace-client',
      'MTN MoMo: découvrez nos nouveaux tarifs sur momo.mtn.cm/tarifs',
      'Orange Cameroun vous remercie. Plus d’infos sur www.orange.cm',
    ])
      expect(assess(t).signals, t).not.toContain('link');
  });
  it('look-alikes and other sites still count', () => {
    for (const t of [
      'MTN MoMo: votre compte sera bloqué. Vérifiez ici: www.mtn-cm-verify.com',
      'MTN: you won 500 000 FCFA, claim at http://mtn.cm.bonus-win.top/claim',
      'Votre colis est en attente: bit.ly/3xYz9',
      'Eneo: payez votre facture ici https://eneo-paiement.net/pay',
    ])
      expect(assess(t).signals, t).toContain('link');
  });
  it('one bad link among official ones still counts', () => {
    expect(assess('Infos: www.mtn.cm. Réclamez votre bonus: www.mtn-bonus.xyz').signals).toContain('link');
  });
  it('reads the host as written', () => {
    expect(linkHost('https://www.MTN.cm/momo?x=1')).toBe('mtn.cm');
    expect(linkHost('http://user@momo.mtn.cm:8080/a')).toBe('momo.mtn.cm');
    expect(isOfficialLink('momo.mtn.cm/tarifs', region)).toBe(true);
    expect(isOfficialLink('www.notmtn.cm', region)).toBe(false);
    expect(isOfficialLink('mtn.cm.evil.top/x', region)).toBe(false);
  });
});
