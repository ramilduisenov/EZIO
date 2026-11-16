// EZIO — 360° turntable from pre-rendered frames (120 frames, 3° apart).
// Smoothness: input moves a target angle; the shown angle follows it with critically damped
// easing, neighbouring frames are crossfaded, release velocity is averaged over the last ~90 ms,
// frames are pre-decoded to ImageBitmaps so drawing never stalls on decode.
(function () {
  const N = 120;
  const stage = document.getElementById('stage');
  const cv = document.getElementById('spin360');
  const range = document.getElementById('spin-range');
  const deg = document.getElementById('spin-deg');
  const bar = document.getElementById('spin-load');
  const buttons = [...document.querySelectorAll('.views button')];
  if (!stage || !cv) return;
  const ctx = cv.getContext('2d', { alpha: false });
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- frames: resolution by screen, progressive load (coarse → fine), decoded off the main path
  const frames = new Array(N).fill(null);
  let loaded = 0;
  const dir = () => (stage.clientWidth * (window.devicePixelRatio || 1) > 760 ? 'img/360/1000/' : 'img/360/600/');
  function order() {
    const seen = new Set(), out = [];
    [40, 20, 10, 5, 1].forEach((step) => { for (let i = 0; i < N; i += step) if (!seen.has(i)) { seen.add(i); out.push(i); } });
    return out;
  }
  // Each frame is decoded once and pre-scaled to the exact canvas size, so playback is a 1:1 copy.
  const blobs = new Array(N).fill(null);
  const canBitmap = !!(window.createImageBitmap && window.fetch);
  function toBitmap(src) {
    return createImageBitmap(src, { resizeWidth: W, resizeHeight: H, resizeQuality: 'high' })
      .catch(() => createImageBitmap(src));
  }
  function decode(url, i) {
    if (canBitmap) return fetch(url).then((r) => { if (!r.ok) throw 0; return r.blob(); }).then((b) => { blobs[i] = b; return toBitmap(b); });
    return new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = url; });
  }
  function load() {
    const base = dir(), q = order(); let active = 0, k = 0;
    const next = () => {
      while (active < 6 && k < q.length) {
        const i = q[k++]; active++;
        decode(base + String(i).padStart(3, '0') + '.webp', i)
          .then((bm) => { frames[i] = bm; loaded++; progress(); dirty = true; })
          .catch(() => {})
          .finally(() => { active--; next(); });
      }
    };
    next();
  }
  function progress() {
    if (bar) bar.style.transform = `scaleX(${loaded / N})`;
    if (loaded > 0) stage.classList.add('ready');
    if (loaded === N) stage.classList.add('loaded');
  }
  function nearest(i) {
    if (frames[i]) return i;
    for (let d = 1; d <= N / 2; d++) { if (frames[(i + d) % N]) return (i + d) % N; if (frames[(i - d + N) % N]) return (i - d + N) % N; }
    return -1;
  }

  // ---- canvas sizing
  let W = 0, H = 0;
  function resize() {
    const coarse = matchMedia('(pointer: coarse)').matches;
    const dpr = Math.min(coarse ? 1.75 : 2, window.devicePixelRatio || 1);
    W = Math.max(1, Math.round(stage.clientWidth * dpr)); H = Math.max(1, Math.round(stage.clientHeight * dpr));
    cv.width = W; cv.height = H;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    dirty = true;
    rescale();
  }
  // after a size change, rebuild the pre-scaled bitmaps from the cached files (in the background)
  let rescaleGen = 0;
  function rescale() {
    if (!canBitmap) return;
    const gen = ++rescaleGen;
    const order = [...Array(N).keys()].sort((a, b) => Math.abs(a - Math.round(wrap(pos))) - Math.abs(b - Math.round(wrap(pos))));
    (async () => {
      for (const i of order) {
        if (gen !== rescaleGen) return;
        if (!blobs[i]) continue;
        const bm = await toBitmap(blobs[i]);
        if (gen !== rescaleGen) return;
        if (frames[i] && frames[i].close) frames[i].close();
        frames[i] = bm; if (Math.abs(i - wrap(pos)) < 2) dirty = true;
      }
    })();
  }

  // ---- state (positions are in frames, fractional)
  let target = 0, pos = 0, vel = 0;           // vel: frames per ms, applied to target
  let dragging = false, lastX = 0, samples = [];
  let tween = null, idle = !reduce, idleTimer = 0, dirty = true;
  const wrap = (p) => ((p % N) + N) % N;

  function drawImg(im, a) {
    ctx.globalAlpha = a;
    if (im.width === W && im.height === H) { ctx.drawImage(im, 0, 0); return; }
    const s = Math.max(W / im.width, H / im.height), w = im.width * s, h = im.height * s;
    ctx.drawImage(im, (W - w) / 2, (H - h) / 2, w, h);
  }
  let lastDeg = -1, lastPos = 0;
  function draw() {
    const moving = Math.abs(pos - lastPos); lastPos = pos;
    const p = wrap(pos), i0 = Math.floor(p) % N, i1 = (i0 + 1) % N, f = p - Math.floor(p);
    const a = nearest(i0);
    if (a < 0) return;
    drawImg(frames[a], 1);
    // crossfade only when moving slowly: at speed the eye can't see it, and it halves the work
    if (a === i0 && frames[i1] && f > 0.002 && moving < 0.6) drawImg(frames[i1], f);
    ctx.globalAlpha = 1;
    const dg = Math.round(p / N * 360) % 360;
    if (range && !rangeActive) { range.value = p / N * 360; range.style.setProperty('--p', (p / N * 100).toFixed(2) + '%'); }
    if (deg && dg !== lastDeg) { deg.textContent = dg + '°'; lastDeg = dg; }
  }

  function stopIdle() { idle = false; clearTimeout(idleTimer); if (!reduce) idleTimer = setTimeout(() => { if (!dragging && !tween && !rangeActive) idle = true; }, 4500); }
  function pressButtons(i) { buttons.forEach((b, k) => b.setAttribute('aria-pressed', String(k === i))); }
  const perPx = () => N / (stage.clientWidth * 1.2);   // full drag across the stage ≈ 300°

  // ---- drag with averaged release velocity
  stage.addEventListener('pointerdown', (e) => {
    dragging = true; tween = null; vel = 0; lastX = e.clientX; samples = [{ x: e.clientX, t: e.timeStamp }];
    target = pos; // grab exactly where it is
    try { stage.setPointerCapture(e.pointerId); } catch (_) {}
    stage.classList.add('grabbing'); stopIdle(); pressButtons(-1);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs) {
      target -= (ev.clientX - lastX) * perPx(); lastX = ev.clientX;
      samples.push({ x: ev.clientX, t: ev.timeStamp });
    }
    while (samples.length > 2 && e.timeStamp - samples[0].t > 90) samples.shift();
    dirty = true;
  });
  const end = (e) => {
    if (!dragging) return; dragging = false; stage.classList.remove('grabbing');
    const s0 = samples[0], s1 = samples[samples.length - 1];
    const dt = s1 && s0 ? s1.t - s0.t : 0;
    const fresh = e && s1 ? e.timeStamp - s1.t < 60 : false;      // finger stopped before lifting → no fling
    vel = dt > 8 && fresh ? (-(s1.x - s0.x) * perPx()) / dt : 0;
    vel = Math.max(-0.12, Math.min(0.12, vel));
    stopIdle();
  };
  stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);

  // ---- keyboard on the stage
  stage.tabIndex = 0;
  stage.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); goToDeg(wrap(target) / N * 360 + (e.key === 'ArrowRight' ? 30 : -30)); }
  });

  // ---- slider (moves the target, the bottle eases after it)
  let rangeActive = false;
  if (range) {
    range.addEventListener('pointerdown', () => { rangeActive = true; });
    window.addEventListener('pointerup', () => { if (rangeActive) { rangeActive = false; stopIdle(); } });
    range.addEventListener('input', () => {
      tween = null; vel = 0; stopIdle(); pressButtons(-1);
      const want = (+range.value / 360) * N;
      let d = wrap(want - wrap(target)); if (d > N / 2) d -= N;  // continue from the current turn
      target += d; dirty = true;
      range.style.setProperty('--p', (+range.value / 3.6).toFixed(2) + '%');
    });
    range.addEventListener('blur', () => { rangeActive = false; });
  }

  // ---- view buttons
  function goToDeg(dg) {
    stopIdle(); vel = 0;
    const from = target, to = (dg / 360) * N;
    let d = wrap(to - from); if (d > N / 2) d -= N;
    tween = { from, d, t: 0, dur: 700 + Math.abs(d) / N * 900 };
  }
  buttons.forEach((b, i) => b.addEventListener('click', () => { pressButtons(i); goToDeg(+b.dataset.deg); }));

  // ---- loop
  let visible = true, prev = performance.now();
  new IntersectionObserver((e) => { visible = e[0].isIntersecting; }).observe(stage);
  function tick(now) {
    const dt = Math.min(50, now - prev); prev = now;
    if (visible) {
      if (tween) {
        tween.t += dt; const k = Math.min(1, tween.t / tween.dur);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; // easeInOutCubic
        target = tween.from + tween.d * e;
        if (k >= 1) tween = null;
      } else if (!dragging && Math.abs(vel) > 0.00002) {
        target += vel * dt; vel *= Math.pow(0.95, dt / 16.667);
      } else if (idle && !dragging && !rangeActive) {
        target += dt * 0.0075;   // ~16 s per turn
      }
      // critically damped follow: drag feels heavy and silky instead of stepping with the finger
      const tau = dragging || rangeActive ? 55 : 90;
      const d = target - pos;
      if (Math.abs(d) > 0.0005) { pos += d * (1 - Math.exp(-dt / tau)); dirty = true; }
      else if (pos !== target) { pos = target; dirty = true; }
      if (dirty) { draw(); dirty = false; }
    }
    requestAnimationFrame(tick);
  }

  let rt = 0, first = true;
  new ResizeObserver(() => { if (first) { first = false; return; } clearTimeout(rt); rt = setTimeout(resize, 120); }).observe(stage);
  resize(); load(); requestAnimationFrame(tick);
})();
