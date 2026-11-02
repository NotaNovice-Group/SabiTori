/**
 * Synthetic Cameroonian documents for the OCR benchmark.
 * Every template draws on a node-canvas context and records the exact text it drew (ground truth).
 * Content is invented; the layouts imitate typical bills, notices, letters and MoMo SMS screenshots.
 */
import type { SKRSContext2D } from '@napi-rs/canvas';

export type Lang = 'fr' | 'en';
export type Kind = 'eneo' | 'camwater' | 'school' | 'hospital' | 'momo';

export interface Rendered {
  kind: Kind;
  lang: Lang;
  width: number;
  height: number;
  /** Ground-truth text, one line per drawn line, reading order. */
  text: string;
  /** Facts a person would read off the page (hand-labelled while generating). */
  must: { dates: string[]; amounts: number[]; phones: string[] };
}

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type R = () => number;
const pick = <T>(r: R, a: readonly T[]): T => a[Math.floor(r() * a.length)]!;
const int = (r: R, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const pad = (n: number, w = 2) => String(n).padStart(w, '0');
export const group = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const SURNAMES = ['NGONO MBALLA', 'TCHOUPO', 'FOTSO', 'MBARGA', 'NJOYA', 'ATEBA', 'KAMGA', 'ESSOMBA', 'NKENG', 'TABI'];
const FIRST = ['Pauline', 'Jean-Claude', 'Marie', 'Emmanuel', 'Aïcha', 'Brice', 'Christelle', 'Samuel', 'Florence', 'Ngwa'];
const TOWNS = ['Douala', 'Yaoundé', 'Bafoussam', 'Garoua', 'Bamenda', 'Buea', 'Bertoua'];
const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function phone(r: R, spaced = true): { shown: string; e164: string } {
  const p = pick(r, ['677', '678', '699', '698', '655', '670', '690', '651']);
  const a = pad(int(r, 0, 99));
  const b = pad(int(r, 0, 99));
  const c = pad(int(r, 0, 99));
  return { shown: spaced ? `${p} ${a} ${b} ${c}` : `${p}${a}${b}${c}`, e164: `+237${p}${a}${b}${c}` };
}

function date(r: R, lang: Lang, style: 'long' | 'num', monthLo = 11, monthHi = 12): { shown: string; iso: string } {
  const y = 2026;
  const m = int(r, monthLo, monthHi);
  const d = int(r, 3, 27);
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  if (style === 'num') return { shown: `${pad(d)}/${pad(m)}/${y}`, iso };
  return { shown: `${d} ${(lang === 'fr' ? MONTHS_FR : MONTHS_EN)[m - 1]} ${y}`, iso };
}

/* ------------------------------ page helper ------------------------------ */

interface TextOpts {
  size?: number;
  bold?: boolean;
  italic?: boolean;
  font?: string;
  x?: number;
  color?: string;
  align?: 'left' | 'right' | 'center';
  gap?: number;
  record?: boolean;
}

class Page {
  y: number;
  readonly lines: string[] = [];
  constructor(
    readonly ctx: SKRSContext2D,
    readonly w: number,
    readonly h: number,
    readonly margin: number,
    readonly font: string,
    bg: string,
  ) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    this.y = margin;
  }
  private setFont(o: TextOpts) {
    this.ctx.font = `${o.italic ? 'italic ' : ''}${o.bold ? 'bold ' : ''}${o.size ?? 24}px "${o.font ?? this.font}"`;
  }
  text(s: string, o: TextOpts = {}) {
    const size = o.size ?? 24;
    this.setFont(o);
    this.ctx.fillStyle = o.color ?? '#161616';
    this.ctx.textBaseline = 'alphabetic';
    const align = o.align ?? 'left';
    const x = o.x ?? (align === 'right' ? this.w - this.margin : align === 'center' ? this.w / 2 : this.margin);
    this.ctx.textAlign = align;
    this.y += size;
    this.ctx.fillText(s, x, this.y);
    this.y += size * 0.35 + (o.gap ?? 8);
    if (o.record !== false) this.lines.push(s);
  }
  /** Wrap a paragraph to the text width. */
  para(s: string, o: TextOpts = {}) {
    this.setFont(o);
    const max = this.w - 2 * this.margin - (o.x ? o.x - this.margin : 0);
    let line = '';
    for (const word of s.split(' ')) {
      const t = line ? `${line} ${word}` : word;
      if (this.ctx.measureText(t).width > max && line) {
        this.text(line, { ...o, gap: 2 });
        line = word;
      } else line = t;
    }
    if (line) this.text(line, o);
  }
  space(n: number) {
    this.y += n;
  }
  rule(color = '#333', width = 2) {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = width;
    this.ctx.beginPath();
    this.ctx.moveTo(this.margin, this.y);
    this.ctx.lineTo(this.w - this.margin, this.y);
    this.ctx.stroke();
    this.y += 10;
  }
  table(header: string[], rows: string[][], widths: number[], o: { size?: number; zebra?: boolean; boldLast?: boolean } = {}) {
    const size = o.size ?? 22;
    const rowH = size * 1.9;
    const total = widths.reduce((a, b) => a + b, 0);
    const scale = (this.w - 2 * this.margin) / total;
    const xs: number[] = [];
    let acc = this.margin;
    for (const wd of widths) {
      xs.push(acc);
      acc += wd * scale;
    }
    xs.push(acc);
    const ctx = this.ctx;
    const drawRow = (cells: string[], bold: boolean, fill?: string) => {
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fillRect(xs[0]!, this.y, xs[xs.length - 1]! - xs[0]!, rowH);
      }
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(xs[0]!, this.y, xs[xs.length - 1]! - xs[0]!, rowH);
      ctx.font = `${bold ? 'bold ' : ''}${size}px "${this.font}"`;
      ctx.fillStyle = '#161616';
      ctx.textBaseline = 'alphabetic';
      cells.forEach((c, i) => {
        if (i > 0) {
          ctx.beginPath();
          ctx.moveTo(xs[i]!, this.y);
          ctx.lineTo(xs[i]!, this.y + rowH);
          ctx.stroke();
        }
        const right = i > 0;
        ctx.textAlign = right ? 'right' : 'left';
        ctx.fillText(c, right ? xs[i + 1]! - 10 : xs[i]! + 10, this.y + rowH * 0.68);
      });
      this.lines.push(cells.join('  '));
      this.y += rowH;
    };
    drawRow(header, true, '#e4e6e8');
    rows.forEach((row, i) => drawRow(row, !!o.boldLast && i === rows.length - 1, o.zebra && i % 2 ? '#f4f5f6' : undefined));
    this.y += 14;
  }
  fitHeight(): number {
    return Math.min(this.h, Math.max(760, Math.ceil(this.y + 70)));
  }
  get text_(): string {
    return this.lines.join('\n');
  }
}

