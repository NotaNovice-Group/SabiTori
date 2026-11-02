/** Saving a clip to IndexedDB can fail (storage full, blocked, private window). The clip is then only in memory and must show as not saved. */
export async function persistClip(save: () => Promise<unknown>): Promise<boolean> {
  try {
    await save();
    return true;
  } catch {
    return false;
  }
}

/** The set of clip ids that are not saved on this device, after trying to save `id`. */
export function withUnsaved(prev: ReadonlySet<string>, id: string, saved: boolean): ReadonlySet<string> {
  if (saved === !prev.has(id)) return prev;
  const next = new Set(prev);
  if (saved) next.delete(id);
  else next.add(id);
  return next;
}
