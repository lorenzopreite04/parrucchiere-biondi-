/* =========================================================
   RIFLESSI DI LUCE (bokeh) — canvas 2D, nessuna libreria
   ---------------------------------------------------------
   Dischi di luce dorata, morbidi e trasparenti, come una foto fuori fuoco:
   compaiono in punti casuali, restano qualche secondo e svaniscono.
   - Nella hero possono stare anche nello sfondo della foto, ma sempre DIETRO la ragazza:
     la sua sagoma (assets/hero-capelli-sagoma.png, -notte-sagoma.png) "ritaglia" i riflessi.
     Le sagome si rigenerano con strumenti\genera-sagoma.ps1.
   - Nelle sezioni della griglia (chi siamo, ecc.) restano sullo sfondo, dietro testi e foto,
     e si accendono solo mentre la sezione è aperta.
   ========================================================= */
(() => {
  /* ---------- REGOLAZIONI (puoi cambiarle liberamente) ---------- */
  const CONFIG = {
    quanti: 26,           // riflessi visibili insieme su uno schermo 1440×860 (si adatta alla grandezza dello schermo)
    quantiSezioni: 18,    // ...e nello sfondo delle sezioni della griglia
    raggio: [16, 70],     // grandezza dei dischi in pixel (minimo, massimo) su uno schermo 1440×860
    durata: [4, 9],       // secondi di vita di ogni riflesso (comparsa + pausa + scomparsa)
    intensita: 1,         // 0.5 = più tenui, 1.5 = più luminosi
    comparsa: 2.4,        // quanti nuovi riflessi al secondo, al massimo, finché non si raggiunge "quanti"
  };

  const html = document.documentElement;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const rand = (a, b) => a + Math.random() * (b - a);
  const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  const isNight = () => html.getAttribute('data-theme') === 'notte';

  /* ---------- colori ----------
     giorno: dischi d'oro ambrato ben visibili sul bianco (centro più chiaro, bordo più intenso)
     notte: luce dorata che si somma al nero */
  const THEMES = {
    giorno: { tints: ['205,140,40', '218,160,62', '196,128,34', '228,176,86'], blend: 'source-over', alpha: .62, center: .34, rim: .95 },
    notte:  { tints: ['255,208,118', '255,228,160', '246,182,84', '255,240,196'], blend: 'screen', alpha: .82, center: .5, rim: .95 },
  };
  let theme = THEMES.giorno, sprites = [];

  // un disco come il bokeh di un obiettivo: interno uniforme, bordo un po' più intenso, contorno sfumato
  function disc(rgb, soft) {
    const c = document.createElement('canvas'); c.width = c.height = 160;
    const g = c.getContext('2d'), r = 78, ce = theme.center, ri = theme.rim;
    const gr = g.createRadialGradient(80, 80, 0, 80, 80, r);
    const stops = soft
      ? [[0, ce * 1.1], [.55, ce * 1.15], [.8, ce * 1.05], [.92, ce * .5], [1, 0]]          // fuori fuoco: niente bordo
      : [[0, ce], [.6, ce * 1.1], [.84, ri * .8], [.92, ri], [.97, ri * .4], [1, 0]];     // bordo luminoso
    stops.forEach(([o, a]) => gr.addColorStop(o, `rgba(${rgb},${Math.min(1, a)})`));
    g.fillStyle = gr; g.beginPath(); g.arc(80, 80, r, 0, Math.PI * 2); g.fill();
    const hl = g.createRadialGradient(62, 58, 0, 62, 58, r * .7);              // piccolo riflesso decentrato
    hl.addColorStop(0, 'rgba(255,255,255,.22)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hl; g.beginPath(); g.arc(80, 80, r, 0, Math.PI * 2); g.fill();
    return c;
  }
  function makeSprites() {
    theme = THEMES[isNight() ? 'notte' : 'giorno'];
    sprites = theme.tints.flatMap((t) => [disc(t, false), disc(t, true)]);
  }
  makeSprites();

  /* ---------- un "motore" di riflessi su un canvas ----------
     opts.media: riquadro della foto con la ragazza (solo hero) · opts.quanti: quanti riflessi */
  function Riflessi(canvas, opts) {
    const ctx = canvas.getContext('2d');
    const media = opts.media || null;
    const photo = media && media.querySelector('img');
    let W = 0, H = 0, dpr = 1, scale = 1, lights = [], target = 0;
    let running = false, raf = null, last = 0;

    /* sagoma della ragazza (solo hero): cut = immagine opaca dove c'è la ragazza, per "bucare" i riflessi;
       data = gli stessi valori, per non far nascere riflessi sopra di lei */
    const shapes = {};
    let shape = null, box = null, img = null;
    function loadShape() {
      if (!media) return;
      const src = isNight() ? media.dataset.notteSagoma : media.dataset.giornoSagoma;
      if (!src) return;
      if (shapes[src]) { shape = shapes[src]; return; }
      const im = new Image();
      im.onload = () => {
        const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
        const g = c.getContext('2d'); g.drawImage(im, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height), data = new Uint8Array(c.width * c.height);
        for (let n = 0; n < data.length; n++) {
          data[n] = d.data[n * 4];
          d.data[n * 4] = d.data[n * 4 + 1] = d.data[n * 4 + 2] = 0; d.data[n * 4 + 3] = data[n];   // bianco -> opaco
        }
        g.putImageData(d, 0, 0);
        shapes[src] = { cut: c, data, w: c.width, h: c.height };
        if (src === (isNight() ? media.dataset.notteSagoma : media.dataset.giornoSagoma)) {
          shape = shapes[src];
          lights = lights.filter((l) => girlAt(l.x, l.y) < .25);
        }
        if (!running) draw(0);
      };
      im.src = src;
    }
    // dove sta la foto (coordinate del canvas): object-fit: cover allineata a destra
    function measurePhoto() {
      if (!media) { box = img = null; return; }
      const host = canvas.offsetParent;
      let x = 0, y = 0, el = media;
      while (el && el !== host) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent; }
      const bw = media.offsetWidth, bh = media.offsetHeight;
      const ar = photo && photo.naturalWidth ? photo.naturalWidth / photo.naturalHeight : 16 / 9;
      const dw = Math.max(bw, bh * ar), dh = dw / ar;
      box = { x, y, w: bw, h: bh };
      img = { x: x + bw - dw, y: y + (bh - dh) / 2, w: dw, h: dh };
    }
    // quanto c'è "ragazza" nel punto (0 = sfondo, 1 = ragazza)
    function girlAt(px, py) {
      if (!box) return 0;
      if (px < box.x || py < box.y || px > box.x + box.w || py > box.y + box.h) return 0;
      if (!shape) return px > img.x + img.w * .43 ? 1 : 0;
      const u = (px - img.x) / img.w, v = (py - img.y) / img.h;
      if (u < 0 || v < 0 || u >= 1 || v >= 1) return 0;
      return shape.data[((v * shape.h) | 0) * shape.w + ((u * shape.w) | 0)] / 255;
    }

    function spawn(midLife) {
      for (let k = 0; k < 30; k++) {
        const r = rand(CONFIG.raggio[0], CONFIG.raggio[1]) * scale * (Math.random() < .2 ? 1.4 : 1);
        const x = rand(-r * .3, W + r * .3), y = rand(-r * .3, H + r * .3);
        if (girlAt(x, y) > .2) continue;                                 // il centro deve cadere sullo sfondo
        const life = rand(CONFIG.durata[0], CONFIG.durata[1]);
        lights.push({
          x, y, r, life, age: midLife ? rand(.15, .7) * life : 0,
          vx: rand(-.06, .06), vy: rand(-.08, .02),                     // deriva lentissima
          fin: rand(.18, .38), fout: rand(.25, .45),                    // quota di vita per comparire / svanire
          a: rand(.5, 1), spr: sprites[(Math.random() * sprites.length) | 0],
          tw: rand(.6, 1.6), ph: rand(0, 6.28),
        });
        return true;
      }
      return false;
    }

    function resize() {
      const w = canvas.clientWidth, h = canvas.clientHeight;           // misure "vere", anche a hero rimpicciolita
      if (!w || !h) return;
      dpr = 1;                                                       // dischi sfocati: la risoluzione piena non si vede, costa e basta
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      if (W && H) lights.forEach((l) => { l.x *= w / W; l.y *= h / H; });
      W = w; H = h;
      scale = Math.max(.5, Math.min(1.4, Math.min(W / 1440, H / 860) * 1.1));
      measurePhoto();
      target = Math.max(6, Math.round(opts.quanti * (W * H) / (1440 * 860)));
      if (!lights.length) for (let i = 0; i < target * .8; i++) spawn(true);
      if (!running) draw(0);
    }

    function draw(dt) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = theme.blend;
      for (let i = lights.length - 1; i >= 0; i--) {
        const l = lights[i];
        if (dt) { l.age += dt; l.x += l.vx * dt * 60; l.y += l.vy * dt * 60; }
        const t = l.age / l.life;
        if (t >= 1) { lights.splice(i, 1); continue; }
        const env = smooth(t / l.fin) * smooth((1 - t) / l.fout);
        const breathe = 1 + .03 * Math.sin(l.age * l.tw + l.ph);
        const a = env * l.a * theme.alpha * CONFIG.intensita * (.85 + .15 * Math.sin(l.age * l.tw * 1.3 + l.ph));
        if (a < .003) continue;
        const s = l.r * 2 * breathe;
        ctx.globalAlpha = Math.min(1, a);
        ctx.drawImage(l.spr, l.x - s / 2, l.y - s / 2, s, s);
      }
      // hero: la ragazza "buca" i riflessi, che restano solo dietro di lei
      if (box) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip();
        if (shape) ctx.drawImage(shape.cut, img.x, img.y, img.w, img.h);
        else ctx.fillRect(img.x + img.w * .43, box.y, box.w, box.h);
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      if (dt && lights.length < target && Math.random() < dt * CONFIG.comparsa) spawn(false);
    }

    // 30 disegni al secondo bastano (i riflessi si muovono lentissimi): metà lavoro per il browser
    function frame(t) {
      raf = null;
      if (!running) return;
      if (last && t - last < 30) { raf = requestAnimationFrame(frame); return; }
      const dt = last ? Math.min((t - last) / 1000, .08) : 1 / 30; last = t;
      draw(dt);
      raf = requestAnimationFrame(frame);
    }
    // on = deve girare? (con "riduci animazioni" resta un'immagine ferma)
    function set(on) {
      on = on && !document.hidden && !reduce.matches;
      if (on === running) return;
      running = on; last = 0;
      if (on && !raf) raf = requestAnimationFrame(frame);
      if (!on) draw(0);
    }
    function retheme() {
      loadShape();
      lights.forEach((l) => { l.spr = sprites[(Math.random() * sprites.length) | 0]; });
      if (!running) draw(0);
    }

    loadShape();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas); if (media) ro.observe(media);
    if (photo) photo.addEventListener('load', () => { measurePhoto(); if (!running) draw(0); });
    return { set, retheme, conta: () => lights.length, ragazzaIn: girlAt };
  }

  /* ---------- hero ---------- */
  const heroCanvas = document.getElementById('lightBokeh');
  let hero = null, heroVisible = true, covered = false;
  if (heroCanvas && heroCanvas.getContext) {
    hero = Riflessi(heroCanvas, { media: document.getElementById('hairFx'), quanti: CONFIG.quanti });
    const sync = () => hero.set(heroVisible && !covered);
    new IntersectionObserver(([en]) => { heroVisible = en.isIntersecting; sync(); }).observe(heroCanvas.closest('.hero') || heroCanvas);
    document.addEventListener('visibilitychange', sync);
    reduce.addEventListener && reduce.addEventListener('change', sync);
    hero.sync = sync;
  }

  /* ---------- sezioni della griglia: i riflessi girano solo in quella aperta ---------- */
  const sections = new Map();                  // id della sezione -> motore (creato alla prima apertura)
  let openId = null;
  document.addEventListener('biondi:sezione', (e) => {
    const d = e.detail || {};
    covered = !!d.aperta;
    if (hero) hero.sync();                     // la hero è coperta: si ferma
    if (openId && sections.has(openId)) sections.get(openId).set(false);
    openId = d.aperta ? d.id : null;
    if (!openId) return;
    const id = openId, panel = document.getElementById(id), cv = panel && panel.querySelector('.panel__bokeh');
    if (!cv || !cv.getContext) return;
    // partono a sezione già aperta: durante l'animazione d'apertura il browser ha già abbastanza da fare
    setTimeout(() => {
      if (openId !== id) return;
      if (!sections.has(id)) sections.set(id, Riflessi(cv, { quanti: CONFIG.quantiSezioni }));
      sections.get(id).set(true);
    }, 950);
  });
  document.addEventListener('visibilitychange', () => { if (openId && sections.has(openId)) sections.get(openId).set(!document.hidden); });

  // cambio giorno/notte: nuovi colori (e sagoma dell'altra foto nella hero)
  new MutationObserver(() => {
    makeSprites();
    if (hero) hero.retheme();
    sections.forEach((s) => s.retheme());
  }).observe(html, { attributes: true, attributeFilter: ['data-theme'] });

  window.RiflessiLuce = { config: CONFIG, conta: () => (hero ? hero.conta() : 0), ragazzaIn: (x, y) => (hero ? hero.ragazzaIn(x, y) : 0) };
})();