/* ------------------------------ templates ------------------------------ */

export type Template = (ctx: SKRSContext2D, seed: number, lang: Lang) => Rendered;
const PAGE_W = 1240;
const PAGE_H = 1754;

export const eneo: Template = (ctx, seed, lang) => {
  const r = rng(seed);
  const fr = lang === 'fr';
  const p = new Page(ctx, PAGE_W, PAGE_H, 90, pick(r, ['Liberation Sans', 'Carlito', 'DejaVu Sans']), '#fcfcfa');
  const name = `${pick(r, SURNAMES)} ${pick(r, FIRST)}`;
  const kwh = int(r, 60, 480);
  const energy = kwh * int(r, 50, 79);
  const fixed = pick(r, [1500, 2000, 2500]);
  const tax = Math.round(energy * 0.1925);
  const total = energy + fixed + tax;
  const due = date(r, lang, seed % 2 ? 'long' : 'num');
  const p0 = date(r, lang, 'num', 9, 9);
  const p1 = date(r, lang, 'num', 10, 10);
  const tel = phone(r);
  p.text('ENEO CAMEROON S.A.', { size: 40, bold: true, gap: 4 });
  p.text(fr ? "FACTURE D'ÉLECTRICITÉ" : 'ELECTRICITY BILL', { size: 30, bold: true });
  p.rule();
  p.text(`${fr ? 'Client' : 'Customer'} : ${name}`);
  p.text(`${fr ? 'Adresse' : 'Address'} : ${pick(r, TOWNS)}, ${fr ? 'quartier' : 'neighbourhood'} ${pick(r, ['Bonamoussadi', 'Biyem-Assi', 'Mile 4', 'Akwa', 'Etoudi'])}`);
  p.text(`${fr ? 'N° de contrat' : 'Contract No.'} : 0${int(r, 100000000, 999999999)}`);
  p.text(`${fr ? 'Référence facture' : 'Invoice reference'} : FA-2026-${int(r, 100000, 999999)}`);
  p.text(`${fr ? 'Période de consommation' : 'Billing period'} : ${fr ? 'du' : 'from'} ${p0.shown} ${fr ? 'au' : 'to'} ${p1.shown}`, { gap: 18 });
  const H = fr ? ['Désignation', 'Quantité', 'P.U.', 'Montant'] : ['Description', 'Quantity', 'Unit price', 'Amount'];
  p.table(
    H,
    [
      [fr ? 'Consommation (kWh)' : 'Consumption (kWh)', String(kwh), String(energy / kwh), group(energy)],
      [fr ? 'Redevance fixe' : 'Fixed charge', '1', group(fixed), group(fixed)],
      [fr ? 'Taxe communale et TVA' : 'Council tax and VAT', '', '', group(tax)],
      ['TOTAL', '', '', group(total)],
    ],
    [46, 18, 18, 22],
    { boldLast: true },
  );
  p.space(10);
  p.text(`${fr ? 'Montant net à payer' : 'Net amount payable'} : ${group(total)} FCFA`, { size: 32, bold: true, gap: 14 });
  p.text(`${fr ? 'Date limite de paiement' : 'Payment deadline'} : ${due.shown}`, { size: 28, bold: true, gap: 14 });
  p.para(
    fr
      ? 'Payez par Orange Money, MTN MoMo ou en agence avant la date limite pour éviter la coupure et des pénalités de retard.'
      : 'Pay by Orange Money, MTN MoMo or at an agency before the deadline to avoid disconnection and late penalties.',
  );
  p.text(`${fr ? 'Service client' : 'Customer service'} : ${tel.shown}`, { gap: 14 });
  p.text(fr ? 'Merci de conserver cette facture.' : 'Please keep this bill.', { size: 20, italic: true });
  return { kind: 'eneo', lang, width: PAGE_W, height: p.fitHeight(), text: p.text_, must: { dates: [due.iso], amounts: [total], phones: [tel.e164] } };
};

