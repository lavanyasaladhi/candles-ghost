
/* ===== HAUNTED GHOST ===== */

/* ---------- 1. Music and sound (Web Audio, no audio files needed) ---------- */
const Sound = (() => {
  let ac, master, bus, muted = false, melodyTimer;
  const notes = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33]; // A minor pentatonic-ish

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ac.destination);

    // echo gives the "empty hall" feeling
    const echo = ac.createDelay(); echo.delayTime.value = 0.45;
    const fb = ac.createGain(); fb.gain.value = 0.45;
    const wet = ac.createGain(); wet.gain.value = 0.5;
    echo.connect(fb); fb.connect(echo); echo.connect(wet); wet.connect(master);
    bus = ac.createGain(); bus.connect(master); bus.connect(echo);

    startDrone();
    playMelody();
  }

  // low, slowly breathing pad
  function startDrone() {
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 350;
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.08;
    const lfoGain = ac.createGain(); lfoGain.gain.value = 180;
    lfo.connect(lfoGain); lfoGain.connect(filter.frequency); lfo.start();
    const out = ac.createGain(); out.gain.value = 0.16;
    filter.connect(out); out.connect(bus);
    [55, 82.41, 110.5].forEach(f => {
      const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      o.connect(filter); o.start();
    });
  }

  // sparse music-box notes at random times
  function playMelody() {
    const f = notes[Math.floor(Math.random() * notes.length)];
    bell(f, 2.4, 0.12);
    melodyTimer = setTimeout(playMelody, 1200 + Math.random() * 2200);
  }

  function bell(freq, dur, vol) {
    const t = ac.currentTime;
    [1, 2].forEach((mult, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.value = freq * mult;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol / (i + 1), t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur);
    });
  }

  return {
    init,
    pickup() { if (ac) { bell(880, 0.6, 0.18); setTimeout(() => bell(1318.5, 0.8, 0.14), 90); } },
    fade() {
      if (!ac) return;
      const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(300, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 1.2);
      g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 1.3);
    },
    toggle() {
      muted = !muted;
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.5, ac.currentTime, 0.1);
      return muted;
    }
  };
})();

/* ---------- 2. Setup: canvas, inputs, saved best score ---------- */
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const W = cv.width, H = cv.height;
const $ = id => document.getElementById(id);

let best = 0;
try { best = +localStorage.getItem('ghostBest') || 0; } catch (e) {}
$('best').textContent = best;

const keys = {};
let target = null; // touch / mouse target
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (k.startsWith('arrow')) e.preventDefault();
  if (k === 'm') toggleMute();
});
addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

function pointer(e) {
  const r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
}
cv.addEventListener('pointerdown', e => { target = pointer(e); cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', e => { if (target) target = pointer(e); });
addEventListener('pointerup', () => target = null);

function toggleMute() { $('mute').textContent = Sound.toggle() ? 'Music off' : 'Music on'; }
$('mute').onclick = toggleMute;

/* ---------- 3. Game state ---------- */
let g, running = false, last = 0;
const rnd = (a, b) => a + Math.random() * (b - a);

function newGame() {
  g = { ghost: { x: W / 2, y: H / 2, vx: 0, vy: 0, r: 16 }, hp: 100, score: 0, t: 0, bob: 0, lit: false, candles: [], hunters: [] };
  for (let i = 0; i < 4; i++) spawnCandle();
  for (let i = 0; i < 2; i++) spawnHunter();
}
function spawnCandle() { g.candles.push({ x: rnd(40, W - 40), y: rnd(40, H - 40), p: rnd(0, 6) }); }
function spawnHunter() {
  const a = rnd(0, 6.28), s = rnd(55, 80);
  g.hunters.push({ x: rnd(60, W - 60), y: rnd(60, H - 60), vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 70 });
}

/* ---------- 4. Update (runs every frame) ---------- */
function update(dt) {
  const G = g.ghost;
  g.t += dt; g.bob += dt * 3;

  // input -> acceleration
  let ax = 0, ay = 0;
  if (keys.arrowleft || keys.a) ax--;
  if (keys.arrowright || keys.d) ax++;
  if (keys.arrowup || keys.w) ay--;
  if (keys.arrowdown || keys.s) ay++;
  if (target) {
    const dx = target.x - G.x, dy = target.y - G.y, d = Math.hypot(dx, dy);
    if (d > 8) { ax = dx / d; ay = dy / d; }
  }
  const m = Math.hypot(ax, ay);
  if (m) { G.vx += ax / m * 900 * dt; G.vy += ay / m * 900 * dt; }
  G.vx *= Math.pow(0.02, dt); G.vy *= Math.pow(0.02, dt); // floaty friction
  G.x = Math.min(W - G.r, Math.max(G.r, G.x + G.vx * dt));
  G.y = Math.min(H - G.r, Math.max(G.y + G.vy * dt, G.r));

  // collect candles
  g.candles = g.candles.filter(c => {
    if (Math.hypot(c.x - G.x, c.y - G.y) < G.r + 12) {
      g.score++; g.hp = Math.min(100, g.hp + 6); Sound.pickup();
      if (g.score % 4 === 0) spawnHunter(); // gets harder
      return false;
    }
    return true;
  });
  while (g.candles.length < 4) spawnCandle();

  // hunters bounce around; check light
  let lit = false;
  g.hunters.forEach(h => {
    h.x += h.vx * dt; h.y += h.vy * dt;
    if (h.x < h.r * .5 || h.x > W - h.r * .5) h.vx *= -1;
    if (h.y < h.r * .5 || h.y > H - h.r * .5) h.vy *= -1;
    if (Math.hypot(h.x - G.x, h.y - G.y) < h.r) lit = true;
  });
  g.lit = lit;
  g.hp = Math.min(100, g.hp - (lit ? 38 : -4) * dt);

  $('score').textContent = g.score;
  $('fill').style.width = Math.max(0, g.hp) + '%';
  $('fill').style.background = lit ? 'var(--hunter)' : 'var(--ghost)';
  if (g.hp <= 0) endGame();
}

/* ---------- 5. Drawing ---------- */
function drawGhost(G) {
  const y = G.y + Math.sin(g.bob) * 3, r = G.r;
  ctx.save();
  ctx.translate(G.x, y);
  ctx.scale(1.5, 1.5); // bigger on screen, hitbox unchanged
  // soft purple halo behind the ghost
  const halo = ctx.createRadialGradient(0, 0, r * .4, 0, 0, r * 3);
  halo.addColorStop(0, 'rgba(255,255,255,.12)'); halo.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, 0, r * 3, 0, 7); ctx.fill();
  ctx.globalAlpha = 0.9 + 0.1 * Math.max(0, g.hp) / 100; // fades as glow drops
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(0, 0, r, Math.PI, 0);
  ctx.lineTo(r, r);
  const teeth = 4, w = r * 2 / teeth;
  for (let i = 0; i < teeth; i++) {
    const x = r - i * w;
    ctx.lineTo(x - w / 2, r - 7);
    ctx.lineTo(x - w, r);
  }
  ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = '#1a1033';
  ctx.beginPath();
  ctx.ellipse(-5, -3, 3.2, 5, 0, 0, 7);
  ctx.ellipse(5, -3, 3.2, 5, 0, 0, 7);
  ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, 7, 3, 4, 0, 0, 7); ctx.fill();
  ctx.restore();
}

