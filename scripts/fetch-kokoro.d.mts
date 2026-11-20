// Types for scripts/fetch-kokoro.mjs (imported by packages/speech/test/kokoro-runtime.test.ts).
export const KOKORO_DIR: string;
export const REVISION: string;
export const FILES: Readonly<Record<string, string>>;
export const KOKORO_ESPEAK_LANGS: string[];
export function localName(repoPath: string): string;
export function fetchKokoro(opts?: { check?: boolean; log?: (msg: string) => void; dir?: string }): Promise<boolean>;
