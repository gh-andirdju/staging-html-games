(() => {
  const BOARD_WIDTH = 10;
  const BOARD_HEIGHT = 20;
  const CELL_SIZE = 30;
  const BASE_GRAVITY_FRAMES = 48;
  const MIN_GRAVITY_FRAMES = 6;
  const GRAVITY_FRAMES_BY_LEVEL = [48, 44, 40, 34, 30, 27, 24, 21, 18, 16, 14, 12, 10, 8, 6];
  const LOCK_DELAY_FRAMES = 30;
  const CLEAR_SCORES = [0, 100, 300, 500, 800];
  const DROP_REPEAT_FRAMES = 2;
  const HORIZONTAL_DAS_FRAMES = 16;
  const HORIZONTAL_ARR_FRAMES = 6;
  const CLEAR_BLINK_TOTAL_FRAMES = 18;
  const CLEAR_BLINK_INTERVAL_FRAMES = 2;
  const STATUS_MESSAGE_FRAMES = 180;
  const MILESTONE_LEVEL_INTERVAL = 5;

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
  const statusWrapEl = statusEl.closest('.status-wrap');
  const nextCanvasEl = document.getElementById('next-canvas');
  const nextCtx = nextCanvasEl ? nextCanvasEl.getContext('2d') : null;
  const holdCanvasEl = document.getElementById('hold-canvas');
  const holdCtx = holdCanvasEl ? holdCanvasEl.getContext('2d') : null;
  const touchButtons = Array.from(document.querySelectorAll('[data-action]'));

  function createBoard() {
    return Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(0));
  }

  let state = null;
  let autoStep = true;
  let rafId = null;
  let accumulator = 0;
  let lastTime = 0;
  let seededValue = (Math.random() * 4294967296) >>> 0;
  let bag = [];
  const held = {
    left: false,
    right: false,
    softDrop: false,
    leftDasTick: 0,
    rightDasTick: 0,
    leftArrTick: 0,
    rightArrTick: 0,
    softTick: 0
  };

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

  function peekNextPieceType() {
    if (bag.length === 0) bag = shuffleBag();
    return PIECES[bag[0]].type;
  }

  function nextPiece() {
    if (bag.length === 0) bag = shuffleBag();
    const pieceDef = PIECES[bag.shift()];
    if (state) state.nextPieceType = peekNextPieceType();
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
    state.holdUsed = false;
    if (!isValidPosition(state.current)) {
      state.gameOver = true;
      syncStatusMessage();
    }
  }

  function holdPiece() {
    if (state.holdUsed || !state.current || state.clearAnimation || state.gameOver) return;
    const currentType = state.current.type;
    if (state.heldPiece === null) {
      state.heldPiece = currentType;
      state.current = null;
      spawnPiece();
      if (state.gameOver) return;
    } else {
      const swappedType = state.heldPiece;
      const pieceDef = PIECES.find((p) => p.type === swappedType);
      const swapped = { type: pieceDef.type, index: pieceDef.index, x: 4, y: 0, rotation: 0 };
      if (!isValidPosition(swapped)) return;
      // Mutate only after validation succeeds to avoid corrupt state on failure.
      state.heldPiece = currentType;
      state.current = swapped;
      state.lockTimer = 0;
    }
    state.holdUsed = true;
    setStatusMessage(`Hold: ${currentType}`);
  }

  function mergePiece() {
    for (const cell of pieceCells(state.current)) {
      if (cell.y >= 0 && cell.y < BOARD_HEIGHT && cell.x >= 0 && cell.x < BOARD_WIDTH) {
        state.board[cell.y][cell.x] = state.current.index;
      }
    }
  }

  function gravityFramesForLevel(level) {
    const normalizedLevel = Math.max(1, level);
    const index = Math.min(GRAVITY_FRAMES_BY_LEVEL.length - 1, normalizedLevel - 1);
    return Math.max(MIN_GRAVITY_FRAMES, GRAVITY_FRAMES_BY_LEVEL[index]);
  }

  function updateLevelAndSpeed() {
    state.level = 1 + Math.floor(state.lines / 10);
    state.gravityFrames = gravityFramesForLevel(state.level);
  }

  function setStatusMessage(message, tone = 'normal', durationFrames = STATUS_MESSAGE_FRAMES) {
    state.statusMessage = message;
    state.statusTone = tone;
    state.statusMessageTimer = durationFrames;
  }

  function fallbackStatusMessage() {
    if (state.gameOver) return { text: 'Game Over', tone: 'warning' };
    const linesToNextLevel = (10 - (state.lines % 10)) || 10;
    if (linesToNextLevel <= 2) {
      return {
        text: `${linesToNextLevel} line${linesToNextLevel === 1 ? '' : 's'} to level ${state.level + 1}`,
        tone: 'warning'
      };
    }
    return {
      text: `Marathon pace: ${linesToNextLevel} lines to level ${state.level + 1}`,
      tone: 'normal'
    };
  }

  function syncStatusMessage({ forceFallback = false } = {}) {
    if (state.gameOver) {
      state.statusMessage = 'Game Over';
      state.statusTone = 'warning';
      state.statusMessageTimer = 0;
      return;
    }
    if (forceFallback || state.statusMessageTimer <= 0 || !state.statusMessage) {
      const fallback = fallbackStatusMessage();
      state.statusMessage = fallback.text;
      state.statusTone = fallback.tone;
      state.statusMessageTimer = 0;
    }
  }

  function onLinesResolved(cleared) {
    const previousLevel = state.level;
    updateLevelAndSpeed();
    if (state.level > previousLevel) {
      if (state.level % MILESTONE_LEVEL_INTERVAL === 0) {
        setStatusMessage(`Milestone reached: level ${state.level}`, 'milestone');
      } else {
        setStatusMessage(`Level ${state.level} speed up`, 'normal');
      }
      return;
    }
    if (cleared === 4) {
      const linesToNextLevel = (10 - (state.lines % 10)) || 10;
      setStatusMessage(`Tetris clear: ${linesToNextLevel} lines to next level`, 'milestone');
      return;
    }
    syncStatusMessage({ forceFallback: true });
  }

  function findFullRows() {
    const rows = [];
    for (let row = 0; row < BOARD_HEIGHT; row += 1) {
      if (state.board[row].every((value) => value !== 0)) rows.push(row);
    }
    return rows;
  }

  function collapseRows(rows) {
    const rowSet = new Set(rows);
    const kept = [];
    for (let row = 0; row < BOARD_HEIGHT; row += 1) {
      if (!rowSet.has(row)) kept.push(state.board[row].slice());
    }
    while (kept.length < BOARD_HEIGHT) kept.unshift(Array(BOARD_WIDTH).fill(0));
    state.board = kept;
  }

  function startClearAnimation(rows) {
    state.clearAnimation = {
      rows: rows.slice(),
      frame: 0,
      totalFrames: CLEAR_BLINK_TOTAL_FRAMES,
      blinkInterval: CLEAR_BLINK_INTERVAL_FRAMES
    };
  }

  function resolveClearAnimation() {
    if (!state.clearAnimation) return;
    const cleared = state.clearAnimation.rows.length;
    collapseRows(state.clearAnimation.rows);
    state.clearAnimation = null;
    if (cleared > 0) {
      state.lines += cleared;
      state.score += CLEAR_SCORES[cleared] * state.level;
      onLinesResolved(cleared);
    }
    spawnPiece();
  }

  function lockPiece() {
    mergePiece();
    const rows = findFullRows();
    state.current = null;
    if (rows.length > 0) startClearAnimation(rows);
    else spawnPiece();
  }

  function movePiece(dx) {
    if (state.gameOver || !state.current || state.clearAnimation) return false;
    const next = { ...state.current, x: state.current.x + dx };
    if (!isValidPosition(next)) return false;
    state.current = next;
    state.lockTimer = 0;
    return true;
  }

  function rotatePiece() {
    if (state.gameOver || !state.current || state.clearAnimation) return false;
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

  function rotatePieceCcw() {
    if (state.gameOver || !state.current || state.clearAnimation) return false;
    const next = { ...state.current, rotation: (state.current.rotation - 1 + 4) % 4 };
    if (isValidPosition(next)) {
      state.current = next;
      state.lockTimer = 0;
      return true;
    }
    const kicks = [1, -1, 2, -2];
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
    if (state.gameOver || !state.current || state.clearAnimation) return false;
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
    if (state.gameOver || !state.current || state.clearAnimation) return;
    let distance = 0;
    while (true) {
      const next = { ...state.current, y: state.current.y + 1 };
      if (!isValidPosition(next)) break;
      state.current = next;
      distance += 1;
    }
    applyHardDropPoints(distance);
    lockPiece();
  }

  function restartGame() {
    seededValue = (Math.random() * 4294967296) >>> 0;
    bag = [];
    state = {
      board: createBoard(),
      current: null,
      heldPiece: null,
      holdUsed: false,
      nextPieceType: null,
      score: 0,
      lines: 0,
      level: 1,
      gravityFrames: BASE_GRAVITY_FRAMES,
      gravityTick: 0,
      lockTimer: 0,
      gameOver: false,
      frame: 0,
      clearAnimation: null,
      statusMessage: '',
      statusTone: 'normal',
      statusMessageTimer: 0
    };
    held.left = false;
    held.right = false;
    held.softDrop = false;
    held.leftDasTick = 0;
    held.rightDasTick = 0;
    held.leftArrTick = 0;
    held.rightArrTick = 0;
    held.softTick = 0;
    spawnPiece();
    syncStatusMessage({ forceFallback: true });
    render();
  }

  function copyStateForTests() {
    return structuredClone(state);
  }

  function setStateFromTests(nextState) {
    state = structuredClone(nextState);
    state.clearAnimation = state.clearAnimation ?? null;
    if (typeof state.statusMessage !== 'string') state.statusMessage = '';
    if (typeof state.statusTone !== 'string') state.statusTone = 'normal';
    if (typeof state.statusMessageTimer !== 'number') state.statusMessageTimer = 0;
    if (!('heldPiece' in state)) state.heldPiece = null;
    if (!('holdUsed' in state)) state.holdUsed = false;
    if (!('nextPieceType' in state)) state.nextPieceType = null;
    if (!state.current && !state.gameOver && !state.clearAnimation) spawnPiece();
    syncStatusMessage({ forceFallback: !state.statusMessage });
    render();
  }

  function getGhostCells(piece) {
    if (!piece) return [];
    let ghost = { ...piece };
    while (true) {
      const next = { ...ghost, y: ghost.y + 1 };
      if (!isValidPosition(next)) break;
      ghost = next;
    }
    return pieceCells(ghost);
  }

  function drawCell(x, y, index) {
    ctx.fillStyle = COLORS[index];
    ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
    ctx.strokeStyle = '#0f172a';
    ctx.strokeRect(x * CELL_SIZE + 0.5, y * CELL_SIZE + 0.5, CELL_SIZE - 1, CELL_SIZE - 1);
  }

  function drawBoard() {
    const clearAnimation = state.clearAnimation;
    const shouldShowBlinkRows =
      !clearAnimation ||
      Math.floor(clearAnimation.frame / clearAnimation.blinkInterval) % 2 === 0;
    const clearRowSet = clearAnimation ? new Set(clearAnimation.rows) : null;
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (state.current && !state.clearAnimation) {
      const ghostCells = getGhostCells(state.current);
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      for (const cell of ghostCells) {
        if (cell.y >= 0) {
          ctx.strokeRect(
            cell.x * CELL_SIZE + 2,
            cell.y * CELL_SIZE + 2,
            CELL_SIZE - 4,
            CELL_SIZE - 4
          );
        }
      }
      ctx.restore();
    }

    for (let y = 0; y < BOARD_HEIGHT; y += 1) {
      for (let x = 0; x < BOARD_WIDTH; x += 1) {
        if (clearRowSet && clearRowSet.has(y) && !shouldShowBlinkRows) continue;
        const value = state.board[y][x];
        if (value !== 0) drawCell(x, y, value);
      }
    }
    if (state.current) {
      for (const cell of pieceCells(state.current)) {
        if (cell.y >= 0) drawCell(cell.x, cell.y, state.current.index);
      }
    }
  }

  function drawPiecePreview(canvasEl, context, type) {
    if (!canvasEl || !context) return;
    const w = canvasEl.width;
    const h = canvasEl.height;
    context.clearRect(0, 0, w, h);
    if (!type) return;

    const pieceDef = PIECES.find((p) => p.type === type);
    if (!pieceDef) return;

    const cells = pieceDef.rotations[0];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [dx, dy] of cells) {
      if (dx < minX) minX = dx;
      if (dx > maxX) maxX = dx;
      if (dy < minY) minY = dy;
      if (dy > maxY) maxY = dy;
    }
    const cols = maxX - minX + 1;
    const rows = maxY - minY + 1;
    const cellSize = Math.floor(Math.min((w - 4) / cols, (h - 4) / rows));
    const pieceW = cols * cellSize;
    const pieceH = rows * cellSize;
    const offsetX = Math.floor((w - pieceW) / 2) - minX * cellSize;
    const offsetY = Math.floor((h - pieceH) / 2) - minY * cellSize;

    const color = COLORS[pieceDef.index];
    for (const [dx, dy] of cells) {
      const px = offsetX + dx * cellSize;
      const py = offsetY + dy * cellSize;
      context.fillStyle = color;
      context.fillRect(px, py, cellSize, cellSize);
      context.strokeStyle = '#0f172a';
      context.lineWidth = 0.5;
      context.strokeRect(px + 0.5, py + 0.5, cellSize - 1, cellSize - 1);
    }
  }

  function updateHud() {
    scoreEl.textContent = String(state.score);
    linesEl.textContent = String(state.lines);
    levelEl.textContent = String(state.level);
    if (statusEl.textContent !== state.statusMessage) statusEl.textContent = state.statusMessage;
    if (statusWrapEl && statusWrapEl.dataset.tone !== state.statusTone) statusWrapEl.dataset.tone = state.statusTone;
    drawPiecePreview(nextCanvasEl, nextCtx, state.nextPieceType ?? null);
    drawPiecePreview(holdCanvasEl, holdCtx, state.heldPiece ?? null);
    if (holdCanvasEl) {
      const holdBox = holdCanvasEl.closest('.preview-box');
      holdBox?.classList.toggle('hold-empty', state.heldPiece === null);
      holdBox?.classList.toggle('hold-locked', !!state.holdUsed);
      holdBox?.setAttribute('aria-disabled', state.holdUsed ? 'true' : 'false');
      holdBox?.setAttribute('aria-label', state.heldPiece ? `Hold piece: ${state.heldPiece}` : 'Hold piece');
    }
  }

  function render() {
    drawBoard();
    updateHud();
  }

  function resetHorizontalHold(direction) {
    if (direction === 'left') {
      held.leftDasTick = 0;
      held.leftArrTick = 0;
    } else {
      held.rightDasTick = 0;
      held.rightArrTick = 0;
    }
  }

  function setHorizontalHold(direction, isHeld) {
    const isLeft = direction === 'left';
    const otherDirection = isLeft ? 'right' : 'left';
    held[direction] = isHeld;
    if (!isHeld) {
      resetHorizontalHold(direction);
      return;
    }
    held[otherDirection] = false;
    resetHorizontalHold(otherDirection);
    resetHorizontalHold(direction);
    movePiece(isLeft ? -1 : 1);
  }

  function stepHorizontalHold(direction, dx) {
    const dasKey = direction === 'left' ? 'leftDasTick' : 'rightDasTick';
    const arrKey = direction === 'left' ? 'leftArrTick' : 'rightArrTick';
    if (held[dasKey] < HORIZONTAL_DAS_FRAMES) {
      held[dasKey] += 1;
      return;
    }
    held[arrKey] += 1;
    if (held[arrKey] >= HORIZONTAL_ARR_FRAMES) {
      movePiece(dx);
      held[arrKey] = 0;
    }
  }

  function stepClearAnimation() {
    if (!state.clearAnimation) return;
    state.clearAnimation.frame += 1;
    if (state.clearAnimation.frame >= state.clearAnimation.totalFrames) {
      resolveClearAnimation();
    }
  }

  function oneFrame() {
    if (!state.gameOver) {
      if (state.statusMessageTimer > 0) {
        state.statusMessageTimer -= 1;
        if (state.statusMessageTimer === 0) syncStatusMessage({ forceFallback: true });
      }
      if (state.clearAnimation) {
        stepClearAnimation();
        state.frame += 1;
        render();
        return;
      }
      if (held.left) stepHorizontalHold('left', -1);
      if (held.right) stepHorizontalHold('right', 1);
      if (held.softDrop && state.current) {
        held.softTick += 1;
        if (held.softTick === 1 || held.softTick % DROP_REPEAT_FRAMES === 0) stepDown({ rewardSoftDrop: true });
      } else {
        held.softTick = 0;
      }
      state.gravityTick += 1;
      if (state.gravityTick >= state.gravityFrames) {
        state.gravityTick = 0;
        stepDown({ rewardSoftDrop: false });
      }
      state.frame += 1;
    } else {
      syncStatusMessage();
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
    if (event.key === 'ArrowLeft') {
      if (event.repeat) return;
      setHorizontalHold('left', true);
    } else if (event.key === 'ArrowRight') {
      if (event.repeat) return;
      setHorizontalHold('right', true);
    }
    else if (event.key === 'ArrowDown') held.softDrop = true;
    else if (event.key === 'ArrowUp') rotatePiece();
    else if (event.key === 'z' || event.key === 'Z') rotatePieceCcw();
    else if (event.key === 'c' || event.key === 'C') holdPiece();
    else if (event.code === 'Space') {
      if (event.repeat) return;
      event.preventDefault();
      hardDrop();
    }
  }

  function onKeyUp(event) {
    if (event.key === 'ArrowLeft') setHorizontalHold('left', false);
    else if (event.key === 'ArrowRight') setHorizontalHold('right', false);
    else if (event.key === 'ArrowDown') held.softDrop = false;
  }

  function setTouchHeld(action, isHeld) {
    if (action === 'left') setHorizontalHold('left', isHeld);
    else if (action === 'right') setHorizontalHold('right', isHeld);
    else if (action === 'soft-drop') held.softDrop = isHeld;
  }

  function onTouchButtonDown(action) {
    if (action === 'rotate-cw') rotatePiece();
    else if (action === 'rotate-ccw') rotatePieceCcw();
    else if (action === 'hold') holdPiece();
    else if (action === 'hard-drop') hardDrop();
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
      if (action === 'left' || action === 'right' || action === 'soft-drop') {
        try { button.setPointerCapture(event.pointerId); } catch (_) { /* synthetic event */ }
      }
      onTouchButtonDown(action);
    });
    button.addEventListener('pointerup', () => onTouchButtonUp(action));
    button.addEventListener('pointercancel', () => onTouchButtonUp(action));
    // Only release on pointerleave when not captured; instant-action buttons (hold, rotate,
    // hard-drop) never capture, but onTouchButtonUp is a no-op for them so this is safe.
    button.addEventListener('pointerleave', (event) => {
      if (!button.hasPointerCapture(event.pointerId)) onTouchButtonUp(action);
    });
    button.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        onTouchButtonDown(action);
        onTouchButtonUp(action);
      }
    });
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
    },
    getControlsState: () => ({
      handedness: 'right'
    }),
    setHandedness: (_value) => {
      // no-op stub for test API compatibility
    }
  };
})();
