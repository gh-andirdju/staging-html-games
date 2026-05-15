(function () {
  "use strict";

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var ballsEl = document.getElementById("balls");
  var levelEl = document.getElementById("level");
  var statusEl = document.getElementById("status");
  var restartButton = document.getElementById("restart");
  var btnLeft = document.getElementById("btn-left");
  var btnRight = document.getElementById("btn-right");
  var btnLaunch = document.getElementById("btn-launch");

  var WIDTH = canvas.width;
  var HEIGHT = canvas.height;
  var FIXED_DT = 1 / 60;
  var GRAVITY = 800;
  var BALL_RADIUS = 10;
  var BALL_LAUNCH_SPEED = 650;
  var FLIPPER_LENGTH = 68;
  var FLIPPER_THICKNESS = 8;
  var FLIPPER_REST_ANGLE_L = Math.PI * 0.28;
  var FLIPPER_ACTIVE_ANGLE_L = -Math.PI * 0.1;
  var FLIPPER_REST_ANGLE_R = Math.PI - Math.PI * 0.28;
  var FLIPPER_ACTIVE_ANGLE_R = Math.PI + Math.PI * 0.1;
  var FLIPPER_SPEED = Math.PI * 14;
  var FLIPPER_PIVOT_Y = HEIGHT - 90;
  var FLIPPER_PIVOT_LX = WIDTH / 2 - 34;
  var FLIPPER_PIVOT_RX = WIDTH / 2 + 34;
  var BUMPER_RADIUS = 22;
  var BUMPER_REPEL_SPEED = 540;
  var BUMPER_SCORE = 50;
  var LANE_SCORE = 150;
  var WALL_LEFT = 30;
  var WALL_RIGHT = WIDTH - 30;
  var LAUNCH_X = WALL_RIGHT - BALL_RADIUS;
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
        y: HEIGHT - 130,
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
        { x: 120, y: 210, radius: BUMPER_RADIUS, hitTimer: 0 },
        { x: 200, y: 155, radius: BUMPER_RADIUS, hitTimer: 0 },
        { x: 280, y: 210, radius: BUMPER_RADIUS, hitTimer: 0 }
      ],
      targets: [
        { x: 52, y: 360, width: 56, height: 12, hit: false },
        { x: 172, y: 320, width: 56, height: 12, hit: false },
        { x: 292, y: 360, width: 56, height: 12, hit: false }
      ],
      score: 0,
      balls: 3,
      level: 1,
      status: "ready",
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
    state.ball.y = HEIGHT - 130;
    state.ball.vx = 0;
    state.ball.vy = 0;
    state.ball.launched = false;
    state.plunger.compressed = 0;
  }

  function statusText() {
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
      var tipSpeed = Math.abs(angularVel) * FLIPPER_LENGTH * cp.t;
      var boostSign = angularVel < 0 ? -1 : 1;
      var boost = boostSign * tipSpeed * 0.55;
      ball.vx += nx * boost;
      ball.vy += ny * boost;
      var speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
      if (speed > 900) {
        var s = 900 / speed;
        ball.vx *= s;
        ball.vy *= s;
      }
    }
  }

  function circleHitsRect(bx, by, br, rx, ry, rw, rh) {
    var cx = clamp(bx, rx, rx + rw);
    var cy = clamp(by, ry, ry + rh);
    var dx = bx - cx;
    var dy = by - cy;
    return dx * dx + dy * dy <= br * br;
  }

  function step(dt) {
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
        ball.vy = -BALL_LAUNCH_SPEED * state.plunger.compressed;
        ball.launched = true;
        ball.vx = 0;
        state.plunger.compressed = 0;
        state.status = "playing";
      }
      ball.x = LAUNCH_X;
      ball.vx = 0;
      return;
    }

    state.frame += 1;
    ball.vy += GRAVITY * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    var wallHit = false;
    if (ball.x - ball.radius < WALL_LEFT) {
      ball.x = WALL_LEFT + ball.radius;
      ball.vx = Math.abs(ball.vx);
      wallHit = true;
    } else if (ball.x + ball.radius > WALL_RIGHT) {
      ball.x = WALL_RIGHT - ball.radius;
      ball.vx = -Math.abs(ball.vx);
      wallHit = true;
    }
    if (ball.y - ball.radius < 10) {
      ball.y = ball.radius + 10;
      ball.vy = Math.abs(ball.vy);
    }

    if (!wallHit && ball.y < 80) {
      var arcCX = WIDTH / 2;
      var arcCY = 0;
      var arcR = WIDTH / 2 - WALL_LEFT + ball.radius;
      var adx = ball.x - arcCX;
      var ady = ball.y - arcCY;
      var adist = Math.sqrt(adx * adx + ady * ady);
      if (adist > arcR - ball.radius && adist > 0.001) {
        var anx = adx / adist;
        var any = ady / adist;
        ball.x = arcCX + anx * (arcR - ball.radius);
        ball.y = arcCY + any * (arcR - ball.radius);
        var adot = ball.vx * anx + ball.vy * any;
        ball.vx -= 2 * adot * anx;
        ball.vy -= 2 * adot * any;
      }
    }

    for (var i = 0; i < state.bumpers.length; i += 1) {
      var bumper = state.bumpers[i];
      var bdx = ball.x - bumper.x;
      var bdy = ball.y - bumper.y;
      var bdist = Math.sqrt(bdx * bdx + bdy * bdy);
      var minBD = ball.radius + bumper.radius;

      if (bdist < minBD && bdist > 0.001) {
        var bnx = bdx / bdist;
        var bny = bdy / bdist;
        ball.x = bumper.x + bnx * (minBD + 1);
        ball.y = bumper.y + bny * (minBD + 1);
        var inSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
        var outSpeed = Math.max(BUMPER_REPEL_SPEED, inSpeed);
        ball.vx = bnx * outSpeed;
        ball.vy = bny * outSpeed;
        bumper.hitTimer = 14;
        state.score += BUMPER_SCORE * state.level;
      }

      if (bumper.hitTimer > 0) {
        bumper.hitTimer -= 1;
      }
    }

    for (var j = 0; j < state.targets.length; j += 1) {
      var target = state.targets[j];
      if (!target.hit && circleHitsRect(ball.x, ball.y, ball.radius, target.x, target.y, target.width, target.height)) {
        target.hit = true;
        state.score += LANE_SCORE * state.level;
        var cy = target.y + target.height / 2;
        if (ball.y < cy) {
          ball.vy = -Math.abs(ball.vy);
        } else {
          ball.vy = Math.abs(ball.vy);
        }
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
    }

    resolveFlipperCollision(ball, lf, dt);
    resolveFlipperCollision(ball, rf, dt);

    if (ball.y > DRAIN_Y) {
      state.balls -= 1;
      if (state.balls <= 0) {
        state.balls = 0;
        state.status = "game_over";
      } else {
        resetBallToLauncher();
        state.status = "ready";
      }
    }
  }

  function drawTable() {
    ctx.strokeStyle = "rgba(245, 158, 11, 0.55)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(WALL_LEFT, HEIGHT);
    ctx.lineTo(WALL_LEFT, 80);
    ctx.quadraticCurveTo(WALL_LEFT, 20, WIDTH / 2, 14);
    ctx.quadraticCurveTo(WALL_RIGHT, 20, WALL_RIGHT, 80);
    ctx.lineTo(WALL_RIGHT, HEIGHT);
    ctx.stroke();

    ctx.strokeStyle = "rgba(245, 158, 11, 0.22)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(WALL_LEFT, HEIGHT - 30);
    ctx.lineTo(FLIPPER_PIVOT_LX - 2, FLIPPER_PIVOT_Y + 20);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(WALL_RIGHT, HEIGHT - 30);
    ctx.lineTo(FLIPPER_PIVOT_RX + 2, FLIPPER_PIVOT_Y + 20);
    ctx.stroke();
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
    ctx.fillRect(target.x, target.y, target.width, target.height);

    if (!target.hit) {
      ctx.fillStyle = "#fff";
      ctx.font = "bold 9px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(LANE_SCORE * state.level), target.x + target.width / 2, target.y + target.height / 2);
      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    }
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

  function frame(timestamp) {
    if (!lastTime) {
      lastTime = timestamp;
    }
    var elapsed = Math.min((timestamp - lastTime) / 1000, 0.1);
    lastTime = timestamp;

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

  window.addEventListener("keydown", function (event) {
    if (event.key === "ArrowLeft" || event.key === "z" || event.key === "Z") {
      keys.left = true;
      event.preventDefault();
    }
    if (event.key === "ArrowRight" || event.key === "x" || event.key === "X" || event.key === "/") {
      keys.right = true;
      event.preventDefault();
    }
    if (event.key === " ") {
      keys.launch = true;
      event.preventDefault();
    }
    if (event.key === "r" || event.key === "R") {
      restart();
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
    keys.left = true;
    e.preventDefault();
  }, { passive: false });
  btnLeft.addEventListener("pointerup", function () { keys.left = false; });
  btnLeft.addEventListener("pointercancel", function () { keys.left = false; });

  btnRight.addEventListener("pointerdown", function (e) {
    keys.right = true;
    e.preventDefault();
  }, { passive: false });
  btnRight.addEventListener("pointerup", function () { keys.right = false; });
  btnRight.addEventListener("pointercancel", function () { keys.right = false; });

  btnLaunch.addEventListener("pointerdown", function (e) {
    keys.launch = true;
    e.preventDefault();
  }, { passive: false });
  btnLaunch.addEventListener("pointerup", function () { keys.launch = false; });
  btnLaunch.addEventListener("pointercancel", function () { keys.launch = false; });

  restartButton.addEventListener("click", restart);

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
        state.leftFlipper = Object.assign(state.leftFlipper || initial.leftFlipper, incoming.leftFlipper);
        delete incoming.leftFlipper;
      }
      if (incoming.rightFlipper && typeof incoming.rightFlipper === "object") {
        state.rightFlipper = Object.assign(state.rightFlipper || initial.rightFlipper, incoming.rightFlipper);
        delete incoming.rightFlipper;
      }
      if (incoming.plunger && typeof incoming.plunger === "object") {
        state.plunger = Object.assign(state.plunger || { compressed: 0 }, incoming.plunger);
        delete incoming.plunger;
      }
      state = Object.assign(state, incoming);
      if (!state.bumpers || !Array.isArray(state.bumpers)) {
        state.bumpers = initial.bumpers;
      }
      if (!state.targets || !Array.isArray(state.targets)) {
        state.targets = initial.targets;
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
