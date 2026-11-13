/* =========================================================
   RECENSIONI GOOGLE — valutazione + una recensione alla volta
   ---------------------------------------------------------
   Le recensioni NON sono copiate nel sito: appartengono ai loro autori.
   Due modi per mostrarle:
   A) automatico (consigliato): inserisci una chiave di Google "Places API (New)" in googleApiKey.
      Il sito legge da Google voto, numero e fino a 5 recensioni, sempre aggiornati.
   B) manuale: il salone incolla in "recensioni" quelle che sceglie, con il consenso degli autori.
   Senza A né B la sezione mostra voto, stelle e il link alla scheda Google.
   ========================================================= */
window.RECENSIONI = {
  // Scheda Google "Biondi Parrucchieri Pescara" – Via Palermo 79/81 (valori letti su Google Maps il 16/10/2026).
  // Con la chiave Google questi numeri si aggiornano da soli.
  voto: 4.9,
  totale: 87,
  linkGoogle: 'https://www.google.com/maps/search/?api=1&query=Biondi+Parrucchieri+Via+Palermo+79+Pescara',

  ogniSecondi: 6,        // ogni quanti secondi passa alla recensione successiva
  minimoStelle: 4,       // mostra solo recensioni con almeno queste stelle

  // ---- OPZIONE A: recensioni live da Google ----
  googleApiKey: '',                                        // es. 'AIza...' (limitala al dominio del sito!)
  placeId: '',                                             // facoltativo: se vuoto si cerca la scheda con il testo sotto
  ricercaGoogle: 'Biondi Parrucchieri, Via Palermo 79, Pescara',

  // ---- OPZIONE B: recensioni scelte dal salone ----
  // formato: { autore: 'Nome C.', stelle: 5, testo: 'Testo della recensione', quando: '3 mesi fa' }
  recensioni: [],
};

