import type { Classifier, Facts, MessageInput, Understanding } from '@sabitori/core';
import { ACTION_KINDS, MESSAGE_KINDS, URGENCIES } from '@sabitori/core';
import { applyHeads, combineWithRules, DEFAULT_ENCODER_THRESHOLD, type HeadsFile, type Thresholds } from './encoder-math.js';

export const ENCODER_ID = 'minilm-l12-int8@4';
export const ENCODER_MODEL_FILE = 'encoder.int8.onnx';
/** Files the encoder needs, relative to baseUrl. */
export const ENCODER_FILES = [ENCODER_MODEL_FILE, 'tokenizer.json', 'heads.json'] as const;
export const ENCODER_MAX_TOKENS = 128;

/** The slice of the onnxruntime-web API we use (lets tests and Node inject onnxruntime-node). */
export interface OrtLike {
  InferenceSession: { create(model: Uint8Array, opts?: unknown): Promise<OrtSession> };
  Tensor: new (type: 'int64', data: BigInt64Array, dims: number[]) => unknown;
  env?: { wasm?: Record<string, unknown> };
}
export interface OrtSession {
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: ArrayLike<number> | Float32Array }>>;
}
/** The slice of @huggingface/tokenizers we use. */
export interface TokenizerLike {
  encode(text: string): { ids: number[] };
}

export interface EncoderClassifierOptions {
  /** Where the app serves the model files (tokenizer.json, heads.json, encoder.int8.onnx), e.g. `${BASE_URL}models/minilm/`. */
  baseUrl: string;
  /** Rules: used when the encoder is unsure, and when anything fails. */
  fallback: Classifier;
  /** Confidence needed to take the encoder's label over the rules' (one number, or one per field). Default: heads.json `thresholds`. */
  threshold?: Thresholds;
  /** 0..1 while the files load. */
  onProgress?: (fraction: number) => void;
  /** Where the app serves onnxruntime-web's wasm from, e.g. `${BASE_URL}ort/`. Browser only. */
  wasmBaseUrl?: string;
  id?: string;
  /** Read a file next to the model. Default: fetch(baseUrl + name). Tests and Node pass fs. */
  readFile?: (name: string) => Promise<ArrayBuffer | Uint8Array>;
  /** Inject the runtime (e.g. onnxruntime-node). Default: onnxruntime-web, wasm, one thread. */
  ort?: OrtLike;
}

const dec = new TextDecoder();

