(function () {
  "use strict";

  // Invisible build marker — lets a deployed device be checked against committed
  // source via `window.__brickbreakerBuild` (or the <meta> tag in index.html).
  var BUILD_ID = "brickbreaker-serve-2026-06-28.14";
  try { window.__brickbreakerBuild = BUILD_ID; } catch (e) {}

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var livesEl = document.getElementById("lives");
  var levelEl = document.getElementById("level");
  var effectsEl = document.getElementById("effects");
  var statusEl = document.getElementById("status");
  var restartButton = document.getElementById("restart");
  var pauseButton = document.getElementById("pause");
  var muteButton = document.getElementById("mute");
  var helpButton = document.getElementById("help");
  var helpOverlayEl = document.getElementById("help-overlay");
  var helpCloseButton = document.getElementById("help-close");
  var gameShellEl = document.querySelector(".game-shell");
  var paddleDragLane = document.getElementById("paddle-drag-lane");

  var WIDTH = canvas.width;
  var HEIGHT = canvas.height;
  var FIXED_DT = 1 / 60;
  var POWER_UP_TYPES = ["wide", "slow", "life", "multi", "laser", "shield"];
  var POWER_UP_DURATION = {
    wide: 60 * 12,
    slow: 60 * 10,
    laser: 60 * 10
  };
  var PICKUP_SIZE = 18;
  var PICKUP_SPEED = 150;
  var LASER_SPEED = 1100;
  var LASER_COOLDOWN_FRAMES = 18;

  var paddle = {
    width: 112,
    height: 14,
    x: WIDTH / 2 - 56,
    y: HEIGHT - 36,
    speed: 470
  };

  var ballStart = {
    radius: 8,
    x: WIDTH / 2,
    y: HEIGHT - 58,
    dx: 210,
    dy: -260
  };
  var PADDLE_MAX_BOUNCE_ANGLE = Math.PI / 3;
  var BALL_BASE_SPEED = Math.sqrt(ballStart.dx * ballStart.dx + ballStart.dy * ballStart.dy);

  var brickConfig = {
    top: 58,
    sidePadding: 26,
    bottomLimit: 220
  };

  var keys = {
    left: false,
    right: false
  };

  var HIGH_SCORE_KEY = "brickbreaker-high-score";

  function readHighScore() {
    try {
      return Number(window.localStorage.getItem(HIGH_SCORE_KEY)) || 0;
    } catch {
      return 0;
    }
  }

  function writeHighScore(value) {
    try {
      window.localStorage.setItem(HIGH_SCORE_KEY, String(value));
    } catch {}
  }

  var HELP_SEEN_KEY = "brickbreaker-help-seen";

  function hasSeenHelp() {
    try {
      return Boolean(window.localStorage.getItem(HELP_SEEN_KEY));
    } catch {
      return false;
    }
  }

  function markHelpSeen() {
    try {
      window.localStorage.setItem(HELP_SEEN_KEY, "1");
    } catch {}
  }

  var MUTED_KEY = "brickbreaker-muted";

  function createSfx() {
    var AudioContextClass = window.AudioContext || window.webkitAudioContext;
    var muted = readMuted();
    var gestureSeen = false;
    var audioCtx = null;

    function readMuted() {
      try {
        return window.localStorage.getItem(MUTED_KEY) === "1";
      } catch {
        return false;
      }
    }

    function writeMuted(value) {
      try {
        window.localStorage.setItem(MUTED_KEY, value ? "1" : "0");
      } catch {}
    }

    function noteGesture() {
      gestureSeen = true;
    }

    window.addEventListener("pointerdown", noteGesture, { capture: true, passive: true });
    window.addEventListener("keydown", noteGesture, { capture: true });

    function getAudio() {
      if (muted || !gestureSeen || navigator.webdriver || !AudioContextClass) {
        return null;
      }
      if (!audioCtx) {
        try {
          audioCtx = new AudioContextClass();
        } catch {
          return null;
        }
      }
      if (audioCtx.state === "suspended") {
        audioCtx.resume().catch(function () {});
      }
      return audioCtx;
    }

    function tone(startFreq, endFreq, duration, delay, type, peak) {
      var audio = getAudio();
      if (!audio) {
        return;
      }
      try {
        var startAt = audio.currentTime + (delay || 0);
        var osc = audio.createOscillator();
        var gain = audio.createGain();
        osc.type = type || "square";
        osc.frequency.setValueAtTime(startFreq, startAt);
        if (endFreq !== startFreq) {
          osc.frequency.exponentialRampToValueAtTime(endFreq, startAt + duration);
        }
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(peak || 0.1, startAt + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
        osc.connect(gain);
        gain.connect(audio.destination);
        osc.start(startAt);
        osc.stop(startAt + duration + 0.05);
      } catch {}
    }

    return {
      isMuted: function () {
        return muted;
      },
      setMuted: function (value) {
        muted = Boolean(value);
        writeMuted(muted);
      },
      playBrickBreak: function (row) {
        var freq = Math.max(320, 700 - (row || 0) * 45);
        tone(freq, freq, 0.05, 0, "square", 0.08);
      },
      playPaddleHit: function () {
        tone(300, 300, 0.055, 0, "square", 0.09);
      },
      playPickup: function () {
        tone(600, 1100, 0.09, 0, "triangle", 0.1);
      },
      playLifeLost: function () {
        tone(330, 120, 0.15, 0, "sawtooth", 0.1);
      },
      playLevelClear: function () {
        tone(523, 523, 0.06, 0, "triangle", 0.1);
        tone(659, 659, 0.06, 0.07, "triangle", 0.1);
        tone(784, 784, 0.06, 0.14, "triangle", 0.1);
        tone(1047, 1047, 0.1, 0.21, "triangle", 0.1);
      }
    };
  }

  var sfx = createSfx();

  // Haptic feedback — short vibrations on key events for touch devices; on by default,
  // persisted, and a no-op where the Vibration API is unavailable (most desktops).
  var HAPTICS_KEY = "brickbreaker-haptics";

  function readHapticsEnabled() {
    try {
      return window.localStorage.getItem(HAPTICS_KEY) !== "0";
    } catch (e) {
      return true;
    }
  }

  function writeHapticsEnabled(value) {
    try {
      window.localStorage.setItem(HAPTICS_KEY, value ? "1" : "0");
    } catch (e) {}
  }

  var hapticsEnabled = readHapticsEnabled();

  function applyHapticsEnabled(value) {
    hapticsEnabled = Boolean(value);
    writeHapticsEnabled(hapticsEnabled);
    var toggle = document.getElementById("haptics-toggle");
    if (toggle) {
      toggle.checked = hapticsEnabled;
    }
    if (!hapticsEnabled && typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      try { navigator.vibrate(0); } catch (e) {}
    }
  }

  function vibrate(pattern) {
    if (!hapticsEnabled) {
      return;
    }
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") {
      return;
    }
    try {
      navigator.vibrate(pattern);
    } catch (e) {}
  }

  // Themeable accent — drives buttons, borders, and the background glow via CSS
  // custom properties. Amber is the default, so the out-of-the-box look is unchanged.
  var ACCENT_KEY = "brickbreaker-accent";
  var ACCENTS = ["#f59e0b", "#34d2e8", "#ff4d8d", "#46cf6d", "#b05de0"];

  function hexToRgb(hex) {
    var n = String(hex).replace("#", "");
    return {
      r: parseInt(n.slice(0, 2), 16),
      g: parseInt(n.slice(2, 4), 16),
      b: parseInt(n.slice(4, 6), 16)
    };
  }

  function readAccent() {
    try {
      var v = window.localStorage.getItem(ACCENT_KEY);
      return ACCENTS.indexOf(v) >= 0 ? v : ACCENTS[0];
    } catch (e) {
      return ACCENTS[0];
    }
  }

  function applyAccent(hex) {
    var value = ACCENTS.indexOf(hex) >= 0 ? hex : ACCENTS[0];
    var rgb = hexToRgb(value);
    document.documentElement.style.setProperty("--accent", value);
    document.documentElement.style.setProperty("--accent-rgb", rgb.r + ", " + rgb.g + ", " + rgb.b);
    var swatches = document.querySelectorAll(".swatch");
    for (var i = 0; i < swatches.length; i += 1) {
      swatches[i].setAttribute("aria-pressed", swatches[i].dataset.accent === value ? "true" : "false");
    }
    try { window.localStorage.setItem(ACCENT_KEY, value); } catch (e) {}
  }

  // Chosen starting zone (1–10) — higher zones begin faster and with more armored
  // bricks for a tougher run. Mirrors the Tetris start-level selector.
  var START_ZONE_KEY = "brickbreaker-start-zone";
  var MAX_START_ZONE = 10;

  function clampStartZone(value) {
    var n = Math.round(Number(value) || 1);
    return Math.max(1, Math.min(MAX_START_ZONE, n));
  }

  function readStartZone() {
    try {
      return clampStartZone(window.localStorage.getItem(START_ZONE_KEY));
    } catch (e) {
      return 1;
    }
  }

  function writeStartZone(value) {
    try {
      window.localStorage.setItem(START_ZONE_KEY, String(value));
    } catch (e) {}
  }

  var startZone = readStartZone();

  var state;
  var lastTime = 0;
  var autoStep = true;
  var renderTick = 0;
  var activeControlPointerId = null;
  var helpDidPause = false;

  function powerUpLetter(type) {
    if (type === "wide") return "E";
    if (type === "slow") return "S";
    if (type === "laser") return "L";
    if (type === "multi") return "D";
    if (type === "life") return "P";
    if (type === "shield") return "G";
    return "";
  }

  function createSeededRandom(seed) {
    var value = (seed >>> 0) || 1;
    return function () {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }

  function levelSpeedMultiplier(level) {
    return 1 + Math.min(0.42, Math.max(0, level - 1) * 0.035);
  }

  // Combo multiplier: every 3 bricks cleared in a single volley (no paddle touch in
  // between) steps the per-brick score up by 1x, capped at 5x. Rewards skilful
  // multi-brick runs without ballooning the score.
  function comboMultiplier(combo) {
    return Math.min(5, Math.ceil(Math.max(1, combo) / 3));
  }

  // Armored bricks: tougher bricks (more hits to clear) appear in the upper rows as
  // levels climb. Level 1 stays all single-hit so the early game (and the visual
  // baseline) is unchanged; power-up bricks are always single-hit so drops stay
  // reliable and their badge legible.
  function brickHpForLevel(row, level) {
    if (level >= 5 && row === 0) {
      return 3;
    }
    if (level >= 2 && row <= 1) {
      return 2;
    }
    return 1;
  }

  function makeBallStartForLevel(level) {
    var speed = BALL_BASE_SPEED * levelSpeedMultiplier(level);
    var angle = Math.atan2(Math.abs(ballStart.dy), Math.abs(ballStart.dx));
    return {
      radius: ballStart.radius,
      x: ballStart.x,
      y: ballStart.y,
      dx: Math.cos(angle) * speed,
      dy: -Math.sin(angle) * speed
    };
  }

  function buildLevelConfig(level) {
    var difficulty = Math.max(0, level - 1);
    var rows = Math.min(8, 5 + Math.floor(difficulty / 2));
    var cols = Math.min(11, 8 + (difficulty % 4));
    var gap = cols >= 10 ? 6 : 7;
    var height = rows >= 7 ? 18 : 20;
    var availableWidth = WIDTH - brickConfig.sidePadding * 2;
    var width = Math.floor((availableWidth - gap * (cols - 1)) / cols);
    var left = Math.floor((WIDTH - (cols * width + gap * (cols - 1))) / 2);
    var top = brickConfig.top;
    var pattern = difficulty % 5;
    return {
      rows: rows,
      cols: cols,
      width: width,
      height: height,
      gap: gap,
      top: top,
      left: left,
      pattern: pattern,
      density: Math.min(0.88, 0.68 + difficulty * 0.022),
      seed: level * 4099 + rows * 131 + cols * 17
    };
  }

  function shouldActivateBrick(row, col, config, random) {
    var center = (config.cols - 1) / 2;
    var mirroredCol = Math.abs(col - center);
    var waveOffset = (config.seed + row * 3) % config.cols;
    var active = true;

    if (config.pattern === 0) {
      active = (row + col + waveOffset) % 4 !== 1;
    } else if (config.pattern === 1) {
      active = row === 0 || row === config.rows - 1 || mirroredCol > 0.8 || (col + waveOffset) % 3 !== 1;
    } else if (config.pattern === 2) {
      active = mirroredCol <= (config.cols / 2) - (row % 2) || row < 2;
    } else if (config.pattern === 3) {
      active = (col + waveOffset) % 2 === 0 || row % 3 === 0;
    } else {
      active = row < 2 || mirroredCol >= 1 || (row + col + waveOffset) % 5 !== 2;
    }

    if (!active) {
      return false;
    }

    if (row === 0) {
      return true;
    }

    return random() <= config.density;
  }

  function makeBricksForLevel(level) {
    var layout = buildLevelConfig(level);
    var random = createSeededRandom(layout.seed);
    var bricks = [];
    var fallbackBrick = null;

    for (var row = 0; row < layout.rows; row += 1) {
      for (var col = 0; col < layout.cols; col += 1) {
        if (!shouldActivateBrick(row, col, layout, random)) {
          continue;
        }
        var powerType = powerUpTypeForBrick(row, col, level, layout);
        var hp = powerType ? 1 : brickHpForLevel(row, level);
        var brick = {
          x: layout.left + col * (layout.width + layout.gap),
          y: layout.top + row * (layout.height + layout.gap),
          width: layout.width,
          height: layout.height,
          active: true,
          row: row,
          col: col,
          hp: hp,
          maxHp: hp,
          powerUp: powerType,
          powerUpType: powerType,
          layoutSeed: layout.seed
        };
        bricks.push(brick);
        if (!fallbackBrick) {
          fallbackBrick = brick;
        }
      }
    }

    if (bricks.length === 0 && fallbackBrick) {
      bricks.push(fallbackBrick);
    }

    return bricks;
  }

  function powerUpTypeForBrick(row, col, level, layout) {
    var index = row * layout.cols + col;
    var cadence = 9 + Math.min(3, Math.floor((level - 1) / 4));

    if ((index + level + layout.pattern) % cadence !== 2) {
      return null;
    }

    return POWER_UP_TYPES[(Math.floor(index / 7) + level + layout.pattern) % POWER_UP_TYPES.length];
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function publicState() {
    normalizeState();
    var snapshot = clone(state);
    snapshot.width = WIDTH;
    snapshot.height = HEIGHT;
    snapshot.paddle = {
      x: state.paddleX,
      y: paddle.y,
      width: state.paddleWidth,
      height: paddle.height
    };
    snapshot.gameOver = state.status === "Game Over";
    snapshot.won = state.status === "You Win";
    snapshot.level = state.level;
    snapshot.combo = state.combo || 0;
    snapshot.bestCombo = state.bestCombo || 0;
    snapshot.comboMultiplier = comboMultiplier(state.combo || 0);
    snapshot.statusMessage = getStatusText();
    snapshot.effectsDisplay = getEffectsDisplay();
    snapshot.helpOpen = !helpOverlayEl.hidden;
    snapshot.muted = sfx.isMuted();
    // Serve state is internal: keep it out of the round-tripped snapshot so a test that
    // re-applies getState() (e.g. via a mutator) gets a live in-play ball by default.
    // Tests observe the parked state through the isAwaitingServe() hook instead.
    delete snapshot.awaitingServe;
    return snapshot;
  }

  function resetBall() {
    // Park the ball on the paddle awaiting the player's serve, instead of launching it
    // immediately in a fixed direction. The player aims and releases it (see launchBall).
    var launch = makeBallStartForLevel(state.level || 1);
    var paddleX = typeof state.paddleX === "number" ? state.paddleX : paddle.x;
    var paddleWidth = state.paddleWidth || paddle.width;
    var parked = {
      radius: launch.radius,
      x: clamp(paddleX + paddleWidth / 2, launch.radius, WIDTH - launch.radius),
      y: paddle.y - launch.radius - 2,
      dx: 0,
      dy: 0
    };
    state.balls = [parked];
    state.ball = parked;
    state.awaitingServe = true;
    syncBallAliases(parked);
  }

  // Release a parked ball into play. Aim follows the paddle's current travel (a left/right
  // hold angles the serve that way), else it leans toward the canonical start direction.
  function launchBall() {
    if (!state.awaitingServe || state.status !== "Playing" || state.paused) {
      return;
    }
    var ball = state.balls && state.balls[0];
    if (!ball) {
      return;
    }
    var launch = makeBallStartForLevel(state.level || 1);
    var speed = Math.sqrt(launch.dx * launch.dx + launch.dy * launch.dy);
    var aim;
    if (keys.left && !keys.right) {
      aim = -PADDLE_MAX_BOUNCE_ANGLE * 0.5;
    } else if (keys.right && !keys.left) {
      aim = PADDLE_MAX_BOUNCE_ANGLE * 0.5;
    } else {
      aim = (launch.dx >= 0 ? 1 : -1) * PADDLE_MAX_BOUNCE_ANGLE * 0.45;
    }
    ball.dx = speed * Math.sin(aim);
    ball.dy = -Math.abs(speed * Math.cos(aim));
    syncBallAliases(ball);
    state.awaitingServe = false;
    sfx.playPaddleHit();
    vibrate(14);
  }

  function resetEffects() {
    state.pickups = [];
    state.lasers = [];
    state.activeEffects = {};
    state.paddleWidth = paddle.width;
    state.laserCooldown = 0;
    state.shield = false;
  }

  function restart() {
    renderTick = 0;
    state = {
      paddleX: paddle.x,
      ball: clone(ballStart),
      balls: [],
      bricks: makeBricksForLevel(startZone),
      pickups: [],
      lasers: [],
      activeEffects: {},
      paddleWidth: paddle.width,
      laserCooldown: 0,
      score: 0,
      highScore: readHighScore(),
      newRecord: false,
      lives: 3,
      level: startZone,
      status: "Playing",
      paused: false,
      levelClears: 0,
      combo: 0,
      bestCombo: 0,
      bricksBroken: 0,
      particles: [],
      shield: false
    };
    resetBall();
    updateHud();
    draw();
  }

  function normalizeBall(ball) {
    ball.radius = ball.radius || ball.r || ball.size || ballStart.radius;
    ball.dx = typeof ball.dx === "number" ? ball.dx : (typeof ball.vx === "number" ? ball.vx : (typeof ball.velocityX === "number" ? ball.velocityX : ballStart.dx));
    ball.dy = typeof ball.dy === "number" ? ball.dy : (typeof ball.vy === "number" ? ball.vy : (typeof ball.velocityY === "number" ? ball.velocityY : ballStart.dy));
    ball.vx = ball.dx;
    ball.vy = ball.dy;
    ball.velocityX = ball.dx;
    ball.velocityY = ball.dy;
    return ball;
  }

  function syncBallAliases(ball) {
    ball.vx = ball.dx;
    ball.vy = ball.dy;
    ball.velocityX = ball.dx;
    ball.velocityY = ball.dy;
  }

  function normalizeState() {
    if (!state) {
      return;
    }

    if (!Array.isArray(state.balls) || state.balls.length === 0) {
      state.balls = state.ball ? [state.ball] : [clone(ballStart)];
    }

    for (var i = 0; i < state.balls.length; i += 1) {
      normalizeBall(state.balls[i]);
    }

    state.ball = state.balls[0];
    state.pickups = Array.isArray(state.pickups) ? state.pickups : [];
    state.lasers = Array.isArray(state.lasers) ? state.lasers : [];
    state.activeEffects = state.activeEffects && typeof state.activeEffects === "object" ? state.activeEffects : {};
    state.paddleWidth = typeof state.paddleWidth === "number" ? state.paddleWidth : paddle.width;
    state.laserCooldown = typeof state.laserCooldown === "number" ? state.laserCooldown : 0;
    state.paused = typeof state.paused === "boolean" ? state.paused : false;
    state.awaitingServe = typeof state.awaitingServe === "boolean" ? state.awaitingServe : false;
    state.level = typeof state.level === "number" ? Math.max(1, Math.floor(state.level)) : 1;
    state.levelClears = typeof state.levelClears === "number" ? Math.max(0, Math.floor(state.levelClears)) : 0;
    state.highScore = typeof state.highScore === "number" ? state.highScore : readHighScore();
    state.newRecord = typeof state.newRecord === "boolean" ? state.newRecord : false;
    state.combo = typeof state.combo === "number" ? Math.max(0, Math.floor(state.combo)) : 0;
    state.bestCombo = typeof state.bestCombo === "number" ? Math.max(0, Math.floor(state.bestCombo)) : 0;
    state.bricksBroken = typeof state.bricksBroken === "number" ? Math.max(0, Math.floor(state.bricksBroken)) : 0;
    state.particles = Array.isArray(state.particles) ? state.particles : [];
    state.shield = typeof state.shield === "boolean" ? state.shield : false;
  }

  var BRICK_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6"];

  function brickBaseColor(brick) {
    return powerUpColor(brick.powerUp || brick.powerUpType) || BRICK_COLORS[brick.row % BRICK_COLORS.length] || "#3b82f6";
  }

  function prefersReducedMotion() {
    try {
      return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (e) {
      return false;
    }
  }

  // Deterministic RNG for particle spread so debris is reproducible for tests.
  var particleSeed = 0x9e3779b9;
  function particleRandom() {
    particleSeed = (particleSeed * 1664525 + 1013904223) >>> 0;
    return particleSeed / 4294967296;
  }

  // Burst of short-lived debris when a brick is destroyed — skipped under reduced motion.
  // Particles only paint while present, so the static visual baseline is unaffected.
  function spawnBrickParticles(brick) {
    if (prefersReducedMotion()) {
      return;
    }
    if (!Array.isArray(state.particles)) {
      state.particles = [];
    }
    var color = brickBaseColor(brick);
    var cx = brick.x + brick.width / 2;
    var cy = brick.y + brick.height / 2;
    var count = 8;
    for (var i = 0; i < count; i += 1) {
      var angle = (i / count) * Math.PI * 2 + particleRandom() * 0.6;
      var speed = 60 + particleRandom() * 120;
      var life = 24 + Math.floor(particleRandom() * 12);
      state.particles.push({
        x: cx,
        y: cy,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed - 40,
        life: life,
        maxLife: life,
        size: 2 + particleRandom() * 2,
        color: color
      });
    }
    // Cap total particles so a long combo can't unbound the array.
    if (state.particles.length > 120) {
      state.particles.splice(0, state.particles.length - 120);
    }
  }

  function updateParticles(dt) {
    if (!Array.isArray(state.particles) || state.particles.length === 0) {
      return;
    }
    for (var i = state.particles.length - 1; i >= 0; i -= 1) {
      var p = state.particles[i];
      p.x += p.dx * dt;
      p.y += p.dy * dt;
      p.dy += 320 * dt; // gravity pulls the debris down
      p.life -= 1;
      if (p.life <= 0) {
        state.particles.splice(i, 1);
      }
    }
  }

  function recordHighScore() {
    if (state.score > state.highScore) {
      if (state.highScore > 0) {
        state.newRecord = true;
      }
      state.highScore = state.score;
      writeHighScore(state.highScore);
    }
  }

  function updateHud() {
    scoreEl.textContent = String(state.score);
    bestEl.textContent = String(state.highScore);
    livesEl.textContent = String(state.lives);
    levelEl.textContent = String(state.level);
    effectsEl.textContent = formatEffectsDisplay(getEffectsDisplay());
    statusEl.textContent = getStatusText();
    pauseButton.textContent = state.paused ? "Resume" : "Pause";
    pauseButton.setAttribute("aria-pressed", state.paused ? "true" : "false");
    muteButton.textContent = sfx.isMuted() ? "🔇" : "🔊";
    muteButton.setAttribute("aria-pressed", sfx.isMuted() ? "true" : "false");
    // Keep the canvas's accessible name describing the live game state for screen readers.
    var summary = state.status === "Game Over"
      ? "Brick Breaker. Game over. Level " + state.level + ", score " + state.score + "."
      : "Brick Breaker. Level " + state.level + ", " + state.lives + " lives, score " + state.score + (state.paused ? ". Paused" : "") + ".";
    if (canvas.getAttribute("aria-label") !== summary) {
      canvas.setAttribute("aria-label", summary);
    }
  }

  function getStatusText() {
    if (state.status === "Game Over") {
      return state.newRecord ? "New record!" : "Game Over";
    }
    if (state.paused) {
      return "Paused";
    }
    var multiplier = levelSpeedMultiplier(state.level || 1);
    var base = (state.level || 1) % 5 === 0
      ? "Milestone x" + multiplier.toFixed(2)
      : "Zone " + String(state.level || 1) + " x" + multiplier.toFixed(2);
    // Surface a live combo run once it is worth bragging about (2+ bricks this volley).
    if ((state.combo || 0) >= 2) {
      base += " · Combo " + state.combo + " (x" + comboMultiplier(state.combo) + ")";
    }
    return base;
  }

  function getEffectsDisplay() {
    var timed = ["laser", "slow", "wide"];
    var display = [];

    for (var i = 0; i < timed.length; i += 1) {
      var name = timed[i];
      var frames = state.activeEffects[name];
      if (typeof frames === "number" && frames > 0) {
        display.push({
          type: name,
          seconds: Math.ceil(frames / 60)
        });
      }
    }

    return display;
  }

  function formatEffectsDisplay(display) {
    if (!display.length) {
      return "None";
    }
    return display.map(function (item) {
      return item.type.toUpperCase() + " " + item.seconds + "s";
    }).join(" • ");
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function circleHitsRect(circle, rect) {
    var closestX = clamp(circle.x, rect.x, rect.x + rect.width);
    var closestY = clamp(circle.y, rect.y, rect.y + rect.height);
    var xDistance = circle.x - closestX;
    var yDistance = circle.y - closestY;

    return xDistance * xDistance + yDistance * yDistance <= circle.radius * circle.radius;
  }

  function reflectFromRect(ball, rect) {
    var previousX = ball.x - ball.dx * FIXED_DT;
    var previousY = ball.y - ball.dy * FIXED_DT;
    var cameFromSide = previousX <= rect.x || previousX >= rect.x + rect.width;
    var cameFromTopOrBottom = previousY <= rect.y || previousY >= rect.y + rect.height;

    var sideHit = cameFromSide && !cameFromTopOrBottom;
    if (sideHit) {
      ball.dx *= -1;
    } else {
      ball.dy *= -1;
    }
    return sideHit;
  }

  function activeBrickCount() {
    var count = 0;

    for (var i = 0; i < state.bricks.length; i += 1) {
      if (state.bricks[i].active) {
        count += 1;
      }
    }

    return count;
  }

  function loseLife() {
    state.lives -= 1;
    state.combo = 0;
    resetEffects();
    sfx.playLifeLost();
    vibrate([60, 40, 80]);

    if (state.lives <= 0) {
      state.lives = 0;
      state.status = "Game Over";
      return;
    }

    resetBall();
    state.paddleX = paddle.x;
  }

  function prepareLevelStart() {
    state.pickups = [];
    state.lasers = [];
    state.laserCooldown = 0;
    state.combo = 0;
    resetBall();
    applyEffectState();
    state.paddleX = clamp(WIDTH / 2 - state.paddleWidth / 2, 0, WIDTH - state.paddleWidth);
    state.status = "Playing";
  }

  function advanceLevel() {
    state.level += 1;
    state.levelClears += 1;
    state.bricks = makeBricksForLevel(state.level);
    prepareLevelStart();
    sfx.playLevelClear();
  }

  // Shared brick-hit path for both ball and laser hits. An armored brick that
  // survives the hit takes a chip of damage (small score, softer blip) and stays on
  // the board; the hit that drops it to zero destroys it — advancing the combo,
  // awarding combo-scaled points, dropping any power-up, and playing the break blip.
  // Returns true when the brick was destroyed.
  function damageBrick(brick) {
    brick.hp = (typeof brick.hp === "number" ? brick.hp : 1) - 1;

    if (brick.hp > 0) {
      state.score += 5;
      recordHighScore();
      sfx.playPaddleHit();
      return false;
    }

    brick.active = false;
    state.combo = (state.combo || 0) + 1;
    if (state.combo > (state.bestCombo || 0)) {
      state.bestCombo = state.combo;
    }
    state.bricksBroken = (state.bricksBroken || 0) + 1;
    state.score += 10 * comboMultiplier(state.combo);
    recordHighScore();
    spawnPickup(brick);
    spawnBrickParticles(brick);
    sfx.playBrickBreak(brick.row);
    vibrate(10);
    return true;
  }

  // Push the ball just clear of a brick it bounced off but did not destroy, so it
  // can't immediately re-collide on the next frame (which would skip the armor).
  function ejectBallFromBrick(ball, brick, sideHit) {
    if (sideHit) {
      ball.x = ball.dx > 0 ? brick.x + brick.width + ball.radius : brick.x - ball.radius;
    } else {
      ball.y = ball.dy > 0 ? brick.y + brick.height + ball.radius : brick.y - ball.radius;
    }
  }

  function spawnPickup(brick) {
    var type = normalizePowerUpType(brick.powerUp || brick.powerUpType || brick.powerup || brick.powerupType || brick.bonus || brick.drop);

    if (!type) {
      return;
    }

    state.pickups.push({
      type: type,
      powerUp: type,
      powerUpType: type,
      x: brick.x + brick.width / 2 - PICKUP_SIZE / 2,
      y: brick.y + brick.height / 2 - PICKUP_SIZE / 2,
      width: PICKUP_SIZE,
      height: PICKUP_SIZE,
      dy: PICKUP_SPEED,
      active: true
    });
  }

  function activatePowerUp(type) {
    type = normalizePowerUpType(type);

    if (type === "life") {
      state.lives += 1;
      return;
    }

    if (type === "multi") {
      addMultiBalls();
      return;
    }

    if (type === "shield") {
      // Arms a one-time safety net along the floor that bounces the next ball back.
      state.shield = true;
      return;
    }

    if (POWER_UP_DURATION[type]) {
      state.activeEffects[type] = POWER_UP_DURATION[type];
    }

    applyEffectState();
  }

  function normalizePowerUpType(type) {
    if (type === "multiball" || type === "multi-ball") {
      return "multi";
    }

    return POWER_UP_TYPES.indexOf(type) >= 0 ? type : null;
  }

  function addMultiBalls() {
    normalizeState();

    if (state.balls.length >= 3) {
      return;
    }

    var source = state.balls[0] || clone(ballStart);
    var first = clone(source);
    var second = clone(source);
    first.dx = -Math.abs(source.dx || ballStart.dx);
    second.dx = Math.abs(source.dx || ballStart.dx);
    first.dy = -Math.abs(source.dy || ballStart.dy);
    second.dy = -Math.abs(source.dy || ballStart.dy);
    syncBallAliases(first);
    syncBallAliases(second);
    state.balls.push(first, second);
    state.ball = state.balls[0];
  }

  function applyEffectState() {
    state.paddleWidth = state.activeEffects.wide > 0 ? 164 : paddle.width;
  }

  function updateEffects() {
    var names = Object.keys(state.activeEffects);

    for (var i = 0; i < names.length; i += 1) {
      var name = names[i];
      state.activeEffects[name] -= 1;
      if (state.activeEffects[name] <= 0) {
        delete state.activeEffects[name];
      }
    }

    if (state.laserCooldown > 0) {
      state.laserCooldown -= 1;
    }

    applyEffectState();
    state.paddleX = clamp(state.paddleX, 0, WIDTH - state.paddleWidth);
  }

  function updatePickups(dt) {
    var paddleRect = {
      x: state.paddleX,
      y: paddle.y,
      width: state.paddleWidth,
      height: paddle.height
    };

    for (var i = state.pickups.length - 1; i >= 0; i -= 1) {
      var pickup = state.pickups[i];
      pickup.y += pickup.dy * dt;

      if (rectsOverlap(pickup, paddleRect)) {
        activatePowerUp(pickup.type);
        sfx.playPickup();
        vibrate(14);
        state.pickups.splice(i, 1);
      } else if (pickup.y > HEIGHT) {
        state.pickups.splice(i, 1);
      }
    }
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  function fireLasers() {
    if (!(state.activeEffects.laser > 0) || state.laserCooldown > 0) {
      return;
    }

    var left = state.paddleX + 16;
    var right = state.paddleX + state.paddleWidth - 20;
    state.lasers.push(
      { x: left, y: paddle.y - 8, width: 4, height: 12, dy: -LASER_SPEED, active: true },
      { x: right, y: paddle.y - 8, width: 4, height: 12, dy: -LASER_SPEED, active: true }
    );
    state.laserCooldown = LASER_COOLDOWN_FRAMES;
  }

  function updateLasers(dt) {
    for (var i = state.lasers.length - 1; i >= 0; i -= 1) {
      var laser = state.lasers[i];
      laser.y += laser.dy * dt;

      if (laser.y + laser.height < 0) {
        state.lasers.splice(i, 1);
        continue;
      }

      for (var j = 0; j < state.bricks.length; j += 1) {
        var brick = state.bricks[j];

        if (!brick.active || !rectsOverlap(laser, brick)) {
          continue;
        }

        damageBrick(brick);
        state.lasers.splice(i, 1);
        break;
      }
    }
  }

  function ballSpeedScale() {
    return state.activeEffects.slow > 0 ? 0.62 : 1;
  }

  function bounceBallFromPaddle(ball) {
    var paddleCenter = state.paddleX + state.paddleWidth / 2;
    var halfWidth = state.paddleWidth / 2;
    var impact = clamp((ball.x - paddleCenter) / halfWidth, -1, 1);
    var bounceAngle = impact * PADDLE_MAX_BOUNCE_ANGLE;
    var speed = BALL_BASE_SPEED * levelSpeedMultiplier(state.level || 1);

    ball.dx = speed * Math.sin(bounceAngle);
    ball.dy = -Math.abs(speed * Math.cos(bounceAngle));
    // A paddle touch ends the current volley, so the combo chain resets.
    state.combo = 0;
  }

  function togglePause() {
    if (state.status !== "Playing") {
      return;
    }
    state.paused = !state.paused;
    updateHud();
    draw();
  }

  // Pause an in-progress game when the tab is hidden so the ball doesn't keep moving
  // while the player is away. Only acts on a live, unpaused game with no modal open,
  // and never auto-resumes (the player resumes deliberately).
  function autoPauseOnHide() {
    if (state.status !== "Playing" || state.paused || !helpOverlayEl.hidden) {
      return;
    }
    keys.left = false;
    keys.right = false;
    togglePause();
  }

  function toggleMute() {
    sfx.setMuted(!sfx.isMuted());
    updateHud();
  }

  function openHelp() {
    if (!helpOverlayEl.hidden) {
      return;
    }
    keys.left = false;
    keys.right = false;
    helpDidPause = state.status === "Playing" && !state.paused;
    if (helpDidPause) {
      togglePause();
    }
    helpOverlayEl.hidden = false;
    gameShellEl.setAttribute("inert", "");
    helpCloseButton.focus();
  }

  function closeHelp() {
    if (helpOverlayEl.hidden) {
      return;
    }
    helpOverlayEl.hidden = true;
    gameShellEl.removeAttribute("inert");
    markHelpSeen();
    if (helpDidPause && state.paused) {
      togglePause();
    }
    helpDidPause = false;
    helpButton.focus();
  }

  function step(dt) {
    if (state.paused || state.status !== "Playing") {
      return;
    }

    normalizeState();
    renderTick += 1;
    updateEffects();

    if (keys.left) {
      state.paddleX -= paddle.speed * dt;
    }
    if (keys.right) {
      state.paddleX += paddle.speed * dt;
    }

    state.paddleX = clamp(state.paddleX, 0, WIDTH - state.paddleWidth);

    if (state.activeEffects.laser > 0) {
      fireLasers();
    }

    updateLasers(dt);
    updatePickups(dt);
    updateParticles(dt);
    updateBalls(dt);

    if (state.balls.length === 0) {
      loseLife();
      return;
    }

    if (activeBrickCount() === 0) {
      advanceLevel();
    }
  }

  function updateBalls(dt) {
    // While awaiting the serve the ball rides on the paddle and skips all motion/collision.
    if (state.awaitingServe) {
      var parked = state.balls && state.balls[0];
      if (parked) {
        parked.x = clamp(state.paddleX + state.paddleWidth / 2, parked.radius, WIDTH - parked.radius);
        parked.y = paddle.y - parked.radius - 2;
        parked.dx = 0;
        parked.dy = 0;
        syncBallAliases(parked);
      }
      return;
    }

    var paddleRect = {
      x: state.paddleX,
      y: paddle.y,
      width: state.paddleWidth,
      height: paddle.height
    };

    for (var ballIndex = state.balls.length - 1; ballIndex >= 0; ballIndex -= 1) {
      var ball = state.balls[ballIndex];
      var speedScale = ballSpeedScale();
      ball.x += ball.dx * dt * speedScale;
      ball.y += ball.dy * dt * speedScale;

      if (ball.x - ball.radius <= 0) {
        ball.x = ball.radius;
        ball.dx = Math.abs(ball.dx);
      }
      if (ball.x + ball.radius >= WIDTH) {
        ball.x = WIDTH - ball.radius;
        ball.dx = -Math.abs(ball.dx);
      }
      if (ball.y - ball.radius <= 0) {
        ball.y = ball.radius;
        ball.dy = Math.abs(ball.dy);
      }
      if (ball.y - ball.radius > HEIGHT) {
        if (state.shield) {
          // The safety net saves this ball once, then is consumed.
          state.shield = false;
          ball.y = HEIGHT - ball.radius;
          ball.dy = -Math.abs(ball.dy);
          sfx.playPaddleHit();
          vibrate(20);
          syncBallAliases(ball);
        } else {
          state.balls.splice(ballIndex, 1);
          continue;
        }
      }

      if (ball.dy > 0 && circleHitsRect(ball, paddleRect)) {
        ball.y = paddle.y - ball.radius;
        bounceBallFromPaddle(ball);
        sfx.playPaddleHit();
      }

      for (var i = 0; i < state.bricks.length; i += 1) {
        var brick = state.bricks[i];

        if (!brick.active || !circleHitsRect(ball, brick)) {
          continue;
        }

        var destroyed = damageBrick(brick);
        var sideHit = reflectFromRect(ball, brick);
        if (!destroyed) {
          ejectBallFromBrick(ball, brick, sideHit);
        }
        break;
      }

      syncBallAliases(ball);
    }

    state.ball = state.balls[0];
  }

  function drawBricks() {
    var colors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6"];

    for (var i = 0; i < state.bricks.length; i += 1) {
      var brick = state.bricks[i];

      if (!brick.active) {
        continue;
      }

      ctx.fillStyle = powerUpColor(brick.powerUp || brick.powerUpType) || colors[brick.row % colors.length] || "#3b82f6";
      ctx.fillRect(brick.x, brick.y, brick.width, brick.height);

      // Armored bricks (maxHp > 1) get a bright inset border, plus a darkening wash
      // that deepens as the brick takes damage. Single-hit bricks render unchanged.
      var maxHp = brick.maxHp || 1;
      if (maxHp > 1) {
        var hp = typeof brick.hp === "number" ? brick.hp : maxHp;
        var damage = Math.max(0, Math.min(1, 1 - hp / maxHp));
        if (damage > 0) {
          ctx.fillStyle = "rgba(2,6,23," + (0.5 * damage).toFixed(3) + ")";
          ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
        }
        ctx.save();
        ctx.strokeStyle = "rgba(248,250,252,0.7)";
        ctx.lineWidth = 2;
        ctx.strokeRect(brick.x + 1.5, brick.y + 1.5, brick.width - 3, brick.height - 3);
        ctx.restore();
      }

      if (brick.powerUp || brick.powerUpType) {
        drawPowerBrickBadge(brick, brick.powerUp || brick.powerUpType);
      }
    }
  }

  function powerUpColor(type) {
    if (type === "wide") return "#14b8a6";
    if (type === "slow") return "#a78bfa";
    if (type === "life") return "#22c55e";
    if (type === "multi") return "#f59e0b";
    if (type === "laser") return "#ef4444";
    if (type === "shield") return "#60a5fa";
    return null;
  }

  function drawArcadeCapsule(x, y, width, height, type, letter, blinkOn) {
    var color = powerUpColor(type) || "#f9fafb";
    var midX = x + width / 2;
    var radius = height / 2;

    ctx.save();
    ctx.globalAlpha = blinkOn ? 1 : 0.86;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(midX - radius, y + radius, radius, Math.PI / 2, Math.PI * 1.5);
    ctx.arc(midX + radius, y + radius, radius, Math.PI * 1.5, Math.PI / 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.arc(midX - radius, y + radius, radius * 0.78, Math.PI / 2, Math.PI * 1.5);
    ctx.fill();

    ctx.fillStyle = "rgba(2,6,23,0.22)";
    ctx.beginPath();
    ctx.arc(midX + radius, y + radius, radius * 0.78, Math.PI * 1.5, Math.PI / 2);
    ctx.fill();

    ctx.fillStyle = "#f8fafc";
    ctx.font = "700 12px Arial, Helvetica, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(letter, midX, y + radius + 0.5);
    ctx.restore();
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  function drawPowerBrickBadge(brick, type) {
    var letter = powerUpLetter(type);
    if (!letter) {
      return;
    }

    var badgeWidth = 20;
    var badgeHeight = 14;
    var x = brick.x + brick.width / 2 - badgeWidth / 2;
    var y = brick.y + brick.height / 2 - badgeHeight / 2;
    var blinkOn = ((renderTick / 12) | 0) % 2 === 0;
    drawArcadeCapsule(x, y, badgeWidth, badgeHeight, type, letter, blinkOn);
  }

  function draw() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    drawBricks();

    ctx.fillStyle = "#f9fafb";
    normalizeState();

    ctx.fillRect(state.paddleX, paddle.y, state.paddleWidth, paddle.height);

    for (var i = 0; i < state.pickups.length; i += 1) {
      var pickup = state.pickups[i];
      var blinkOn = ((renderTick / 8) | 0) % 2 === 0;
      drawArcadeCapsule(
        pickup.x,
        pickup.y + 1,
        pickup.width,
        Math.max(12, pickup.height - 2),
        pickup.type,
        powerUpLetter(pickup.type),
        blinkOn
      );
    }

    ctx.fillStyle = "#f87171";
    for (var j = 0; j < state.lasers.length; j += 1) {
      var laser = state.lasers[j];
      ctx.fillRect(laser.x, laser.y, laser.width, laser.height);
    }

    for (var k = 0; k < state.balls.length; k += 1) {
      var ball = state.balls[k];
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.fillStyle = k === 0 ? "#38bdf8" : "#fde047";
      ctx.fill();
    }

    if (Array.isArray(state.particles)) {
      for (var pi = 0; pi < state.particles.length; pi += 1) {
        var particle = state.particles[pi];
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, particle.life / particle.maxLife));
        ctx.fillStyle = particle.color;
        ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
        ctx.restore();
      }
    }

    // Armed safety net: a glowing bar along the floor that saves the next ball once.
    if (state.shield) {
      ctx.save();
      ctx.fillStyle = powerUpColor("shield");
      ctx.shadowColor = powerUpColor("shield");
      ctx.shadowBlur = 12;
      ctx.fillRect(0, HEIGHT - 5, WIDTH, 4);
      ctx.restore();
    }

    // Serve prompt: only while a parked ball is waiting in active play (so the static
    // "Playing" visual baseline, which has a live ball, is unaffected).
    if (state.awaitingServe && state.status === "Playing" && !state.paused) {
      ctx.save();
      ctx.fillStyle = "rgba(249, 250, 251, 0.85)";
      ctx.font = "16px Arial, Helvetica, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Press Space / tap to launch", WIDTH / 2, HEIGHT / 2 + 40);
      ctx.textAlign = "start";
      ctx.restore();
    }

    if (state.status !== "Playing") {
      ctx.fillStyle = "rgba(2, 6, 23, 0.72)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = "#f9fafb";
      ctx.font = "700 42px Arial, Helvetica, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(state.status, WIDTH / 2, HEIGHT / 2);
      ctx.font = "20px Arial, Helvetica, sans-serif";
      ctx.fillText("Score " + state.score + " · Best " + state.highScore, WIDTH / 2, HEIGHT / 2 + 38);
      ctx.font = "16px Arial, Helvetica, sans-serif";
      ctx.fillStyle = "rgba(249, 250, 251, 0.75)";
      ctx.fillText("Best combo x" + (state.bestCombo || 0) + " · " + (state.bricksBroken || 0) + " bricks", WIDTH / 2, HEIGHT / 2 + 64);
      ctx.fillStyle = "#f9fafb";
      ctx.font = "20px Arial, Helvetica, sans-serif";
      ctx.fillText("Press R or tap Restart", WIDTH / 2, HEIGHT / 2 + 92);
      ctx.textAlign = "start";
    } else if (state.paused) {
      ctx.fillStyle = "rgba(2, 6, 23, 0.62)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = "#f9fafb";
      ctx.font = "700 42px Arial, Helvetica, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Paused", WIDTH / 2, HEIGHT / 2);
      ctx.font = "20px Arial, Helvetica, sans-serif";
      ctx.fillText("Press P to resume", WIDTH / 2, HEIGHT / 2 + 38);
      ctx.textAlign = "start";
    }
  }

  function frame(timestamp) {
    if (!lastTime) {
      lastTime = timestamp;
    }

    var elapsed = Math.min((timestamp - lastTime) / 1000, 0.1);
    lastTime = timestamp;

    if (autoStep) {
      while (elapsed > 0) {
        var dt = Math.min(FIXED_DT, elapsed);
        step(dt);
        elapsed -= dt;
      }
    }

    updateHud();
    draw();
    window.requestAnimationFrame(frame);
  }

  function handleKey(event, pressed) {
    if (!helpOverlayEl.hidden) {
      if (event.key === "Escape" && pressed) {
        event.preventDefault();
        closeHelp();
      }
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") {
      keys.left = pressed && !state.paused;
      event.preventDefault();
    }
    if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") {
      keys.right = pressed && !state.paused;
      event.preventDefault();
    }
    if ((event.key === " " || event.key === "Spacebar" || event.key === "ArrowUp" || event.key === "w" || event.key === "W") && pressed) {
      launchBall();
      event.preventDefault();
    }
    if ((event.key === "r" || event.key === "R") && pressed) {
      restart();
    }
    if ((event.key === "p" || event.key === "P" || event.key === "Escape") && pressed) {
      togglePause();
    }
  }

  function updatePaddlePositionFromCanvasClientX(clientX) {
    if (state.paused) {
      return;
    }
    var rect = canvas.getBoundingClientRect();
    var scale = WIDTH / rect.width;
    normalizeState();
    state.paddleX = clamp((clientX - rect.left) * scale - state.paddleWidth / 2, 0, WIDTH - state.paddleWidth);
  }

  function updatePaddlePositionFromLaneClientX(clientX) {
    if (state.paused) {
      return;
    }
    var rect = paddleDragLane.getBoundingClientRect();
    var ratio = (clientX - rect.left) / rect.width;
    normalizeState();
    state.paddleX = clamp(ratio * WIDTH - state.paddleWidth / 2, 0, WIDTH - state.paddleWidth);
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      autoPauseOnHide();
    }
  });

  // Switching to another window/app while the tab stays visible doesn't fire
  // visibilitychange, so also pause on window blur (and reset timing on refocus).
  window.addEventListener("blur", function () {
    autoPauseOnHide();
  });
  window.addEventListener("focus", function () {
    lastTime = 0;
  });

  window.addEventListener("keydown", function (event) {
    handleKey(event, true);
  });

  window.addEventListener("keyup", function (event) {
    handleKey(event, false);
  });

  canvas.addEventListener("mousemove", function (event) {
    updatePaddlePositionFromCanvasClientX(event.clientX);
  });

  // A press on the board launches a parked ball (desktop click / mobile tap on the board).
  canvas.addEventListener("pointerdown", function () {
    launchBall();
  });

  paddleDragLane.addEventListener("pointerdown", function (event) {
    activeControlPointerId = event.pointerId;
    if (paddleDragLane.setPointerCapture) {
      paddleDragLane.setPointerCapture(event.pointerId);
    }
    updatePaddlePositionFromLaneClientX(event.clientX);
    // Tapping the steering lane also serves a parked ball.
    launchBall();
    event.preventDefault();
  }, { passive: false });

  paddleDragLane.addEventListener("pointermove", function (event) {
    if (activeControlPointerId !== event.pointerId) {
      return;
    }
    updatePaddlePositionFromLaneClientX(event.clientX);
    event.preventDefault();
  }, { passive: false });

  function clearControlPointer(event) {
    if (activeControlPointerId !== event.pointerId) {
      return;
    }
    activeControlPointerId = null;
    if (paddleDragLane.releasePointerCapture && paddleDragLane.hasPointerCapture && paddleDragLane.hasPointerCapture(event.pointerId)) {
      paddleDragLane.releasePointerCapture(event.pointerId);
    }
    if (event.cancelable) {
      event.preventDefault();
    }
  }

  paddleDragLane.addEventListener("pointerup", clearControlPointer, { passive: false });
  paddleDragLane.addEventListener("pointercancel", clearControlPointer, { passive: false });

  restartButton.addEventListener("click", restart);
  pauseButton.addEventListener("click", togglePause);
  muteButton.addEventListener("click", toggleMute);
  helpButton.addEventListener("click", openHelp);
  helpCloseButton.addEventListener("click", closeHelp);
  helpOverlayEl.addEventListener("click", function (event) {
    if (event.target === helpOverlayEl) {
      closeHelp();
    }
  });

  var hapticsToggleEl = document.getElementById("haptics-toggle");
  if (hapticsToggleEl) {
    hapticsToggleEl.checked = hapticsEnabled;
    hapticsToggleEl.addEventListener("change", function () {
      applyHapticsEnabled(hapticsToggleEl.checked);
    });
  }

  var swatchEls = document.querySelectorAll(".swatch");
  for (var s = 0; s < swatchEls.length; s += 1) {
    (function (el) {
      el.addEventListener("click", function () {
        applyAccent(el.dataset.accent);
      });
    })(swatchEls[s]);
  }
  applyAccent(readAccent());

  function applyStartZone(value, restartGame) {
    startZone = clampStartZone(value);
    writeStartZone(startZone);
    var select = document.getElementById("start-zone");
    if (select) {
      select.value = String(startZone);
    }
    if (restartGame) {
      restart();
    }
  }
  var startZoneEl = document.getElementById("start-zone");
  if (startZoneEl) {
    startZoneEl.value = String(startZone);
    startZoneEl.addEventListener("change", function () {
      applyStartZone(startZoneEl.value, true);
    });
  }

  window.__brickbreakerTest = {
    isReady: false,
    buildId: BUILD_ID,
    getState: function () {
      return publicState();
    },
    readState: function () {
      return publicState();
    },
    setState: function (nextState) {
      var incoming = clone(nextState);
      if (incoming.paddle && typeof incoming.paddle.x === "number") {
        incoming.paddleX = incoming.paddle.x;
      }
      if (incoming.ball) {
        if (Array.isArray(incoming.balls) && incoming.balls.length > 0) {
          incoming.balls[0] = incoming.ball;
        } else {
          incoming.balls = [incoming.ball];
        }
      } else if (Array.isArray(incoming.balls) && incoming.balls.length > 0) {
        incoming.ball = incoming.balls[0];
      }
      state = Object.assign(state, incoming);
      // A test that authors a ball means a live, in-play ball unless it explicitly asks
      // for the parked serve state — so gameplay tests keep their moving ball.
      if (typeof incoming.awaitingServe === "boolean") {
        state.awaitingServe = incoming.awaitingServe;
      } else if (incoming.ball || incoming.balls) {
        state.awaitingServe = false;
      }
      if (!state.ball && (!state.balls || state.balls.length === 0)) {
        resetBall();
      }
      if (!state.bricks) {
        state.bricks = makeBricksForLevel(state.level || 1);
      }
      normalizeState();
      state.paddleX = clamp(state.paddleX, 0, WIDTH - state.paddleWidth);
      updateHud();
      draw();
    },
    setAutoStep: function (enabled) {
      autoStep = Boolean(enabled);
      updateHud();
      draw();
      return publicState();
    },
    advanceFrames: function (frames) {
      var total = Math.max(0, Math.floor(frames));

      for (var i = 0; i < total; i += 1) {
        step(FIXED_DT);
      }

      updateHud();
      draw();
      return publicState();
    },
    restart: function () {
      restart();
      return publicState();
    },
    setMuted: function (value) {
      sfx.setMuted(Boolean(value));
      updateHud();
    },
    getHaptics: function () {
      return hapticsEnabled;
    },
    setHaptics: function (value) {
      applyHapticsEnabled(value);
    },
    getStartZone: function () {
      return startZone;
    },
    setStartZone: function (value) {
      applyStartZone(value, true);
      return publicState();
    },
    getAccent: function () {
      return getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
    },
    setAccent: function (hex) {
      applyAccent(hex);
    },
    isAwaitingServe: function () {
      return Boolean(state && state.awaitingServe);
    },
    launchBall: function () {
      launchBall();
      return publicState();
    }
  };

  restart();
  if (!hasSeenHelp()) {
    openHelp();
  }
  window.__brickbreakerTest.isReady = true;
  window.requestAnimationFrame(frame);
}());
