/* =========================================================
   EFFETTO CAPELLI + SPOTLIGHT (WebGL, nessuna libreria)
   ---------------------------------------------------------
   Come funziona, in breve:
   - la foto resta un normale <img> (si vede subito ed è il ripiego);
   - sopra c'è un <canvas> che ridisegna la foto spostando i pixel
     secondo una griglia di "molle" spinte dal cursore;
   - la "mappa di movimento" (immagine in grigi) dice quanto può
     muoversi ogni punto: nero = fermo (radici, pelle, mani, forbici),
     bianco = libero (punte e lati);
   - opzionale: con data-hidden sul contenitore, uno spotlight attorno al cursore
     rivela un'immagine nascosta (ora è spento: c'è solo il movimento).
   ========================================================= */
(() => {
  /* ---------- REGOLAZIONI (puoi cambiarle liberamente) ---------- */
  const CONFIG = {
    movimento: 1.0,       // sensibilità: 0.5 = reagiscono la metà, 2 = il doppio (il tetto resta spostamentoMax)
    spostamentoMax: 0.035,// spostamento massimo, in frazione della larghezza foto (0.035 ≈ 45 px)
    zonaSensibile: 0.15,  // raggio della zona che risponde al mouse, in frazione della larghezza foto
    ritorno: 1.4,         // secondi circa per tornare fermi dopo che il mouse si ferma
    rimbalzo: 0.5,        // 0 = nessun rimbalzo, 1 = molto elastico
    propagazione: 0.10,   // quanto il movimento "scende" verso le punte (0 = niente onda)
    spotRaggio: 170,      // raggio dello spotlight sui capelli, in pixel (attivo solo se il div ha data-hidden)
    fpsMinimi: 34,        // sotto questa media l'effetto si spegne e resta la foto
    // --- realismo (versione precedente, senza queste voci: strumenti\backup-capelli-2026-10-21\hair-effect.js) ---
    pendolo: 0.55,        // 0 = tutto si muove insieme, 1 = le punte oscillano molto più a lungo delle radici
    arco: 0.6,            // quando le ciocche oscillano di lato le punte si alzano un po' (come un pendolo)
    ciocche: 0.8,         // 0 = capelli "in blocco", 1 = ogni ciocca si muove un po' diversamente dalla vicina
    lucentezza: 0.12,     // quanto cambiano i riflessi sui capelli mentre si muovono
    coesione: 0.06,       // quanto ogni ciocca si trascina dietro quelle accanto
    brezza: 1.0,          // ondeggiare leggerissimo anche a riposo (0 = fermi finché non passa il mouse)
  };

  const GW = 48, GH = 27;          // risoluzione della griglia di molle (16:9)
  const box = document.getElementById('hairFx');
  if (!box) return;
  const media = box.querySelector('img, video');
  const canvas = box.querySelector('canvas');
  const isVideo = media && media.tagName === 'VIDEO';
  const setState = (s) => { box.dataset.state = s; };

  /* ---------- cambio foto (giorno/notte) ----------
     Funziona sempre: se l'effetto è spento cambia solo l'<img>, se è acceso aggiorna anche foto e mappa nel WebGL. */
  const cache = new Map();
  const loadImg = (src) => new Promise((res, rej) => {
    if (!src) return rej(new Error('nessun file'));
    const im = new Image(); im.decoding = 'async';
    im.onload = () => res(im); im.onerror = () => rej(new Error('impossibile caricare ' + src)); im.src = src;
  });
  const preloadImg = (src) => {
    if (!src) return Promise.resolve(null);
    if (!cache.has(src)) cache.set(src, loadImg(src).catch((e) => { cache.delete(src); throw e; }));
    return cache.get(src);
  };
  let swapTextures = null;                      // impostata più sotto, solo se il WebGL è attivo
  async function setSource(src, map, alt) {
    if (alt) media.alt = alt;
    if (map) box.dataset.map = map;
    if (src && media.getAttribute('src') !== src) {
      media.src = src;
      try { await media.decode(); } catch (e) { /* la foto apparirà appena caricata */ }
    }
    if (swapTextures) { try { await swapTextures(map); } catch (e) { console.warn('[capelli]', e.message); } }
  }
  window.HairFX = {
    setSource,
    preload: (src, map) => Promise.all([preloadImg(src), preloadImg(map)]).catch(() => {}),
  };

  /* ---------- quando NON attivare l'effetto ---------- */
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const saveData = navigator.connection && navigator.connection.saveData;
  if (reduce.matches) return setState('off-animazioni-ridotte');
  if (saveData) return setState('off-risparmio-dati');

  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false, powerPreference: 'low-power' });
  if (!gl) return setState('off-no-webgl');

  /* ---------- shader ---------- */
  const VS = `attribute vec2 aPos; varying vec2 vUv;
    void main(){ vUv = vec2(aPos.x * .5 + .5, .5 - aPos.y * .5); gl_Position = vec4(aPos, 0., 1.); }`;
  const FS = `precision mediump float;
    varying vec2 vUv;
    uniform sampler2D uPhoto, uHidden, uMap, uDisp;
    uniform vec2 uScale, uOffset, uMax, uRes, uSpot, uCell;
    uniform float uSpotR, uSpotA, uHasHidden, uStrand, uSheen;
    float hash(float n){ return fract(sin(n) * 43758.5453); }
    float noise1(float x){ float i = floor(x), f = fract(x); f = f * f * (3. - 2. * f); return mix(hash(i), hash(i + 1.), f); }
    vec2 disp(vec2 p){ return (texture2D(uDisp, p).rg * 255. - 127.) / 127.; }
    void main(){
      vec2 iuv = vUv * uScale + uOffset;                       // coordinate nella foto (object-fit: cover)
      float m = texture2D(uMap, iuv).r;                        // quanto può muoversi questo punto
      vec2 d = disp(iuv);
      // ciocche: ogni ciocca segue il movimento un po' più o un po' meno della vicina (righe quasi verticali)
      float sx = iuv.x + iuv.y * .06 + d.x * .012;
      float s = 1. + uStrand * ((noise1(sx * 46.) - .5) * .7 + (noise1(sx * 210.) - .5) * .35);
      vec2 suv = clamp(iuv - d * uMax * m * s, 0., 1.);
      vec3 col = texture2D(uPhoto, suv).rgb;
      // riflessi: dove le ciocche si aprono o si stringono la luce cambia leggermente
      float g = disp(iuv + vec2(uCell.x, 0.)).x - disp(iuv - vec2(uCell.x, 0.)).x;
      float lum = dot(col, vec3(.299, .587, .114));
      col *= 1. + uSheen * m * clamp(g * 2.5, -1., 1.) * (.35 + lum);
      if (uHasHidden > .5 && uSpotA > .001) {
        float s = (1. - smoothstep(uSpotR * .45, uSpotR, distance(vUv * uRes, uSpot))) * uSpotA;
        col = mix(col, texture2D(uHidden, suv).rgb, s);        // l'immagine nascosta si muove insieme
      }
      gl_FragColor = vec4(col, 1.);
    }`;

  function compile(type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) { console.warn('[capelli] shader non disponibile:', e); return setState('off-errore'); }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  ['uPhoto', 'uHidden', 'uMap', 'uDisp', 'uScale', 'uOffset', 'uMax', 'uRes', 'uSpot', 'uSpotR', 'uSpotA', 'uHasHidden', 'uCell', 'uStrand', 'uSheen']
    .forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });

  function texture(unit, filter) {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    return t;
  }
  const upload = (unit, tex, source) => {
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
  };
  const texPhoto = texture(0, gl.LINEAR), texHidden = texture(1, gl.LINEAR),
        texMap = texture(2, gl.LINEAR), texDisp = texture(3, gl.LINEAR);
  gl.uniform1i(U.uPhoto, 0); gl.uniform1i(U.uHidden, 1); gl.uniform1i(U.uMap, 2); gl.uniform1i(U.uDisp, 3);

  /* ---------- griglia di molle ---------- */
  const N = GW * GH;
  const ox = new Float32Array(N), oy = new Float32Array(N), vx = new Float32Array(N), vy = new Float32Array(N);
  const dispBytes = new Uint8Array(N * 4);
  let imgAspect = 16 / 9;

  /* ---------- stato puntatore / spotlight ---------- */
  const P = { inside: false, uvx: 0, uvy: 0, lastX: null, lastY: null, pvx: 0, pvy: 0, svx: 0, svy: 0, moved: false, at: 0 };
  const S = { x: 0, y: 0, tx: 0, ty: 0, a: 0, ta: 0 };
  let cover = { sx: 1, sy: 1, ox: 0, oy: 0 }, hasHidden = false, ready = false, visible = true;

  function readObjectPosition() {
    const pos = getComputedStyle(media).objectPosition.split(' ');
    const f = (v) => (v && v.endsWith('%') ? parseFloat(v) / 100 : 0.5);
    return [f(pos[0]), f(pos[1])];
  }
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(2.6e6 / (w * h)));
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    // stesso ritaglio di object-fit: cover + object-position dell'<img>
    const iw = media.naturalWidth || media.videoWidth || 1280, ih = media.naturalHeight || media.videoHeight || 720;
    imgAspect = iw / ih;
    const s = Math.max(w / iw, h / ih), [px, py] = readObjectPosition();
    const sx = (w / s) / iw, sy = (h / s) / ih;
    cover = { sx, sy, ox: (1 - sx) * px, oy: (1 - sy) * py };
    kick();
  }

  // coordinate del puntatore -> coordinate locali del canvas (funziona anche col canvas rimpicciolito nella griglia)
  function local(e) {
    const r = canvas.getBoundingClientRect();
    return { u: (e.clientX - r.left) / r.width, v: (e.clientY - r.top) / r.height, inBox: e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom };
  }
  function onMove(e) {
    if (!ready) return;
    const l = local(e);
    const ix = l.u * cover.sx + cover.ox, iy = l.v * cover.sy + cover.oy;
    if (P.lastX !== null) { P.pvx += ix - P.lastX; P.pvy += iy - P.lastY; P.moved = true; P.at = performance.now(); }
    P.lastX = ix; P.lastY = iy; P.uvx = ix; P.uvy = iy;
    S.tx = l.u * canvas.width; S.ty = l.v * canvas.height;
    if (S.a < 0.01) { S.x = S.tx; S.y = S.ty; }        // lo spotlight nasce sotto il cursore, non scivola da lontano
    S.ta = l.inBox ? 1 : 0;
    if (l.inBox && !box.classList.contains('has-interacted')) {
      box.classList.add('has-interacted');
      box.dispatchEvent(new CustomEvent('hairfx:interact', { bubbles: true }));
    }
    kick();
  }
  function onLeave() { P.lastX = P.lastY = null; S.ta = 0; kick(); }

  const area = box.closest('.hero') || box;
  area.addEventListener('pointermove', onMove, { passive: true });
  area.addEventListener('pointerdown', (e) => { P.lastX = P.lastY = null; onMove(e); }, { passive: true });
  area.addEventListener('pointerleave', onLeave);
  area.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') onLeave(); });
  area.addEventListener('pointercancel', onLeave); // il browser ha preso lo scroll verticale

  /* ---------- simulazione ----------
     Ogni punto della griglia è una "ciocca" legata a una molla. Per sembrare capelli veri:
     - la mano sposta soprattutto i capelli SOTTO il cursore (sono attaccati in alto);
     - le punte sono più morbide e meno frenate delle radici: oscillano più a lungo, come un pendolo;
     - oscillando di lato le punte si alzano un po' (fanno un arco);
     - ogni ciocca si trascina un po' le vicine e il movimento scende verso le punte con un attimo di ritardo;
     - a riposo una brezza leggerissima le fa ondeggiare. */
  let clock = 0;
  function step(dtF) {
    clock += dtF / 60;
    const c = 0.1 / CONFIG.ritorno;                          // smorzamento
    const zeta = Math.max(0.12, 1 - 0.85 * CONFIG.rimbalzo);
    const k = Math.pow(c / (2 * zeta), 2);                   // rigidità della molla
    const maxX = CONFIG.spostamentoMax, maxY = maxX * imgAspect;
    // spinta del puntatore: proporzionale alla velocità (piano = poco, veloce = tanto)
    if (P.moved) {
      // velocità del cursore (lisciata), in unità "larghezza foto" per fotogramma
      P.svx += (P.pvx / dtF - P.svx) * 0.45; P.svy += ((P.pvy / dtF) / imgAspect - P.svy) * 0.45;
      const sp = Math.hypot(P.svx, P.svy);
      if (sp > 1e-6) {
        // la velocità decide FIN DOVE possono arrivare i capelli (non quanto a lungo li spingi)
        const g = Math.min(1, CONFIG.movimento * (1 - Math.exp(-Math.pow(sp / 0.01, 1.5))));
        const txs = (P.svx / sp) * maxX * g, tys = (P.svy / sp) * maxX * g * 0.4 * imgAspect; // più di lato che in verticale
        const R = CONFIG.zonaSensibile, pull = Math.min(1, 0.3 * dtF);
        for (let j = 0; j < GH; j++) {
          const gy = (j + 0.5) / GH;
          for (let i = 0; i < GW; i++) {
            const gx = (i + 0.5) / GW;
            const dx = gx - P.uvx, dy = (gy - P.uvy) / imgAspect;
            const ry = dy > 0 ? R * 2.1 : R * 0.75;              // impronta allungata verso il basso
            const f = Math.exp(-(dx * dx) / (R * R) * 2.2 - (dy * dy) / (ry * ry) * 2.2);
            if (f < 0.01) continue;
            const n = j * GW + i, a = pull * f * 0.2;
            vx[n] += (txs * f - ox[n]) * a;
            vy[n] += (tys * f - oy[n]) * a;
          }
        }
      }
      P.pvx = P.pvy = 0; P.moved = false;
    } else { P.svx *= 0.8; P.svy *= 0.8; }

    const pend = CONFIG.pendolo, wind = CONFIG.brezza * maxX * 0.14;
    let energy = 0;
    for (let j = 0; j < GH; j++) {
      const rf = j / (GH - 1);                                  // 0 = in alto (radici), 1 = in basso (punte)
      const kj = k * (1 + pend * (0.45 - rf));                  // punte più morbide...
      const damp = Math.pow(1 - c * (1 + pend * (0.4 - rf * 0.8)), dtF);   // ...e meno frenate
      const gy = (j + 0.5) / GH, tip = Math.pow(gy, 1.4);
      for (let i = 0; i < GW; i++) {
        const n = j * GW + i, gx = (i + 0.5) / GW;
        // brezza: due onde lente che attraversano la chioma (più forte sulle punte)
        const wx = wind ? wind * tip * (0.6 * Math.sin(clock * 0.75 + gx * 2.1 + gy * 1.3) + 0.4 * Math.sin(clock * 1.9 + gx * 6.3 - gy * 2.2)) : 0;
        vx[n] += -kj * (ox[n] - wx) * dtF; vy[n] += -kj * oy[n] * dtF;
        vx[n] *= damp; vy[n] *= damp;
        ox[n] += vx[n] * dtF; oy[n] += vy[n] * dtF;
      }
    }
    // il movimento scende verso le punte (le ciocche in basso seguono con un attimo di ritardo)
    const pr = Math.min(0.5, CONFIG.propagazione * dtF);
    for (let j = 1; j < GH; j++) for (let i = 0; i < GW; i++) {
      const n = j * GW + i, u = n - GW;
      ox[n] += (ox[u] - ox[n]) * pr; oy[n] += (oy[u] - oy[n]) * pr;
    }
    // ogni ciocca si trascina un po' le vicine
    const co = Math.min(0.3, CONFIG.coesione * dtF);
    if (co > 0) for (let j = 0; j < GH; j++) for (let i = 1; i < GW - 1; i++) {
      const n = j * GW + i;
      ox[n] += ((ox[n - 1] + ox[n + 1]) * 0.5 - ox[n]) * co;
    }
    const arc = CONFIG.arco * imgAspect / maxX;
    for (let n = 0; n < N; n++) {
      // limite morbido: niente strappi oltre lo spostamento massimo
      ox[n] = maxX * Math.tanh(ox[n] / maxX); oy[n] = maxY * Math.tanh(oy[n] / maxY);
      energy += Math.abs(ox[n]) + Math.abs(vx[n]) * 10 + Math.abs(oy[n]) + Math.abs(vy[n]) * 10;
      // arco: oscillando di lato la punta sale un po'
      const ly = Math.max(-maxY, Math.min(maxY, oy[n] - ox[n] * ox[n] * arc));
      const b = n * 4;
      dispBytes[b] = Math.round(127 + (ox[n] / maxX) * 127);
      dispBytes[b + 1] = Math.round(127 + (ly / maxY) * 127);
    }
    return energy;
  }

  function draw() {
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, texDisp);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, GW, GH, 0, gl.RGBA, gl.UNSIGNED_BYTE, dispBytes);
    if (isVideo && !media.paused && media.readyState >= 2) upload(0, texPhoto, media);
    gl.uniform2f(U.uScale, cover.sx, cover.sy);
    gl.uniform2f(U.uOffset, cover.ox, cover.oy);
    gl.uniform2f(U.uMax, CONFIG.spostamentoMax, CONFIG.spostamentoMax * imgAspect);
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform2f(U.uSpot, S.x, S.y);
    gl.uniform1f(U.uSpotR, CONFIG.spotRaggio * (canvas.width / canvas.clientWidth));
    gl.uniform1f(U.uSpotA, S.a);
    gl.uniform1f(U.uHasHidden, hasHidden ? 1 : 0);
    gl.uniform2f(U.uCell, 1 / GW, 1 / GH);
    gl.uniform1f(U.uStrand, CONFIG.ciocche);
    gl.uniform1f(U.uSheen, CONFIG.lucentezza);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /* ---------- ciclo di animazione: gira solo quando serve ---------- */
  let raf = null, last = 0, slowFrames = 0, sampleFrames = 0, sampleTime = 0;
  const heroBox = box.closest('.hero');
  // la brezza gira solo con la hero a tutto schermo (rimpicciolita nella griglia non si noterebbe)
  const breezing = () => CONFIG.brezza > 0 && !(heroBox && heroBox.classList.contains('is-shrunk'));
  function frame(t) {
    raf = null;
    if (!ready || !visible || covered) return;
    // a riposo (solo brezza) bastano 30 disegni al secondo: metà lavoro, a occhio identico
    const calm = t - P.at > 1200 && !P.moved;
    if (calm && last && t - last < 30) { raf = requestAnimationFrame(frame); return; }
    const dt = last ? Math.min(t - last, 100) : 16.7; last = t;
    const dtF = Math.min(dt / 16.7, 3);
    const e = step(dtF);
    S.x += (S.tx - S.x) * Math.min(1, 0.22 * dtF); S.y += (S.ty - S.y) * Math.min(1, 0.22 * dtF);
    S.a += (S.ta - S.a) * Math.min(1, 0.09 * dtF);
    draw();
    // controllo prestazioni (solo mentre si muove il mouse): se il dispositivo non regge, si torna alla foto
    if (!calm) {
      sampleFrames++; sampleTime += dt;
      if (sampleFrames >= 90) {
        if (1000 / (sampleTime / sampleFrames) < CONFIG.fpsMinimi) slowFrames++; else slowFrames = 0;
        sampleFrames = 0; sampleTime = 0;
        if (slowFrames >= 2) return disable('off-troppo-lento');
      }
    }
    const spotMoving = hasHidden && (Math.abs(S.ta - S.a) > 0.002 || (S.a > 0.002 && Math.hypot(S.tx - S.x, S.ty - S.y) > 0.5));
    if (e > 1e-4 || spotMoving || breezing() || (isVideo && !media.paused)) raf = requestAnimationFrame(frame);
    else { last = 0; sampleFrames = 0; sampleTime = 0; }
  }
  function kick() { if (!raf && ready && visible && !covered) raf = requestAnimationFrame(frame); }

  function disable(reason) {
    ready = false; box.classList.remove('is-live'); setState(reason);
    if (raf) cancelAnimationFrame(raf);
    console.info('[capelli] effetto disattivato:', reason, '— resta la foto normale');
  }
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); disable('off-contesto-perso'); });
  reduce.addEventListener && reduce.addEventListener('change', (e) => { if (e.matches) disable('off-animazioni-ridotte'); });

  new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) kick(); }).observe(box);
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; if (visible) kick(); });
  // una sezione della griglia copre la hero: l'effetto si ferma finché non si richiude
  let covered = false;
  document.addEventListener('biondi:sezione', (e) => { covered = !!(e.detail && e.detail.aperta); if (!covered) kick(); });
  new ResizeObserver(resize).observe(canvas);
  // la hero torna a tutto schermo: riparte la brezza
  if (heroBox) new MutationObserver(kick).observe(heroBox, { attributes: true, attributeFilter: ['class'] });

  /* ---------- caricamento ---------- */
  const mediaReady = isVideo
    ? new Promise((res) => (media.readyState >= 2 ? res() : media.addEventListener('loadeddata', res, { once: true })))
    : (media.complete && media.naturalWidth ? Promise.resolve() : new Promise((res, rej) => { media.addEventListener('load', res, { once: true }); media.addEventListener('error', rej, { once: true }); }));

  // la mappa e l'immagine nascosta si caricano dopo la foto, per non rallentare la prima visualizzazione
  setState('caricamento');
  mediaReady
    .then(() => preloadImg(box.dataset.map))
    .then((map) => {
      upload(0, texPhoto, media);
      upload(2, texMap, map);
      step(1); resize();
      ready = true; draw(); kick();                     // parte subito la brezza
      requestAnimationFrame(() => { box.classList.add('is-live'); setState('attivo'); });
      if (!box.dataset.hidden) return;
      return loadImg(box.dataset.hidden).then((hid) => { upload(1, texHidden, hid); hasHidden = true; draw(); })
        .catch((e) => console.info('[capelli] immagine nascosta non disponibile:', e.message));
    })
    .catch((e) => { console.warn('[capelli]', e.message); setState('off-errore'); });

  // cambio giorno/notte: la nuova foto è già nell'<img> (setSource); qui si aggiornano foto e mappa nel WebGL
  swapTextures = async (mapSrc) => {
    const map = await preloadImg(mapSrc);
    if (!ready) return;
    upload(0, texPhoto, media);
    upload(2, texMap, map);
    resize();            // la nuova foto può avere un'altra risoluzione: ricalcola il ritaglio
    draw();
  };

  // stats(): spostamento massimo attuale in pixel della foto (utile per controllare le regolazioni)
  const stats = () => {
    let m = 0; for (let n = 0; n < N; n++) m = Math.max(m, Math.abs(ox[n]), Math.abs(oy[n]) / imgAspect);
    return { spostamentoPx: +(m * (media.naturalWidth || 1280)).toFixed(1), stato: box.dataset.state };
  };
  Object.assign(window.HairFX, { config: CONFIG, kick, stats });
})();
