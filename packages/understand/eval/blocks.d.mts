// Types for blocks.mjs (used by test/model-card.test.ts).
export declare const DOCS: Record<string, string[]>;
export declare function renderBlocks(results: unknown): Record<string, string>;
export declare function readBlocks(text: string): Record<string, string>;
export declare function fillBlocks(text: string, blocks: Record<string, string>): string;
export declare function outsideBlocks(text: string): string;
