import { ACTION_KINDS, MESSAGE_KINDS, URGENCIES } from '@sabitori/core';
import type { ActionKind, MessageKind, Urgency, Understanding } from '@sabitori/core';

export interface ModelLabels {
  kind: MessageKind;
  action: ActionKind;
  urgency: Urgency;
  confidence: number;
}

const has = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v);

/** Strict validation of model output. Returns null for anything not exactly valid. */
export function parseModelOutput(raw: string): ModelLabels | null {
  let obj: unknown;
  try {
    const s = raw.trim();
    const a = s.indexOf('{');
    const b = s.lastIndexOf('}');
    if (a < 0 || b < a) return null;
    obj = JSON.parse(s.slice(a, b + 1));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  if (!has(MESSAGE_KINDS, o.kind) || !has(ACTION_KINDS, o.action) || !has(URGENCIES, o.urgency)) return null;
  const c = o.confidence;
  if (typeof c !== 'number' || !Number.isFinite(c) || c < 0 || c > 1) return null;
  return { kind: o.kind, action: o.action, urgency: o.urgency, confidence: c };
}

export const MAX_MODEL_CONFIDENCE = 0.9;
export const DISAGREE_FACTOR = 0.6;

/**
 * Conservative combination. Model confidence is capped at 0.9. If the rule
 * fallback picks a different kind, confidence is multiplied by 0.6 so the
 * card builder is more likely to fall back to facts only.
 */
export function combineConfidence(model: number, modelKind: MessageKind, fallbackKind: MessageKind): number {
  let c = Math.min(Math.max(model, 0), MAX_MODEL_CONFIDENCE);
  if (modelKind !== fallbackKind) c *= DISAGREE_FACTOR;
  return Math.round(c * 100) / 100;
}

export function toUnderstanding(l: ModelLabels, fallback: Understanding, producedBy: string): Understanding {
  return {
    kind: l.kind,
    action: l.action,
    urgency: l.urgency,
    confidence: combineConfidence(l.confidence, l.kind, fallback.kind),
    producedBy,
  };
}