export const camwater: Template = (ctx, seed, lang) => {
  const r = rng(seed);
  const fr = lang === 'fr';
  const p = new Page(ctx, PAGE_W, PAGE_H, 80, pick(r, ['Liberation Serif', 'Liberation Sans']), '#fbfaf5');
  const m3 = int(r, 5, 40);
  const eau = m3 * pick(r, [205, 214, 350]);
  const loc = pick(r, [1000, 1500]);
  const total = eau + loc;
  const due = date(r, lang, 'long');
  const tel = phone(r, false);
  p.text('CAMEROON WATER UTILITIES CORPORATION', { size: 34, bold: true, gap: 2 });
  p.text('CAMWATER', { size: 44, bold: true, align: 'center', gap: 6 });
  p.text(fr ? "AVIS DE FACTURE D'EAU" : 'WATER BILL NOTICE', { size: 30, bold: true, align: 'center' });
  p.rule('#000', 3);
  p.text(`${fr ? 'Abonné' : 'Subscriber'} : ${pick(r, SURNAMES)} ${pick(r, FIRST)}`);
  p.text(`${fr ? 'Police N°' : 'Policy No.'} : ${int(r, 10000000, 99999999)}`);
  p.text(`${fr ? 'Référence' : 'Reference'} : CW-${int(r, 1000000, 9999999)}`);
  p.text(`${fr ? 'Ancien index' : 'Previous index'} : ${int(r, 100, 900)}    ${fr ? 'Nouvel index' : 'New index'} : ${int(r, 901, 1400)}`, { gap: 16 });
  p.table(
    fr ? ['Libellé', 'Volume m3', 'Montant FCFA'] : ['Item', 'Volume m3', 'Amount FCFA'],
    [
      [fr ? 'Consommation eau' : 'Water consumption', String(m3), group(eau)],
      [fr ? 'Location compteur' : 'Meter rental', '', group(loc)],
      [fr ? 'Total TTC' : 'Total incl. tax', '', group(total)],
    ],
    [50, 20, 30],
    { size: 23, boldLast: true },
  );
  p.space(12);
  p.text(`${fr ? 'Net à payer' : 'Net to pay'} : ${group(total)} FCFA`, { size: 32, bold: true, gap: 14 });
  p.text(`${fr ? 'À régler avant le' : 'To be paid before'} ${due.shown}`, { size: 28, bold: true, gap: 14 });
  p.para(
    fr
      ? "En cas de non-paiement à l'échéance, votre branchement pourra être suspendu. Pour toute réclamation, appelez le service clientèle."
      : 'If payment is not received by the due date, your connection may be suspended. For any complaint, call customer care.',
  );
  p.text(`${fr ? 'Service clientèle' : 'Customer care'} : ${tel.shown}`, { gap: 12 });
  return { kind: 'camwater', lang, width: PAGE_W, height: p.fitHeight(), text: p.text_, must: { dates: [due.iso], amounts: [total], phones: [tel.e164] } };
};

