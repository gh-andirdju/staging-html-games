(() => {
  var WIDTH = 600;
  var HEIGHT = 480;
  var FIXED_DT = 1 / 60;

  var PLAYER_Y = HEIGHT - 40;
  var PLAYER_WIDTH = 40;
  var PLAYER_HEIGHT = 20;
  var PLAYER_SPEED = 220;

  var BULLET_W = 4;
  var BULLET_H = 12;
  var BULLET_SPEED = 380;
  var BULLET_COOLDOWN = 30;

  var ENEMY_BULLET_W = 4;
  var ENEMY_BULLET_H = 12;
  var ENEMY_BULLET_SPEED = 160;

  var ENEMY_COLS = 11;
  var ENEMY_ROWS = 5;
  var ENEMY_W = 32;
  var ENEMY_H = 20;
  var ENEMY_PAD_X = 14;
  var ENEMY_PAD_Y = 14;
  var ENEMY_STEP_PX = 8;
  var ENEMY_DROP_PX = 16;
  var ENEMY_START_X = 40;
  var ENEMY_START_Y = 60;

  var FIRE_COOLDOWN_MIN = 60;
  var FIRE_COOLDOWN_MAX = 150;
  var FIRE_COOLDOWN_RANGE = FIRE_COOLDOWN_MAX - FIRE_COOLDOWN_MIN;

  var SHIELD_COUNT = 4;
  var SHIELD_COLS = 4;
  var SHIELD_ROWS = 3;
  var SHIELD_CELL_W = 10;
  var SHIELD_CELL_H = 8;
  var SHIELD_Y = PLAYER_Y - 60;

  var SCORE_BY_ROW = [30, 20, 20, 10, 10];

  var DEATH_TIMER_FRAMES = 60;
  var DEATH_FLASH_PERIOD = 6;
  var ENEMY_SPEED_SCALE = 0.9; // frames saved per enemy killed (controls acceleration)

  // New constants for Galaga features
  var UFO_W = 48;
  var UFO_H = 20;
  var UFO_Y = 18;
  var UFO_SCORES = [50, 100, 150, 200, 300];

  var BOSS_W = 48;
  var BOSS_H = 28;
  var BOSS_Y = 28;
  var BOSS_SCORE = 300;
  var BOSS_BEAM_W = 10;
  var BOSS_BEAM_SPEED = 100;
  var BOSS_BEAM_INTERVAL = 300;

  var DIVE_SPEED = 180;
  var RETURN_SPEED = 120;
  var DIVE_BOMBER_SCORE = 50;

  // Wave configurations
  var WAVE_CONFIGS = [
    { wave: 1, shieldsReset: true,  diveBombers: 0, diveBomberCooldown: 0,
      ufoInterval: 1800, ufoSpeed: 60, fireRateScale: 1.0, zigzagChance: 0.0,
      hasBoss: false, challengeStage: false, formation: 'classic' },
    { wave: 2, shieldsReset: true,  diveBombers: 0, diveBomberCooldown: 0,
      ufoInterval: 1200, ufoSpeed: 70, fireRateScale: 1.1, zigzagChance: 0.0,
      hasBoss: false, challengeStage: false, formation: 'classic' },
    { wave: 3, shieldsReset: false, diveBombers: 1, diveBomberCooldown: 300,
      ufoInterval: 900,  ufoSpeed: 80, fireRateScale: 1.2, zigzagChance: 0.15,
      hasBoss: true,  challengeStage: false, formation: 'classic' },
    { wave: 4, shieldsReset: false, diveBombers: 2, diveBomberCooldown: 200,
      ufoInterval: 600,  ufoSpeed: 90, fireRateScale: 1.4, zigzagChance: 0.25,
      hasBoss: true,  challengeStage: false, formation: 'v-shape' }
  ];

  function getWaveConfig(wave) {
    var cfg = WAVE_CONFIGS[0];
    for (var i = 0; i < WAVE_CONFIGS.length; i++) {
      if (wave >= WAVE_CONFIGS[i].wave) cfg = WAVE_CONFIGS[i];
    }
    // Challenge stage every 4th wave starting at wave 5
    if (wave >= 5 && (wave - 5) % 4 === 0) {
      return Object.assign({}, cfg, { challengeStage: true });
    }
    return Object.assign({}, cfg);
  }

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var scoreEl = document.getElementById('score');
  var livesEl = document.getElementById('lives');
  var waveEl = document.getElementById('wave');
  var statusEl = document.getElementById('status-msg');

  function buildEnemies(variant) {
    variant = variant || 'classic';
    var enemies = [];
    for (var row = 0; row < ENEMY_ROWS; row++) {
      for (var col = 0; col < ENEMY_COLS; col++) {
        var x = ENEMY_START_X + col * (ENEMY_W + ENEMY_PAD_X);
        var y = ENEMY_START_Y + row * (ENEMY_H + ENEMY_PAD_Y);
        if (variant === 'v-shape') {
          var midCol = Math.floor(ENEMY_COLS / 2);
          y += Math.abs(col - midCol) * 6;
        }
        enemies.push({
          row: row,
          col: col,
          x: x,
          y: y,
          alive: true,
          type: row < 1 ? 2 : row < 3 ? 1 : 0
        });
      }
    }
    return enemies;
  }

  function buildShields() {
    var shields = [];
    var totalShieldW = SHIELD_COLS * SHIELD_CELL_W;
    var spacing = (WIDTH - SHIELD_COUNT * totalShieldW) / (SHIELD_COUNT + 1);
    for (var i = 0; i < SHIELD_COUNT; i++) {
      shields.push({
        x: spacing + i * (totalShieldW + spacing),
        y: SHIELD_Y,
        cells: new Array(SHIELD_ROWS * SHIELD_COLS).fill(3)
      });
    }
    return shields;
  }

  function spawnBoss() {
    var cx = WIDTH / 2 - BOSS_W / 2;
    return {
      x: cx,
      startX: cx,
      y: BOSS_Y,
      hp: 2,
      alive: true,
      age: 0,
      flashTimer: 0,
      beamTimer: BOSS_BEAM_INTERVAL,
      beam: null
    };
  }

  function initialState() {
    return {
      player: { x: WIDTH / 2 - PLAYER_WIDTH / 2 },
      bullets: [],
      enemyBullets: [],
      enemies: buildEnemies(),
      shields: buildShields(),
      score: 0,
      lives: 3,
      wave: 1,
      status: 'playing',
      enemyDir: 1,
      enemyDropPending: false,
      enemyMoveTimer: 60,
      bulletCooldown: 0,
      enemyFireTimer: FIRE_COOLDOWN_MIN,
      rngSeed: 12345,
      deathTimer: 0,
      // Galaga features
      waveConfig: null,
      ufo: null,
      ufoSpawnTimer: 0,
      diveBombers: [],
      diveBomberCooldown: 0,
      boss: null
    };
  }

  var state = initialState();
  var autoStep = true;
  var rafId = null;
  var accumulator = 0;
  var lastTime = 0;

  var keys = { left: false, right: false, fire: false };

  function aliveCount() {
    var n = 0;
    for (var i = 0; i < state.enemies.length; i++) {
      if (state.enemies[i].alive) n++;
    }
    // Count in-flight dive bombers so launching one doesn't spuriously
    // accelerate the formation (their source slot is marked alive=false)
    for (var di = 0; di < state.diveBombers.length; di++) {
      if (state.diveBombers[di].alive) n++;
    }
    return n;
  }

  function allClear() {
    // aliveCount() already includes alive dive bombers, so no separate
    // diveBombers.length check needed (dead-but-not-yet-spliced bombers
    // have alive=false and are excluded from the count)
    return aliveCount() === 0
      && (!state.boss || !state.boss.alive);
  }

  function rng() {
    state.rngSeed = (Math.imul(1664525, state.rngSeed) + 1013904223) >>> 0;
    return state.rngSeed / 0x100000000;
  }

  function rectOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function bulletHitsShield(bx, by, bw, bh) {
    for (var si = 0; si < state.shields.length; si++) {
      var sh = state.shields[si];
      for (var ci = 0; ci < sh.cells.length; ci++) {
        if (sh.cells[ci] <= 0) continue;
        var cr = Math.floor(ci / SHIELD_COLS);
        var cc = ci % SHIELD_COLS;
        var cx = sh.x + cc * SHIELD_CELL_W;
        var cy = sh.y + cr * SHIELD_CELL_H;
        if (rectOverlap(bx, by, bw, bh, cx, cy, SHIELD_CELL_W, SHIELD_CELL_H)) {
          sh.cells[ci]--;
          return true;
        }
      }
    }
    return false;
  }

  function updateUfo(dt) {
    var cfg = state.waveConfig;
    if (!cfg) return;

    if (!state.ufo) {
      state.ufoSpawnTimer++;
      if (state.ufoSpawnTimer >= cfg.ufoInterval) {
        var dir = rng() < 0.5 ? 1 : -1;
        var startX = dir > 0 ? -UFO_W : WIDTH + UFO_W;
        var pts = UFO_SCORES[Math.floor(rng() * UFO_SCORES.length)];
        state.ufo = { x: startX, y: UFO_Y, dir: dir, speed: cfg.ufoSpeed, pointValue: pts };
        state.ufoSpawnTimer = 0;
      }
      return;
    }

    state.ufo.x += state.ufo.dir * state.ufo.speed * dt;
    if (state.ufo.dir > 0 && state.ufo.x > WIDTH + UFO_W) state.ufo = null;
    if (state.ufo.dir < 0 && state.ufo.x < -UFO_W) state.ufo = null;
  }

  function updateDiveBombers(dt) {
    var cfg = state.waveConfig;
    if (!cfg || cfg.diveBombers === 0) return;

    // Launch new dive bomber if conditions allow.
    // Count only alive bombers — dead ones awaiting splice must not block a launch.
    var liveDivers = 0;
    for (var j = 0; j < state.diveBombers.length; j++) {
      if (state.diveBombers[j].alive) liveDivers++;
    }
    if (state.diveBomberCooldown > 0) {
      state.diveBomberCooldown--;
    } else if (liveDivers < cfg.diveBombers) {
      // Candidates: alive row-0 enemies
      var candidates = [];
      for (var i = 0; i < ENEMY_COLS; i++) {
        var e = state.enemies[i]; // row 0 = indices 0..10
        if (e && e.alive) candidates.push({ enemy: e, idx: i });
      }
      if (candidates.length > 0) {
        var pick = candidates[Math.floor(rng() * candidates.length)];
        pick.enemy.alive = false;
        state.diveBombers.push({
          x: pick.enemy.x,
          y: pick.enemy.y,
          sourceIdx: pick.idx,
          originX: pick.enemy.x,
          originY: pick.enemy.y,
          phase: 'dive',
          age: 0,
          alive: true
        });
        state.diveBomberCooldown = cfg.diveBomberCooldown + Math.floor(rng() * 120);
      } else {
        // No row-0 candidates; retry after a short delay instead of spinning
        state.diveBomberCooldown = 60;
      }
    }

    // Update active dive bombers
    for (var di = state.diveBombers.length - 1; di >= 0; di--) {
      var db = state.diveBombers[di];
      if (!db.alive) { state.diveBombers.splice(di, 1); continue; }

      db.age++;

      if (db.phase === 'dive') {
        var targetX = state.player.x + PLAYER_WIDTH / 2 - ENEMY_W / 2;
        var targetY = PLAYER_Y - ENEMY_H;
        var dx = targetX - db.x;
        var dy = targetY - db.y;
        var dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 10 || db.y >= targetY) {
          // Check player contact at the moment of transition so the hit
          // is not missed when the phase flips before the external contact loop
          if (rectOverlap(db.x, db.y, ENEMY_W, ENEMY_H,
                          state.player.x, PLAYER_Y, PLAYER_WIDTH, PLAYER_HEIGHT)) {
            db.alive = false;
            db.phase = 'return'; // keep consistent state before lives check
            state.lives--;
            if (state.lives <= 0) { state.lives = 0; state.status = 'gameover'; return; }
            state.deathTimer = DEATH_TIMER_FRAMES;
            state.bullets = [];
            continue;
          }
          db.phase = 'return';
        } else {
          var norm = DIVE_SPEED * dt / dist;
          db.x += dx * norm + Math.sin(db.age * 0.15) * 40 * dt;
          db.y += dy * norm;
        }
      } else {
        var odx = db.originX - db.x;
        var ody = db.originY - db.y;
        var odist = Math.sqrt(odx * odx + ody * ody);

        if (odist < 6) {
          // Returned to formation slot
          var src = state.enemies[db.sourceIdx];
          if (src) { src.alive = true; src.x = db.originX; src.y = db.originY; }
          state.diveBombers.splice(di, 1);
        } else {
          var rnorm = RETURN_SPEED * dt / odist;
          db.x += odx * rnorm;
          db.y += ody * rnorm;
        }
      }
    }
  }

  function updateBoss(dt) {
    var boss = state.boss;
    if (!boss || !boss.alive) return;

    // Position-based oscillation anchored to spawn center so the boss
    // never drifts or gets pinned against a wall by the clamp
    boss.age++;
    boss.x = Math.max(0, Math.min(WIDTH - BOSS_W,
      boss.startX + 20 * Math.sin(boss.age * 0.05)));

    if (boss.flashTimer > 0) boss.flashTimer--;

    // Tractor beam — only fire once the previous beam has cleared
    boss.beamTimer--;
    if (boss.beamTimer <= 0 && (!boss.beam || !boss.beam.active)) {
      boss.beam = {
        x: boss.x + BOSS_W / 2 - BOSS_BEAM_W / 2,
        y: boss.y + BOSS_H,
        active: true
      };
      boss.beamTimer = BOSS_BEAM_INTERVAL + Math.floor(rng() * 120);
    }

    if (boss.beam && boss.beam.active) {
      boss.beam.x = boss.x + BOSS_W / 2 - BOSS_BEAM_W / 2;
      boss.beam.y += BOSS_BEAM_SPEED * dt;
      if (boss.beam.y > HEIGHT) boss.beam.active = false;
    }
  }

  function step(dt) {
    if (state.status === 'gameover') return;

    if (state.deathTimer > 0) {
      state.deathTimer--;
      return;
    }

    // Lazy-init wave config
    if (!state.waveConfig) state.waveConfig = getWaveConfig(state.wave);
    var cfg = state.waveConfig;
    var isChallenge = cfg && cfg.challengeStage;

    // Move player
    var px = state.player.x;
    if (keys.left) px -= PLAYER_SPEED * dt;
    if (keys.right) px += PLAYER_SPEED * dt;
    px = Math.max(0, Math.min(WIDTH - PLAYER_WIDTH, px));
    state.player.x = px;

    // Player fire
    if (state.bulletCooldown > 0) state.bulletCooldown--;
    if (keys.fire && state.bulletCooldown === 0) {
      state.bullets.push({
        x: state.player.x + PLAYER_WIDTH / 2 - BULLET_W / 2,
        y: PLAYER_Y - BULLET_H
      });
      state.bulletCooldown = BULLET_COOLDOWN;
    }

    // Move player bullets
    for (var i = state.bullets.length - 1; i >= 0; i--) {
      state.bullets[i].y -= BULLET_SPEED * dt;
      if (state.bullets[i].y + BULLET_H < 0) {
        state.bullets.splice(i, 1);
      }
    }

    // Enemy movement (interval shrinks as enemies die: faster at low count)
    state.enemyMoveTimer--;
    if (state.enemyMoveTimer <= 0) {
      state.enemyMoveTimer = Math.max(4, Math.round(60 - aliveCount() * ENEMY_SPEED_SCALE));

      if (state.enemyDropPending) {
        for (var e = 0; e < state.enemies.length; e++) {
          if (state.enemies[e].alive) {
            state.enemies[e].y += ENEMY_DROP_PX;
          }
        }
        // Keep dive bomber return targets in sync with the dropped formation
        for (var di = 0; di < state.diveBombers.length; di++) {
          state.diveBombers[di].originY += ENEMY_DROP_PX;
        }
        state.enemyDir = -state.enemyDir;
        state.enemyDropPending = false;
      } else {
        var dx = ENEMY_STEP_PX * state.enemyDir;
        var hitWall = false;
        for (var e = 0; e < state.enemies.length; e++) {
          if (state.enemies[e].alive) {
            state.enemies[e].x += dx;
            if (state.enemyDir > 0 && state.enemies[e].x + ENEMY_W >= WIDTH) hitWall = true;
            if (state.enemyDir < 0 && state.enemies[e].x <= 0) hitWall = true;
          }
        }
        // Keep dive bomber return targets in sync with horizontal formation drift
        for (var di = 0; di < state.diveBombers.length; di++) {
          state.diveBombers[di].originX += dx;
        }
        if (hitWall) state.enemyDropPending = true;
      }
    }

    // Check if any enemy reached the bottom
    for (var e = 0; e < state.enemies.length; e++) {
      if (state.enemies[e].alive && state.enemies[e].y + ENEMY_H >= PLAYER_Y) {
        state.status = 'gameover';
        return;
      }
    }

    // Galaga systems
    updateDiveBombers(dt);
    updateUfo(dt);
    updateBoss(dt);

    // Enemy fire (skip entirely for challenge stage)
    if (!isChallenge) {
      state.enemyFireTimer--;
      if (state.enemyFireTimer <= 0) {
        var colShooters = [];
        for (var col = 0; col < ENEMY_COLS; col++) {
          for (var row = ENEMY_ROWS - 1; row >= 0; row--) {
            var idx = row * ENEMY_COLS + col;
            if (idx < state.enemies.length && state.enemies[idx].alive) {
              colShooters.push(state.enemies[idx]);
              break;
            }
          }
        }
        if (colShooters.length > 0) {
          var shooter = colShooters[Math.floor(rng() * colShooters.length)];
          var isZigzag = cfg && rng() < cfg.zigzagChance;
          state.enemyBullets.push({
            x: shooter.x + ENEMY_W / 2 - ENEMY_BULLET_W / 2,
            y: shooter.y + ENEMY_H,
            zigzag: isZigzag,
            age: 0
          });
        }
        var scale = (cfg && cfg.fireRateScale) || 1.0;
        state.enemyFireTimer = Math.round(FIRE_COOLDOWN_MIN / scale)
          + Math.floor(rng() * Math.round(FIRE_COOLDOWN_RANGE / scale));
      }
    }

    // Move enemy bullets
    for (var i = state.enemyBullets.length - 1; i >= 0; i--) {
      var eb = state.enemyBullets[i];
      eb.y += ENEMY_BULLET_SPEED * dt;
      if (eb.zigzag) {
        eb.age = (eb.age || 0) + 1;
        eb.x += Math.sin(eb.age * 0.2) * 1.8;
      }
      if (eb.y > HEIGHT) {
        state.enemyBullets.splice(i, 1);
      }
    }

    // Player bullet vs formation enemy collision
    var scoreMultiplier = isChallenge ? 2 : 1;
    for (var bi = state.bullets.length - 1; bi >= 0; bi--) {
      var b = state.bullets[bi];
      var hit = false;
      for (var ei = 0; ei < state.enemies.length; ei++) {
        var en = state.enemies[ei];
        if (!en.alive) continue;
        if (rectOverlap(b.x, b.y, BULLET_W, BULLET_H, en.x, en.y, ENEMY_W, ENEMY_H)) {
          en.alive = false;
          state.score += (SCORE_BY_ROW[en.row] || 10) * scoreMultiplier;
          hit = true;
          break;
        }
      }
      if (hit) { state.bullets.splice(bi, 1); continue; }
    }

    // Player bullet vs dive bomber
    for (var bi = state.bullets.length - 1; bi >= 0; bi--) {
      var b = state.bullets[bi];
      var hit = false;
      for (var di = 0; di < state.diveBombers.length; di++) {
        var db = state.diveBombers[di];
        if (!db.alive) continue;
        if (rectOverlap(b.x, b.y, BULLET_W, BULLET_H, db.x, db.y, ENEMY_W, ENEMY_H)) {
          db.alive = false;
          state.score += DIVE_BOMBER_SCORE * scoreMultiplier;
          hit = true;
          break;
        }
      }
      if (hit) { state.bullets.splice(bi, 1); continue; }
    }

    // Player bullet vs UFO
    if (state.ufo) {
      for (var bi = state.bullets.length - 1; bi >= 0; bi--) {
        var b = state.bullets[bi];
        if (rectOverlap(b.x, b.y, BULLET_W, BULLET_H,
                        state.ufo.x, state.ufo.y, UFO_W, UFO_H)) {
          state.score += state.ufo.pointValue * scoreMultiplier;
          state.ufo = null;
          state.bullets.splice(bi, 1);
          break;
        }
      }
    }

    // Player bullet vs boss
    if (state.boss && state.boss.alive) {
      for (var bi = state.bullets.length - 1; bi >= 0; bi--) {
        var b = state.bullets[bi];
        if (rectOverlap(b.x, b.y, BULLET_W, BULLET_H,
                        state.boss.x, state.boss.y, BOSS_W, BOSS_H)) {
          state.boss.hp--;
          state.bullets.splice(bi, 1);
          if (state.boss.hp <= 0) {
            state.boss.alive = false;
            if (state.boss.beam) state.boss.beam.active = false;
            state.score += BOSS_SCORE * scoreMultiplier;
          } else {
            state.boss.flashTimer = 20;
          }
          break;
        }
      }
    }

    // Player bullet vs shield
    for (var bi = state.bullets.length - 1; bi >= 0; bi--) {
      var b = state.bullets[bi];
      if (bulletHitsShield(b.x, b.y, BULLET_W, BULLET_H)) state.bullets.splice(bi, 1);
    }

    // Enemy bullet vs shield
    for (var bi = state.enemyBullets.length - 1; bi >= 0; bi--) {
      var b = state.enemyBullets[bi];
      if (bulletHitsShield(b.x, b.y, ENEMY_BULLET_W, ENEMY_BULLET_H)) state.enemyBullets.splice(bi, 1);
    }

    // Enemy bullet vs player
    for (var bi = state.enemyBullets.length - 1; bi >= 0; bi--) {
      var b = state.enemyBullets[bi];
      if (rectOverlap(b.x, b.y, ENEMY_BULLET_W, ENEMY_BULLET_H,
                      state.player.x, PLAYER_Y, PLAYER_WIDTH, PLAYER_HEIGHT)) {
        state.enemyBullets.splice(bi, 1);
        state.lives--;
        if (state.lives <= 0) {
          state.lives = 0;
          state.status = 'gameover';
          return;
        }
        state.deathTimer = DEATH_TIMER_FRAMES;
        state.bullets = [];
        break;
      }
    }

    // Boss beam vs player
    if (state.boss && state.boss.alive && state.boss.beam && state.boss.beam.active) {
      var beam = state.boss.beam;
      if (rectOverlap(beam.x, beam.y, BOSS_BEAM_W, 40,
                      state.player.x, PLAYER_Y, PLAYER_WIDTH, PLAYER_HEIGHT)) {
        beam.active = false;
        state.lives--;
        if (state.lives <= 0) {
          state.lives = 0;
          state.status = 'gameover';
          return;
        }
        state.deathTimer = 90; // longer stun — Galaga capture spirit
        state.bullets = [];
      }
    }

    // Dive bomber contact vs player
    for (var di = state.diveBombers.length - 1; di >= 0; di--) {
      var db = state.diveBombers[di];
      if (!db.alive || db.phase !== 'dive') continue;
      if (rectOverlap(db.x, db.y, ENEMY_W, ENEMY_H,
                      state.player.x, PLAYER_Y, PLAYER_WIDTH, PLAYER_HEIGHT)) {
        db.alive = false;
        state.lives--;
        if (state.lives <= 0) {
          state.lives = 0;
          state.status = 'gameover';
          return;
        }
        state.deathTimer = DEATH_TIMER_FRAMES;
        state.bullets = [];
        break;
      }
    }

    // Wave advance
    if (allClear()) {
      state.wave++;
      state.waveConfig = getWaveConfig(state.wave);
      state.enemies = buildEnemies(state.waveConfig.formation);
      state.diveBombers = [];
      state.diveBomberCooldown = state.waveConfig.diveBomberCooldown;
      state.ufo = null;
      state.ufoSpawnTimer = 0;
      state.boss = state.waveConfig.hasBoss ? spawnBoss() : null;
      if (state.waveConfig.shieldsReset) state.shields = buildShields();
      state.enemyDir = 1;
      state.enemyDropPending = false;
      state.enemyMoveTimer = 60;
      var initScale = (state.waveConfig && state.waveConfig.fireRateScale) || 1.0;
      state.enemyFireTimer = Math.round(FIRE_COOLDOWN_MIN / initScale)
        + Math.floor(rng() * Math.round(FIRE_COOLDOWN_RANGE / initScale));
      state.bullets = [];
      state.enemyBullets = [];
    }
  }

  function updateHud() {
    scoreEl.textContent = state.score;
    livesEl.textContent = state.lives;
    waveEl.textContent = state.wave;
    if (state.status === 'gameover') {
      statusEl.textContent = 'Game Over — Press R to restart';
    } else if (state.deathTimer > 0) {
      statusEl.textContent = 'Hit!';
    } else {
      statusEl.textContent = '';
    }
  }

  function draw() {
    ctx.fillStyle = '#000a1a';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    if (state.status === 'gameover') {
      ctx.fillStyle = '#22d3ee';
      ctx.font = 'bold 32px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', WIDTH / 2, HEIGHT / 2 - 20);
      ctx.font = '16px monospace';
      ctx.fillStyle = '#a0e0ff';
      ctx.fillText('Score: ' + state.score, WIDTH / 2, HEIGHT / 2 + 16);
      ctx.fillText('Press R or tap Restart', WIDTH / 2, HEIGHT / 2 + 42);
      return;
    }

    // Challenge stage banner
    var cfg = state.waveConfig || getWaveConfig(state.wave);
    if (cfg && cfg.challengeStage) {
      ctx.fillStyle = 'rgba(250,204,21,0.15)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.font = 'bold 18px monospace';
      ctx.fillStyle = '#facc15';
      ctx.textAlign = 'center';
      ctx.fillText('★ CHALLENGE STAGE — 2× POINTS ★', WIDTH / 2, 22);
    }

    // Draw shields
    for (var si = 0; si < state.shields.length; si++) {
      var sh = state.shields[si];
      for (var ci = 0; ci < sh.cells.length; ci++) {
        var hp = sh.cells[ci];
        if (hp <= 0) continue;
        var alpha = 0.35 + (hp / 3) * 0.65;
        ctx.fillStyle = 'rgba(34,200,80,' + alpha + ')';
        var cr = Math.floor(ci / SHIELD_COLS);
        var cc = ci % SHIELD_COLS;
        ctx.fillRect(sh.x + cc * SHIELD_CELL_W, sh.y + cr * SHIELD_CELL_H, SHIELD_CELL_W - 1, SHIELD_CELL_H - 1);
      }
    }

    // Draw formation enemies
    for (var ei = 0; ei < state.enemies.length; ei++) {
      var en = state.enemies[ei];
      if (!en.alive) continue;
      switch (en.type) {
        case 2: ctx.fillStyle = '#f87171'; break;
        case 1: ctx.fillStyle = '#a78bfa'; break;
        default: ctx.fillStyle = '#60a5fa';
      }
      drawEnemy(ctx, en.x, en.y, ENEMY_W, ENEMY_H, en.type);
    }

    // Draw boss
    if (state.boss && state.boss.alive) {
      var boss = state.boss;
      var bossAlpha = (boss.flashTimer > 0 && Math.floor(boss.flashTimer / 4) % 2 === 0) ? 0.4 : 1.0;
      ctx.globalAlpha = bossAlpha;
      ctx.fillStyle = '#facc15';
      drawBoss(ctx, boss.x, boss.y, BOSS_W, BOSS_H);
      ctx.globalAlpha = 1.0;

      // Boss beam
      if (boss.beam && boss.beam.active) {
        ctx.fillStyle = 'rgba(250,204,21,0.6)';
        ctx.fillRect(boss.beam.x, boss.beam.y, BOSS_BEAM_W, 40);
        ctx.fillStyle = 'rgba(250,204,21,0.2)';
        ctx.fillRect(boss.beam.x - 4, boss.beam.y, BOSS_BEAM_W + 8, 40);
      }
    }

    // Draw dive bombers (same shape as type-2 enemies, in orange to distinguish)
    for (var di = 0; di < state.diveBombers.length; di++) {
      var db = state.diveBombers[di];
      if (!db.alive) continue;
      ctx.fillStyle = '#fb923c';
      drawEnemy(ctx, db.x, db.y, ENEMY_W, ENEMY_H, 2);
    }

    // Draw UFO
    if (state.ufo) {
      ctx.fillStyle = '#facc15';
      drawUfo(ctx, state.ufo.x, state.ufo.y, UFO_W, UFO_H);
    }

    // Draw player bullets
    ctx.fillStyle = '#fbbf24';
    for (var i = 0; i < state.bullets.length; i++) {
      ctx.fillRect(state.bullets[i].x, state.bullets[i].y, BULLET_W, BULLET_H);
    }

    // Draw enemy bullets (zigzag bullets are brighter red)
    for (var i = 0; i < state.enemyBullets.length; i++) {
      var eb = state.enemyBullets[i];
      ctx.fillStyle = eb.zigzag ? '#ff4444' : '#f87171';
      ctx.fillRect(eb.x, eb.y, ENEMY_BULLET_W, ENEMY_BULLET_H);
    }

    // Draw player
    var flashOff = state.deathTimer > 0 && Math.floor(state.deathTimer / DEATH_FLASH_PERIOD) % 2 === 0;
    if (!flashOff) {
      ctx.fillStyle = '#22d3ee';
      drawPlayer(ctx, state.player.x, PLAYER_Y, PLAYER_WIDTH, PLAYER_HEIGHT);
    }

    // Ground line
    ctx.strokeStyle = 'rgba(34,211,238,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, PLAYER_Y + PLAYER_HEIGHT + 4);
    ctx.lineTo(WIDTH, PLAYER_Y + PLAYER_HEIGHT + 4);
    ctx.stroke();
  }

  function drawPlayer(ctx, x, y, w, h) {
    ctx.fillRect(x + w * 0.4, y, w * 0.2, h * 0.35);
    ctx.fillRect(x + w * 0.15, y + h * 0.3, w * 0.7, h * 0.45);
    ctx.fillRect(x, y + h * 0.65, w, h * 0.35);
  }

  function drawEnemy(ctx, x, y, w, h, type) {
    if (type === 2) {
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h * 0.45, w * 0.45, h * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x + w * 0.25, y, w * 0.5, h * 0.35);
    } else if (type === 1) {
      ctx.fillRect(x + w * 0.1, y + h * 0.1, w * 0.8, h * 0.6);
      ctx.fillRect(x, y + h * 0.4, w * 0.15, h * 0.45);
      ctx.fillRect(x + w * 0.85, y + h * 0.4, w * 0.15, h * 0.45);
      ctx.fillRect(x + w * 0.2, y + h * 0.7, w * 0.15, h * 0.3);
      ctx.fillRect(x + w * 0.65, y + h * 0.7, w * 0.15, h * 0.3);
    } else {
      ctx.fillRect(x + w * 0.2, y, w * 0.6, h * 0.5);
      ctx.fillRect(x, y + h * 0.3, w, h * 0.4);
      ctx.fillRect(x + w * 0.1, y + h * 0.65, w * 0.2, h * 0.35);
      ctx.fillRect(x + w * 0.7, y + h * 0.65, w * 0.2, h * 0.35);
    }
  }

  function drawBoss(ctx, x, y, w, h) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h * 0.55, w * 0.42, h * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x + w * 0.25, y, w * 0.5, h * 0.4);
    ctx.fillRect(x - w * 0.18, y + h * 0.4, w * 0.22, h * 0.3);
    ctx.fillRect(x + w * 0.96, y + h * 0.4, w * 0.22, h * 0.3);
    ctx.fillStyle = '#000a1a';
    for (var li = 0; li < 3; li++) {
      ctx.fillRect(x + w * (0.28 + li * 0.17), y + h * 0.1, w * 0.1, h * 0.18);
    }
    ctx.restore();
  }

  function drawUfo(ctx, x, y, w, h) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h * 0.6, w * 0.48, h * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x + w * 0.2, y, w * 0.6, h * 0.45);
    ctx.fillStyle = '#000a1a';
    for (var li = 0; li < 3; li++) {
      ctx.fillRect(x + w * (0.27 + li * 0.18), y + h * 0.08, w * 0.1, h * 0.18);
    }
    ctx.restore();
  }

  function frame(timestamp) {
    rafId = requestAnimationFrame(frame);
    if (!lastTime) lastTime = timestamp;
    var elapsed = Math.min((timestamp - lastTime) / 1000, 0.1);
    lastTime = timestamp;

    if (autoStep) {
      accumulator += elapsed;
      while (accumulator >= FIXED_DT) {
        step(FIXED_DT);
        accumulator -= FIXED_DT;
      }
    }

    updateHud();
    draw();
  }

  function restart() {
    state = initialState();
    accumulator = 0;
    lastTime = 0;
  }

  // Keyboard input
  window.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { e.preventDefault(); keys.left = true; }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { e.preventDefault(); keys.right = true; }
    if (e.key === ' ') { e.preventDefault(); keys.fire = true; }
    if (e.key === 'r' || e.key === 'R') { e.preventDefault(); restart(); }
  });

  window.addEventListener('keyup', function (e) {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
    if (e.key === ' ') keys.fire = false;
  });

  // Touch / button input
  function bindBtn(id, key) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      keys[key] = true;
      el.classList.add('pressed');
    });
    var up = function () {
      keys[key] = false;
      el.classList.remove('pressed');
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
  }

  bindBtn('btn-left', 'left');
  bindBtn('btn-right', 'right');
  bindBtn('btn-fire', 'fire');

  document.getElementById('btn-restart').addEventListener('click', restart);

  // Start
  rafId = requestAnimationFrame(frame);

  // Test API
  window.__spaceInvadersTest = {
    isReady: true,

    getState: function () {
      return JSON.parse(JSON.stringify(state));
    },

    setState: function (patch) {
      Object.assign(state, patch);
    },

    advanceFrames: function (n) {
      for (var i = 0; i < n; i++) step(FIXED_DT);
    },

    setAutoStep: function (enabled) {
      autoStep = enabled;
    },

    restart: restart,

    getControlsState: function () {
      return { left: keys.left, right: keys.right, fire: keys.fire };
    }
  };
})();
