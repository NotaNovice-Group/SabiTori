import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPackRegistry } from '@sabitori/speech';
import type { ReadingLexicon, RegionConfig } from '@sabitori/core';
import { createEngineFrom } from '../src/engine/packages-engine';
import { withLifecycle } from '../src/engine';
import type { PlayOptions, RenderedSection } from '../src/engine';

const root = resolve(__dirname, '../../..');
const json = (p: string) => JSON.parse(readFileSync(resolve(root, p), 'utf8'));
/** A registry that reads packs/ from disk exactly as the app fetches them (404 for missing files). */
const diskFetch = async (url: string) => {
  const file = resolve(root, url.replace(/^\//, ''));
  if (!existsSync(file)) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(file, 'utf8')) };
};
const lexicons: ReadingLexicon[] = ['fr', 'en'].map((t) => json(`packs/${t}/reading.json`));

function engine() {
  const played: RenderedSection[][] = [];
  const e = createEngineFrom({
    region: json('regions/CM/region.json') as RegionConfig,
    registry: createPackRegistry({ baseUrl: '/packs', fetch: diskFetch }),
    lexicons,
    baseUrl: './',
    today: () => '2026-10-31',
    player: { play: (s) => void played.push(s), stop() {}, playing: false },
  });
  return { e, played };
}

const BILL = {
  text: "ENEO: Votre facture d'électricité N° 0451233987 d'un montant de 18 450 FCFA est disponible. Date limite de paiement: 12 novembre 2026. Service client: 677 00 12 34.",
  source: 'paste' as const,
  sender: { kind: 'name' as const, value: 'ENEO' },
  receivedAt: '2026-10-31',
  region: 'CM',
};

describe('engine adapter over the real packages', () => {
  it('offers the region languages in order, with manifests', async () => {
    const { e } = engine();
    const langs = await e.languages();
    // The list is data: whatever regions/CM/region.json offers, in that order.
    const region = JSON.parse(readFileSync(`${process.cwd()}/../../regions/CM/region.json`, 'utf8'));
    expect(langs.map((l) => l.tag)).toEqual(region.languages);
    expect(langs.map((l) => l.tag)).toEqual(expect.arrayContaining(['wes', 'lns', 'lmp', 'pny']));
    expect(langs[0]!.autonym).toBe('Français');
  });

  it('renders the interface bundle in a language, and falls back for extras', async () => {
    const { e } = engine();
    const fr = await e.bundle('fr');
    expect(fr['ui.take_photo'].text).toMatch(/photo/i);
    expect(fr['app.next'].text).toBe('Suivant');
    const en = await e.bundle('en');
    expect(en['ui.take_photo'].text).toBe('Take a photo of a message');
    expect(en['app.next'].text).toBe('Next');
  });

  it('a pack that cannot render (no rules) speaks through its fallback', async () => {
    const { e } = engine();
    const r = await e.phrase('ui.welcome', 'dua');
    expect(['en', 'fr']).toContain(r.lang);
    expect(r.text.length).toBeGreaterThan(3);
    const soon = await e.phrase('app.lang.soon', 'dua', { name: 'Français' });
    expect(soon.text).toContain('Français');
  });

  it('a Pidgin card is said in Pidgin, and a Pidgin scam card warns first without the money', async () => {
    const { e } = engine();
    const bill = await e.renderCard(await e.analyze(BILL), 'wes');
    expect(bill.every((v) => v.lang === 'wes')).toBe(true);
    expect(bill.map((v) => v.section)).toContain('money');
    const scam = await e.renderCard(
      await e.analyze({ ...BILL, text: 'Félicitations! Votre numéro a gagné 500 000 FCFA. Envoyez 5 000 FCFA de frais au 677 12 34 56.', sender: { kind: 'number', value: '+237690112233' } }),
      'wes',
    );
    expect(scam[0]!.section).toBe('scam');
    expect(scam[0]!.lang).toBe('wes');
    expect(scam.map((v) => v.section)).not.toContain('money');
  });

  it('the Pidgin pack (rules and app strings) loads and is used, not silently replaced by its fallback', async () => {
    const { e } = engine();
    const empty = await e.phrase('app.home.empty', 'wes');
    expect(empty.lang).toBe('wes');
    expect(empty.text).toBe('Message never dey');
  });

  it('analyzes a bill with the rules classifier, renders sections and lines', async () => {
    const { e } = engine();
    const card = await e.analyze(BILL);
    expect(card.amount?.value.amount).toBe(18450);
    expect(card.deadline?.value).toBe('2026-11-12');
    const views = await e.renderCard(card, 'fr');
    const sections = views.map((v) => v.section);
    expect(sections).toContain('about');
    expect(sections).toContain('money');
    for (const v of views) {
      expect(v.text.length).toBeGreaterThan(0);
      expect(v.parts.length).toBeGreaterThan(0);
      expect(v.lines.length).toBeGreaterThan(0);
    }
  });

  it('puts a scam warning first', async () => {
    const { e } = engine();
    const card = await e.analyze({ ...BILL, text: 'Vous avez gagné 2 000 000 FCFA. Envoyez 5 000 FCFA et donnez votre code PIN dans les 10 minutes.', sender: { kind: 'number', value: '690112233' } });
    expect(card.scam.level).not.toBe('no_signs');
    const views = await e.renderCard(card, 'fr');
    expect(views[0]!.section).toBe('scam');
  });

  it('speaks a phrase through the player', async () => {
    const { e, played } = engine();
    e.speak(await e.phrase('ui.stop', 'fr'));
    expect(played).toHaveLength(1);
    expect(played[0]![0]!.parts[0]).toMatchObject({ kind: 'tts' });
  });

  it('has no deeper reading without a model', async () => {
    const { e } = engine();
    expect(await e.analyzeDeeper(BILL, 1500)).toBeNull();
  });
});

