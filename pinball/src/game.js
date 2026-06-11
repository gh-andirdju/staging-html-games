(function () {
  "use strict";

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var ballsEl = document.getElementById("balls");
  var levelEl = document.getElementById("level");
  var statusEl = document.getElementById("status");
  var restartButton = document.getElementById("restart");
  var pauseButton = document.getElementById("pause");
  var btnLeft = document.getElementById("btn-left");
  var btnRight = document.getElementById("btn-right");
  var btnLaunch = document.getElementById("btn-launch");

  var WIDTH = canvas.width;
  var HEIGHT = canvas.height;
  var FIXED_DT = 1 / 60;
  var GRAVITY = 500;
  var BALL_RADIUS = 10;
  var BALL_LAUNCH_SPEED = 1080;
  var FLIPPER_LENGTH = 88;
  var FLIPPER_THICKNESS = 9;
  var FLIPPER_REST_ANGLE_L = 0.62;
  var FLIPPER_ACTIVE_ANGLE_L = -0.42;
  var FLIPPER_REST_ANGLE_R = Math.PI - 0.62;
  var FLIPPER_ACTIVE_ANGLE_R = Math.PI + 0.42;
  var FLIPPER_SPEED = Math.PI * 8;
  var FLIPPER_BOOST_MAX_SPEED = 1080;
  var FLIPPER_PIVOT_Y = HEIGHT - 160;
  var FLIPPER_PIVOT_LX = 110;
  var FLIPPER_PIVOT_RX = 290;
  var FUNNEL_TOP_Y = 490;
  var LANE_X = 332;
  var LANE_TOP_Y = 255;
  var DEFLECTOR_X = 290;
  var DEFLECTOR_Y = 160;
  var DEFLECTOR_END_Y = 216;
  var BUMPER_RADIUS = 22;
  var BUMPER_REPEL_SPEED = 210;
  var BUMPER_VEL_RETAIN = 0.8;
  var BUMPER_MAX_SPEED = 720;
  var WALL_RESTITUTION = 0.9;
  var WALL_FRICTION = 0.97;
  var ARC_RESTITUTION = 0.86;
  var FUNNEL_RESTITUTION = 0.45;
  var DIVIDER_RESTITUTION = 0.6;
  var DEFLECTOR_RESTITUTION = 0.85;
  var DRAG = 0.99;
  var LAUNCH_MIN_POWER = 0.93;
  var BUMPER_SCORE = 50;
  var LANE_SCORE = 150;
  var SLING_KICK_SPEED = 360;
  var SLING_THICKNESS = 9;
  var SLING_RESTITUTION = 0.5;
  var SLING_SCORE = 30;
  var SLING_FLASH_FRAMES = 12;
  var PEG_RADIUS = 8;
  var PEG_REPEL_SPEED = 90;
  var PEG_RESTITUTION = 0.92;
  var PEG_SCORE = 10;
  var PEG_FLASH_FRAMES = 8;
  var ROLLOVER_RADIUS = 11;
  var ROLLOVER_SCORE = 120;
  var ROLLOVER_FLASH_FRAMES = 30;
  var WALL_LEFT = 30;
  var WALL_RIGHT = WIDTH - 30;
  var LAUNCH_X = WALL_RIGHT - BALL_RADIUS;
  var BALL_LAUNCH_Y = HEIGHT - 100;
  var DRAIN_Y = HEIGHT + BALL_RADIUS + 4;

  var keys = { left: false, right: false, launch: false };
  var state;
  var lastTime = 0;
  var autoStep = true;

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function makeInitialState() {
    return {
      ball: {
        x: LAUNCH_X,
        y: BALL_LAUNCH_Y,
        vx: 0,
        vy: 0,
        radius: BALL_RADIUS,
        launched: false
      },
      leftFlipper: {
        angle: FLIPPER_REST_ANGLE_L,
        prevAngle: FLIPPER_REST_ANGLE_L,
        pivotX: FLIPPER_PIVOT_LX,
        pivotY: FLIPPER_PIVOT_Y
      },
      rightFlipper: {
        angle: FLIPPER_REST_ANGLE_R,
        prevAngle: FLIPPER_REST_ANGLE_R,
        pivotX: FLIPPER_PIVOT_RX,
        pivotY: FLIPPER_PIVOT_Y
      },
      bumpers: [
        { x: 200, y: 248, radius: BUMPER_RADIUS, hitTimer: 0 },
        { x: 132, y: 318, radius: BUMPER_RADIUS, hitTimer: 0 },
        { x: 268, y: 318, radius: BUMPER_RADIUS, hitTimer: 0 },
        { x: 200, y: 318, radius: BUMPER_RADIUS, hitTimer: 0 },
        { x: 200, y: 388, radius: BUMPER_RADIUS, hitTimer: 0 }
      ],
      targets: [
        { x: 48, y: 436, w: 56, h: 12, hit: false },
        { x: 166, y: 436, w: 56, h: 12, hit: false },
        { x: 268, y: 436, w: 56, h: 12, hit: false }
      ],
      slingshots: [
        { ax: 70, ay: 472, bx: 96, by: 516, nx: 0.86, ny: -0.51, hitTimer: 0 },
        { ax: 330, ay: 472, bx: 304, by: 516, nx: -0.86, ny: -0.51, hitTimer: 0 }
      ],
      pegs: [
        { x: 96, y: 250, radius: PEG_RADIUS, hitTimer: 0 },
        { x: 304, y: 250, radius: PEG_RADIUS, hitTimer: 0 },
        { x: 200, y: 150, radius: PEG_RADIUS, hitTimer: 0 },
        { x: 110, y: 410, radius: PEG_RADIUS, hitTimer: 0 },
        { x: 290, y: 410, radius: PEG_RADIUS, hitTimer: 0 },
        { x: 200, y: 470, radius: PEG_RADIUS, hitTimer: 0 }
      ],
      rollovers: [
        { x: 150, y: 96, radius: ROLLOVER_RADIUS, lit: false, hitTimer: 0 },
        { x: 200, y: 84, radius: ROLLOVER_RADIUS, lit: false, hitTimer: 0 },
        { x: 250, y: 96, radius: ROLLOVER_RADIUS, lit: false, hitTimer: 0 }
      ],
      score: 0,
      balls: 3,
      level: 1,
      status: "ready",
      paused: false,
      frame: 0,
      plunger: { compressed: 0 }
    };
  }

  function restart() {
    state = makeInitialState();
    updateHud();
    draw();
  }

  function resetBallToLauncher() {
    state.ball.x = LAUNCH_X;
    state.ball.y = BALL_LAUNCH_Y;
    state.ball.vx = 0;
    state.ball.vy = 0;
    state.ball.launched = false;
    state.plunger.compressed = 0;
    if (state.rollovers) {
      for (var i = 0; i < state.rollovers.length; i += 1) {
        state.rollovers[i].lit = false;
      }
    }
  }

  function statusText() {
    if (state.paused && state.status !== "game_over") {
      return "Paused";
    }
    switch (state.status) {
      case "ready": return "Ready";
      case "playing": return "Playing";
      case "game_over": return "Game Over";
      default: return state.status;
    }
  }

  function updateHud() {
    scoreEl.textContent = String(state.score);
    ballsEl.textContent = String(state.balls);
    levelEl.textContent = String(state.level);
    statusEl.textContent = statusText();
    pauseButton.textContent = state.paused ? "Resume" : "Pause";
    pauseButton.setAttribute("aria-pressed", state.paused ? "true" : "false");
  }

  function togglePause() {
    if (state.status === "game_over") {
      return;
    }
    state.paused = !state.paused;
    updateHud();
    draw();
  }

  function closestPointOnSegment(ax, ay, bx, by, px, py) {
    var dx = bx - ax;
    var dy = by - ay;
    var lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
      return { x: ax, y: ay, t: 0 };
    }
    var t = clamp(((px - ax) * dx + (py - ay) * dy) / lenSq, 0, 1);
    return { x: ax + t * dx, y: ay + t * dy, t: t };
  }

  function flipperTip(flipper) {
    return {
      x: flipper.pivotX + Math.cos(flipper.angle) * FLIPPER_LENGTH,
      y: flipper.pivotY + Math.sin(flipper.angle) * FLIPPER_LENGTH
    };
  }

  function resolveFlipperCollision(ball, flipper, dt) {
    var tip = flipperTip(flipper);
    var cp = closestPointOnSegment(
      flipper.pivotX, flipper.pivotY,
      tip.x, tip.y,
      ball.x, ball.y
    );
    var dx = ball.x - cp.x;
    var dy = ball.y - cp.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var minDist = ball.radius + FLIPPER_THICKNESS / 2;

    if (dist >= minDist || dist < 0.001) {
      return;
    }

    var nx = dx / dist;
    var ny = dy / dist;

    ball.x = cp.x + nx * (minDist + 0.5);
    ball.y = cp.y + ny * (minDist + 0.5);

    var dot = ball.vx * nx + ball.vy * ny;
    ball.vx -= 2 * dot * nx;
    ball.vy -= 2 * dot * ny;

    var angularVel = (flipper.angle - flipper.prevAngle) / dt;
    if (Math.abs(angularVel) > 0.5) {
      var tipVx = -Math.sin(flipper.angle) * angularVel * FLIPPER_LENGTH * cp.t * 0.55;
      var tipVy =  Math.cos(flipper.angle) * angularVel * FLIPPER_LENGTH * cp.t * 0.55;
      ball.vx += tipVx;
      ball.vy += tipVy;
      var speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
      if (speed > FLIPPER_BOOST_MAX_SPEED) {
        var s = FLIPPER_BOOST_MAX_SPEED / speed;
        ball.vx *= s;
        ball.vy *= s;
      }
    }
  }

  function resolveWallSegment(ball, ax, ay, bx, by, restitution) {
    var cp = closestPointOnSegment(ax, ay, bx, by, ball.x, ball.y);
    var dx = ball.x - cp.x;
    var dy = ball.y - cp.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist >= ball.radius || dist < 0.001) {
      return;
    }
    var nx = dx / dist;
    var ny = dy / dist;
    ball.x = cp.x + nx * (ball.radius + 0.5);
    ball.y = cp.y + ny * (ball.radius + 0.5);
    var vn = ball.vx * nx + ball.vy * ny;
    if (vn < 0) {
      var tx = -ny;
      var ty = nx;
      var vt = ball.vx * tx + ball.vy * ty;
      vn = -vn * restitution;
      ball.vx = nx * vn + tx * vt;
      ball.vy = ny * vn + ty * vt;
    }
  }

  function resolvePegCollision(ball, peg) {
    if (peg.hitTimer > 0) {
      peg.hitTimer -= 1;
    }
    var dx = ball.x - peg.x;
    var dy = ball.y - peg.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var minD = ball.radius + peg.radius;
    if (dist >= minD) {
      return false;
    }
    var nx, ny;
    if (dist < 0.001) {
      nx = 0; ny = -1;
    } else {
      nx = dx / dist; ny = dy / dist;
    }
    ball.x = peg.x + nx * (minD + 0.5);
    ball.y = peg.y + ny * (minD + 0.5);
    var vn = ball.vx * nx + ball.vy * ny;
    if (vn < 0) {
      ball.vx -= (1 + PEG_RESTITUTION) * vn * nx;
      ball.vy -= (1 + PEG_RESTITUTION) * vn * ny;
      ball.vx += nx * PEG_REPEL_SPEED;
      ball.vy += ny * PEG_REPEL_SPEED;
      peg.hitTimer = PEG_FLASH_FRAMES;
      return true;
    }
    return false;
  }

  function resolveSlingshot(ball, sling) {
    if (sling.hitTimer > 0) {
      sling.hitTimer -= 1;
    }
    var cp = closestPointOnSegment(sling.ax, sling.ay, sling.bx, sling.by, ball.x, ball.y);
    var dx = ball.x - cp.x;
    var dy = ball.y - cp.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var minD = ball.radius + SLING_THICKNESS / 2;
    if (dist >= minD) {
      return false;
    }
    var nx, ny;
    if (dist < 0.001) {
      nx = 0; ny = -1;
    } else {
      nx = dx / dist; ny = dy / dist;
    }
    ball.x = cp.x + nx * (minD + 0.5);
    ball.y = cp.y + ny * (minD + 0.5);
    var vn = ball.vx * nx + ball.vy * ny;
    if (vn < 0) {
      ball.vx -= (1 + SLING_RESTITUTION) * vn * nx;
      ball.vy -= (1 + SLING_RESTITUTION) * vn * ny;
      ball.vx += nx * SLING_KICK_SPEED;
      ball.vy += ny * SLING_KICK_SPEED;
      sling.hitTimer = SLING_FLASH_FRAMES;
      return true;
    }
    return false;
  }

  function resolveRollover(ball, ro) {
    if (ro.hitTimer > 0) {
      ro.hitTimer -= 1;
    }
    if (ro.lit) {
      return false;
    }
    var dx = ball.x - ro.x;
    var dy = ball.y - ro.y;
    if (dx * dx + dy * dy <= (ball.radius + ro.radius) * (ball.radius + ro.radius)) {
      ro.lit = true;
      ro.hitTimer = ROLLOVER_FLASH_FRAMES;
      return true;
    }
    return false;
  }

  function circleHitsRect(bx, by, br, rx, ry, rw, rh) {
    var cx = clamp(bx, rx, rx + rw);
    var cy = clamp(by, ry, ry + rh);
    var dx = bx - cx;
    var dy = by - cy;
    return dx * dx + dy * dy <= br * br;
  }

  function step(dt) {
    if (state.paused) {
      return;
    }
    if (state.status !== "playing" && state.status !== "ready") {
      return;
    }

    var lf = state.leftFlipper;
    var rf = state.rightFlipper;

    lf.prevAngle = lf.angle;
    rf.prevAngle = rf.angle;

    var pressLeft = keys.left;
    var pressRight = keys.right;

    var targetL = pressLeft ? FLIPPER_ACTIVE_ANGLE_L : FLIPPER_REST_ANGLE_L;
    var targetR = pressRight ? FLIPPER_ACTIVE_ANGLE_R : FLIPPER_REST_ANGLE_R;

    var maxDelta = FLIPPER_SPEED * dt;
    var diffL = targetL - lf.angle;
    lf.angle += clamp(diffL, -maxDelta, maxDelta);
    var diffR = targetR - rf.angle;
    rf.angle += clamp(diffR, -maxDelta, maxDelta);

    var ball = state.ball;

    if (state.status === "ready") {
      if (keys.launch) {
        state.plunger.compressed = Math.min(1, state.plunger.compressed + 0.03);
      } else if (state.plunger.compressed > 0) {
        ball.vy = -BALL_LAUNCH_SPEED *
          (LAUNCH_MIN_POWER + (1 - LAUNCH_MIN_POWER) * state.plunger.compressed);
        ball.vx = 0;
        ball.launched = true;
        state.plunger.compressed = 0;
        state.status = "playing";
        state.frame += 1;
        return;
      }
      ball.x = LAUNCH_X;
      ball.y = BALL_LAUNCH_Y;
      ball.vx = 0;
      ball.vy = 0;
      return;
    }

    state.frame += 1;
    ball.vy += GRAVITY * dt;
    ball.vx *= DRAG;
    ball.vy *= DRAG;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    var wallHit = false;
    if (ball.x - ball.radius < WALL_LEFT) {
      ball.x = WALL_LEFT + ball.radius;
      ball.vx = Math.abs(ball.vx) * WALL_RESTITUTION;
      ball.vy *= WALL_FRICTION;
      wallHit = true;
    } else if (ball.x + ball.radius > WALL_RIGHT) {
      ball.x = WALL_RIGHT - ball.radius;
      ball.vx = -Math.abs(ball.vx) * WALL_RESTITUTION;
      ball.vy *= WALL_FRICTION;
      wallHit = true;
    }
    if (ball.y - ball.radius < 10) {
      ball.y = ball.radius + 10;
      ball.vy = Math.abs(ball.vy) * WALL_RESTITUTION;
      ball.vx *= WALL_FRICTION;
    }

    if (!wallHit && ball.y < WIDTH / 2 - WALL_LEFT + ball.radius) {
      var arcCX = WIDTH / 2;
      var arcCY = 0;
      var arcR = WIDTH / 2 - WALL_LEFT;
      var adx = ball.x - arcCX;
      var ady = ball.y - arcCY;
      var adist = Math.sqrt(adx * adx + ady * ady);
      if (adist > arcR - ball.radius && adist > 0.001) {
        var anx = adx / adist;
        var any = ady / adist;
        ball.x = arcCX + anx * (arcR - ball.radius);
        ball.y = arcCY + any * (arcR - ball.radius);
        var avn = ball.vx * anx + ball.vy * any;
        if (avn > 0) {
          var atx = -any;
          var aty = anx;
          var avt = ball.vx * atx + ball.vy * aty;
          avn = -avn * ARC_RESTITUTION;
          ball.vx = anx * avn + atx * avt;
          ball.vy = any * avn + aty * avt;
        }
      }
    }

    resolveWallSegment(ball, WALL_LEFT, FUNNEL_TOP_Y, FLIPPER_PIVOT_LX, FLIPPER_PIVOT_Y, FUNNEL_RESTITUTION);
    resolveWallSegment(ball, LANE_X, FUNNEL_TOP_Y, FLIPPER_PIVOT_RX, FLIPPER_PIVOT_Y, FUNNEL_RESTITUTION);
    resolveWallSegment(ball, LANE_X, LANE_TOP_Y, LANE_X, FUNNEL_TOP_Y, DIVIDER_RESTITUTION);
    resolveWallSegment(ball, DEFLECTOR_X, DEFLECTOR_Y, WALL_RIGHT, DEFLECTOR_END_Y, DEFLECTOR_RESTITUTION);

    for (var i = 0; i < state.bumpers.length; i += 1) {
      var bumper = state.bumpers[i];
      if (bumper.hitTimer > 0) {
        bumper.hitTimer -= 1;
      }
      var bdx = ball.x - bumper.x;
      var bdy = ball.y - bumper.y;
      var bdist = Math.sqrt(bdx * bdx + bdy * bdy);
      var minBD = ball.radius + bumper.radius;

      if (bdist < minBD && bdist > 0.001) {
        var bnx = bdx / bdist;
        var bny = bdy / bdist;
        ball.x = bumper.x + bnx * (minBD + 1);
        ball.y = bumper.y + bny * (minBD + 1);
        var bvn = ball.vx * bnx + ball.vy * bny;
        if (bvn < 0) {
          ball.vx -= 2 * bvn * bnx;
          ball.vy -= 2 * bvn * bny;
        }
        ball.vx = ball.vx * BUMPER_VEL_RETAIN + bnx * BUMPER_REPEL_SPEED;
        ball.vy = ball.vy * BUMPER_VEL_RETAIN + bny * BUMPER_REPEL_SPEED;
        var bsp = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
        if (bsp > BUMPER_MAX_SPEED) {
          ball.vx *= BUMPER_MAX_SPEED / bsp;
          ball.vy *= BUMPER_MAX_SPEED / bsp;
        }
        bumper.hitTimer = 14;
        state.score += BUMPER_SCORE * state.level;
      }
    }

    for (var j = 0; j < state.targets.length; j += 1) {
      var target = state.targets[j];
      if (!target.hit && circleHitsRect(ball.x, ball.y, ball.radius, target.x, target.y, target.w, target.h)) {
        target.hit = true;
        state.score += LANE_SCORE * state.level;
        var tcpx = clamp(ball.x, target.x, target.x + target.w);
        var tcpy = clamp(ball.y, target.y, target.y + target.h);
        var tndx = ball.x - tcpx;
        var tndy = ball.y - tcpy;
        var tnl = Math.sqrt(tndx * tndx + tndy * tndy);
        if (tnl > 0.001) { tndx /= tnl; tndy /= tnl; } else { tndx = 0; tndy = -1; }
        var tndot = ball.vx * tndx + ball.vy * tndy;
        if (tndot < 0) { ball.vx -= 2 * tndot * tndx; ball.vy -= 2 * tndot * tndy; }
      }
    }

    var allHit = true;
    for (var k = 0; k < state.targets.length; k += 1) {
      if (!state.targets[k].hit) {
        allHit = false;
        break;
      }
    }
    if (state.targets.length > 0 && allHit) {
      for (var m = 0; m < state.targets.length; m += 1) {
        state.targets[m].hit = false;
      }
      state.level = Math.min(state.level + 1, 10);
      for (var n = 0; n < state.targets.length; n += 1) {
        var tgt = state.targets[n];
        if (circleHitsRect(ball.x, ball.y, ball.radius, tgt.x, tgt.y, tgt.w, tgt.h)) {
          tgt.hit = true;
        }
      }
    }

    if (state.pegs) {
      for (var pi = 0; pi < state.pegs.length; pi += 1) {
        if (resolvePegCollision(ball, state.pegs[pi])) {
          state.score += PEG_SCORE * state.level;
        }
      }
    }

    if (state.slingshots) {
      for (var si = 0; si < state.slingshots.length; si += 1) {
        if (resolveSlingshot(ball, state.slingshots[si])) {
          state.score += SLING_SCORE * state.level;
        }
      }
    }

    if (state.rollovers) {
      for (var ri = 0; ri < state.rollovers.length; ri += 1) {
        if (resolveRollover(ball, state.rollovers[ri])) {
          state.score += ROLLOVER_SCORE * state.level;
        }
      }
    }

    resolveFlipperCollision(ball, lf, dt);
    resolveFlipperCollision(ball, rf, dt);

    if (ball.y > DRAIN_Y) {
      state.balls -= 1;
      if (state.balls <= 0) {
        state.balls = 0;
        state.status = "game_over";
        if (state.rollovers) {
          for (var gori = 0; gori < state.rollovers.length; gori += 1) {
            state.rollovers[gori].lit = false;
          }
        }
      } else {
        resetBallToLauncher();
        state.status = "ready";
      }
    }
  }

  function drawTable() {
    ctx.strokeStyle = "rgba(245, 158, 11, 0.55)";
    ctx.lineWidth = 3;
    var arcR = WIDTH / 2 - WALL_LEFT;
    ctx.beginPath();
    ctx.moveTo(WALL_LEFT, HEIGHT);
    ctx.lineTo(WALL_LEFT, arcR);
    ctx.arc(WIDTH / 2, 0, arcR, Math.PI, 0);
    ctx.lineTo(WALL_RIGHT, HEIGHT);
    ctx.stroke();

    ctx.strokeStyle = "rgba(245, 158, 11, 0.55)";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(WALL_LEFT, FUNNEL_TOP_Y);
    ctx.lineTo(FLIPPER_PIVOT_LX, FLIPPER_PIVOT_Y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(LANE_X, LANE_TOP_Y);
    ctx.lineTo(LANE_X, FUNNEL_TOP_Y);
    ctx.lineTo(FLIPPER_PIVOT_RX, FLIPPER_PIVOT_Y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(DEFLECTOR_X, DEFLECTOR_Y);
    ctx.lineTo(WALL_RIGHT, DEFLECTOR_END_Y);
    ctx.stroke();
    ctx.lineCap = "butt";
  }

  function drawFlipper(flipper) {
    var tip = flipperTip(flipper);
    ctx.save();
    ctx.translate(flipper.pivotX, flipper.pivotY);
    ctx.rotate(flipper.angle);
    ctx.fillStyle = "#f59e0b";
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(0, -FLIPPER_THICKNESS / 2, FLIPPER_LENGTH, FLIPPER_THICKNESS, FLIPPER_THICKNESS / 2);
      ctx.fill();
    } else {
      ctx.fillRect(0, -FLIPPER_THICKNESS / 2, FLIPPER_LENGTH, FLIPPER_THICKNESS);
    }
    ctx.restore();

    ctx.beginPath();
    ctx.arc(flipper.pivotX, flipper.pivotY, FLIPPER_THICKNESS / 2 + 1, 0, Math.PI * 2);
    ctx.fillStyle = "#fbbf24";
    ctx.fill();
  }

  function drawBumper(bumper) {
    var hot = bumper.hitTimer > 0;
    ctx.beginPath();
    ctx.arc(bumper.x, bumper.y, bumper.radius, 0, Math.PI * 2);
    ctx.fillStyle = hot ? "#fbbf24" : "rgba(245, 158, 11, 0.55)";
    ctx.shadowColor = hot ? "#f59e0b" : "rgba(245, 158, 11, 0.3)";
    ctx.shadowBlur = hot ? 18 : 8;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.beginPath();
    ctx.arc(bumper.x, bumper.y, bumper.radius - 4, 0, Math.PI * 2);
    ctx.strokeStyle = hot ? "#fff" : "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = hot ? "#1a0e00" : "#fef9f0";
    ctx.font = "bold 11px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(BUMPER_SCORE * state.level), bumper.x, bumper.y);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  function drawTarget(target) {
    ctx.fillStyle = target.hit ? "rgba(245, 158, 11, 0.18)" : "rgba(245, 158, 11, 0.75)";
    ctx.fillRect(target.x, target.y, target.w, target.h);

    if (!target.hit) {
      ctx.fillStyle = "#fff";
      ctx.font = "bold 9px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(LANE_SCORE * state.level), target.x + target.w / 2, target.y + target.h / 2);
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    }
  }

  function drawPeg(peg) {
    var hot = peg.hitTimer > 0;
    ctx.beginPath();
    ctx.arc(peg.x, peg.y, peg.radius, 0, Math.PI * 2);
    ctx.fillStyle = hot ? "#fde68a" : "rgba(245, 158, 11, 0.45)";
    ctx.shadowColor = hot ? "#f59e0b" : "rgba(245, 158, 11, 0.2)";
    ctx.shadowBlur = hot ? 12 : 4;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(peg.x, peg.y, peg.radius - 2, 0, Math.PI * 2);
    ctx.strokeStyle = hot ? "#fff" : "rgba(255,255,255,0.4)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function drawSlingshot(sling) {
    var hot = sling.hitTimer > 0;
    var midX = (sling.ax + sling.bx) / 2;
    var midY = (sling.ay + sling.by) / 2;
    var apexX = midX + sling.nx * 26;
    var apexY = midY + sling.ny * 26;

    ctx.beginPath();
    ctx.moveTo(sling.ax, sling.ay);
    ctx.lineTo(sling.bx, sling.by);
    ctx.lineTo(apexX, apexY);
    ctx.closePath();
    ctx.fillStyle = hot ? "rgba(251, 191, 36, 0.55)" : "rgba(245, 158, 11, 0.28)";
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(sling.ax, sling.ay);
    ctx.lineTo(sling.bx, sling.by);
    ctx.strokeStyle = hot ? "#fbbf24" : "rgba(245, 158, 11, 0.75)";
    ctx.lineWidth = SLING_THICKNESS;
    ctx.lineCap = "round";
    ctx.shadowColor = hot ? "#f59e0b" : "transparent";
    ctx.shadowBlur = hot ? 14 : 0;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineCap = "butt";
  }

  function drawRollover(ro) {
    var hot = ro.hitTimer > 0;
    ctx.beginPath();
    ctx.arc(ro.x, ro.y, ro.radius, 0, Math.PI * 2);
    if (ro.lit) {
      ctx.fillStyle = hot ? "#fff" : "#fbbf24";
      ctx.shadowColor = hot ? "#fff" : "#f59e0b";
      ctx.shadowBlur = hot ? 18 : 10;
      ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = "rgba(245, 158, 11, 0.12)";
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(ro.x, ro.y, ro.radius, 0, Math.PI * 2);
    ctx.strokeStyle = ro.lit ? "#fbbf24" : "rgba(245, 158, 11, 0.5)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawPlunger() {
    if (state.status !== "ready") return;
    var comp = state.plunger.compressed;
    var barHeight = 30 + comp * 24;
    var x = WIDTH - 16;
    var y = HEIGHT - 80;

    ctx.fillStyle = "rgba(245, 158, 11, 0.22)";
    ctx.fillRect(x - 4, y - 54, 8, 54);

    ctx.fillStyle = comp > 0.5 ? "#f59e0b" : "rgba(245, 158, 11, 0.6)";
    ctx.fillRect(x - 4, y - barHeight, 8, barHeight);
  }

  function drawBall() {
    var ball = state.ball;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = "#38bdf8";
    ctx.shadowColor = "rgba(56, 189, 248, 0.5)";
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function drawOverlay() {
    if (state.paused && state.status !== "game_over") {
      ctx.fillStyle = "rgba(2, 6, 23, 0.62)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = "#f9fafb";
      ctx.font = "700 38px Arial, Helvetica, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Paused", WIDTH / 2, HEIGHT / 2 - 10);
      ctx.font = "16px Arial, Helvetica, sans-serif";
      ctx.fillStyle = "#c4a46b";
      ctx.fillText("Press P to resume", WIDTH / 2, HEIGHT / 2 + 26);
      ctx.textAlign = "start";
      return;
    }
    if (state.status === "playing") return;

    ctx.fillStyle = "rgba(2, 6, 23, 0.74)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    var line1, line2;
    if (state.status === "game_over") {
      line1 = "Game Over";
      line2 = "Press Restart to play again";
    } else {
      line1 = "Ready";
      line2 = "Hold Launch to compress, release to fire";
    }

    ctx.fillStyle = "#f9fafb";
    ctx.font = "700 38px Arial, Helvetica, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(line1, WIDTH / 2, HEIGHT / 2 - 10);
    ctx.font = "16px Arial, Helvetica, sans-serif";
    ctx.fillStyle = "#c4a46b";
    ctx.fillText(line2, WIDTH / 2, HEIGHT / 2 + 26);
    ctx.textAlign = "start";
  }

  function draw() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    drawTable();
    if (state.rollovers) {
      for (var ri = 0; ri < state.rollovers.length; ri += 1) {
        drawRollover(state.rollovers[ri]);
      }
    }
    if (state.pegs) {
      for (var pi = 0; pi < state.pegs.length; pi += 1) {
        drawPeg(state.pegs[pi]);
      }
    }
    if (state.slingshots) {
      for (var si = 0; si < state.slingshots.length; si += 1) {
        drawSlingshot(state.slingshots[si]);
      }
    }
    for (var i = 0; i < state.bumpers.length; i += 1) {
      drawBumper(state.bumpers[i]);
    }
    for (var j = 0; j < state.targets.length; j += 1) {
      drawTarget(state.targets[j]);
    }
    drawFlipper(state.leftFlipper);
    drawFlipper(state.rightFlipper);
    drawPlunger();
    drawBall();
    drawOverlay();
  }

  var accumulator = 0;
  function frame(timestamp) {
    if (!lastTime) {
      lastTime = timestamp;
    }
    accumulator += Math.min((timestamp - lastTime) / 1000, 0.1);
    lastTime = timestamp;

    if (autoStep) {
      while (accumulator >= FIXED_DT) {
        step(FIXED_DT);
        accumulator -= FIXED_DT;
      }
    }

    updateHud();
    draw();
    window.requestAnimationFrame(frame);
  }

  window.addEventListener("keydown", function (event) {
    if (event.key === "r" || event.key === "R") {
      restart();
      return;
    }
    if (event.key === "p" || event.key === "P" || event.key === "Escape") {
      togglePause();
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "z" || event.key === "Z") {
      event.preventDefault();
      if (!state.paused) keys.left = true;
    }
    if (event.key === "ArrowRight" || event.key === "x" || event.key === "X" || event.key === "/") {
      event.preventDefault();
      if (!state.paused) keys.right = true;
    }
    if (event.key === " ") {
      event.preventDefault();
      if (!state.paused) keys.launch = true;
    }
  });

  window.addEventListener("keyup", function (event) {
    if (event.key === "ArrowLeft" || event.key === "z" || event.key === "Z") {
      keys.left = false;
    }
    if (event.key === "ArrowRight" || event.key === "x" || event.key === "X" || event.key === "/") {
      keys.right = false;
    }
    if (event.key === " ") {
      keys.launch = false;
    }
  });

  btnLeft.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    if (!state.paused) keys.left = true;
  }, { passive: false });
  btnLeft.addEventListener("pointerup", function () { keys.left = false; });
  btnLeft.addEventListener("pointercancel", function () { keys.left = false; });
  btnLeft.addEventListener("pointerleave", function () { keys.left = false; });

  btnRight.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    if (!state.paused) keys.right = true;
  }, { passive: false });
  btnRight.addEventListener("pointerup", function () { keys.right = false; });
  btnRight.addEventListener("pointercancel", function () { keys.right = false; });
  btnRight.addEventListener("pointerleave", function () { keys.right = false; });

  btnLaunch.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    if (!state.paused) keys.launch = true;
  }, { passive: false });
  btnLaunch.addEventListener("pointerup", function () { keys.launch = false; });
  btnLaunch.addEventListener("pointercancel", function () { keys.launch = false; });
  btnLaunch.addEventListener("pointerleave", function () { keys.launch = false; });

  restartButton.addEventListener("click", restart);
  pauseButton.addEventListener("click", togglePause);

  window.__pinballTest = {
    isReady: false,
    getState: function () {
      return clone(state);
    },
    setState: function (nextState) {
      var incoming = clone(nextState);
      var initial = makeInitialState();
      if (incoming.ball && typeof incoming.ball === "object") {
        state.ball = Object.assign(state.ball || initial.ball, incoming.ball);
        delete incoming.ball;
      }
      if (incoming.leftFlipper && typeof incoming.leftFlipper === "object") {
        var hadLfAngle = 'angle' in incoming.leftFlipper;
        state.leftFlipper = Object.assign(state.leftFlipper || initial.leftFlipper, incoming.leftFlipper);
        if (hadLfAngle) { state.leftFlipper.prevAngle = state.leftFlipper.angle; }
        delete incoming.leftFlipper;
      }
      if (incoming.rightFlipper && typeof incoming.rightFlipper === "object") {
        var hadRfAngle = 'angle' in incoming.rightFlipper;
        state.rightFlipper = Object.assign(state.rightFlipper || initial.rightFlipper, incoming.rightFlipper);
        if (hadRfAngle) { state.rightFlipper.prevAngle = state.rightFlipper.angle; }
        delete incoming.rightFlipper;
      }
      if (incoming.plunger && typeof incoming.plunger === "object") {
        state.plunger = Object.assign(state.plunger || { compressed: 0 }, incoming.plunger);
        state.plunger.compressed = Math.max(0, Math.min(1, state.plunger.compressed));
        delete incoming.plunger;
      }
      state = Object.assign(state, incoming);
      if (!state.bumpers || !Array.isArray(state.bumpers) || state.bumpers.length < 3) {
        state.bumpers = initial.bumpers;
      } else {
        state.bumpers = state.bumpers.map(function (b) {
          return {
            x: typeof b.x === "number" ? b.x : 0,
            y: typeof b.y === "number" ? b.y : 0,
            radius: typeof b.radius === "number" ? b.radius : BUMPER_RADIUS,
            hitTimer: typeof b.hitTimer === "number" ? Math.max(0, b.hitTimer) : 0
          };
        });
      }
      if (Array.isArray(state.targets)) {
        state.targets = state.targets.map(function (t) {
          return {
            x: typeof t.x === "number" ? t.x : 0,
            y: typeof t.y === "number" ? t.y : 0,
            w: typeof t.w === "number" ? t.w : 0,
            h: typeof t.h === "number" ? t.h : 0,
            hit: Boolean(t.hit)
          };
        });
      } else {
        state.targets = initial.targets;
      }
      if (Array.isArray(state.slingshots)) {
        state.slingshots = state.slingshots.map(function (sl) {
          return {
            ax: typeof sl.ax === "number" ? sl.ax : 0,
            ay: typeof sl.ay === "number" ? sl.ay : 0,
            bx: typeof sl.bx === "number" ? sl.bx : 0,
            by: typeof sl.by === "number" ? sl.by : 0,
            nx: typeof sl.nx === "number" ? sl.nx : 0,
            ny: typeof sl.ny === "number" ? sl.ny : 0,
            hitTimer: typeof sl.hitTimer === "number" ? Math.max(0, sl.hitTimer) : 0
          };
        });
      } else {
        state.slingshots = initial.slingshots;
      }
      if (Array.isArray(state.pegs)) {
        state.pegs = state.pegs.map(function (p) {
          return {
            x: typeof p.x === "number" ? p.x : 0,
            y: typeof p.y === "number" ? p.y : 0,
            radius: typeof p.radius === "number" ? p.radius : PEG_RADIUS,
            hitTimer: typeof p.hitTimer === "number" ? Math.max(0, p.hitTimer) : 0
          };
        });
      } else {
        state.pegs = initial.pegs;
      }
      if (Array.isArray(state.rollovers)) {
        state.rollovers = state.rollovers.map(function (ro) {
          return {
            x: typeof ro.x === "number" ? ro.x : 0,
            y: typeof ro.y === "number" ? ro.y : 0,
            radius: typeof ro.radius === "number" ? ro.radius : ROLLOVER_RADIUS,
            lit: Boolean(ro.lit),
            hitTimer: typeof ro.hitTimer === "number" ? Math.max(0, ro.hitTimer) : 0
          };
        });
      } else {
        state.rollovers = initial.rollovers;
      }
      if (typeof state.balls === "number") {
        state.balls = Math.max(0, Math.floor(state.balls));
      }
      if (typeof state.paused !== "boolean") {
        state.paused = false;
      }
      if (typeof state.level === "number") {
        state.level = Math.max(1, Math.min(10, Math.floor(state.level)));
      }
      updateHud();
      draw();
    },
    advanceFrames: function (frames) {
      var total = Math.max(0, Math.floor(frames));
      for (var i = 0; i < total; i += 1) {
        step(FIXED_DT);
      }
      updateHud();
      draw();
      return clone(state);
    },
    restart: function () {
      restart();
      return clone(state);
    },
    setAutoStep: function (enabled) {
      autoStep = Boolean(enabled);
      return clone(state);
    }
  };

  restart();
  window.__pinballTest.isReady = true;
  window.requestAnimationFrame(frame);
}());
