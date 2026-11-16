// EZIO — 360° turntable from pre-rendered frames.
// Fractional position + crossfade between neighbouring frames, drag with inertia, slider, idle spin.
(function () {
  const N = 72;
  const stage = document.getElementById('stage');
  const cv = document.getElementById('spin360');
  const range = document.getElementById('spin-range');
  const deg = document.getElementById('spin-deg');
  const bar = document.getElementById('spin-load');
  const buttons = [...document.querySelectorAll('.views button')];
  if (!stage || !cv) return;
  const ctx = cv.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- frames: pick resolution, load progressively (coarse → fine)
  let dir = 'img/360/1000/';
  const frames = new Array(N).fill(null);
  let loaded = 0;
  function chooseRes() { return stage.clientWidth * (window.devicePixelRatio || 1) > 760 ? 'img/360/1000/' : 'img/360/600/'; }
  function order() {
    const seen = new Set(), out = [];
    [36, 18, 9, 3, 1].forEach((step) => { for (let i = 0; i < N; i += step) if (!seen.has(i)) { seen.add(i); out.push(i); } });
    return out;
  }
  function load() {
    dir = chooseRes();
    const q = order(); let active = 0, k = 0;
    const next = () => {
      while (active < 6 && k < q.length) {
        const i = q[k++]; active++;
        const im = new Image(); im.decoding = 'async';
        im.onload = () => { (im.decode ? im.decode() : Promise.resolve()).catch(() => {}).then(() => { frames[i] = im; loaded++; active--; progress(); dirty = true; next(); }); };
        im.onerror = () => { active--; next(); };
        im.src = dir + String(i).padStart(2, '0') + '.webp';
      }
    };
    next();
  }
  function progress() {
    if (bar) bar.style.transform = `scaleX(${loaded / N})`;
    if (loaded === N) stage.classList.add('loaded');
    if (loaded > 0) stage.classList.add('ready');
  }
  function nearest(i) {
    if (frames[i]) return i;
    for (let d = 1; d < N / 2; d++) { if (frames[(i + d) % N]) return (i + d) % N; if (frames[(i - d + N) % N]) return (i - d + N) % N; }
    return -1;
  }

  // ---- canvas sizing
  let W = 0, H = 0;
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.round(stage.clientWidth * dpr); H = Math.round(stage.clientHeight * dpr);
    cv.width = W; cv.height = H; dirty = true;
  }

  // ---- state
  let pos = 0;          // 0..N, fractional
  let vel = 0;          // frames per ms
  let dragging = false, lastX = 0, lastT = 0;
  let tween = null, idle = !reduce, idleTimer = 0, dirty = true;
  const wrapPos = (p) => ((p % N) + N) % N;

  function drawImg(im, a) {
    const s = Math.max(W / im.width, H / im.height), w = im.width * s, h = im.height * s;
    ctx.globalAlpha = a; ctx.drawImage(im, (W - w) / 2, (H - h) / 2, w, h);
  }
  function draw() {
    const p = wrapPos(pos), i0 = Math.floor(p), i1 = (i0 + 1) % N, f = p - i0;
    const a = nearest(i0), b = frames[i1] ? i1 : -1;
    if (a < 0) return;
    ctx.globalAlpha = 1; ctx.clearRect(0, 0, W, H);
    drawImg(frames[a], 1);
    if (b >= 0 && a === i0 && f > 0.001) drawImg(frames[b], f);
    ctx.globalAlpha = 1;
    const d = Math.round(p / N * 360) % 360;
    if (range && document.activeElement !== range) range.value = p / N * 360;
    if (range) range.style.setProperty('--p', (p / N * 100).toFixed(2) + '%');
    if (deg) deg.textContent = d + '°';
  }

  function stopIdle() { idle = false; clearTimeout(idleTimer); if (!reduce) idleTimer = setTimeout(() => { if (!dragging && !tween) idle = true; }, 5000); }
  function pressButtons(i) { buttons.forEach((b, k) => b.setAttribute('aria-pressed', String(k === i))); }

  // ---- drag with inertia
  stage.addEventListener('pointerdown', (e) => {
    dragging = true; tween = null; vel = 0; lastX = e.clientX; lastT = performance.now();
    stage.setPointerCapture(e.pointerId); stage.classList.add('grabbing'); stopIdle(); pressButtons(-1);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const now = performance.now(), dx = e.clientX - lastX, dt = Math.max(1, now - lastT);
    const perPx = N / (stage.clientWidth * 1.15);   // ~one turn per stage width
    pos -= dx * perPx;
    vel = vel * 0.6 + (-dx * perPx / dt) * 0.4;
    lastX = e.clientX; lastT = now; dirty = true;
  });
  const end = () => { if (!dragging) return; dragging = false; stage.classList.remove('grabbing'); stopIdle(); };
  stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);

  // ---- keyboard on the stage
  stage.tabIndex = 0;
  stage.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); goToDeg(wrapPos(pos) / N * 360 + (e.key === 'ArrowRight' ? 30 : -30)); }
  });

  // ---- slider
  if (range) {
    range.addEventListener('input', () => { tween = null; vel = 0; pos = (+range.value / 360) * N; dirty = true; stopIdle(); pressButtons(-1); });
  }

  // ---- view buttons
  function goToDeg(target) {
    stopIdle(); vel = 0;
    const from = pos, to = (target / 360) * N;
    let d = wrapPos(to - from); if (d > N / 2) d -= N;
    tween = { from, d, t: 0, dur: 650 + Math.abs(d) / N * 900 };
  }
  buttons.forEach((b, i) => b.addEventListener('click', () => { pressButtons(i); goToDeg(+b.dataset.deg); }));

  // ---- loop
  let visible = true, prev = performance.now();
  new IntersectionObserver((e) => { visible = e[0].isIntersecting; }).observe(stage);
  function tick(now) {
    const dt = Math.min(48, now - prev); prev = now;
    if (visible) {
      if (tween) {
        tween.t += dt; const k = Math.min(1, tween.t / tween.dur);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; // easeInOutCubic
        pos = tween.from + tween.d * e; dirty = true;
        if (k >= 1) tween = null;
      } else if (!dragging && Math.abs(vel) > 0.00005) {
        pos += vel * dt; vel *= Math.pow(0.94, dt / 16.7); dirty = true;
      } else if (idle && !dragging) {
        pos += dt * 0.0055; dirty = true;   // ~13 s per turn
      }
      if (dirty) { draw(); dirty = false; }
    }
    requestAnimationFrame(tick);
  }

  new ResizeObserver(() => { resize(); }).observe(stage);
  resize(); load(); requestAnimationFrame(tick);
})();
