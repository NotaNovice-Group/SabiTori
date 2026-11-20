import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { fileFromNativePath } from './native';

export type PhotoSource = 'camera' | 'gallery';
export type PhotoOutcome = { ok: true; file: File } | { ok: false; reason: 'cancelled' | 'denied' | 'failed'; detail?: string };

const messageOf = (e: unknown) => String((e as { message?: unknown } | null)?.message ?? e ?? '').toLowerCase();

/**
 * The Android camera / photo picker. The camera permission is asked for only here, when the
 * person taps a photo button. The gallery uses the system photo picker and needs no permission.
 */
export async function pickNativePhoto(source: PhotoSource): Promise<PhotoOutcome> {
  try {
    if (source === 'camera') {
      let state = (await Camera.checkPermissions()).camera;
      if (state === 'prompt' || state === 'prompt-with-rationale') state = (await Camera.requestPermissions({ permissions: ['camera'] })).camera;
      if (state !== 'granted') return { ok: false, reason: 'denied' };
    }
    const photo = await Camera.getPhoto({
      source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
      resultType: CameraResultType.Uri,
      quality: 85,
      width: 2000,
      correctOrientation: true,
      saveToGallery: false,
      allowEditing: false,
    });
    if (!photo.webPath) return { ok: false, reason: 'failed', detail: 'no webPath in the camera result' };
    const file = await fileFromNativePath(photo.webPath, `photo.${photo.format || 'jpeg'}`, `image/${photo.format === 'jpg' ? 'jpeg' : photo.format || 'jpeg'}`);
    return { ok: true, file };
  } catch (e) {
    const m = messageOf(e);
    if (m.includes('cancel')) return { ok: false, reason: 'cancelled' };
    if (m.includes('denied') || m.includes('permission')) return { ok: false, reason: 'denied' };
    // What the plugin said (e.g. a missing Info.plist key on iOS): shown under the message so a report can be acted on.
    return { ok: false, reason: 'failed', detail: String((e as { message?: unknown } | null)?.message ?? e ?? '').slice(0, 200) };
  }
}
