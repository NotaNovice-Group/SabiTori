import { useEffect, useRef, useState } from 'react';
import { Trash2, FileUp, X, RefreshCw } from 'lucide-react';
import { useApp } from '../app-context';
import { Screen } from '../components/Screen';
import { SpeakingButton } from '../components/SpeakingButton';
import { Segmented } from '../components/Segmented';
import { LanguageList } from '../components/LanguageList';
import { Sheet } from '../components/Sheet';
import { navigate } from '../lib/router';
import { clearCards } from '../lib/db';
import { formatSize } from '../lib/format';
import { config, anyConnected } from '../config';
import { clearUpdates, loadMemo, runUpdateCheck, type UpdateMemo } from '../lib/updates';
import type { UpdateResult } from '@sabitori/connect';
import type { ModelState } from '../engine';
import type { Retention, SpeedStep } from '../lib/settings';

declare const __APP_VERSION__: string;

export function SettingsScreen() {
  const { t, settings, setSettings, engine, refreshHistory, locale } = useApp();
  const [model, setModel] = useState<ModelState>(engine.model.state());
  const [builtin, setBuiltin] = useState(engine.understanding.state());
  const [available, setAvailable] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cleared, setCleared] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [memo, setMemo] = useState<UpdateMemo>(() => (config.updates ? loadMemo() : { lastCheckAt: null, lastStatus: null, lastReason: null }));
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UpdateResult | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    void engine.model.available().then(setAvailable);
    const off = engine.model.subscribe(setModel);
    const offBuiltin = engine.understanding.subscribe(setBuiltin);
    setBuiltin(engine.understanding.state());
    return () => { off(); offBuiltin(); };
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

  const checkNow = async () => {
    setChecking(true);
    setResult(null);
    setDeleted(false);
    const r = await runUpdateCheck().catch((): UpdateResult => ({ status: 'failed', sequence: 0, changed: [], reason: 'network' }));
    setResult(r);
    setMemo(loadMemo());
    setChecking(false);
  };
  const deleteDownloaded = async () => {
    setDeleting(true);
    try {
      await clearUpdates();
      setDeleted(true);
      setResult(null);
      setMemo(loadMemo());
    } catch {
      /* the store is unavailable: there was nothing to delete */
    }
    setDeleting(false);
    setConfirmDelete(false);
  };
  const resultKey = !result ? null
    : result.status === 'up_to_date' ? 'app.settings.updates.up_to_date'
    : result.status === 'updated' ? 'app.settings.updates.updated'
    : result.reason === 'network' ? 'app.settings.updates.network'
    : result.reason === 'store' ? 'app.settings.updates.store'
    : 'app.settings.updates.unsafe';
  const lastCheck = memo.lastCheckAt
    ? t('app.settings.updates.last', { date: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(memo.lastCheckAt)) })
    : t('app.settings.updates.never');
  const onOff = (key: 'updatesOn' | 'crashOn', label: string) => (
    <Segmented<string>
      label={label}
      value={settings[key] ? 'on' : 'off'}
      onChange={(v) => {
        const on = v === 'on';
        setSettings({ [key]: on });
        // Switching updates on checks at once, so the person sees it work instead of waiting a day.
        if (key === 'updatesOn' && on && !settings.updatesOn) void checkNow();
      }}
      options={[
        { value: 'on', key: 'app.settings.on', label: t('app.settings.on') },
        { value: 'off', key: 'app.settings.off', label: t('app.settings.off') },
      ]}
    />
  );

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

      <section className="panel" aria-labelledby="s-builtin">
        <h2 id="s-builtin" className="panel-title">{t('app.settings.model.builtin')}</h2>
        <p className="panel-hint" role="status">
          {builtin.status === 'ready' ? t('app.settings.model.builtin_ready')
            : builtin.status === 'failed' ? t('app.settings.model.builtin_failed')
            : t('app.settings.model.builtin_loading')}
        </p>
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

      {anyConnected() && (
        <section className="panel" aria-labelledby="s-conn">
          <h2 id="s-conn" className="panel-title">{t('app.settings.connected')}</h2>
          <p className="panel-hint">{t('app.settings.connected_hint')}</p>
          {config.updates && (
            <div className="panel-group" role="group" aria-labelledby="s-upd">
              <h3 id="s-upd" className="panel-strong">{t('app.settings.updates')}</h3>
              <p className="panel-hint">{t('app.settings.updates_hint')}</p>
              {onOff('updatesOn', t('app.settings.updates'))}
              {settings.updatesOn && (
                <>
                  <p className="panel-hint" role="status">{checking ? t('app.settings.updates.checking') : lastCheck}</p>
                  <SpeakingButton speakKey="app.settings.updates.check" variant="secondary" icon={<RefreshCw size={24} strokeWidth={2} aria-hidden />} disabled={checking} onAct={() => void checkNow()} />
                  <p className="panel-strong" role="status">{resultKey ? t(resultKey) : deleted ? t('app.settings.updates.deleted') : ''}</p>
                </>
              )}
              <SpeakingButton speakKey="app.settings.updates.delete" variant="secondary" icon={<Trash2 size={24} strokeWidth={2} aria-hidden />} disabled={checking || deleting} onAct={() => setConfirmDelete(true)} />
              {!settings.updatesOn && <p className="panel-hint" role="status">{deleted ? t('app.settings.updates.deleted') : ''}</p>}
            </div>
          )}
          {config.crashReports && (
            <div className="panel-group" role="group" aria-labelledby="s-rep">
              <h3 id="s-rep" className="panel-strong">{t('app.settings.reports')}</h3>
              <p className="panel-hint">{t('app.settings.reports_hint')}</p>
              {onOff('crashOn', t('app.settings.reports'))}
            </div>
          )}
        </section>
      )}

      <section className="panel" aria-labelledby="s-priv">
        <h2 id="s-priv" className="panel-title">{t('app.settings.privacy')}</h2>
        <p className="panel-strong">{t('ui.privacy')}</p>
        <p className="panel-hint">{t('app.settings.privacy_body')}</p>
        {anyConnected() && <p className="panel-hint">{t('app.settings.privacy_connected')}</p>}
      </section>

      <p className="version">{t('app.settings.version')} {__APP_VERSION__}</p>

      {confirmDelete && (
        <Sheet title={t('app.settings.updates.delete')} onClose={() => !deleting && setConfirmDelete(false)}>
          <div className="confirm">
            <p>{t('app.settings.updates.delete_hint')}</p>
            <SpeakingButton speakKey="app.settings.updates.keep" variant="secondary" disabled={deleting} onAct={() => setConfirmDelete(false)} />
            <SpeakingButton speakKey="app.settings.updates.delete_confirm" variant="danger" icon={<Trash2 size={24} strokeWidth={2} aria-hidden />} disabled={deleting} onAct={() => void deleteDownloaded()} />
          </div>
        </Sheet>
      )}
    </Screen>
  );
}
