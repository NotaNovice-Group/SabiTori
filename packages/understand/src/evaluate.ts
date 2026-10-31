import type { ActionKind, Classifier, Facts, MessageInput, MessageKind, Understanding, Urgency } from '@sabitori/core';

export interface EvalCase {
  id?: string;
  input: MessageInput;
  /** Facts for the case; if omitted, empty facts are used. */
  facts?: Facts;
  expected: { kind?: MessageKind; action?: ActionKind; urgency?: Urgency };
}

export type EvalField = 'kind' | 'action' | 'urgency';
const FIELDS: EvalField[] = ['kind', 'action', 'urgency'];

export interface EvalReport {
  total: number;
  /** Cases where the classifier threw. Counted as wrong. */
  errors: number;
  /** Per field: correct / cases that had an expected value for it (0 if none). */
  accuracy: Record<EvalField, number>;
  /** Share of cases where every expected field was right. */
  accuracyAll: number;
  meanConfidence: number;
  /** confusion[field][expected][predicted] = count */
  confusion: Record<EvalField, Record<string, Record<string, number>>>;
  /** Cases with at least one wrong field. */
  failures: { id: string; expected: EvalCase['expected']; got?: Pick<Understanding, EvalField | 'confidence'> }[];
}

export const emptyFacts = (): Facts => ({
  lang: 'unknown',
  dates: [],
  amounts: [],
  phones: [],
  references: [],
  urls: [],
  ussdCodes: [],
});

export async function evaluate(classifier: Classifier, cases: readonly EvalCase[]): Promise<EvalReport> {
  const correct = { kind: 0, action: 0, urgency: 0 };
  const seen = { kind: 0, action: 0, urgency: 0 };
  const confusion: EvalReport['confusion'] = { kind: {}, action: {}, urgency: {} };
  const failures: EvalReport['failures'] = [];
  let errors = 0;
  let allOk = 0;
  let confSum = 0;
  let confN = 0;

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]!;
    const id = c.id ?? String(i);
    let u: Understanding | undefined;
    try {
      u = await classifier.classify(c.input, c.facts ?? emptyFacts());
    } catch {
      errors++;
    }
    if (u) {
      confSum += u.confidence;
      confN++;
    }
    let ok = true;
    for (const f of FIELDS) {
      const exp = c.expected[f];
      if (exp === undefined) continue;
      seen[f]++;
      const got = u ? u[f] : '(error)';
      const row = (confusion[f][exp] ??= {});
      row[got] = (row[got] ?? 0) + 1;
      if (got === exp) correct[f]++;
      else ok = false;
    }
    if (ok) allOk++;
    else
      failures.push({
        id,
        expected: c.expected,
        ...(u ? { got: { kind: u.kind, action: u.action, urgency: u.urgency, confidence: u.confidence } } : {}),
      });
  }

  const ratio = (a: number, b: number) => (b === 0 ? 0 : a / b);
  return {
    total: cases.length,
    errors,
    accuracy: {
      kind: ratio(correct.kind, seen.kind),
      action: ratio(correct.action, seen.action),
      urgency: ratio(correct.urgency, seen.urgency),
    },
    accuracyAll: ratio(allOk, cases.length),
    meanConfidence: ratio(confSum, confN),
    confusion,
    failures,
  };
}
