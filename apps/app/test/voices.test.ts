import { describe, expect, it, vi } from 'vitest';
import type { TtsBackend } from '@sabitori/speech';
import { createAppTts } from '../src/engine/native-player';

describe('createAppTts', () => {
  const system: TtsBackend = { speak: vi.fn(async () => undefined), cancel: vi.fn() };
  it('uses the system voice directly where Piper cannot run', () => {
    expect(createAppTts(system, { piper: false })).toBe(system);
  });
});
