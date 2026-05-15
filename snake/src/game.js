(() => {
  const GRID_SIZE = 20;
  const CELL_SIZE = 20;
  const BASE_TICK_INTERVAL = 12;
  const MIN_TICK_INTERVAL = 4;
  const FOODS_PER_LEVEL = 5;

  const COLOR_BG   = '#020617';
  const COLOR_HEAD = '#f59e0b';
  const COLOR_BODY = '#d97706';
  const COLOR_FOOD = '#fb923c';
  const COLOR_GRID = '#0f172a';

  const canvas       = document.getElementById('game');
  const ctx          = canvas.getContext('2d');
  const scoreEl      = document.getElementById('score');
  const levelEl      = document.getElementById('level');
  const highScoreEl  = document.getElementById('high-score');
  const statusEl     = document.getElementById('status');
  const statusWrapEl = statusEl.closest('.status-wrap');
  const restartEl    = document.getElementById('restart');
  const touchButtons = Array.from(document.querySelectorAll('.touch-controls [data-action]'));

  const HIGH_SCORE_KEY = 'snake-high-score';

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

  let state = null;
  let autoStep = true;
  let rafId = null;
  let accumulator = 0;
  let lastTime = 0;
  let seededValue = (Math.random() * 4294967296) >>> 0;

  function nextRandom() {
    seededValue = (seededValue * 1664525 + 1013904223) >>> 0;
    return seededValue / 4294967296;
  }

  function spawnFood() {
    const occupied = new Set(state.snake.map((s) => `${s.x},${s.y}`));
    const free = [];
    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
        if (!occupied.has(`${x},${y}`)) free.push({ x, y });
      }
    }
    if (free.length === 0) {
      state.food = null;
      return;
    }
    state.food = free[Math.floor(nextRandom() * free.length)];
  }

  function onFoodEaten() {
    state.foodEaten += 1;
    state.score += 10 * state.level;
    if (state.score > state.highScore) {
      state.highScore = state.score;
      writeHighScore(state.highScore);
    }
    const newLevel = 1 + Math.floor(state.foodEaten / FOODS_PER_LEVEL);
    if (newLevel !== state.level) {
      state.level = newLevel;
      state.tickInterval = Math.max(MIN_TICK_INTERVAL, BASE_TICK_INTERVAL - (state.level - 1) * 2);
    }
    spawnFood();
  }

  function moveSnake() {
    const nd = state.nextDirection;
    const d  = state.direction;
    if (!(nd.x === -d.x && nd.y === -d.y)) state.direction = nd;

    const head    = state.snake[0];
    const newHead = { x: head.x + state.direction.x, y: head.y + state.direction.y };

    if (newHead.x < 0 || newHead.x >= GRID_SIZE || newHead.y < 0 || newHead.y >= GRID_SIZE) {
      state.gameOver = true;
      return;
    }

    const ateFood = state.food !== null && newHead.x === state.food.x && newHead.y === state.food.y;
    const checkLen = ateFood ? state.snake.length : state.snake.length - 1;
    for (let i = 0; i < checkLen; i += 1) {
      if (state.snake[i].x === newHead.x && state.snake[i].y === newHead.y) {
        state.gameOver = true;
        return;
      }
    }

    state.snake.unshift(newHead);
    if (ateFood) {
      onFoodEaten();
    } else {
      state.snake.pop();
    }
  }

  function oneFrame() {
    if (!state.gameOver) {
      state.tickCounter += 1;
      if (state.tickCounter >= state.tickInterval) {
        state.tickCounter = 0;
        moveSnake();
      }
      state.frame += 1;
    }
    render();
  }

  function advanceFrames(frameCount) {
    const loops = Math.max(0, Number(frameCount) || 0);
    for (let i = 0; i < loops; i += 1) oneFrame();
  }

  function tick(timestamp) {
    if (!autoStep) return;
    if (!lastTime) lastTime = timestamp;
    const delta  = timestamp - lastTime;
    lastTime     = timestamp;
    accumulator += delta;
    while (accumulator >= 1000 / 60) {
      oneFrame();
      accumulator -= 1000 / 60;
    }
    rafId = requestAnimationFrame(tick);
  }

  function setAutoStep(enabled) {
    autoStep = Boolean(enabled);
    if (autoStep && rafId === null) {
      lastTime    = 0;
      accumulator = 0;
      rafId = requestAnimationFrame(tick);
    } else if (!autoStep && rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function drawCell(x, y, color) {
    ctx.fillStyle   = color;
    ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
    ctx.strokeStyle = COLOR_GRID;
    ctx.strokeRect(x * CELL_SIZE + 0.5, y * CELL_SIZE + 0.5, CELL_SIZE - 1, CELL_SIZE - 1);
  }

  function render() {
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (state.food) drawCell(state.food.x, state.food.y, COLOR_FOOD);

    for (let i = 0; i < state.snake.length; i += 1) {
      drawCell(state.snake[i].x, state.snake[i].y, i === 0 ? COLOR_HEAD : COLOR_BODY);
    }

    if (state.gameOver) {
      ctx.fillStyle = 'rgba(2, 6, 23, 0.72)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle    = '#f59e0b';
      ctx.font         = 'bold 28px "Trebuchet MS", sans-serif';
      ctx.fillText('Game Over', canvas.width / 2, canvas.height / 2 - 18);
      ctx.fillStyle = '#c4a46b';
      ctx.font      = '14px "Trebuchet MS", sans-serif';
      ctx.fillText('Press R or Restart', canvas.width / 2, canvas.height / 2 + 14);
    }

    const foodToNext = FOODS_PER_LEVEL - (state.foodEaten % FOODS_PER_LEVEL);
    scoreEl.textContent     = String(state.score);
    levelEl.textContent     = String(state.level);
    highScoreEl.textContent = String(state.highScore);
    if (state.gameOver) {
      statusEl.textContent      = 'Game Over';
      statusWrapEl.dataset.tone = 'warning';
    } else {
      statusEl.textContent      = `${foodToNext} food to level ${state.level + 1}`;
      statusWrapEl.dataset.tone = 'normal';
    }
  }

  function setNextDirection(x, y) {
    state.nextDirection = { x, y };
  }

  function onKeyDown(event) {
    if (event.key === 'r' || event.key === 'R') {
      restartGame();
      return;
    }
    if (state.gameOver) return;
    switch (event.key) {
      case 'ArrowUp':    case 'w': case 'W': setNextDirection(0, -1);  break;
      case 'ArrowDown':  case 's': case 'S': setNextDirection(0,  1);  break;
      case 'ArrowLeft':  case 'a': case 'A': setNextDirection(-1, 0);  break;
      case 'ArrowRight': case 'd': case 'D': setNextDirection(1,  0);  break;
    }
  }

  function restartGame() {
    seededValue = (Math.random() * 4294967296) >>> 0;
    state = {
      snake:         [{ x: 12, y: 10 }, { x: 11, y: 10 }, { x: 10, y: 10 }],
      direction:     { x: 1, y: 0 },
      nextDirection: { x: 1, y: 0 },
      food:          null,
      score:         0,
      highScore:     readHighScore(),
      level:         1,
      foodEaten:     0,
      tickInterval:  BASE_TICK_INTERVAL,
      tickCounter:   0,
      gameOver:      false,
      frame:         0
    };
    spawnFood();
    render();
  }

  restartEl.addEventListener('click', restartGame);
  window.addEventListener('keydown', onKeyDown);

  for (const button of touchButtons) {
    const action = button.dataset.action;
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      switch (action) {
        case 'up':      setNextDirection(0, -1);  break;
        case 'down':    setNextDirection(0,  1);  break;
        case 'left':    setNextDirection(-1, 0);  break;
        case 'right':   setNextDirection(1,  0);  break;
        case 'restart': restartGame();            break;
      }
    });
  }

  restartGame();
  setAutoStep(true);

  window.__snakeTest = {
    isReady: true,
    getState() {
      return structuredClone(state);
    },
    setState(nextState) {
      state = structuredClone(nextState);
      if (!Array.isArray(state.snake) || state.snake.length === 0) {
        state.snake = [{ x: 12, y: 10 }, { x: 11, y: 10 }, { x: 10, y: 10 }];
      }
      if (!state.direction)     state.direction     = { x: 1, y: 0 };
      if (!state.nextDirection) state.nextDirection = structuredClone(state.direction);
      if (state.food == null)   spawnFood();
      render();
    },
    async advanceFrames(frameCount) {
      advanceFrames(frameCount);
    },
    setAutoStep(enabled) {
      setAutoStep(enabled);
    },
    async restart() {
      restartGame();
    },
    setSeededValue(n) {
      seededValue = ((n >>> 0) || 1);
    }
  };
})();
