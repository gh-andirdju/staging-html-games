(() => {
  const BOARD_WIDTH = 10;
  const BOARD_HEIGHT = 20;
  const CELL_SIZE = 30;
  const BASE_GRAVITY_FRAMES = 48;
  const MIN_GRAVITY_FRAMES = 6;
  const LOCK_DELAY_FRAMES = 30;
  const CLEAR_SCORES = [0, 100, 300, 500, 800];
  const DROP_REPEAT_FRAMES = 2;
  const MOVE_REPEAT_FRAMES = 4;

  const COLORS = ['#000000', '#22d3ee', '#fbbf24', '#a78bfa', '#34d399', '#f87171', '#60a5fa', '#fb923c'];
  const PIECES = [
    { type: 'I', index: 1, rotations: [[[-1, 0], [0, 0], [1, 0], [2, 0]], [[1, -1], [1, 0], [1, 1], [1, 2]], [[-1, 1], [0, 1], [1, 1], [2, 1]], [[0, -1], [0, 0], [0, 1], [0, 2]]] },
    { type: 'O', index: 2, rotations: [[[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [0, 1], [1, 1]]] },
    { type: 'T', index: 3, rotations: [[[-1, 0], [0, 0], [1, 0], [0, 1]], [[0, -1], [0, 0], [1, 0], [0, 1]], [[0, -1], [-1, 0], [0, 0], [1, 0]], [[0, -1], [-1, 0], [0, 0], [0, 1]]] },
    { type: 'S', index: 4, rotations: [[[0, 0], [1, 0], [-1, 1], [0, 1]], [[0, -1], [0, 0], [1, 0], [1, 1]], [[0, 0], [1, 0], [-1, 1], [0, 1]], [[0, -1], [0, 0], [1, 0], [1, 1]]] },
    { type: 'Z', index: 5, rotations: [[[-1, 0], [0, 0], [0, 1], [1, 1]], [[1, -1], [0, 0], [1, 0], [0, 1]], [[-1, 0], [0, 0], [0, 1], [1, 1]], [[1, -1], [0, 0], [1, 0], [0, 1]]] },
    { type: 'J', index: 6, rotations: [[[-1, 0], [0, 0], [1, 0], [-1, 1]], [[0, -1], [0, 0], [0, 1], [1, 1]], [[1, -1], [-1, 0], [0, 0], [1, 0]], [[-1, -1], [0, -1], [0, 0], [0, 1]]] },
    { type: 'L', index: 7, rotations: [[[-1, 0], [0, 0], [1, 0], [1, 1]], [[0, -1], [0, 0], [0, 1], [1, -1]], [[-1, -1], [-1, 0], [0, 0], [1, 0]], [[-1, 1], [0, -1], [0, 0], [0, 1]]] }
  ];

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const linesEl = document.getElementById('lines');
  const levelEl = document.getElementById('level');
  const statusEl = document.getElementById('status');
  const restartEl = document.getElementById('restart');
  const touchButtons = Array.from(document.querySelectorAll('.touch-controls button'));

  function createBoard() {
    return Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(0));
  }

  function clonePiece(piece) {
    return { ...piece };
  }

  let state = null;
  let autoStep = true;
  let rafId = null;
  let accumulator = 0;
  let lastTime = 0;
  let seededValue = 1;
  let bag = [];
  const held = { left: false, right: false, softDrop: false, hardDrop: false, leftTick: 0, rightTick: 0, softTick: 0, hardTick: 0 };

  function nextRandom() {
    seededValue = (seededValue * 1664525 + 1013904223) >>> 0;
    return seededValue / 4294967296;
  }

  function shuffleBag() {
    const order = PIECES.map((_, index) => index);
    for (let index = order.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(nextRandom() * (index + 1));
      const temp = order[index];
      order[index] = order[swapIndex];
      order[swapIndex] = temp;
    }
    return order;
  }

  function nextPiece() {
    if (bag.length === 0) bag = shuffleBag();
    const pieceDef = PIECES[bag.shift()];
    return {
      type: pieceDef.type,
      index: pieceDef.index,
      x: 4,
      y: 0,
      rotation: 0
    };
  }

  function pieceCells(piece) {
    const rotations = PIECES.find((candidate) => candidate.type === piece.type).rotations;
    const offsets = rotations[piece.rotation % 4];
    return offsets.map(([dx, dy]) => ({ x: piece.x + dx, y: piece.y + dy }));
  }

  function isValidPosition(piece) {
    const cells = pieceCells(piece);
    for (const cell of cells) {
      if (cell.x < 0 || cell.x >= BOARD_WIDTH || cell.y >= BOARD_HEIGHT) return false;
      if (cell.y >= 0 && state.board[cell.y][cell.x] !== 0) return false;
    }
    return true;
  }

  function spawnPiece() {
    state.current = nextPiece();
    state.lockTimer = 0;
    if (!isValidPosition(state.current)) state.gameOver = true;
  }

  function mergePiece() {
    for (const cell of pieceCells(state.current)) {
      if (cell.y >= 0 && cell.y < BOARD_HEIGHT && cell.x >= 0 && cell.x < BOARD_WIDTH) {
        state.board[cell.y][cell.x] = state.current.index;
      }
    }
  }

  function updateLevelAndSpeed() {
    state.level = 1 + Math.floor(state.lines / 10);
    state.gravityFrames = Math.max(MIN_GRAVITY_FRAMES, BASE_GRAVITY_FRAMES - (state.level - 1) * 4);
  }

  function clearLines() {
    let cleared = 0;
    for (let row = BOARD_HEIGHT - 1; row >= 0; row -= 1) {
      if (state.board[row].every((value) => value !== 0)) {
        state.board.splice(row, 1);
        state.board.unshift(Array(BOARD_WIDTH).fill(0));
        cleared += 1;
        row += 1;
      }
    }
    if (cleared > 0) {
      state.lines += cleared;
      state.score += CLEAR_SCORES[cleared] * state.level;
      updateLevelAndSpeed();
    }
  }

  function lockPiece() {
    mergePiece();
    clearLines();
    spawnPiece();
  }

  function movePiece(dx) {
    if (state.gameOver) return false;
    const next = { ...state.current, x: state.current.x + dx };
    if (!isValidPosition(next)) return false;
    state.current = next;
    state.lockTimer = 0;
    return true;
  }

  function rotatePiece() {
    if (state.gameOver) return false;
    const next = { ...state.current, rotation: (state.current.rotation + 1) % 4 };
    if (isValidPosition(next)) {
      state.current = next;
      state.lockTimer = 0;
      return true;
    }
    const kicks = [-1, 1, -2, 2];
    for (const kick of kicks) {
      const kicked = { ...next, x: next.x + kick };
      if (isValidPosition(kicked)) {
        state.current = kicked;
        state.lockTimer = 0;
        return true;
      }
    }
    return false;
  }

  function applySoftDropPoint(steps) {
    state.score += steps;
  }

  function applyHardDropPoints(steps) {
    state.score += steps * 2;
  }

  function stepDown({ rewardSoftDrop }) {
    if (state.gameOver) return false;
    const next = { ...state.current, y: state.current.y + 1 };
    if (isValidPosition(next)) {
      state.current = next;
      if (rewardSoftDrop) applySoftDropPoint(1);
      return true;
    }
    state.lockTimer += 1;
    if (state.lockTimer >= LOCK_DELAY_FRAMES || !rewardSoftDrop) lockPiece();
    return false;
  }

  function hardDrop() {
    if (state.gameOver) return;
    let distance = 0;
    while (stepDown({ rewardSoftDrop: false })) distance += 1;
    applyHardDropPoints(distance);
    lockPiece();
  }

  function restartGame() {
    seededValue = 1;
    bag = [];
    state = {
      board: createBoard(),
      current: null,
      score: 0,
      lines: 0,
      level: 1,
      gravityFrames: BASE_GRAVITY_FRAMES,
      gravityTick: 0,
      lockTimer: 0,
      gameOver: false,
      frame: 0
    };
    held.left = false;
    held.right = false;
    held.softDrop = false;
    held.hardDrop = false;
    held.leftTick = 0;
    held.rightTick = 0;
    held.softTick = 0;
    held.hardTick = 0;
    spawnPiece();
    render();
  }

  function copyStateForTests() {
    return structuredClone(state);
  }

  function setStateFromTests(nextState) {
    state = structuredClone(nextState);
    render();
  }

  function drawCell(x, y, index) {
    ctx.fillStyle = COLORS[index];
    ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
    ctx.strokeStyle = '#0f172a';
    ctx.strokeRect(x * CELL_SIZE + 0.5, y * CELL_SIZE + 0.5, CELL_SIZE - 1, CELL_SIZE - 1);
  }

  function drawBoard() {
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        const value = state.board[y][x];
        if (value !== 0) drawCell(x, y, value);
      }
    }
    for (const cell of pieceCells(state.current)) {
      if (cell.y >= 0) drawCell(cell.x, cell.y, state.current.index);
    }
  }

  function updateHud() {
    scoreEl.textContent = String(state.score);
    linesEl.textContent = String(state.lines);
    levelEl.textContent = String(state.level);
    statusEl.textContent = state.gameOver ? 'Game Over' : 'Playing';
  }

  function render() {
    drawBoard();
    updateHud();
  }

  function oneFrame() {
    if (!state.gameOver) {
      if (held.left) {
        held.leftTick += 1;
        if (held.leftTick === 1 || held.leftTick % MOVE_REPEAT_FRAMES === 0) movePiece(-1);
      } else {
        held.leftTick = 0;
      }
      if (held.right) {
        held.rightTick += 1;
        if (held.rightTick === 1 || held.rightTick % MOVE_REPEAT_FRAMES === 0) movePiece(1);
      } else {
        held.rightTick = 0;
      }
      if (held.softDrop) {
        held.softTick += 1;
        if (held.softTick === 1 || held.softTick % DROP_REPEAT_FRAMES === 0) stepDown({ rewardSoftDrop: true });
      } else {
        held.softTick = 0;
      }
      if (held.hardDrop) {
        held.hardTick += 1;
        if (held.hardTick === 1 || held.hardTick % 10 === 0) hardDrop();
      } else {
        held.hardTick = 0;
      }

      state.gravityTick += 1;
      if (state.gravityTick >= state.gravityFrames) {
        state.gravityTick = 0;
        stepDown({ rewardSoftDrop: false });
      }
      state.frame += 1;
    }
    render();
  }

  function advanceFrames(frameCount) {
    const loops = Math.max(0, Number(frameCount) || 0);
    for (let index = 0; index < loops; index += 1) oneFrame();
  }

  function tick(timestamp) {
    if (!autoStep) return;
    if (!lastTime) lastTime = timestamp;
    const delta = timestamp - lastTime;
    lastTime = timestamp;
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
      lastTime = 0;
      accumulator = 0;
      rafId = requestAnimationFrame(tick);
    } else if (!autoStep && rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function onKeyDown(event) {
    if (event.key === 'r' || event.key === 'R') {
      restartGame();
      return;
    }
    if (state.gameOver) return;
    if (event.key === 'ArrowLeft') held.left = true;
    else if (event.key === 'ArrowRight') held.right = true;
    else if (event.key === 'ArrowDown') held.softDrop = true;
    else if (event.key === 'ArrowUp') rotatePiece();
    else if (event.code === 'Space') {
      event.preventDefault();
      hardDrop();
    }
  }

  function onKeyUp(event) {
    if (event.key === 'ArrowLeft') held.left = false;
    else if (event.key === 'ArrowRight') held.right = false;
    else if (event.key === 'ArrowDown') held.softDrop = false;
  }

  function setTouchHeld(action, isHeld) {
    if (action === 'left') held.left = isHeld;
    else if (action === 'right') held.right = isHeld;
    else if (action === 'soft-drop') held.softDrop = isHeld;
    else if (action === 'hard-drop') held.hardDrop = isHeld;
  }

  function onTouchButtonDown(action) {
    if (action === 'rotate') rotatePiece();
    else setTouchHeld(action, true);
  }

  function onTouchButtonUp(action) {
    setTouchHeld(action, false);
  }

  restartEl.addEventListener('click', restartGame);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  for (const button of touchButtons) {
    const action = button.dataset.action;
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      onTouchButtonDown(action);
    });
    button.addEventListener('pointerup', () => onTouchButtonUp(action));
    button.addEventListener('pointercancel', () => onTouchButtonUp(action));
    button.addEventListener('pointerleave', () => onTouchButtonUp(action));
  }

  restartGame();
  setAutoStep(true);

  window.__tetrisTest = {
    isReady: true,
    getState: copyStateForTests,
    readState: copyStateForTests,
    setState: setStateFromTests,
    advanceFrames: async (frameCount) => {
      advanceFrames(frameCount);
    },
    restart: async () => {
      restartGame();
    },
    setAutoStep: (enabled) => {
      setAutoStep(enabled);
    }
  };
})();
