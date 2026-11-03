import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { analyze, buildSpeechPlan, createRulesClassifier, extractFacts } from '@sabitori/core';
import type { Card, Classifier, MessageInput, ReadingLexicon, RegionConfig, Understanding } from '@sabitori/core';
import {
  combineWithRules, createEncoderClassifier, loadEncoder, ENCODER_MAX_TOKENS, type Encoder, type EncoderLabels,
} from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const J = <T>(p: string) => JSON.parse(readFileSync(resolve(here, '../../..', p), 'utf8')) as T;
const region = J<RegionConfig>('regions/CM/region.json');
const lexicons = [J<ReadingLexicon>('packs/fr/reading.json'), J<ReadingLexicon>('packs/en/reading.json')];
const modelDir = resolve(here, '../model/minilm');
const haveModel = existsSync(resolve(modelDir, 'encoder.int8.onnx'));
const readFile = async (n: string) => new Uint8Array(readFileSync(resolve(modelDir, n)));

const RECEIVED = '2026-10-31';
const msg = (text: string, sender?: MessageInput['sender']): MessageInput => ({
  text, source: 'paste', receivedAt: RECEIVED, region: 'CM', ...(sender ? { sender } : {}),
});
const facts = (text: string) => extractFacts(text, { region, lexicons, receivedAt: RECEIVED });
const keys = (c: Card) => buildSpeechPlan(c).sections.flatMap((s) => s.utterances.map((u) => u.key));
const rulesU = (u: Partial<Understanding> = {}): Understanding => ({
  kind: 'school', action: 'pay', urgency: 'soon', confidence: 0.8, producedBy: 'rules@1', ...u,
});
const labels = (k: [string, number], a: [string, number], u: [string, number]): EncoderLabels => ({
  kind: { label: k[0], p: k[1], probs: [] }, action: { label: a[0], p: a[1], probs: [] }, urgency: { label: u[0], p: u[1], probs: [] },
});

describe('review 3: combineWithRules never contradicts the facts', () => {
  const PIDGIN = 'Your pikin school fees na 45 000 F, pay am before 20/11 for school. Call 233 42 00 11 for info.';
  const ctx = (text: string, truncated = false) => ({ facts: facts(text), receivedAt: RECEIVED, truncated });
  it('(a) "nothing" next to a future deadline keeps the rules action; urgency keeps the date floor', () => {
    const u = combineWithRules(labels(['school', 0.9], ['nothing', 0.9], ['info', 0.9]), rulesU(), 0.6, 'enc', ctx(PIDGIN));
    expect(u.action).toBe('pay');
    expect(u.urgency).not.toBe('info');
  });
  it('(a) "nothing" next to an amount keeps the rules action even with no date', () => {
    const t = 'Payez 5 000 FCFA au guichet.';
    const u = combineWithRules(labels(['administrative', 0.9], ['nothing', 0.9], ['info', 0.9]), rulesU({ action: 'pay' }), 0.6, 'enc', ctx(t));
    expect(u.action).toBe('pay');
  });
  it('(a) with nothing in the facts the encoder may say "nothing"', () => {
    const t = 'Merci de votre visite, a bientôt.';
    const u = combineWithRules(labels(['other', 0.9], ['nothing', 0.9], ['info', 0.9]), rulesU({ action: 'unclear', urgency: 'info' }), 0.6, 'enc', ctx(t));
    expect(u.action).toBe('nothing');
  });
  it('(b) a deadline within 2 days is urgent, within 7 days at least the rules urgency', () => {
    const t = 'Payez avant le 02/11/2026.';
    expect(combineWithRules(labels(['school', 0.9], ['pay', 0.9], ['info', 0.9]), rulesU({ urgency: 'soon' }), 0.6, 'enc', ctx(t)).urgency).toBe('urgent');
    const t2 = 'Payez avant le 06/11/2026.';
    expect(combineWithRules(labels(['school', 0.9], ['pay', 0.9], ['info', 0.9]), rulesU({ urgency: 'urgent' }), 0.6, 'enc', ctx(t2)).urgency).toBe('urgent');
    expect(combineWithRules(labels(['school', 0.9], ['pay', 0.9], ['info', 0.9]), rulesU({ urgency: 'soon' }), 0.6, 'enc', ctx(t2)).urgency).toBe('soon');
  });
  it('(e) a truncated text: the encoder action and urgency are ignored, kind is still used', () => {
    const t = 'Payez avant le 20/11/2026.';
    const u = combineWithRules(labels(['health', 0.95], ['nothing', 0.99], ['info', 0.99]), rulesU({ kind: 'bank' }), 0.6, 'enc', ctx(t, true));
    expect(u.kind).toBe('health');
    expect(u.action).toBe('pay');
    expect(u.urgency).toBe('soon');
  });
  it('without ctx it is the old behaviour', () => {
    const u = combineWithRules(labels(['school', 0.9], ['nothing', 0.9], ['info', 0.9]), rulesU(), 0.6, 'enc');
    expect([u.action, u.urgency]).toEqual(['nothing', 'info']);
  });
});