function draw() {
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#000000'); bg.addColorStop(0.5, '#05050a'); bg.addColorStop(1, '#000000');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  // floorboards and old furniture
  ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,255,255,.05)';
  for (let i = 0; i < 5; i++) ctx.fillRect(40 + i * 160, 60 + (i % 2) * 260, 70, 120);

  // candles
  g.candles.forEach(c => {
    const f = 1 + Math.sin(g.t * 8 + c.p) * 0.15;
    ctx.fillStyle = '#f4e8cc'; ctx.fillRect(c.x - 4, c.y - 2, 8, 14);
    ctx.shadowColor = '#ffb347'; ctx.shadowBlur = 16;
    ctx.fillStyle = '#ffc060'; ctx.beginPath(); ctx.ellipse(c.x, c.y - 8, 4 * f, 7 * f, 0, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
  });

  drawGhost(g.ghost);

  // hunters and lantern light
  g.hunters.forEach(h => {
    const gr = ctx.createRadialGradient(h.x, h.y, 4, h.x, h.y, h.r);
    gr.addColorStop(0, 'rgba(255,205,130,.6)'); gr.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, 7); ctx.fill();
    ctx.fillStyle = '#ff5d6c'; ctx.fillRect(h.x - 6, h.y - 6, 12, 12);
    ctx.strokeStyle = '#ffb347'; ctx.strokeRect(h.x - 6, h.y - 6, 12, 12);
  });

  // darkness overlay with a hole of glow around the ghost
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'destination-out';
  const G = g.ghost, gl = ctx.createRadialGradient(G.x, G.y, 10, G.x, G.y, 110);
  gl.addColorStop(0, 'rgba(0,0,0,.9)'); gl.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(G.x, G.y, 110, 0, 7); ctx.fill();
  ctx.restore();

  if (g.lit) { ctx.fillStyle = 'rgba(224,80,90,.12)'; ctx.fillRect(0, 0, W, H); }
}

/* ---------- 6. Game loop, start and end ---------- */
function loop(t) {
  if (!running) return;
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  update(dt); draw();
  if (running) requestAnimationFrame(loop);
}

function startGame() {
  Sound.init(); // browsers only allow audio after a click
  newGame();
  running = true;
  $('msg').classList.add('hide');
  last = performance.now();
  requestAnimationFrame(loop);
}

function endGame() {
  running = false;
  Sound.fade();
  if (g.score > best) {
    best = g.score;
    try { localStorage.setItem('ghostBest', best); } catch (e) {}
    $('best').textContent = best;
  }
  $('title').textContent = 'You faded away';
  $('sub').textContent = 'You snuffed out ' + g.score + ' candle' + (g.score === 1 ? '' : 's') + ' before the light found you.';
  $('go').textContent = 'Haunt again';
  $('msg').classList.remove('hide');
}

$('go').onclick = startGame;
newGame(); draw(); // show the room behind the start screen