describe('playback lifecycle', () => {
  it('always ends the highlight when playback is stopped or replaced', () => {
    const calls: (number | null)[] = [];
    const inner = {
      playing: false,
      playSections: (_s: RenderedSection[], o: PlayOptions) => o.onSection?.(0),
      speak() {}, stop() {},
    } as never;
    const e = withLifecycle(inner);
    e.playSections([], { rate: 1, onSection: (i) => calls.push(i) });
    expect(calls).toEqual([0]);
    e.stop();
    expect(calls).toEqual([0, null]);
    e.playSections([], { rate: 1, onSection: (i) => calls.push(i) });
    e.speak({ text: 'x', parts: [], lang: 'fr' });
    expect(calls).toEqual([0, null, 0, null]);
  });
});

describe('clip failure fallback', () => {
  it('re-renders a failed section in the next language and resumes from it', async () => {
    const calls: { from: number | undefined; langs: string[] }[] = [];
    let fail = true;
    const player = {
      playing: false,
      stop() {},
      play(s: RenderedSection[], o: PlayOptions) {
        calls.push({ from: o.from, langs: s.map((x) => x.lang) });
        if (fail) {
          fail = false;
          o.onSection?.(1);
          o.onError?.(1, new Error('clip missing'));
        }
      },
    };
    const e = createEngineFrom({
      region: json('regions/CM/region.json') as RegionConfig,
      registry: createPackRegistry({ baseUrl: '/packs', fetch: diskFetch }),
      lexicons,
      baseUrl: './',
      today: () => '2026-10-31',
      player,
    });
    const card = await e.analyze(BILL);
    const views = await e.renderCard(card, 'fr');
    expect(views[1]!.utterances?.length).toBeGreaterThan(0);
    const swapped: number[] = [];
    const lit: (number | null)[] = [];
    e.playSections(views, { rate: 1, onSection: (i) => lit.push(i), onFallback: (i) => swapped.push(i) });
    await new Promise((r) => setTimeout(r, 300));
    expect(swapped).toEqual([1]);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.from).toBe(1);
    expect(calls[1]!.langs[1]).toBe('en');
    expect(calls[1]!.langs[0]).toBe('fr');
    expect(lit).not.toContain(null);
  });
});
