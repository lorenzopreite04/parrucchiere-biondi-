/* =========================================================
   NUVOLE tra hero e griglia (solo telefono, dove la hero non entra nella griglia).
   Come sul sito del Centro Medico Preite: un banco di sbuffi morbidi su due piani di profondità
   che scivolano piano verso destra, "respirano" e si aprono dove passa il dito o il mouse.
   I colori seguono giorno/notte: corpo del colore della griglia, ombra calda sotto per dare volume.
   ========================================================= */
(() => {
  const wrap = document.querySelector('.clouds');
  if (!wrap) return;
  const canvas = wrap.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const html = document.documentElement;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // colore di fondo della griglia (es. #f3eee6) -> [r, g, b]
  function rgb(v) {
    const m = /^#?([0-9a-f]{6})$/i.exec((v || '').trim());
    if (!m) return [243, 238, 230];
    const n = parseInt(m[1], 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }
  const rgba = (c, a) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

  // uno sbuffo: pochi cerchi grandi al centro + tanti piccoli ai bordi = contorno sfrangiato; ombra sotto, corpo sopra
  function puffSprite(size, shade, body) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const blobs = Array.from({ length: 22 }, (_, k) => {
      const a = Math.random() * Math.PI * 2;
      const d = (k < 6 ? 0.1 : 0.2 + Math.random() * 0.12) * size * Math.random() + (k < 6 ? 0 : size * 0.06);
      return { x: size / 2 + Math.cos(a) * d, y: size / 2 + Math.sin(a) * d * 0.75, r: size * (k < 6 ? 0.2 + Math.random() * 0.1 : 0.11 + Math.random() * 0.08) };
    });
    // il bordo sfuma nello stesso colore trasparente (verso il nero trasparente lascerebbe aloni grigi intorno a ogni cerchio)
    const paint = (dy, inner, mid, edge) => {
      for (const b of blobs) {
        const grad = g.createRadialGradient(b.x, b.y + dy, 0, b.x, b.y + dy, b.r);
        grad.addColorStop(0, inner); grad.addColorStop(0.7, mid); grad.addColorStop(1, edge);
        g.fillStyle = grad; g.beginPath(); g.arc(b.x, b.y + dy, b.r, 0, Math.PI * 2); g.fill();
      }
    };
    paint(size * 0.05, shade[0], shade[1], shade[2]);
    paint(0, body[0], body[1], body[2]);
    return c;
  }

  let sprites = [], baseColor = [243, 238, 230];
  function colors() {
    const notte = html.getAttribute('data-theme') === 'notte';
    baseColor = rgb(getComputedStyle(html).getPropertyValue('--grid-bg'));
    const gold = [167, 129, 58];
    // di notte gli sbuffi sono appena più chiari del fondo (con una punta d'oro), altrimenti sparirebbero nel nero
    const body = notte ? mix(mix(baseColor, [255, 255, 255], 0.06), gold, 0.05) : baseColor;
    const sh = notte ? [0, 0, 0] : [150, 112, 48];
    const shade = notte ? [rgba(sh, 0.32), rgba(sh, 0.1), rgba(sh, 0)] : [rgba(sh, 0.1), rgba(sh, 0.04), rgba(sh, 0)];
    sprites = Array.from({ length: 6 }, () => puffSprite(256, shade, [rgba(body, 1), rgba(body, 0.95), rgba(body, 0)]));
  }

  // dito / mouse: le nuvole si aprono dolcemente intorno
  const ptr = { x: -9999, y: -9999 };
  window.addEventListener('pointermove', (e) => { ptr.x = e.clientX; ptr.y = e.clientY; }, { passive: true });
  window.addEventListener('pointerdown', (e) => { ptr.x = e.clientX; ptr.y = e.clientY; }, { passive: true });
  const away = () => { ptr.x = ptr.y = -9999; };
  window.addEventListener('pointerup', away, { passive: true });
  window.addEventListener('pointercancel', away, { passive: true });

  let cw = 0, ch = 0, puffs = [], on = false, prev = 0;
  function build() {
    cw = wrap.clientWidth; ch = wrap.clientHeight;
    if (!cw || !ch) return false;                           // nascosto (schermi grandi): niente da disegnare
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // tanti sbuffi sovrapposti lungo la linea di separazione, distribuiti su tutta la larghezza
    const n = Math.round(cw / 30) + 10;
    puffs = Array.from({ length: n }, (_, k) => {
      const front = k % 3 !== 0;
      const r = ch * (front ? 0.3 + Math.random() * 0.2 : 0.36 + Math.random() * 0.18);
      return {
        x: ((k + Math.random() * 0.8) / n) * (cw + r * 2) - r,
        y: ch * (front ? 0.62 + Math.random() * 0.1 : 0.48 + Math.random() * 0.08),
        r,
        vx: (front ? 0.008 : 0.004) + Math.random() * 0.008,   // deriva lenta verso destra
        ph: Math.random() * Math.PI * 2, sp: 0.00025 + Math.random() * 0.0003,
        rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 0.00006,
        a: front ? 1 : 0.7 + Math.random() * 0.2,
        ox: 0, oy: 0, s: (Math.random() * 6) | 0,
      };
    }).sort((p, q) => p.a - q.a);                          // quelli dietro disegnati per primi
    return true;
  }

  function frame(now) {
    const dt = Math.min(50, now - (prev || now)); prev = now;
    ctx.clearRect(0, 0, cw, ch);
    // niente sfumatura: sopra la foto ci sono solo gli sbuffi; sotto la loro linea il fondo pieno della griglia
    ctx.fillStyle = rgba(baseColor, 1); ctx.fillRect(0, ch * 0.66, cw, ch * 0.34);
    const rect = wrap.getBoundingClientRect();
    const px = ptr.x - rect.left, py = ptr.y - rect.top, R = Math.max(120, ch * 0.8);
    for (const p of puffs) {
      if (!reduce) { p.x += p.vx * dt; if (p.x - p.r > cw) p.x = -p.r; p.rot += p.vr * dt; }
      const bx = p.x, by = p.y + (reduce ? 0 : Math.sin(now * p.sp + p.ph) * ch * 0.035);
      const dx = bx - px, dy = by - py, d = Math.hypot(dx, dy) || 1;
      const k = Math.max(0, 1 - d / R), push = k * k * ch * 0.22;
      p.ox += ((dx / d) * push - p.ox) * 0.05; p.oy += ((dy / d) * push * 0.6 - p.oy) * 0.05;
      const r = p.r * (1 + (reduce ? 0 : Math.sin(now * p.sp * 1.3 + p.ph) * 0.05));   // leggero "respiro"
      ctx.globalAlpha = p.a;
      ctx.save(); ctx.translate(bx + p.ox, by + p.oy); ctx.rotate(p.rot);
      ctx.drawImage(sprites[p.s], -r, -r * 0.8, r * 2, r * 1.6);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  function loop(now) { if (!on) return; frame(now); requestAnimationFrame(loop); }

  colors();
  let ready = build();
  // anima solo quando le nuvole si vedono (e mai mentre una sezione copre la pagina)
  let visible = false, covered = false;
  const update = () => {
    const want = visible && !covered && ready && !reduce;
    if (want && !on) { on = true; prev = 0; requestAnimationFrame(loop); }
    if (!want) on = false;
    if (reduce && visible && ready) frame(performance.now());
  };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !ready) ready = build(); update(); }).observe(wrap);
  document.addEventListener('biondi:sezione', (e) => { covered = !!(e.detail && e.detail.aperta); update(); });
  // l'altezza dipende solo dalla larghezza: niente ricostruzione quando su telefono cambia la barra del browser
  window.addEventListener('resize', () => { if (wrap.clientWidth !== cw) { ready = build(); update(); } });
  // giorno / notte: nuovi colori
  new MutationObserver(() => { colors(); if (reduce) update(); }).observe(html, { attributes: true, attributeFilter: ['data-theme'] });
})();
