(() => {
  const GRID_SIZE = 4;
  const WIN_VALUE = 2048;
  const BEST_STORAGE_KEY = '2048-best';

  const gridEl = document.getElementById('grid');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const statusEl = document.getElementById('status');
  const statusWrapEl = statusEl.closest('.status-wrap');
  const restartEl = document.getElementById('restart');

  const cells = Array.from({ length: GRID_SIZE * GRID_SIZE }, () => {
    const div = document.createElement('div');
    div.className = 'cell';
    gridEl.appendChild(div);
    return div;
  });

  let rngSeed = (Math.random() * 4294967296) >>> 0;

  function nextRandom() {
    rngSeed = (rngSeed * 1664525 + 1013904223) >>> 0;
    return rngSeed / 4294967296;
  }

  function loadBest() {
    try {
      return Number(localStorage.getItem(BEST_STORAGE_KEY)) || 0;
    } catch {
      return 0;
    }
  }

  function saveBest(value) {
    try {
      localStorage.setItem(BEST_STORAGE_KEY, String(value));
    } catch {}
  }

  function createGrid() {
    return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
  }

  function transpose(grid) {
    return Array.from({ length: GRID_SIZE }, (_, r) =>
      Array.from({ length: GRID_SIZE }, (_, c) => grid[c][r])
    );
  }

  function slideRow(row) {
    const tiles = row.filter(v => v !== 0);
    const merged = [];
    let scoreGained = 0;
    let i = 0;
    while (i < tiles.length) {
      if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
        const val = tiles[i] * 2;
        merged.push(val);
        scoreGained += val;
        i += 2;
      } else {
        merged.push(tiles[i]);
        i += 1;
      }
    }
    while (merged.length < GRID_SIZE) merged.push(0);
    return { row: merged, scoreGained };
  }

  let state = null;
  let autoStep = true;
  let rafId = null;

  function slide(direction) {
    let grid = state.grid.map(row => row.slice());
    let scoreGained = 0;
    let moved = false;

    if (direction === 'right') {
      grid = grid.map(row => row.slice().reverse());
    } else if (direction === 'up') {
      grid = transpose(grid);
    } else if (direction === 'down') {
      grid = transpose(grid).map(row => row.slice().reverse());
    }

    grid = grid.map(row => {
      const before = row.join(',');
      const result = slideRow(row);
      scoreGained += result.scoreGained;
      if (result.row.join(',') !== before) moved = true;
      return result.row;
    });

    if (direction === 'right') {
      grid = grid.map(row => row.slice().reverse());
    } else if (direction === 'up') {
      grid = transpose(grid);
    } else if (direction === 'down') {
      grid = grid.map(row => row.slice().reverse());
      grid = transpose(grid);
    }

    if (!moved) return false;

    state.grid = grid;
    state.score += scoreGained;
    if (state.score > state.best) {
      state.best = state.score;
      saveBest(state.best);
    }

    return true;
  }

  function spawnTile() {
    const empty = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (state.grid[r][c] === 0) empty.push([r, c]);
      }
    }
    if (empty.length === 0) return;
    const [row, col] = empty[Math.floor(nextRandom() * empty.length)];
    state.grid[row][col] = nextRandom() < 0.9 ? 2 : 4;
  }

  function checkWin() {
    if (state.won) return;
    for (const row of state.grid) {
      for (const val of row) {
        if (val >= WIN_VALUE) {
          state.won = true;
          state.statusMessage = 'You Win!';
          return;
        }
      }
    }
  }

  function hasValidMoves() {
    for (const row of state.grid) {
      if (row.includes(0)) return true;
    }
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE - 1; c++) {
        if (state.grid[r][c] === state.grid[r][c + 1]) return true;
      }
    }
    for (let r = 0; r < GRID_SIZE - 1; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (state.grid[r][c] === state.grid[r + 1][c]) return true;
      }
    }
    return false;
  }

  function checkGameOver() {
    if (state.gameOver) return;
    if (!hasValidMoves()) {
      state.gameOver = true;
      state.statusMessage = 'Game Over';
    }
  }

  function render() {
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const idx = r * GRID_SIZE + c;
        const val = state.grid[r][c];
        const cell = cells[idx];
        cell.textContent = val === 0 ? '' : String(val);
        cell.dataset.value = val === 0 ? '' : String(val);
      }
    }
    scoreEl.textContent = String(state.score);
    bestEl.textContent = String(state.best);
    statusEl.textContent = state.statusMessage;
    if (state.won) {
      statusWrapEl.dataset.tone = 'win';
    } else if (state.gameOver) {
      statusWrapEl.dataset.tone = 'loss';
    } else {
      delete statusWrapEl.dataset.tone;
    }
  }

  function restartGame() {
    rngSeed = (Math.random() * 4294967296) >>> 0;
    state = {
      grid: createGrid(),
      score: 0,
      best: loadBest(),
      gameOver: false,
      won: false,
      statusMessage: 'Playing'
    };
    spawnTile();
    spawnTile();
    render();
  }

  function handleKey(event) {
    if (state.gameOver) return;
    const directionMap = {
      ArrowLeft: 'left',
      ArrowRight: 'right',
      ArrowUp: 'up',
      ArrowDown: 'down'
    };
    const direction = directionMap[event.key];
    if (!direction) return;
    event.preventDefault();
    const moved = slide(direction);
    if (moved) {
      spawnTile();
      checkWin();
    }
    checkGameOver();
    render();
  }

  let touchStartX = 0;
  let touchStartY = 0;
  const SWIPE_THRESHOLD = 30;

  function handleTouchEnd(event) {
    if (state.gameOver) return;
    const dx = event.changedTouches[0].clientX - touchStartX;
    const dy = event.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) return;
    let direction;
    if (Math.abs(dx) > Math.abs(dy)) {
      direction = dx > 0 ? 'right' : 'left';
    } else {
      direction = dy > 0 ? 'down' : 'up';
    }
    const moved = slide(direction);
    if (moved) {
      spawnTile();
      checkWin();
    }
    checkGameOver();
    render();
  }

  window.addEventListener('keydown', handleKey);
  document.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchend', handleTouchEnd, { passive: true });
  restartEl.addEventListener('click', restartGame);

  function setAutoStep(enabled) {
    autoStep = Boolean(enabled);
    if (autoStep && rafId === null) {
      rafId = requestAnimationFrame(tick);
    } else if (!autoStep && rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function tick() {
    if (!autoStep) return;
    rafId = requestAnimationFrame(tick);
  }

  restartGame();
  setAutoStep(true);

  window.__2048Test = {
    isReady: true,
    getState() {
      return {
        grid: state.grid.map(row => row.slice()),
        score: state.score,
        best: state.best,
        gameOver: state.gameOver,
        won: state.won,
        rngSeed,
        statusMessage: state.statusMessage
      };
    },
    setState(nextState) {
      if (Array.isArray(nextState.grid)) {
        state.grid = nextState.grid.map(row => row.slice());
      }
      if (typeof nextState.score === 'number') state.score = nextState.score;
      if (typeof nextState.best === 'number') {
        state.best = nextState.best;
        saveBest(state.best);
      }
      if (typeof nextState.gameOver === 'boolean') state.gameOver = nextState.gameOver;
      if (typeof nextState.won === 'boolean') state.won = nextState.won;
      if (typeof nextState.rngSeed === 'number') rngSeed = nextState.rngSeed;
      if (typeof nextState.statusMessage === 'string') state.statusMessage = nextState.statusMessage;
      render();
    },
    async advanceFrames(n) {
      const count = Math.max(0, Number(n) || 0);
      for (let i = 0; i < count; i++) render();
    },
    setAutoStep(enabled) {
      setAutoStep(enabled);
    },
    restart() {
      restartGame();
    },
    spawnTile(value, row, col) {
      if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return;
      if (typeof value !== 'number' || value <= 0) return;
      state.grid[row][col] = value;
      render();
    }
  };
})();