describe.skipIf(!haveModel)('review 3: the real encoder through analyze', () => {
  let rules: Classifier;
  let strict: Classifier; // threshold 0: the encoder's label is taken everywhere, the worst case for the guard
  let enc: Encoder;
  beforeAll(async () => {
    rules = createRulesClassifier(region, lexicons);
    strict = await createEncoderClassifier({ baseUrl: modelDir, fallback: rules, readFile, threshold: 0 });
    enc = await loadEncoder({ baseUrl: modelDir, readFile });
  }, 120_000);
  const card = (text: string, c: Classifier, sender?: MessageInput['sender']) => analyze(msg(text, sender), { region, lexicons, classifier: c });

  it('pidgin school fees: never action.nothing / urgency.info', async () => {
    const c = await card('Your pikin school fees na 45 000 F, pay am before 20/11 for school. Call 233 42 00 11 for info.', strict);
    expect(keys(c)).not.toContain('action.nothing');
    expect(keys(c)).not.toContain('urgency.info');
    expect(c.understanding.action).toBe('pay');
  }, 60_000);

  it('sbt-030 (UBA PIN scam, Pidgin) keeps scam.check_balance', async () => {
    const c = await card('UBA: Abeg send yu PIN and password make we open yu account again, e don block.', strict, { kind: 'number', value: '+237699000192' });
    expect(c.scam.level).toBe('likely_scam');
    expect(keys(c)).toContain('scam.check_balance');
  }, 60_000);

  it('a promo with a link under caution never says "You must pay"', async () => {
    for (const t of [
      'Offre MTN: doublez votre recharge ce week-end ! https://mtn-promo.example/x',
      "MTN: Offre exceptionnelle! Doublez votre recharge aujourd'hui seulement. Rechargez 1.500 FCFA tout de suite.",
    ]) {
      const c = await card(t, strict, { kind: 'name', value: 'MTN Cameroon' });
      expect(c.scam.level, t).toBe('caution');
      expect(keys(c), t).not.toContain('action.pay');
    }
  }, 60_000);

  it('new-08: CAMTEL échéance 02/11 received 31/10 under caution stays urgent', async () => {
    const t = 'CAMTEL Blue: votre abonnement fibre arrive à échéance le 02/11/2026. Renouvelez 25 000 FCFA via *888# pour rester connecté.';
    for (const c of [rules, strict]) {
      const k = await card(t, c, { kind: 'name', value: 'Camtel' });
      expect(k.scam.level).toBe('caution');
      expect(k.understanding.urgency).toBe('urgent');
    }
  }, 60_000);

  it('(e) a text cut at the token budget: the encoder cannot set action or urgency; the rules read all of it', async () => {
    const filler = 'Informations complémentaires sur votre dossier et le service. '.repeat(14);
    const t = 'Votre abonnement ENEO. ' + filler + 'Payez 24 500 FCFA avant le 02/11/2026 sinon coupure.';
    expect(enc.tokenize(t).length).toBe(ENCODER_MAX_TOKENS);
    expect(enc.isTruncated(t)).toBe(true);
    expect(enc.isTruncated('Votre facture ENEO est disponible.')).toBe(false);
    const input = msg(t);
    const f = facts(t);
    const fromRules = await rules.classify(input, f);
    const u = await strict.classify(input, f);
    expect(u.action).toBe(fromRules.action);
    expect(u.urgency).toBe(fromRules.urgency);
    expect(fromRules.action).toBe('pay');
  }, 60_000);
});
