// EZIO Run — Chrome-dino style runner, tuned for 60 fps on phones.
// Perf: every sprite is pre-rendered once per resolution, background uses Path2D + batched paths,
// physics is frame-rate independent (works on 60/90/120 Hz), opaque canvas.
// Feel: jump on press (not release), hold = higher jump, jump buffering, swipe down = duck / fast fall.
(function () {
  const cv = document.getElementById('game');
  if (!cv) return;
  const ctx = cv.getContext('2d', { alpha: false, desynchronized: true });
  const wrap = cv.parentElement;
  const H = 240;
  let W = 720, res = 1;

  const T = {
    uz: { start: 'Bosing — boshlash', over: 'Jigʻildon qaynadi!', again: 'Qayta oʻynash uchun bosing', best: 'REKORD', fizz: 'Koʻpik +25', night: 'Kechki dasturxon', paused: 'Davom etish uchun bosing' },
    ru: { start: 'Нажмите — старт', over: 'Изжога догнала!', again: 'Нажмите, чтобы сыграть снова', best: 'РЕКОРД', fizz: 'Пузырёк +25', night: 'Вечерний дастархан', paused: 'Нажмите, чтобы продолжить' }
  };
  const lang = () => (document.documentElement.lang === 'ru' ? 'ru' : 'uz');

  const DAY = { sky: '#DDF4EF', far: '#B8E6DF', ground: '#19B2AA', line: '#0B6E6B', ink: '#0E1414' };
  const NIGHT = { sky: '#0E1414', far: '#163B39', ground: '#0B6E6B', line: '#19B2AA', ink: '#F6FBFA' };
  let night = false, blend = 0; // 0 = day, 1 = night (animated)

  const GROUND = H - 44;
  const P = { x: 56, y: 0, vy: 0, w: 24, h: 58, duck: false, onGround: true, tilt: 0 };
  let state = 'ready', speed, dist, score, best = 0, obstacles, bubbles, parts, clouds, nextSpawn, nextBubble, flash, toast, t = 0;
  let holding = false, bufferedJump = 0, nightAt = 700, overAt = 0;
  try { best = +localStorage.getItem('ezio-run-best') || 0; } catch (e) {}

  // ---------- colour helpers ----------
  function mixHex(a, b, k) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const c = [16, 8, 0].map((s) => Math.round(((pa >> s) & 255) + ((((pb >> s) & 255) - ((pa >> s) & 255)) * k)));
    return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  }
  const pal = (key) => mixHex(DAY[key], NIGHT[key], blend);

  // ---------- sprite cache ----------
  const S = {};
  function rr(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); }
  function sprite(w, h, draw, pad = 3) {
    const c = document.createElement('canvas');
    c.width = Math.ceil((w + pad * 2) * res); c.height = Math.ceil((h + pad * 2) * res);
    const g = c.getContext('2d'); g.scale(res, res); g.translate(pad, pad);
    g.lineJoin = 'round'; g.lineCap = 'round';
    draw(g);
    return { c, w: w + pad * 2, h: h + pad * 2, pad };
  }

  function bottleArt(g, ink, frame, dead) {
    g.lineWidth = 2; g.strokeStyle = ink;
    g.beginPath();
    g.moveTo(8, 8); g.lineTo(16, 8); g.quadraticCurveTo(24, 16, 24, 26); g.lineTo(24, 54);
    g.quadraticCurveTo(24, 58, 20, 58); g.lineTo(4, 58); g.quadraticCurveTo(0, 58, 0, 54);
    g.lineTo(0, 26); g.quadraticCurveTo(0, 16, 8, 8); g.closePath();
    g.fillStyle = '#B8F0E6'; g.fill(); g.stroke();
    g.fillStyle = 'rgba(25,178,170,.35)'; g.fillRect(2, 22, 20, 18);
    g.fillStyle = '#FFFFFF';
    for (let i = 0; i < 3; i++) { const by = 38 - ((frame * 4 + i * 9) % 22); g.beginPath(); g.arc(6 + i * 6, by, 1.4, 0, 7); g.fill(); }
    g.fillStyle = '#19B2AA'; g.fillRect(1, 40, 22, 13); g.strokeRect(1, 40, 22, 13);
    g.fillStyle = '#FFC21A'; g.beginPath(); g.arc(18, 46.5, 3.6, 0, 7); g.fill();
    g.fillStyle = '#0E1414'; g.font = '800 6px Unbounded, sans-serif'; g.fillText('ezio', 2.5, 49);
    g.fillStyle = '#F28A1F'; rr(g, 7, 0, 10, 8, 2); g.fill(); g.stroke();
    g.fillStyle = '#0E1414'; g.strokeStyle = '#0E1414'; g.lineWidth = 1.6;
    if (dead) {
      [[9, 31], [15, 31]].forEach(([x, y]) => { g.beginPath(); g.moveTo(x - 1.8, y - 1.8); g.lineTo(x + 1.8, y + 1.8); g.moveTo(x + 1.8, y - 1.8); g.lineTo(x - 1.8, y + 1.8); g.stroke(); });
    } else {
      g.beginPath(); g.arc(9, 31, 1.6, 0, 7); g.arc(15, 31, 1.6, 0, 7); g.fill();
      g.beginPath(); g.arc(12, 33.5, 2.4, 0.2, Math.PI - 0.2); g.stroke();
    }
  }

  const OBST = {
    samsa: { w: 34, h: 26, art(g, ink) { g.lineWidth = 2; g.strokeStyle = ink; g.fillStyle = '#E9A93A'; g.beginPath(); g.moveTo(0, 26); g.lineTo(17, 0); g.lineTo(34, 26); g.closePath(); g.fill(); g.stroke(); g.fillStyle = ink; [[14, 14], [19, 18], [17, 22]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 1.2, 0, 7); g.fill(); }); } },
    non: { w: 36, h: 18, art(g, ink) { g.lineWidth = 2; g.strokeStyle = ink; g.fillStyle = '#D9933A'; rr(g, 0, 0, 36, 18, 9); g.fill(); g.stroke(); g.fillStyle = '#F2C97A'; rr(g, 8, 4, 20, 10, 5); g.fill(); g.fillStyle = ink; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(12 + i * 4, 9, 1, 0, 7); g.fill(); } } },
    lagan: { w: 56, h: 30, art(g, ink) { g.lineWidth = 2; g.strokeStyle = ink; g.fillStyle = '#1F4FA8'; rr(g, -2, 22, 60, 8, 4); g.fill(); g.stroke(); g.fillStyle = '#F2B544'; g.beginPath(); g.ellipse(28, 22, 25, 22, 0, Math.PI, 0); g.fill(); g.stroke(); g.fillStyle = '#E8642C'; for (let i = 0; i < 5; i++) g.fillRect(12 + i * 7, 12 - (i % 2) * 5, 4, 2); g.fillStyle = '#7A3B22'; g.beginPath(); g.arc(28, 6, 4, 0, 7); g.fill(); } },
    shashlik: { w: 16, h: 52, art(g, ink) { g.strokeStyle = '#8A8F8F'; g.lineWidth = 3; g.beginPath(); g.moveTo(8, 0); g.lineTo(8, 52); g.stroke(); g.lineWidth = 2; g.strokeStyle = ink; ['#8B3A1E', '#F2F0E6', '#8B3A1E', '#A84A26'].forEach((c, i) => { g.fillStyle = c; rr(g, 0, 6 + i * 10, 16, 9, 3); g.fill(); g.stroke(); }); } },
    chili: { w: 22, h: 34, art(g, ink) { g.lineWidth = 2; g.strokeStyle = ink; g.fillStyle = '#E5484D'; g.beginPath(); g.moveTo(11, 6); g.quadraticCurveTo(22, 14, 13, 34); g.quadraticCurveTo(-2, 18, 11, 6); g.fill(); g.stroke(); g.fillStyle = '#2E9E5B'; rr(g, 8, 0, 6, 8, 2); g.fill(); g.stroke(); } },
    double: { w: 64, h: 26, art(g, ink) { OBST.samsa.art(g, ink); g.save(); g.translate(30, 0); OBST.samsa.art(g, ink); g.restore(); } },
    flame: { w: 34, h: 26, art(g, ink, f = 0) { g.lineWidth = 2; g.strokeStyle = ink; g.fillStyle = '#F28A1F'; g.beginPath(); g.moveTo(0, 13); g.quadraticCurveTo(10, -6 + f, 34, 2); g.quadraticCurveTo(26, 13, 34, 24); g.quadraticCurveTo(10, 32 - f, 0, 13); g.fill(); g.stroke(); g.fillStyle = '#FFC21A'; g.beginPath(); g.ellipse(13, 13, 7, 5, 0, 0, 7); g.fill(); g.fillStyle = '#0E1414'; g.beginPath(); g.arc(9, 12, 1.6, 0, 7); g.fill(); } }
  };

  function buildSprites() {
    ['day', 'night'].forEach((m) => {
      const ink = m === 'day' ? DAY.ink : NIGHT.ink;
      S[m] = { bottle: [], obst: {} };
      for (let f = 0; f < 6; f++) S[m].bottle.push(sprite(24, 58, (g) => bottleArt(g, ink, f, false)));
      S[m].dead = sprite(24, 58, (g) => bottleArt(g, ink, 0, true));
      for (const k in OBST) {
        const o = OBST[k];
        if (k === 'flame') S[m].obst.flame = [0, 1, 2, 3].map((i) => sprite(o.w, o.h, (g) => o.art(g, ink, Math.sin(i * 1.57) * 3), 8));
        else S[m].obst[k] = sprite(o.w, o.h, (g) => o.art(g, ink));
      }
    });
    S.bubble = sprite(18, 18, (g) => { g.fillStyle = '#FFC21A'; g.beginPath(); g.arc(9, 9, 9, 0, 7); g.fill(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(9, 9, 3.2, 0, 7); g.fill(); });
    const p = new Path2D();
    p.ellipse(60, GROUND - 34, 28, 30, 0, Math.PI, 0); p.rect(32, GROUND - 34, 56, 34);
    p.rect(104, GROUND - 78, 10, 78); p.moveTo(116, GROUND - 80); p.arc(109, GROUND - 80, 7, 0, 7);
    p.rect(150, GROUND - 22, 70, 22); p.moveTo(203, GROUND - 22); p.ellipse(185, GROUND - 22, 18, 18, 0, Math.PI, 0);
    S.skyline = p;
  }
  const mode = () => (blend > 0.5 ? 'night' : 'day');
  function blit(sp, x, y) { ctx.drawImage(sp.c, x - sp.pad, y - sp.pad, sp.w, sp.h); }

  // ---------- size ----------
  let resizeTimer = 0;
  function resize() {
    const r = wrap.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const scale = r.height / H;
    W = Math.max(300, Math.round(r.width / scale));
    res = dpr * scale;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    ctx.setTransform(res, 0, 0, res, 0, 0);
    buildSprites();
    if (state !== 'run') draw();
  }

  // ---------- game flow ----------
  function baseSpeed() { return W < 520 ? 5.2 : 6; } // narrower view = a bit slower start
  function reset() {
    speed = baseSpeed(); dist = 0; score = 0; obstacles = []; bubbles = []; parts = []; flash = 0; toast = null;
    nextSpawn = 260; nextBubble = 700; night = false; blend = 0; nightAt = 700; t = 0;
    P.y = GROUND - 58; P.h = 58; P.w = 24; P.vy = 0; P.duck = false; P.onGround = true; bufferedJump = 0;
    clouds = Array.from({ length: 6 }, (_, i) => ({ x: i * 150 + Math.random() * 80, y: 28 + Math.random() * 70, r: 6 + Math.random() * 14 }));
  }
  reset();

  function start() { reset(); state = 'run'; loopStart(); }
  function doJump() {
    if (P.onGround && !P.duck) { P.vy = -9.4; P.onGround = false; for (let i = 0; i < 5; i++) puff(P.x + 12, GROUND, true); return true; }
    return false;
  }
  function press() {
    if (state === 'over') { if (performance.now() - overAt < 450) return; start(); holding = true; return; }
    if (state === 'ready') { start(); holding = true; return; }
    if (state === 'paused') { state = 'run'; loopStart(); return; }
    holding = true;
    if (!doJump()) bufferedJump = 140; // ms: a press just before landing still counts
  }
  function release() { holding = false; }
  function duck(on) {
    if (state !== 'run') return;
    P.duck = on;
    if (on && !P.onGround) P.vy = Math.max(P.vy, 7); // fast fall
  }

  // keyboard (only while the canvas is focused, so the page still scrolls normally)
  cv.addEventListener('keydown', (e) => {
    const jumpKey = ['Space', 'ArrowUp', 'KeyW'].includes(e.code), duckKey = ['ArrowDown', 'KeyS'].includes(e.code);
    if (jumpKey || duckKey) e.preventDefault();
    if (e.repeat) return;
    if (jumpKey) press();
    if (duckKey) duck(true);
  });
  cv.addEventListener('keyup', (e) => {
    if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) release();
    if (['ArrowDown', 'KeyS'].includes(e.code)) duck(false);
  });
  // touch / mouse: press = jump instantly, hold = higher, swipe down = duck
  let pid = null, py = 0, swiped = false;
  cv.addEventListener('pointerdown', (e) => {
    e.preventDefault(); cv.focus({ preventScroll: true });
    pid = e.pointerId; py = e.clientY; swiped = false;
    try { cv.setPointerCapture(pid); } catch (_) {}
    press();
  });
  cv.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid || swiped) return;
    if (e.clientY - py > 22) { swiped = true; holding = false; duck(true); }
  });
  const up = (e) => { if (e.pointerId !== pid) return; pid = null; release(); if (swiped) duck(false); };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('contextmenu', (e) => e.preventDefault());

  const bj = document.getElementById('g-jump'), bd = document.getElementById('g-duck');
  if (bj) {
    bj.addEventListener('pointerdown', (e) => { e.preventDefault(); press(); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => bj.addEventListener(ev, release));
    bj.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!e.repeat) press(); } });
    bj.addEventListener('keyup', release);
  }
  if (bd) {
    bd.addEventListener('pointerdown', (e) => { e.preventDefault(); duck(true); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => bd.addEventListener(ev, () => duck(false)));
  }

  // ---------- spawning ----------
  const GROUND_KINDS = ['samsa', 'non', 'lagan', 'shashlik', 'chili', 'double'];
  function spawn() {
    if (score > 300 && Math.random() < 0.26) {
      const lane = [GROUND - 30, GROUND - 60, GROUND - 94][Math.floor(Math.random() * 3)];
      obstacles.push({ k: 'flame', x: W + 30, y: lane - 26, w: 34, h: 26, fly: true });
    } else {
      const pool = score < 200 ? GROUND_KINDS.slice(0, 3) : GROUND_KINDS;
      const k = pool[Math.floor(Math.random() * pool.length)], o = OBST[k];
      obstacles.push({ k, x: W + 30, y: GROUND - o.h, w: o.w, h: o.h });
    }
    // gap measured in distance, so it stays fair at any frame rate and speed
    nextSpawn = 230 + speed * 14 + Math.random() * (180 + speed * 10);
  }
  function puff(x, y, ground) {
    if (parts.length > 40) parts.shift();
    parts.push({ x, y, vx: (Math.random() - 0.5) * 2 - (ground ? speed * 0.3 : 0), vy: -Math.random() * 2.4 - 0.4, r: 1.5 + Math.random() * 3, life: 1 });
  }

  // ---------- update (k = frames at 60 Hz) ----------
  const hit = (a, b) => a.x + 5 < b.x + b.w - 4 && a.x + a.w - 5 > b.x + 4 && a.y + 6 < b.y + b.h - 2 && a.y + a.h - 3 > b.y + 4;
  function update(dt) {
    const k = dt / 16.667;
    t += dt;
    speed = Math.min(14, baseSpeed() + dist / 1500);
    const dx = speed * k;
    dist += dx; score = Math.floor(dist / 10);
    if (score >= nightAt) { night = !night; nightAt += 700; if (night) toast = { t: T[lang()].night, life: 1500 }; }
    blend += ((night ? 1 : 0) - blend) * Math.min(1, 0.05 * k);

    // lighter gravity while the jump is held and rising → variable jump height
    const tH = P.duck ? 24 : 58;
    if (P.h !== tH) { P.y += P.h - tH; P.h = tH; P.w = P.duck ? 58 : 24; }
    const g = holding && P.vy < 0 ? 0.42 : 0.82;
    P.vy += g * k; P.y += P.vy * k;
    if (P.y >= GROUND - P.h) {
      if (!P.onGround) for (let i = 0; i < 4; i++) puff(P.x + P.w / 2, GROUND, true);
      P.y = GROUND - P.h; P.vy = 0; P.onGround = true;
      if (bufferedJump > 0) { bufferedJump = 0; doJump(); }
    }
    if (bufferedJump > 0) bufferedJump -= dt;
    P.tilt = P.onGround ? Math.sin(t * 0.03) * 0.05 : Math.max(-0.25, Math.min(0.25, P.vy * 0.022));

    nextSpawn -= dx; if (nextSpawn <= 0) spawn();
    nextBubble -= dx; if (nextBubble <= 0) { bubbles.push({ x: W + 20, y: GROUND - 44 - Math.random() * 78, got: false }); nextBubble = 900 + Math.random() * 900; }
    for (const o of obstacles) o.x -= dx * (o.fly ? 1.12 : 1);
    for (const b of bubbles) b.x -= dx;
    obstacles = obstacles.filter((o) => o.x > -80);
    bubbles = bubbles.filter((b) => b.x > -30 && !b.got);
    for (const c of clouds) { c.x -= dx * 0.18; if (c.x < -30) { c.x = W + 30; c.y = 28 + Math.random() * 70; } }
    if (Math.random() < 0.25 * k) puff(P.x + 4, P.y + P.h * 0.6, false);
    for (const p of parts) { p.x += p.vx * k; p.y += p.vy * k; p.life -= 0.03 * k; }
    parts = parts.filter((p) => p.life > 0);

    for (const b of bubbles) {
      if (Math.abs(b.x - (P.x + P.w / 2)) < 9 + P.w / 2 && Math.abs(b.y - (P.y + P.h / 2)) < 9 + P.h / 2) {
        b.got = true; dist += 250; flash = 250; toast = { t: T[lang()].fizz, life: 900 };
        for (let i = 0; i < 8; i++) puff(b.x, b.y, false);
      }
    }
    for (const o of obstacles) if (hit(P, o)) { gameOver(); return; }
    if (toast && (toast.life -= dt) <= 0) toast = null;
    if (flash > 0) flash -= dt;
  }

  function gameOver() {
    state = 'over'; overAt = performance.now(); holding = false;
    if (score > best) { best = score; try { localStorage.setItem('ezio-run-best', best); } catch (e) {} }
    for (let i = 0; i < 18; i++) puff(P.x + P.w / 2, P.y + P.h / 2, false);
    try { if (navigator.vibrate) navigator.vibrate(40); } catch (e) {}
    draw();
  }

  // ---------- draw ----------
  function draw() {
    const m = mode(), ink = pal('ink');
    ctx.fillStyle = pal('sky'); ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = pal('far');
    const off = -((dist * 0.08) % 260);
    for (let bx = off; bx < W + 260; bx += 260) { ctx.translate(bx, 0); ctx.fill(S.skyline); ctx.translate(-bx, 0); }
    ctx.strokeStyle = pal('far'); ctx.lineWidth = 3;
    ctx.beginPath(); for (const c of clouds) { ctx.moveTo(c.x + c.r, c.y); ctx.arc(c.x, c.y, c.r, 0, 6.283); } ctx.stroke();
    ctx.fillStyle = pal('ground'); ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = pal('line'); ctx.fillRect(0, GROUND, W, 3);
    const go = -(dist % 40);
    ctx.fillStyle = '#FFC21A'; ctx.beginPath(); for (let gx = go; gx < W + 40; gx += 40) { ctx.moveTo(gx + 13, GROUND + 16); ctx.arc(gx + 10, GROUND + 16, 3, 0, 6.283); } ctx.fill();
    ctx.fillStyle = pal('line'); ctx.beginPath(); for (let gx = go; gx < W + 40; gx += 40) { ctx.moveTo(gx + 32, GROUND + 28); ctx.arc(gx + 30, GROUND + 28, 2, 0, 6.283); } ctx.fill();

    for (const b of bubbles) blit(S.bubble, b.x - 9, b.y - 9 + Math.sin((t + b.x * 20) * 0.005) * 3);
    const fl = Math.floor(t / 90) % 4;
    for (const o of obstacles) blit(o.k === 'flame' ? S[m].obst.flame[fl] : S[m].obst[o.k], o.x, o.y);

    if (parts.length) {
      ctx.fillStyle = ink;
      for (const p of parts) { ctx.globalAlpha = p.life; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); }
      ctx.globalAlpha = 1;
    }

    const sp = state === 'over' ? S[m].dead : S[m].bottle[Math.floor(t / 70) % 6];
    ctx.save();
    if (P.duck) { ctx.translate(P.x + 58, P.y + 1); ctx.rotate(Math.PI / 2); }
    else { ctx.translate(P.x + 12, P.y + 58); ctx.rotate(P.tilt); ctx.translate(-12, -58); }
    ctx.drawImage(sp.c, -sp.pad, -sp.pad, sp.w, sp.h);
    ctx.restore();

    ctx.textAlign = 'right'; ctx.fillStyle = ink;
    ctx.globalAlpha = 0.65; ctx.font = '700 11px Manrope, sans-serif';
    ctx.fillText(T[lang()].best + ' ' + String(best).padStart(5, '0'), W - 16, 24);
    ctx.globalAlpha = 1; ctx.font = '900 20px Unbounded, sans-serif';
    ctx.fillStyle = flash > 0 ? '#F28A1F' : ink;
    ctx.fillText(String(score).padStart(5, '0'), W - 16, 48);
    ctx.textAlign = 'left';
    if (toast) { ctx.globalAlpha = Math.min(1, toast.life / 300); ctx.font = '800 13px Manrope, sans-serif'; ctx.fillStyle = ink; ctx.fillText(toast.t, 16, 26); ctx.globalAlpha = 1; }

    if (state !== 'run') overlay();
  }
  function overlay() {
    ctx.textAlign = 'center';
    if (state === 'over') {
      ctx.fillStyle = 'rgba(14,20,20,.55)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#FFC21A'; ctx.font = `900 ${W < 420 ? 20 : 26}px Unbounded, sans-serif`; ctx.fillText(T[lang()].over, W / 2, H / 2 - 22);
      ctx.fillStyle = '#F6FBFA'; ctx.font = '700 13px Manrope, sans-serif'; ctx.fillText(T[lang()].again, W / 2, H / 2 + 6);
    } else {
      const label = state === 'paused' ? T[lang()].paused : T[lang()].start;
      ctx.font = '800 14px Manrope, sans-serif';
      const tw = Math.min(W - 24, ctx.measureText(label).width + 40);
      rr(ctx, W / 2 - tw / 2, H / 2 - 44, tw, 36, 18); ctx.fillStyle = '#0E1414'; ctx.fill();
      ctx.fillStyle = '#F6FBFA'; ctx.fillText(label, W / 2, H / 2 - 21);
    }
    ctx.textAlign = 'left';
  }

  // ---------- loop: variable step, clamped; pauses off-screen / hidden tab ----------
  let raf = 0, last = 0;
  function frame(now) {
    if (state !== 'run') return;
    const dt = Math.min(34, now - (last || now)); last = now;
    if (dt > 20) { update(dt / 2); if (state === 'run') update(dt / 2); } else update(dt);
    if (state === 'run') draw();
    raf = requestAnimationFrame(frame);
  }
  function loopStart() { cancelAnimationFrame(raf); last = 0; raf = requestAnimationFrame(frame); }
  function pause() { if (state === 'run') { state = 'paused'; draw(); } }
  new IntersectionObserver((e) => { if (!e[0].isIntersecting) pause(); }, { threshold: 0.3 }).observe(cv);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  new ResizeObserver(() => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 80); }).observe(wrap);
  document.addEventListener('ezio:lang', () => { if (state !== 'run') draw(); });
  if (document.fonts) document.fonts.ready.then(() => { buildSprites(); if (state !== 'run') draw(); });
  resize();
})();
