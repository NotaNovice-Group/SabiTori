import type { Classifier, Facts, MessageInput, Understanding } from '@sabitori/core';
import { createEncoderClassifier } from '@sabitori/understand';

export type EncoderStatus = 'idle' | 'loading' | 'ready' | 'failed';
export interface EncoderState {
  status: EncoderStatus;
  progress: number;
}

/**
 * The built-in small neural classifier (MiniLM int8, ~35 MB, ships inside the app). It is the DEFAULT
 * understanding step for every message. It loads once, lazily, after first paint; until it is ready
 * (and whenever it fails or is unsure) the rules answer, so the card never waits for it.
 */
export function createEncoderController(rules: Classifier, baseUrl: string) {
  let impl: Classifier | null = null;
  let state: EncoderState = { status: 'idle', progress: 0 };
  const listeners = new Set<(s: EncoderState) => void>();
  const set = (patch: Partial<EncoderState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l(state));
  };

  let started: Promise<void> | null = null;
  function init(): Promise<void> {
    return (started ??= (async () => {
      try {
        set({ status: 'loading', progress: 0 });
        impl = await createEncoderClassifier({
          baseUrl: `${baseUrl}models/minilm/`,
          // absolute: the runtime imports its loader from here, and a relative path would resolve against the JS bundle
          wasmBaseUrl: new URL(`${baseUrl}ort/`, document.baseURI).href,
          fallback: rules,
          onProgress: (f) => set({ progress: f }),
        });
        set({ status: 'ready', progress: 1 });
      } catch {
        impl = null;
        set({ status: 'failed' });
      }
    })());
  }

  const classifier: Classifier = {
    get id() {
      return impl ? impl.id : rules.id;
    },
    classify(input: MessageInput, facts: Facts): Promise<Understanding> {
      return (impl ?? rules).classify(input, facts);
    },
  };

  return {
    state: () => state,
    subscribe(fn: (s: EncoderState) => void) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    init,
    /** Encoder once loaded, rules before that. */
    classifier,
  };
}
