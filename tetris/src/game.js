(() => {
  // Invisible build marker — lets a deployed device be checked against the
  // committed source via `window.__tetrisBuild` (or the <meta> tag in index.html).
  const BUILD_ID = 'tetris-cabinet-2026-06-17.3';
  try { window.__tetrisBuild = BUILD_ID; } catch (_) {}

  let boardCols = 10;
  let boardRows = 20;
  let cellSize = 30;
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

  // Vibrant, gem-like tetromino palette (index 1..7 → I O T S Z J L).
  const COLORS = ['#000000', '#2ee0f2', '#ffd23f', '#b388ff', '#37e08a', '#ff5d6c', '#4f8cff', '#ff9f43'];
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
  const bestEl = document.getElementById('best');
  const linesEl = document.getElementById('lines');
  const levelEl = document.getElementById('level');
  const statusEl = document.getElementById('status');
  const restartEl = document.getElementById('restart');
  const pauseEl = document.getElementById('pause');
  const muteEl = document.getElementById('mute');
  const helpEl = document.getElementById('help');
  const helpOverlayEl = document.getElementById('help-overlay');
  const helpCloseEl = document.getElementById('help-close');
  const gameShellEl = document.querySelector('.game-shell');
  const statusWrapEl = statusEl.closest('.status-wrap');
  const nextCanvasEl = document.getElementById('next-canvas');
  const nextCtx = nextCanvasEl ? nextCanvasEl.getContext('2d') : null;
  const nextCanvas2El = document.getElementById('next-canvas-2');
  const nextCtx2 = nextCanvas2El ? nextCanvas2El.getContext('2d') : null;
  const nextCanvas3El = document.getElementById('next-canvas-3');
  const nextCtx3 = nextCanvas3El ? nextCanvas3El.getContext('2d') : null;
  const holdCanvasEl = document.getElementById('hold-canvas');
  const holdCtx = holdCanvasEl ? holdCanvasEl.getContext('2d') : null;
  const touchButtons = Array.from(document.querySelectorAll('[data-action]'));

  function computeDimensions() {
    const shellEl = canvas.closest('.game-shell');
    const topbarEl = shellEl.querySelector('.topbar');
    const controlEl = shellEl.querySelector('.control-deck');
    const areaEl = shellEl.querySelector('.game-area');

    const topbarRect = topbarEl.getBoundingClientRect();
    const controlRect = controlEl.getBoundingClientRect();
    const shellRect = shellEl.getBoundingClientRect();
    const shellStyle = getComputedStyle(shellEl);
    const shellPadTop = parseFloat(shellStyle.paddingTop) || 0;
    const shellPadBottom = parseFloat(shellStyle.paddingBottom) || 0;
    const shellRowGap = parseFloat(shellStyle.rowGap) || 6;

    // Measure the shell's real height so cabinet padding/bezel is already excluded.
    const availH = shellRect.height - topbarRect.height - controlRect.height
      - shellRowGap * 2 - shellPadTop - shellPadBottom;

    // Width budget: the play area minus the two flanking rails and their gaps,
    // so the board never overflows when HOLD/NEXT sit beside it.
    const areaRect = areaEl.getBoundingClientRect();
    const areaStyle = getComputedStyle(areaEl);
    const colGap = parseFloat(areaStyle.columnGap || areaStyle.gap) || 6;
    const padX = (parseFloat(areaStyle.paddingLeft) || 0) + (parseFloat(areaStyle.paddingRight) || 0);
    let railTotal = 0;
    const rails = areaEl.querySelectorAll('.rail');
    rails.forEach((rail) => { railTotal += rail.getBoundingClientRect().width; });
    const availW = areaRect.width - railTotal - colGap * (rails.length || 0) - padX - 2;

    // Target 30px cells; shrink to honor whichever of height/width is tighter.
    const TARGET_CELL = 30;
    const heightCell = availH < 20 * TARGET_CELL ? Math.floor(availH / 20) : TARGET_CELL;
    const widthCell = availW > 0 ? Math.floor(availW / 10) : TARGET_CELL;
    const cs = Math.max(14, Math.min(TARGET_CELL, heightCell, widthCell));

    boardCols = 10;
    boardRows = Math.max(20, Math.min(40, Math.floor(availH / cs)));
    cellSize = cs;

    canvas.width = boardCols * cs;
    canvas.height = boardRows * cs;
  }

  function createBoard() {
    return Array.from({ length: boardRows }, () => Array(boardCols).fill(0));
  }

  const HIGH_SCORE_KEY = 'tetris-high-score';

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

  const HELP_SEEN_KEY = 'tetris-help-seen';

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

  const MUTED_KEY = 'tetris-muted';

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
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      return audioCtx;
    }

    function tone(startFreq, endFreq, duration, delay = 0, type = 'square', peak = 0.1) {
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
      playRotate() {
        tone(880, 880, 0.03, 0, 'square', 0.05);
      },
      playLock() {
        tone(220, 220, 0.04, 0, 'square', 0.07);
      },
      playHardDrop() {
        tone(170, 90, 0.07, 0, 'square', 0.1);
      },
      playHold() {
        tone(523, 523, 0.06, 0, 'triangle', 0.09);
      },
      // Arpeggio grows with the number of cleared lines; a Tetris plays all four notes.
      playLineClear(cleared) {
        const notes = [523, 659, 784, 1047];
        const count = Math.max(1, Math.min(4, cleared));
        for (let index = 0; index < count; index += 1) {
          tone(notes[index], notes[index], index === count - 1 ? 0.1 : 0.06, index * 0.07, 'triangle');
        }
      },
      // Combo blip climbs in pitch with each consecutive line-clearing drop.
      playCombo(combo) {
        const freq = Math.min(1320, 660 + Math.max(0, combo) * 80);
        tone(freq, freq, 0.05, 0, 'triangle', 0.07);
      },
      playLevelUp() {
        tone(440, 440, 0.07, 0, 'triangle');
        tone(660, 660, 0.1, 0.08, 'triangle');
      },
      playGameOver() {
        tone(330, 120, 0.15, 0, 'sawtooth', 0.09);
      },
      playNewRecord() {
        tone(523, 523, 0.06, 0, 'triangle');
        tone(659, 659, 0.06, 0.07, 'triangle');
        tone(784, 784, 0.06, 0.14, 'triangle');
        tone(1047, 1047, 0.1, 0.21, 'triangle');
      }
    };
  }

  const sfx = createSfx();

  let state = null;
  let helpDidPause = false;
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

  const NEXT_QUEUE_SIZE = 3;

  function ensureBag(count) {
    while (bag.length < count) bag = bag.concat(shuffleBag());
  }

  function peekNextTypes(count) {
    ensureBag(count);
    return bag.slice(0, count).map((index) => PIECES[index].type);
  }

  function peekNextPieceType() {
    return peekNextTypes(1)[0];
  }

  function syncNextQueue() {
    if (!state) return;
    state.nextQueue = peekNextTypes(NEXT_QUEUE_SIZE);
    state.nextPieceType = state.nextQueue[0];
  }

  function nextPiece() {
    ensureBag(1);
    const pieceDef = PIECES[bag.shift()];
    syncNextQueue();
    return {
      type: pieceDef.type,
      index: pieceDef.index,
      x: Math.floor(boardCols / 2) - 1,
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
      if (cell.x < 0 || cell.x >= boardCols || cell.y >= boardRows) return false;
      if (cell.y >= 0 && state.board[cell.y][cell.x] !== 0) return false;
    }
    return true;
  }

  function spawnPiece() {
    state.current = nextPiece();
    state.lockTimer = 0;
    state.gravityTick = 0;
    state.holdUsed = false;
    if (!isValidPosition(state.current)) {
      state.gameOver = true;
      syncStatusMessage();
      if (state.newRecord) sfx.playNewRecord();
      else sfx.playGameOver();
    }
  }

  function holdPiece() {
    if (!state.current || state.clearAnimation || state.gameOver) return;
    if (state.holdUsed) { setStatusMessage('Hold not available'); return; }
    const currentType = state.current.type;
    if (state.heldPiece === null) {
      state.heldPiece = currentType;
      state.current = null;
      state.gravityTick = 0;
      spawnPiece();
      if (state.gameOver) return;
    } else {
      const swappedType = state.heldPiece;
      const pieceDef = PIECES.find((p) => p.type === swappedType);
      const spawnX = Math.floor(boardCols / 2) - 1;
      const swapped = { type: pieceDef.type, index: pieceDef.index, x: spawnX, y: 0, rotation: 0 };
      if (!isValidPosition(swapped)) return;
      // Mutate only after validation succeeds to avoid corrupt state on failure.
      state.heldPiece = currentType;
      state.current = swapped;
      state.lockTimer = 0;
      state.gravityTick = 0;
    }
    // After first-hold, spawnPiece() cleared holdUsed for the spawned piece; after a swap it was
    // already false. Either way, lock it now to block a second hold until the next piece spawns.
    state.holdUsed = true;
    sfx.playHold();
    setStatusMessage(`Hold: ${currentType}`);
    // DOM (CSS classes, aria attrs) refreshes on the next oneFrame() render call.
  }

  function mergePiece() {
    for (const cell of pieceCells(state.current)) {
      if (cell.y >= 0 && cell.y < boardRows && cell.x >= 0 && cell.x < boardCols) {
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

  function recordHighScore() {
    if (state.score > state.highScore) {
      if (state.highScore > 0) state.newRecord = true;
      state.highScore = state.score;
      writeHighScore(state.highScore);
    }
  }

  function setStatusMessage(message, tone = 'normal', durationFrames = STATUS_MESSAGE_FRAMES) {
    state.statusMessage = message;
    state.statusTone = tone;
    state.statusMessageTimer = durationFrames;
  }

  function gameOverStatus() {
    return state.newRecord
      ? { text: 'New record!', tone: 'milestone' }
      : { text: 'Game Over', tone: 'warning' };
  }

  function fallbackStatusMessage() {
    if (state.gameOver) return gameOverStatus();
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
      const status = gameOverStatus();
      state.statusMessage = status.text;
      state.statusTone = status.tone;
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

  function onLinesResolved(cleared, { backToBack = false, combo = 0 } = {}) {
    const previousLevel = state.level;
    updateLevelAndSpeed();

    // Bonus tags only ever appear for skilled play (a combo chain or a back-to-back
    // Tetris); a lone clear leaves the suffix empty so base messages stay unchanged.
    const tags = [];
    if (backToBack) tags.push('Back-to-Back');
    if (combo >= 1) tags.push(`Combo ${combo}`);
    const suffix = tags.length ? ` · ${tags.join(' · ')}` : '';

    if (cleared === 4) {
      const linesToNextLevel = (10 - (state.lines % 10)) || 10;
      const levelTag = state.level > previousLevel ? ` · Level ${state.level}!` : '';
      setStatusMessage(`Tetris clear: ${linesToNextLevel} lines to next level${levelTag}${suffix}`, 'milestone');
      return;
    }
    if (state.level > previousLevel) {
      if (state.level % MILESTONE_LEVEL_INTERVAL === 0) {
        setStatusMessage(`Milestone reached: level ${state.level}${suffix}`, 'milestone');
      } else {
        setStatusMessage(`Level ${state.level} speed up${suffix}`, tags.length ? 'milestone' : 'normal');
      }
      return;
    }
    if (tags.length) {
      setStatusMessage(`Nice! ${tags.join(' · ')}`, 'milestone');
      return;
    }
    syncStatusMessage({ forceFallback: true });
  }

  function findFullRows() {
    const rows = [];
    for (let row = 0; row < boardRows; row += 1) {
      if (state.board[row].every((value) => value !== 0)) rows.push(row);
    }
    return rows;
  }

  function collapseRows(rows) {
    const rowSet = new Set(rows);
    const kept = [];
    for (let row = 0; row < boardRows; row += 1) {
      if (!rowSet.has(row)) kept.push(state.board[row].slice());
    }
    while (kept.length < boardRows) kept.unshift(Array(boardCols).fill(0));
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
      const previousLevel = state.level;
      // A Tetris is the only "difficult" clear here (no T-spin detection); chaining two
      // difficult clears without a non-difficult clear between them earns a back-to-back bonus.
      const isDifficult = cleared === 4;
      const backToBack = isDifficult && state.b2bActive;
      state.combo += 1;
      state.lines += cleared;
      let gained = CLEAR_SCORES[cleared] * state.level;
      if (backToBack) gained += Math.floor(CLEAR_SCORES[cleared] / 2) * state.level;
      if (state.combo > 0) gained += 50 * state.combo * state.level;
      state.score += gained;
      state.b2bActive = isDifficult;
      recordHighScore();
      onLinesResolved(cleared, { backToBack, combo: state.combo });
      sfx.playLineClear(cleared);
      if (state.combo > 0) sfx.playCombo(state.combo);
      if (state.level > previousLevel) sfx.playLevelUp();
    }
    spawnPiece();
  }

  function lockPiece({ silent = false } = {}) {
    mergePiece();
    const rows = findFullRows();
    state.current = null;
    if (!silent) sfx.playLock();
    if (rows.length > 0) {
      startClearAnimation(rows);
    } else {
      // A drop that clears nothing breaks the combo chain (back-to-back persists).
      state.combo = -1;
      spawnPiece();
    }
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
      sfx.playRotate();
      return true;
    }
    const kicks = [-1, 1, -2, 2];
    for (const kick of kicks) {
      const kicked = { ...next, x: next.x + kick };
      if (isValidPosition(kicked)) {
        state.current = kicked;
        state.lockTimer = 0;
        sfx.playRotate();
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
      sfx.playRotate();
      return true;
    }
    const kicks = [1, -1, 2, -2];
    for (const kick of kicks) {
      const kicked = { ...next, x: next.x + kick };
      if (isValidPosition(kicked)) {
        state.current = kicked;
        state.lockTimer = 0;
        sfx.playRotate();
        return true;
      }
    }
    return false;
  }

  function applySoftDropPoint(steps) {
    state.score += steps;
    recordHighScore();
  }

  function applyHardDropPoints(steps) {
    state.score += steps * 2;
    recordHighScore();
  }

  function stepDown({ rewardSoftDrop }) {
    if (state.gameOver || !state.current || state.clearAnimation) return false;
    const next = { ...state.current, y: state.current.y + 1 };
    if (isValidPosition(next)) {
      state.current = next;
      if (rewardSoftDrop) applySoftDropPoint(1);
      return true;
    }
    if (rewardSoftDrop) {
      state.lockTimer += 1;
      if (state.lockTimer >= LOCK_DELAY_FRAMES) lockPiece();
    } else {
      lockPiece();
    }
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
    sfx.playHardDrop();
    lockPiece({ silent: true });
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
      nextQueue: [],
      score: 0,
      highScore: readHighScore(),
      newRecord: false,
      lines: 0,
      level: 1,
      combo: -1,
      b2bActive: false,
      gravityFrames: BASE_GRAVITY_FRAMES,
      gravityTick: 0,
      lockTimer: 0,
      gameOver: false,
      paused: false,
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
    return { ...structuredClone(state), helpOpen: !helpOverlayEl.hidden, muted: sfx.isMuted() };
  }

  function setStateFromTests(nextState) {
    state = structuredClone(nextState);
    state.clearAnimation = state.clearAnimation ?? null;
    if (typeof state.statusMessage !== 'string') state.statusMessage = '';
    if (typeof state.statusTone !== 'string') state.statusTone = 'normal';
    if (typeof state.statusMessageTimer !== 'number') state.statusMessageTimer = 0;
    if (typeof state.frame !== 'number') state.frame = 0;
    if (typeof state.gravityFrames !== 'number') state.gravityFrames = BASE_GRAVITY_FRAMES;
    if (typeof state.gravityTick !== 'number') state.gravityTick = 0;
    if (typeof state.lockTimer !== 'number') state.lockTimer = 0;
    if (typeof state.paused !== 'boolean') state.paused = false;
    if (typeof state.highScore !== 'number') state.highScore = readHighScore();
    if (typeof state.newRecord !== 'boolean') state.newRecord = false;
    if (typeof state.combo !== 'number') state.combo = -1;
    if (typeof state.b2bActive !== 'boolean') state.b2bActive = false;
    if (!('heldPiece' in state)) state.heldPiece = null;
    if (!('holdUsed' in state)) state.holdUsed = false;
    if (!('nextPieceType' in state)) state.nextPieceType = null;
    // Derive the preview queue from whatever the test provided, falling back to the bag.
    if (!Array.isArray(state.nextQueue) || state.nextQueue.length === 0) {
      state.nextQueue = state.nextPieceType ? [state.nextPieceType] : peekNextTypes(NEXT_QUEUE_SIZE);
    }
    state.nextPieceType = state.nextQueue[0] ?? state.nextPieceType ?? null;
    // Normalize board to current dimensions, padding missing cells with zero.
    if (state.board) {
      const normalized = createBoard();
      const srcRows = Math.min(state.board.length, boardRows);
      for (let r = 0; r < srcRows; r += 1) {
        const srcRow = state.board[r] || [];
        const srcCols = Math.min(srcRow.length, boardCols);
        for (let c = 0; c < srcCols; c += 1) {
          normalized[r][c] = srcRow[c] || 0;
        }
      }
      state.board = normalized;
    }
    if (!state.current && !state.gameOver && !state.clearAnimation) spawnPiece();
    // Preserve an explicitly injected statusMessage; only sync the fallback when none was provided.
    if (state.gameOver) syncStatusMessage();
    else if (!state.statusMessage) syncStatusMessage({ forceFallback: true });
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
    if (ghost.y === piece.y) return [];
    return pieceCells(ghost);
  }

  function hexToRgb(hex) {
    const n = hex.replace('#', '');
    return {
      r: parseInt(n.slice(0, 2), 16),
      g: parseInt(n.slice(2, 4), 16),
      b: parseInt(n.slice(4, 6), 16)
    };
  }

  // amount in [-1, 1]: positive lightens toward white, negative darkens toward black.
  function shadeColor(hex, amount) {
    const { r, g, b } = hexToRgb(hex);
    const mix = (c) => (amount >= 0
      ? Math.round(c + (255 - c) * amount)
      : Math.round(c * (1 + amount)));
    const to2 = (c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0');
    return `#${to2(mix(r))}${to2(mix(g))}${to2(mix(b))}`;
  }

  function withAlpha(hex, alpha) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function roundRectPath(context, x, y, w, h, radius) {
    const r = Math.max(0, Math.min(radius, w / 2, h / 2));
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  // Shared block painter: a glossy, beveled gem used on the board and in previews.
  function paintGem(context, px, py, size, base, ghost = false) {
    const inset = Math.max(1, size * 0.05);
    const x0 = px + inset;
    const y0 = py + inset;
    const sz = size - inset * 2;
    const radius = Math.max(2, sz * 0.18);

    if (ghost) {
      roundRectPath(context, x0, y0, sz, sz, radius);
      context.fillStyle = withAlpha(base, 0.14);
      context.fill();
      context.lineWidth = Math.max(1, size * 0.06);
      context.strokeStyle = withAlpha(base, 0.7);
      context.stroke();
      return;
    }

    // Diagonal body gradient: bright top-left, deep bottom-right.
    const body = context.createLinearGradient(x0, y0, x0 + sz, y0 + sz);
    body.addColorStop(0, shadeColor(base, 0.42));
    body.addColorStop(0.5, base);
    body.addColorStop(1, shadeColor(base, -0.34));
    roundRectPath(context, x0, y0, sz, sz, radius);
    context.fillStyle = body;
    context.fill();

    // Glossy highlight across the top.
    roundRectPath(context, x0 + sz * 0.16, y0 + sz * 0.12, sz * 0.68, sz * 0.3, radius * 0.6);
    const gloss = context.createLinearGradient(0, y0, 0, y0 + sz * 0.5);
    gloss.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
    gloss.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = gloss;
    context.fill();

    // Crisp dark edge for separation between adjacent blocks.
    roundRectPath(context, x0, y0, sz, sz, radius);
    context.lineWidth = Math.max(1, size * 0.05);
    context.strokeStyle = shadeColor(base, -0.5);
    context.stroke();
  }

  function drawCell(x, y, index) {
    paintGem(ctx, x * cellSize, y * cellSize, cellSize, COLORS[index]);
  }

  function drawBoardBackground() {
    const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bg.addColorStop(0, '#15100d');
    bg.addColorStop(1, '#0a0706');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle playfield grid so empty space reads as a board.
    ctx.strokeStyle = 'rgba(229, 180, 140, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 1; c < boardCols; c += 1) {
      ctx.moveTo(Math.round(c * cellSize) + 0.5, 0);
      ctx.lineTo(Math.round(c * cellSize) + 0.5, canvas.height);
    }
    for (let r = 1; r < boardRows; r += 1) {
      ctx.moveTo(0, Math.round(r * cellSize) + 0.5);
      ctx.lineTo(canvas.width, Math.round(r * cellSize) + 0.5);
    }
    ctx.stroke();
  }

  function drawBoard() {
    const clearAnimation = state.clearAnimation;
    drawBoardBackground();

    if (state.current && !state.clearAnimation) {
      const ghostCells = getGhostCells(state.current);
      for (const cell of ghostCells) {
        if (cell.y >= 0) paintGem(ctx, cell.x * cellSize, cell.y * cellSize, cellSize, COLORS[state.current.index], true);
      }
    }

    for (let y = 0; y < boardRows; y += 1) {
      for (let x = 0; x < boardCols; x += 1) {
        const value = state.board[y][x];
        if (value !== 0) drawCell(x, y, value);
      }
    }
    if (state.current) {
      for (const cell of pieceCells(state.current)) {
        if (cell.y >= 0) drawCell(cell.x, cell.y, state.current.index);
      }
    }

    // Bright clearing flash that fades as the rows resolve.
    if (clearAnimation) {
      const progress = clearAnimation.frame / clearAnimation.totalFrames;
      const flash = 0.85 * (1 - progress);
      ctx.save();
      ctx.fillStyle = `rgba(255, 255, 255, ${flash})`;
      for (const row of clearAnimation.rows) {
        ctx.fillRect(0, row * cellSize, canvas.width, cellSize);
      }
      ctx.restore();
    }

    if (state.paused && !state.gameOver) {
      drawBoardOverlay('PAUSED', 'Press P to resume', '#f3ead6');
    }

    if (state.gameOver) {
      drawBoardOverlay('GAME OVER', [
        `Score ${state.score} · Best ${state.highScore}`,
        'Press R or tap Restart'
      ], state.newRecord ? '#f2b134' : '#e5392b');
    }
  }

  function drawBoardOverlay(title, subtitle, titleColor = '#f3ead6') {
    ctx.fillStyle = 'rgba(6, 10, 22, 0.74)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.shadowColor = withAlpha(titleColor, 0.6);
    ctx.shadowBlur = 18;
    ctx.fillStyle = titleColor;
    ctx.font = '30px "Russo One", "Trebuchet MS", sans-serif';
    const lines = Array.isArray(subtitle) ? subtitle : [subtitle];
    ctx.fillText(title, canvas.width / 2, canvas.height / 2 - 22);
    ctx.restore();
    ctx.fillStyle = '#d8c8ac';
    ctx.font = '13px "Space Mono", ui-monospace, monospace';
    lines.forEach((line, i) => {
      ctx.fillText(line, canvas.width / 2, canvas.height / 2 + 10 + i * 22);
    });
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
    const previewCell = Math.floor(Math.min((w - 4) / cols, (h - 4) / rows));
    const pieceW = cols * previewCell;
    const pieceH = rows * previewCell;
    const offsetX = Math.floor((w - pieceW) / 2) - minX * previewCell;
    const offsetY = Math.floor((h - pieceH) / 2) - minY * previewCell;

    const color = COLORS[pieceDef.index];
    for (const [dx, dy] of cells) {
      paintGem(context, offsetX + dx * previewCell, offsetY + dy * previewCell, previewCell, color);
    }
  }

  function popStat(el) {
    if (!el) return;
    el.classList.remove('stat-pop');
    void el.offsetWidth; // force reflow so the animation can retrigger
    el.classList.add('stat-pop');
  }

  let prevLevelShown = null;
  let prevLinesShown = null;

  function updateHud() {
    scoreEl.textContent = String(state.score);
    bestEl.textContent = String(state.highScore);
    linesEl.textContent = String(state.lines);
    levelEl.textContent = String(state.level);
    if (prevLevelShown !== null && state.level > prevLevelShown) popStat(levelEl);
    if (prevLinesShown !== null && state.lines > prevLinesShown) popStat(linesEl);
    prevLevelShown = state.level;
    prevLinesShown = state.lines;
    const statusText = state.paused && !state.gameOver ? 'Paused' : state.statusMessage;
    const statusTone = state.paused && !state.gameOver ? 'normal' : state.statusTone;
    if (statusEl.textContent !== statusText) statusEl.textContent = statusText;
    if (statusWrapEl && statusWrapEl.dataset.tone !== statusTone) statusWrapEl.dataset.tone = statusTone;
    pauseEl.textContent = state.paused ? 'Resume' : 'Pause';
    pauseEl.setAttribute('aria-pressed', state.paused ? 'true' : 'false');
    muteEl.textContent = sfx.isMuted() ? '🔇' : '🔊';
    muteEl.setAttribute('aria-pressed', sfx.isMuted() ? 'true' : 'false');
    const queue = Array.isArray(state.nextQueue) ? state.nextQueue : [];
    drawPiecePreview(nextCanvasEl, nextCtx, queue[0] ?? state.nextPieceType ?? null);
    drawPiecePreview(nextCanvas2El, nextCtx2, queue[1] ?? null);
    drawPiecePreview(nextCanvas3El, nextCtx3, queue[2] ?? null);
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
    if (!state.gameOver && !state.paused) {
      if (state.statusMessageTimer > 0 && !state.clearAnimation) {
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
        if ((held.softTick - 1) % DROP_REPEAT_FRAMES === 0) stepDown({ rewardSoftDrop: true });
      } else {
        held.softTick = 0;
      }
      state.gravityTick += 1;
      if (state.gravityTick >= state.gravityFrames) {
        state.gravityTick = 0;
        stepDown({ rewardSoftDrop: false });
      }
      state.frame += 1;
    } else if (state.gameOver) {
      if (state.statusMessage !== gameOverStatus().text) syncStatusMessage();
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
    if (!helpOverlayEl.hidden) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeHelp();
      }
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
    }
    if (event.key === 'r' || event.key === 'R') {
      restartGame();
      return;
    }
    if (event.key === 'p' || event.key === 'P' || event.key === 'Escape') {
      togglePause();
      return;
    }
    if (state.gameOver || state.paused) return;
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

  let longPressHardDropMs = 350;
  let softDropLongPressTimer = null;

  function cancelSoftDropLongPress() {
    if (softDropLongPressTimer !== null) {
      clearTimeout(softDropLongPressTimer);
      softDropLongPressTimer = null;
    }
  }

  function startSoftDropLongPress() {
    cancelSoftDropLongPress();
    softDropLongPressTimer = setTimeout(() => {
      softDropLongPressTimer = null;
      if (!held.softDrop) return;
      held.softDrop = false;
      hardDrop();
    }, longPressHardDropMs);
  }

  function setTouchHeld(action, isHeld) {
    if (action === 'left') setHorizontalHold('left', isHeld);
    else if (action === 'right') setHorizontalHold('right', isHeld);
    else if (action === 'soft-drop') {
      held.softDrop = isHeld;
      if (isHeld) startSoftDropLongPress();
      else cancelSoftDropLongPress();
    }
  }

  function togglePause() {
    if (state.gameOver) return;
    state.paused = !state.paused;
    render();
  }

  function toggleMute() {
    sfx.setMuted(!sfx.isMuted());
    updateHud();
  }

  function openHelp() {
    if (!helpOverlayEl.hidden) return;
    helpDidPause = !state.gameOver && !state.paused;
    if (helpDidPause) togglePause();
    helpOverlayEl.hidden = false;
    gameShellEl.setAttribute('inert', '');
    helpCloseEl.focus();
  }

  function closeHelp() {
    if (helpOverlayEl.hidden) return;
    helpOverlayEl.hidden = true;
    gameShellEl.removeAttribute('inert');
    markHelpSeen();
    if (helpDidPause && state.paused) togglePause();
    helpDidPause = false;
    helpEl.focus();
  }

  function onTouchButtonDown(action) {
    if (state.paused) return;
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
  pauseEl.addEventListener('click', togglePause);
  muteEl.addEventListener('click', toggleMute);
  helpEl.addEventListener('click', openHelp);
  helpCloseEl.addEventListener('click', closeHelp);
  helpOverlayEl.addEventListener('click', (event) => {
    if (event.target === helpOverlayEl) closeHelp();
  });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  for (const button of touchButtons) {
    const action = button.dataset.action;
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      // preventDefault() blocks focus transfer for non-button elements; restore it manually.
      if (button.tagName !== 'BUTTON') button.focus();
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

  // ── Direct board gestures ───────────────────────────────────────
  // Touch the board itself: drag horizontally to move (one cell per cell-width
  // dragged), drag down to soft drop, flick down to hard drop, swipe up to hold,
  // and tap to rotate. Tapping after game over restarts. These layer on top of
  // the off-canvas button deck so either style of play works.
  const TAP_MAX_MOVE_PX = 8;
  const TAP_MAX_MS = 300;
  const HARD_DROP_FLICK_MS = 260;
  const HARD_DROP_FLICK_CELLS = 1.5;
  const HOLD_SWIPE_CELLS = 1;

  const boardGesture = {
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    startTime: 0,
    startCol: 0,
    lastCol: 0,
    softSteps: 0,
    axis: null,
    moved: false,
    cssCell: cellSize
  };

  function axisLockThreshold(cssCell) {
    return Math.max(TAP_MAX_MOVE_PX + 2, cssCell * 0.35);
  }

  function onBoardPointerDown(event) {
    if (!helpOverlayEl.hidden || state.paused) return;
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    boardGesture.active = true;
    boardGesture.pointerId = event.pointerId;
    boardGesture.startX = event.clientX;
    boardGesture.startY = event.clientY;
    boardGesture.startTime = performance.now();
    boardGesture.startCol = state.current ? state.current.x : 0;
    boardGesture.lastCol = boardGesture.startCol;
    boardGesture.softSteps = 0;
    boardGesture.axis = null;
    boardGesture.moved = false;
    boardGesture.cssCell = (rect.width / boardCols) || cellSize;
    try { canvas.setPointerCapture(event.pointerId); } catch (_) { /* synthetic event */ }
  }

  function onBoardPointerMove(event) {
    if (!boardGesture.active || event.pointerId !== boardGesture.pointerId) return;
    if (state.gameOver || state.paused || !state.current || state.clearAnimation) return;
    const dx = event.clientX - boardGesture.startX;
    const dy = event.clientY - boardGesture.startY;
    const cssCell = boardGesture.cssCell;
    if (boardGesture.axis === null) {
      const threshold = axisLockThreshold(cssCell);
      if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
      boardGesture.axis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      boardGesture.moved = true;
    }
    if (boardGesture.axis === 'h') {
      const targetCol = boardGesture.startCol + Math.round(dx / cssCell);
      while (boardGesture.lastCol < targetCol && movePiece(1)) boardGesture.lastCol += 1;
      while (boardGesture.lastCol > targetCol && movePiece(-1)) boardGesture.lastCol -= 1;
    } else if (boardGesture.axis === 'v' && dy > 0) {
      const desired = Math.floor(dy / cssCell);
      while (boardGesture.softSteps < desired && state.current) {
        stepDown({ rewardSoftDrop: true });
        boardGesture.softSteps += 1;
      }
    }
  }

  function endBoardGesture(event) {
    if (!boardGesture.active || event.pointerId !== boardGesture.pointerId) return;
    try { canvas.releasePointerCapture(event.pointerId); } catch (_) { /* synthetic event */ }
    const dx = event.clientX - boardGesture.startX;
    const dy = event.clientY - boardGesture.startY;
    const dt = performance.now() - boardGesture.startTime;
    const cssCell = boardGesture.cssCell;
    const moved = boardGesture.moved;
    const axis = boardGesture.axis;
    boardGesture.active = false;
    boardGesture.pointerId = null;
    if (state.paused || !helpOverlayEl.hidden) return;
    const isTap = !moved && Math.abs(dx) < TAP_MAX_MOVE_PX && Math.abs(dy) < TAP_MAX_MOVE_PX && dt < TAP_MAX_MS;
    if (state.gameOver) {
      if (isTap) restartGame();
      return;
    }
    if (isTap) {
      rotatePiece();
      return;
    }
    if (axis === 'v') {
      if (dy > 0 && dt < HARD_DROP_FLICK_MS && dy > HARD_DROP_FLICK_CELLS * cssCell) {
        hardDrop();
      } else if (dy < 0 && Math.abs(dy) > HOLD_SWIPE_CELLS * cssCell) {
        holdPiece();
      }
    }
  }

  function cancelBoardGesture(event) {
    if (event.pointerId !== boardGesture.pointerId) return;
    try { canvas.releasePointerCapture(event.pointerId); } catch (_) { /* synthetic event */ }
    boardGesture.active = false;
    boardGesture.pointerId = null;
  }

  canvas.addEventListener('pointerdown', onBoardPointerDown);
  canvas.addEventListener('pointermove', onBoardPointerMove);
  canvas.addEventListener('pointerup', endBoardGesture);
  canvas.addEventListener('pointercancel', cancelBoardGesture);

  let _resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => {
      const prevCols = boardCols;
      const prevRows = boardRows;
      computeDimensions();
      if (boardCols !== prevCols || boardRows !== prevRows) restartGame();
    }, 200);
  });

  computeDimensions();
  restartGame();
  setAutoStep(true);
  if (!hasSeenHelp()) openHelp();

  window.__tetrisTest = {
    isReady: true,
    buildId: BUILD_ID,
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
    },
    setLongPressHardDropMs: (ms) => {
      longPressHardDropMs = ms;
    },
    getBoardSize: () => ({ cols: boardCols, rows: boardRows, cellSize }),
    setBoardSize: (cols, rows) => {
      boardCols = cols;
      boardRows = rows;
      canvas.width = cols * cellSize;
      canvas.height = rows * cellSize;
      if (state) render();
    },
    setMuted: (value) => {
      sfx.setMuted(Boolean(value));
      updateHud();
    }
  };
})();
