import { useEffect, useRef, useState } from 'react';
import { session } from '../lib/session';
import { isNative } from '../lib/native';
import { useNativePhoto } from '../components/PhotoPicker';
import { ClipboardPaste, Camera, OctagonX, TriangleAlert, Search, Users, ShieldAlert, RefreshCw, Megaphone } from 'lucide-react';
import type { CountryCode } from 'libphonenumber-js/min';
import { useApp } from '../app-context';
import { Screen } from '../components/Screen';
import { SpeakingButton } from '../components/SpeakingButton';
import { PhoneField } from '../components/PhoneField';
import { navigate } from '../lib/router';
import { checkPhone } from '../lib/phone';
import { formatAgo } from '../lib/format';
import { senderName } from './Home';
import { communityConfigured, loadScamList, reportsFor, wasReported, type PublishedScam } from '../lib/community';

export function ScamsScreen() {
  const { t, history, engine, locale } = useApp();
  const mine = history.filter((c) => c.scam.level === 'likely_scam' || c.scam.level === 'caution');
  const [list, setList] = useState<{ items: PublishedScam[]; fetchedAt: string | null; online: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [country, setCountry] = useState<CountryCode>(() => (engine.region.code as CountryCode) || 'CM');
  const [number, setNumber] = useState('');

  const input = useRef<HTMLInputElement>(null);
  const openPhoto = (f: File) => { session.setPhoto(f); navigate('/capture'); };
  const photo = useNativePhoto(openPhoto);
  const native = isNative();
  const refresh = async () => {
    setLoading(true);
    setList(await loadScamList(engine.region.code));
    setLoading(false);
  };
  useEffect(() => void refresh(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const check = checkPhone(number, country);
  const lookup = check.status === 'valid' ? check.e164 : check.status === 'short' ? check.value : null;
  const hits = lookup && list ? reportsFor(lookup, list.items) : [];

  return (
    <Screen title={t('app.nav.scams')} className="scams">
      <section className="panel scam-check" aria-labelledby="sc-num">
        <h2 id="sc-num" className="panel-title"><Search size={24} strokeWidth={2} aria-hidden /> {t('app.scams.check_number')}</h2>
        <PhoneField id="sc-phone" label={t('app.scams.number_label')} country={country} onCountry={setCountry} value={number} onValue={setNumber} />
        {lookup && list && (
          hits.length > 0 ? (
            <p className="lookup lookup-hit" role="status">
              <OctagonX size={28} strokeWidth={2} aria-hidden />
              <span><b>{t('app.scams.number_reported', { n: String(hits[0]!.reports) })}</b> {t('app.scams.number_reported_hint')}</span>
            </p>
          ) : (
            <p className="lookup" role="status">
              <ShieldAlert size={28} strokeWidth={2} aria-hidden />
              <span>{t(list.items.length ? 'app.scams.number_not_listed' : 'app.scams.number_no_list')}</span>
            </p>
          )
        )}
      </section>

      <section aria-labelledby="sc-msg" className="scam-actions">
        <h2 id="sc-msg" className="section-title">{t('app.scams.check_message')}</h2>
        <div className="two-up">
          <SpeakingButton speakKey="ui.paste" variant="secondary" icon={<ClipboardPaste size={24} strokeWidth={2} aria-hidden />} onAct={() => navigate('/paste')} />
          <input ref={input} type="file" accept="image/*" capture="environment" hidden tabIndex={-1} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) openPhoto(f); }} />
          <SpeakingButton speakKey="ui.take_photo" variant="secondary" icon={<Camera size={24} strokeWidth={2} aria-hidden />} onAct={() => (native ? void photo.pick('camera') : input.current?.click())} />
        </div>
      </section>

      <section aria-labelledby="sc-mine">
        <h2 id="sc-mine" className="section-title">{t('app.scams.mine')}</h2>
        {mine.length === 0 ? (
          <p className="note">{t('app.scams.mine_empty')}</p>
        ) : (
          <ul className="rows">
            {mine.map((c) => (
              <li key={c.id}>
                <a className="row" href={`#/card/${c.id}`}>
                  {c.scam.level === 'likely_scam' ? <OctagonX className="row-ic row-ic-stop" size={28} strokeWidth={2} aria-hidden /> : <TriangleAlert className="row-ic row-ic-caution" size={28} strokeWidth={2} aria-hidden />}
                  <span className="row-main">
                    <span className="row-top">
                      <b className="row-name">{senderName(c, t('app.sender.unknown'))}</b>
                      <span className="row-ago">{formatAgo(c.createdAt, locale)}</span>
                    </span>
                    <span className="row-meta">
                      {wasReported(c.id) ? (
                        <span className="chip" data-level="info"><Megaphone size={18} strokeWidth={2} aria-hidden />{t('app.scams.shared')}</span>
                      ) : (
                        <span className="chip-quiet">{t('app.scams.not_shared')}</span>
                      )}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="sc-all">
        <div className="section-head">
          <h2 id="sc-all" className="section-title"><Users size={24} strokeWidth={2} aria-hidden /> {t('app.scams.community', { region: engine.region.code === 'CM' ? t('app.scams.cameroon') : engine.region.code })}</h2>
          {communityConfigured() && (
            <SpeakingButton speakKey="app.scams.refresh" variant="quiet" icon={<RefreshCw size={22} strokeWidth={2} aria-hidden className={loading ? 'spin' : undefined} />} label={<span className="sr-only">{t('app.scams.refresh')}</span>} onAct={() => void refresh()} />
          )}
        </div>
        {!communityConfigured() ? (
          <p className="note">{t('app.scams.community_off')}</p>
        ) : !list ? (
          <div className="skeleton" aria-hidden="true"><span className="sk-group" /></div>
        ) : list.items.length === 0 ? (
          <p className="note">{t(list.online ? 'app.scams.community_empty' : 'app.scams.community_offline')}</p>
        ) : (
          <>
            {!list.online && list.fetchedAt && <p className="note">{t('app.scams.community_cached', { ago: formatAgo(list.fetchedAt, locale) })}</p>}
            <ul className="scam-list">
              {list.items.map((s) => (
                <li key={s.id} className="scam-item" data-level={s.level}>
                  <div className="scam-item-top">
                    {s.level === 'likely_scam' ? <OctagonX className="row-ic-stop" size={24} strokeWidth={2} aria-hidden /> : <TriangleAlert size={24} strokeWidth={2} aria-hidden />}
                    {s.senderValue ? <b className="num">{s.senderValue}</b> : <b>{t('app.sender.unknown')}</b>}
                    {s.reports > 1 && <span className="chip" data-level="urgent">{t('app.scams.times', { n: String(s.reports) })}</span>}
                    <span className="row-ago">{formatAgo(s.createdAt, locale)}</span>
                  </div>
                  <p className="scam-text">{s.text}</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <p className="privacy-note">{t('app.scams.never_safe')}</p>
      {photo.notice}
    </Screen>
  );
}
