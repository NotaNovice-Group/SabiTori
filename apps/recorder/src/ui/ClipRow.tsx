import { Mic, Play, Square, Loader, Pause, TriangleAlert, Info } from 'lucide-react';
import type { ClipRecord } from '../lib/model';
import { Btn, fmtMs } from './bits';
import type { RecState } from './useRecorder';

/** Record, play and re-record controls for one clip, with a live level meter. */
export function ClipControls({
  id,
  clip,
  stale,
  unsaved,
  st,
  onToggle,
  onPlay,
  label,
}: {
  id: string;
  clip?: ClipRecord;
  stale?: boolean;
  /** The clip is only in memory: it could not be saved on this device. */
  unsaved?: boolean;
  st: RecState;
  onToggle: () => void;
  onPlay: () => void;
  label?: string;
}) {
  const recording = st.recording === id;
  const saving = st.saving === id;
  const busyElsewhere = (!!st.recording && !recording) || (!!st.saving && !saving);
  const msg = st.message?.id === id ? st.message : undefined;
  return (
    <div className="clipctl">
      <div className="clipctl-row">
        <Btn
          variant={recording ? 'danger' : clip && !stale ? 'quiet' : 'primary'}
          icon={saving ? Loader : recording ? Square : Mic}
          onClick={onToggle}
          disabled={busyElsewhere || saving}
          aria-label={`${recording ? 'Stop' : clip ? 'Record again' : 'Record'}${label ? ' ' + label : ''}`}
          className={saving ? 'spin' : ''}
        >
          {saving ? 'Saving' : recording ? 'Stop' : clip ? 'Record again' : 'Record'}
        </Btn>
        <Btn
          variant="quiet"
          icon={st.playing === id ? Pause : Play}
          onClick={onPlay}
          disabled={!clip || recording || saving}
          aria-label={`Play${label ? ' ' + label : ''}`}
        >
          {st.playing === id ? 'Stop' : 'Play'}
        </Btn>
        {clip && !recording && <span className="dur num">{fmtMs(clip.durationMs)}</span>}
      </div>
      {clip && unsaved && !recording && (
        <p className="note note-warn" role="status">
          <TriangleAlert size={20} aria-hidden /> Not saved on this device. Download the pack now so it is not lost.
        </p>
      )}
      {recording && (
        <div className="meter-wrap">
          <div className="meter" role="meter" aria-label="Voice level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(st.level * 100)}>
            <span style={{ width: `${Math.round(st.level * 100)}%` }} data-hot={st.clipping || st.level > 0.92} />
          </div>
          <p className="meter-hint">{st.clipping ? 'Too loud. Move back a little.' : st.level < 0.12 ? 'Speak now. We cannot hear you yet.' : 'Good. Say it, then press Stop.'}</p>
        </div>
      )}
      {msg && !recording && (
        <p className={`note note-${msg.tone}`} role="status">
          {msg.tone === 'warn' ? <TriangleAlert size={20} aria-hidden /> : <Info size={20} aria-hidden />}
          {msg.text}
        </p>
      )}
    </div>
  );
}
