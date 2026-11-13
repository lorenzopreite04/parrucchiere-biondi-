/* =========================================================
   I RISULTATI (sezione 02): i video impilati in diagonale che scorrono da soli.
   Posizione nella pila (o): 0 = davanti, -1 -2 = in alto a sinistra (già visti), 1 2 = in basso a destra (i prossimi),
   ±3 = nascosti appena fuori dalla pila. Ogni passo sposta tutti i video di una posizione lungo la diagonale.
   Solo il video davanti è in riproduzione; gli altri sono fermi (e senza audio).
   ========================================================= */
(() => {
  const deck = document.getElementById('deck');
  if (!deck) return;
  const panel = deck.closest('.panel');
  const cards = [...deck.querySelectorAll('.deck__card')];
  const vids = cards.map((c) => c.querySelector('video'));
  const N = cards.length;
  const countEl = deck.querySelector('.deck__count b');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const CONFIG = {
    scala: [1, .9, .82, .74],       // grandezza per distanza dal centro (0 = davanti)
    velo: [0, .35, .62, 1],         // quanto sono velati i video dietro
  };
  // ogni video è già tagliato sul risultato (circa 10 secondi): resta davanti per tutta la sua durata,
  // poi la pila passa al prossimo.

  let cur = 0, active = false, raf = null;
  // posizione di ogni video rispetto a quello davanti: 0..3 avanti, -1..-2 indietro (con 6 video)
  const rel = (i) => { let o = ((i - cur) % N + N) % N; if (o > N / 2) o -= N; return o; };

  function set(c, o) {
    const v = Math.max(-3, Math.min(3, o)), a = Math.abs(v);
    c._v = v;
    c.style.setProperty('--o', v);
    c.style.setProperty('--s', CONFIG.scala[a]);
    c.style.setProperty('--dim', CONFIG.velo[a]);
    c.style.zIndex = String(10 - a);
    c.classList.toggle('is-shown', a < 3);
    c.classList.toggle('is-front', v === 0);
  }
  function snap(c, o) { c.classList.add('no-anim'); set(c, o); void c.offsetWidth; c.classList.remove('no-anim'); }
  // un video che deve passare da un capo all'altro della pila non la attraversa:
  // esce dal suo lato, riappare (invisibile) dall'altro e da lì entra
  function move(c, o) {
    clearTimeout(c._t);
    const v = c._v === undefined ? 3 : c._v;
    const crossing = (v <= -2 && o >= 2) || (v >= 2 && o <= -2);
    if (!crossing) { set(c, o); return; }
    const out = v < 0 ? -3 : 3;
    const enter = () => { snap(c, -out); set(c, o); };
    if (v === out) enter();
    else { set(c, out); c._t = setTimeout(enter, reduce ? 0 : 900); }
  }
  function render() {
    cards.forEach((c, i) => move(c, rel(i)));
    countEl.textContent = String(cur + 1).padStart(2, '0');
  }

  // solo il video davanti va; quando arriva davanti riparte dall'inizio (così si vede la trasformazione)
  function syncVideos(restart) {
    vids.forEach((v, i) => {
      if (i === cur && active) {
        v.loop = false;
        if (restart && v.currentTime > 0) { try { v.currentTime = 0; } catch (e) {} }
        const p = v.play(); if (p) p.catch(() => {});
      } else v.pause();
    });
    const next = vids[(cur + 1) % N];                     // il prossimo inizia a caricarsi
    if (active && next.preload !== 'auto') next.preload = 'auto';
  }

  // la linea d'oro sotto il video davanti segue il video vero (non un timer)
  function bar() {
    raf = null;
    if (!active) return;
    const v = vids[cur], c = cards[cur];
    c.style.setProperty('--p', v.duration ? Math.min(1, v.currentTime / v.duration).toFixed(4) : 0);
    raf = requestAnimationFrame(bar);
  }
  const startBar = () => { if (!raf) raf = requestAnimationFrame(bar); };
  const stopBar = () => { if (raf) cancelAnimationFrame(raf); raf = null; };

  function go(dir) {
    cards[cur].style.setProperty('--p', 0);
    cur = (cur + dir + N) % N;
    render(); syncVideos(true);
  }  // clic su un video dietro: la pila scorre fino a portarlo davanti
  function jump(o) {
    const d = Math.sign(o); let k = Math.abs(o);
    const step = () => { go(d); if (--k > 0) setTimeout(step, 260); };
    step();
  }

  cards.forEach((c, i) => c.addEventListener('click', () => { const o = rel(i); if (o) jump(o); }));
  deck.addEventListener('click', (e) => {
    const b = e.target.closest('[data-deck]');
    if (!b) return;
    if (b.dataset.deck === 'next') go(1);
    else if (b.dataset.deck === 'prev') go(-1);
  });
  // i video sono sempre senza audio (anche se qualcuno prova ad attivarlo dal menu del browser)
  // e, finché il video davanti non è pronto, sopra c'è l'icona di caricamento
  vids.forEach((v) => {
    v.muted = true; v.defaultMuted = true; v.volume = 0; v.disableRemotePlayback = true; v.loop = false;
    // finito il video: si passa al prossimo (con movimento ridotto, invece, ricomincia)
    v.addEventListener('ended', () => {
      if (!active || v !== vids[cur]) return;
      if (reduce) { v.currentTime = 0; v.play().catch(() => {}); } else go(1);
    });
    v.addEventListener('volumechange', () => { if (!v.muted || v.volume) { v.muted = true; v.volume = 0; } });
    const card = v.closest('.deck__card');
    card.appendChild(window.biondiLoader ? window.biondiLoader() : document.createElement('span'));
    const busy = (on) => card.classList.toggle('is-loading', on);
    ['loadstart', 'waiting', 'stalled'].forEach((ev) => v.addEventListener(ev, () => busy(!v.paused || v.readyState < 3)));
    ['playing', 'canplay', 'pause'].forEach((ev) => v.addEventListener(ev, () => busy(false)));
  });
  deck.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { go(1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { go(-1); e.preventDefault(); }
  });
  // telefono: scorri col dito in orizzontale (a sinistra = prossimo); in verticale scorre la pagina
  let tx = null, ty = null;
  deck.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
  deck.addEventListener('touchend', (e) => {
    if (tx === null) return;
    const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    tx = ty = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) go(dx < 0 ? 1 : -1);
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!active) return;
    if (document.hidden) vids[cur].pause(); else syncVideos();
  });

  // parte quando la sezione si apre, si ferma quando si chiude
  function setActive(on) {
    if (on === active) return;
    active = on;
    // la pila entra subito; i video partono a sezione aperta (durante l'animazione d'apertura sarebbero solo peso)
    if (on) { render(); setTimeout(() => { if (active) { syncVideos(); startBar(); } }, 700); }
    else { stopBar(); vids.forEach((v) => v.pause()); }
  }
  new MutationObserver(() => setActive(panel.classList.contains('is-open')))
    .observe(panel, { attributes: true, attributeFilter: ['class'] });
  setActive(panel.classList.contains('is-open'));
})();
