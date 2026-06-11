(function () {
  'use strict';

  const WIDTH = 800;
  const HEIGHT = 520;
  const PADDLE_W = 12;
  const PADDLE_H = 80;
  const BALL_R = 8;
  const PLAYER_X = 24;
  const AI_X = WIDTH - 24 - PADDLE_W;
  const PADDLE_SPEED = 320;
  const AI_SPEED_MIN = 200;
  const AI_SPEED_MAX = 420;
  const BALL_SPEED_SERVE_MIN = 250;
  const BALL_SPEED_SERVE_MAX = 450;
  const WIN_SCORE = 7;
  const FIXED_DT = 1 / 60;
  const SERVE_DELAY = 60;
  const NET_H = 10;
  const NET_GAP = 8;
  const BALL_SPEED_MAX = 700;
  const BALL_SPEED_ACCEL = 1.08;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const playerScoreEl = document.getElementById('player-score');
  const aiScoreEl = document.getElementById('ai-score');
  const statusEl = document.getElementById('status');
  const playerUpBtn = document.getElementById('player-up');
  const playerDownBtn = document.getElementById('player-down');
  const restartBtn = document.getElementById('restart');
  const pauseBtn = document.getElementById('pause');
  const muteBtn = document.getElementById('mute');
  const helpBtn = document.getElementById('help');
  const helpOverlayEl = document.getElementById('help-overlay');
  const helpCloseBtn = document.getElementById('help-close');
  const gameShellEl = document.querySelector('.game-shell');

  const HELP_SEEN_KEY = 'pong-help-seen';
  const MUTED_KEY = 'pong-muted';

  function createSfx() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    let muted = readMuted();
    let gestureSeen = false;
    let audioCtx = null;

    function readMuted() {
      try {
        return window.localStorage.getItem(MUTED_KEY) === '1';
      } catch {
        return false;
      }
    }

    function writeMuted(value) {
      try {
        window.localStorage.setItem(MUTED_KEY, value ? '1' : '0');
      } catch {}
    }

    function noteGesture() {
      gestureSeen = true;
    }

    window.addEventListener('pointerdown', noteGesture, { capture: true, passive: true });
    window.addEventListener('keydown', noteGesture, { capture: true });

    function getAudio() {
      if (muted || !gestureSeen || navigator.webdriver || !AudioContextClass) return null;
      if (!audioCtx) {
        try {
          audioCtx = new AudioContextClass();
        } catch {
          return null;
        }
      }
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(function () {});
      return audioCtx;
    }

    function tone(startFreq, endFreq, duration, delay, type, peak) {
      const audio = getAudio();
      if (!audio) return;
      try {
        const startAt = audio.currentTime + (delay || 0);
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = type || 'square';
        osc.frequency.setValueAtTime(startFreq, startAt);
        if (endFreq !== startFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, startAt + duration);
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
      // hitRatio in [-1, 1] — edge hits ring slightly higher than center hits
      playPaddleHit: function (hitRatio) {
        const offset = Math.min(1, Math.abs(hitRatio || 0));
        tone(460 + offset * 160, 460 + offset * 160, 0.06, 0, 'square', 0.09);
      },
      playWallBounce: function () {
        tone(240, 240, 0.05, 0, 'square', 0.08);
      },
      playPoint: function () {
        tone(587, 587, 0.06, 0, 'triangle');
        tone(440, 440, 0.08, 0.07, 'triangle');
      },
      playWin: function () {
        tone(392, 784, 0.14, 0, 'triangle');
      },
      playLose: function () {
        tone(392, 196, 0.15, 0, 'sawtooth', 0.09);
      }
    };
  }

  const sfx = createSfx();

  const keys = { up: false, down: false };
  let autoStep = true;
  let rafId = null;
  let prevTimestamp = null;
  let helpDidPause = false;

  const state = {
    ball: { x: WIDTH / 2, y: HEIGHT / 2, dx: 0, dy: 0 },
    playerPaddle: { y: HEIGHT / 2 - PADDLE_H / 2 },
    aiPaddle: { y: HEIGHT / 2 - PADDLE_H / 2 },
    playerScore: 0,
    aiScore: 0,
    gameState: 'serving',
    winner: null,
    serveTimer: SERVE_DELAY,
    serveCount: 0,
    serveToward: 'ai',
    paused: false
  };

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function resetBall() {
    state.ball.x = WIDTH / 2;
    state.ball.y = HEIGHT / 2;
    state.ball.dx = 0;
    state.ball.dy = 0;
  }

  function getDifficulty() {
    return Math.min((state.playerScore + state.aiScore) / 12, 1);
  }

  function launchBall(towardPlayer) {
    const speed = BALL_SPEED_SERVE_MIN + (BALL_SPEED_SERVE_MAX - BALL_SPEED_SERVE_MIN) * getDifficulty();
    const n = state.serveCount;
    const ySign = (n % 2 === 0 ? 1 : -1);
    state.ball.dy = ySign * speed * 0.5;
    state.ball.dx = towardPlayer ? -speed : speed;
    state.serveCount += 1;
  }

  function scorePoint(scorer) {
    if (scorer === 'player') {
      state.playerScore += 1;
      state.serveToward = 'ai';
    } else {
      state.aiScore += 1;
      state.serveToward = 'player';
    }
    if (state.playerScore >= WIN_SCORE) {
      state.gameState = 'won';
      state.winner = 'player';
      sfx.playWin();
    } else if (state.aiScore >= WIN_SCORE) {
      state.gameState = 'won';
      state.winner = 'ai';
      sfx.playLose();
    } else {
      resetBall();
      state.gameState = 'serving';
      state.serveTimer = SERVE_DELAY;
      sfx.playPoint();
    }
  }

  function stepPhysics(dt) {
    if (state.paused) return;

    const ball = state.ball;
    const pp = state.playerPaddle;
    const ap = state.aiPaddle;

    if (state.gameState === 'serving') {
      state.serveTimer -= 1;
      if (state.serveTimer <= 0) {
        state.gameState = 'playing';
        launchBall(state.serveToward === 'player');
      }
      return;
    }

    if (state.gameState !== 'playing') return;

    // Player paddle keyboard input
    if (keys.up) pp.y -= PADDLE_SPEED * dt;
    if (keys.down) pp.y += PADDLE_SPEED * dt;
    pp.y = clamp(pp.y, 0, HEIGHT - PADDLE_H);

    // AI paddle follows ball — speed scales with difficulty
    const aiCenter = ap.y + PADDLE_H / 2;
    const diff = ball.y - aiCenter;
    if (Math.abs(diff) > 4) {
      const aiSpeed = AI_SPEED_MIN + (AI_SPEED_MAX - AI_SPEED_MIN) * getDifficulty();
      const move = Math.min(Math.abs(diff), aiSpeed * dt) * Math.sign(diff);
      ap.y = clamp(ap.y + move, 0, HEIGHT - PADDLE_H);
    }

    // Move ball
    ball.x += ball.dx * dt;
    ball.y += ball.dy * dt;

    // Wall bounce top/bottom
    if (ball.y - BALL_R < 0) {
      ball.y = BALL_R;
      ball.dy = Math.abs(ball.dy);
      sfx.playWallBounce();
    } else if (ball.y + BALL_R > HEIGHT) {
      ball.y = HEIGHT - BALL_R;
      ball.dy = -Math.abs(ball.dy);
      sfx.playWallBounce();
    }

    // Player paddle collision (left side)
    if (ball.dx < 0 && ball.x - BALL_R <= PLAYER_X + PADDLE_W && ball.x + BALL_R >= PLAYER_X) {
      if (ball.y + BALL_R >= pp.y && ball.y - BALL_R <= pp.y + PADDLE_H) {
        ball.x = PLAYER_X + PADDLE_W + BALL_R;
        const speed = Math.min(Math.abs(ball.dx) * BALL_SPEED_ACCEL, BALL_SPEED_MAX);
        ball.dx = speed;
        const hitRatio = (ball.y - (pp.y + PADDLE_H / 2)) / (PADDLE_H / 2);
        ball.dy = hitRatio * speed * 0.85;
        if (Math.abs(ball.dy) < 40) ball.dy = ball.dy >= 0 ? 40 : -40;
        sfx.playPaddleHit(hitRatio);
      }
    }

    // AI paddle collision (right side)
    if (ball.dx > 0 && ball.x + BALL_R >= AI_X && ball.x - BALL_R <= AI_X + PADDLE_W) {
      if (ball.y + BALL_R >= ap.y && ball.y - BALL_R <= ap.y + PADDLE_H) {
        ball.x = AI_X - BALL_R;
        const speed = Math.min(Math.abs(ball.dx) * BALL_SPEED_ACCEL, BALL_SPEED_MAX);
        ball.dx = -speed;
        const hitRatio = (ball.y - (ap.y + PADDLE_H / 2)) / (PADDLE_H / 2);
        ball.dy = hitRatio * speed * 0.85;
        if (Math.abs(ball.dy) < 40) ball.dy = ball.dy >= 0 ? 40 : -40;
        sfx.playPaddleHit(hitRatio);
      }
    }

    // Scoring
    if (ball.x - BALL_R < 0) {
      scorePoint('ai');
    } else if (ball.x + BALL_R > WIDTH) {
      scorePoint('player');
    }
  }

  function draw() {
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Net
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (let y = 0; y < HEIGHT; y += NET_H + NET_GAP) {
      ctx.fillRect(WIDTH / 2 - 1, y, 2, NET_H);
    }

    // Paddles
    ctx.fillStyle = '#f9fafb';
    ctx.fillRect(PLAYER_X, state.playerPaddle.y, PADDLE_W, PADDLE_H);
    ctx.fillRect(AI_X, state.aiPaddle.y, PADDLE_W, PADDLE_H);

    // Ball
    ctx.beginPath();
    ctx.arc(state.ball.x, state.ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();

    // Win overlay
    if (state.gameState === 'won') {
      ctx.fillStyle = 'rgba(0,0,0,0.62)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = '#f9fafb';
      ctx.font = 'bold 48px "Trebuchet MS", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(state.winner === 'player' ? 'You Win!' : 'AI Wins!', WIDTH / 2, HEIGHT / 2 - 18);
      ctx.font = '22px "Trebuchet MS", Arial, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('Press Restart to play again', WIDTH / 2, HEIGHT / 2 + 24);
      ctx.textAlign = 'left';
    }

    // Serving overlay
    if (state.gameState === 'serving') {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.font = '18px "Trebuchet MS", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Serving…', WIDTH / 2, HEIGHT / 2 - 30);
      ctx.textAlign = 'left';
    }

    // Paused overlay
    if (state.paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.62)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = '#f9fafb';
      ctx.font = 'bold 48px "Trebuchet MS", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Paused', WIDTH / 2, HEIGHT / 2 - 18);
      ctx.font = '22px "Trebuchet MS", Arial, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('Press P to resume', WIDTH / 2, HEIGHT / 2 + 24);
      ctx.textAlign = 'left';
    }
  }

  function updateHud() {
    playerScoreEl.textContent = String(state.playerScore);
    aiScoreEl.textContent = String(state.aiScore);
    if (state.gameState === 'won') {
      statusEl.textContent = state.winner === 'player' ? 'You Win!' : 'AI Wins!';
    } else if (state.paused) {
      statusEl.textContent = 'Paused';
    } else if (state.gameState === 'serving') {
      statusEl.textContent = 'Serving';
    } else {
      statusEl.textContent = 'Playing';
    }
    pauseBtn.textContent = state.paused ? 'Resume' : 'Pause';
    pauseBtn.setAttribute('aria-pressed', state.paused ? 'true' : 'false');
    muteBtn.textContent = sfx.isMuted() ? '🔇' : '🔊';
    muteBtn.setAttribute('aria-pressed', sfx.isMuted() ? 'true' : 'false');
  }

  function togglePause() {
    if (state.gameState === 'won') return;
    state.paused = !state.paused;
    updateHud();
    draw();
  }

  function toggleMute() {
    sfx.setMuted(!sfx.isMuted());
    updateHud();
  }

  function hasSeenHelp() {
    try {
      return Boolean(window.localStorage.getItem(HELP_SEEN_KEY));
    } catch {
      return false;
    }
  }

  function markHelpSeen() {
    try {
      window.localStorage.setItem(HELP_SEEN_KEY, '1');
    } catch {}
  }

  function openHelp() {
    if (!helpOverlayEl.hidden) return;
    helpDidPause = state.gameState !== 'won' && !state.paused;
    if (helpDidPause) togglePause();
    helpOverlayEl.hidden = false;
    gameShellEl.setAttribute('inert', '');
    helpCloseBtn.focus();
  }

  function closeHelp() {
    if (helpOverlayEl.hidden) return;
    helpOverlayEl.hidden = true;
    gameShellEl.removeAttribute('inert');
    markHelpSeen();
    if (helpDidPause && state.paused) togglePause();
    helpDidPause = false;
    helpBtn.focus();
  }

  function gameRestart() {
    state.ball.x = WIDTH / 2;
    state.ball.y = HEIGHT / 2;
    state.ball.dx = 0;
    state.ball.dy = 0;
    state.playerPaddle.y = HEIGHT / 2 - PADDLE_H / 2;
    state.aiPaddle.y = HEIGHT / 2 - PADDLE_H / 2;
    state.playerScore = 0;
    state.aiScore = 0;
    state.gameState = 'serving';
    state.winner = null;
    state.serveTimer = SERVE_DELAY;
    state.serveCount = 0;
    state.serveToward = 'ai';
    state.paused = false;
    updateHud();
    draw();
  }

  function frame(timestamp) {
    rafId = requestAnimationFrame(frame);
    if (!autoStep) {
      draw();
      return;
    }
    if (prevTimestamp === null) {
      prevTimestamp = timestamp;
    }
    let elapsed = Math.min((timestamp - prevTimestamp) / 1000, 0.1);
    prevTimestamp = timestamp;
    while (elapsed >= FIXED_DT) {
      stepPhysics(FIXED_DT);
      elapsed -= FIXED_DT;
    }
    updateHud();
    draw();
  }

  function publicState() {
    const snap = JSON.parse(JSON.stringify(state));
    snap.width = WIDTH;
    snap.height = HEIGHT;
    snap.ball.radius = BALL_R;
    snap.playerPaddle.x = PLAYER_X;
    snap.playerPaddle.width = PADDLE_W;
    snap.playerPaddle.height = PADDLE_H;
    snap.aiPaddle.x = AI_X;
    snap.aiPaddle.width = PADDLE_W;
    snap.aiPaddle.height = PADDLE_H;
    snap.helpOpen = !helpOverlayEl.hidden;
    snap.muted = sfx.isMuted();
    return snap;
  }

  // Keyboard controls
  document.addEventListener('keydown', function (e) {
    if (!helpOverlayEl.hidden) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeHelp();
      }
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault();
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      togglePause();
      return;
    }
    if (!state.paused) {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') keys.up = true;
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') keys.down = true;
    }
    if (e.key === 'r' || e.key === 'R') gameRestart();
  });
  document.addEventListener('keyup', function (e) {
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') keys.up = false;
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') keys.down = false;
  });

  // Touch paddle buttons — hold to move, same speed as keyboard
  playerUpBtn.addEventListener('pointerdown', function (e) {
    if (!state.paused) keys.up = true;
    e.preventDefault();
  }, { passive: false });
  playerUpBtn.addEventListener('pointerup', function () { keys.up = false; });
  playerUpBtn.addEventListener('pointercancel', function () { keys.up = false; });

  playerDownBtn.addEventListener('pointerdown', function (e) {
    if (!state.paused) keys.down = true;
    e.preventDefault();
  }, { passive: false });
  playerDownBtn.addEventListener('pointerup', function () { keys.down = false; });
  playerDownBtn.addEventListener('pointercancel', function () { keys.down = false; });

  // Restart button
  restartBtn.addEventListener('click', gameRestart);

  // Pause button
  pauseBtn.addEventListener('click', togglePause);

  // Mute button
  muteBtn.addEventListener('click', toggleMute);

  // Help panel
  helpBtn.addEventListener('click', openHelp);
  helpCloseBtn.addEventListener('click', closeHelp);
  helpOverlayEl.addEventListener('click', function (e) {
    if (e.target === helpOverlayEl) closeHelp();
  });

  // Test API
  window.__pongTest = {
    isReady: false,
    getState: publicState,
    readState: publicState,
    getDifficulty: getDifficulty,
    setState: function (nextState) {
      if (nextState.ball) Object.assign(state.ball, nextState.ball);
      if (nextState.playerPaddle) Object.assign(state.playerPaddle, nextState.playerPaddle);
      if (nextState.aiPaddle) Object.assign(state.aiPaddle, nextState.aiPaddle);
      ['playerScore', 'aiScore', 'gameState', 'winner', 'serveTimer', 'serveCount', 'serveToward', 'paused'].forEach(function (k) {
        if (nextState[k] !== undefined) state[k] = nextState[k];
      });
      updateHud();
      draw();
    },
    advanceFrames: function (count) {
      for (let i = 0; i < count; i++) {
        stepPhysics(FIXED_DT);
      }
      updateHud();
      draw();
      return publicState();
    },
    setAutoStep: function (enabled) {
      autoStep = enabled;
      if (enabled) {
        prevTimestamp = null;
      }
    },
    restart: function () {
      gameRestart();
      return publicState();
    },
    setMuted: function (value) {
      sfx.setMuted(Boolean(value));
      updateHud();
    }
  };

  // Start
  gameRestart();
  if (!hasSeenHelp()) openHelp();
  window.__pongTest.isReady = true;
  rafId = requestAnimationFrame(frame);
}());
