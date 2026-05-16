(function () {
  'use strict';

  const WIDTH = 800;
  const HEIGHT = 520;
  const PADDLE_W = 12;
  const PADDLE_H = 80;
  const BALL_R = 8;
  const PLAYER_X = 24;
  const AI_X = WIDTH - 24 - PADDLE_W;
  const PADDLE_SPEED = 480;
  const AI_SPEED = 340;
  const BALL_SPEED = 260;
  const WIN_SCORE = 7;
  const FIXED_DT = 1 / 60;
  const SERVE_DELAY = 60;
  const NET_H = 10;
  const NET_GAP = 8;
  const BALL_SPEED_MAX = 520;
  const BALL_SPEED_ACCEL = 1.05;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const playerScoreEl = document.getElementById('player-score');
  const aiScoreEl = document.getElementById('ai-score');
  const statusEl = document.getElementById('status');
  const dragLane = document.getElementById('player-drag-lane');
  const restartBtn = document.getElementById('restart');

  const keys = { up: false, down: false };
  let autoStep = true;
  let rafId = null;
  let prevTimestamp = null;

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
    serveToward: 'ai'
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

  function launchBall(towardPlayer) {
    const n = state.serveCount;
    const ySign = (n % 2 === 0 ? 1 : -1);
    state.ball.dy = ySign * BALL_SPEED * 0.5;
    state.ball.dx = towardPlayer ? -BALL_SPEED : BALL_SPEED;
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
    } else if (state.aiScore >= WIN_SCORE) {
      state.gameState = 'won';
      state.winner = 'ai';
    } else {
      resetBall();
      state.gameState = 'serving';
      state.serveTimer = SERVE_DELAY;
    }
  }

  function stepPhysics(dt) {
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

    // AI paddle follows ball
    const aiCenter = ap.y + PADDLE_H / 2;
    const diff = ball.y - aiCenter;
    if (Math.abs(diff) > 4) {
      const move = Math.min(Math.abs(diff), AI_SPEED * dt) * Math.sign(diff);
      ap.y = clamp(ap.y + move, 0, HEIGHT - PADDLE_H);
    }

    // Move ball
    ball.x += ball.dx * dt;
    ball.y += ball.dy * dt;

    // Wall bounce top/bottom
    if (ball.y - BALL_R < 0) {
      ball.y = BALL_R;
      ball.dy = Math.abs(ball.dy);
    } else if (ball.y + BALL_R > HEIGHT) {
      ball.y = HEIGHT - BALL_R;
      ball.dy = -Math.abs(ball.dy);
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
  }

  function updateHud() {
    playerScoreEl.textContent = String(state.playerScore);
    aiScoreEl.textContent = String(state.aiScore);
    if (state.gameState === 'won') {
      statusEl.textContent = state.winner === 'player' ? 'You Win!' : 'AI Wins!';
    } else if (state.gameState === 'serving') {
      statusEl.textContent = 'Serving';
    } else {
      statusEl.textContent = 'Playing';
    }
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
    return snap;
  }

  // Keyboard controls
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') keys.up = true;
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') keys.down = true;
  });
  document.addEventListener('keyup', function (e) {
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') keys.up = false;
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') keys.down = false;
  });

  // Mouse control
  canvas.addEventListener('mousemove', function (e) {
    if (state.gameState === 'won') return;
    const rect = canvas.getBoundingClientRect();
    const scale = HEIGHT / rect.height;
    const canvasY = (e.clientY - rect.top) * scale;
    state.playerPaddle.y = clamp(canvasY - PADDLE_H / 2, 0, HEIGHT - PADDLE_H);
  });

  // Touch drag lane
  let dragStartY = null;
  let dragStartPaddleY = null;
  dragLane.addEventListener('pointerdown', function (e) {
    dragLane.setPointerCapture(e.pointerId);
    dragStartY = e.clientY;
    dragStartPaddleY = state.playerPaddle.y;
  });
  dragLane.addEventListener('pointermove', function (e) {
    if (dragStartY === null) return;
    const rect = canvas.getBoundingClientRect();
    const scale = HEIGHT / rect.height;
    const dy = (e.clientY - dragStartY) * scale;
    state.playerPaddle.y = clamp(dragStartPaddleY + dy, 0, HEIGHT - PADDLE_H);
  });
  dragLane.addEventListener('pointerup', function () {
    dragStartY = null;
    dragStartPaddleY = null;
  });
  dragLane.addEventListener('pointercancel', function () {
    dragStartY = null;
    dragStartPaddleY = null;
  });

  // Restart button
  restartBtn.addEventListener('click', gameRestart);

  // Test API
  window.__pongTest = {
    isReady: false,
    getState: publicState,
    readState: publicState,
    setState: function (nextState) {
      if (nextState.ball) Object.assign(state.ball, nextState.ball);
      if (nextState.playerPaddle) Object.assign(state.playerPaddle, nextState.playerPaddle);
      if (nextState.aiPaddle) Object.assign(state.aiPaddle, nextState.aiPaddle);
      ['playerScore', 'aiScore', 'gameState', 'winner', 'serveTimer', 'serveCount', 'serveToward'].forEach(function (k) {
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
    }
  };

  // Start
  gameRestart();
  window.__pongTest.isReady = true;
  rafId = requestAnimationFrame(frame);
}());
