(function () {
  'use strict';

  // ── Seeded PRNG (mulberry32) ──────────────────────────────────────────────
  function makeRng(seed) {
    let s = seed >>> 0;
    return function () {
      s += 0x6d2b79f5;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ── Geometry helpers ──────────────────────────────────────────────────────
  function buildAsteroidVertices(seed, radius) {
    const rng = makeRng(seed);
    const count = 10 + Math.floor(rng() * 4);
    const verts = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const r = radius * (0.75 + rng() * 0.5);
      verts.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
    }
    return verts;
  }

  function circlesOverlap(ax, ay, ar, bx, by, br) {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy < (ar + br) * (ar + br);
  }

  function wrap(val, max) {
    if (val < 0) return val + max;
    if (val >= max) return val - max;
    return val;
  }

  // ── Constants ─────────────────────────────────────────────────────────────
  const W = 800, H = 600;
  const ROTATE_SPEED = 0.065;
  const THRUST_POWER = 0.22;
  const FRICTION = 0.988;
  const BULLET_SPEED = 10;
  const BULLET_LIFE = 60;
  const SHIP_RADIUS = 14;
  const INVINCIBLE_FRAMES = 180;
  const RESPAWN_FRAMES = 90;
  const ASTEROID_RADII = { 3: 80, 2: 40, 1: 20 };
  const ASTEROID_SCORE = { 3: 20, 2: 50, 1: 100 };
  const FIRE_COOLDOWN = 12;
  const LEVEL_SPAWN_BASE = 4;

  // ── State ─────────────────────────────────────────────────────────────────
  let state = null;

  function makeShip() {
    return {
      x: W / 2, y: H / 2,
      angle: -Math.PI / 2,
      vx: 0, vy: 0,
      radius: SHIP_RADIUS,
      invincible: true,
      invincibleFrames: INVINCIBLE_FRAMES
    };
  }

  function makeAsteroid(x, y, size, seedOffset) {
    const rng = makeRng(seedOffset);
    const speed = 0.6 + rng() * 1.2;
    const angle = rng() * Math.PI * 2;
    const seed = (seedOffset * 1337 + size * 17) >>> 0;
    const radius = ASTEROID_RADII[size];
    return {
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius,
      size,
      seed,
      vertices: buildAsteroidVertices(seed, radius)
    };
  }

  function spawnWave(level) {
    const count = LEVEL_SPAWN_BASE + level - 1;
    const asteroids = [];
    for (let i = 0; i < count; i++) {
      const rng = makeRng(level * 100 + i);
      let x, y;
      do {
        x = rng() * W;
        y = rng() * H;
      } while (circlesOverlap(x, y, 80, W / 2, H / 2, 120));
      asteroids.push(makeAsteroid(x, y, 3, level * 1000 + i));
    }
    return asteroids;
  }

  function initialState() {
    return {
      ship: makeShip(),
      asteroids: spawnWave(1),
      bullets: [],
      particles: [],
      score: 0,
      lives: 3,
      level: 1,
      status: 'playing',
      width: W,
      height: H,
      fireCooldown: 0,
      respawnCountdown: 0
    };
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  const keys = {};
  const touchButtons = {};

  function isPressed(key) {
    return !!(keys[key] || touchButtons[key]);
  }

  // ── Particles ─────────────────────────────────────────────────────────────
  function spawnParticles(x, y, count, speed, color) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const s = speed * (0.5 + Math.random() * 0.5);
      state.particles.push({
        x, y,
        vx: Math.cos(angle) * s,
        vy: Math.sin(angle) * s,
        life: 30 + Math.floor(Math.random() * 20),
        maxLife: 50,
        color: color || '#f59e0b'
      });
    }
  }

  // ── Update ────────────────────────────────────────────────────────────────
  function step() {
    if (state.status === 'gameOver') return;

    const s = state.ship;

    // Respawning
    if (state.status === 'dead') {
      state.respawnCountdown--;
      if (state.respawnCountdown <= 0) {
        state.ship = makeShip();
        state.status = 'playing';
      }
      updateParticles();
      return;
    }

    // Rotation
    if (isPressed('ArrowLeft')) s.angle -= ROTATE_SPEED;
    if (isPressed('ArrowRight')) s.angle += ROTATE_SPEED;

    // Thrust
    if (isPressed('ArrowUp')) {
      s.vx += Math.cos(s.angle) * THRUST_POWER;
      s.vy += Math.sin(s.angle) * THRUST_POWER;
    }

    // Friction
    s.vx *= FRICTION;
    s.vy *= FRICTION;

    // Move ship
    s.x = wrap(s.x + s.vx, W);
    s.y = wrap(s.y + s.vy, H);

    // Invincibility countdown
    if (s.invincible) {
      s.invincibleFrames--;
      if (s.invincibleFrames <= 0) {
        s.invincible = false;
        s.invincibleFrames = 0;
      }
    }

    // Fire cooldown
    if (state.fireCooldown > 0) state.fireCooldown--;

    // Fire bullet
    if (isPressed('Space') && state.fireCooldown === 0) {
      state.bullets.push({
        x: s.x + Math.cos(s.angle) * (SHIP_RADIUS + 4),
        y: s.y + Math.sin(s.angle) * (SHIP_RADIUS + 4),
        vx: s.vx + Math.cos(s.angle) * BULLET_SPEED,
        vy: s.vy + Math.sin(s.angle) * BULLET_SPEED,
        life: BULLET_LIFE
      });
      state.fireCooldown = FIRE_COOLDOWN;
    }

    // Move bullets
    state.bullets = state.bullets.filter(b => b.life > 0);
    for (const b of state.bullets) {
      b.x = wrap(b.x + b.vx, W);
      b.y = wrap(b.y + b.vy, H);
      b.life--;
    }

    // Move asteroids
    for (const a of state.asteroids) {
      a.x = wrap(a.x + a.vx, W);
      a.y = wrap(a.y + a.vy, H);
    }

    // Bullet–asteroid collision
    const nextAsteroids = [];
    const hitBullets = new Set();
    for (const a of state.asteroids) {
      let hit = false;
      for (let i = 0; i < state.bullets.length; i++) {
        if (hitBullets.has(i)) continue;
        const b = state.bullets[i];
        if (circlesOverlap(a.x, a.y, a.radius, b.x, b.y, 4)) {
          hit = true;
          hitBullets.add(i);
          state.score += ASTEROID_SCORE[a.size];
          spawnParticles(a.x, a.y, 6 + a.size * 2, 2 + a.size);
          if (a.size > 1) {
            for (let k = 0; k < 2; k++) {
              nextAsteroids.push(makeAsteroid(a.x, a.y, a.size - 1, a.seed + k + 1));
            }
          }
          break;
        }
      }
      if (!hit) nextAsteroids.push(a);
    }
    state.bullets = state.bullets.filter((_, i) => !hitBullets.has(i));
    state.asteroids = nextAsteroids;

    // Ship–asteroid collision
    if (!s.invincible) {
      for (const a of state.asteroids) {
        if (circlesOverlap(s.x, s.y, s.radius - 2, a.x, a.y, a.radius - 4)) {
          spawnParticles(s.x, s.y, 12, 3, '#fff');
          state.lives--;
          if (state.lives <= 0) {
            state.lives = 0;
            state.status = 'gameOver';
          } else {
            state.status = 'dead';
            state.respawnCountdown = RESPAWN_FRAMES;
          }
          break;
        }
      }
    }

    // Wave cleared
    if (state.asteroids.length === 0 && state.status === 'playing') {
      state.level++;
      state.asteroids = spawnWave(state.level);
    }

    updateParticles();
    updateHUD();
  }

  function updateParticles() {
    state.particles = state.particles.filter(p => p.life > 0);
    for (const p of state.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.97;
      p.vy *= 0.97;
      p.life--;
    }
  }

  function updateHUD() {
    document.getElementById('hud-score').textContent = state.score;
    document.getElementById('hud-lives').textContent = state.lives;
    document.getElementById('hud-level').textContent = state.level;
  }

  // ── Rendering ─────────────────────────────────────────────────────────────
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  function drawShip(s) {
    if (state.status === 'dead') return;
    if (s.invincible && Math.floor(s.invincibleFrames / 6) % 2 === 0) return;

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle);
    ctx.strokeStyle = '#fef9f0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(-12, -10);
    ctx.lineTo(-8, 0);
    ctx.lineTo(-12, 10);
    ctx.closePath();
    ctx.stroke();

    if (isPressed('ArrowUp')) {
      ctx.strokeStyle = '#f59e0b';
      ctx.beginPath();
      ctx.moveTo(-8, -5);
      ctx.lineTo(-18, 0);
      ctx.lineTo(-8, 5);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawAsteroid(a) {
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.strokeStyle = '#c0a060';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const v = a.vertices;
    ctx.moveTo(v[0].x, v[0].y);
    for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  function drawBullet(b) {
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawParticle(p) {
    const alpha = p.life / p.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawOverlay() {
    if (state.status === 'gameOver') {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 52px "Trebuchet MS", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', W / 2, H / 2 - 20);
      ctx.fillStyle = '#fef9f0';
      ctx.font = '22px "Trebuchet MS", Arial, sans-serif';
      ctx.fillText('Press R to restart', W / 2, H / 2 + 26);
    }
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    for (const a of state.asteroids) drawAsteroid(a);
    for (const b of state.bullets) drawBullet(b);
    for (const p of state.particles) drawParticle(p);
    if (state.ship) drawShip(state.ship);
    drawOverlay();
  }

  // ── Game loop ─────────────────────────────────────────────────────────────
  let autoStep = true;
  let rafId = null;

  function loop() {
    step();
    render();
    if (autoStep) rafId = requestAnimationFrame(loop);
  }

  function startLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function stopLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  // ── Controls ──────────────────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Space') e.preventDefault();
    if (e.code === 'KeyR' && state.status === 'gameOver') {
      restart();
    }
  });
  document.addEventListener('keyup', (e) => { keys[e.code] = false; });

  function bindTouchButton(id, key) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      touchButtons[key] = true;
      el.classList.add('active');
    });
    el.addEventListener('pointerup', () => {
      touchButtons[key] = false;
      el.classList.remove('active');
    });
    el.addEventListener('pointercancel', () => {
      touchButtons[key] = false;
      el.classList.remove('active');
    });
    el.addEventListener('pointerleave', () => {
      touchButtons[key] = false;
      el.classList.remove('active');
    });
  }

  bindTouchButton('rotate-left', 'ArrowLeft');
  bindTouchButton('rotate-right', 'ArrowRight');
  bindTouchButton('thrust', 'ArrowUp');
  bindTouchButton('fire', 'Space');

  // ── Restart ───────────────────────────────────────────────────────────────
  function restart() {
    state = initialState();
    updateHUD();
    render();
    if (autoStep) startLoop();
  }

  // ── Test API ──────────────────────────────────────────────────────────────
  window.__asteroidsTest = {
    isReady: false,

    getState() {
      return structuredClone(state);
    },

    setState(payload) {
      if (!state) state = initialState();
      const next = structuredClone(payload);
      // Rebuild asteroid vertices from seed if not provided
      if (Array.isArray(next.asteroids)) {
        for (const a of next.asteroids) {
          if (!a.vertices || a.vertices.length === 0) {
            a.vertices = buildAsteroidVertices(a.seed, a.radius);
          }
        }
      }
      state = { ...state, ...next };
      render();
      updateHUD();
    },

    advanceFrames(count) {
      for (let i = 0; i < count; i++) {
        step();
        render();
      }
      return Promise.resolve();
    },

    setAutoStep(enabled) {
      autoStep = enabled;
      if (enabled) {
        startLoop();
      } else {
        stopLoop();
      }
    },

    restart() {
      restart();
      return Promise.resolve();
    }
  };

  // ── Boot ──────────────────────────────────────────────────────────────────
  state = initialState();
  updateHUD();
  render();
  startLoop();
  window.__asteroidsTest.isReady = true;
})();