(() => {
  const cfg = window.RECENSIONI;
  const root = document.getElementById('greviews');
  if (!root || !cfg) return;
  const $ = (id) => document.getElementById(id);
  const slider = $('greviewsSlider'), nav = $('greviewsNav'), link = $('greviewsLink');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmt = (n) => Number(n).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  let counted = false;                       // il voto "conta" da 0 solo la prima volta che la sezione si vede
  function setSummary(voto, totale, url) {
    if (voto) {
      $('greviewsStars').setAttribute('aria-label', fmt(voto) + ' stelle su 5');
      if (counted || reduce) {
        $('greviewsScore').textContent = fmt(voto);
        $('greviewsStars').style.setProperty('--rating', voto);
      } else countUp(voto);
    }
    if (totale) $('greviewsCount').textContent = Number(totale).toLocaleString('it-IT');
    if (url) link.href = url;
  }

  // il voto sale da 0 e le stelle si riempiono insieme, quando la sezione entra in vista
  function countUp(voto) {
    const score = $('greviewsScore'), stars = $('greviewsStars');
    score.textContent = fmt(0); stars.style.setProperty('--rating', 0);
    const run = () => {
      counted = true;
      const t0 = performance.now(), D = 1600;
      const tick = (t) => {
        const k = Math.min(1, Math.max(0, (t - t0) / D)), e = 1 - Math.pow(1 - k, 3);
        score.textContent = fmt(Math.round(voto * e * 10) / 10);
        stars.style.setProperty('--rating', (voto * e).toFixed(3));
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    if (!window.IntersectionObserver) return run();
    if (countUp.io) countUp.io.disconnect();     // arrivano dati più recenti prima dell'animazione: vale l'ultimo voto
    const io = countUp.io = new IntersectionObserver(([en]) => {
      if (!en.isIntersecting) return;
      io.disconnect(); setTimeout(run, 900);    // dopo l'ingresso della sezione
    }, { threshold: .5 });
    io.observe(root);
  }

  /* ---------- lettura da Google (Places API New), con memoria di 12 ore per non ripetere la richiesta ---------- */
  async function fromGoogle() {
    const CACHE = 'biondi-recensioni-v1';
    try {
      const c = JSON.parse(localStorage.getItem(CACHE) || 'null');
      if (c && Date.now() - c.t < 12 * 3600e3) return c.d;
    } catch (e) { /* memoria non disponibile: si chiede a Google */ }
    const fields = ['rating', 'userRatingCount', 'reviews', 'googleMapsUri'];
    const headers = { 'X-Goog-Api-Key': cfg.googleApiKey };
    let res, place;
    if (cfg.placeId) {
      res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(cfg.placeId)}?languageCode=it`,
        { headers: { ...headers, 'X-Goog-FieldMask': fields.join(',') } });
      if (!res.ok) throw new Error('Google ha risposto ' + res.status);
      place = await res.json();
    } else {
      res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', 'X-Goog-FieldMask': fields.map((f) => 'places.' + f).join(',') },
        body: JSON.stringify({ textQuery: cfg.ricercaGoogle, languageCode: 'it', maxResultCount: 1 }),
      });
      if (!res.ok) throw new Error('Google ha risposto ' + res.status);
      place = ((await res.json()).places || [])[0];
    }
    if (!place) throw new Error('scheda non trovata');
    const d = {
      voto: place.rating, totale: place.userRatingCount, link: place.googleMapsUri,
      recensioni: (place.reviews || []).map((r) => ({
        autore: r.authorAttribution && r.authorAttribution.displayName,
        profilo: r.authorAttribution && r.authorAttribution.uri,
        stelle: r.rating,
        testo: (r.text && r.text.text) || (r.originalText && r.originalText.text) || '',
        quando: r.relativePublishTimeDescription,
        link: r.googleMapsUri,
      })),
    };
    try { localStorage.setItem(CACHE, JSON.stringify({ t: Date.now(), d })); } catch (e) { /* niente memoria */ }
    return d;
  }

  /* ---------- disegno: una recensione alla volta ---------- */
  let items = [], current = 0;

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function render(list) {
    slider.textContent = ''; nav.textContent = '';
    items = list.filter((r) => r && r.testo && (r.stelle || 5) >= cfg.minimoStelle);
    if (!items.length) {
      // nessuna recensione da mostrare: invito a leggerle su Google
      const a = el('a', 'greviews__empty', 'Leggi cosa dicono i nostri clienti su Google');
      a.href = link.href; a.target = '_blank'; a.rel = 'noopener';
      const go = el('span', 'greviews__go'); go.setAttribute('aria-hidden', 'true'); go.appendChild(el('i', 'arrow'));
      a.appendChild(go);
      slider.appendChild(a);
      root.classList.add('is-empty');
      return;
    }
    root.classList.remove('is-empty');
    items.forEach((r, i) => {
      const fig = el('figure', 'greview' + (i === 0 ? ' is-active' : ''));
      fig.setAttribute('aria-hidden', String(i !== 0));
      const st = el('span', 'stars stars--sm'); st.style.setProperty('--rating', r.stelle || 5);
      st.setAttribute('role', 'img'); st.setAttribute('aria-label', (r.stelle || 5) + ' stelle su 5');
      const q = el('blockquote', 'greview__text', r.testo.trim());
      const name = (r.autore || 'Cliente Google').trim();
      const cap = el('figcaption', 'greview__by');
      const av = el('span', 'greview__avatar', name.charAt(0).toUpperCase()); av.setAttribute('aria-hidden', 'true');
      const who = el('span', 'greview__who');
      who.appendChild(el('strong', null, name));
      if (r.quando) who.appendChild(el('span', null, r.quando));
      const more = el('a', 'greview__more', 'Leggi su Google');
      more.href = r.link || link.href; more.target = '_blank'; more.rel = 'noopener';
      cap.append(av, who, more);
      fig.append(st, q, cap);
      slider.appendChild(fig);
      if (items.length > 1) {
        const b = el('button', 'greviews__dot');
        b.type = 'button';
        b.setAttribute('aria-label', 'Recensione ' + (i + 1) + ' di ' + items.length);
        b.addEventListener('click', () => show(i));
        nav.appendChild(b);
      }
    });
    current = 0;
    show(0);
  }

  function show(i) {
    const prev = current;
    current = (i + items.length) % items.length;
    [...slider.children].forEach((f, k) => {
      // chi esce sale e sfuma, chi entra arriva dal basso
      if (k === prev && prev !== current) {
        f.classList.add('is-leaving');
        setTimeout(() => f.classList.remove('is-leaving'), 900);
      }
      f.classList.toggle('is-active', k === current);
      f.setAttribute('aria-hidden', String(k !== current));
    });
    [...nav.children].forEach((b, k) => b.setAttribute('aria-current', String(k === current)));
  }

  // Rotazione automatica: la barretta attiva si riempie in "ogniSecondi" e, finita, passa alla recensione successiva.
  // Si ferma (anche la barretta) col mouse sopra, col focus o con la pagina nascosta; con "riduci animazioni" non parte.
  root.style.setProperty('--grv-t', Math.max(3, cfg.ogniSecondi) + 's');
  nav.addEventListener('animationend', (e) => { if (e.animationName === 'grvProgress' && items.length > 1) show(current + 1); });
  let hover = false, focus = false;
  const syncPause = () => root.classList.toggle('is-paused', hover || focus || document.hidden);
  root.addEventListener('pointerenter', () => { hover = true; syncPause(); });
  root.addEventListener('pointerleave', () => { hover = false; syncPause(); });
  root.addEventListener('focusin', () => { focus = true; syncPause(); });
  root.addEventListener('focusout', () => { focus = false; syncPause(); });
  document.addEventListener('visibilitychange', syncPause);
  slider.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') show(current + 1);
    if (e.key === 'ArrowLeft') show(current - 1);
  });

  // avvio: prima i dati locali (subito visibili), poi, se c'è la chiave, quelli aggiornati da Google
  setSummary(cfg.voto, cfg.totale, cfg.linkGoogle);
  render(cfg.recensioni || []);
  if (cfg.googleApiKey) {
    fromGoogle()
      .then((d) => { setSummary(d.voto, d.totale, d.link); if (d.recensioni.length) render(d.recensioni); })
      .catch((e) => console.info('[recensioni] uso i dati locali:', e.message));
  }

  // per le prove: RECENSIONI_WIDGET.render([...]) ridisegna con un elenco qualsiasi
  window.RECENSIONI_WIDGET = { render, show };
})();
