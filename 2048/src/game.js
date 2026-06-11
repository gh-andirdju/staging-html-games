(() => {
  const GRID_SIZE = 4;
  const WIN_VALUE = 2048;
  const BEST_STORAGE_KEY = '2048-best';
  const GUIDE_STORAGE_KEY = '2048-guide-seen';
  const MUTED_STORAGE_KEY = '2048-muted';
  const GUIDE_TOTAL_STEPS = 4;

  const gridEl = document.getElementById('grid');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const statusEl = document.getElementById('status');
  const statusWrapEl = statusEl.closest('.status-wrap');
  const restartEl = document.getElementById('restart');
  const muteEl = document.getElementById('mute');
  const guideOverlayEl = document.getElementById('guide-overlay');
  const guideNextEl = document.getElementById('guide-next');
  const guidePrevEl = document.getElementById('guide-prev');
  const guideCloseEl = document.getElementById('guide-close');
  const guideHelpEl = document.getElementById('guide-help');
  const guideLiveEl = document.getElementById('guide-live');
  const guideStepEls = Array.from(document.querySelectorAll('.guide-step'));
  const guideDotEls = Array.from(document.querySelectorAll('.guide-dot'));

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

  function createSfx() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    let muted = readMuted();
    let gestureSeen = false;
    let audioCtx = null;

    function readMuted() {
      try {
        return localStorage.getItem(MUTED_STORAGE_KEY) === '1';
      } catch {
        return false;
      }
    }

    function writeMuted(value) {
      try {
        localStorage.setItem(MUTED_STORAGE_KEY, value ? '1' : '0');
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
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      return audioCtx;
    }

    function tone(startFreq, endFreq, duration, delay = 0, type = 'triangle', peak = 0.1) {
      const audio = getAudio();
      if (!audio) return;
      try {
        const startAt = audio.currentTime + delay;
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(startFreq, startAt);
        if (endFreq !== startFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, startAt + duration);
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
        osc.connect(gain);
        gain.connect(audio.destination);
        osc.start(startAt);
        osc.stop(startAt + duration + 0.05);
      } catch {}
    }

    return {
      isMuted() {
        return muted;
      },
      setMuted(value) {
        muted = Boolean(value);
        writeMuted(muted);
      },
      playSlide() {
        tone(200, 200, 0.04, 0, 'triangle', 0.05);
      },
      playMerge(value) {
        const freq = 280 + Math.log2(Math.max(4, value)) * 55;
        tone(freq, freq, 0.08, 0, 'triangle', 0.11);
      },
      playGameOver() {
        tone(330, 110, 0.15, 0, 'sawtooth', 0.09);
      }
    };
  }

  const sfx = createSfx();

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
    const mergeAt = [];
    let scoreGained = 0;
    let i = 0;
    while (i < tiles.length) {
      if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
        const val = tiles[i] * 2;
        mergeAt.push(merged.length);
        merged.push(val);
        scoreGained += val;
        i += 2;
      } else {
        merged.push(tiles[i]);
        i += 1;
      }
    }
    while (merged.length < GRID_SIZE) merged.push(0);
    return { row: merged, scoreGained, mergeAt };
  }

  let state = null;
  let autoStep = true;
  let rafId = null;
  let guideStep = -1;
  let focusBeforeGuide = null;

  function unmapPosition(direction, rowIdx, colIdx) {
    if (direction === 'left') return [rowIdx, colIdx];
    if (direction === 'right') return [rowIdx, GRID_SIZE - 1 - colIdx];
    if (direction === 'up') return [colIdx, rowIdx];
    return [GRID_SIZE - 1 - colIdx, rowIdx]; // down
  }

  function slide(direction) {
    state.newTilePos = null;
    state.mergedCells = new Set();

    let grid = state.grid.map(row => row.slice());
    let scoreGained = 0;
    let moved = false;
    const mergedCells = new Set();

    if (direction === 'right') {
      grid = grid.map(row => row.slice().reverse());
    } else if (direction === 'up') {
      grid = transpose(grid);
    } else if (direction === 'down') {
      grid = transpose(grid).map(row => row.slice().reverse());
    }

    grid = grid.map((row, rowIdx) => {
      const before = row.join(',');
      const result = slideRow(row);
      scoreGained += result.scoreGained;
      if (result.row.join(',') !== before) moved = true;
      result.mergeAt.forEach(colIdx => {
        const [r, c] = unmapPosition(direction, rowIdx, colIdx);
        mergedCells.add(`${r},${c}`);
      });
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
    state.mergedCells = mergedCells;
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
    state.newTilePos = [row, col];
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
      sfx.playGameOver();
    }
  }

  function playMoveSound() {
    let maxMerged = 0;
    state.mergedCells.forEach(key => {
      const [r, c] = key.split(',').map(Number);
      maxMerged = Math.max(maxMerged, state.grid[r][c]);
    });
    if (maxMerged > 0) {
      sfx.playMerge(maxMerged);
    } else {
      sfx.playSlide();
    }
  }

  function render() {
    cells.forEach(cell => cell.classList.remove('tile-new', 'tile-merged'));
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
    if (state.gameOver) {
      statusWrapEl.dataset.tone = 'loss';
    } else if (state.won) {
      statusWrapEl.dataset.tone = 'win';
    } else {
      delete statusWrapEl.dataset.tone;
    }
    void gridEl.offsetWidth;
    if (state.newTilePos) {
      const [r, c] = state.newTilePos;
      cells[r * GRID_SIZE + c].classList.add('tile-new');
    }
    if (state.mergedCells) {
      state.mergedCells.forEach(key => {
        const [r, c] = key.split(',').map(Number);
        cells[r * GRID_SIZE + c].classList.add('tile-merged');
      });
    }
  }

  const gameShellEl = document.querySelector('.game-shell');

  function renderGuide() {
    guideStepEls.forEach((el, i) => { el.hidden = i !== guideStep; });
    guideDotEls.forEach((el, i) => el.classList.toggle('active', i === guideStep));
    const backWasActive = document.activeElement === guidePrevEl;
    guidePrevEl.hidden = guideStep === 0;
    if (guidePrevEl.hidden && backWasActive) guideNextEl.focus();
    guideNextEl.textContent = guideStep === GUIDE_TOTAL_STEPS - 1 ? 'Start Playing' : 'Next';
    guideOverlayEl.setAttribute('aria-labelledby', `guide-title-${guideStep}`);
    if (guideLiveEl) {
      const title = guideStepEls[guideStep]?.querySelector('.guide-title')?.textContent ?? '';
      const announcement = `${title} — Step ${guideStep + 1} of ${GUIDE_TOTAL_STEPS}`;
      guideLiveEl.textContent = '';
      setTimeout(() => { guideLiveEl.textContent = announcement; }, 0);
    }
  }

  function showGuide(step) {
    guideStep = Math.max(0, Math.min(GUIDE_TOTAL_STEPS - 1, step ?? 0));
    if (guideOverlayEl.hidden) focusBeforeGuide = document.activeElement;
    guideOverlayEl.hidden = false;
    gameShellEl.setAttribute('inert', '');
    renderGuide();
    guideNextEl.focus();
  }

  function hideGuide() {
    guideOverlayEl.hidden = true;
    gameShellEl.removeAttribute('inert');
    guideStep = -1;
    try { localStorage.setItem(GUIDE_STORAGE_KEY, '1'); } catch {}
    focusBeforeGuide?.focus();
    focusBeforeGuide = null;
  }

  function hasSeenGuide() {
    try { return Boolean(localStorage.getItem(GUIDE_STORAGE_KEY)); } catch { return false; }
  }

  guideNextEl.addEventListener('click', () => {
    if (guideStep >= GUIDE_TOTAL_STEPS - 1) { hideGuide(); return; }
    guideStep++;
    renderGuide();
  });
  guidePrevEl.addEventListener('click', () => {
    if (guideStep <= 0) return;
    guideStep--;
    renderGuide();
    // renderGuide() moves focus to Next only when Back becomes hidden (step 0);
    // otherwise focus naturally stays on guidePrevEl (the still-visible Back button)
  });
  guideCloseEl.addEventListener('click', hideGuide);
  guideHelpEl.addEventListener('click', () => showGuide(0));

  guideOverlayEl.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      hideGuide();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(guideOverlayEl.querySelectorAll('button:not([hidden])'));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey) {
      if (document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  function restartGame() {
    rngSeed = (Math.random() * 4294967296) >>> 0;
    state = {
      grid: createGrid(),
      score: 0,
      best: loadBest(),
      gameOver: false,
      won: false,
      statusMessage: 'Playing',
      newTilePos: null,
      mergedCells: new Set()
    };
    spawnTile();
    spawnTile();
    state.newTilePos = null;
    render();
  }

  function handleKey(event) {
    const directionMap = {
      ArrowLeft: 'left',
      ArrowRight: 'right',
      ArrowUp: 'up',
      ArrowDown: 'down'
    };
    if (event.key === 'r' || event.key === 'R') {
      if (!guideOverlayEl.hidden) return;
      if (state.gameOver) restartGame();
      return;
    }
    const direction = directionMap[event.key];
    if (!direction) return;
    event.preventDefault();
    if (!guideOverlayEl.hidden) return;
    if (state.gameOver) return;
    const moved = slide(direction);
    if (moved) {
      playMoveSound();
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
    if (!guideOverlayEl.hidden) return;
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
      playMoveSound();
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

  function updateMuteButton() {
    muteEl.textContent = sfx.isMuted() ? '🔇' : '🔊';
    muteEl.setAttribute('aria-pressed', sfx.isMuted() ? 'true' : 'false');
  }

  muteEl.addEventListener('click', () => {
    sfx.setMuted(!sfx.isMuted());
    updateMuteButton();
  });

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
  updateMuteButton();
  setAutoStep(true);
  if (!hasSeenGuide()) showGuide(0);

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
        statusMessage: state.statusMessage,
        muted: sfx.isMuted()
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
      state.newTilePos = null;
      state.mergedCells = new Set();
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
      state.newTilePos = [row, col];
      state.mergedCells = new Set();
      checkWin();
      checkGameOver();
      render();
    },
    setMuted(value) {
      sfx.setMuted(Boolean(value));
      updateMuteButton();
    },
    isGuideVisible() { return !guideOverlayEl.hidden; },
    getGuideStep() { return guideStep; },
    showGuide(step) { showGuide(step); },
    dismissGuide() { hideGuide(); }
  };
})();