export const school: Template = (ctx, seed, lang) => {
  const r = rng(seed);
  const fr = lang === 'fr';
  const p = new Page(ctx, PAGE_W, PAGE_H, 100, pick(r, ['Liberation Serif', 'FreeSerif', 'Carlito']), '#fdfdfd');
  const t1 = pick(r, [25000, 30000, 40000, 50000]);
  const t2 = t1;
  const t3 = pick(r, [15000, 20000]);
  const total = t1 + t2 + t3;
  const d1 = date(r, lang, 'long', 11, 11);
  const d2 = date(r, lang, 'num', 12, 12);
  const tel = phone(r);
  p.text(fr ? 'RÉPUBLIQUE DU CAMEROUN' : 'REPUBLIC OF CAMEROON', { size: 26, bold: true, align: 'center', gap: 0 });
  p.text(fr ? 'Paix - Travail - Patrie' : 'Peace - Work - Fatherland', { size: 22, italic: true, align: 'center', gap: 14 });
  p.text(fr ? 'COLLÈGE BILINGUE LA RÉUSSITE' : 'GOVERNMENT BILINGUAL HIGH SCHOOL', { size: 32, bold: true, align: 'center' });
  p.rule();
  p.text(fr ? 'AVIS DE PAIEMENT DES FRAIS DE SCOLARITÉ' : 'NOTICE OF SCHOOL FEES PAYMENT', { size: 30, bold: true, align: 'center', gap: 18 });
  p.para(fr ? `Chers parents, nous vous informons que les frais de scolarité de votre enfant (${pick(r, FIRST)}, classe de ${pick(r, ['6ème', '5ème', '3ème', 'Seconde'])}) sont à régler comme suit.` : `Dear parents, we inform you that the school fees of your child (${pick(r, FIRST)}, Form ${int(r, 1, 5)}) are to be paid as follows.`, { size: 25 });
  p.space(10);
  p.table(
    fr ? ['Tranche', 'Échéance', 'Montant'] : ['Instalment', 'Deadline', 'Amount'],
    [
      [fr ? '1ère tranche' : '1st instalment', d1.shown, `${group(t1)} FCFA`],
      [fr ? '2ème tranche' : '2nd instalment', d2.shown, `${group(t2)} FCFA`],
      [fr ? 'APEE et assurance' : 'PTA and insurance', d2.shown, `${group(t3)} FCFA`],
    ],
    [34, 34, 32],
    { size: 24, zebra: true },
  );
  p.text(`${fr ? 'Total annuel' : 'Annual total'} : ${group(total)} FCFA`, { size: 28, bold: true, gap: 14 });
  p.para(
    fr
      ? "Les élèves n'ayant pas réglé la première tranche à la date indiquée ne seront pas admis en classe. Les paiements se font à la comptabilité ou par Mobile Money."
      : 'Students who have not paid the first instalment by the date indicated will not be admitted to class. Payment is made at the bursar office or by Mobile Money.',
    { size: 25 },
  );
  p.text(`${fr ? 'Renseignements' : 'Enquiries'} : ${tel.shown}`, { size: 25, gap: 18 });
  p.text(fr ? 'Le Principal' : 'The Principal', { size: 25, align: 'right' });
  return { kind: 'school', lang, width: PAGE_W, height: p.fitHeight(), text: p.text_, must: { dates: [d1.iso, d2.iso], amounts: [t1, t2, t3, total], phones: [tel.e164] } };
};

