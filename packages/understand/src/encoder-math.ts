/**
 * Pure maths for the encoder classifier: mean pooling is done by the ONNX graph, so here we only
 * normalise, apply the three linear heads, soften with a temperature and combine with the rules.
 * No I/O, no model: unit-testable.
 */
import type { ActionKind, MessageKind, Understanding, Urgency } from '@sabitori/core';

export const ENCODER_FIELDS = ['kind', 'action', 'urgency'] as const;
export type EncoderField = (typeof ENCODER_FIELDS)[number];

export interface HeadWeights {
  labels: string[];
  /** [classes][dim] */
  W: number[][];
  b: number[];
  /** Calibration: probabilities are softmax(logits / temperature). */
  temperature: number;
}
export interface HeadsFile {
  version: 1;
  dim: number;
  /** L2-normalise the embedding before the heads. */
  normalise: boolean;
  heads: Record<EncoderField, HeadWeights>;
  /** Per-field confidence needed to take the encoder's label over the rules'. Picked on the train split (out-of-fold). */
  thresholds?: Partial<Record<EncoderField, number>>;
}
export type Thresholds = number | Partial<Record<EncoderField, number>>;

export interface HeadResult {
  label: string;
  /** Calibrated probability of `label`. */
  p: number;
  probs: number[];
}
export type EncoderLabels = Record<EncoderField, HeadResult>;

export function l2normalise(v: ArrayLike<number>): Float32Array {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i]! * v[i]!;
  const n = Math.sqrt(s) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i]! / n;
  return out;
}

export function softmax(logits: number[], temperature = 1): number[] {
  const t = temperature > 0 ? temperature : 1;
  let max = -Infinity;
  for (const x of logits) if (x / t > max) max = x / t;
  const e = logits.map((x) => Math.exp(x / t - max));
  const sum = e.reduce((a, b) => a + b, 0) || 1;
  return e.map((x) => x / sum);
}

export function applyHead(emb: ArrayLike<number>, h: HeadWeights): HeadResult {
  const logits = h.W.map((row, c) => {
    let s = h.b[c] ?? 0;
    for (let i = 0; i < row.length; i++) s += row[i]! * emb[i]!;
    return s;
  });
  const probs = softmax(logits, h.temperature);
  let best = 0;
  for (let i = 1; i < probs.length; i++) if (probs[i]! > probs[best]!) best = i;
  return { label: h.labels[best]!, p: probs[best]!, probs };
}

export function applyHeads(embedding: ArrayLike<number>, file: HeadsFile): EncoderLabels {
  if (embedding.length !== file.dim) throw new Error(`embedding has ${embedding.length} values, heads expect ${file.dim}`);
  const e = file.normalise ? l2normalise(embedding) : embedding;
  return {
    kind: applyHead(e, file.heads.kind),
    action: applyHead(e, file.heads.action),
    urgency: applyHead(e, file.heads.urgency),
  };
}

/** Confidence is capped so a card never claims certainty. Same cap as the LLM path. */
export const MAX_ENCODER_CONFIDENCE = 0.95;
/** Default per-field threshold; the real value is picked on the train split (see model-card.md). */
export const DEFAULT_ENCODER_THRESHOLD = 0.6;

const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Combine the encoder with the rules, field by field. A field takes the encoder's label only when
 * the encoder's calibrated probability for it is at least `threshold`; otherwise the rules' label
 * stays. The result's confidence is the lowest confidence among the sources actually used, so a
 * card that leans on an unsure rule match still falls back to "facts only". Labels only: the
 * encoder cannot add, change or invent a fact (dates, amounts, phones, references come from code).
 */
export function combineWithRules(enc: EncoderLabels, rules: Understanding, threshold: Thresholds, id: string): Understanding {
  const at = (f: EncoderField) => (typeof threshold === 'number' ? threshold : threshold[f] ?? DEFAULT_ENCODER_THRESHOLD);
  const useKind = enc.kind.p >= at('kind');
  const useAction = enc.action.p >= at('action');
  const useUrgency = enc.urgency.p >= at('urgency');
  if (!useKind && !useAction && !useUrgency) return rules;
  const confs: number[] = [];
  const pick = <T extends string>(use: boolean, h: HeadResult, r: T): T => {
    if (use) {
      confs.push(Math.min(h.p, MAX_ENCODER_CONFIDENCE));
      return h.label as T;
    }
    confs.push(rules.confidence);
    return r;
  };
  const kind = pick<MessageKind>(useKind, enc.kind, rules.kind);
  const action = pick<ActionKind>(useAction, enc.action, rules.action);
  const urgency = pick<Urgency>(useUrgency, enc.urgency, rules.urgency);
  return { kind, action, urgency, confidence: round2(Math.min(...confs)), producedBy: id };
}
