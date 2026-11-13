/* =========================================================
   CONTATTI (sezione 04): interruttore Pescara / Roma, orari "aperto ora" e mappa 3D.
   La mappa usa MapLibre GL con le mappe gratuite di OpenFreeMap (niente chiave da configurare):
   si carica solo la prima volta che si apre la sezione, mostra gli edifici in 3D, gira piano su se stessa
   e quando cambi sede vola da una città all'altra. Se il browser non la supporta, resta il link a Google Maps.
   ========================================================= */
(() => {
  const panel = document.getElementById('contatti');
  const el = document.getElementById('mappa3d');
  if (!panel || !el) return;
  const wrap = el.parentElement;
  if (window.biondiLoader) wrap.appendChild(window.biondiLoader('sedi__loader'));   // icona finché la mappa non è pronta
  const html = document.documentElement;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touch = window.matchMedia('(pointer: coarse)').matches;

  const SEDI = {
    pescara: { center: [14.21115, 42.46957], zoom: 16.3, pitch: 58, bearing: -24,
               nome: 'Biondi Parrucchieri', sotto: 'Via Palermo 79/81',
               google: 'Biondi+Parrucchieri,+Via+Palermo+79,+Pescara' },
    // Via Pio Foà, Monteverde: il civico 40 non è segnato su OpenStreetMap, il punto è al centro della via (corta, circa 100 m)
    roma:    { center: [12.44886, 41.87938], zoom: 16.3, pitch: 58, bearing: 18,
               nome: 'Biondi Roma', sotto: 'Via Pio Foà 40', google: 'Via+Pio+Fo%C3%A0+40,+00152+Roma' },
  };
  const STILI = { giorno: 'https://tiles.openfreemap.org/styles/positron', notte: 'https://tiles.openfreemap.org/styles/dark' };
  const EDIFICI = {                               // colori degli edifici 3D: bassi → alti
    giorno: ['#f4efe7', '#e3d8c6'],
    notte: ['#221d18', '#3b3128'],
  };
  const LIB = 'assets/vendor/maplibre-gl-4.7.1/maplibre-gl';       // libreria della mappa ospitata sul sito (licenza BSD nella stessa cartella)
  // true = finito l'ingresso la mappa continua a girare piano da sola (bella, ma ridisegnare la mappa 3D di continuo pesa:
  // sui computer meno potenti la sezione diventa meno fluida). false = entra girando attorno al salone e poi resta ferma.
  const GIRA_DA_SOLA = false;
  const theme = () => (html.getAttribute('data-theme') === 'notte' ? 'notte' : 'giorno');

  let sede = 'pescara', map = null, loading = false, orbiting = false, idleT = null;

  /* ---------- interruttore ---------- */
  const sw = panel.querySelector('.sedi__switch');
  const tabs = [...sw.querySelectorAll('[role="tab"]')];
  function choose(id, focus) {
    if (!SEDI[id]) return;
    sede = id; sw.dataset.on = id;
    tabs.forEach((t) => {
      const on = t.dataset.sede === id;
      t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
      const card = document.getElementById(t.getAttribute('aria-controls'));
      card.classList.toggle('is-off', !on); card.inert = !on;
    });
    wrap.querySelector('.sedi__fallback').href = 'https://www.google.com/maps/search/?api=1&query=' + SEDI[id].google;
    if (map) fly(id);
  }
  tabs.forEach((t) => t.addEventListener('click', () => choose(t.dataset.sede)));
  sw.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = tabs.findIndex((t) => t.dataset.sede === sede);
    choose(tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length].dataset.sede, true);
    e.preventDefault();
  });
  choose('pescara');

  /* ---------- orari: "Aperto ora" / "Chiuso ora" e il giorno di oggi in evidenza ---------- */
  const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  function orari() {
    panel.querySelectorAll('[data-orari]').forEach((ul) => {
      let week; try { week = JSON.parse(ul.dataset.orari); } catch (e) { return; }
      const badge = ul.closest('.sede__row').querySelector('[data-orari-stato]');
      const now = new Date(), d = now.getDay(), min = now.getHours() * 60 + now.getMinutes();
      const span = (s) => { const m = /^(\d+):(\d+)-(\d+):(\d+)$/.exec(s || ''); return m ? [m[1] * 60 + +m[2], m[3] * 60 + +m[4], m[1] + ':' + m[2], m[3] + ':' + m[4]] : null; };
      const today = span(week[d]);
      let text, open = false;
      if (today && min >= today[0] && min < today[1]) { open = true; text = 'Aperto ora · chiude alle ' + today[3]; }
      else if (today && min < today[0]) text = 'Chiuso ora · apre alle ' + today[2];
      else {
        text = 'Chiuso ora';
        for (let k = 1; k <= 7; k++) { const s = span(week[(d + k) % 7]); if (s) { text += ' · apre ' + (k === 1 ? 'domani' : GIORNI[(d + k) % 7]) + ' alle ' + s[2]; break; } }
      }
      if (badge) { badge.textContent = text; badge.classList.toggle('is-open', open); }
      // data-g = primo giorno della riga: la riga dei giorni aperti (2 = martedì) o quella dei giorni chiusi (0)
      ul.querySelectorAll('li').forEach((li) => li.classList.toggle('is-today', (today ? 2 : 0) === +li.dataset.g));
    });
  }
  orari(); setInterval(orari, 60000);

  /* ---------- mappa ---------- */
  // se la mappa 3D non si può mostrare resta il link "Apri la mappa" (niente mappa di Google incorporata:
  // installerebbe cookie di terze parti, e il sito non ne usa)
  function fallback() { wrap.classList.add('is-fallback'); }
  function loadLib() {
    return new Promise((ok, ko) => {
      if (window.maplibregl) return ok();
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = LIB + '.css';
      document.head.appendChild(css);
      const s = document.createElement('script'); s.src = LIB + '.js'; s.onload = ok; s.onerror = ko;
      document.head.appendChild(s);
    });
  }
  function webgl() {
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
  }

  // edifici in 3D, sotto le scritte della mappa (si rimettono a ogni cambio di stile giorno/notte);
  // luce morbida e orizzonte che sfuma nel colore della pagina
  function edifici() {
    if (!map || map.getLayer('edifici-3d') || !map.getSource('openmaptiles')) return;
    const bg = getComputedStyle(html).getPropertyValue('--bg').trim() || '#ffffff';
    map.setLight({ anchor: 'viewport', color: '#ffffff', intensity: theme() === 'notte' ? .22 : .3, position: [1.15, 200, 35] });
    if (map.setSky) map.setSky({ 'sky-color': bg, 'horizon-color': bg, 'fog-color': bg, 'sky-horizon-blend': .6, 'horizon-fog-blend': .7, 'fog-ground-blend': .55 });
    // un plastico pulito, senza scritte né icone: il nome e l'indirizzo li dice solo il segnaposto del salone
    map.getStyle().layers.forEach((l) => { if (l.type === 'symbol') map.setLayoutProperty(l.id, 'visibility', 'none'); });
    const before = (map.getStyle().layers.find((l) => l.type === 'symbol') || {}).id;
    const [c1, c2] = EDIFICI[theme()];
    map.addLayer({
      id: 'edifici-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 13.5,
      paint: {
        'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 8], 0, c1, 40, c2],
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13.5, 0, 15, ['coalesce', ['get', 'render_height'], 8]],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': .94,
        'fill-extrusion-vertical-gradient': true,
      },
    }, before);
  }

  // segnaposto del salone (l'angolazione si cambia trascinando la mappa)
  function pin(id) {
    const s = SEDI[id], d = document.createElement('div');
    d.className = 'pin' + (s.presto ? ' pin--soon' : '');
    d.innerHTML = `<span class="pin__label"><b>${s.nome}</b><small>${s.sotto}</small></span><span class="pin__dot"></span>`;
    new maplibregl.Marker({ element: d, anchor: 'bottom' }).setLngLat(s.center).addTo(map);
  }

  // solo la zona intorno al salone: la mappa resta centrata sul segnaposto e non si può portare altrove
  // (abbastanza larga da riempire la mappa, ora che occupa tutta la parte destra dello schermo)
  const area = (id) => { const [x, y] = SEDI[id].center; return [[x - .01, y - .0075], [x + .01, y + .0075]]; };
  const view = (id) => { const s = SEDI[id]; return { center: s.center, zoom: s.zoom, pitch: s.pitch, bearing: s.bearing }; };
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  function intro(id) {
    const s = SEDI[id];
    map.jumpTo({ center: s.center, zoom: s.zoom - .9, pitch: 30, bearing: s.bearing - 55 });
    map.easeTo({ ...view(id), duration: reduce ? 0 : 2800, easing: ease });
    map.once('moveend', () => queueOrbit(1000));
  }
  // cambio di sede: la mappa sfuma, si sposta sull'altra sede (senza attraversare l'Italia) e riappare girandole intorno
  function fly(id) {
    stopOrbit();
    wrap.classList.add('is-switching');
    setTimeout(() => {
      map.setMaxBounds(null);
      intro(id);
      map.setMaxBounds(area(id));
      let shown = false;
      const show = () => { if (!shown) { shown = true; wrap.classList.remove('is-switching'); } };
      map.once('idle', show); setTimeout(show, 1200);
    }, reduce ? 0 : 450);
  }

  // trascinando si gira intorno al salone (in orizzontale) e si cambia inclinazione (in verticale);
  // col dito solo in orizzontale, così in verticale si continua a scorrere la pagina
  function orbitDrag() {
    const box = map.getCanvasContainer();
    let drag = null;
    box.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, b: map.getBearing(), p: map.getPitch(), mouse: e.pointerType === 'mouse' };
      try { box.setPointerCapture(e.pointerId); } catch (err) {}
      box.classList.add('is-dragging'); map.stop(); stopOrbit(); hint(false);
    });
    box.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      map.jumpTo({ bearing: drag.b + dx * .35, pitch: drag.mouse ? Math.max(0, Math.min(68, drag.p - dy * .25)) : drag.p });
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null; box.classList.remove('is-dragging'); queueOrbit(8000);
    };
    box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
  }
  const hintEl = wrap.querySelector('.sedi__hint span');
  function hint() {}                                          // il suggerimento resta sotto la mappa, discreto
  if (hintEl && touch) hintEl.textContent = 'Scorri di lato per girare intorno al salone';
  // + / − sotto la mappa: zoom morbido, sempre verso il salone
  wrap.querySelectorAll('[data-zoom]').forEach((b) => b.addEventListener('click', () => {
    if (!map) return;
    stopOrbit(); queueOrbit(8000);
    const z = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), map.getZoom() + .6 * b.dataset.zoom));
    map.easeTo({ zoom: z, center: SEDI[sede].center, duration: reduce ? 0 : 500 });
  }));

  // la mappa gira piano su se stessa finché nessuno la tocca; se la usi si ferma e riparte dopo un po'
  function frame(t0) {
    let last = t0;
    // 30 volte al secondo bastano (gira lentissima) e la mappa 3D costa la metà
    const step = (t) => {
      if (!orbiting) return;
      if (t - last >= 30) {
        const dt = Math.min(.08, (t - last) / 1000); last = t;
        map.setBearing(map.getBearing() + dt * 2.6);
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function startOrbit() {
    if (!GIRA_DA_SOLA || orbiting || reduce || !map || !panel.classList.contains('is-open') || document.hidden) return;
    orbiting = true; frame(performance.now());
  }
  function stopOrbit() { orbiting = false; clearTimeout(idleT); }
  function queueOrbit(ms) { clearTimeout(idleT); idleT = setTimeout(startOrbit, ms); }

  async function init() {
    if (map || loading) return;
    loading = true;
    if (!webgl()) { fallback(); return; }
    try { await loadLib(); } catch (e) { fallback(); return; }
    const s = SEDI[sede];
    try {
      map = new maplibregl.Map({
        container: el, style: STILI[theme()],
        center: s.center, zoom: s.zoom - .9, pitch: 30, bearing: s.bearing - 55,
        maxBounds: area(sede), minZoom: 15.2, maxZoom: 18.6, maxPitch: 68, renderWorldCopies: false,
        // niente spostamenti: si zooma (sempre verso il salone) e si gira intorno al segnaposto
        dragPan: false, dragRotate: false, keyboard: false, doubleClickZoom: false, boxZoom: false,
        touchPitch: false, touchZoomRotate: false,
        attributionControl: false, fadeDuration: 0,                 // crediti e zoom sono nella riga sotto la mappa (.sedi__ui)
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      });
    } catch (e) { fallback(); return; }
    map.scrollZoom.enable({ around: 'center' });
    map.on('style.load', edifici);
    map.on('error', () => {});                                       // una tessera che non arriva non deve fermare tutto
    Object.keys(SEDI).forEach(pin);
    orbitDrag();
    // pronta quando le prime tessere sono disegnate (primo momento di quiete): solo allora sparisce l'icona e
    // compaiono mappa e segnaposto, così non si sovrappongono a metà caricamento. Se la rete è lenta, al massimo
    // 4 s dopo il caricamento dello stile (o 9 s in tutto, se nel frattempo è cambiato lo stile giorno/notte)
    let started = false;
    const start = () => { if (started) return; started = true; wrap.classList.add('is-ready'); intro(sede); };
    map.once('idle', start); map.once('load', () => setTimeout(start, 4000)); setTimeout(start, 9000);
    // chi usa la mappa la ferma
    map.on('wheel', () => { stopOrbit(); hint(false); queueOrbit(8000); });
    // giorno / notte: cambia lo stile della mappa
    new MutationObserver(() => {
      if (!map) return;
      if (map.getLayer('edifici-3d')) map.removeLayer('edifici-3d');
      map.setStyle(STILI[theme()], { diff: false });                 // ricarica completa: così riparte 'style.load'
    }).observe(html, { attributes: true, attributeFilter: ['data-theme'] });
  }

  // si prepara quando la sezione si apre, si ferma quando si chiude
  // la mappa (pesante) si prepara a sezione già aperta, non durante l'animazione d'apertura
  let wasOpen = false;
  const later = () => setTimeout(() => { if (panel.classList.contains('is-open')) { if (!map) init(); else { map.resize(); intro(sede); } } }, 950);   // a ogni apertura la mappa rientra girando attorno al salone
  new MutationObserver(() => {
    const open = panel.classList.contains('is-open');
    if (open && !wasOpen) { orari(); later(); }
    if (!open) stopOrbit();
    wasOpen = open;
  }).observe(panel, { attributes: true, attributeFilter: ['class'] });
  // appena la sezione comincia a chiudersi la mappa smette di girare (meno lavoro durante l'animazione)
  document.addEventListener('biondi:sezione', (e) => {
    if (e.detail && e.detail.aperta && e.detail.id === 'contatti') return;
    stopOrbit();
    if (map) map.stop();                                      // ferma anche l'eventuale volo/ingresso in corso
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopOrbit(); else if (map && wasOpen) queueOrbit(1500); });
  if (panel.classList.contains('is-open')) { wasOpen = true; later(); }
})();
