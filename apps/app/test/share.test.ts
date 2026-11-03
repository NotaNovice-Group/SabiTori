import { describe, expect, it, vi } from 'vitest';

const plugin = vi.hoisted(() => ({ addListener: vi.fn() }));
vi.mock('@capgo/capacitor-share-target', () => ({ CapacitorShareTarget: plugin }));

import { listenShares, routeShare, sharedTextOf, type ShareDeps } from '../src/lib/share';

function deps(over: Partial<ShareDeps> = {}) {
  return {
    setPhoto: vi.fn<(f: File | null) => void>(),
    setSharedText: vi.fn<(t: string | null) => void>(),
    navigate: vi.fn<(p: string) => void>(),
    loadImage: vi.fn(async (f: { name: string; mimeType: string }) => new File(['x'], f.name, { type: f.mimeType })),
    done: vi.fn<() => void>(),
    stamp: () => 7,
    ...over,
  } as ShareDeps & {
    setPhoto: ReturnType<typeof vi.fn<(f: File | null) => void>>;
    setSharedText: ReturnType<typeof vi.fn<(t: string | null) => void>>;
    navigate: ReturnType<typeof vi.fn<(p: string) => void>>;
    loadImage: ReturnType<typeof vi.fn>;
    done: ReturnType<typeof vi.fn<() => void>>;
  };
}

describe('share intake routing', () => {
  it('text goes to the paste flow, prefilled', async () => {
    const d = deps();
    expect(await routeShare({ title: '', texts: ['Orange Money: you received 5000 FCFA'], files: [] }, d)).toBe('text');
    expect(d.setSharedText).toHaveBeenCalledWith('Orange Money: you received 5000 FCFA');
    expect(d.navigate).toHaveBeenCalledWith('/paste?s=7');
    expect(d.setPhoto).not.toHaveBeenCalled();
    expect(d.loadImage).not.toHaveBeenCalled();
  });

  it('an image goes to the capture flow without the camera', async () => {
    const d = deps();
    const out = await routeShare({ texts: [], files: [{ uri: '/data/cache/shared_files/share-1.tmp', name: 'IMG-1.jpg', mimeType: 'image/jpeg' }] }, d);
    expect(out).toBe('photo');
    expect(d.setPhoto).toHaveBeenCalledTimes(1);
    expect((d.setPhoto.mock.calls[0]![0] as File).type).toBe('image/jpeg');
    expect(d.navigate).toHaveBeenCalledWith('/capture?s=7');
    expect(d.done).toHaveBeenCalled();
    expect(d.setSharedText).not.toHaveBeenCalled();
  });

  it('an image wins over text that came with it; a share of non-images only says so and cleans up', async () => {
    const d = deps();
    await routeShare({ texts: ['caption'], files: [{ uri: 'a', name: 'a.pdf', mimeType: 'application/pdf' }, { uri: 'b', name: 'b.png', mimeType: 'image/png' }] }, d);
    expect(d.loadImage).toHaveBeenCalledTimes(1);
    expect(d.navigate).toHaveBeenCalledWith('/capture?s=7');
    const setNotice = vi.fn();
    const e = deps({ setNotice });
    expect(await routeShare({ files: [{ uri: 'a', name: 'a.pdf', mimeType: 'application/pdf' }] }, e)).toBe('unsupported');
    expect(e.navigate).toHaveBeenCalledWith('/?s=7');
    expect(setNotice).toHaveBeenCalledWith('app.share.unsupported');
    expect(e.done).toHaveBeenCalledTimes(1);
  });

  it('falls back to the text when the image cannot be read', async () => {
    const d = deps({ loadImage: vi.fn(async () => { throw new Error('gone'); }) });
    expect(await routeShare({ texts: ['hello there'], files: [{ uri: 'a', name: 'a.jpg', mimeType: 'image/jpeg' }] }, d)).toBe('text');
    expect(d.navigate).toHaveBeenCalledWith('/paste?s=7');
    expect(d.done).toHaveBeenCalled();
  });

  it('ignores an empty share', async () => {
    const d = deps();
    expect(await routeShare({ title: ' ', texts: ['  '], files: [] }, d)).toBe('ignored');
    expect(d.navigate).not.toHaveBeenCalled();
  });

  it('joins a subject with the body unless the body already contains it', () => {
    expect(sharedTextOf({ title: 'Bill', texts: ['Pay by Friday'] })).toBe('Bill\nPay by Friday');
    expect(sharedTextOf({ title: 'Pay', texts: ['Pay by Friday'] })).toBe('Pay by Friday');
  });
});

describe('share listener (cold and warm start)', () => {
  it('delivers events the plugin sends, including the one retained from a cold start', async () => {
    let fn: (e: unknown) => void = () => undefined;
    const remove = vi.fn();
    // A cold-start share is retained by the plugin and delivered the moment a listener registers.
    plugin.addListener.mockImplementation(async (name: string, f: (e: unknown) => void) => {
      expect(name).toBe('shareReceived');
      fn = f;
      f({ title: '', texts: ['cold start text'], files: [] });
      return { remove };
    });
    const d = deps();
    const off = await listenShares(d);
    await vi.waitFor(() => expect(d.setSharedText).toHaveBeenCalledWith('cold start text'));
    fn({ title: '', texts: ['warm start text'], files: [] });
    await vi.waitFor(() => expect(d.setSharedText).toHaveBeenLastCalledWith('warm start text'));
    off();
    expect(remove).toHaveBeenCalled();
  });
});
