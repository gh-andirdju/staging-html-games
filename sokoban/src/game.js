(() => {
  const CELL_SIZE = 48;
  const WALL = '#';
  const FLOOR = ' ';
  const TARGET = '.';
  const WIN_HOLD_FRAMES = 90;

  // Levels encoded as string arrays. Characters:
  //   '#' wall, ' ' floor, '.' target,
  //   '@' player-start (floor), '$' box-start (floor),
  //   '*' box-on-target (target), '+' player-on-target (target)
  const LEVELS = [
    // Level 1 — push down once
    [
      '#####',
      '# @ #',
      '# $ #',
      '# . #',
      '#####',
    ],
    // Level 2 — go left then push right
    [
      '######',
      '#    #',
      '#@$. #',
      '#    #',
      '######',
    ],
    // Level 3 — push right then up
    [
      '######',
      '#  . #',
      '# $  #',
      '#  @ #',
      '######',
    ],
    // Level 4 — two boxes, push both down
    [
      '#######',
      '#     #',
      '#  @  #',
      '# $$  #',
      '# ..  #',
      '#     #',
      '#######',
    ],
    // Level 5 — two boxes, different directions
    [
      '#######',
      '#  @  #',
      '# $.  #',
      '#  $. #',
      '#     #',
      '#######',
    ],
    // Level 6 — three boxes in a row
    [
      '#######',
      '# ... #',
      '# $$$ #',
      '#  @  #',
      '#######',
    ],
  ];

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const levelEl = document.getElementById('level');
  const movesEl = document.getElementById('moves');
  const pushesEl = document.getElementById('pushes');
  const statusEl = document.getElementById('status');
  const statusWrapEl = statusEl.closest('.status-wrap');
  const restartEl = document.getElementById('restart');

  let state = null;
  let autoStep = true;
  let rafId = null;
  let winFrames = 0;

  function parseLevel(levelIndex) {
    const rows = LEVELS[levelIndex];
    const numRows = rows.length;
    const numCols = Math.max(...rows.map((r) => r.length));

    const board = [];
    const targets = [];
    const boxes = [];
    let playerPos = { row: 0, col: 0 };

    for (let r = 0; r < numRows; r++) {
      board[r] = [];
      for (let c = 0; c < numCols; c++) {
        const ch = (rows[r][c] ?? ' ');
        if (ch === WALL) {
          board[r][c] = WALL;
        } else if (ch === TARGET) {
          board[r][c] = TARGET;
          targets.push({ row: r, col: c });
        } else if (ch === '@') {
          board[r][c] = FLOOR;
          playerPos = { row: r, col: c };
        } else if (ch === '$') {
          board[r][c] = FLOOR;
          boxes.push({ row: r, col: c });
        } else if (ch === '*') {
          board[r][c] = TARGET;
          targets.push({ row: r, col: c });
          boxes.push({ row: r, col: c });
        } else if (ch === '+') {
          board[r][c] = TARGET;
          targets.push({ row: r, col: c });
          playerPos = { row: r, col: c };
        } else {
          board[r][c] = FLOOR;
        }
      }
    }

    return { board, targets, boxes, playerPos, numRows, numCols };
  }

  function loadLevel(levelIndex) {
    const parsed = parseLevel(levelIndex);
    state = {
      level: levelIndex,
      board: parsed.board,
      targets: parsed.targets,
      boxes: parsed.boxes,
      playerPos: parsed.playerPos,
      moves: 0,
      pushes: 0,
      status: 'playing',
      history: [],
    };
    winFrames = 0;

    canvas.width = parsed.numCols * CELL_SIZE;
    canvas.height = parsed.numRows * CELL_SIZE;

    render();
    updateHud();
  }

  function boxAt(row, col) {
    return state.boxes.findIndex((b) => b.row === row && b.col === col);
  }

  function isPassable(row, col) {
    const cell = state.board[row]?.[col];
    return cell === FLOOR || cell === TARGET;
  }

  function tryMove(dr, dc) {
    if (state.status !== 'playing') return false;

    const nr = state.playerPos.row + dr;
    const nc = state.playerPos.col + dc;

    if (!isPassable(nr, nc)) return false;

    const bi = boxAt(nr, nc);
    if (bi !== -1) {
      // Pushing a box
      const br = nr + dr;
      const bc = nc + dc;
      if (!isPassable(br, bc)) return false;
      if (boxAt(br, bc) !== -1) return false;

      // Save history before mutating
      state.history.push({
        playerPos: { ...state.playerPos },
        boxes: state.boxes.map((b) => ({ ...b })),
        moves: state.moves,
        pushes: state.pushes,
      });

      state.boxes[bi] = { row: br, col: bc };
      state.playerPos = { row: nr, col: nc };
      state.moves++;
      state.pushes++;
    } else {
      // Plain move
      state.history.push({
        playerPos: { ...state.playerPos },
        boxes: state.boxes.map((b) => ({ ...b })),
        moves: state.moves,
        pushes: state.pushes,
      });

      state.playerPos = { row: nr, col: nc };
      state.moves++;
    }

    if (checkWin()) {
      state.status = 'won';
      winFrames = 0;
    }

    render();
    updateHud();
    return true;
  }

  function undo() {
    if (state.status !== 'playing') return;
    if (state.history.length === 0) return;

    const prev = state.history.pop();
    state.playerPos = prev.playerPos;
    state.boxes = prev.boxes;
    state.moves = prev.moves;
    state.pushes = prev.pushes;

    render();
    updateHud();
  }

  function checkWin() {
    return state.targets.every((t) => boxAt(t.row, t.col) !== -1);
  }

  function tick() {
    if (state.status === 'won') {
      winFrames++;
      if (winFrames >= WIN_HOLD_FRAMES) {
        const nextLevel = state.level + 1;
        if (nextLevel < LEVELS.length) {
          loadLevel(nextLevel);
        } else {
          // All levels done — stay on won state, re-render
          winFrames = WIN_HOLD_FRAMES; // clamp so it doesn't overflow
          render();
          updateHud();
        }
      }
    }
  }

  // ── Rendering ──────────────────────────────────────────────────────────

  function drawRoundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  function render() {
    const rows = state.board.length;
    const cols = state.board[0]?.length ?? 0;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = '#0a0500';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Cells
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * CELL_SIZE;
        const y = r * CELL_SIZE;
        const cell = state.board[r][c];

        if (cell === WALL) {
          ctx.fillStyle = '#3d2b1a';
          ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
          // Inner highlight
          ctx.fillStyle = '#4f3820';
          ctx.fillRect(x + 2, y + 2, CELL_SIZE - 4, 3);
          ctx.fillRect(x + 2, y + 2, 3, CELL_SIZE - 4);
        } else if (cell === TARGET) {
          // Floor with target marker
          ctx.fillStyle = '#12080000';
          ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
          // Draw X cross for target
          const cx = x + CELL_SIZE / 2;
          const cy = y + CELL_SIZE / 2;
          const s = CELL_SIZE * 0.22;
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(cx - s, cy - s);
          ctx.lineTo(cx + s, cy + s);
          ctx.moveTo(cx + s, cy - s);
          ctx.lineTo(cx - s, cy + s);
          ctx.stroke();
        }
        // FLOOR cells render as background
      }
    }

    // Boxes
    for (const box of state.boxes) {
      const x = box.col * CELL_SIZE;
      const y = box.row * CELL_SIZE;
      const onTarget = state.board[box.row][box.col] === TARGET;
      const pad = 5;

      if (onTarget) {
        ctx.fillStyle = '#15803d';
        drawRoundRect(x + pad, y + pad, CELL_SIZE - pad * 2, CELL_SIZE - pad * 2, 6);
        ctx.fill();
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2;
        drawRoundRect(x + pad, y + pad, CELL_SIZE - pad * 2, CELL_SIZE - pad * 2, 6);
        ctx.stroke();
        // Checkmark
        ctx.strokeStyle = '#86efac';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const cx = x + CELL_SIZE / 2;
        const cy = y + CELL_SIZE / 2;
        ctx.beginPath();
        ctx.moveTo(cx - 7, cy);
        ctx.lineTo(cx - 2, cy + 6);
        ctx.lineTo(cx + 7, cy - 6);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#92400e';
        drawRoundRect(x + pad, y + pad, CELL_SIZE - pad * 2, CELL_SIZE - pad * 2, 6);
        ctx.fill();
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        drawRoundRect(x + pad, y + pad, CELL_SIZE - pad * 2, CELL_SIZE - pad * 2, 6);
        ctx.stroke();
        // Inner detail
        ctx.strokeStyle = 'rgba(245,158,11,0.4)';
        ctx.lineWidth = 1;
        const inner = 10;
        drawRoundRect(x + inner, y + inner, CELL_SIZE - inner * 2, CELL_SIZE - inner * 2, 3);
        ctx.stroke();
      }
    }

    // Player
    {
      const cx = state.playerPos.col * CELL_SIZE + CELL_SIZE / 2;
      const cy = state.playerPos.row * CELL_SIZE + CELL_SIZE / 2;
      const r = CELL_SIZE * 0.35;

      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#1a0e00';
      // Eyes
      ctx.beginPath();
      ctx.arc(cx - 5, cy - 4, 3, 0, Math.PI * 2);
      ctx.arc(cx + 5, cy - 4, 3, 0, Math.PI * 2);
      ctx.fill();

      // Smile
      ctx.strokeStyle = '#1a0e00';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, cy + 2, 7, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
    }

    // Win overlay
    if (state.status === 'won') {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const isLast = state.level >= LEVELS.length - 1;
      const msg = isLast ? 'You Win!' : 'Level Complete!';
      ctx.fillStyle = '#f59e0b';
      ctx.font = `bold ${Math.round(CELL_SIZE * 0.7)}px "Trebuchet MS", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(msg, canvas.width / 2, canvas.height / 2);
    }
  }

  function updateHud() {
    levelEl.textContent = state.level + 1;
    movesEl.textContent = state.moves;
    pushesEl.textContent = state.pushes;

    if (state.status === 'won') {
      const isLast = state.level >= LEVELS.length - 1;
      statusEl.textContent = isLast ? 'You Win!' : 'Level Complete!';
      statusWrapEl.dataset.tone = 'win';
    } else {
      statusEl.textContent = 'Playing';
      delete statusWrapEl.dataset.tone;
    }
  }

  // ── Input ───────────────────────────────────────────────────────────────

  const DIR = {
    ArrowUp:    { dr: -1, dc: 0 },
    ArrowDown:  { dr:  1, dc: 0 },
    ArrowLeft:  { dr:  0, dc: -1 },
    ArrowRight: { dr:  0, dc:  1 },
    w: { dr: -1, dc: 0 },
    s: { dr:  1, dc: 0 },
    a: { dr:  0, dc: -1 },
    d: { dr:  0, dc:  1 },
    up:    { dr: -1, dc: 0 },
    down:  { dr:  1, dc: 0 },
    left:  { dr:  0, dc: -1 },
    right: { dr:  0, dc:  1 },
  };

  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const dir = DIR[e.key];
    if (dir) {
      e.preventDefault();
      tryMove(dir.dr, dir.dc);
      return;
    }
    if (e.key === 'z' || e.key === 'Z' || e.key === 'u' || e.key === 'U') {
      e.preventDefault();
      undo();
    }
  });

  document.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const action = btn.dataset.action;
      if (action === 'undo') {
        undo();
        return;
      }
      const dir = DIR[action];
      if (dir) tryMove(dir.dr, dir.dc);
    });
  });

  restartEl.addEventListener('click', () => {
    loadLevel(state.level);
  });

  // ── RAF loop ────────────────────────────────────────────────────────────

  function scheduleFrame() {
    rafId = requestAnimationFrame(() => {
      tick();
      if (autoStep) scheduleFrame();
    });
  }

  // ── Test API ────────────────────────────────────────────────────────────

  window.__sokobanTest = {
    isReady: false,

    getState() {
      return structuredClone(state);
    },

    setState(next) {
      // Re-derive canvas size if board changes
      if (next.board) {
        const rows = next.board.length;
        const cols = next.board[0]?.length ?? 0;
        canvas.width = cols * CELL_SIZE;
        canvas.height = rows * CELL_SIZE;
      }
      Object.assign(state, next);
      winFrames = 0;
      render();
      updateHud();
    },

    setAutoStep(enabled) {
      autoStep = enabled;
      if (enabled) {
        scheduleFrame();
      } else if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },

    async advanceFrames(n) {
      for (let i = 0; i < n; i++) {
        tick();
      }
      render();
      updateHud();
    },

    async restart() {
      loadLevel(state.level);
    },
  };

  // ── Init ─────────────────────────────────────────────────────────────────

  loadLevel(0);
  window.__sokobanTest.isReady = true;
  scheduleFrame();
})();
