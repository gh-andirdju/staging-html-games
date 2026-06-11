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
    // Level 7 — one box, wall forces detour (push left×1 then up×2)
    [
      '#######',
      '#  .  #',
      '#     #',
      '#  $  #',
      '#  #  #',
      '#  @  #',
      '#######',
    ],
    // Level 8 — one box, wall cluster, push left×3 then up×3
    [
      '########',
      '#.     #',
      '# ###  #',
      '#      #',
      '#   $  #',
      '#   @  #',
      '########',
    ],
    // Level 9 — one box, open board, push left×3 then up×2
    [
      '########',
      '#      #',
      '# .    #',
      '#      #',
      '#    $ #',
      '#   @  #',
      '########',
    ],
    // Level 10 — one box, push right×2 then up×3 then left×1
    [
      '#########',
      '#       #',
      '#  .    #',
      '#       #',
      '#       #',
      '#  $    #',
      '#  @ ## #',
      '#########',
    ],
    // Level 11 — two boxes, push each up×2
    [
      '########',
      '#      #',
      '# ..   #',
      '#      #',
      '# $$   #',
      '#  @   #',
      '########',
    ],
    // Level 12 — two boxes, symmetric push up×2
    [
      '#########',
      '#       #',
      '#  . .  #',
      '#       #',
      '#  $ $  #',
      '#   @   #',
      '#########',
    ],
    // Level 13 — two boxes, targets spread wide
    [
      '#########',
      '#       #',
      '# .   . #',
      '#       #',
      '#  $ $  #',
      '#   @   #',
      '#########',
    ],
    // Level 14 — two boxes, targets in opposite corners
    [
      '##########',
      '#        #',
      '#.      .#',
      '#        #',
      '#  $ $   #',
      '#        #',
      '#    @   #',
      '##########',
    ],
    // Level 15 — three boxes, push up×1
    [
      '#########',
      '#       #',
      '# . . . #',
      '# $ $ $ #',
      '#       #',
      '#   @   #',
      '#########',
    ],
    // Level 16 — three boxes, push up×2
    [
      '#########',
      '#       #',
      '# . . . #',
      '#       #',
      '# $ $ $ #',
      '#       #',
      '#   @   #',
      '#########',
    ],
    // Level 17 — three boxes, push up×3
    [
      '##########',
      '#        #',
      '#  . . . #',
      '#        #',
      '#        #',
      '#  $ $ $ #',
      '#    @   #',
      '##########',
    ],
    // Level 18 — four boxes, push up×2
    [
      '###########',
      '#         #',
      '# . . . . #',
      '#         #',
      '# $ $ $ $ #',
      '#    @    #',
      '###########',
    ],
    // Level 19 — four boxes, push up×3
    [
      '###########',
      '#         #',
      '# . . . . #',
      '#         #',
      '#         #',
      '# $ $ $ $ #',
      '#    @    #',
      '###########',
    ],
    // Level 20 — four boxes, targets and boxes offset
    [
      '###########',
      '#         #',
      '#  . . .  #',
      '#         #',
      '#  $. $   #',
      '#   $ $   #',
      '#     @   #',
      '###########',
    ],
    // Level 21 — five boxes, push up×2
    [
      '############',
      '#          #',
      '# . . . . .#',
      '#          #',
      '# $ $ $ $ $#',
      '#          #',
      '#    @     #',
      '############',
    ],
    // Level 22 — five boxes, push up×3
    [
      '############',
      '#          #',
      '#  . . . . #',
      '#          #',
      '#          #',
      '#  $ $ $ $ #',
      '#          #',
      '#   . $    #',
      '#    @     #',
      '############',
    ],
    // Level 23 — five boxes, two rows of targets (3+2=5 boxes, 3+2=5 targets)
    [
      '#############',
      '#           #',
      '#  .  .  .  #',
      '#           #',
      '#  $  $  $  #',
      '#  .     .  #',
      '#  $     $  #',
      '#   @       #',
      '#############',
    ],
    // Level 24 — mixed, requires reordering pushes
    [
      '##########',
      '#        #',
      '#  . .   #',
      '#  # #   #',
      '#  $ $   #',
      '#        #',
      '#  . .   #',
      '#  # #   #',
      '#  $ $   #',
      '#   @    #',
      '##########',
    ],
    // Level 25 — five boxes (4 push up 3 rows, 1 push right 5 cols)
    [
      '###########',
      '#         #',
      '# . . . . #',
      '#         #',
      '#         #',
      '# $ $ $ $ #',
      '#         #',
      '# $  @  . #',
      '###########',
    ],
    // Level 26 — six boxes, wide board
    [
      '#############',
      '#           #',
      '#  . . . .  #',
      '#           #',
      '#  $ $ $ $  #',
      '#  . .      #',
      '#  $ $  @   #',
      '#           #',
      '#############',
    ],
  ];

  // ── Seeded PRNG ──────────────────────────────────────────────────────────

  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ── Procedural level generator (backward chaining) ───────────────────────

  function generateLevel(levelIndex, attempt = 0) {
    const rng = mulberry32((levelIndex * 1103515245 + 12345) ^ (attempt * 1234567));
    const randInt = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

    // Scale difficulty with level
    const depth = levelIndex - LEVELS.length;
    const rows = Math.min(6 + Math.floor(depth / 8), 13);
    const cols = Math.min(7 + Math.floor(depth / 6), 15);
    const nBoxes = Math.min(1 + Math.floor(depth / 8), 6);
    const nPulls = Math.min(15 + depth * 3, 90);

    // Build border-walled grid
    const grid = [];
    for (let r = 0; r < rows; r++) {
      grid[r] = [];
      for (let c = 0; c < cols; c++) {
        grid[r][c] = (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) ? WALL : FLOOR;
      }
    }

    // Add random interior walls (≈15% of interior cells), using flood-fill to
    // ensure the interior remains one connected region.
    const interiorCells = [];
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        interiorCells.push([r, c]);
      }
    }
    shuffle(interiorCells, rng);
    const wallCount = Math.floor(interiorCells.length * 0.15);
    let added = 0;
    for (const [r, c] of interiorCells) {
      if (added >= wallCount) break;
      grid[r][c] = WALL;
      if (floodFillCount(grid, rows, cols) < interiorCells.length - added - 1) {
        grid[r][c] = FLOOR; // would disconnect — revert
      } else {
        added++;
      }
    }

    // Collect floor cells; pick targets avoiding dead-corner positions
    const floors = [];
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        if (grid[r][c] === FLOOR && !isDeadCorner(grid, r, c)) {
          floors.push([r, c]);
        }
      }
    }
    if (floors.length < nBoxes + 1) return generateLevel(levelIndex, attempt + 1);

    shuffle(floors, rng);

    // Place boxes on targets (solved state)
    const targets = [];
    const boxes = [];
    for (let i = 0; i < nBoxes; i++) {
      targets.push({ row: floors[i][0], col: floors[i][1] });
      boxes.push({ row: floors[i][0], col: floors[i][1] });
    }

    // Place player on a floor cell that isn't a box
    let playerPos = null;
    for (let i = nBoxes; i < floors.length; i++) {
      playerPos = { row: floors[i][0], col: floors[i][1] };
      break;
    }
    if (!playerPos) return generateLevel(levelIndex, attempt + 1);

    // Apply reverse pushes (backward chaining)
    const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    let pullsDone = 0;
    let attempts = 0;
    while (pullsDone < nPulls && attempts < nPulls * 20) {
      attempts++;
      const bi = Math.floor(rng() * nBoxes);
      const [dr, dc] = DIRS[Math.floor(rng() * 4)];
      const box = boxes[bi];

      // New box position after reverse push
      const nbr = box.row + dr;
      const nbc = box.col + dc;
      if (nbr < 0 || nbr >= rows || nbc < 0 || nbc >= cols) continue;
      if (grid[nbr][nbc] !== FLOOR) continue;
      if (boxes.some((b, i) => i !== bi && b.row === nbr && b.col === nbc)) continue;

      // Pull-from position (player must be reachable from here)
      const pfr = box.row - dr;
      const pfc = box.col - dc;
      if (pfr < 0 || pfr >= rows || pfc < 0 || pfc >= cols) continue;
      if (grid[pfr][pfc] !== FLOOR) continue;
      if (boxes.some((b, i) => i !== bi && b.row === pfr && b.col === pfc)) continue;

      // Check player can reach pull-from position; all boxes are obstacles
      const boxSet = new Set(boxes.map((b) => `${b.row},${b.col}`));
      const reach = bfsReach(grid, rows, cols, playerPos.row, playerPos.col, boxSet);
      if (!reach.has(`${pfr},${pfc}`)) continue;

      // Apply the reverse push; player lands at pull-from position
      box.row = nbr;
      box.col = nbc;
      playerPos = { row: pfr, col: pfc };
      pullsDone++;
    }

    // Serialize to string array
    return serializeLevel(grid, rows, cols, targets, boxes, playerPos);
  }

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  function floodFillCount(grid, rows, cols) {
    // Count reachable floor cells from the first floor cell found
    let start = null;
    outer: for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        if (grid[r][c] === FLOOR) { start = [r, c]; break outer; }
      }
    }
    if (!start) return 0;
    const visited = new Set([`${start[0]},${start[1]}`]);
    const queue = [start];
    while (queue.length) {
      const [r, c] = queue.shift();
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr = r + dr, nc = c + dc;
        const key = `${nr},${nc}`;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] === FLOOR && !visited.has(key)) {
          visited.add(key);
          queue.push([nr, nc]);
        }
      }
    }
    return visited.size;
  }

  function isDeadCorner(grid, r, c) {
    // A cell where two adjacent walls share a corner — placing a target here
    // risks creating an immediately unsolvable dead-end.
    const wallN = grid[r - 1]?.[c] === WALL;
    const wallS = grid[r + 1]?.[c] === WALL;
    const wallW = grid[r]?.[c - 1] === WALL;
    const wallE = grid[r]?.[c + 1] === WALL;
    return (wallN && wallW) || (wallN && wallE) || (wallS && wallW) || (wallS && wallE);
  }

  function bfsReach(grid, rows, cols, sr, sc, boxSet) {
    const visited = new Set([`${sr},${sc}`]);
    const queue = [[sr, sc]];
    while (queue.length) {
      const [r, c] = queue.shift();
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nr = r + dr, nc = c + dc;
        const key = `${nr},${nc}`;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols &&
            grid[nr][nc] !== WALL && !boxSet.has(key) && !visited.has(key)) {
          visited.add(key);
          queue.push([nr, nc]);
        }
      }
    }
    return visited;
  }

  function serializeLevel(grid, rows, cols, targets, boxes, playerPos) {
    const tSet = new Set(targets.map((t) => `${t.row},${t.col}`));
    const bSet = new Set(boxes.map((b) => `${b.row},${b.col}`));
    const result = [];
    for (let r = 0; r < rows; r++) {
      let row = '';
      for (let c = 0; c < cols; c++) {
        const isTarget = tSet.has(`${r},${c}`);
        const isBox = bSet.has(`${r},${c}`);
        const isPlayer = playerPos.row === r && playerPos.col === c;
        if (grid[r][c] === WALL) {
          row += WALL;
        } else if (isBox && isTarget) {
          row += '*';
        } else if (isPlayer && isTarget) {
          row += '+';
        } else if (isBox) {
          row += '$';
        } else if (isPlayer) {
          row += '@';
        } else if (isTarget) {
          row += '.';
        } else {
          row += FLOOR;
        }
      }
      result.push(row);
    }
    return result;
  }

  function getLevel(index) {
    if (index < LEVELS.length) return LEVELS[index];
    return generateLevel(index);
  }

  // ── Canvas & DOM ─────────────────────────────────────────────────────────

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const levelEl = document.getElementById('level');
  const movesEl = document.getElementById('moves');
  const pushesEl = document.getElementById('pushes');
  const bestEl = document.getElementById('best');
  const statusEl = document.getElementById('status');
  const statusWrapEl = statusEl.closest('.status-wrap');
  const restartEl = document.getElementById('restart');

  const BEST_KEY = 'sokoban-best';

  function readBest() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(BEST_KEY));
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeBest(best) {
    try {
      window.localStorage.setItem(BEST_KEY, JSON.stringify(best));
    } catch {}
  }

  function bestForLevel(levelIndex) {
    const entry = readBest()[String(levelIndex)];
    if (entry && typeof entry.moves === 'number') {
      return { moves: entry.moves, pushes: typeof entry.pushes === 'number' ? entry.pushes : 0 };
    }
    return null;
  }

  let state = null;
  let autoStep = true;
  let rafId = null;
  let winFrames = 0;

  function parseLevel(levelIndex) {
    const rows = getLevel(levelIndex);
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
    const best = bestForLevel(levelIndex);
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
      bestMoves: best ? best.moves : null,
      bestPushes: best ? best.pushes : null,
      newBest: false,
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
      recordBest();
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

  function recordBest() {
    const best = readBest();
    const previous = best[String(state.level)];
    if (previous && typeof previous.moves === 'number' && state.moves >= previous.moves) return;
    best[String(state.level)] = { moves: state.moves, pushes: state.pushes };
    writeBest(best);
    state.bestMoves = state.moves;
    state.bestPushes = state.pushes;
    state.newBest = true;
  }

  function tick() {
    if (state.status === 'won') {
      winFrames++;
      if (winFrames >= WIN_HOLD_FRAMES) {
        loadLevel(state.level + 1);
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
          // Floor with target marker — transparent so bg shows through
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

      ctx.fillStyle = '#f59e0b';
      ctx.font = `bold ${Math.round(CELL_SIZE * 0.7)}px "Trebuchet MS", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Level Complete!', canvas.width / 2, canvas.height / 2);
    }
  }

  function updateHud() {
    levelEl.textContent = state.level + 1;
    movesEl.textContent = state.moves;
    pushesEl.textContent = state.pushes;
    bestEl.textContent = state.bestMoves == null ? '—' : state.bestMoves;

    if (state.status === 'won') {
      statusEl.textContent = state.newBest ? 'Level Complete — New best!' : 'Level Complete!';
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
      if (typeof next.level === 'number') {
        const best = bestForLevel(next.level);
        if (next.bestMoves === undefined)  state.bestMoves = best ? best.moves : null;
        if (next.bestPushes === undefined) state.bestPushes = best ? best.pushes : null;
      }
      if (next.newBest === undefined) state.newBest = false;
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
