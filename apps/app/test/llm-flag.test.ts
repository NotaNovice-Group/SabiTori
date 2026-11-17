import { describe, expect, it } from 'vitest';
import type { Classifier } from '@sabitori/core';
import { createModelController, llmEnabled } from '../src/engine/model';

const rules = { id: 'rules@1' } as unknown as Classifier;

describe('optional LLM build flag', () => {
  it('is off unless the build says VITE_LLM=1', () => {
    expect(llmEnabled({})).toBe(false);
    expect(llmEnabled({ VITE_LLM: '' })).toBe(false);
    expect(llmEnabled({ VITE_LLM: '0' })).toBe(false);
    expect(llmEnabled({ VITE_LLM: ' 1 ' })).toBe(true);
  });

  it('a build without it hides the option, never loads a model, and refuses a file', async () => {
    const m = createModelController(rules, '/', false);
    expect(await m.available()).toBe(false);
    await m.init();
    expect(m.state().status).toBe('unsupported');
    expect(await m.llm(10)).toBeNull();
    expect(m.classifier()).toBe(rules);
    await expect(m.save(new Blob(['GGUF']))).rejects.toMatchObject({ code: 'unavailable' });
    expect(m.state().status).toBe('unsupported');
  });
});
