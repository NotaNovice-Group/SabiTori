import type { Classifier, Facts, MessageInput, Understanding } from '@sabitori/core';
import { buildGrammar, buildMessages } from './prompt.js';
import { parseModelOutput, toUnderstanding } from './parse.js';

export const CLASSIFIER_ID = 'qwen2.5-1.5b-q4@1';
export const DEFAULT_TIMEOUT_MS = 25_000;
export const MAX_TOKENS = 48;

export interface WllamaAssetPaths {
  default: string;
  'single-thread/wllama.wasm': string;
  'multi-thread/wllama.wasm': string;
}

/**
 * Paths of the wasm files the app bundles (see docs/model.md for the copy step).
 * wllama 3.8 ships a single wasm; the app must copy it to `<baseUrl>/wllama.wasm`.
 */
export function wllamaAssetPaths(baseUrl: string): WllamaAssetPaths {
  const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  const p = `${base}wllama.wasm`;
  return { default: p, 'single-thread/wllama.wasm': p, 'multi-thread/wllama.wasm': p };
}

export interface LlmClassifierOptions {
  /** GGUF file (from modelStore.load()) or a URL served by the app itself. */
  model: Blob | string;
  fallback: Classifier;
  /** 0..1 while loading the model. */
  onProgress?: (fraction: number) => void;
  threads?: number;
  /** Per-classify time limit in ms. Default 25000. */
  timeoutMs?: number;
  /** Where the app serves wllama's wasm from. Default "/wllama/". */
  wasmBaseUrl?: string;
  /** Classifier id override (e.g. for the 3B model). */
  id?: string;
  /** @internal test hook: replaces the wllama engine. */
  engine?: LlmEngine;
}

/** The small slice of wllama we use. */
export interface LlmEngine {
  complete(args: { messages: { role: string; content: string }[]; grammar: string; signal: AbortSignal }): Promise<string>;
}

async function createWllamaEngine(opts: LlmClassifierOptions): Promise<LlmEngine> {
  const { Wllama } = await import('@wllama/wllama');
  const w = new Wllama(wllamaAssetPaths(opts.wasmBaseUrl ?? '/wllama/'), { allowOffline: true });
  const params = {
    n_ctx: 2048,
    ...(opts.threads ? { n_threads: opts.threads } : {}),
  };
  if (typeof opts.model === 'string') {
    await w.loadModelFromUrl(opts.model, {
      ...params,
      progressCallback: ({ loaded, total }: { loaded: number; total: number }) =>
        opts.onProgress?.(total ? loaded / total : 0),
    });
  } else {
    await w.loadModel([opts.model], params);
  }
  opts.onProgress?.(1);
  return {
    async complete({ messages, grammar, signal }) {
      const r = await w.createChatCompletion({
        messages: messages as never,
        grammar,
        temperature: 0,
        top_k: 1,
        max_tokens: MAX_TOKENS,
        abortSignal: signal,
      });
      const c = r.choices[0]?.message?.content;
      return typeof c === 'string' ? c : '';
    },
  };
}

export async function createLlmClassifier(opts: LlmClassifierOptions): Promise<Classifier> {
  const engine = opts.engine ?? (await createWllamaEngine(opts));
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const id = opts.id ?? CLASSIFIER_ID;
  const grammar = buildGrammar();
  let queue: Promise<unknown> = Promise.resolve(); // one inference at a time

  async function runModel(input: MessageInput): Promise<string> {
    const ctl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, rej) => {
      timer = setTimeout(() => {
        ctl.abort();
        rej(new Error('timeout'));
      }, timeoutMs);
    });
    try {
      return await Promise.race([engine.complete({ messages: buildMessages(input), grammar, signal: ctl.signal }), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    id,
    async classify(input: MessageInput, facts: Facts): Promise<Understanding> {
      // Model and rules run together; rules are the answer whenever the model fails.
      const run = queue.then(async () => {
        try {
          const out = await runModel(input);
          const labels = parseModelOutput(out);
          if (!labels) return null;
          return labels;
        } catch {
          return null;
        }
      });
      queue = run.catch(() => undefined);
      const [labels, fb] = await Promise.all([run, opts.fallback.classify(input, facts)]);
      return labels ? toUnderstanding(labels, fb, id) : fb;
    },
  };
}
