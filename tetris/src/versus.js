(() => {
  'use strict';
  // ── Marathon Tetris — local 2-player versus ──────────────────────
  // Standalone: two independent boards on one keyboard, split at the T/Y seam,
  // with a shared garbage meter. Reuses the hi-fi visual system. The 1P engine
  // in game.js is untouched; this is a self-contained versus engine.

  const COLS = 10, ROWS = 20;
  const COLORS = ['#000000', '#34d2e8', '#f4c52e', '#b05de0', '#46cf6d', '#ef4a5e', '#3f7ef6', '#ff9f2e'];
  const GARBAGE_COLOR = '#3a4150';
  const GARBAGE_INDEX = 8;
  const PIECES = [
    { type: 'I', index: 1, rotations: [[[-1, 0], [0, 0], [1, 0], [2, 0]], [[1, -1], [1, 0], [1, 1], [1, 2]], [[-1, 1], [0, 1], [1, 1], [2, 1]], [[0, -1], [0, 0], [0, 1], [0, 2]]] },
    { type: 'O', index: 2, rotations: [[[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [0, 1], [1, 1]]] },
    { type: 'T', index: 3, rotations: [[[-1, 0], [0, 0], [1, 0], [0, 1]], [[0, -1], [0, 0], [1, 0], [0, 1]], [[0, -1], [-1, 0], [0, 0], [1, 0]], [[0, -1], [-1, 0], [0, 0], [0, 1]]] },
    { type: 'S', index: 4, rotations: [[[0, 0], [1, 0], [-1, 1], [0, 1]], [[0, -1], [0, 0], [1, 0], [1, 1]], [[0, 0], [1, 0], [-1, 1], [0, 1]], [[0, -1], [0, 0], [1, 0], [1, 1]]] },
    { type: 'Z', index: 5, rotations: [[[-1, 0], [0, 0], [0, 1], [1, 1]], [[1, -1], [0, 0], [1, 0], [0, 1]], [[-1, 0], [0, 0], [0, 1], [1, 1]], [[1, -1], [0, 0], [1, 0], [0, 1]]] },
    { type: 'J', index: 6, rotations: [[[-1, 0], [0, 0], [1, 0], [-1, 1]], [[0, -1], [0, 0], [0, 1], [1, 1]], [[1, -1], [-1, 0], [0, 0], [1, 0]], [[-1, -1], [0, -1], [0, 0], [0, 1]]] },
    { type: 'L', index: 7, rotations: [[[-1, 0], [0, 0], [1, 0], [1, 1]], [[0, -1], [0, 0], [0, 1], [1, -1]], [[-1, -1], [-1, 0], [0, 0], [1, 0]], [[-1, 1], [0, -1], [0, 0], [0, 1]]] }
  ];
  const GRAVITY_FRAMES = [48, 44, 40, 34, 30, 27, 24, 21, 18, 16, 14, 12, 10, 8, 6];
  const LOCK_DELAY = 30;
  const GARBAGE_OUT = [0, 0, 1, 2, 4]; // lines cleared → garbage sent

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ── Engine: one independent board ────────────────────────────────
  class TetrisGame {
    constructor(seed) {
      this.rng = mulberry32(seed);
      this.bag = [];
      this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
      this.current = null;
      this.heldPiece = null;
      this.holdUsed = false;
      this.nextQueue = [];
      this.score = 0;
      this.lines = 0;
      this.level = 1;
      this.gravityTick = 0;
      this.lockTimer = 0;
      this.softHeld = false;
      this.dead = false;
      this.pendingGarbage = 0;
      this.sentThisLock = 0;
      this.refillQueue();
      this.spawn();
    }

    shuffledBag() {
      const order = PIECES.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i -= 1) {
        const j = Math.floor(this.rng() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      return order;
    }

    ensureBag(n) { while (this.bag.length < n) this.bag = this.bag.concat(this.shuffledBag()); }
    refillQueue() { this.ensureBag(4); this.nextQueue = this.bag.slice(0, 3).map((i) => PIECES[i].type); }

    spawn() {
      this.ensureBag(1);
      const def = PIECES[this.bag.shift()];
      this.current = { type: def.type, index: def.index, x: Math.floor(COLS / 2) - 1, y: 0, rotation: 0 };
      this.refillQueue();
      this.gravityTick = 0;
      this.lockTimer = 0;
      this.holdUsed = false;
      if (!this.valid(this.current)) { this.dead = true; this.current = null; }
    }

    cells(piece) {
      const rot = PIECES.find((p) => p.type === piece.type).rotations[piece.rotation % 4];
      return rot.map(([dx, dy]) => ({ x: piece.x + dx, y: piece.y + dy }));
    }

    valid(piece) {
      for (const c of this.cells(piece)) {
        if (c.x < 0 || c.x >= COLS || c.y >= ROWS) return false;
        if (c.y >= 0 && this.board[c.y][c.x] !== 0) return false;
      }
      return true;
    }

    gravityFor() {
      const idx = Math.min(GRAVITY_FRAMES.length - 1, Math.max(0, this.level - 1));
      return GRAVITY_FRAMES[idx];
    }

    move(dx) {
      if (this.dead || !this.current) return false;
      const n = { ...this.current, x: this.current.x + dx };
      if (this.valid(n)) { this.current = n; this.lockTimer = 0; return true; }
      return false;
    }

    rotate(dir) {
      if (this.dead || !this.current) return false;
      const next = { ...this.current, rotation: (this.current.rotation + (dir > 0 ? 1 : 3)) % 4 };
      const kicks = dir > 0 ? [0, -1, 1, -2, 2] : [0, 1, -1, 2, -2];
      for (const k of kicks) {
        const cand = { ...next, x: next.x + k };
        if (this.valid(cand)) { this.current = cand; this.lockTimer = 0; return true; }
      }
      return false;
    }

    softDrop() {
      if (this.dead || !this.current) return;
      const n = { ...this.current, y: this.current.y + 1 };
      if (this.valid(n)) { this.current = n; this.score += 1; }
      else { this.lockTimer += 1; if (this.lockTimer >= LOCK_DELAY) this.lock(); }
    }

    hardDrop() {
      if (this.dead || !this.current) return;
      let dist = 0;
      while (true) {
        const n = { ...this.current, y: this.current.y + 1 };
        if (!this.valid(n)) break;
        this.current = n; dist += 1;
      }
      this.score += dist * 2;
      this.lock();
    }

    hold() {
      if (this.dead || !this.current || this.holdUsed) return;
      const cur = this.current.type;
      if (this.heldPiece === null) {
        this.heldPiece = cur; this.current = null; this.spawn();
      } else {
        const def = PIECES.find((p) => p.type === this.heldPiece);
        const swapped = { type: def.type, index: def.index, x: Math.floor(COLS / 2) - 1, y: 0, rotation: 0 };
        if (!this.valid(swapped)) return;
        this.heldPiece = cur; this.current = swapped; this.lockTimer = 0; this.gravityTick = 0;
      }
      this.holdUsed = true;
    }

    ghost() {
      if (!this.current) return [];
      let g = { ...this.current };
      while (true) { const n = { ...g, y: g.y + 1 }; if (!this.valid(n)) break; g = n; }
      return g.y === this.current.y ? [] : this.cells(g);
    }

    fullRows() {
      const rows = [];
      for (let y = 0; y < ROWS; y += 1) if (this.board[y].every((v) => v !== 0)) rows.push(y);
      return rows;
    }

    lock() {
      this.sentThisLock = 0;
      for (const c of this.cells(this.current)) {
        if (c.y >= 0 && c.y < ROWS && c.x >= 0 && c.x < COLS) this.board[c.y][c.x] = this.current.index;
      }
      this.current = null;
      const rows = this.fullRows();
      const cleared = rows.length;
      if (cleared > 0) {
        const kept = this.board.filter((_, y) => !rows.includes(y));
        while (kept.length < ROWS) kept.unshift(Array(COLS).fill(0));
        this.board = kept;
        this.lines += cleared;
        this.score += [0, 100, 300, 500, 800][cleared] * this.level;
        this.level = 1 + Math.floor(this.lines / 10);
        // Garbage: cancel own pending first, then send the remainder.
        let out = GARBAGE_OUT[cleared] || 0;
        const cancel = Math.min(this.pendingGarbage, out);
        this.pendingGarbage -= cancel;
        out -= cancel;
        this.sentThisLock = out;
      } else if (this.pendingGarbage > 0) {
        this.applyGarbage(this.pendingGarbage);
        this.pendingGarbage = 0;
      }
      this.spawn();
    }

    applyGarbage(n) {
      const hole = Math.floor(this.rng() * COLS);
      for (let i = 0; i < n; i += 1) {
        this.board.shift();
        const row = Array(COLS).fill(GARBAGE_INDEX);
        row[hole] = 0;
        this.board.push(row);
      }
    }

    receiveGarbage(n) { if (n > 0) this.pendingGarbage += n; }

    step() {
      if (this.dead || !this.current) return;
      if (this.softHeld) this.softDrop();
      this.gravityTick += 1;
      if (this.gravityTick >= this.gravityFor()) {
        this.gravityTick = 0;
        const n = { ...this.current, y: this.current.y + 1 };
        if (this.valid(n)) this.current = n;
        else { this.lockTimer += 1; if (this.lockTimer >= LOCK_DELAY || !this.softHeld) this.lock(); }
      }
    }
  }

  // ── Block painter (handoff bevel) ────────────────────────────────
  function roundRect(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function paintGem(c, px, py, size, color, ghost) {
    const r = Math.max(2, Math.round(size * 0.18));
    if (ghost) {
      roundRect(c, px, py, size, size, r);
      c.fillStyle = hexA(color, 0.10); c.fill();
      c.lineWidth = 1.5; c.strokeStyle = color; c.stroke();
      return;
    }
    roundRect(c, px, py, size, size, r); c.fillStyle = color; c.fill();
    c.save(); roundRect(c, px, py, size, size, r); c.clip();
    const tH = Math.max(1, size * 0.10), bH = Math.max(1, size * 0.14), sW = Math.max(1, size * 0.10);
    c.fillStyle = 'rgba(255,255,255,0.38)'; c.fillRect(px, py, size, tH);
    c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(px, py + size - bH, size, bH);
    c.fillStyle = 'rgba(255,255,255,0.14)'; c.fillRect(px, py, sW, size);
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(px + size - sW, py, sW, size);
    c.restore();
  }

  function hexA(hex, a) {
    const n = hex.replace('#', '');
    return `rgba(${parseInt(n.slice(0, 2), 16)},${parseInt(n.slice(2, 4), 16)},${parseInt(n.slice(4, 6), 16)},${a})`;
  }

  function colorFor(idx) { return idx === GARBAGE_INDEX ? GARBAGE_COLOR : COLORS[idx]; }

  function drawBoard(ctx, game, cell) {
    const gap = 2;
    const w = COLS * cell, h = ROWS * cell;
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#090b10'); bg.addColorStop(1, '#0b0e14');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < ROWS; y += 1) for (let x = 0; x < COLS; x += 1) {
      roundRect(ctx, x * cell + gap / 2, y * cell + gap / 2, cell - gap, cell - gap, Math.max(2, Math.round((cell - gap) * 0.18)));
      ctx.fillStyle = 'rgba(255,255,255,0.022)'; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.025)'; ctx.stroke();
    }
    if (game.current) {
      for (const c of game.ghost()) if (c.y >= 0) paintGem(ctx, c.x * cell + gap / 2, c.y * cell + gap / 2, cell - gap, colorFor(game.current.index), true);
    }
    for (let y = 0; y < ROWS; y += 1) for (let x = 0; x < COLS; x += 1) {
      const v = game.board[y][x];
      if (v) paintGem(ctx, x * cell + gap / 2, y * cell + gap / 2, cell - gap, colorFor(v));
    }
    if (game.current) {
      for (const c of game.cells(game.current)) if (c.y >= 0) paintGem(ctx, c.x * cell + gap / 2, c.y * cell + gap / 2, cell - gap, colorFor(game.current.index));
    }
    if (game.dead) {
      ctx.fillStyle = 'rgba(7,9,13,0.78)'; ctx.fillRect(0, 0, w, h);
    }
  }

  function drawMini(canvas, ctx, type, dim) {
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!type) return;
    const def = PIECES.find((p) => p.type === type);
    const cells = def.rotations[0];
    let minX = 9, maxX = -9, minY = 9, maxY = -9;
    for (const [dx, dy] of cells) { minX = Math.min(minX, dx); maxX = Math.max(maxX, dx); minY = Math.min(minY, dy); maxY = Math.max(maxY, dy); }
    const cols = maxX - minX + 1, rows = maxY - minY + 1;
    const cell = Math.floor(Math.min((canvas.width - 4) / cols, (canvas.height - 4) / rows));
    const offX = Math.floor((canvas.width - cols * cell) / 2) - minX * cell;
    const offY = Math.floor((canvas.height - rows * cell) / 2) - minY * cell;
    ctx.globalAlpha = dim ? 0.5 : 1;
    for (const [dx, dy] of cells) paintGem(ctx, offX + dx * cell, offY + dy * cell, cell, COLORS[def.index]);
    ctx.globalAlpha = 1;
  }

  // ── Controller: wires two games to the page ──────────────────────
  const P1_COLOR = '#34d2e8';
  const P2_COLOR = '#ff4d8d';
  const WIN_ROUNDS = 3; // best of 5

  const el = (id) => document.getElementById(id);
  const sides = [
    { key: 'p1', color: P1_COLOR, canvas: el('board-p1'), holdC: el('hold-p1'), nextC: [el('next-p1-1'), el('next-p1-2'), el('next-p1-3')], lines: el('lines-p1'), ko: el('ko-p1'), tag: el('side-p1') },
    { key: 'p2', color: P2_COLOR, canvas: el('board-p2'), holdC: el('hold-p2'), nextC: [el('next-p2-1'), el('next-p2-2'), el('next-p2-3')], lines: el('lines-p2'), ko: el('ko-p2'), tag: el('side-p2') }
  ];
  const meterTop = el('meter-top');
  const meterBot = el('meter-bot');
  const roundP1 = el('round-p1');
  const roundP2 = el('round-p2');
  const bannerEl = el('vs-banner');
  const pauseBtn = el('pause');
  const restartBtn = el('restart');

  let games = [];
  let rounds = [0, 0];
  let kos = [0, 0];
  let paused = false;
  let roundOver = false;
  let autoStep = true;
  let raf = null;
  let acc = 0, last = 0;
  let seedBase = (Math.random() * 1e9) >>> 0;

  function newRound() {
    games = [new TetrisGame(seedBase + rounds[0] * 7 + rounds[1] * 13 + 1), new TetrisGame(seedBase + rounds[0] * 17 + rounds[1] * 19 + 2)];
    roundOver = false;
    setBanner('');
    render();
  }

  function fullRestart() {
    rounds = [0, 0]; kos = [0, 0]; seedBase = (Math.random() * 1e9) >>> 0;
    paused = false; newRound();
  }

  function setBanner(text, color) {
    bannerEl.textContent = text;
    bannerEl.style.color = color || 'var(--text)';
    bannerEl.classList.toggle('show', !!text);
  }

  function resolveGarbage() {
    // Each game's sentThisLock is pushed to the opponent, then consumed.
    if (games[0].sentThisLock) { games[1].receiveGarbage(games[0].sentThisLock); games[0].sentThisLock = 0; }
    if (games[1].sentThisLock) { games[0].receiveGarbage(games[1].sentThisLock); games[1].sentThisLock = 0; }
  }

  function checkKO() {
    if (roundOver) return;
    const d0 = games[0].dead, d1 = games[1].dead;
    if (d0 || d1) {
      roundOver = true;
      const winner = d0 && !d1 ? 1 : (d1 && !d0 ? 0 : -1);
      if (winner >= 0) { rounds[winner] += 1; kos[winner] += 1; }
      if (rounds[0] >= WIN_ROUNDS || rounds[1] >= WIN_ROUNDS) {
        const champ = rounds[0] >= WIN_ROUNDS ? 1 : 2;
        setBanner(`Player ${champ} wins the match!`, champ === 1 ? P1_COLOR : P2_COLOR);
      } else if (winner >= 0) {
        setBanner(`Player ${winner + 1} wins the round — Space for next`, winner === 0 ? P1_COLOR : P2_COLOR);
      } else {
        setBanner('Draw — Space for next');
      }
    }
  }

  function oneFrame() {
    if (paused || roundOver) { render(); return; }
    games[0].step();
    games[1].step();
    resolveGarbage();
    checkKO();
    render();
  }

  function matchDone() { return rounds[0] >= WIN_ROUNDS || rounds[1] >= WIN_ROUNDS; }

  function render() {
    sides.forEach((s, i) => {
      const g = games[i];
      const cell = s.canvas.width / COLS;
      drawBoard(s.canvas.getContext('2d'), g, cell);
      drawMini(s.holdC, s.holdC.getContext('2d'), g.heldPiece, false);
      s.nextC.forEach((c, qi) => drawMini(c, c.getContext('2d'), g.nextQueue[qi] ?? null, qi > 0));
      s.lines.textContent = String(g.lines);
      s.ko.textContent = String(kos[i]);
    });
    roundP1.textContent = String(rounds[0]);
    roundP2.textContent = String(rounds[1]);
    // Garbage meter: top = pending against P1 (P2 color), bottom = pending against P2 (P1 color).
    const cap = 16;
    meterTop.style.height = `${Math.min(50, (games[0].pendingGarbage / cap) * 50)}%`;
    meterBot.style.height = `${Math.min(50, (games[1].pendingGarbage / cap) * 50)}%`;
    pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
    pauseBtn.querySelector('.btn-label').textContent = paused ? 'Resume' : 'Pause';
  }

  // ── Split keyboard ───────────────────────────────────────────────
  // P1 (left half): A/D move, S soft, W rotate cw, Q rotate ccw, E hold, LShift hard.
  // P2 (right half): arrows move, ↑ rotate cw, . rotate ccw, / hold, RShift hard.
  function onKeyDown(e) {
    if (e.key === 'Escape') { togglePause(); return; }
    if (e.key === 'r' || e.key === 'R') { fullRestart(); return; }
    if (roundOver) {
      if (e.code === 'Space' && !matchDone()) { e.preventDefault(); newRound(); }
      else if (e.code === 'Space' && matchDone()) { e.preventDefault(); fullRestart(); }
      return;
    }
    if (paused) return;
    const [g1, g2] = games;
    switch (e.code) {
      // Player 1
      case 'KeyA': g1.move(-1); break;
      case 'KeyD': g1.move(1); break;
      case 'KeyS': g1.softHeld = true; break;
      case 'KeyW': if (!e.repeat) g1.rotate(1); break;
      case 'KeyQ': if (!e.repeat) g1.rotate(-1); break;
      case 'KeyE': if (!e.repeat) g1.hold(); break;
      case 'ShiftLeft': if (!e.repeat) g1.hardDrop(); break;
      // Player 2
      case 'ArrowLeft': e.preventDefault(); g2.move(-1); break;
      case 'ArrowRight': e.preventDefault(); g2.move(1); break;
      case 'ArrowDown': e.preventDefault(); g2.softHeld = true; break;
      case 'ArrowUp': e.preventDefault(); if (!e.repeat) g2.rotate(1); break;
      case 'Period': if (!e.repeat) g2.rotate(-1); break;
      case 'Slash': if (!e.repeat) g2.hold(); break;
      case 'ShiftRight': if (!e.repeat) g2.hardDrop(); break;
      default: return;
    }
    resolveGarbage(); checkKO(); render();
  }

  function onKeyUp(e) {
    if (!games.length) return;
    if (e.code === 'KeyS') games[0].softHeld = false;
    else if (e.code === 'ArrowDown') games[1].softHeld = false;
  }

  function togglePause() {
    if (roundOver) return;
    paused = !paused;
    render();
  }

  function tick(ts) {
    if (!autoStep) return;
    if (!last) last = ts;
    acc += ts - last; last = ts;
    while (acc >= 1000 / 60) { oneFrame(); acc -= 1000 / 60; }
    raf = requestAnimationFrame(tick);
  }

  function setAutoStep(on) {
    autoStep = on;
    if (on && raf === null) { last = 0; acc = 0; raf = requestAnimationFrame(tick); }
    else if (!on && raf !== null) { cancelAnimationFrame(raf); raf = null; }
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  pauseBtn.addEventListener('click', togglePause);
  restartBtn.addEventListener('click', fullRestart);
  el('help')?.addEventListener('click', () => el('help-overlay').toggleAttribute('hidden'));
  el('help-close')?.addEventListener('click', () => el('help-overlay').setAttribute('hidden', ''));

  newRound();
  setAutoStep(true);

  // ── Test hook ────────────────────────────────────────────────────
  window.__versusTest = {
    isReady: true,
    buildId: 'tetris-versus-2026-06-17.7',
    setAutoStep,
    advanceFrames: async (n) => { for (let i = 0; i < (Number(n) || 0); i += 1) oneFrame(); },
    getState: () => ({
      rounds: rounds.slice(),
      kos: kos.slice(),
      paused, roundOver, matchDone: matchDone(),
      p1: { lines: games[0].lines, dead: games[0].dead, pending: games[0].pendingGarbage, board: games[0].board.map((r) => r.slice()) },
      p2: { lines: games[1].lines, dead: games[1].dead, pending: games[1].pendingGarbage, board: games[1].board.map((r) => r.slice()) }
    }),
    // Authoring helpers for deterministic visual tests.
    setBoard: (which, rows) => {
      const g = which === 'p2' ? games[1] : games[0];
      for (let y = 0; y < ROWS; y += 1) for (let x = 0; x < COLS; x += 1) g.board[y][x] = (rows[y] && rows[y][x]) || 0;
      render();
    },
    setPending: (p1, p2) => { games[0].pendingGarbage = p1; games[1].pendingGarbage = p2; render(); },
    setRounds: (a, b) => { rounds = [a, b]; render(); },
    sendGarbage: (from, n) => { (from === 'p1' ? games[1] : games[0]).receiveGarbage(n); render(); },
    killPlayer: (which) => { (which === 'p2' ? games[1] : games[0]).dead = true; checkKO(); render(); },
    clearActive: () => {
      games.forEach((g, i) => {
        g.current = null;
        g.nextQueue = i === 0 ? ['T', 'I', 'S'] : ['O', 'J', 'Z'];
        g.heldPiece = i === 0 ? 'L' : 'I';
      });
      render();
    },
    keydown: (code) => onKeyDown({ code, key: code, preventDefault() {}, repeat: false }),
    keyup: (code) => onKeyUp({ code })
  };
})();
