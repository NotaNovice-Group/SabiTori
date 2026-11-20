import { useCallback, useState } from 'react';
import { Settings as Cog } from 'lucide-react';
import { useApp } from '../app-context';
import { Sheet } from './Sheet';
import { SpeakingButton } from './SpeakingButton';
import { openSystemSettings } from '../lib/native';
import { pickNativePhoto, type PhotoSource } from '../lib/photo';

/**
 * Native photo taking: `pick('camera' | 'gallery')` gives the File to `onFile`. When the camera is
 * refused, `notice` is a plain-language sheet with a way to the phone's settings.
 */
export function useNativePhoto(onFile: (f: File) => void) {
  const { t } = useApp();
  const [problem, setProblem] = useState<'denied' | 'failed' | null>(null);
  const [detail, setDetail] = useState('');
  const pick = useCallback(
    async (source: PhotoSource) => {
      const r = await pickNativePhoto(source);
      if (r.ok) onFile(r.file);
      else if (r.reason !== 'cancelled') {
        setDetail(r.reason === 'failed' ? r.detail ?? '' : '');
        setProblem(r.reason);
      }
    },
    [onFile],
  );
  const notice = problem && (
    <Sheet title={t(problem === 'denied' ? 'app.photo.denied_title' : 'app.photo.failed')} onClose={() => setProblem(null)}>
      {problem === 'failed' && (
        <>
          <p className="note">{t('app.photo.failed_hint')}</p>
          {detail && <p className="note error-detail">{detail}</p>}
        </>
      )}
      {problem === 'denied' && (
        <>
          <p className="note">{t('app.photo.denied')}</p>
          <SpeakingButton speakKey="app.settings.open" variant="primary" className="btn-block" icon={<Cog size={24} strokeWidth={2} aria-hidden />} onAct={() => void openSystemSettings('app')} />
        </>
      )}
    </Sheet>
  );
  return { pick, notice };
}
