(() => {
  const body = document.body;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;

  /* ---------- Icona di caricamento (anello d'oro con la goccia; usata dalla mappa, dai video, dal modulo) ---------- */
  window.biondiLoader = (cls = '') => {
    const s = document.createElement('span');
    s.className = ('loader ' + cls).trim(); s.setAttribute('role', 'status'); s.setAttribute('aria-label', 'Caricamento');
    s.innerHTML = '<span class="loader__goo"><i class="loader__ring"></i><i class="loader__drop"></i></span>';
    return s;
  };

  document.querySelectorAll('[data-anno]').forEach((el) => { el.textContent = new Date().getFullYear(); });   // anno nel footer

  /* ---------- Animazione d'ingresso ---------- */
  // parte quando font e immagini principali sono pronti: prima sparisce l'icona di caricamento della pagina
  const preloader = document.querySelector('.preloader');
  const start = () => {
    if (preloader) preloader.classList.add('is-done');
    requestAnimationFrame(() => body.classList.add('is-loaded'));
  };
  const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  const pageReady = new Promise((ok) => {
    if (document.readyState === 'complete') ok(); else window.addEventListener('load', ok, { once: true });
    setTimeout(ok, 2500);                                   // non si aspetta all'infinito una foto lenta
  });
  Promise.all([fontsReady, pageReady]).then(start);
  setTimeout(start, 4000);                                  // in ogni caso

  /* ---------- Nav allo scroll ---------- */
  const nav = document.getElementById('nav');
  const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 30);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- Giorno / notte ---------- */
  const html = document.documentElement;
  const themeToggle = document.getElementById('themeToggle');
  const photoBox = document.getElementById('hairFx');
  const THEMES = {
    giorno: { src: photoBox.dataset.giornoSrc, map: photoBox.dataset.giornoMap, alt: photoBox.dataset.giornoAlt },
    notte:  { src: photoBox.dataset.notteSrc,  map: photoBox.dataset.notteMap,  alt: photoBox.dataset.notteAlt },
  };
  const theme = () => (html.getAttribute('data-theme') === 'notte' ? 'notte' : 'giorno');
  const syncToggle = () => {
    const night = theme() === 'notte';
    themeToggle.setAttribute('aria-checked', String(night));
    themeToggle.setAttribute('aria-label', night ? 'Passa alla versione giorno' : 'Passa alla versione notte');
  };
  syncToggle();

  function applyTheme(t) {
    html.setAttribute('data-theme', t);
    syncToggle();
    try { localStorage.setItem('biondi-tema', t); } catch (e) { /* navigazione privata: si ricorda solo per questa visita */ }
    const s = THEMES[t];
    if (window.HairFX) return window.HairFX.setSource(s.src, s.map, s.alt);   // foto + capelli che si muovono
    const img = photoBox.querySelector('img'); img.src = s.src; img.alt = s.alt;
    return Promise.resolve();
  }

  themeToggle.addEventListener('click', () => {
    const next = theme() === 'notte' ? 'giorno' : 'notte';
    // senza View Transitions (o con animazioni ridotte): cambio con una dissolvenza dei colori
    if (!document.startViewTransition || reduceMotion) {
      if (!reduceMotion) { html.classList.add('theme-fade'); setTimeout(() => html.classList.remove('theme-fade'), 700); }
      applyTheme(next);
      return;
    }
    // transizione: la nuova versione si apre a cerchio partendo dall'interruttore
    const r = themeToggle.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const vt = document.startViewTransition(() => applyTheme(next));
    vt.ready.then(() => {
      html.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 1100, easing: 'cubic-bezier(.7, 0, .2, 1)', pseudoElement: '::view-transition-new(root)' }
      );
    }).catch(() => {});
  });

  // l'altra foto (e la sua mappa) si scaricano quando la pagina è ferma: così il cambio è immediato
  const whenIdle = window.requestIdleCallback || ((f) => setTimeout(f, 1500));
  window.addEventListener('load', () => whenIdle(() => {
    const other = THEMES[theme() === 'notte' ? 'giorno' : 'notte'];
    if (window.HairFX) window.HairFX.preload(other.src, other.map);
  }));

  /* ---------- Menu a schermo intero ---------- */
  const menu = document.getElementById('menu');
  const toggle = document.getElementById('menuToggle');
  const setMenu = (open) => {
    body.classList.toggle('menu-open', open);
    body.classList.toggle('no-scroll', open);
    menu.setAttribute('aria-hidden', String(!open));
    menu.inert = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Chiudi il menu' : 'Apri il menu');
  };
  toggle.addEventListener('click', () => setMenu(!body.classList.contains('menu-open')));
  document.querySelectorAll('[data-menu-open]').forEach((el) =>
    el.addEventListener('click', (e) => { e.preventDefault(); setMenu(true); }));
  document.querySelectorAll('[data-menu-close]').forEach((el) =>
    el.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && body.classList.contains('menu-open')) { setMenu(false); toggle.focus(); }
  });

  /* ---------- Modale prenotazione ---------- */
  const openModal = (id, trigger) => {
    const dlg = document.getElementById(id);
    if (!dlg) return;
    if (id === 'booking') prepareBooking(trigger && trigger.dataset.service, trigger && trigger.dataset.sede);
    // da una finestra all'altra (es. "I nostri servizi" -> "Prenota"): si chiude quella da cui si parte
    const from = trigger && trigger.closest('dialog[open]');
    if (from && from !== dlg) from.close();
    dlg.showModal();
    body.classList.add('no-scroll');
  };
  document.querySelectorAll('[data-open]').forEach((el) =>
    el.addEventListener('click', (e) => { e.preventDefault(); openModal(el.dataset.open, el); }));

  document.querySelectorAll('dialog.modal').forEach((dlg) => {
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); // click sul backdrop o sulla X
    });
    dlg.addEventListener('close', () => {
      if (!body.classList.contains('menu-open') && !document.querySelector('dialog.modal[open], .panel.is-open')) body.classList.remove('no-scroll');
    });
  });

  /* ---------- Form prenotazione ---------- */
  const booking = document.getElementById('booking');
  const form = document.getElementById('bookingForm');
  const errorBox = document.getElementById('bookingError');
  const formWrap = booking.querySelector('.booking__form-wrap');
  const done = booking.querySelector('.booking__done');

  const daysBox = document.getElementById('bookingDays');
  const summary = document.getElementById('bookingSummary');
  const submitBtn = form.querySelector('.bk__submit');
  const APERTO = [false, false, true, true, true, true, true];        // giorni di apertura, da domenica (come la sezione contatti)
  const isoOf = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const fmt = (d, o) => d.toLocaleDateString('it-IT', o);
  form.elements.altraData.min = isoOf(new Date());

  // i prossimi 8 giorni di apertura, da toccare (oggi solo se c'è ancora tempo)
  function buildDays() {
    daysBox.innerHTML = '';
    const d = new Date(); d.setHours(12, 0, 0, 0);
    if (new Date().getHours() >= 17) d.setDate(d.getDate() + 1);
    for (let n = 0; n < 8; d.setDate(d.getDate() + 1)) {
      if (!APERTO[d.getDay()]) continue;
      const l = document.createElement('label');
      l.className = 'chip chip--day';
      l.innerHTML = `<input type="radio" name="data" value="${isoOf(d)}"${n ? '' : ' required'}>
        <span><small>${fmt(d, { weekday: 'short' })}</small><b>${d.getDate()}</b><small>${fmt(d, { month: 'short' })}</small></span>`;
      daysBox.appendChild(l); n++;
    }
  }

  // service / sede: già scelti se si apre da un trattamento o dalla scheda di una sede
  function prepareBooking(service, sede) {
    formWrap.hidden = false;
    done.hidden = true;
    errorBox.textContent = '';
    buildDays();
    if (service) form.elements.servizio.value = service;
    if (sede) form.elements.sede.value = sede;
  }

  // un giorno scelto tra le pillole oppure dal calendario: uno esclude l'altro
  form.addEventListener('change', (e) => {
    if (e.target.name === 'altraData' && e.target.value) form.querySelectorAll('[name="data"]').forEach((r) => { r.checked = false; });
    if (e.target.name === 'data') form.elements.altraData.value = '';
  });
  form.addEventListener('input', (e) => {
    e.target.classList.remove('is-invalid');
    const g = e.target.closest('.bk__group'); if (g) g.classList.remove('is-invalid');
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    form.querySelectorAll('.is-invalid').forEach((f) => f.classList.remove('is-invalid'));
    const bad = [];
    const flag = (el) => { el.classList.add('is-invalid'); bad.push(el); };
    const v = form.elements;
    if (!v.sede.value) flag(form.querySelector('[data-group="sede"]'));
    if (!v.servizio.value) flag(form.querySelector('[data-group="servizio"]'));
    const giorno = v.data.value || v.altraData.value;
    let msg = 'Controlla i campi evidenziati, per favore.';
    if (!giorno) flag(form.querySelector('[data-group="data"]'));
    else if (!APERTO[new Date(giorno + 'T12:00').getDay()]) {
      flag(form.querySelector('[data-group="data"]')); msg = 'In quel giorno il salone è chiuso: scegli un giorno da martedì a sabato.';
    }
    if (!v.orario.value) flag(form.querySelector('[data-group="orario"]'));
    ['nome', 'telefono'].forEach((n) => { if (!v[n].checkValidity()) flag(v[n]); });
    if (bad.length) {
      errorBox.textContent = msg;
      bad[0].scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
      (bad[0].matches('input') ? bad[0] : bad[0].querySelector('input')).focus({ preventScroll: true });
      return;
    }
    // riepilogo per la conferma
    const quando = fmt(new Date(giorno + 'T12:00'), { weekday: 'long', day: 'numeric', month: 'long' });
    summary.innerHTML = '';
    [['Salone', v.sede.value], ['Servizio', v.servizio.value], ['Giorno', quando], ['Fascia oraria', v.orario.value], ['Nome', v.nome.value.trim()]].forEach(([k, val]) => {
      const row = document.createElement('div');
      row.innerHTML = '<dt></dt><dd></dd>'; row.children[0].textContent = k; row.children[1].textContent = val;
      summary.appendChild(row);
    });
    // TODO: collegare a un backend / email / WhatsApp. Per ora un attimo di "invio" e poi la conferma.
    errorBox.textContent = '';
    submitBtn.disabled = true; submitBtn.classList.add('is-sending');
    if (!submitBtn.querySelector('.loader')) submitBtn.appendChild(window.biondiLoader('loader--sm'));
    setTimeout(() => {
      submitBtn.disabled = false; submitBtn.classList.remove('is-sending');
      formWrap.hidden = true;
      done.hidden = false;
      form.reset();
      done.querySelector('button').focus();
    }, reduceMotion ? 200 : 1300);
  });


  /* ---------- Sezioni a tutto schermo (riquadri della griglia) ----------
     Si aprono "crescendo" dal riquadro cliccato fino a riempire lo schermo e si richiudono dentro di lui.
     Il tasto Indietro del browser e il tasto Esc le chiudono; un link #chi-siamo (ecc.) le apre direttamente. */
  const panels = [...document.querySelectorAll('.panel')];
  const mainEl = document.querySelector('main');
  const footEl = document.getElementById('footer');
  const PANEL_MS = 900;
  let openPanel = null, panelTrigger = null, skipAnim = false, leaving = false;
  const smooth01 = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  const easeInOut = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  // mentre una sezione è aperta, effetto capelli e riflessi della hero (coperti) si fermano: tutta la potenza va all'animazione
  // (riflessi-luce.js usa lo stesso avviso per accendere i riflessi nello sfondo della sezione aperta)
  const coverHero = (on, id) => document.dispatchEvent(new CustomEvent('biondi:sezione', { detail: { aperta: on, id } }));

  // ogni sezione: i contenuti in un contenitore sopra i riflessi di luce (il canvas .panel__bokeh resta sullo sfondo)
  panels.forEach((p) => {
    const inner = document.createElement('div');
    inner.className = 'panel__inner';
    [...p.children].filter((c) => !c.matches('.panel__bar, .panel__bokeh')).forEach((c) => inner.appendChild(c));
    p.appendChild(inner);
  });
  // le foto delle sezioni si scaricano e si preparano quando la pagina è ferma: all'apertura sono già pronte (niente scatti)
  window.addEventListener('load', () => whenIdle(() => panels.forEach((p) => p.querySelectorAll('img').forEach((img) => {
    img.loading = 'eager';
    if (img.decode) img.decode().catch(() => {});
  }))));

  /* ---- uscita scorrendo verso il basso ----
     Arrivati in fondo alla sezione, continuare a scorrere (rotellina, trackpad, dito, frecce) "tira" la sezione:
     si ritaglia nelle proporzioni del suo riquadro, si rimpicciolisce e vola al suo posto nella griglia.
     Il movimento segue il gesto ma ammorbidito; se lo lasci prima di metà torna aperta, dopo metà finisce da sola. */
  const OUT = { target: 0, val: 0, raf: null, last: 0, idle: null, commit: false };
  const atBottom = (p) => p.scrollTop >= p.scrollHeight - p.clientHeight - 2;

  function resetOutro(p) {
    p.style.transform = p.style.clipPath = p.style.opacity = p.style.transformOrigin = '';
  }
  function resetOut() {
    clearTimeout(OUT.idle); if (OUT.raf) cancelAnimationFrame(OUT.raf);
    OUT.target = OUT.val = 0; OUT.raf = null; OUT.commit = false;
  }
  // disegna la sezione a metà strada (o = 0 aperta, 1 dentro il riquadro): solo transform, ritaglio e opacità
  function applyOutro(p, o) {
    if (o <= .0005) { resetOutro(p); return; }
    const s = easeInOut(o);
    const W = p.clientWidth, H = innerHeight, r = fromRect(panelTrigger);
    const rw = r.right - r.left, rh = r.bottom - r.top, ta = rw / rh;
    const cw = Math.min(W, H * ta), ch = Math.min(H, W / ta);               // area con le proporzioni del riquadro, al centro
    const cl = (W - cw) / 2 * s, ct = (H - ch) / 2 * s;
    const vw = W + (cw - W) * s, vh = H + (ch - H) * s;
    const k = 1 + (rw / cw - 1) * s;
    const tx = r.left * s - cl * k, ty = r.top * s - ct * k;
    p.style.transformOrigin = '0 0';
    p.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) scale(${k.toFixed(4)})`;
    p.style.clipPath = `inset(${ct.toFixed(1)}px ${(W - cl - vw).toFixed(1)}px ${(H - ct - vh).toFixed(1)}px ${cl.toFixed(1)}px round ${(18 * s / k).toFixed(1)}px)`;
    p.style.opacity = String(1 - smooth01((o - .72) / .28));                // alla fine si vede il riquadro vero
  }
  // gesto: amount = quanto tirare (positivo verso la griglia). true = gesto usato (la pagina non deve scorrere)
  function pull(p, amount, touch) {
    if (p !== openPanel || leaving || reduceMotion || OUT.commit) return false;
    if (OUT.target <= 0 && (amount <= 0 || !atBottom(p))) return false;
    OUT.target = Math.max(0, Math.min(1, OUT.target + amount));
    clearTimeout(OUT.idle);
    if (OUT.target >= 1) release(p);
    else if (!touch) OUT.idle = setTimeout(() => release(p), 200);   // rotellina/trackpad fermi: si decide
    kickOut(p);
    return true;
  }
  function release(p) {
    clearTimeout(OUT.idle);
    if (OUT.target >= .45) { OUT.target = 1; OUT.commit = true; } else OUT.target = 0;
    kickOut(p);
  }
  function kickOut(p) {
    if (OUT.raf) return;
    OUT.last = performance.now();
    OUT.raf = requestAnimationFrame((t) => outFrame(p, t));
  }
  function outFrame(p, t) {
    OUT.raf = null;
    if (p !== openPanel) return;
    const dt = Math.min(.05, Math.max(0, (t - OUT.last) / 1000)); OUT.last = t;
    const diff = OUT.target - OUT.val;
    // inseguimento morbido; quando la chiusura è decisa, avanza almeno a velocità costante (niente "frenata" infinita)
    let step = diff * (1 - Math.exp(-dt * (OUT.commit ? 6 : 11)));
    if (OUT.commit) step = Math.max(step, Math.min(diff, dt * .9));
    OUT.val += step;
    if (Math.abs(OUT.target - OUT.val) < .001) OUT.val = OUT.target;
    applyOutro(p, OUT.val);
    if (OUT.commit && OUT.val >= .999) { leaving = true; skipAnim = true; closePanel(); return; }   // arrivata: si chiude
    if (OUT.val !== OUT.target) OUT.raf = requestAnimationFrame((tt) => outFrame(p, tt));
  }
  // riquadri di testo che scorrono per conto loro (es. salone Mounir): se il gesto parte lì dentro e il testo
  // è più lungo del riquadro, scorre solo il testo (overscroll-behavior: contain) e la sezione resta ferma
  const inBox = (el) => {
    if (!el || !el.closest) return false;
    if (el.closest('.sedi__canvas')) return true;                 // sulla mappa 3D la rotellina zooma la mappa
    const b = el.closest('.mounir__scroll');
    return !!b && b.scrollHeight > b.clientHeight + 1;
  };
  document.querySelectorAll('.mounir__scroll').forEach((b) => {
    const fade = () => {
      b.classList.toggle('has-less', b.scrollTop > 2);
      b.classList.toggle('has-more', b.scrollTop < b.scrollHeight - b.clientHeight - 2);
    };
    b.addEventListener('scroll', fade, { passive: true });
    new ResizeObserver(fade).observe(b);
  });
  panels.forEach((p) => {
    p.addEventListener('wheel', (e) => {
      if (inBox(e.target)) return;
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1);
      if (pull(p, dy / (innerHeight * 1.1))) e.preventDefault();
    }, { passive: false });
    let ty = null;
    p.addEventListener('touchstart', (e) => { ty = inBox(e.target) ? null : e.touches[0].clientY; }, { passive: true });
    p.addEventListener('touchmove', (e) => {
      if (ty === null) return;
      const y = e.touches[0].clientY, dy = ty - y; ty = y;
      if (pull(p, dy / (innerHeight * .8), true)) e.preventDefault();
    }, { passive: false });
    p.addEventListener('touchend', () => { ty = null; if (OUT.target > 0 && !OUT.commit) release(p); }, { passive: true });
    p.addEventListener('keydown', (e) => {
      if (!['ArrowDown', 'PageDown', ' '].includes(e.key) || e.target.closest('input, select, textarea')) return;
      if (e.key === ' ' && e.target.closest('button, a')) return;                      // la barra spaziatrice preme i pulsanti
      if (inBox(e.target)) return;                                                     // le frecce scorrono il testo
      if (pull(p, .18)) e.preventDefault();
    });
  });

  // da dove parte (e dove torna) la sezione: il suo riquadro nella griglia; se non si vede, un rettangolo al centro
  function fromRect(trigger) {
    const r = trigger && trigger.getBoundingClientRect();
    if (r && r.width && r.bottom > 0 && r.top < innerHeight) return r;
    return { left: innerWidth * .3, top: innerHeight * .3, right: innerWidth * .7, bottom: innerHeight * .7 };
  }
  const insetOf = (r) => `inset(${r.top}px ${innerWidth - r.right}px ${innerHeight - r.bottom}px ${r.left}px round 18px)`;
  const FULL = 'inset(0px 0px 0px 0px round 0px)';
  const tileFor = (id) => document.querySelector(`.tile[data-panel="${id}"]`);

  // trigger = dove torna la sezione chiudendosi; from = da dove cresce aprendosi (di norma lo stesso)
  function showPanel(panel, trigger, push, from) {
    if (openPanel === panel) return;
    if (openPanel) hidePanel(false);
    openPanel = panel; panelTrigger = trigger || tileFor(panel.id);
    trigger = from || panelTrigger;
    leaving = false; resetOutro(panel); resetOut();
    coverHero(true, panel.id);
    panel.scrollTop = 0;
    panel.inert = false; panel.setAttribute('aria-hidden', 'false');
    panel.classList.add('is-open');
    mainEl.inert = true; nav.inert = true; if (footEl) footEl.inert = true;              // dietro la sezione non si clicca e non si scorre
    body.classList.add('no-scroll');
    if (push) history.pushState({ panel: panel.id }, '', '#' + panel.id);
    if (!reduceMotion) panel.animate({ clipPath: [insetOf(fromRect(trigger)), FULL] }, { duration: PANEL_MS, easing: 'cubic-bezier(.7, 0, .2, 1)' });
    requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add('is-in')));   // poi salgono i contenuti
    panel.querySelector('.panel__back').focus({ preventScroll: true });
  }

  function hidePanel(animate = true) {
    const panel = openPanel;
    if (!panel) return;
    const trigger = panelTrigger;
    openPanel = panelTrigger = null;
    if (skipAnim) animate = false;
    skipAnim = leaving = false;
    resetOut(); coverHero(false);
    mainEl.inert = false; nav.inert = false; if (footEl) footEl.inert = false;
    if (!body.classList.contains('menu-open') && !document.querySelector('dialog.modal[open]')) body.classList.remove('no-scroll');
    const done = () => { panel.classList.remove('is-open', 'is-in'); panel.inert = true; panel.setAttribute('aria-hidden', 'true'); resetOutro(panel); };
    if (animate) resetOutro(panel);
    if (animate && !reduceMotion) {
      panel.classList.remove('is-in');
      const a = panel.animate({ clipPath: [FULL, insetOf(fromRect(trigger))] }, { duration: PANEL_MS * .8, easing: 'cubic-bezier(.7, 0, .2, 1)', fill: 'forwards' });
      a.onfinish = () => { done(); a.cancel(); };
    } else done();
    if (trigger) trigger.focus({ preventScroll: true });
  }

  // chiusura dai pulsanti: se l'apertura ha aggiunto una voce alla cronologia, si torna indietro (così il tasto Indietro resta coerente)
  function closePanel() {
    if (!openPanel) return;
    if (history.state && history.state.panel === openPanel.id) history.back();
    else { hidePanel(); history.replaceState(null, '', location.pathname + location.search); }
  }

  document.querySelectorAll('[data-panel]').forEach((el) => el.addEventListener('click', (e) => {
    const p = document.getElementById(el.dataset.panel);
    if (!p) return;
    e.preventDefault();
    // dal menu la sezione cresce dalla voce cliccata e, chiudendosi, torna nel suo riquadro della griglia
    if (el.closest('.menu')) showPanel(p, tileFor(p.id), true, el);
    else showPanel(p, el, true);
  }));
  panels.forEach((p) => p.querySelectorAll('[data-panel-close]').forEach((b) => b.addEventListener('click', closePanel)));
  window.addEventListener('popstate', (e) => {
    const id = e.state && e.state.panel;
    const p = id && document.getElementById(id);
    if (p) showPanel(p, tileFor(id), false);
    else if (openPanel) hidePanel();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openPanel && !document.querySelector('dialog.modal[open]')) closePanel();
  });
  // link diretto (es. biondiparrucchieri.it/#contatti): la sezione è già aperta all'arrivo
  const linked = panels.find((p) => location.hash === '#' + p.id);
  if (linked) showPanel(linked, null, false);

  /* ---------- Palco: la hero si rimpicciolisce nella griglia + cambio colore progressivo ---------- */
  const root = document.documentElement;
  const stage = document.getElementById('stage');
  const heroEl = document.querySelector('.hero');
  const services = document.getElementById('servizi');
  const slot = document.getElementById('heroSlot');
  const bento = slot.parentElement;
  // solo su schermi larghi e con animazioni attive; altrimenti hero e griglia sono una sotto l'altra
  const stageMQ = window.matchMedia('(min-width: 900px) and (min-height: 560px) and (prefers-reduced-motion: no-preference)');
  services.querySelectorAll('.tile').forEach((t, i) => t.style.setProperty('--i', i));
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const easeIO = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  let geo = null, stageRaf = null;

  // La hero si rimpicciolisce INTERA (foto, titolo, card, recensioni, particelle) fino a riempire il riquadro della griglia.
  function measure() {
    if (!root.classList.contains('is-stage')) { geo = null; return; }
    const W = heroEl.offsetWidth, H = heroEl.offsetHeight;
    // riquadro d'arrivo con le stesse proporzioni dello schermo (al massimo 2/3 della griglia: i riquadri dei servizi restano leggibili)
    const want = Math.round(Math.min(bento.clientHeight * W / H, bento.clientWidth * .66));
    if (parseFloat(services.style.getPropertyValue('--slot-w')) !== want) services.style.setProperty('--slot-w', want + 'px');
    const st = heroEl.parentElement.getBoundingClientRect(), s = slot.getBoundingClientRect();
    // area della hero da mostrare nel riquadro: tutta la hero, allargata a sinistra o in alto (col colore di fondo)
    // se le proporzioni del riquadro non coincidono; ancorata in basso a destra, dove la foto tocca i bordi
    const sa = s.width / s.height;
    const cw = Math.max(W, H * sa), ch = Math.max(H, W / sa);
    heroEl.style.setProperty('--ext-l', (cw - W).toFixed(1) + 'px');
    heroEl.style.setProperty('--ext-t', (ch - H).toFixed(1) + 'px');
    geo = { W, H, cw, ch, k: s.width / cw, sx: s.left - st.left, sy: s.top - st.top };
    updateStage();
  }

  /* Colori della pagina durante il palco. Si scrivono SOLO su <html>, <body> e menu in alto:
     cambiare una variabile sulla radice obbligherebbe il browser a ricalcolare lo stile di tutta la pagina
     (sezioni nascoste comprese) a ogni fotogramma, e il movimento diventerebbe pesante. */
  let pageCols = null, lastPc = null, lastTp = null;
  function readPageColors() {
    const probe = document.createElement('i');
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
    body.appendChild(probe);
    const col = (v) => { probe.style.color = `var(${v})`; return getComputedStyle(probe).color.match(/[\d.]+/g).slice(0, 3).map(Number); };
    pageCols = { bg: col('--bg'), grid: col('--grid-bg'), ink: col('--ink'), gridInk: col('--grid-ink') };
    probe.remove();
  }
  const mixRgb = (a, b, k) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(', ')})`;
  function paintPage(pc) {
    if (pc === null) {                                   // palco spento: tornano i colori del CSS
      lastPc = null;
      root.style.backgroundColor = body.style.backgroundColor = '';
      ['--page', '--pc', '--text'].forEach((v) => nav.style.removeProperty(v));
      return;
    }
    pc = Math.round(pc * 200) / 200;                     // passi minimi: niente riscritture inutili
    if (pc === lastPc) return;
    lastPc = pc;
    if (!pageCols) readPageColors();
    const page = mixRgb(pageCols.bg, pageCols.grid, pc);
    root.style.backgroundColor = body.style.backgroundColor = page;
    nav.style.setProperty('--page', page); nav.style.setProperty('--pc', pc);
    // testi del menu: passano al colore della griglia a metà percorso (di giorno e di notte i due colori si somigliano)
    nav.style.setProperty('--text', `rgb(${(pc >= .575 ? pageCols.gridInk : pageCols.ink).join(', ')})`);
  }
  // giorno/notte: si rileggono i colori
  new MutationObserver(() => { pageCols = null; if (lastPc !== null) { const p = lastPc; lastPc = null; paintPage(p); } })
    .observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  function updateStage() {
    stageRaf = null;
    if (!geo) return;
    const g = geo;
    const p = clamp01(-stage.getBoundingClientRect().top / (stage.offsetHeight - innerHeight));
    const s = easeIO(clamp01(p / .72));
    const k = 1 + (g.k - 1) * s;                                   // scala
    const cl = (g.W - g.cw) * s, ct = (g.H - g.ch) * s;           // angolo in alto a sinistra dell'area visibile (≤ 0)
    const tx = g.sx * s - cl * k, ty = g.sy * s - ct * k;         // quell'angolo va verso l'angolo del riquadro
    heroEl.style.transform = s > 0 ? `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) scale(${k.toFixed(4)})` : '';
    heroEl.style.clipPath = `inset(${ct.toFixed(1)}px 0px 0px ${cl.toFixed(1)}px round ${(18 * s / k).toFixed(1)}px)`;
    const shrunk = p > .12;
    if (shrunk !== heroEl.classList.contains('is-shrunk')) {
      heroEl.classList.toggle('is-shrunk', shrunk);
      // rimpicciolita: si può riaprire anche da tastiera (Tab fino alla hero, poi Invio)
      if (shrunk) { heroEl.tabIndex = 0; heroEl.setAttribute('aria-description', 'Premi Invio per riaprire'); }
      else { heroEl.removeAttribute('tabindex'); heroEl.removeAttribute('aria-description'); }
    }
    // pagina: dal colore della hero a quello della griglia (crema di giorno, scuro di notte)
    paintPage(clamp01((p - .05) / .5));
    const tp = clamp01((p - .42) / .4).toFixed(3);
    if (tp !== lastTp) { lastTp = tp; services.style.setProperty('--tp', tp); }   // compaiono titolo e riquadri della griglia
  }

  function setStage() {
    const on = stageMQ.matches;
    root.classList.toggle('is-stage', on);
    if (on) { measure(); return; }
    geo = null;
    heroEl.style.transform = heroEl.style.clipPath = '';
    heroEl.classList.remove('is-shrunk');
    paintPage(null); services.style.removeProperty('--tp'); lastTp = null;
  }
  (stageMQ.addEventListener ? stageMQ.addEventListener('change', setStage) : stageMQ.addListener(setStage));
  setStage();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  // il riquadro di arrivo può cambiare dopo il caricamento dei caratteri o col ridimensionamento: si rimisura
  // (solo se cambia davvero di almeno mezzo pixel: misurare sposta il riquadro di frazioni di pixel,
  //  e senza questo controllo si rimisurerebbe la pagina a ogni fotogramma)
  let slotW = 0, slotH = 0;
  if (window.ResizeObserver) new ResizeObserver(([en]) => {
    const { width: w, height: h } = en.contentRect;
    if (Math.abs(w - slotW) < .5 && Math.abs(h - slotH) < .5) return;
    slotW = w; slotH = h;
    if (root.classList.contains('is-stage')) measure();
  }).observe(slot);
  window.addEventListener('resize', () => { if (geo) measure(); });
  window.addEventListener('scroll', () => { if (geo && !stageRaf) stageRaf = requestAnimationFrame(updateStage); }, { passive: true });

  // "Scopri di più" e i link ai servizi portano alla fine del palco (griglia completa)
  const stageEnd = () => stage.offsetTop + stage.offsetHeight - innerHeight;
  document.querySelectorAll('a[href="#servizi"]').forEach((a) => a.addEventListener('click', (e) => {
    if (!geo) return;
    e.preventDefault();
    window.scrollTo({ top: stageEnd(), behavior: 'smooth' });
  }));
  // hero rimpicciolita nella griglia: un tocco (o un clic) ovunque sopra la riapre, tornando all'inizio
  /* Riapertura: invece dello scorrimento "smooth" del browser (lungo e irregolare) un'animazione dedicata di ~1 secondo,
     che aggiorna la hero nello stesso fotogramma dello scorrimento. Durante il viaggio effetto capelli e riflessi
     restano fermi (meno lavoro = più fluido); se l'utente scorre o preme un tasto, l'animazione si ferma lì. */
  let reopening = null;
  function reopen() {
    if (reopening) return;
    const from = window.scrollY, to = stage.offsetTop, dist = from - to;
    if (dist <= 1) return;
    if (reduceMotion) { window.scrollTo({ top: to, behavior: 'instant' }); return; }
    const D = Math.min(1250, 750 + (dist / innerHeight) * 160);
    const ease = (x) => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    const t0 = performance.now();
    let raf = 0;
    const stop = () => {
      cancelAnimationFrame(raf); reopening = null;
      ['wheel', 'touchstart', 'keydown'].forEach((ev) => window.removeEventListener(ev, stop));
      coverHero(false);
    };
    const step = (t) => {
      const k = Math.min(1, Math.max(0, (t - t0) / D));
      window.scrollTo({ top: from - dist * ease(k), behavior: 'instant' });
      if (stageRaf) { cancelAnimationFrame(stageRaf); stageRaf = null; }
      updateStage();
      if (k < 1) raf = requestAnimationFrame(step); else stop();
    };
    reopening = { stop };
    coverHero(true);
    ['wheel', 'touchstart', 'keydown'].forEach((ev) => window.addEventListener(ev, stop, { passive: true }));
    raf = requestAnimationFrame(step);
  }
  heroEl.addEventListener('click', (e) => {
    if (!geo || !heroEl.classList.contains('is-shrunk')) return;
    e.preventDefault();
    reopen();
  });
  heroEl.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target === heroEl && heroEl.classList.contains('is-shrunk')) { e.preventDefault(); reopen(); }
  });

  // da tastiera: se si arriva su un riquadro, si porta la griglia in vista
  services.addEventListener('focusin', () => { if (geo && window.scrollY < stageEnd() - 2) window.scrollTo({ top: stageEnd() }); });

  /* ---------- Effetti cursore (solo desktop): parallasse del titolo + spotlight sui testi ---------- */
  if (finePointer && !reduceMotion) {
    const hero = heroEl;
    const lines = [...document.querySelectorAll('.line[data-depth]')];
    const spotEls = [...document.querySelectorAll('.hero__title .in:not(.tag)')];   // le parole chiave restano sempre oro
    const SPOT_R = 170;   // raggio dello spotlight dorato sul titolo, in pixel
    root.classList.add('spot-text');
    let tx = 0, ty = 0, sx = 0, sy = 0, r = 0, tr = 0, nx = 0, pnx = 0, raf = null;

    const loop = () => {
      sx += (tx - sx) * .22; sy += (ty - sy) * .22; r += (tr - r) * .12; pnx += (nx - pnx) * .1;
      const rects = spotEls.map((el) => el.getBoundingClientRect());   // prima tutte le letture, poi le scritture
      spotEls.forEach((el, k) => {
        el.style.setProperty('--tx', (sx - rects[k].left).toFixed(1) + 'px');
        el.style.setProperty('--ty', (sy - rects[k].top).toFixed(1) + 'px');
        el.style.setProperty('--sr', r.toFixed(1) + 'px');
      });
      lines.forEach((l) => l.style.setProperty('--px', (pnx * Number(l.dataset.depth)).toFixed(2) + 'px'));
      const busy = Math.abs(tx - sx) > .5 || Math.abs(ty - sy) > .5 || Math.abs(tr - r) > .5 || Math.abs(nx - pnx) > .002;
      raf = busy ? requestAnimationFrame(loop) : null;
    };
    const kickSpot = () => { if (!raf) raf = requestAnimationFrame(loop); };
    hero.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      tx = e.clientX; ty = e.clientY;
      if (r < 1) { sx = tx; sy = ty; }
      tr = SPOT_R;
      nx = (e.clientX / innerWidth - .5) * 2;
      kickSpot();
    });
    hero.addEventListener('pointerleave', () => { tr = 0; nx = 0; kickSpot(); });

    // card del blog: si inclina verso il mouse e un riflesso dorato segue il cursore
    const card = document.getElementById('blogCard');
    if (card) {
      card.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse' || heroEl.classList.contains('is-shrunk')) return;
        const r = card.getBoundingClientRect();
        const u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
        card.classList.add('is-tilting');
        card.style.setProperty('--ry', ((u - .5) * 12).toFixed(2) + 'deg');
        card.style.setProperty('--rx', ((.5 - v) * 10).toFixed(2) + 'deg');
        card.style.setProperty('--mx', (u * 100).toFixed(1) + '%');
        card.style.setProperty('--my', (v * 100).toFixed(1) + '%');
      });
      card.addEventListener('pointerleave', () => {
        card.classList.remove('is-tilting');                     // torna dritta con calma
        card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg');
      });
    }
  }

  /* ---------- Telefono: la foto della hero sfuma nella griglia solo mentre si scorre verso di lei ----------
     --hero-fade va da 0 (hero ferma: foto piena) a 1 (a metà strada verso la griglia: sfumatura completa) */
  const fadeMQ = window.matchMedia('(max-width: 600px)');
  let fadeRaf = 0;
  const setFade = () => {
    fadeRaf = 0;
    // la sfumatura sale dal bordo lungo i primi 2/3 del viaggio: rapida all'inizio, poi rallenta
    const k = fadeMQ.matches ? Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * .66))) : 0;
    const f = 1 - (1 - k) * (1 - k);
    document.documentElement.style.setProperty('--hero-fade', f.toFixed(3));
  };
  window.addEventListener('scroll', () => { if (!fadeRaf) fadeRaf = requestAnimationFrame(setFade); }, { passive: true });
  fadeMQ.addEventListener('change', setFade);
  setFade();

  /* ---------- Telefono: lo scorrimento porta da una schermata all'altra (hero → griglia → footer) ----------
     Al posto dell'aggancio del browser (veloce e non regolabile): il dito muove la pagina, poi al rilascio
     la pagina scivola lenta fino alla schermata successiva (o torna a quella di partenza, se il gesto è piccolo).
     Con menu, schede o prenotazione aperti non interviene; con "movimento ridotto" resta l'aggancio del browser. */
  if (!reduceMotion) {
    const root = document.documentElement;
    const grid = document.getElementById('servizi');
    const isLocked = () => document.body.classList.contains('no-scroll');
    const maxY = () => Math.max(0, root.scrollHeight - innerHeight);
    const stops = () => {
      const m = maxY();
      const s = [0, grid ? grid.getBoundingClientRect().top + window.scrollY : 0, m].map((v) => Math.round(Math.min(m, Math.max(0, v))));
      return [...new Set(s)].sort((a, b) => a - b);
    };
    const nearest = (list, y) => list.reduce((best, s, i) => (Math.abs(s - y) < Math.abs(list[best] - y) ? i : best), 0);
    const easeOut = (x) => 1 - Math.pow(1 - x, 3);
    let on = false, anim = 0, animEnd = 0;

    const stopGlide = () => { if (anim) { cancelAnimationFrame(anim); anim = 0; } };
    function glide(to) {
      stopGlide();
      const from = window.scrollY, dist = to - from;
      if (Math.abs(dist) < 1) return;
      const D = 520 + 780 * Math.min(1, Math.abs(dist) / innerHeight);   // una schermata intera ≈ 1,3 s
      const t0 = performance.now();
      const step = (t) => {
        const x = Math.min(1, (t - t0) / D);
        window.scrollTo({ top: from + dist * easeOut(x), behavior: 'instant' });
        if (x < 1) anim = requestAnimationFrame(step); else { anim = 0; animEnd = performance.now(); }
      };
      anim = requestAnimationFrame(step);
    }
    // va alla schermata dopo (dir 1), prima (-1) o resta su quella di partenza (0)
    function page(fromY, dir) {
      const list = stops();
      const i = Math.min(list.length - 1, Math.max(0, nearest(list, fromY) + dir));
      glide(list[i]);
    }

    // dito
    let y0 = null, x0 = 0, s0 = 0, moved = false, lastY = 0, lastT = 0, vel = 0;
    window.addEventListener('touchstart', (e) => {
      if (!on || isLocked() || e.touches.length > 1) { y0 = null; return; }
      stopGlide();
      y0 = lastY = e.touches[0].clientY; x0 = e.touches[0].clientX; s0 = window.scrollY;
      lastT = e.timeStamp; vel = 0; moved = false;
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (y0 === null) return;
      if (e.touches.length > 1) { y0 = null; return; }
      const t = e.touches[0], dy = y0 - t.clientY;
      if (!moved) {
        if (Math.abs(dy) < 6 && Math.abs(t.clientX - x0) < 6) return;          // ancora un tocco, non un gesto
        if (Math.abs(t.clientX - x0) > Math.abs(dy)) { y0 = null; return; }    // gesto orizzontale (capelli): non è scorrimento
        if (s0 <= 0 && dy < 0) { y0 = null; return; }                          // in cima e tira giù: resta il gesto del browser
        moved = true;
      }
      e.preventDefault();
      window.scrollTo({ top: Math.min(maxY(), Math.max(0, s0 + dy)), behavior: 'instant' });
      const dt = e.timeStamp - lastT;
      if (dt > 0) vel = .7 * vel + .3 * ((lastY - t.clientY) / dt);
      lastY = t.clientY; lastT = e.timeStamp;
    }, { passive: false });
    const endTouch = () => {
      if (y0 === null) return;
      const was = moved, total = y0 - lastY;
      y0 = null;
      if (!was) return;
      const dir = (total > 50 || vel > .35) ? 1 : (total < -50 || vel < -.35) ? -1 : 0;
      page(s0, dir);
    };
    window.addEventListener('touchend', endTouch, { passive: true });
    window.addEventListener('touchcancel', endTouch, { passive: true });

    // rotella / touchpad (finestra stretta su computer): un gesto = una schermata
    window.addEventListener('wheel', (e) => {
      if (!on || isLocked() || e.ctrlKey) return;
      e.preventDefault();
      if (anim || performance.now() - animEnd < 450 || Math.abs(e.deltaY) < 4) return;
      page(window.scrollY, e.deltaY > 0 ? 1 : -1);
    }, { passive: false });

    // tastiera, link interni, barra di scorrimento: quando la pagina si ferma a metà, si aggancia alla schermata più vicina
    let idle = 0;
    window.addEventListener('scroll', () => {
      if (!on || anim || y0 !== null) return;
      clearTimeout(idle);
      idle = setTimeout(() => {
        if (!on || anim || y0 !== null || isLocked()) return;
        const list = stops(), y = window.scrollY, s = list[nearest(list, y)];
        if (Math.abs(s - y) > 2) glide(s);
      }, 180);
    }, { passive: true });

    const setPager = () => { on = fadeMQ.matches; root.classList.toggle('js-pager', on); if (!on) stopGlide(); };
    fadeMQ.addEventListener('change', setPager);
    setPager();
  }

  /* ---------- Fallback immagini mancanti ---------- */
  document.querySelectorAll('img').forEach((img) =>
    img.addEventListener('error', () => { img.style.visibility = 'hidden'; }, { once: true }));
})();