export const hospital: Template = (ctx, seed, lang) => {
  const r = rng(seed);
  const fr = lang === 'fr';
  const p = new Page(ctx, PAGE_W, PAGE_H, 100, pick(r, ['Liberation Sans', 'Carlito', 'FreeSans']), '#fcfcfb');
  const d = date(r, lang, seed % 2 ? 'long' : 'num');
  const hour = `${int(r, 7, 15)}h${pick(r, ['00', '30'])}`;
  const fee = pick(r, [5000, 10000, 15000, 3500]);
  const tel = phone(r);
  p.text(fr ? 'HÔPITAL RÉGIONAL DE ' + pick(r, TOWNS).toUpperCase() : pick(r, TOWNS).toUpperCase() + ' REGIONAL HOSPITAL', { size: 34, bold: true });
  p.text(fr ? 'Service de consultation externe' : 'Outpatient department', { size: 26, italic: true });
  p.rule();
  p.text(`${fr ? 'Douala, le' : 'Date issued:'} ${date(r, lang, 'long', 10, 10).shown}`, { align: 'right', gap: 18 });
  p.text(fr ? 'OBJET : Rendez-vous de consultation' : 'SUBJECT: Consultation appointment', { size: 27, bold: true, gap: 18 });
  p.text(`${fr ? 'Madame, Monsieur' : 'Dear patient'} ${pick(r, SURNAMES)},`, { size: 25, gap: 14 });
  p.para(
    fr
      ? `Nous avons le plaisir de vous confirmer votre rendez-vous avec le docteur ${pick(r, SURNAMES.map((s) => s.split(' ')[0]!))} le ${d.shown} à ${hour}.`
      : `We are pleased to confirm your appointment with Dr. ${pick(r, SURNAMES.map((s) => s.split(' ')[0]!))} on ${d.shown} at ${hour.replace('h', ':')}.`,
    { size: 25 },
  );
  p.space(8);
  p.para(
    fr
      ? `Merci de vous présenter 30 minutes avant, avec votre carnet de santé et vos anciens examens. Les frais de consultation s'élèvent à ${group(fee)} FCFA, payables à la caisse.`
      : `Please arrive 30 minutes early with your health booklet and previous test results. The consultation fee is ${group(fee)} FCFA, payable at the cashier.`,
    { size: 25 },
  );
  p.space(8);
  p.para(
    fr ? 'En cas d’empêchement, veuillez nous prévenir au moins 24 heures à l’avance.' : 'If you cannot attend, please let us know at least 24 hours in advance.',
    { size: 25 },
  );
  p.text(`${fr ? 'Secrétariat médical' : 'Medical secretariat'} : ${tel.shown}`, { size: 25, gap: 20 });
  p.text(fr ? 'Le Directeur' : 'The Director', { size: 25, align: 'right' });
  return { kind: 'hospital', lang, width: PAGE_W, height: p.fitHeight(), text: p.text_, must: { dates: [d.iso], amounts: [fee], phones: [tel.e164] } };
};

