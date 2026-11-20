import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const android = resolve(__dirname, '../android/app');

describe('SMS permissions live only in the relay build', () => {
  it('the store manifest declares no SMS permission', () => {
    const main = readFileSync(resolve(android, 'src/main/AndroidManifest.xml'), 'utf8');
    expect(main).not.toMatch(/RECEIVE_SMS|SEND_SMS|READ_SMS/);
  });
  it('the relay manifest declares receive and send, nothing to read the inbox', () => {
    const relay = readFileSync(resolve(android, 'src/relay/AndroidManifest.xml'), 'utf8');
    expect(relay).toMatch(/RECEIVE_SMS/);
    expect(relay).toMatch(/SEND_SMS/);
    expect(relay).not.toMatch(/READ_SMS/);
  });
  it('the relay build has its own app id, so it never replaces the store app', () => {
    const gradle = readFileSync(resolve(android, 'build.gradle'), 'utf8');
    expect(gradle).toMatch(/relay \{[\s\S]*?applicationIdSuffix "\.relay"/);
  });
});
