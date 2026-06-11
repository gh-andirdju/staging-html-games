(() => {
  const DIFFICULTIES = {
    easy:   { rows: 9,  cols: 9,  mines: 10 },
    normal: { rows: 12, cols: 12, mines: 25 },
    hard:   { rows: 16, cols: 16, mines: 51 },
  };

  const NUM_COLORS = ['', '#1d4ed8', '#15803d', '#dc2626', '#1e3a8a', '#9f1239', '#0e7490', '#374151', '#6b7280'];

  const COLOR_UNREVEALED    = '#475569';
  const COLOR_UNREVEALED_HL = '#64748b';
  const COLOR_REVEALED      = '#e2e8f0';
  const COLOR_REVEALED_DARK = '#cbd5e1';
  const COLOR_MINE          = '#dc2626';
  const COLOR_MINE_BG       = '#1e293b';
  const COLOR_FLAG          = '#f59e0b';
  const COLOR_CORRECT_FLAG  = '#16a34a';
  const COLOR_GRID          = '#1e293b';

  const NEIGHBORS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];

  const TICK_FRAMES = 60;
  const STATUS_FRAMES = 180;

  const canvas      = document.getElementById('game');
  const ctx         = canvas.getContext('2d');
  const minesEl     = document.getElementById('mines-remaining');
  const timeEl      = document.getElementById('time');
  const bestEl      = document.getElementById('best');
  const diffLabelEl = document.getElementById('difficulty-label');
  const statusEl    = document.getElementById('status');
  const statusWrapEl = statusEl.closest('.status-wrap');
  const restartEl   = document.getElementById('restart');
  const helpEl      = document.getElementById('help');
  const helpOverlayEl = document.getElementById('help-overlay');
  const helpCloseEl = document.getElementById('help-close');
  const gameShellEl = document.querySelector('.game-shell');
  const diffBtns    = Array.from(document.querySelectorAll('.diff-btn'));
  const modeBtns    = Array.from(document.querySelectorAll('[data-action]'));

  const BEST_TIMES_KEY = 'minesweeper-best-times';
  const HELP_SEEN_KEY  = 'minesweeper-help-seen';

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

  function readBestTimes() {
    const times = { easy: null, normal: null, hard: null };
    try {
      const parsed = JSON.parse(window.localStorage.getItem(BEST_TIMES_KEY));
      if (parsed && typeof parsed === 'object') {
        for (const diff of Object.keys(times)) {
          if (typeof parsed[diff] === 'number' && parsed[diff] >= 0) times[diff] = parsed[diff];
        }
      }
    } catch {}
    return times;
  }

  function writeBestTimes(times) {
    try {
      window.localStorage.setItem(BEST_TIMES_KEY, JSON.stringify(times));
    } catch {}
  }

  let state = null;
  let autoStep = true;
  let rafId = null;

  function makeCell() {
    return { mine: false, revealed: false, flagged: false, adjacent: 0 };
  }

  function initBoard(rows, cols) {
    const board = [];
    for (let r = 0; r < rows; r++) {
      board.push([]);
      for (let c = 0; c < cols; c++) {
        board[r].push(makeCell());
      }
    }
    return board;
  }

  function placeMines(safeRow, safeCol) {
    const { rows, cols, mines, board } = state;
    const positions = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (Math.abs(r - safeRow) <= 1 && Math.abs(c - safeCol) <= 1) continue;
        positions.push([r, c]);
      }
    }
    shuffle(positions);
    const count = Math.min(mines, positions.length);
    for (let i = 0; i < count; i++) {
      const [r, c] = positions[i];
      board[r][c].mine = true;
    }
    calcAdjacent();
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  function calcAdjacent() {
    const { rows, cols, board } = state;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (board[r][c].mine) { board[r][c].adjacent = 0; continue; }
        let count = 0;
        for (const [dr, dc] of NEIGHBORS) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && board[nr][nc].mine) count++;
        }
        board[r][c].adjacent = count;
      }
    }
  }

  function revealCell(row, col) {
    const { board, rows, cols } = state;
    if (row < 0 || row >= rows || col < 0 || col >= cols) return;
    const cell = board[row][col];
    if (cell.revealed || cell.flagged) return;

    if (!state.started) {
      placeMines(row, col);
      state.started = true;
    }

    if (cell.mine) {
      cell.revealed = true;
      state.gameOver = true;
      state.statusMessage = 'Game over — hit a mine!';
      state.statusTone = 'warning';
      state.statusMessageTimer = STATUS_FRAMES;
      revealAllMines();
      updateHud();
      return;
    }

    doReveal(row, col);

    if (checkWin()) {
      state.won = true;
      state.gameOver = true;
      const bestTimes = readBestTimes();
      const previousBest = bestTimes[state.difficulty];
      if (previousBest == null || state.timeElapsed < previousBest) {
        bestTimes[state.difficulty] = state.timeElapsed;
        writeBestTimes(bestTimes);
        state.bestTime = state.timeElapsed;
        state.statusMessage = `Cleared in ${state.timeElapsed}s — New best time!`;
      } else {
        state.statusMessage = `Cleared in ${state.timeElapsed}s · Best ${previousBest}s`;
      }
      state.statusTone = 'milestone';
      state.statusMessageTimer = STATUS_FRAMES;
      flagAllMines();
    }
    updateHud();
  }

  function doReveal(row, col) {
    const { board, rows, cols } = state;
    const stack = [[row, col]];
    while (stack.length > 0) {
      const [r, c] = stack.pop();
      if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
      const cell = board[r][c];
      if (cell.revealed || cell.flagged || cell.mine) continue;
      cell.revealed = true;
      state.revealed++;
      if (cell.adjacent === 0) {
        for (const [dr, dc] of NEIGHBORS) {
          stack.push([r + dr, c + dc]);
        }
      }
    }
  }

  function revealAllMines() {
    const { board, rows, cols } = state;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (board[r][c].mine && !board[r][c].flagged) board[r][c].revealed = true;
      }
    }
  }

  function flagAllMines() {
    const { board, rows, cols } = state;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (board[r][c].mine && !board[r][c].flagged) {
          board[r][c].flagged = true;
          state.flagged++;
        }
      }
    }
  }

  function toggleFlag(row, col) {
    const { board, rows, cols } = state;
    if (row < 0 || row >= rows || col < 0 || col >= cols) return;
    const cell = board[row][col];
    if (cell.revealed) return;
    if (cell.flagged) {
      cell.flagged = false;
      state.flagged--;
    } else {
      cell.flagged = true;
      state.flagged++;
    }
    updateHud();
  }

  function chordReveal(row, col) {
    if (state.gameOver) return;
    const { board, rows, cols } = state;
    if (row < 0 || row >= rows || col < 0 || col >= cols) return;
    const cell = board[row][col];
    if (!cell.revealed || cell.adjacent === 0) return;
    let flagCount = 0;
    for (const [dr, dc] of NEIGHBORS) {
      const nr = row + dr, nc = col + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && board[nr][nc].flagged) flagCount++;
    }
    if (flagCount !== cell.adjacent) return;
    for (const [dr, dc] of NEIGHBORS) {
      const nr = row + dr, nc = col + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) revealCell(nr, nc);
    }
  }

  function checkWin() {
    const { rows, cols, mines } = state;
    return state.revealed === rows * cols - mines;
  }

  function restartGame(difficulty) {
    if (difficulty) state = null;
    const diff = difficulty || (state && state.difficulty) || 'easy';
    const { rows, cols, mines } = DIFFICULTIES[diff];
    state = {
      board: initBoard(rows, cols),
      rows,
      cols,
      mines,
      revealed: 0,
      flagged: 0,
      gameOver: false,
      won: false,
      started: false,
      difficulty: diff,
      touchMode: 'reveal',
      bestTime: readBestTimes()[diff],
      frame: 0,
      timeElapsed: 0,
      tickCounter: 0,
      statusMessage: 'Click any cell to start',
      statusTone: 'normal',
      statusMessageTimer: 0,
    };
    updateDiffButtons();
    updateHud();
    resizeCanvas();
    draw();
  }

  function updateHud() {
    const remaining = state.mines - state.flagged;
    minesEl.textContent = remaining;
    timeEl.textContent = `${state.timeElapsed}s`;
    bestEl.textContent = state.bestTime == null ? '—' : `${state.bestTime}s`;
    diffLabelEl.textContent = state.difficulty.charAt(0).toUpperCase() + state.difficulty.slice(1);
    statusEl.textContent = state.statusMessage;
    statusWrapEl.dataset.tone = state.statusTone;
    modeBtns.forEach((btn) => {
      const active = btn.dataset.action === state.touchMode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  function updateDiffButtons() {
    diffBtns.forEach((btn) => {
      const active = btn.dataset.difficulty === state.difficulty;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-current', active ? 'true' : 'false');
    });
  }

  function resizeCanvas() {
    const { rows, cols } = state;
    const maxSize = Math.min(460, window.innerWidth - 32);
    const cellSize = Math.floor(maxSize / Math.max(rows, cols));
    const w = cellSize * cols;
    const h = cellSize * rows;
    canvas.width = w;
    canvas.height = h;
  }

  function getCellSize() {
    return Math.floor(canvas.width / state.cols);
  }

  function draw() {
    const { rows, cols } = state;
    const cs = getCellSize();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        drawCell(r, c, cs);
      }
    }
  }

  function drawCell(r, c, cs) {
    const { gameOver, won } = state;
    const cell = state.board[r][c];
    const x = c * cs;
    const y = r * cs;

    if (cell.revealed) {
      if (cell.mine) {
        ctx.fillStyle = COLOR_MINE_BG;
        ctx.fillRect(x, y, cs, cs);
        drawMine(x, y, cs, gameOver && !won ? COLOR_MINE : '#6b7280');
      } else {
        ctx.fillStyle = (r + c) % 2 === 0 ? COLOR_REVEALED : COLOR_REVEALED_DARK;
        ctx.fillRect(x, y, cs, cs);
        if (cell.adjacent > 0) {
          ctx.fillStyle = NUM_COLORS[cell.adjacent] || '#374151';
          ctx.font = `bold ${Math.floor(cs * 0.55)}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(cell.adjacent), x + cs / 2, y + cs / 2 + 1);
        }
      }
    } else {
      ctx.fillStyle = (r + c) % 2 === 0 ? COLOR_UNREVEALED : COLOR_UNREVEALED_HL;
      ctx.fillRect(x, y, cs, cs);
      if (cell.flagged) {
        if (gameOver && !cell.mine) {
          drawWrongFlag(x, y, cs);
        } else if (gameOver && cell.mine) {
          drawFlag(x, y, cs, COLOR_CORRECT_FLAG);
        } else {
          drawFlag(x, y, cs, COLOR_FLAG);
        }
      }
    }

    ctx.strokeStyle = COLOR_GRID;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, cs - 1, cs - 1);
  }

  function drawMine(x, y, cs, color) {
    const cx = x + cs / 2;
    const cy = y + cs / 2;
    const r = cs * 0.28;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.arc(cx - r * 0.25, cy - r * 0.25, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawFlag(x, y, cs, color = COLOR_FLAG) {
    const px = x + cs * 0.3;
    const py = y + cs * 0.2;
    const fw = cs * 0.35;
    const fh = cs * 0.3;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + fw, py + fh / 2);
    ctx.lineTo(px, py + fh);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = cs * 0.08;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, y + cs * 0.78);
    ctx.stroke();
  }

  function drawWrongFlag(x, y, cs) {
    ctx.strokeStyle = COLOR_MINE;
    ctx.lineWidth = cs * 0.1;
    const pad = cs * 0.25;
    ctx.beginPath();
    ctx.moveTo(x + pad, y + pad);
    ctx.lineTo(x + cs - pad, y + cs - pad);
    ctx.moveTo(x + cs - pad, y + pad);
    ctx.lineTo(x + pad, y + cs - pad);
    ctx.stroke();
  }

  function cellFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    const cs = getCellSize();
    const col = Math.floor(x / cs);
    const row = Math.floor(y / cs);
    return { row, col };
  }

  function onCanvasClick(event) {
    if (!helpOverlayEl.hidden) return;
    if (state.gameOver) return;
    const { row, col } = cellFromEvent(event);
    const cell = state.board[row] && state.board[row][col];
    if (!cell) return;

    if (state.touchMode === 'flag') {
      toggleFlag(row, col);
    } else {
      if (cell.revealed) {
        chordReveal(row, col);
      } else {
        revealCell(row, col);
      }
    }
    draw();
  }

  function onCanvasRightClick(event) {
    event.preventDefault();
    if (!helpOverlayEl.hidden) return;
    if (state.gameOver) return;
    const { row, col } = cellFromEvent(event);
    if (!state.board[row] || !state.board[row][col]) return;
    toggleFlag(row, col);
    draw();
  }

  function step() {
    state.frame++;
    if (!state.gameOver && state.started) {
      state.tickCounter++;
      if (state.tickCounter >= TICK_FRAMES) {
        state.tickCounter = 0;
        state.timeElapsed++;
        timeEl.textContent = `${state.timeElapsed}s`;
      }
    }
    if (state.statusMessageTimer > 0) {
      state.statusMessageTimer--;
      if (state.statusMessageTimer === 0 && !state.gameOver) {
        state.statusMessage = '';
        state.statusTone = 'normal';
        statusEl.textContent = '';
        statusWrapEl.dataset.tone = 'normal';
      }
    }
  }

  function advanceFrames(count) {
    for (let i = 0; i < count; i++) step();
    updateHud();
    draw();
  }

  function setAutoStep(enabled) {
    autoStep = Boolean(enabled);
    if (autoStep && !rafId) startLoop();
    if (!autoStep && rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  function startLoop() {
    function frame() {
      if (!autoStep) { rafId = null; return; }
      step();
      draw();
      rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(frame);
  }

  function openHelp() {
    if (!helpOverlayEl.hidden) return;
    helpOverlayEl.hidden = false;
    gameShellEl.setAttribute('inert', '');
    helpCloseEl.focus();
  }

  function closeHelp() {
    if (helpOverlayEl.hidden) return;
    helpOverlayEl.hidden = true;
    gameShellEl.removeAttribute('inert');
    markHelpSeen();
    helpEl.focus();
  }

  canvas.addEventListener('click', onCanvasClick);
  canvas.addEventListener('contextmenu', onCanvasRightClick);

  restartEl.addEventListener('click', () => restartGame());

  helpEl.addEventListener('click', openHelp);
  helpCloseEl.addEventListener('click', closeHelp);
  helpOverlayEl.addEventListener('click', (event) => {
    if (event.target === helpOverlayEl) closeHelp();
  });

  diffBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      restartGame(btn.dataset.difficulty);
    });
  });

  modeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      state.touchMode = btn.dataset.action;
      updateHud();
    });
  });

  window.addEventListener('keydown', (e) => {
    if (!helpOverlayEl.hidden) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeHelp();
      }
      return;
    }
    if (e.key === 'r' || e.key === 'R') restartGame();
  });

  window.addEventListener('resize', () => {
    resizeCanvas();
    draw();
  });

  restartGame('easy');
  setAutoStep(true);
  if (!hasSeenHelp()) openHelp();

  window.__minesweeperTest = {
    isReady: true,
    getState() {
      return { ...structuredClone(state), helpOpen: !helpOverlayEl.hidden };
    },
    setState(incoming) {
      const next = structuredClone(incoming);
      if (!next.board || !Array.isArray(next.board)) {
        next.board = initBoard(next.rows || 9, next.cols || 9);
      }
      if (typeof next.rows !== 'number')        next.rows = next.board.length;
      if (typeof next.cols !== 'number')        next.cols = next.board[0] ? next.board[0].length : 9;
      if (typeof next.mines !== 'number')       next.mines = 10;
      if (typeof next.revealed !== 'number') {
        let rev = 0;
        for (const row of next.board) for (const cell of row) if (cell.revealed && !cell.mine) rev++;
        next.revealed = rev;
      }
      if (typeof next.flagged !== 'number') {
        let fl = 0;
        for (const row of next.board) for (const cell of row) if (cell.flagged) fl++;
        next.flagged = fl;
      }
      if (typeof next.gameOver !== 'boolean')          next.gameOver = false;
      if (typeof next.won !== 'boolean')               next.won = false;
      if (typeof next.started !== 'boolean')           next.started = false;
      if (typeof next.difficulty !== 'string')         next.difficulty = 'easy';
      if (typeof next.touchMode !== 'string')          next.touchMode = 'reveal';
      if (typeof next.bestTime !== 'number' && next.bestTime !== null) {
        next.bestTime = readBestTimes()[next.difficulty] ?? null;
      }
      if (typeof next.frame !== 'number')              next.frame = 0;
      if (typeof next.timeElapsed !== 'number')        next.timeElapsed = 0;
      if (typeof next.tickCounter !== 'number')        next.tickCounter = 0;
      if (typeof next.statusMessage !== 'string')      next.statusMessage = '';
      if (typeof next.statusTone !== 'string')         next.statusTone = 'normal';
      if (typeof next.statusMessageTimer !== 'number') next.statusMessageTimer = 0;
      state = next;
      resizeCanvas();
      updateDiffButtons();
      updateHud();
      draw();
    },
    async advanceFrames(n) {
      advanceFrames(n);
    },
    setAutoStep(enabled) {
      setAutoStep(enabled);
    },
    async restart() {
      restartGame();
    },
    revealCell(row, col) {
      const cell = state.board[row] && state.board[row][col];
      if (cell && cell.revealed) {
        chordReveal(row, col);
      } else {
        revealCell(row, col);
      }
      draw();
    },
    flagCell(row, col) {
      toggleFlag(row, col);
      draw();
    },
    setBoard(config) {
      const rows = config.length;
      const cols = config[0].length;
      const board = [];
      for (let r = 0; r < rows; r++) {
        board.push([]);
        for (let c = 0; c < cols; c++) {
          board[r].push({
            mine: Boolean(config[r][c].mine),
            revealed: Boolean(config[r][c].revealed),
            flagged: Boolean(config[r][c].flagged),
            adjacent: 0,
          });
        }
      }
      state.board = board;
      state.rows = rows;
      state.cols = cols;
      state.started = true;
      calcAdjacent();
      let rev = 0, fl = 0, mineCount = 0;
      for (const row of board) for (const cell of row) {
        if (cell.revealed && !cell.mine) rev++;
        if (cell.flagged) fl++;
        if (cell.mine) mineCount++;
      }
      state.revealed = rev;
      state.flagged = fl;
      state.mines = mineCount;
      updateHud();
      draw();
    },
  };
})();
