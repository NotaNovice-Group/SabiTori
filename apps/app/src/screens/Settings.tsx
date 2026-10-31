import { useEffect, useRef, useState } from 'react';
import { Trash2, FileUp, X } from 'lucide-react';
import { useApp } from '../app-context';
import { Screen } from '../components/Screen';
import { SpeakingButton } from '../components/SpeakingButton';
import { Segmented } from '../components/Segmented';
import { LanguageList } from '../components/LanguageList';
import { navigate } from '../lib/router';
import { clearCards } from '../lib/db';
import { formatSize } from '../lib/format';
import type { ModelState } from '../engine';
import type { Retention, SpeedStep } from '../lib/settings';

declare const __APP_VERSION__: string;

export function SettingsScreen() {
  const { t, settings, setSettings, engine, refreshHistory, locale } = useApp();
  const [model, setModel] = useState<ModelState>(engine.model.state());
  const [available, setAvailable] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cleared, setCleared] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void engine.model.available().then(setAvailable);
    return engine.model.subscribe(setModel);
  }, [engine]);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setErr(null);
    setBusy(true);
    try {
      await engine.model.save(f);
    } catch (x) {
      const code = (x as { code?: string }).code;
      setErr(code === 'not_gguf' ? 'app.settings.model.err.not_gguf' : code === 'unavailable' ? 'app.settings.model.err.unavailable' : 'app.settings.model.err.write_failed');
    }
    setBusy(false);
  };

  const status =
    busy ? t('app.settings.model.saving')
    : model.status === 'loading' ? `${t('app.settings.model.loading')} ${Math.round(model.progress * 100)}%`
    : model.status === 'ready' ? `${t('app.settings.model.ready', { size: formatSize(model.size, locale) })}. ${t('app.settings.model.active')}`
    : model.status === 'failed' ? t('app.settings.model.failed')
    : t('app.settings.model.none');
  const hasFile = model.status === 'ready' || model.status === 'loading' || model.status === 'failed';

  return (
    <Screen title={t('ui.settings')} back={() => navigate('/')} className="settings">
      <section className="panel" aria-labelledby="s-lang">
        <h2 id="s-lang" className="panel-title">{t('ui.language')}</h2>
        <LanguageList />
      </section>

      <section className="panel" aria-labelledby="s-listen">
        <h2 id="s-listen" className="panel-title">{t('app.settings.listen_first')}</h2>
        <p className="panel-hint">{t('app.settings.listen_first_hint')}</p>
        <Segmented<string>
          label={t('app.settings.listen_first')}
          value={settings.listenFirst ? 'on' : 'off'}
          onChange={(v) => setSettings({ listenFirst: v === 'on' })}
          options={[
            { value: 'on', key: 'app.settings.on', label: t('app.settings.on') },
            { value: 'off', key: 'app.settings.off', label: t('app.settings.off') },
          ]}
        />
      </section>

      <section className="panel" aria-labelledby="s-speed">
        <h2 id="s-speed" className="panel-title">{t('app.settings.speed')}</h2>
        <Segmented<SpeedStep>
          label={t('app.settings.speed')}
          value={settings.speed}
          onChange={(v) => setSettings({ speed: v })}
          options={[
            { value: 0, key: 'app.settings.speed.normal', label: t('app.settings.speed.normal') },
            { value: 1, key: 'app.settings.speed.slow', label: t('app.settings.speed.slow') },
            { value: 2, key: 'app.settings.speed.slower', label: t('app.settings.speed.slower') },
          ]}
        />
      </section>

      <section className="panel" aria-labelledby="s-keep">
        <h2 id="s-keep" className="panel-title">{t('app.settings.history')}</h2>
        <Segmented<Retention>
          label={t('app.settings.history')}
          value={settings.retention}
          onChange={(v) => setSettings({ retention: v })}
          options={[
            { value: 30, key: 'app.settings.history.30', label: t('app.settings.history.30') },
            { value: 7, key: 'app.settings.history.7', label: t('app.settings.history.7') },
            { value: 0, key: 'app.settings.history.0', label: t('app.settings.history.0') },
          ]}
        />
        <SpeakingButton
          speakKey="app.settings.clear"
          variant="secondary"
          icon={<Trash2 size={24} strokeWidth={2} aria-hidden />}
          onAct={async () => { await clearCards(); await refreshHistory(); setCleared(true); }}
        />
        <p className="panel-hint" role="status">{cleared ? t('app.settings.cleared') : ''}</p>
      </section>

      {available && (
        <section className="panel" aria-labelledby="s-model">
          <h2 id="s-model" className="panel-title">{t('app.settings.model')}</h2>
          <p className="panel-hint">{t('app.settings.model.note')}</p>
          <p className="panel-strong" role="status">{status}</p>
          {err && <p className="error" role="alert">{t(err as never)}</p>}
          <input ref={input} type="file" accept=".gguf" hidden onChange={pick} tabIndex={-1} />
          <SpeakingButton speakKey="app.settings.model.add" variant="secondary" icon={<FileUp size={24} strokeWidth={2} aria-hidden />} disabled={busy} onAct={() => input.current?.click()} />
          {hasFile && (
            <SpeakingButton speakKey="app.settings.model.remove" variant="secondary" icon={<X size={24} strokeWidth={2} aria-hidden />} onAct={() => void engine.model.remove()} />
          )}
        </section>
      )}

      <section className="panel" aria-labelledby="s-priv">
        <h2 id="s-priv" className="panel-title">{t('app.settings.privacy')}</h2>
        <p className="panel-strong">{t('ui.privacy')}</p>
        <p className="panel-hint">{t('app.settings.privacy_body')}</p>
      </section>

      <p className="version">{t('app.settings.version')} {__APP_VERSION__}</p>
    </Screen>
  );
}
