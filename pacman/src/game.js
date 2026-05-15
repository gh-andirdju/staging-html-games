(function () {
  "use strict";

  // ── Constants ──────────────────────────────────────────────────────────────
  var TILE = 20;
  var COLS = 21;
  var ROWS = 21;
  var MAZE_X = 190;
  var MAZE_Y = 40;
  var FIXED_DT = 1 / 60;
  var PACMAN_SPEED = 7.5;
  var GHOST_SPEED_NORMAL = 6.5;
  var GHOST_SPEED_FRIGHTENED = 4.0;
  var GHOST_SPEED_EATEN = 12.0;
  var FRIGHTENED_FRAMES = 480;
  var DOT_SCORE = 10;
  var PELLET_SCORE = 50;
  var GHOST_SCORES = [200, 400, 800, 1600];
  var SCATTER_FRAMES = 420;
  var CHASE_FRAMES = 1200;
  var DEATH_FRAMES = 90;
  var LEVEL_COMPLETE_FRAMES = 120;
  var COLLISION_RADIUS = TILE * 0.6;

  // Ghost house region — non-eaten/non-house ghosts and Pac-Man cannot enter
  var GH_MIN_ROW = 8;
  var GH_MAX_ROW = 12;
  var GH_MIN_COL = 6;
  var GH_MAX_COL = 14;

  // ── Maze template ──────────────────────────────────────────────────────────
  // 0=wall  1=dot  2=power-pellet  3=open  4=ghost-house door
  //
  // Row 6 opens cols 9-11 to form a corridor above the ghost house.
  // Row 7 col 10 is the single ghost-house door connecting that corridor to the
  // ghost-house interior (rows 8-12, cols 6-14).
  var MAZE_TEMPLATE = [
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,1,1,1,1,1,1,1,1,1,0,1,1,1,1,1,1,1,1,1,0],
    [0,2,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,2,0],
    [0,1,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,1,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,1,0,0,1,0,1,0,0,0,0,0,0,0,1,0,1,0,0,1,0],
    [0,1,1,1,1,0,1,1,1,3,3,3,1,1,1,0,1,1,1,1,0],
    [0,0,0,0,1,0,0,0,3,0,4,0,3,0,0,0,1,0,0,0,0],
    [0,0,0,0,1,0,3,3,3,3,3,3,3,3,3,0,1,0,0,0,0],
    [3,3,3,3,1,0,3,0,3,3,3,3,3,0,3,0,1,3,3,3,3],
    [0,0,0,0,1,0,3,0,4,3,3,3,4,0,3,0,1,0,0,0,0],
    [0,0,0,0,1,0,3,3,3,3,3,3,3,3,3,0,1,0,0,0,0],
    [0,0,0,0,1,0,3,0,0,0,0,0,0,0,3,0,1,0,0,0,0],
    [0,1,1,1,1,1,1,1,1,1,0,1,1,1,1,1,1,1,1,1,0],
    [0,1,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,1,0],
    [0,2,0,0,1,1,1,1,1,0,0,0,1,1,1,1,1,0,0,2,0],
    [0,1,1,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,1,1,0],
    [0,0,1,1,1,0,1,1,1,1,0,1,1,1,1,0,1,1,1,0,0],
    [0,1,1,0,1,0,1,0,0,0,0,0,0,0,1,0,1,0,1,1,0],
    [0,1,0,0,1,0,1,1,1,1,0,1,1,1,1,0,1,0,0,1,0],
    [0,1,1,1,1,1,1,1,1,1,3,1,1,1,1,1,1,1,1,1,0]
  ];

  // Ghost definitions — Blinky starts outside the house at the exit tile
  var GHOST_DEFS = [
    { name: "blinky", color: "#ff0000", startRow: 6,  startCol: 10, scatterRow: 0,  scatterCol: 20, houseWait: 0   },
    { name: "pinky",  color: "#ffb8ff", startRow: 10, startCol: 9,  scatterRow: 0,  scatterCol: 0,  houseWait: 60  },
    { name: "inky",   color: "#00ffff", startRow: 10, startCol: 10, scatterRow: 20, scatterCol: 20, houseWait: 120 },
    { name: "clyde",  color: "#ffb852", startRow: 10, startCol: 11, scatterRow: 20, scatterCol: 0,  houseWait: 180 }
  ];

  var PACMAN_START_ROW = 20;
  var PACMAN_START_COL = 10;
  // Where exiting ghosts appear in the main maze (just above the door)
  var GHOST_EXIT_ROW = 6;
  var GHOST_EXIT_COL = 10;
  // Eaten-ghost home target inside the house
  var GHOST_HOME_ROW = 10;
  var GHOST_HOME_COL = 10;

  var DIR_VECTORS = {
    up:    { dr: -1, dc: 0 },
    down:  { dr:  1, dc: 0 },
    left:  { dr:  0, dc: -1 },
    right: { dr:  0, dc: 1 }
  };
  var OPPOSITES = { up: "down", down: "up", left: "right", right: "left" };
  var DIR_ORDER = ["up", "left", "down", "right"];

  // ── DOM ────────────────────────────────────────────────────────────────────
  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var livesEl = document.getElementById("lives");
  var levelEl = document.getElementById("level");
  var restartBtn = document.getElementById("restart");

  // ── State ──────────────────────────────────────────────────────────────────
  var state;
  var autoStep = true;
  var renderTick = 0;
  var lastTimestamp = 0;

  // ── Tile helpers ───────────────────────────────────────────────────────────
  function tileCenter(row, col) {
    return {
      x: MAZE_X + col * TILE + TILE / 2,
      y: MAZE_Y + row * TILE + TILE / 2
    };
  }

  function tileAt(maze, row, col) {
    if (row < 0 || row >= ROWS) return 0;
    col = ((col % COLS) + COLS) % COLS;
    return maze[row][col];
  }

  function isWall(maze, row, col) {
    return tileAt(maze, row, col) === 0;
  }

  function isDoor(maze, row, col) {
    return tileAt(maze, row, col) === 4;
  }

  function isInGhostHouse(row, col) {
    return row >= GH_MIN_ROW && row <= GH_MAX_ROW &&
           col >= GH_MIN_COL && col <= GH_MAX_COL;
  }

  // Pac-Man is blocked by walls, doors, and the ghost-house interior
  function isBlockedForPacman(maze, row, col) {
    return isWall(maze, row, col) || isDoor(maze, row, col) || isInGhostHouse(row, col);
  }

  // ── Maze / item init ───────────────────────────────────────────────────────
  function makeMaze() {
    return MAZE_TEMPLATE.map(function (row) { return row.slice(); });
  }

  function buildItems(maze, type) {
    var list = [];
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (maze[r][c] === type) {
          var pos = tileCenter(r, c);
          list.push({ row: r, col: c, x: pos.x, y: pos.y, eaten: false });
        }
      }
    }
    return list;
  }

  function countFood(maze) {
    var n = 0;
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (maze[r][c] === 1 || maze[r][c] === 2) n++;
      }
    }
    return n;
  }

  // ── Entity factories ───────────────────────────────────────────────────────
  function makePacman() {
    var pos = tileCenter(PACMAN_START_ROW, PACMAN_START_COL);
    return {
      x: pos.x,
      y: pos.y,
      tileRow: PACMAN_START_ROW,
      tileCol: PACMAN_START_COL,
      targetRow: PACMAN_START_ROW,
      targetCol: PACMAN_START_COL,
      direction: "left",
      nextDirection: "left",
      moveProgress: 0
    };
  }

  function makeGhost(def) {
    var pos = tileCenter(def.startRow, def.startCol);
    var mode = def.houseWait === 0 ? "scatter" : "house";
    return {
      name: def.name,
      color: def.color,
      x: pos.x,
      y: pos.y,
      tileRow: def.startRow,
      tileCol: def.startCol,
      targetRow: def.startRow,
      targetCol: def.startCol,
      direction: "left",
      mode: mode,
      frightened: false,
      houseTimer: def.houseWait,
      scatterRow: def.scatterRow,
      scatterCol: def.scatterCol,
      moveProgress: 0
    };
  }

  // ── Restart ────────────────────────────────────────────────────────────────
  function restart() {
    renderTick = 0;
    var maze = makeMaze();
    state = {
      maze: maze,
      pacman: makePacman(),
      ghosts: GHOST_DEFS.map(makeGhost),
      pellets: buildItems(maze, 1),
      powerPellets: buildItems(maze, 2),
      score: 0,
      lives: 3,
      level: 1,
      status: "playing",
      frightenedTimer: 0,
      ghostCombo: 0,
      globalMode: "scatter",
      modePhase: 0,
      modeTimer: 0,
      pelletsRemaining: countFood(maze),
      deathTimer: 0
    };
    updateHud();
    draw();
  }

  // ── Step ───────────────────────────────────────────────────────────────────
  function step(dt) {
    if (state.status === "gameOver") return;
    renderTick++;

    if (state.status === "dying") {
      state.deathTimer--;
      if (state.deathTimer <= 0) respawn();
      return;
    }

    if (state.status === "levelComplete") {
      state.deathTimer--;
      if (state.deathTimer <= 0) advanceLevel();
      return;
    }

    tickGlobalMode();

    if (state.frightenedTimer > 0) {
      state.frightenedTimer--;
      if (state.frightenedTimer === 0) {
        state.ghostCombo = 0;
        unFrighten();
      }
    }

    movePacman(dt);
    for (var i = 0; i < state.ghosts.length; i++) {
      moveGhost(state.ghosts[i], dt);
    }

    eatPellets();
    checkGhostCollisions();

    if (state.pelletsRemaining <= 0 && state.status === "playing") {
      state.status = "levelComplete";
      state.deathTimer = LEVEL_COMPLETE_FRAMES;
    }
  }

  // ── Global ghost mode ──────────────────────────────────────────────────────
  var MODE_SCHEDULE = [
    { mode: "scatter", duration: SCATTER_FRAMES },
    { mode: "chase",   duration: CHASE_FRAMES   },
    { mode: "scatter", duration: SCATTER_FRAMES },
    { mode: "chase",   duration: 0              }
  ];

  function tickGlobalMode() {
    var phase = MODE_SCHEDULE[Math.min(state.modePhase, MODE_SCHEDULE.length - 1)];
    if (phase.duration === 0) return;
    state.modeTimer++;
    if (state.modeTimer >= phase.duration) {
      state.modeTimer = 0;
      state.modePhase++;
      var next = MODE_SCHEDULE[Math.min(state.modePhase, MODE_SCHEDULE.length - 1)];
      state.globalMode = next.mode;
      for (var i = 0; i < state.ghosts.length; i++) {
        var g = state.ghosts[i];
        if (g.mode === "scatter" || g.mode === "chase") {
          g.mode = state.globalMode;
          g.direction = OPPOSITES[g.direction] || g.direction;
        }
      }
    }
  }

  // ── Pac-Man movement ───────────────────────────────────────────────────────
  function movePacman(dt) {
    var pm = state.pacman;
    var speed = PACMAN_SPEED * (1 + (state.level - 1) * 0.04);
    pm.moveProgress += speed * dt;

    while (pm.moveProgress >= 1.0) {
      pm.moveProgress -= 1.0;
      pm.tileRow = pm.targetRow;
      pm.tileCol = ((pm.targetCol % COLS) + COLS) % COLS;

      // Try buffered direction first
      var nr = pm.tileRow + DIR_VECTORS[pm.nextDirection].dr;
      var nc = pm.tileCol + DIR_VECTORS[pm.nextDirection].dc;
      if (!isBlockedForPacman(state.maze, nr, nc)) {
        pm.direction = pm.nextDirection;
      }

      // Move in chosen direction if open
      nr = pm.tileRow + DIR_VECTORS[pm.direction].dr;
      nc = pm.tileCol + DIR_VECTORS[pm.direction].dc;
      if (!isBlockedForPacman(state.maze, nr, nc)) {
        pm.targetRow = nr;
        pm.targetCol = nc;
      } else {
        pm.targetRow = pm.tileRow;
        pm.targetCol = pm.tileCol;
        pm.moveProgress = 0;
      }
    }

    var fromX = MAZE_X + pm.tileCol * TILE + TILE / 2;
    var fromY = MAZE_Y + pm.tileRow * TILE + TILE / 2;
    var wrappedTargetCol = ((pm.targetCol % COLS) + COLS) % COLS;
    var toX = MAZE_X + wrappedTargetCol * TILE + TILE / 2;
    var toY = MAZE_Y + pm.targetRow * TILE + TILE / 2;

    if (Math.abs(wrappedTargetCol - pm.tileCol) > 1) {
      pm.x = toX;
      pm.y = toY;
    } else {
      pm.x = fromX + (toX - fromX) * pm.moveProgress;
      pm.y = fromY + (toY - fromY) * pm.moveProgress;
    }
  }

  // ── Ghost movement ─────────────────────────────────────────────────────────
  function moveGhost(ghost, dt) {
    if (ghost.mode === "house") {
      ghost.houseTimer--;
      if (ghost.houseTimer <= 0) {
        // Teleport to exit tile in the main maze (above the ghost-house door)
        ghost.tileRow = GHOST_EXIT_ROW;
        ghost.tileCol = GHOST_EXIT_COL;
        ghost.targetRow = GHOST_EXIT_ROW;
        ghost.targetCol = GHOST_EXIT_COL;
        var pos = tileCenter(GHOST_EXIT_ROW, GHOST_EXIT_COL);
        ghost.x = pos.x;
        ghost.y = pos.y;
        ghost.moveProgress = 0;
        ghost.direction = "left";
        ghost.mode = state.globalMode;
      }
      return;
    }

    var speed;
    if (ghost.mode === "eaten") speed = GHOST_SPEED_EATEN;
    else if (ghost.frightened) speed = GHOST_SPEED_FRIGHTENED;
    else speed = GHOST_SPEED_NORMAL * (1 + (state.level - 1) * 0.03);

    ghost.moveProgress += speed * dt;

    while (ghost.moveProgress >= 1.0) {
      ghost.moveProgress -= 1.0;
      ghost.tileRow = ghost.targetRow;
      ghost.tileCol = ((ghost.targetCol % COLS) + COLS) % COLS;

      if (ghost.mode === "eaten" &&
          ghost.tileRow === GHOST_HOME_ROW &&
          ghost.tileCol === GHOST_HOME_COL) {
        ghost.mode = state.globalMode;
        ghost.frightened = false;
      }

      ghost.direction = pickGhostDir(ghost);
      ghost.targetRow = ghost.tileRow + DIR_VECTORS[ghost.direction].dr;
      ghost.targetCol = ghost.tileCol + DIR_VECTORS[ghost.direction].dc;
    }

    var wrappedTargetCol = ((ghost.targetCol % COLS) + COLS) % COLS;
    var fromX = MAZE_X + ghost.tileCol * TILE + TILE / 2;
    var fromY = MAZE_Y + ghost.tileRow * TILE + TILE / 2;
    var toX = MAZE_X + wrappedTargetCol * TILE + TILE / 2;
    var toY = MAZE_Y + ghost.targetRow * TILE + TILE / 2;

    if (Math.abs(wrappedTargetCol - ghost.tileCol) > 1) {
      ghost.x = toX;
      ghost.y = toY;
    } else {
      ghost.x = fromX + (toX - fromX) * ghost.moveProgress;
      ghost.y = fromY + (toY - fromY) * ghost.moveProgress;
    }
  }

  function pickGhostDir(ghost) {
    var targetRow, targetCol;
    var pm = state.pacman;
    var isEaten = ghost.mode === "eaten";

    if (isEaten) {
      targetRow = GHOST_HOME_ROW;
      targetCol = GHOST_HOME_COL;
    } else if (ghost.frightened) {
      var valid = [];
      for (var i = 0; i < DIR_ORDER.length; i++) {
        var d = DIR_ORDER[i];
        if (d === OPPOSITES[ghost.direction]) continue;
        var nr = ghost.tileRow + DIR_VECTORS[d].dr;
        var nc = ghost.tileCol + DIR_VECTORS[d].dc;
        var t = tileAt(state.maze, nr, nc);
        if (t === 0 || t === 4) continue;
        if (isInGhostHouse(nr, nc)) continue;
        valid.push(d);
      }
      if (valid.length === 0) return OPPOSITES[ghost.direction] || "up";
      var idx = (ghost.tileRow * 100 + ghost.tileCol + renderTick) % valid.length;
      return valid[idx];
    } else if (ghost.mode === "scatter") {
      targetRow = ghost.scatterRow;
      targetCol = ghost.scatterCol;
    } else {
      if (ghost.name === "blinky") {
        targetRow = pm.tileRow;
        targetCol = pm.tileCol;
      } else if (ghost.name === "pinky") {
        targetRow = pm.tileRow + DIR_VECTORS[pm.direction].dr * 4;
        targetCol = pm.tileCol + DIR_VECTORS[pm.direction].dc * 4;
      } else if (ghost.name === "inky") {
        targetRow = pm.tileRow + DIR_VECTORS[pm.direction].dr * 2;
        targetCol = pm.tileCol + DIR_VECTORS[pm.direction].dc * 2;
      } else {
        var dRow = ghost.tileRow - pm.tileRow;
        var dCol = ghost.tileCol - pm.tileCol;
        if (dRow * dRow + dCol * dCol > 64) {
          targetRow = pm.tileRow;
          targetCol = pm.tileCol;
        } else {
          targetRow = ghost.scatterRow;
          targetCol = ghost.scatterCol;
        }
      }
    }

    var bestDir = OPPOSITES[ghost.direction] || "up";
    var bestDist = Infinity;
    for (var j = 0; j < DIR_ORDER.length; j++) {
      var dir = DIR_ORDER[j];
      if (dir === OPPOSITES[ghost.direction]) continue;
      var tr = ghost.tileRow + DIR_VECTORS[dir].dr;
      var tc = ghost.tileCol + DIR_VECTORS[dir].dc;
      var tile = tileAt(state.maze, tr, tc);
      if (tile === 0) continue;
      // Doors: only eaten ghosts may enter
      if (tile === 4 && !isEaten) continue;
      // Ghost house interior: only eaten ghosts may enter
      if (isInGhostHouse(tr, tc) && !isEaten) continue;
      var dist = (tr - targetRow) * (tr - targetRow) + (tc - targetCol) * (tc - targetCol);
      if (dist < bestDist) {
        bestDist = dist;
        bestDir = dir;
      }
    }
    return bestDir;
  }

  // ── Pellet eating ──────────────────────────────────────────────────────────
  function eatPellets() {
    var pm = state.pacman;
    var i;
    for (i = 0; i < state.pellets.length; i++) {
      var p = state.pellets[i];
      if (!p.eaten && p.row === pm.tileRow && p.col === pm.tileCol) {
        p.eaten = true;
        state.score += DOT_SCORE;
        state.pelletsRemaining--;
        state.maze[p.row][p.col] = 3;
      }
    }
    for (i = 0; i < state.powerPellets.length; i++) {
      var pp = state.powerPellets[i];
      if (!pp.eaten && pp.row === pm.tileRow && pp.col === pm.tileCol) {
        pp.eaten = true;
        state.score += PELLET_SCORE;
        state.pelletsRemaining--;
        state.maze[pp.row][pp.col] = 3;
        activateFrightened();
      }
    }
  }

  function activateFrightened() {
    state.frightenedTimer = FRIGHTENED_FRAMES;
    state.ghostCombo = 0;
    for (var i = 0; i < state.ghosts.length; i++) {
      var g = state.ghosts[i];
      if (g.mode !== "house" && g.mode !== "eaten") {
        g.frightened = true;
        g.mode = "frightened";
        g.direction = OPPOSITES[g.direction] || g.direction;
      }
    }
  }

  function unFrighten() {
    for (var i = 0; i < state.ghosts.length; i++) {
      var g = state.ghosts[i];
      if (g.frightened) {
        g.frightened = false;
        g.mode = state.globalMode;
      }
    }
  }

  // ── Ghost collision ────────────────────────────────────────────────────────
  function checkGhostCollisions() {
    var pm = state.pacman;
    for (var i = 0; i < state.ghosts.length; i++) {
      var g = state.ghosts[i];
      if (g.mode === "house" || g.mode === "eaten") continue;
      var dx = pm.x - g.x;
      var dy = pm.y - g.y;
      if (dx * dx + dy * dy < COLLISION_RADIUS * COLLISION_RADIUS) {
        if (g.frightened) {
          eatGhost(g);
        } else {
          killPacman();
          return;
        }
      }
    }
  }

  function eatGhost(ghost) {
    ghost.frightened = false;
    ghost.mode = "eaten";
    var pts = GHOST_SCORES[Math.min(state.ghostCombo, GHOST_SCORES.length - 1)];
    state.score += pts;
    state.ghostCombo++;
  }

  function killPacman() {
    state.lives--;
    state.status = "dying";
    state.deathTimer = DEATH_FRAMES;
  }

  function respawn() {
    if (state.lives <= 0) {
      state.status = "gameOver";
      return;
    }
    state.status = "playing";
    state.pacman = makePacman();
    state.ghosts = GHOST_DEFS.map(makeGhost);
    state.frightenedTimer = 0;
    state.ghostCombo = 0;
  }

  function advanceLevel() {
    state.level++;
    var maze = makeMaze();
    state.maze = maze;
    state.pellets = buildItems(maze, 1);
    state.powerPellets = buildItems(maze, 2);
    state.pelletsRemaining = countFood(maze);
    state.pacman = makePacman();
    state.ghosts = GHOST_DEFS.map(makeGhost);
    state.frightenedTimer = 0;
    state.ghostCombo = 0;
    state.globalMode = "scatter";
    state.modePhase = 0;
    state.modeTimer = 0;
    state.status = "playing";
  }

  // ── HUD ────────────────────────────────────────────────────────────────────
  function updateHud() {
    scoreEl.textContent = String(state.score);
    livesEl.textContent = String(state.lives);
    levelEl.textContent = String(state.level);
  }

  // ── Draw ───────────────────────────────────────────────────────────────────
  function draw() {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawMaze();
    drawPellets();
    drawPowerPellets();
    drawLivesBar();
    for (var i = 0; i < state.ghosts.length; i++) {
      drawGhost(state.ghosts[i]);
    }
    drawPacman();

    if (state.status === "gameOver") {
      drawOverlay("GAME OVER");
    } else if (state.status === "levelComplete") {
      drawOverlay("LEVEL COMPLETE!");
    }
  }

  function drawMaze() {
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var t = MAZE_TEMPLATE[r][c];
        var x = MAZE_X + c * TILE;
        var y = MAZE_Y + r * TILE;
        if (t === 0) {
          ctx.fillStyle = "#1a1aff";
          ctx.fillRect(x, y, TILE, TILE);
          ctx.fillStyle = "#2222cc";
          ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
        } else if (t === 4) {
          ctx.fillStyle = "#ffb8de";
          ctx.fillRect(x, y + Math.floor(TILE * 0.4), TILE, Math.ceil(TILE * 0.2));
        }
      }
    }
  }

  function drawPellets() {
    ctx.fillStyle = "#ffb8ae";
    for (var i = 0; i < state.pellets.length; i++) {
      var p = state.pellets[i];
      if (p.eaten) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPowerPellets() {
    if (Math.floor(renderTick / 15) % 2 === 0) {
      ctx.fillStyle = "#ffcc00";
      for (var i = 0; i < state.powerPellets.length; i++) {
        var pp = state.powerPellets[i];
        if (pp.eaten) continue;
        ctx.beginPath();
        ctx.arc(pp.x, pp.y, 5.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawLivesBar() {
    var iconY = MAZE_Y + ROWS * TILE + 12;
    var startX = MAZE_X + 10;
    ctx.fillStyle = "#ffff00";
    for (var i = 0; i < state.lives; i++) {
      var cx = startX + i * 22;
      ctx.beginPath();
      ctx.moveTo(cx, iconY);
      ctx.arc(cx, iconY, 8, 0.25, Math.PI * 2 - 0.25);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawPacman() {
    var pm = state.pacman;
    var mouthAngle = Math.abs(Math.sin(renderTick * 0.18)) * 0.35;
    if (state.status === "dying") {
      mouthAngle = (1 - state.deathTimer / DEATH_FRAMES) * Math.PI;
    }
    var rotOffset = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
    var rot = rotOffset[pm.direction] || 0;
    ctx.fillStyle = "#ffff00";
    ctx.beginPath();
    ctx.moveTo(pm.x, pm.y);
    ctx.arc(pm.x, pm.y, TILE * 0.45, rot + mouthAngle, rot + Math.PI * 2 - mouthAngle);
    ctx.closePath();
    ctx.fill();
  }

  function drawGhost(ghost) {
    if (ghost.mode === "house") return;

    var gx = ghost.x;
    var gy = ghost.y;
    var r = TILE * 0.44;

    if (ghost.mode === "eaten") {
      drawGhostEyes(gx, gy);
      return;
    }

    var bodyColor;
    if (ghost.frightened) {
      var flashing = state.frightenedTimer < 120 && Math.floor(renderTick / 10) % 2 === 1;
      bodyColor = flashing ? "#ffffff" : "#0000dd";
    } else {
      bodyColor = ghost.color;
    }

    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.arc(gx, gy - r * 0.1, r, Math.PI, 0, false);
    var bY = gy + r * 0.85;
    var bumpW = r * 2 / 3;
    ctx.lineTo(gx + r, bY);
    ctx.quadraticCurveTo(gx + r - bumpW * 0.4, bY - r * 0.28, gx + r - bumpW, bY);
    ctx.quadraticCurveTo(gx + r - bumpW * 1.4, bY - r * 0.28, gx, bY);
    ctx.quadraticCurveTo(gx - bumpW * 0.4, bY - r * 0.28, gx - bumpW, bY);
    ctx.quadraticCurveTo(gx - bumpW * 1.4, bY - r * 0.28, gx - r, bY);
    ctx.lineTo(gx - r, gy - r * 0.1);
    ctx.closePath();
    ctx.fill();

    if (!ghost.frightened) {
      drawGhostEyes(gx, gy);
    } else {
      ctx.fillStyle = bodyColor === "#ffffff" ? "#0000dd" : "#ffffff";
      ctx.beginPath();
      ctx.arc(gx - 3, gy - 1, 2, 0, Math.PI * 2);
      ctx.arc(gx + 3, gy - 1, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawGhostEyes(gx, gy) {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(gx - 3, gy - 2, 3, 0, Math.PI * 2);
    ctx.arc(gx + 3, gy - 2, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#00008b";
    ctx.beginPath();
    ctx.arc(gx - 2.5, gy - 1.5, 1.5, 0, Math.PI * 2);
    ctx.arc(gx + 3.5, gy - 1.5, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawOverlay(message) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffff00";
    ctx.font = "bold 36px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(message, canvas.width / 2, canvas.height / 2 - 10);
    ctx.font = "18px Arial, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText("Press Restart to play again", canvas.width / 2, canvas.height / 2 + 30);
    ctx.textAlign = "left";
  }

  // ── Input ──────────────────────────────────────────────────────────────────
  var KEY_DIR = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    w: "up", s: "down", a: "left", d: "right",
    W: "up", S: "down", A: "left", D: "right"
  };

  window.addEventListener("keydown", function (e) {
    var dir = KEY_DIR[e.key];
    if (dir) {
      state.pacman.nextDirection = dir;
      e.preventDefault();
    }
  });

  document.querySelectorAll(".dpad-btn[data-action]").forEach(function (btn) {
    btn.addEventListener("pointerdown", function (e) {
      var dir = btn.dataset.action;
      if (dir === "up" || dir === "down" || dir === "left" || dir === "right") {
        state.pacman.nextDirection = dir;
      }
      e.preventDefault();
    }, { passive: false });
  });

  restartBtn.addEventListener("click", restart);

  // ── Game loop ──────────────────────────────────────────────────────────────
  function frame(ts) {
    if (!lastTimestamp) lastTimestamp = ts;
    var elapsed = Math.min((ts - lastTimestamp) / 1000, 0.1);
    lastTimestamp = ts;

    if (autoStep) {
      while (elapsed > 0) {
        var dt = Math.min(FIXED_DT, elapsed);
        step(dt);
        elapsed -= dt;
      }
    }

    updateHud();
    draw();
    window.requestAnimationFrame(frame);
  }

  // ── Test API ───────────────────────────────────────────────────────────────
  window.__pacmanTest = {
    isReady: false,

    getState: function () {
      return {
        pacman: {
          x: state.pacman.x,
          y: state.pacman.y,
          tileRow: state.pacman.tileRow,
          tileCol: state.pacman.tileCol,
          direction: state.pacman.direction,
          nextDirection: state.pacman.nextDirection
        },
        ghosts: state.ghosts.map(function (g) {
          return {
            name: g.name,
            x: g.x,
            y: g.y,
            tileRow: g.tileRow,
            tileCol: g.tileCol,
            direction: g.direction,
            mode: g.mode,
            frightened: g.frightened
          };
        }),
        pellets: state.pellets.map(function (p) {
          return { row: p.row, col: p.col, eaten: p.eaten };
        }),
        powerPellets: state.powerPellets.map(function (pp) {
          return { row: pp.row, col: pp.col, eaten: pp.eaten };
        }),
        score: state.score,
        lives: state.lives,
        level: state.level,
        status: state.status,
        frightenedTimer: state.frightenedTimer,
        pelletsRemaining: state.pelletsRemaining
      };
    },

    setState: function (partial) {
      renderTick = 0;
      if (typeof partial.score === "number") state.score = partial.score;
      if (typeof partial.lives === "number") state.lives = partial.lives;
      if (typeof partial.level === "number") state.level = partial.level;
      if (typeof partial.status === "string") state.status = partial.status;
      if (typeof partial.frightenedTimer === "number") {
        state.frightenedTimer = partial.frightenedTimer;
        if (partial.frightenedTimer > 0) {
          for (var i = 0; i < state.ghosts.length; i++) {
            var g = state.ghosts[i];
            if (g.mode !== "house" && g.mode !== "eaten") {
              g.frightened = true;
              g.mode = "frightened";
            }
          }
        }
      }
      if (typeof partial.pelletsRemaining === "number") {
        state.pelletsRemaining = partial.pelletsRemaining;
      }
      if (partial.pacman) {
        Object.assign(state.pacman, partial.pacman);
        if (typeof partial.pacman.tileRow === "number" && typeof partial.pacman.tileCol === "number") {
          var pos = tileCenter(partial.pacman.tileRow, partial.pacman.tileCol);
          state.pacman.x = pos.x;
          state.pacman.y = pos.y;
          state.pacman.targetRow = partial.pacman.tileRow;
          state.pacman.targetCol = partial.pacman.tileCol;
          state.pacman.moveProgress = 0;
        }
      }
      if (Array.isArray(partial.ghosts)) {
        for (var j = 0; j < partial.ghosts.length && j < state.ghosts.length; j++) {
          Object.assign(state.ghosts[j], partial.ghosts[j]);
          if (typeof partial.ghosts[j].tileRow === "number" && typeof partial.ghosts[j].tileCol === "number") {
            var gPos = tileCenter(partial.ghosts[j].tileRow, partial.ghosts[j].tileCol);
            state.ghosts[j].x = gPos.x;
            state.ghosts[j].y = gPos.y;
            state.ghosts[j].targetRow = partial.ghosts[j].tileRow;
            state.ghosts[j].targetCol = partial.ghosts[j].tileCol;
            state.ghosts[j].moveProgress = 0;
          }
        }
      }
      updateHud();
      draw();
    },

    advanceFrames: function (n) {
      var total = Math.max(0, Math.floor(n));
      for (var i = 0; i < total; i++) {
        step(FIXED_DT);
      }
      updateHud();
      draw();
    },

    restart: function () {
      restart();
    },

    setAutoStep: function (enabled) {
      autoStep = Boolean(enabled);
      updateHud();
      draw();
      return autoStep;
    }
  };

  restart();
  window.__pacmanTest.isReady = true;
  window.requestAnimationFrame(frame);
}());
