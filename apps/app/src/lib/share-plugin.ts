import { CapacitorShareTarget } from '@capgo/capacitor-share-target';
import type { ShareEvent } from './share';

/** The one place that touches the share-target plugin (mocked in tests). */
export async function addShareListener(fn: (e: ShareEvent) => void): Promise<() => void> {
  const handle = await CapacitorShareTarget.addListener('shareReceived', fn);
  return () => void handle.remove();
}
