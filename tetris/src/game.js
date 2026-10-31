export function startGame(engine) {
  // Invisible build marker — lets a deployed device be checked against the
  // committed source via `window.__tetrisBuild` (or the <meta> tag in index.html).
  const BUILD_ID = 'tetris-wasm-desktop-2026-10-31.2';
  try { window.__tetrisBuild = BUILD_ID; } catch (_) {}

  let boardCols = 10;
  let boardRows = 20;
  let cellSize = 30;
  const BASE_GRAVITY_FRAMES = 48;
  const LOCK_DELAY_FRAMES = 30;
  // A grounded piece resets its lock delay each time it is moved or rotated, but
  // only this many times — past the cap it locks regardless, so it can't be stalled
  // on the floor forever ("infinity" prevention).
  const MOVE_RESET_LIMIT = 15;
  const DROP_REPEAT_FRAMES = 2;
  const HORIZONTAL_DAS_FRAMES = 16;
  const HORIZONTAL_ARR_FRAMES = 6;
  const CLEAR_BLINK_TOTAL_FRAMES = 18;
  const CLEAR_BLINK_INTERVAL_FRAMES = 2;
  const STATUS_MESSAGE_FRAMES = 180;
  const MILESTONE_LEVEL_INTERVAL = 5;
  // Cap how much wall-clock time a single animation frame may represent. When a tab
  // is backgrounded the rAF loop is throttled/paused, so the next delta can be many
  // seconds; without this clamp the fixed-step accumulator would burn through that
  // time in one burst and drop the active piece across the whole board.
  const MAX_FRAME_DELTA_MS = 100;

  // Piece geometry, SRS kicks, collision and scoring live in Rust/Wasm.
  const PIECES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'].map((type, i) => ({ type, index: i + 1 }));

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
  const nextCanvas4El = document.getElementById('next-canvas-4');
  const nextCtx4 = nextCanvas4El ? nextCanvas4El.getContext('2d') : null;
  const nextCanvas5El = document.getElementById('next-canvas-5');
  const nextCtx5 = nextCanvas5El ? nextCanvas5El.getContext('2d') : null;
  const nextSlots = [
    [nextCanvasEl, nextCtx],
    [nextCanvas2El, nextCtx2],
    [nextCanvas3El, nextCtx3],
    [nextCanvas4El, nextCtx4],
    [nextCanvas5El, nextCtx5]
  ];
  const holdCanvasEl = document.getElementById('hold-canvas');
  const holdCtx = holdCanvasEl ? holdCanvasEl.getContext('2d') : null;
  const pauseLabelEl = pauseEl ? pauseEl.querySelector('.btn-label') : null;
  const meterFillEl = document.getElementById('meter-fill');
  const meterCountEl = document.getElementById('meter-count');
  const meterTargetEl = document.getElementById('meter-target');
  const touchButtons = Array.from(document.querySelectorAll('[data-action]'));

  function sizeBoardCanvas() {
    const width = boardCols * cellSize;
    const height = boardRows * cellSize;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width + 2}px`;
    canvas.style.height = `${height + 2}px`;
    canvas.dataset.logicalWidth = width;
    canvas.dataset.logicalHeight = height;
  }

  function computeDimensions() {
    const shellEl = canvas.closest('.game-shell');
    const areaEl = shellEl.querySelector('.board-area');

    // The board sits in its own grid cell (`.board-area`); its box is exactly the
    // space available for the canvas at the current breakpoint.
    const areaRect = areaEl.getBoundingClientRect();
    const areaStyle = getComputedStyle(areaEl);
    const padX = (parseFloat(areaStyle.paddingLeft) || 0) + (parseFloat(areaStyle.paddingRight) || 0);
    const padY = (parseFloat(areaStyle.paddingTop) || 0) + (parseFloat(areaStyle.paddingBottom) || 0);

    // Reserve room for the status line below the board.
    const availH = areaRect.height - padY - 20;
    const availW = areaRect.width - padX - 2;

    const desktop = window.matchMedia('(min-width: 1024px)').matches;
    const targetCell = desktop ? 56 : 30;
    const heightCell = Math.floor(availH / 20);
    const widthCell = availW > 0 ? Math.floor(availW / 10) : targetCell;
    const cs = Math.max(14, Math.min(targetCell, heightCell, widthCell));

    boardCols = 10;
    // Desktop resizes affect rendering only, never the logical playfield.
    boardRows = desktop ? 20 : Math.max(20, Math.min(40, Math.floor(availH / cs)));
    cellSize = cs;

    sizeBoardCanvas();
  }

  function createBoard() {
    return Array.from({ length: boardRows }, () => Array(boardCols).fill(0));
  }

  // Per-game tallies surfaced on the game-over screen and via getState().
  function createStats() {
    return { pieces: 0, tetrises: 0, tSpins: 0, perfectClears: 0, maxCombo: 0 };
  }

  function bumpStat(key, amount = 1) {
    if (state.stats) state.stats[key] += amount;
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

  // Ghost piece (the landing-shadow preview) — on by default; some players prefer it off.
  const GHOST_KEY = 'tetris-ghost';

  function readGhostEnabled() {
    try {
      return window.localStorage.getItem(GHOST_KEY) !== '0';
    } catch {
      return true;
    }
  }

  function writeGhostEnabled(value) {
    try {
      window.localStorage.setItem(GHOST_KEY, value ? '1' : '0');
    } catch {}
  }

  let ghostEnabled = readGhostEnabled();

  // Haptic feedback — short vibrations on key events for touch devices; on by default,
  // and a no-op where the Vibration API is unavailable (most desktops).
  const HAPTICS_KEY = 'tetris-haptics';

  function readHapticsEnabled() {
    try {
      return window.localStorage.getItem(HAPTICS_KEY) !== '0';
    } catch {
      return true;
    }
  }

  function writeHapticsEnabled(value) {
    try {
      window.localStorage.setItem(HAPTICS_KEY, value ? '1' : '0');
    } catch {}
  }

  let hapticsEnabled = readHapticsEnabled();

  function vibrate(pattern) {
    if (!hapticsEnabled) return;
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    try { navigator.vibrate(pattern); } catch (_) {}
  }

  // Themeable accent — drives the score, hard-drop pad, level meter and board glow.
  const ACCENT_KEY = 'tetris-accent';
  const ACCENTS = ['#34d2e8', '#ffb02e', '#ff4d8d', '#46cf6d', '#b05de0'];
  const swatchEls = Array.from(document.querySelectorAll('.swatch'));

  function readAccent() {
    try {
      const v = window.localStorage.getItem(ACCENT_KEY);
      return ACCENTS.includes(v) ? v : ACCENTS[0];
    } catch {
      return ACCENTS[0];
    }
  }

  function applyAccent(hex) {
    const value = ACCENTS.includes(hex) ? hex : ACCENTS[0];
    const { r, g, b } = hexToRgb(value);
    document.documentElement.style.setProperty('--accent', value);
    document.documentElement.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
    swatchEls.forEach((s) => s.setAttribute('aria-pressed', s.dataset.accent === value ? 'true' : 'false'));
    try { window.localStorage.setItem(ACCENT_KEY, value); } catch {}
  }

  // Chosen starting level (1–15) — higher starts begin faster for a tougher run.
  const START_LEVEL_KEY = 'tetris-start-level';
  const MAX_START_LEVEL = 15;

  function clampStartLevel(value) {
    const n = Math.round(Number(value) || 1);
    return Math.max(1, Math.min(MAX_START_LEVEL, n));
  }

  function readStartLevel() {
    try {
      return clampStartLevel(window.localStorage.getItem(START_LEVEL_KEY));
    } catch {
      return 1;
    }
  }

  function writeStartLevel(value) {
    try {
      window.localStorage.setItem(START_LEVEL_KEY, String(clampStartLevel(value)));
    } catch {}
  }

  // Game mode: 'marathon' (the classic endless climb — default, so the baseline is
  // unchanged) or 'sprint' (a 40-line time attack: clear the target as fast as you can).
  const MODE_KEY = 'tetris-mode';
  const MODES = ['marathon', 'sprint'];
  const SPRINT_LINES = 40;
  const SPRINT_BEST_KEY = 'tetris-sprint-best';

  function clampMode(value) {
    return MODES.includes(value) ? value : 'marathon';
  }

  function readMode() {
    try {
      return clampMode(window.localStorage.getItem(MODE_KEY));
    } catch {
      return 'marathon';
    }
  }

  function writeMode(value) {
    try {
      window.localStorage.setItem(MODE_KEY, clampMode(value));
    } catch {}
  }

  function readSprintBest() {
    try {
      const n = Number(window.localStorage.getItem(SPRINT_BEST_KEY));
      return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
    } catch {
      return 0;
    }
  }

  function writeSprintBest(frames) {
    try {
      window.localStorage.setItem(SPRINT_BEST_KEY, String(Math.round(frames)));
    } catch {}
  }

  // Frame counts run at the fixed 60fps step, so frames/60 is seconds. Render as
  // m:ss.t (tenths) the way every sprint leaderboard does.
  function formatSprintTime(frames) {
    const totalMs = (Math.max(0, frames) / 60) * 1000;
    const minutes = Math.floor(totalMs / 60000);
    const seconds = Math.floor((totalMs % 60000) / 1000);
    const tenths = Math.floor((totalMs % 1000) / 100);
    return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`;
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
      // A bright, twisting two-note flourish that marks a T-spin.
      playTSpin() {
        tone(740, 1180, 0.09, 0, 'triangle', 0.09);
        tone(1180, 1480, 0.08, 0.08, 'triangle', 0.07);
      },
      // A sparkling four-note rise for the rare Perfect Clear.
      playPerfectClear() {
        const notes = [784, 988, 1319, 1568];
        notes.forEach((freq, index) => tone(freq, freq, 0.1, index * 0.06, 'triangle', 0.09));
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

  const NEXT_QUEUE_SIZE = 5;

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
      // Spawn one row down so canonical SRS shapes (which carry a cell in their top
      // row) are fully visible at spawn instead of being clipped above the board.
      y: 1,
      rotation: 0
    };
  }

  function pieceCells(piece) {
    return engine.cells(piece);
  }

  function isValidPosition(piece) {
    return engine.isValid(state.board, piece);
  }

  function spawnPiece() {
    state.current = nextPiece();
    state.lockTimer = 0;
    state.lockResets = 0;
    state.gravityTick = 0;
    state.holdUsed = false;
    state.lastMoveRotation = false;
    state.lastRotationKick = 0;
    if (!isValidPosition(state.current)) {
      state.gameOver = true;
      syncStatusMessage();
      if (state.newRecord) sfx.playNewRecord();
      else sfx.playGameOver();
      vibrate([80, 40, 120]);
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
      const swapped = { type: pieceDef.type, index: pieceDef.index, x: spawnX, y: 1, rotation: 0 };
      if (!isValidPosition(swapped)) return;
      // Mutate only after validation succeeds to avoid corrupt state on failure.
      state.heldPiece = currentType;
      state.current = swapped;
      state.lockTimer = 0;
      state.lockResets = 0;
      state.gravityTick = 0;
      state.lastMoveRotation = false;
      state.lastRotationKick = 0;
    }
    // After first-hold, spawnPiece() cleared holdUsed for the spawned piece; after a swap it was
    // already false. Either way, lock it now to block a second hold until the next piece spawns.
    state.holdUsed = true;
    sfx.playHold();
    setStatusMessage(`Hold: ${currentType}`);
    // DOM (CSS classes, aria attrs) refreshes on the next oneFrame() render call.
  }

  function mergePiece() {
    state.board = engine.merge(state.board, state.current);
  }

  function gravityFramesForLevel(level) {
    return engine.gravityFrames(level);
  }

  function updateLevelAndSpeed() {
    // Level climbs every 10 lines from the chosen starting level (default 1, so the
    // classic 1 + lines/10 progression is unchanged for a normal game).
    state.level = (state.startLevel || 1) + Math.floor(state.lines / 10);
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
    if (state.sprintComplete) {
      return { text: `Sprint clear · ${formatSprintTime(state.sprintFrames)}`, tone: 'milestone' };
    }
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

  function onLinesResolved(cleared, { backToBack = false, combo = 0, tSpin = null } = {}) {
    const previousLevel = state.level;
    updateLevelAndSpeed();

    // Bonus tags only ever appear for skilled play (a combo chain or a back-to-back
    // Tetris); a lone clear leaves the suffix empty so base messages stay unchanged.
    const tags = [];
    if (backToBack) tags.push('Back-to-Back');
    if (combo >= 1) tags.push(`Combo ${combo}`);
    const suffix = tags.length ? ` · ${tags.join(' · ')}` : '';

    // A T-spin clear is the headline — announce it with the line count.
    if (tSpin) {
      const lineName = ['', 'Single', 'Double', 'Triple'][cleared] || '';
      const label = tSpin === 'mini' ? 'T-Spin Mini' : 'T-Spin';
      const levelTag = state.level > previousLevel ? ` · Level ${state.level}!` : '';
      setStatusMessage(`${label} ${lineName}!${levelTag}${suffix}`, 'milestone');
      return;
    }

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
    return engine.fullRows(state.board);
  }

  function collapseRows(rows) {
    state.board = engine.collapseRows(state.board, rows);
  }

  function clearWouldEmptyBoard(rows) {
    return engine.clearWouldEmptyBoard(state.board, rows);
  }

  function startClearAnimation(rows, intensity = 0) {
    state.clearAnimation = {
      rows: rows.slice(),
      frame: 0,
      totalFrames: CLEAR_BLINK_TOTAL_FRAMES,
      blinkInterval: CLEAR_BLINK_INTERVAL_FRAMES,
      intensity
    };
  }

  function resolveClearAnimation() {
    if (!state.clearAnimation) return;
    const cleared = state.clearAnimation.rows.length;
    const tSpin = state.pendingTSpin || null;
    state.pendingTSpin = null;
    collapseRows(state.clearAnimation.rows);
    state.clearAnimation = null;
    if (cleared > 0) {
      const previousLevel = state.level;
      // "Difficult" clears (a Tetris or any T-spin that cleared lines) chain into a
      // back-to-back bonus when not interrupted by a non-difficult clear.
      const isDifficult = cleared === 4 || !!tSpin;
      const backToBack = isDifficult && state.b2bActive;
      // A Perfect Clear (All Clear): the clear emptied the entire playfield.
      const perfectClear = state.board.every((row) => row.every((value) => value === 0));
      state.combo += 1;
      state.lines += cleared;
      const gained = engine.clearScore(cleared, tSpin, state.level, state.combo, backToBack, perfectClear);
      state.score += gained;
      state.b2bActive = isDifficult;
      if (cleared === 4) bumpStat('tetrises');
      if (perfectClear) bumpStat('perfectClears');
      if (state.combo > state.stats.maxCombo) state.stats.maxCombo = state.combo;
      recordHighScore();
      onLinesResolved(cleared, { backToBack, combo: state.combo, tSpin });
      // A Perfect Clear is the rarest feat on the board, so it headlines the status line.
      if (perfectClear) setStatusMessage('Perfect Clear!', 'milestone');
      sfx.playLineClear(cleared);
      if (perfectClear) sfx.playPerfectClear();
      else if (tSpin) sfx.playTSpin();
      if (state.combo > 0) sfx.playCombo(state.combo);
      if (state.level > previousLevel) sfx.playLevelUp();
      // Haptics scale with the feat: Perfect Clear > Tetris/T-spin > ordinary clear.
      if (perfectClear) vibrate([30, 30, 30, 60]);
      else if (cleared === 4 || tSpin) vibrate([40, 30, 40]);
      else vibrate(18 + cleared * 8);
      // Sprint mode ends the instant the line target is reached — fastest clear wins.
      if (state.mode === 'sprint' && !state.sprintComplete && state.lines >= state.sprintTarget) {
        completeSprint();
      }
    }
    // Don't spawn a fresh piece once the run is over (sprint clear or top-out).
    if (!state.gameOver) spawnPiece();
  }

  // Sprint clear: stop the clock, lock the run, and record a new best time. Reuses the
  // game-over flow (so play halts and the overlay shows) but flags sprintComplete so the
  // status line and overlay read as a win, not a loss.
  function completeSprint() {
    state.sprintComplete = true;
    state.gameOver = true;
    const best = readSprintBest();
    if (best === 0 || state.sprintFrames < best) {
      state.newRecord = true;
      writeSprintBest(state.sprintFrames);
      state.sprintBest = state.sprintFrames;
    } else {
      state.sprintBest = best;
    }
    setStatusMessage(`Sprint clear · ${formatSprintTime(state.sprintFrames)}`, 'milestone');
    if (state.newRecord) sfx.playNewRecord();
    else sfx.playLevelUp();
    vibrate([30, 30, 30, 60]);
  }

  // A piece is "landed" when it cannot fall one more row.
  function pieceLanded(piece) {
    return !isValidPosition({ ...piece, y: piece.y + 1 });
  }

  // 3-corner T-spin detection. Runs at lock time using the last successful action:
  // a T whose final action was a rotation and that has ≥3 of its diagonal corners
  // filled is a T-spin; both front corners filled (or a last-resort kick) make it a
  // full T-spin, otherwise a mini.
  function detectTSpin() {
    return engine.detectTSpin(state.board, state.current, state.lastMoveRotation, state.lastRotationKick);
  }

  function lockPiece({ silent = false } = {}) {
    const tSpin = detectTSpin();
    bumpStat('pieces');
    if (tSpin) bumpStat('tSpins');
    mergePiece();
    const rows = findFullRows();
    state.current = null;
    if (!silent) { sfx.playLock(); vibrate(8); }
    if (rows.length > 0) {
      state.pendingTSpin = tSpin;
      const intensity = clearWouldEmptyBoard(rows) ? 2 : (rows.length === 4 || tSpin ? 1 : 0);
      startClearAnimation(rows, intensity);
    } else {
      // A T-spin that clears no line still scores and announces, but a clear-free
      // lock always breaks the combo chain (back-to-back persists across it).
      if (tSpin) {
        state.score += engine.clearScore(0, tSpin, state.level, 0, false, false);
        recordHighScore();
        setStatusMessage(tSpin === 'mini' ? 'T-Spin Mini!' : 'T-Spin!', 'milestone');
        sfx.playTSpin();
      }
      state.combo = -1;
      spawnPiece();
    }
  }

  // Reset the lock delay after a successful move/rotate, but only while grounded and
  // only up to MOVE_RESET_LIMIT times so a piece can't be juggled on the floor forever.
  function noteManipulation() {
    if (state.current && pieceLanded(state.current)) {
      if (state.lockResets < MOVE_RESET_LIMIT) {
        state.lockTimer = 0;
        state.lockResets += 1;
      }
    } else {
      state.lockTimer = 0;
    }
  }

  function movePiece(dx) {
    if (state.gameOver || !state.current || state.clearAnimation) return false;
    const next = { ...state.current, x: state.current.x + dx };
    if (!isValidPosition(next)) return false;
    state.current = next;
    state.lastMoveRotation = false;
    noteManipulation();
    return true;
  }

  function applyRotation(toRotation) {
    if (state.gameOver || !state.current || state.clearAnimation) return false;
    const result = engine.rotate(state.board, state.current, toRotation);
    if (!result) return false;
    state.current = result.piece;
    state.lastMoveRotation = true;
    state.lastRotationKick = result.kick;
    noteManipulation();
    sfx.playRotate();
    return true;
  }

  function rotatePiece() {
    if (state.gameOver || !state.current || state.clearAnimation) return false;
    const from = state.current.rotation % 4;
    const to = (from + 1) % 4;
    return applyRotation(to);
  }

  function rotatePieceCcw() {
    if (state.gameOver || !state.current || state.clearAnimation) return false;
    const from = state.current.rotation % 4;
    const to = (from + 3) % 4;
    return applyRotation(to);
  }

  function applySoftDropPoint(steps) {
    state.score += steps;
    recordHighScore();
  }

  function applyHardDropPoints(steps) {
    state.score += steps * 2;
    recordHighScore();
  }

  // Move the current piece down one row if possible. Leaving the ground resets the
  // lock delay and its reset budget. Returns true when the piece actually descended.
  function descendPiece() {
    if (!state.current) return false;
    const next = { ...state.current, y: state.current.y + 1 };
    if (!isValidPosition(next)) return false;
    state.current = next;
    state.lockTimer = 0;
    state.lockResets = 0;
    state.lastMoveRotation = false;
    return true;
  }

  // Player-driven soft-drop step: descends one row and scores a point on success.
  function softDropStep() {
    if (state.gameOver || !state.current || state.clearAnimation) return false;
    if (descendPiece()) {
      applySoftDropPoint(1);
      return true;
    }
    return false;
  }

  // Lock-delay tick: a grounded piece counts down to a lock; an airborne piece has a
  // clean slate (timer and reset budget zeroed). Applies to gravity drops too, so a
  // piece landed by gravity can still be slid/spun before it commits.
  function updateLockDelay() {
    if (!state.current || state.clearAnimation || state.gameOver) return;
    if (pieceLanded(state.current)) {
      state.lockTimer += 1;
      if (state.lockTimer >= LOCK_DELAY_FRAMES) lockPiece();
    } else {
      state.lockTimer = 0;
      state.lockResets = 0;
    }
  }

  function hardDrop() {
    if (state.gameOver || !state.current || state.clearAnimation) return;
    const distance = engine.dropDistance(state.board, state.current);
    state.current = { ...state.current, y: state.current.y + distance };
    // Dropping through any distance is a downward move, so it can't be a T-spin; a
    // piece already wedged at the floor (distance 0) keeps its rotation credit.
    if (distance > 0) state.lastMoveRotation = false;
    applyHardDropPoints(distance);
    sfx.playHardDrop();
    vibrate(16);
    lockPiece({ silent: true });
  }

  function restartGame() {
    seededValue = (Math.random() * 4294967296) >>> 0;
    bag = [];
    const startLevel = readStartLevel();
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
      mode: readMode(),
      sprintTarget: SPRINT_LINES,
      sprintFrames: 0,
      sprintComplete: false,
      sprintBest: readSprintBest(),
      startLevel: startLevel,
      level: startLevel,
      combo: -1,
      b2bActive: false,
      pendingTSpin: null,
      lastMoveRotation: false,
      lastRotationKick: 0,
      lockResets: 0,
      stats: createStats(),
      gravityFrames: gravityFramesForLevel(startLevel),
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
    if (typeof state.lockResets !== 'number') state.lockResets = 0;
    if (typeof state.lastMoveRotation !== 'boolean') state.lastMoveRotation = false;
    if (typeof state.lastRotationKick !== 'number') state.lastRotationKick = 0;
    if (!('pendingTSpin' in state)) state.pendingTSpin = null;
    if (!state.stats || typeof state.stats !== 'object') state.stats = createStats();
    else state.stats = { ...createStats(), ...state.stats };
    if (typeof state.startLevel !== 'number') state.startLevel = 1;
    state.mode = clampMode(state.mode);
    if (typeof state.sprintTarget !== 'number') state.sprintTarget = SPRINT_LINES;
    if (typeof state.sprintFrames !== 'number') state.sprintFrames = 0;
    if (typeof state.sprintComplete !== 'boolean') state.sprintComplete = false;
    if (typeof state.sprintBest !== 'number') state.sprintBest = readSprintBest();
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

  function hexToRgb(hex) {
    const n = hex.replace('#', '');
    return {
      r: parseInt(n.slice(0, 2), 16),
      g: parseInt(n.slice(2, 4), 16),
      b: parseInt(n.slice(4, 6), 16)
    };
  }

  function prefersReducedMotion() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }

  function currentAccent() {
    const value = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    return /^#[0-9a-f]{6}$/i.test(value) ? value : ACCENTS[0];
  }

  // Rust computes and paints the board through thin browser Canvas2D bindings.
  function drawBoard() {
    engine.drawBoard(canvas, state, {
      cellSize,
      ghostEnabled,
      reducedMotion: prefersReducedMotion(),
      accent: currentAccent()
    });

    if (state.paused && !state.gameOver) {
      drawBoardOverlay('PAUSED', 'Press P to resume', '#eef1f6');
    }

    if (state.gameOver) {
      const stats = state.stats || createStats();
      // Surface the run's highlights when there is anything worth bragging about.
      const tallies = [];
      if (stats.tetrises) tallies.push(`Tetris ×${stats.tetrises}`);
      if (stats.tSpins) tallies.push(`T-Spin ×${stats.tSpins}`);
      if (stats.perfectClears) tallies.push(`Perfect ×${stats.perfectClears}`);
      if (stats.maxCombo > 0) tallies.push(`Combo ${stats.maxCombo}`);
      if (state.sprintComplete) {
        // Sprint win: lead with the finishing time and the best to beat.
        const best = state.sprintBest || readSprintBest();
        const lines = [`Time ${formatSprintTime(state.sprintFrames)}${state.newRecord ? ' · New record!' : ''}`];
        if (best) lines.push(`Best ${formatSprintTime(best)} · Score ${state.score}`);
        if (tallies.length) lines.push(tallies.join(' · '));
        lines.push('Press R or tap Restart');
        drawBoardOverlay(`SPRINT ${state.sprintTarget} CLEAR`, lines, '#34d2e8');
      } else {
        const lines = [`Score ${state.score} · Best ${state.highScore}`];
        // In a sprint top-out, show how far the run got toward the line target.
        if (state.mode === 'sprint') lines.push(`Sprint: ${state.lines}/${state.sprintTarget} lines`);
        if (tallies.length) lines.push(tallies.join(' · '));
        lines.push('Press R or tap Restart');
        drawBoardOverlay('GAME OVER', lines, state.newRecord ? '#34d2e8' : '#ef4a5e');
      }
    }
  }

  function drawBoardOverlay(title, subtitle, titleColor = '#eef1f6') {
    engine.drawOverlay(canvas, title, subtitle, titleColor);
  }

  function drawPiecePreview(canvasEl, _context, type) {
    if (canvasEl) engine.drawPreview(canvasEl, type);
  }

  function popStat(el) {
    if (!el) return;
    el.classList.remove('stat-pop');
    void el.offsetWidth; // force reflow so the animation can retrigger
    el.classList.add('stat-pop');
  }

  let prevLevelShown = null;
  let prevLinesShown = null;

  function updateLevelMeter() {
    const linesIntoLevel = state.lines % 10;
    const pct = Math.round((linesIntoLevel / 10) * 100);
    if (meterFillEl) meterFillEl.style.setProperty('--meter-pct', `${pct}%`);
    if (meterCountEl) meterCountEl.textContent = `${linesIntoLevel}/10`;
    if (meterTargetEl) meterTargetEl.textContent = `To Lvl ${state.level + 1}`;
  }

  function updateHud() {
    scoreEl.textContent = String(state.score);
    bestEl.textContent = String(state.highScore);
    linesEl.textContent = String(state.lines);
    levelEl.textContent = String(state.level);
    if (prevLevelShown !== null && state.level > prevLevelShown) popStat(levelEl);
    if (prevLinesShown !== null && state.lines > prevLinesShown) popStat(linesEl);
    prevLevelShown = state.level;
    prevLinesShown = state.lines;
    // Keep the board's accessible name describing the live game state for screen readers.
    const boardSummary = state.gameOver
      ? `Tetris board. Game over. Level ${state.level}, ${state.lines} lines, score ${state.score}.`
      : `Tetris board. Level ${state.level}, ${state.lines} lines, score ${state.score}${state.paused ? '. Paused' : ''}.`;
    if (canvas.getAttribute('aria-label') !== boardSummary) canvas.setAttribute('aria-label', boardSummary);
    updateLevelMeter();
    let statusText;
    let statusTone;
    if (state.paused && !state.gameOver) {
      statusText = 'Paused';
      statusTone = 'normal';
    } else if (state.mode === 'sprint' && !state.gameOver && state.statusMessageTimer <= 0) {
      // Live sprint readout: elapsed time + lines left. Transient feats (Tetris!, etc.)
      // still take over for their duration via the statusMessageTimer guard above.
      const remaining = Math.max(0, state.sprintTarget - state.lines);
      const pb = state.sprintBest || 0;
      statusText = `Sprint · ${formatSprintTime(state.sprintFrames)} · ${remaining} line${remaining === 1 ? '' : 's'} left${pb ? ` · PB ${formatSprintTime(pb)}` : ''}`;
      statusTone = remaining <= 5 ? 'warning' : 'normal';
    } else {
      statusText = state.statusMessage;
      statusTone = state.statusTone;
    }
    if (statusEl.textContent !== statusText) statusEl.textContent = statusText;
    if (statusWrapEl && statusWrapEl.dataset.tone !== statusTone) statusWrapEl.dataset.tone = statusTone;
    if (pauseLabelEl) pauseLabelEl.textContent = state.paused ? 'Resume' : 'Pause';
    pauseEl.setAttribute('aria-pressed', state.paused ? 'true' : 'false');
    muteEl.setAttribute('data-muted', sfx.isMuted() ? 'true' : 'false');
    muteEl.setAttribute('aria-pressed', sfx.isMuted() ? 'true' : 'false');
    const queue = Array.isArray(state.nextQueue) ? state.nextQueue : [];
    nextSlots.forEach(([el, context], i) => {
      const type = i === 0 ? (queue[0] ?? state.nextPieceType ?? null) : (queue[i] ?? null);
      drawPiecePreview(el, context, type);
    });
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
      // Sprint clock ticks through active play, including line-clear animations.
      if (state.mode === 'sprint' && !state.sprintComplete) state.sprintFrames += 1;
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
        if ((held.softTick - 1) % DROP_REPEAT_FRAMES === 0) softDropStep();
      } else {
        held.softTick = 0;
      }
      state.gravityTick += 1;
      if (state.gravityTick >= state.gravityFrames) {
        state.gravityTick = 0;
        descendPiece();
      }
      // Lock delay runs after movement so a piece grounded by gravity, soft drop, or
      // a slide gets a window to be repositioned (and reset by moves) before locking.
      updateLockDelay();
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
    // Clamp the per-frame delta so a backgrounded tab (where requestAnimationFrame
    // is throttled or paused) doesn't return a multi-second delta that fast-forwards
    // dozens of frames at once and slams the active piece to the floor.
    const delta = Math.min(timestamp - lastTime, MAX_FRAME_DELTA_MS);
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
    if (event.defaultPrevented) return;
    if (event.target.closest?.('input, select, textarea, [contenteditable="true"]')) return;
    // Keep native Space/Enter activation on focused controls; arrow shortcuts still
    // work after clicking a toolbar button or returning from the help dialog.
    if ((event.code === 'Space' || event.key === 'Enter') &&
        event.target.closest?.('button, a, [role="button"]')) return;
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
    else if (event.key === 'ArrowUp' || event.key === 'x' || event.key === 'X') rotatePiece();
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

  // Hard drop is now an explicit pad (⤓), so soft-drop is a plain continuous hold.
  function setTouchHeld(action, isHeld) {
    if (action === 'left') setHorizontalHold('left', isHeld);
    else if (action === 'right') setHorizontalHold('right', isHeld);
    else if (action === 'soft-drop') held.softDrop = isHeld;
  }

  function togglePause() {
    if (state.gameOver) return;
    state.paused = !state.paused;
    render();
  }

  // Pause an in-progress game when the tab is hidden, so the player doesn't return to
  // a board that kept falling. Only acts on a live, unpaused game with no modal open;
  // it never auto-resumes (the player resumes deliberately).
  function autoPauseGame() {
    if (state.gameOver || state.paused || !helpOverlayEl.hidden) return;
    togglePause();
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
  swatchEls.forEach((s) => s.addEventListener('click', () => applyAccent(s.dataset.accent)));
  // Starting-level selector (in the help/settings panel): persist the choice and start
  // a fresh game at that level. If the help panel is open it stays paused behind it so
  // the player resumes deliberately.
  const startLevelEl = document.getElementById('start-level');
  function applyStartLevel(value, { restart = true } = {}) {
    const level = clampStartLevel(value);
    writeStartLevel(level);
    if (startLevelEl) startLevelEl.value = String(level);
    if (restart) {
      const helpOpen = !helpOverlayEl.hidden;
      restartGame();
      if (helpOpen) {
        state.paused = true;
        helpDidPause = true;
        render();
      }
    }
  }
  if (startLevelEl) {
    startLevelEl.value = String(readStartLevel());
    startLevelEl.addEventListener('change', () => applyStartLevel(startLevelEl.value));
  }
  // Mode selector (help/settings panel): Marathon (default) or 40-line Sprint. Switching
  // starts a fresh run in the chosen mode; like the start-level picker it stays paused
  // behind an open help panel so the player resumes deliberately.
  const modeSelectEl = document.getElementById('mode-select');
  function applyMode(value, { restart = true } = {}) {
    const mode = clampMode(value);
    writeMode(mode);
    if (modeSelectEl) modeSelectEl.value = mode;
    if (restart) {
      const helpOpen = !helpOverlayEl.hidden;
      restartGame();
      if (helpOpen) {
        state.paused = true;
        helpDidPause = true;
        render();
      }
    }
  }
  if (modeSelectEl) {
    modeSelectEl.value = readMode();
    modeSelectEl.addEventListener('change', () => applyMode(modeSelectEl.value));
  }
  // Ghost-piece toggle (help/settings panel): persist and redraw immediately.
  const ghostToggleEl = document.getElementById('ghost-toggle');
  function applyGhostEnabled(value) {
    ghostEnabled = Boolean(value);
    writeGhostEnabled(ghostEnabled);
    if (ghostToggleEl) ghostToggleEl.checked = ghostEnabled;
    if (state) render();
  }
  if (ghostToggleEl) {
    ghostToggleEl.checked = ghostEnabled;
    ghostToggleEl.addEventListener('change', () => applyGhostEnabled(ghostToggleEl.checked));
  }
  // Vibration/haptics toggle (help/settings panel): persist and keep the checkbox in sync.
  const hapticsToggleEl = document.getElementById('haptics-toggle');
  function applyHapticsEnabled(value) {
    hapticsEnabled = Boolean(value);
    writeHapticsEnabled(hapticsEnabled);
    if (hapticsToggleEl) hapticsToggleEl.checked = hapticsEnabled;
    if (!hapticsEnabled && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try { navigator.vibrate(0); } catch (_) {}
    }
  }
  if (hapticsToggleEl) {
    hapticsToggleEl.checked = hapticsEnabled;
    hapticsToggleEl.addEventListener('change', () => applyHapticsEnabled(hapticsToggleEl.checked));
  }
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
      while (boardGesture.softSteps < desired && state.current && softDropStep()) {
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

  // Returning to a backgrounded tab: discard the stale timestamp so the next tick
  // measures a fresh, small delta instead of catching up the whole idle interval.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      autoPauseGame();
    } else {
      lastTime = 0;
      accumulator = 0;
    }
  });

  // Switching to another window/app while the tab stays visible doesn't fire
  // visibilitychange, so also pause on window blur (and reset timing on refocus).
  window.addEventListener('blur', () => autoPauseGame());
  window.addEventListener('focus', () => {
    lastTime = 0;
    accumulator = 0;
  });

  let _resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => {
      const prevCols = boardCols;
      const prevRows = boardRows;
      computeDimensions();
      if (boardCols !== prevCols || boardRows !== prevRows) restartGame();
      else render();
    }, 200);
  });

  applyAccent(readAccent());
  computeDimensions();
  restartGame();
  setAutoStep(true);
  if (!hasSeenHelp()) openHelp();

  window.__tetrisTest = {
    isReady: true,
    buildId: BUILD_ID,
    engine: engine.kind,
    renderer: engine.renderer,
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
    setLongPressHardDropMs: (_ms) => {
      // no-op: hard drop is now an explicit pad, not a soft-drop long-press.
    },
    getBoardSize: () => ({ cols: boardCols, rows: boardRows, cellSize }),
    setBoardSize: (cols, rows) => {
      boardCols = cols;
      boardRows = rows;
      sizeBoardCanvas();
      if (state) render();
    },
    setMuted: (value) => {
      sfx.setMuted(Boolean(value));
      updateHud();
    },
    setAccent: (hex) => applyAccent(hex),
    getAccent: () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
    getStartLevel: () => readStartLevel(),
    setStartLevel: (value) => applyStartLevel(value),
    getMode: () => readMode(),
    setMode: (value) => applyMode(value),
    getSprintBest: () => readSprintBest(),
    getGhostEnabled: () => ghostEnabled,
    setGhostEnabled: (value) => applyGhostEnabled(value),
    getHaptics: () => hapticsEnabled,
    setHaptics: (value) => applyHapticsEnabled(value)
  };
}
