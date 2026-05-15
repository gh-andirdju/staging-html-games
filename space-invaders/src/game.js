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

  var SHIELD_COUNT = 4;
  var SHIELD_COLS = 4;
  var SHIELD_ROWS = 3;
  var SHIELD_CELL_W = 10;
  var SHIELD_CELL_H = 8;
  var SHIELD_Y = PLAYER_Y - 60;

  var SCORE_BY_ROW = [30, 20, 20, 10, 10];

  var DEATH_TIMER_FRAMES = 60;
  var DEATH_FLASH_PERIOD = 6;

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var scoreEl = document.getElementById('score');
  var livesEl = document.getElementById('lives');
  var waveEl = document.getElementById('wave');
  var statusEl = document.getElementById('status-msg');

  function buildEnemies() {
    var enemies = [];
    for (var row = 0; row < ENEMY_ROWS; row++) {
      for (var col = 0; col < ENEMY_COLS; col++) {
        enemies.push({
          row: row,
          col: col,
          x: ENEMY_START_X + col * (ENEMY_W + ENEMY_PAD_X),
          y: ENEMY_START_Y + row * (ENEMY_H + ENEMY_PAD_Y),
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
      enemyMoveTimer: 0,
      bulletCooldown: 0,
      enemyFireTimer: 80,
      rngSeed: 12345,
      deathTimer: 0
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
    return n;
  }

  function rng() {
    state.rngSeed = (Math.imul(1664525, state.rngSeed) + 1013904223) >>> 0;
    return state.rngSeed / 0x100000000;
  }

  function rectOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function step(dt) {
    if (state.status === 'gameover' || state.status === 'won') return;

    if (state.deathTimer > 0) {
      state.deathTimer--;
      return;
    }

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
      state.enemyMoveTimer = Math.max(4, Math.round(60 - aliveCount() * 0.9));

      if (state.enemyDropPending) {
        // Drop enemies down and flip direction
        for (var e = 0; e < state.enemies.length; e++) {
          if (state.enemies[e].alive) {
            state.enemies[e].y += ENEMY_DROP_PX;
          }
        }
        state.enemyDir = -state.enemyDir;
        state.enemyDropPending = false;
      } else {
        // Move horizontally
        var dx = ENEMY_STEP_PX * state.enemyDir;
        var hitWall = false;
        for (var e = 0; e < state.enemies.length; e++) {
          if (state.enemies[e].alive) {
            state.enemies[e].x += dx;
            if (state.enemyDir > 0 && state.enemies[e].x + ENEMY_W >= WIDTH) hitWall = true;
            if (state.enemyDir < 0 && state.enemies[e].x <= 0) hitWall = true;
          }
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

    // Enemy fire
    state.enemyFireTimer--;
    if (state.enemyFireTimer <= 0) {
      var aliveCols = [];
      for (var col = 0; col < ENEMY_COLS; col++) {
        var colHasAlive = false;
        for (var row = ENEMY_ROWS - 1; row >= 0; row--) {
          var idx = row * ENEMY_COLS + col;
          if (idx < state.enemies.length && state.enemies[idx].alive) {
            colHasAlive = true;
            break;
          }
        }
        if (colHasAlive) aliveCols.push(col);
      }
      if (aliveCols.length > 0) {
        var chosenCol = aliveCols[Math.floor(rng() * aliveCols.length)];
        // Find the bottom-most alive enemy in that column
        var shooter = null;
        for (var row = ENEMY_ROWS - 1; row >= 0; row--) {
          var idx = row * ENEMY_COLS + chosenCol;
          if (idx < state.enemies.length && state.enemies[idx].alive) {
            shooter = state.enemies[idx];
            break;
          }
        }
        if (shooter) {
          state.enemyBullets.push({
            x: shooter.x + ENEMY_W / 2 - ENEMY_BULLET_W / 2,
            y: shooter.y + ENEMY_H
          });
        }
      }
      var range = FIRE_COOLDOWN_MAX - FIRE_COOLDOWN_MIN;
      state.enemyFireTimer = FIRE_COOLDOWN_MIN + Math.floor(rng() * range);
    }

    // Move enemy bullets
    for (var i = state.enemyBullets.length - 1; i >= 0; i--) {
      state.enemyBullets[i].y += ENEMY_BULLET_SPEED * dt;
      if (state.enemyBullets[i].y > HEIGHT) {
        state.enemyBullets.splice(i, 1);
      }
    }

    // Player bullet vs enemy collision
    for (var bi = state.bullets.length - 1; bi >= 0; bi--) {
      var b = state.bullets[bi];
      var hit = false;
      for (var ei = 0; ei < state.enemies.length; ei++) {
        var en = state.enemies[ei];
        if (!en.alive) continue;
        if (rectOverlap(b.x, b.y, BULLET_W, BULLET_H, en.x, en.y, ENEMY_W, ENEMY_H)) {
          en.alive = false;
          state.score += SCORE_BY_ROW[en.row] || 10;
          hit = true;
          break;
        }
      }
      if (hit) state.bullets.splice(bi, 1);
    }

    // Player bullet vs shield collision
    for (var bi = state.bullets.length - 1; bi >= 0; bi--) {
      var b = state.bullets[bi];
      var hit = false;
      for (var si = 0; si < state.shields.length && !hit; si++) {
        var sh = state.shields[si];
        for (var ci = 0; ci < sh.cells.length && !hit; ci++) {
          if (sh.cells[ci] <= 0) continue;
          var cr = Math.floor(ci / SHIELD_COLS);
          var cc = ci % SHIELD_COLS;
          var cx = sh.x + cc * SHIELD_CELL_W;
          var cy = sh.y + cr * SHIELD_CELL_H;
          if (rectOverlap(b.x, b.y, BULLET_W, BULLET_H, cx, cy, SHIELD_CELL_W, SHIELD_CELL_H)) {
            sh.cells[ci]--;
            hit = true;
          }
        }
      }
      if (hit) state.bullets.splice(bi, 1);
    }

    // Enemy bullet vs shield collision
    for (var bi = state.enemyBullets.length - 1; bi >= 0; bi--) {
      var b = state.enemyBullets[bi];
      var hit = false;
      for (var si = 0; si < state.shields.length && !hit; si++) {
        var sh = state.shields[si];
        for (var ci = 0; ci < sh.cells.length && !hit; ci++) {
          if (sh.cells[ci] <= 0) continue;
          var cr = Math.floor(ci / SHIELD_COLS);
          var cc = ci % SHIELD_COLS;
          var cx = sh.x + cc * SHIELD_CELL_W;
          var cy = sh.y + cr * SHIELD_CELL_H;
          if (rectOverlap(b.x, b.y, ENEMY_BULLET_W, ENEMY_BULLET_H, cx, cy, SHIELD_CELL_W, SHIELD_CELL_H)) {
            sh.cells[ci]--;
            hit = true;
          }
        }
      }
      if (hit) state.enemyBullets.splice(bi, 1);
    }

    // Enemy bullet vs player collision
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
      }
    }

    // Check win: all enemies dead
    if (aliveCount() === 0) {
      state.wave++;
      state.enemies = buildEnemies();
      state.shields = buildShields();
      state.enemyDir = 1;
      state.enemyDropPending = false;
      state.enemyMoveTimer = 0;
      state.enemyFireTimer = 80;
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

    // Draw enemies
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

    // Draw player bullets
    ctx.fillStyle = '#fbbf24';
    for (var i = 0; i < state.bullets.length; i++) {
      ctx.fillRect(state.bullets[i].x, state.bullets[i].y, BULLET_W, BULLET_H);
    }

    // Draw enemy bullets
    ctx.fillStyle = '#f87171';
    for (var i = 0; i < state.enemyBullets.length; i++) {
      ctx.fillRect(state.enemyBullets[i].x, state.enemyBullets[i].y, ENEMY_BULLET_W, ENEMY_BULLET_H);
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
    // Simple pixel ship shape
    ctx.fillRect(x + w * 0.4, y, w * 0.2, h * 0.35);
    ctx.fillRect(x + w * 0.15, y + h * 0.3, w * 0.7, h * 0.45);
    ctx.fillRect(x, y + h * 0.65, w, h * 0.35);
  }

  function drawEnemy(ctx, x, y, w, h, type) {
    if (type === 2) {
      // Top row: saucer shape
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h * 0.45, w * 0.45, h * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x + w * 0.25, y, w * 0.5, h * 0.35);
    } else if (type === 1) {
      // Mid rows: crab shape
      ctx.fillRect(x + w * 0.1, y + h * 0.1, w * 0.8, h * 0.6);
      ctx.fillRect(x, y + h * 0.4, w * 0.15, h * 0.45);
      ctx.fillRect(x + w * 0.85, y + h * 0.4, w * 0.15, h * 0.45);
      ctx.fillRect(x + w * 0.2, y + h * 0.7, w * 0.15, h * 0.3);
      ctx.fillRect(x + w * 0.65, y + h * 0.7, w * 0.15, h * 0.3);
    } else {
      // Bottom rows: squid shape
      ctx.fillRect(x + w * 0.2, y, w * 0.6, h * 0.5);
      ctx.fillRect(x, y + h * 0.3, w, h * 0.4);
      ctx.fillRect(x + w * 0.1, y + h * 0.65, w * 0.2, h * 0.35);
      ctx.fillRect(x + w * 0.7, y + h * 0.65, w * 0.2, h * 0.35);
    }
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