async function defaultRead(baseUrl: string, name: string): Promise<Uint8Array> {
  const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  const res = await fetch(base + name);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export interface Encoder {
  /** Mean-pooled sentence embedding (384 floats), not normalised. */
  embed(text: string): Promise<Float32Array>;
  /** Token ids used for `text` (for tests and diagnostics). */
  tokenize(text: string): number[];
  /** True when `text` is longer than the token budget, so the embedding covers only its head. */
  isTruncated(text: string): boolean;
  heads: HeadsFile;
}

function validHeads(h: HeadsFile): void {
  const lists = { kind: MESSAGE_KINDS, action: ACTION_KINDS, urgency: URGENCIES } as const;
  for (const f of ['kind', 'action', 'urgency'] as const) {
    const got = h.heads?.[f]?.labels;
    if (!got || got.length !== lists[f].length || got.some((l, i) => l !== (lists[f] as readonly string[])[i])) {
      throw new Error(`heads.json: labels for ${f} do not match the closed list in @sabitori/core`);
    }
  }
}

export async function loadEncoder(opts: Pick<EncoderClassifierOptions, 'baseUrl' | 'readFile' | 'ort' | 'onProgress' | 'wasmBaseUrl'>): Promise<Encoder> {
  const read = async (n: string) => {
    const b = opts.readFile ? await opts.readFile(n) : await defaultRead(opts.baseUrl, n);
    return b instanceof Uint8Array ? b : new Uint8Array(b);
  };
  const [{ Tokenizer }, ort] = await Promise.all([
    import('@huggingface/tokenizers'),
    opts.ort ? Promise.resolve(opts.ort) : loadOrtWeb(opts.wasmBaseUrl),
  ]);
  opts.onProgress?.(0.1);
  const [tokJson, headsRaw] = await Promise.all([read('tokenizer.json'), read('heads.json')]);
  const heads = JSON.parse(dec.decode(headsRaw)) as HeadsFile;
  validHeads(heads);
  const tokenizer = new Tokenizer(JSON.parse(dec.decode(tokJson)), {}) as unknown as TokenizerLike;
  opts.onProgress?.(0.3);
  const model = await read(ENCODER_MODEL_FILE);
  opts.onProgress?.(0.8);
  const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  opts.onProgress?.(1);

  const tokenize = (text: string) => {
    const ids = tokenizer.encode(text).ids;
    if (ids.length <= ENCODER_MAX_TOKENS) return ids;
    // keep <s> ... </s>: truncate the middle of the body to the budget, like the Python side (right truncation).
    return [...ids.slice(0, ENCODER_MAX_TOKENS - 1), ids[ids.length - 1]!];
  };
  return {
    heads,
    tokenize,
    isTruncated: (text: string) => tokenizer.encode(text).ids.length > ENCODER_MAX_TOKENS,
    async embed(text: string) {
      const ids = tokenize(text);
      const input_ids = new ort.Tensor('int64', BigInt64Array.from(ids, (x) => BigInt(x)), [1, ids.length]);
      const attention_mask = new ort.Tensor('int64', BigInt64Array.from(ids, () => 1n), [1, ids.length]);
      const out = await session.run({ input_ids, attention_mask });
      const v = out['sentence_embedding']!.data;
      return Float32Array.from(v as ArrayLike<number>);
    },
  };
}

/** The onnxruntime-web wasm file the app copies into its `ort/` folder (single-thread SIMD build). */
export const ORT_WASM_FILE = 'ort-wasm-simd-threaded.wasm';

async function loadOrtWeb(wasmBaseUrl?: string): Promise<OrtLike> {
  const ort = (await import('onnxruntime-web/wasm')) as unknown as OrtLike;
  if (ort.env?.wasm) {
    // One thread: needs no COOP/COEP headers, so it works in the Android WebView.
    ort.env.wasm['numThreads'] = 1;
    ort.env.wasm['proxy'] = false;
    if (wasmBaseUrl) {
      const base = wasmBaseUrl.endsWith('/') ? wasmBaseUrl : wasmBaseUrl + '/';
      ort.env.wasm['wasmPaths'] = base;
      // Fetch the wasm binary ourselves and hand it over. When the fetch fails (network lost on a first web
      // visit), this throws a normal, catchable error here; left to the runtime, the same failure surfaces
      // as an uncaught "Aborted(NetworkError ...)" from inside its loader.
      const r = await fetch(`${base}${ORT_WASM_FILE}`);
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${base}${ORT_WASM_FILE}`);
      ort.env.wasm['wasmBinary'] = await r.arrayBuffer();
    }
  }
  return ort;
}

/**
 * Small neural classifier that runs on every message: paraphrase-multilingual-MiniLM-L12 (int8 ONNX)
 * turns the text into an embedding and three linear heads pick kind, action and urgency from the
 * closed lists. It only chooses labels; facts still come from code. When it is unsure, or fails
 * for any reason, the rules answer.
 */
export async function createEncoderClassifier(opts: EncoderClassifierOptions): Promise<Classifier> {
  const enc = await loadEncoder(opts);
  // The first run compiles kernels and allocates buffers (about 3x a normal run): pay for it here, off the user's path.
  await enc.embed('Bonjour').catch(() => undefined);
  const id = opts.id ?? ENCODER_ID;
  const threshold: Thresholds = opts.threshold ?? enc.heads.thresholds ?? DEFAULT_ENCODER_THRESHOLD;
  let queue: Promise<unknown> = Promise.resolve(); // one inference at a time

  return {
    id,
    async classify(input: MessageInput, facts: Facts): Promise<Understanding> {
      const run = queue.then(async () => {
        try {
          return applyHeads(await enc.embed(input.text), enc.heads);
        } catch {
          return null;
        }
      });
      queue = run.catch(() => undefined);
      const [labels, rules] = await Promise.all([run, opts.fallback.classify(input, facts)]);
      // Head-only reading: when the text was cut at the token budget the encoder's action and urgency are
      // ignored (the cut-off part may hold the request or the deadline); the rules read all of it.
      const truncated = labels ? enc.isTruncated(input.text) : false;
      const cues = opts.fallback.urgencyCues?.(input, facts);
      return labels ? combineWithRules(labels, rules, threshold, id, { facts, receivedAt: input.receivedAt, truncated, ...(cues ? { cues } : {}) }) : rules;
    },
  };
}
