import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({
  platform: 'android',
  plugin: {
    openSettings: vi.fn(async (_o?: unknown) => undefined),
    forgetSharedFiles: vi.fn(async () => undefined),
    takeShareNotes: vi.fn(async () => ({ tooBig: 1, notImage: 2, more: 3 })),
  },
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => env.platform, isNativePlatform: () => env.platform !== 'web', convertFileSrc: (p: string) => p },
  registerPlugin: () => env.plugin,
}));

import { forgetSharedFiles, IOS_SETTINGS_URL, isNative, nativePlatform, openSystemSettings, takeShareNotes } from '../src/lib/native';

describe('native helpers per platform', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    env.platform = 'android';
  });

  it('names the platform, and treats anything unknown as the web', () => {
    expect(nativePlatform()).toBe('android');
    env.platform = 'ios';
    expect(nativePlatform()).toBe('ios');
    expect(isNative()).toBe(true);
    env.platform = 'electron';
    expect(nativePlatform()).toBe('web');
  });

  it('Android uses the SabiToriNative plugin', async () => {
    const open = vi.fn();
    await openSystemSettings('notifications', open);
    expect(env.plugin.openSettings).toHaveBeenCalledWith({ target: 'notifications' });
    expect(open).not.toHaveBeenCalled();
    await forgetSharedFiles();
    expect(env.plugin.forgetSharedFiles).toHaveBeenCalledTimes(1);
    expect(await takeShareNotes()).toEqual({ tooBig: 1, notImage: 2, more: 3 });
  });

  it('iOS never calls the Android-only plugin and opens the Settings app by URL', async () => {
    env.platform = 'ios';
    const open = vi.fn();
    await openSystemSettings('app', open);
    await openSystemSettings('notifications', open);
    expect(open).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenCalledWith(IOS_SETTINGS_URL);
    await forgetSharedFiles();
    expect(await takeShareNotes()).toEqual({ tooBig: 0, notImage: 0, more: 0 });
    expect(env.plugin.openSettings).not.toHaveBeenCalled();
    expect(env.plugin.forgetSharedFiles).not.toHaveBeenCalled();
    expect(env.plugin.takeShareNotes).not.toHaveBeenCalled();
  });

  it('iOS survives a settings URL that cannot be opened', async () => {
    env.platform = 'ios';
    await expect(
      openSystemSettings('app', () => {
        throw new Error('blocked');
      }),
    ).resolves.toBeUndefined();
  });

  it('does nothing in a browser', async () => {
    env.platform = 'web';
    const open = vi.fn();
    await openSystemSettings('app', open);
    expect(open).not.toHaveBeenCalled();
    expect(env.plugin.openSettings).not.toHaveBeenCalled();
    expect(await takeShareNotes()).toEqual({ tooBig: 0, notImage: 0, more: 0 });
  });
});
