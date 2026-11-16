// EZIO Run — a Chrome-dino style runner. The bottle dodges heartburn on the dastarkhan.
(function () {
  const cv = document.getElementById('game');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const wrap = cv.parentElement;
  const H = 240;               // logical height; width follows the container
  let W = 720, scale = 1;

  const T = {
    uz: { start: 'Probel yoki bosing — boshlash', over: 'Jigʻildon qaynadi!', again: 'Qayta oʻynash uchun bosing', best: 'REKORD', fizz: 'Koʻpik +25', night: 'Kechki dasturxon' },
    ru: { start: 'Пробел или тап — старт', over: 'Изжога догнала!', again: 'Нажмите, чтобы сыграть снова', best: 'РЕКОРД', fizz: 'Пузырёк +25', night: 'Вечерний дастархан' }
  };
  const lang = () => (document.documentElement.lang === 'ru' ? 'ru' : 'uz');

  const DAY = { sky: '#DDF4EF', far: '#B8E6DF', ground: '#19B2AA', line: '#0B6E6B', ink: '#0E1414', text: '#0E1414' };
  const NIGHT = { sky: '#0E1414', far: '#163B39', ground: '#0B6E6B', line: '#19B2AA', ink: '#F6FBFA', text: '#F6FBFA' };
  let pal = { ...DAY }, palTarget = DAY;

  const GROUND = H - 44;
  const G = 0.62, JUMP = -11.2;
  let state = 'ready'; // ready | run | over
  let speed, dist, score, best = 0, frame, obstacles, bubbles, parts, clouds, nextSpawn, nextBubble, flash, toast;
  try { best = +localStorage.getItem('ezio-run-best') || 0; } catch (e) {}

  const P = { x: 64, y: 0, vy: 0, w: 24, h: 58, duck: false, onGround: true, tilt: 0 };

  function resize() {
    const r = wrap.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(320, Math.round(r.width / (r.height / H)));
    scale = r.height / H;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    if (state !== 'run') draw();
  }

  function reset() {
    speed = 6; dist = 0; score = 0; frame = 0; obstacles = []; bubbles = []; parts = []; flash = 0; toast = null;
    nextSpawn = 60; nextBubble = 140; palTarget = DAY;
    P.y = GROUND - P.h; P.vy = 0; P.duck = false; P.onGround = true;
    clouds = Array.from({ length: 6 }, (_, i) => ({ x: i * 160 + Math.random() * 80, y: 30 + Math.random() * 70, r: 6 + Math.random() * 16 }));
  }
  reset();

  // ---------- input ----------
  function jump() {
    if (state === 'ready' || state === 'over') { start(); return; }
    if (P.onGround && !P.duck) { P.vy = JUMP; P.onGround = false; for (let i = 0; i < 6; i++) puff(P.x + 12, GROUND, true); }
  }
  function duck(on) { if (state === 'run') { P.duck = on; if (on && !P.onGround) P.vy += 4; } }
  function start() { reset(); state = 'run'; cv.focus({ preventScroll: true }); loop(); }

  cv.addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) { e.preventDefault(); jump(); }
    if (['ArrowDown', 'KeyS'].includes(e.code)) { e.preventDefault(); duck(true); }
  });
  cv.addEventListener('keyup', (e) => { if (['ArrowDown', 'KeyS'].includes(e.code)) duck(false); });
  let ty = null;
  cv.addEventListener('pointerdown', (e) => { ty = e.clientY; cv.focus({ preventScroll: true }); });
  cv.addEventListener('pointerup', (e) => {
    if (ty !== null && e.clientY - ty > 30) { duck(true); setTimeout(() => duck(false), 450); } else jump();
    ty = null;
  });
  const bj = document.getElementById('g-jump'), bd = document.getElementById('g-duck');
  if (bj) bj.addEventListener('click', () => { jump(); cv.focus({ preventScroll: true }); });
  if (bd) { bd.addEventListener('pointerdown', () => duck(true)); ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => bd.addEventListener(ev, () => duck(false))); }

  // ---------- spawning ----------
  const KINDS = [
    { k: 'samsa', w: 34, h: 26 },
    { k: 'non', w: 36, h: 18 },
    { k: 'lagan', w: 56, h: 30 },
    { k: 'shashlik', w: 16, h: 52 },
    { k: 'chili', w: 22, h: 34 },
    { k: 'double', w: 64, h: 26 }
  ];
  function spawn() {
    const flyOK = score > 300 && Math.random() < 0.28;
    if (flyOK) {
      const lane = [GROUND - 30, GROUND - 58, GROUND - 92][Math.floor(Math.random() * 3)];
      obstacles.push({ k: 'flame', x: W + 20, y: lane - 26, w: 34, h: 26, fly: true });
    } else {
      const pool = score < 200 ? KINDS.slice(0, 3) : KINDS;
      const o = pool[Math.floor(Math.random() * pool.length)];
      obstacles.push({ ...o, x: W + 20, y: GROUND - o.h });
    }
    const gap = 70 + Math.random() * 70;
    nextSpawn = Math.max(38, gap - speed * 2.2);
  }

  function puff(x, y, ground) {
    parts.push({ x, y, vx: (Math.random() - .5) * 2 - (ground ? speed * .3 : 0), vy: -Math.random() * 2.4 - .4, r: 1.5 + Math.random() * 3.5, life: 1 });
  }

  // ---------- update ----------
  function hit(a, b) {
    return a.x + 4 < b.x + b.w - 3 && a.x + a.w - 4 > b.x + 3 && a.y + 4 < b.y + b.h - 2 && a.y + a.h - 2 > b.y + 3;
  }
  function update() {
    frame++;
    speed = Math.min(15, 6 + dist / 1400);
    dist += speed; score = Math.floor(dist / 10);
    if (score > 0 && score % 700 === 0) { palTarget = palTarget === DAY ? NIGHT : DAY; if (palTarget === NIGHT) toast = { t: T[lang()].night, life: 90 }; }

    // player
    const tH = P.duck ? 24 : 58, tW = P.duck ? 58 : 24;
    if (P.h !== tH) { P.y += P.h - tH; P.h = tH; P.w = tW; }
    P.vy += G; P.y += P.vy;
    if (P.y >= GROUND - P.h) { if (!P.onGround) for (let i = 0; i < 5; i++) puff(P.x + P.w / 2, GROUND, true); P.y = GROUND - P.h; P.vy = 0; P.onGround = true; }
    P.tilt = P.onGround ? Math.sin(frame * 0.5) * 0.05 : Math.max(-0.25, Math.min(0.25, P.vy * 0.02));
    if (frame % 3 === 0) puff(P.x + 4, P.y + P.h * 0.6, false); // fizz trail

    // obstacles & bubbles
    if (--nextSpawn <= 0) spawn();
    if (--nextBubble <= 0) { bubbles.push({ x: W + 20, y: GROUND - 40 - Math.random() * 80, r: 9, got: false }); nextBubble = 120 + Math.random() * 160; }
    obstacles.forEach((o) => { o.x -= speed * (o.fly ? 1.12 : 1); });
    bubbles.forEach((b) => { b.x -= speed; });
    obstacles = obstacles.filter((o) => o.x > -80);
    bubbles = bubbles.filter((b) => b.x > -30 && !b.got);
    clouds.forEach((c) => { c.x -= speed * 0.18; if (c.x < -30) { c.x = W + 30; c.y = 30 + Math.random() * 70; } });
    parts.forEach((p) => { p.x += p.vx; p.y += p.vy; p.life -= 0.03; });
    parts = parts.filter((p) => p.life > 0);

    for (const b of bubbles) {
      if (Math.abs(b.x - (P.x + P.w / 2)) < b.r + P.w / 2 && Math.abs(b.y - (P.y + P.h / 2)) < b.r + P.h / 2) {
        b.got = true; dist += 250; flash = 8; toast = { t: T[lang()].fizz, life: 50 };
        for (let i = 0; i < 10; i++) puff(b.x, b.y, false);
      }
    }
    for (const o of obstacles) if (hit(P, o)) { gameOver(); return; }

    // palette blend
    for (const k in pal) pal[k] = mix(pal[k], palTarget[k], 0.04);
    if (toast && --toast.life <= 0) toast = null;
    if (flash > 0) flash--;
  }

  function gameOver() {
    state = 'over';
    if (score > best) { best = score; try { localStorage.setItem('ezio-run-best', best); } catch (e) {} }
    for (let i = 0; i < 24; i++) puff(P.x + P.w / 2, P.y + P.h / 2, false);
    draw();
  }

  // ---------- drawing ----------
  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const c = [16, 8, 0].map((s) => Math.round(((pa >> s) & 255) + ((((pb >> s) & 255) - ((pa >> s) & 255)) * t)));
    return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  }
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

  function drawBottle(x, y, w, h, tilt, ducked) {
    ctx.save();
    if (ducked) { ctx.translate(x + 58, y + 1); ctx.rotate(Math.PI / 2); }
    else { ctx.translate(x + 12, y + 58); ctx.rotate(tilt); ctx.translate(-12, -58); }
    ctx.lineWidth = 2; ctx.strokeStyle = pal.ink;
    // body
    ctx.beginPath();
    ctx.moveTo(8, 8); ctx.lineTo(16, 8);
    ctx.quadraticCurveTo(24, 16, 24, 26); ctx.lineTo(24, 54);
    ctx.quadraticCurveTo(24, 58, 20, 58); ctx.lineTo(4, 58);
    ctx.quadraticCurveTo(0, 58, 0, 54); ctx.lineTo(0, 26);
    ctx.quadraticCurveTo(0, 16, 8, 8); ctx.closePath();
    ctx.fillStyle = 'rgba(184,240,230,.9)'; ctx.fill(); ctx.stroke();
    // water line + inner bubbles
    ctx.fillStyle = 'rgba(25,178,170,.35)'; ctx.fillRect(2, 22, 20, 18);
    ctx.fillStyle = pal.ink === '#F6FBFA' ? '#0E1414' : '#FFFFFF';
    for (let i = 0; i < 3; i++) { const by = 38 - ((frame * 0.6 + i * 9) % 22); ctx.beginPath(); ctx.arc(6 + i * 6, by, 1.4, 0, 7); ctx.fill(); }
    // label
    ctx.fillStyle = '#19B2AA'; ctx.fillRect(1, 40, 22, 13); ctx.strokeRect(1, 40, 22, 13);
    ctx.fillStyle = '#FFC21A'; ctx.beginPath(); ctx.arc(18, 46.5, 3.6, 0, 7); ctx.fill();
    ctx.fillStyle = '#0E1414'; ctx.font = '800 6px Unbounded, sans-serif'; ctx.fillText('ezio', 2.5, 49);
    // cap
    ctx.fillStyle = '#F28A1F'; rr(7, 0, 10, 8, 2); ctx.fill(); ctx.stroke();
    // face
    ctx.fillStyle = '#0E1414';
    if (state === 'over') { ctx.font = '700 7px Manrope, sans-serif'; ctx.fillText('x  x', 6, 33); }
    else { ctx.beginPath(); ctx.arc(9, 31, 1.6, 0, 7); ctx.arc(15, 31, 1.6, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(12, 33.5, 2.4, 0.2, Math.PI - 0.2); ctx.stroke(); }
    ctx.restore();
  }

  function drawObstacle(o) {
    const { x, y, w, h } = o; ctx.lineWidth = 2; ctx.strokeStyle = pal.ink;
    switch (o.k) {
      case 'samsa':
        ctx.fillStyle = '#E9A93A'; ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w / 2, y); ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = pal.ink; [[.42, .55], [.55, .7], [.5, .82]].forEach(([a, b]) => { ctx.beginPath(); ctx.arc(x + w * a, y + h * b, 1.2, 0, 7); ctx.fill(); }); break;
      case 'non':
        ctx.fillStyle = '#D9933A'; rr(x, y, w, h, 9); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#F2C97A'; rr(x + 8, y + 4, w - 16, h - 8, 5); ctx.fill();
        ctx.fillStyle = pal.ink; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(x + 12 + i * 4, y + 9, 1, 0, 7); ctx.fill(); } break;
      case 'lagan':
        ctx.fillStyle = '#1F4FA8'; rr(x - 2, y + h - 8, w + 4, 8, 4); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#F2B544'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h - 8, w / 2 - 3, h - 8, 0, Math.PI, 0); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#E8642C'; for (let i = 0; i < 5; i++) ctx.fillRect(x + 12 + i * 7, y + h - 18 - (i % 2) * 5, 4, 2);
        ctx.fillStyle = '#7A3B22'; ctx.beginPath(); ctx.arc(x + w / 2, y + 6, 4, 0, 7); ctx.fill(); break;
      case 'shashlik':
        ctx.strokeStyle = '#8A8F8F'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.stroke();
        ctx.lineWidth = 2; ctx.strokeStyle = pal.ink;
        ['#8B3A1E', '#F2F0E6', '#8B3A1E', '#A84A26'].forEach((c, i) => { ctx.fillStyle = c; rr(x, y + 6 + i * 10, w, 9, 3); ctx.fill(); ctx.stroke(); }); break;
      case 'chili':
        ctx.fillStyle = '#E5484D'; ctx.beginPath(); ctx.moveTo(x + w / 2, y + 6); ctx.quadraticCurveTo(x + w, y + 14, x + w / 2 + 2, y + h); ctx.quadraticCurveTo(x - 2, y + 18, x + w / 2, y + 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#2E9E5B'; rr(x + w / 2 - 3, y, 6, 8, 2); ctx.fill(); ctx.stroke(); break;
      case 'double':
        drawObstacle({ k: 'samsa', x, y, w: 30, h }); drawObstacle({ k: 'samsa', x: x + 32, y, w: 30, h }); break;
      case 'flame': {
        const f = Math.sin(frame * 0.6) * 3;
        ctx.fillStyle = '#F28A1F'; ctx.beginPath(); ctx.moveTo(x, y + h / 2); ctx.quadraticCurveTo(x + 10, y - 6 + f, x + w, y + 2); ctx.quadraticCurveTo(x + w - 8, y + h / 2, x + w, y + h - 2); ctx.quadraticCurveTo(x + 10, y + h + 6 - f, x, y + h / 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#FFC21A'; ctx.beginPath(); ctx.ellipse(x + 13, y + h / 2, 7, 5, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#0E1414'; ctx.beginPath(); ctx.arc(x + 9, y + h / 2 - 1, 1.6, 0, 7); ctx.fill(); break;
      }
    }
  }

  function draw() {
    // sky
    ctx.fillStyle = pal.sky; ctx.fillRect(0, 0, W, H);
    // distant domes
    ctx.fillStyle = pal.far;
    const off = -((dist * 0.08) % 260);
    for (let bx = off; bx < W + 260; bx += 260) {
      ctx.beginPath(); ctx.ellipse(bx + 60, GROUND - 34, 28, 30, 0, Math.PI, 0); ctx.fill();
      ctx.fillRect(bx + 32, GROUND - 34, 56, 34);
      ctx.fillRect(bx + 104, GROUND - 78, 10, 78); ctx.beginPath(); ctx.arc(bx + 109, GROUND - 80, 7, 0, 7); ctx.fill();
      ctx.fillRect(bx + 150, GROUND - 22, 70, 22); ctx.beginPath(); ctx.ellipse(bx + 185, GROUND - 22, 18, 18, 0, Math.PI, 0); ctx.fill();
    }
    // floating bubble "clouds"
    clouds.forEach((c) => { ctx.strokeStyle = pal.far; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, 7); ctx.stroke(); });
    // ground: dastarkhan stripe with ikat dots
    ctx.fillStyle = pal.ground; ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = pal.line; ctx.fillRect(0, GROUND, W, 3);
    const go = -(dist % 40);
    for (let gx = go; gx < W + 40; gx += 40) {
      ctx.fillStyle = '#FFC21A'; ctx.beginPath(); ctx.arc(gx + 10, GROUND + 16, 3, 0, 7); ctx.fill();
      ctx.fillStyle = pal.line; ctx.beginPath(); ctx.arc(gx + 30, GROUND + 28, 2, 0, 7); ctx.fill();
    }
    // bubbles to collect
    bubbles.forEach((b) => {
      const bob = Math.sin((frame + b.x) * 0.08) * 3;
      ctx.fillStyle = '#FFC21A'; ctx.beginPath(); ctx.arc(b.x, b.y + bob, b.r, 0, 7); ctx.fill();
      ctx.fillStyle = pal.sky; ctx.beginPath(); ctx.arc(b.x, b.y + bob, b.r * 0.35, 0, 7); ctx.fill();
    });
    obstacles.forEach(drawObstacle);
    // particles
    parts.forEach((p) => { ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = pal.ink; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); });
    ctx.globalAlpha = 1;
    drawBottle(P.x, P.y, P.w, P.h, P.tilt, P.duck);

    // HUD
    ctx.fillStyle = pal.text; ctx.textAlign = 'right';
    ctx.font = '700 11px Manrope, sans-serif'; ctx.globalAlpha = .65;
    ctx.fillText(T[lang()].best + ' ' + String(best).padStart(5, '0'), W - 16, 24);
    ctx.globalAlpha = 1; ctx.font = '900 20px Unbounded, sans-serif';
    ctx.fillStyle = flash > 0 ? '#F28A1F' : pal.text;
    ctx.fillText(String(score).padStart(5, '0'), W - 16, 48);
    ctx.textAlign = 'left';
    if (toast) { ctx.globalAlpha = Math.min(1, toast.life / 20); ctx.font = '800 13px Manrope, sans-serif'; ctx.fillStyle = pal.text; ctx.fillText(toast.t, 16, 26); ctx.globalAlpha = 1; }

    if (state !== 'run') {
      ctx.fillStyle = state === 'over' ? 'rgba(14,20,20,.55)' : 'rgba(221,244,239,.0)';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      if (state === 'over') {
        ctx.fillStyle = '#FFC21A'; ctx.font = '900 26px Unbounded, sans-serif'; ctx.fillText(T[lang()].over, W / 2, H / 2 - 20);
        ctx.fillStyle = '#F6FBFA'; ctx.font = '700 13px Manrope, sans-serif'; ctx.fillText(T[lang()].again, W / 2, H / 2 + 8);
      } else {
        ctx.fillStyle = pal.text; ctx.font = '800 14px Manrope, sans-serif';
        const tw = Math.min(W - 24, ctx.measureText(T[lang()].start).width + 36);
        rr(W / 2 - tw / 2, H / 2 - 42, tw, 34, 17); ctx.fillStyle = '#0E1414'; ctx.fill();
        ctx.fillStyle = '#F6FBFA'; ctx.fillText(T[lang()].start, W / 2, H / 2 - 20);
      }
      ctx.textAlign = 'left';
    }
  }

  let raf = 0, visible = true, last = 0, acc = 0;
  function loop(ts) {
    cancelAnimationFrame(raf);
    const step = (t) => {
      if (state !== 'run') return;
      if (!visible) { last = t; raf = requestAnimationFrame(step); return; }
      acc += Math.min(50, t - (last || t)); last = t;
      while (acc >= 1000 / 60) { update(); acc -= 1000 / 60; if (state !== 'run') return; }
      draw(); raf = requestAnimationFrame(step);
    };
    last = 0; acc = 0; raf = requestAnimationFrame(step);
  }
  new IntersectionObserver((e) => { visible = e[0].isIntersecting; }).observe(cv);
  new ResizeObserver(resize).observe(wrap);
  document.addEventListener('ezio:lang', () => { if (state !== 'run') draw(); });
  if (document.fonts) document.fonts.ready.then(() => { if (state !== 'run') draw(); });
  resize();
})();
