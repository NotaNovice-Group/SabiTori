// SabiTori landing page: the menu on small screens, and the spoken-card demo.
(() => {
  'use strict';

  /* Menu (below 1180px) */
  const nav = document.querySelector('.nav');
  const menuBtn = document.querySelector('.menu-btn');
  const menu = document.getElementById('menu');
  if (nav && menuBtn && menu) {
    const setOpen = (open) => {
      nav.classList.toggle('is-open', open);
      menuBtn.setAttribute('aria-expanded', String(open));
    };
    menuBtn.addEventListener('click', () => setOpen(menuBtn.getAttribute('aria-expanded') !== 'true'));
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menuBtn.getAttribute('aria-expanded') === 'true') { setOpen(false); menuBtn.focus(); }
    });
  }

  /* Spoken card: each part lights up while it is said, the warning first. */
  const btn = document.getElementById('listen');
  const card = document.getElementById('spoken-card');
  if (!btn || !card) return;
  const label = btn.querySelector('.listen__label');
  const parts = [...card.querySelectorAll('[data-say]')];
  const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
  let run = 0;
  let timer = 0;

  btn.dataset.playing = 'false';

  const light = (el) => parts.forEach((p) => p.classList.toggle('is-lit', p === el));

  const stop = () => {
    run++;
    clearTimeout(timer);
    if (synth) synth.cancel();
    light(null);
    btn.dataset.playing = 'false';
    label.textContent = 'Listen to this card';
  };

  const pickVoice = () => {
    if (!synth) return null;
    const voices = synth.getVoices();
    return voices.find((v) => /^en(-|_)(GB|NG|ZA|KE)/i.test(v.lang)) || voices.find((v) => /^en/i.test(v.lang)) || null;
  };

  const sayPart = (i, id) => {
    if (id !== run) return;
    if (i >= parts.length) { stop(); return; }
    const el = parts[i];
    light(el);
    // Keep each part lit at least as long as it takes to say, even if a voice fails or ends early.
    const started = Date.now();
    const minMs = 700 + el.dataset.say.length * 45;
    const next = () => {
      if (id !== run) return;
      timer = window.setTimeout(() => sayPart(i + 1, id), Math.max(250, minMs - (Date.now() - started)));
    };
    if (synth) {
      const u = new SpeechSynthesisUtterance(el.dataset.say);
      const v = pickVoice();
      if (v) u.voice = v;
      u.lang = v ? v.lang : 'en-GB';
      u.rate = 0.9;
      u.onend = next;
      u.onerror = next;
      synth.speak(u);
    } else {
      // No voice in this browser: light each part for as long as it would take to say it.
      next();
    }
  };

  btn.addEventListener('click', () => {
    if (btn.dataset.playing === 'true') { stop(); return; }
    stop();
    btn.dataset.playing = 'true';
    label.textContent = 'Stop';
    sayPart(0, run);
  });

  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
})();