/** Phone screenshot with an incoming Mobile Money / operator SMS bubble. */
export const momo: Template = (ctx, seed, lang) => {
  const r = rng(seed);
  const fr = lang === 'fr';
  const W = 1080;
  const H = 1500;
  const dark = seed % 3 === 0;
  const p = new Page(ctx, W, H, 60, 'Inter', dark ? '#121418' : '#f3f4f6');
  const amt = int(r, 5, 480) * 100;
  const fee = Math.max(100, Math.round(amt * 0.02 / 50) * 50);
  const bal = int(r, 1000, 90000);
  const d = date(r, lang, 'num', 10, 11);
  const tel = phone(r, false);
  const sender = pick(r, ['MTN MoMo', 'Orange Money', 'MobileMoney']);
  // status bar and header (not recorded)
  p.text('9:41', { size: 30, bold: true, color: dark ? '#fff' : '#111', record: false, gap: 24 });
  p.text(sender, { size: 40, bold: true, color: dark ? '#fff' : '#111', record: false, gap: 30 });
  const lines: string[] = fr
    ? [
        `Vous avez envoye ${group(amt)} FCFA a ${pick(r, FIRST).toUpperCase()} ${pick(r, SURNAMES.map((s) => s.split(' ')[0]!)).toUpperCase()} (${tel.shown}) le ${d.shown}.`,
        `Frais: ${group(fee)} FCFA. Nouveau solde: ${group(bal)} FCFA.`,
        `ID de transaction: ${int(r, 1000000000, 9999999999)}.`,
        `Pour toute reclamation appelez le 8${int(r, 100, 999)}.`,
      ]
    : [
        `You have sent ${group(amt)} FCFA to ${pick(r, FIRST).toUpperCase()} ${pick(r, SURNAMES.map((s) => s.split(' ')[0]!)).toUpperCase()} (${tel.shown}) on ${d.shown}.`,
        `Fee: ${group(fee)} FCFA. New balance: ${group(bal)} FCFA.`,
        `Transaction ID: ${int(r, 1000000000, 9999999999)}.`,
        `For any complaint call 8${int(r, 100, 999)}.`,
      ];
  // bubble
  const size = 34;
  const font = `${size}px "Inter"`;
  ctx.font = font;
  const maxW = W - 2 * 60 - 80;
  const wrapped: string[] = [];
  for (const l of lines) {
    let cur = '';
    for (const w of l.split(' ')) {
      const t = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(t).width > maxW && cur) {
        wrapped.push(cur);
        cur = w;
      } else cur = t;
    }
    wrapped.push(cur);
    wrapped.push('\u0000'); // paragraph gap marker
  }
  const lh = size * 1.45;
  const bh = wrapped.reduce((a, w) => a + (w === '\u0000' ? 10 : lh), 0) + 50;
  ctx.fillStyle = dark ? '#2a2f38' : '#ffffff';
  const bx = 60;
  const by = p.y;
  ctx.beginPath();
  ctx.roundRect(bx, by, W - 120, bh, 36);
  ctx.fill();
  ctx.fillStyle = dark ? '#f1f3f5' : '#14161a';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  let y = by + 25 + size;
  for (const w of wrapped) {
    if (w === '\u0000') y += 10;
    else {
      ctx.fillText(w, bx + 40, y);
      y += lh;
    }
  }
  p.lines.push(...lines.map((l) => l));
  return { kind: 'momo', lang, width: W, height: H, text: lines.join('\n'), must: { dates: [d.iso], amounts: [amt, fee, bal], phones: [tel.e164] } };
};

export interface DocPlan {
  id: string;
  kind: Kind;
  lang: Lang;
  seed: number;
  /** 0 mild .. 1 harsh */
  severity: number;
  /** extra rotation of the photo itself, degrees clockwise (0 normally) */
  turn?: 0 | 90 | 180;
}

export const TEMPLATES: Record<Kind, Template> = { eneo, camwater, school, hospital, momo };

/** 30 images: mixed kinds and languages, severity spread over the range, two sideways/upside-down shots. */
export function plan(): DocPlan[] {
  const out: DocPlan[] = [];
  const add = (kind: Kind, lang: Lang, n: number, turns: Record<number, 0 | 90 | 180> = {}) => {
    for (let i = 0; i < n; i++) {
      const seed = 1000 + out.length * 37;
      out.push({ id: `${String(out.length + 1).padStart(2, '0')}-${kind}-${lang}`, kind, lang, seed, severity: 0, turn: turns[i] ?? 0 });
    }
  };
  add('eneo', 'fr', 6, { 5: 180 });
  add('eneo', 'en', 2);
  add('camwater', 'fr', 4);
  add('school', 'fr', 4, { 3: 90 });
  add('school', 'en', 2);
  add('hospital', 'fr', 3);
  add('hospital', 'en', 2);
  add('momo', 'fr', 3);
  add('momo', 'en', 2);
  // 28 above: add two more bills to reach 30
  add('camwater', 'en', 1);
  add('hospital', 'fr', 1);
  // severity spread deterministically
  out.forEach((d, i) => (d.severity = ((i * 0.37) % 1) * 0.9 + 0.1));
  return out;
}
