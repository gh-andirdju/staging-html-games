(function () {
  "use strict";

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var scoreEl = document.getElementById("score");
  var livesEl = document.getElementById("lives");
  var levelEl = document.getElementById("level");
  var effectsEl = document.getElementById("effects");
  var statusEl = document.getElementById("status");
  var restartButton = document.getElementById("restart");

  var WIDTH = canvas.width;
  var HEIGHT = canvas.height;
  var FIXED_DT = 1 / 60;
  var POWER_UP_TYPES = ["wide", "slow", "life", "multi", "laser"];
  var POWER_UP_DURATION = {
    wide: 60 * 12,
    slow: 60 * 10,
    laser: 60 * 10
  };
  var PICKUP_SIZE = 18;
  var PICKUP_SPEED = 150;
  var LASER_SPEED = 1100;
  var LASER_COOLDOWN_FRAMES = 18;

  var paddle = {
    width: 112,
    height: 14,
    x: WIDTH / 2 - 56,
    y: HEIGHT - 36,
    speed: 470
  };

  var ballStart = {
    radius: 8,
    x: WIDTH / 2,
    y: HEIGHT - 58,
    dx: 210,
    dy: -260
  };
  var PADDLE_MAX_BOUNCE_ANGLE = Math.PI / 3;
  var BALL_BASE_SPEED = Math.sqrt(ballStart.dx * ballStart.dx + ballStart.dy * ballStart.dy);

  var brickConfig = {
    rows: 5,
    cols: 10,
    width: 66,
    height: 22,
    gap: 8,
    top: 62,
    left: 31
  };

  var keys = {
    left: false,
    right: false,
    fire: false
  };

  var state;
  var lastTime = 0;
  var autoStep = true;
  var renderTick = 0;
  var activeTouchId = null;

  function powerUpLetter(type) {
    if (type === "wide") return "E";
    if (type === "slow") return "S";
    if (type === "laser") return "L";
    if (type === "multi") return "D";
    if (type === "life") return "P";
    return "";
  }

  function makeBricksForLevel(level) {
    var layout = levelLayout(level);
    var bricks = [];

    for (var row = 0; row < brickConfig.rows; row += 1) {
      for (var col = 0; col < brickConfig.cols; col += 1) {
        if (!layout.brickActive(row, col)) {
          continue;
        }
        var powerType = powerUpTypeForBrick(row, col, level, layout.powerOffset);
        bricks.push({
          x: brickConfig.left + col * (brickConfig.width + brickConfig.gap),
          y: brickConfig.top + row * (brickConfig.height + brickConfig.gap),
          width: brickConfig.width,
          height: brickConfig.height,
          active: true,
          row: row,
          col: col,
          powerUp: powerType,
          powerUpType: powerType
        });
      }
    }

    return bricks;
  }

  function levelLayout(level) {
    var cycle = (Math.max(1, level) - 1) % 4;
    var shift = (level - 1) % brickConfig.cols;

    if (cycle === 0) {
      return {
        powerOffset: 0,
        brickActive: function (row, col) {
          return true;
        }
      };
    }
    if (cycle === 1) {
      return {
        powerOffset: 2,
        brickActive: function (row, col) {
          return (col + shift) % 2 === 0;
        }
      };
    }
    if (cycle === 2) {
      return {
        powerOffset: 4,
        brickActive: function (row, col) {
          return (row + col + shift) % 3 !== 1;
        }
      };
    }
    return {
      powerOffset: 1,
      brickActive: function (row, col) {
        if (row === 0 || row === brickConfig.rows - 1) {
          return true;
        }
        return (col + shift) % 3 !== 1;
      }
    };
  }

  function powerUpTypeForBrick(row, col, level, powerOffset) {
    var index = row * brickConfig.cols + col;
    var offset = typeof powerOffset === "number" ? powerOffset : 0;

    if ((index + level + offset) % 9 !== 2) {
      return null;
    }

    return POWER_UP_TYPES[(Math.floor(index / 9) + level + offset) % POWER_UP_TYPES.length];
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function publicState() {
    normalizeState();
    var snapshot = clone(state);
    snapshot.width = WIDTH;
    snapshot.height = HEIGHT;
    snapshot.paddle = {
      x: state.paddleX,
      y: paddle.y,
      width: state.paddleWidth,
      height: paddle.height
    };
    snapshot.gameOver = state.status === "Game Over";
    snapshot.won = state.status === "You Win";
    snapshot.level = state.level;
    snapshot.effectsDisplay = getEffectsDisplay();
    return snapshot;
  }

  function resetBall() {
    state.balls = [clone(ballStart)];
    state.ball = state.balls[0];
  }

  function resetEffects() {
    state.pickups = [];
    state.lasers = [];
    state.activeEffects = {};
    state.paddleWidth = paddle.width;
    state.laserCooldown = 0;
  }

  function restart() {
    renderTick = 0;
    state = {
      paddleX: paddle.x,
      ball: clone(ballStart),
      balls: [],
      bricks: makeBricksForLevel(1),
      pickups: [],
      lasers: [],
      activeEffects: {},
      paddleWidth: paddle.width,
      laserCooldown: 0,
      score: 0,
      lives: 3,
      level: 1,
      status: "Playing"
    };
    resetBall();
    updateHud();
    draw();
  }

  function normalizeBall(ball) {
    ball.radius = ball.radius || ball.r || ball.size || ballStart.radius;
    ball.dx = typeof ball.dx === "number" ? ball.dx : (typeof ball.vx === "number" ? ball.vx : (typeof ball.velocityX === "number" ? ball.velocityX : ballStart.dx));
    ball.dy = typeof ball.dy === "number" ? ball.dy : (typeof ball.vy === "number" ? ball.vy : (typeof ball.velocityY === "number" ? ball.velocityY : ballStart.dy));
    ball.vx = ball.dx;
    ball.vy = ball.dy;
    ball.velocityX = ball.dx;
    ball.velocityY = ball.dy;
    return ball;
  }

  function syncBallAliases(ball) {
    ball.vx = ball.dx;
    ball.vy = ball.dy;
    ball.velocityX = ball.dx;
    ball.velocityY = ball.dy;
  }

  function normalizeState() {
    if (!state) {
      return;
    }

    if (!Array.isArray(state.balls) || state.balls.length === 0) {
      state.balls = state.ball ? [state.ball] : [clone(ballStart)];
    }

    for (var i = 0; i < state.balls.length; i += 1) {
      normalizeBall(state.balls[i]);
    }

    state.ball = state.balls[0];
    state.pickups = Array.isArray(state.pickups) ? state.pickups : [];
    state.lasers = Array.isArray(state.lasers) ? state.lasers : [];
    state.activeEffects = state.activeEffects && typeof state.activeEffects === "object" ? state.activeEffects : {};
    state.paddleWidth = typeof state.paddleWidth === "number" ? state.paddleWidth : paddle.width;
    state.laserCooldown = typeof state.laserCooldown === "number" ? state.laserCooldown : 0;
    state.level = typeof state.level === "number" ? Math.max(1, Math.floor(state.level)) : 1;
  }

  function updateHud() {
    scoreEl.textContent = String(state.score);
    livesEl.textContent = String(state.lives);
    levelEl.textContent = String(state.level);
    effectsEl.textContent = formatEffectsDisplay(getEffectsDisplay());
    statusEl.textContent = state.status;
  }

  function getEffectsDisplay() {
    var timed = ["laser", "slow", "wide"];
    var display = [];

    for (var i = 0; i < timed.length; i += 1) {
      var name = timed[i];
      var frames = state.activeEffects[name];
      if (typeof frames === "number" && frames > 0) {
        display.push({
          type: name,
          seconds: Math.ceil(frames / 60)
        });
      }
    }

    return display;
  }

  function formatEffectsDisplay(display) {
    if (!display.length) {
      return "None";
    }
    return display.map(function (item) {
      return item.type.toUpperCase() + " " + item.seconds + "s";
    }).join(" • ");
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function circleHitsRect(circle, rect) {
    var closestX = clamp(circle.x, rect.x, rect.x + rect.width);
    var closestY = clamp(circle.y, rect.y, rect.y + rect.height);
    var xDistance = circle.x - closestX;
    var yDistance = circle.y - closestY;

    return xDistance * xDistance + yDistance * yDistance <= circle.radius * circle.radius;
  }

  function reflectFromRect(ball, rect) {
    var previousX = ball.x - ball.dx * FIXED_DT;
    var previousY = ball.y - ball.dy * FIXED_DT;
    var cameFromSide = previousX <= rect.x || previousX >= rect.x + rect.width;
    var cameFromTopOrBottom = previousY <= rect.y || previousY >= rect.y + rect.height;

    if (cameFromSide && !cameFromTopOrBottom) {
      ball.dx *= -1;
    } else {
      ball.dy *= -1;
    }
  }

  function activeBrickCount() {
    var count = 0;

    for (var i = 0; i < state.bricks.length; i += 1) {
      if (state.bricks[i].active) {
        count += 1;
      }
    }

    return count;
  }

  function loseLife() {
    state.lives -= 1;
    resetEffects();

    if (state.lives <= 0) {
      state.lives = 0;
      state.status = "Game Over";
      return;
    }

    resetBall();
    state.paddleX = paddle.x;
  }

  function prepareLevelStart() {
    state.pickups = [];
    state.lasers = [];
    state.laserCooldown = 0;
    resetBall();
    applyEffectState();
    state.paddleX = clamp(WIDTH / 2 - state.paddleWidth / 2, 0, WIDTH - state.paddleWidth);
    state.status = "Playing";
  }

  function advanceLevel() {
    state.level += 1;
    state.bricks = makeBricksForLevel(state.level);
    prepareLevelStart();
  }

  function spawnPickup(brick) {
    var type = normalizePowerUpType(brick.powerUp || brick.powerUpType || brick.powerup || brick.powerupType || brick.bonus || brick.drop);

    if (!type) {
      return;
    }

    state.pickups.push({
      type: type,
      powerUp: type,
      powerUpType: type,
      x: brick.x + brick.width / 2 - PICKUP_SIZE / 2,
      y: brick.y + brick.height / 2 - PICKUP_SIZE / 2,
      width: PICKUP_SIZE,
      height: PICKUP_SIZE,
      dy: PICKUP_SPEED,
      active: true
    });
  }

  function activatePowerUp(type) {
    type = normalizePowerUpType(type);

    if (type === "life") {
      state.lives += 1;
      return;
    }

    if (type === "multi") {
      addMultiBalls();
      return;
    }

    if (POWER_UP_DURATION[type]) {
      state.activeEffects[type] = POWER_UP_DURATION[type];
    }

    applyEffectState();
  }

  function normalizePowerUpType(type) {
    if (type === "multiball" || type === "multi-ball") {
      return "multi";
    }

    return POWER_UP_TYPES.indexOf(type) >= 0 ? type : null;
  }

  function addMultiBalls() {
    normalizeState();

    if (state.balls.length >= 3) {
      return;
    }

    var source = state.balls[0] || clone(ballStart);
    var first = clone(source);
    var second = clone(source);
    first.dx = -Math.abs(source.dx || ballStart.dx);
    second.dx = Math.abs(source.dx || ballStart.dx);
    first.dy = -Math.abs(source.dy || ballStart.dy);
    second.dy = -Math.abs(source.dy || ballStart.dy);
    syncBallAliases(first);
    syncBallAliases(second);
    state.balls.push(first, second);
    state.ball = state.balls[0];
  }

  function applyEffectState() {
    state.paddleWidth = state.activeEffects.wide > 0 ? 164 : paddle.width;
  }

  function updateEffects() {
    var names = Object.keys(state.activeEffects);

    for (var i = 0; i < names.length; i += 1) {
      var name = names[i];
      state.activeEffects[name] -= 1;
      if (state.activeEffects[name] <= 0) {
        delete state.activeEffects[name];
      }
    }

    if (state.laserCooldown > 0) {
      state.laserCooldown -= 1;
    }

    applyEffectState();
    state.paddleX = clamp(state.paddleX, 0, WIDTH - state.paddleWidth);
  }

  function updatePickups(dt) {
    var paddleRect = {
      x: state.paddleX,
      y: paddle.y,
      width: state.paddleWidth,
      height: paddle.height
    };

    for (var i = state.pickups.length - 1; i >= 0; i -= 1) {
      var pickup = state.pickups[i];
      pickup.y += pickup.dy * dt;

      if (rectsOverlap(pickup, paddleRect)) {
        activatePowerUp(pickup.type);
        state.pickups.splice(i, 1);
      } else if (pickup.y > HEIGHT) {
        state.pickups.splice(i, 1);
      }
    }
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  function fireLasers() {
    if (!(state.activeEffects.laser > 0) || state.laserCooldown > 0) {
      return;
    }

    var left = state.paddleX + 16;
    var right = state.paddleX + state.paddleWidth - 20;
    state.lasers.push(
      { x: left, y: paddle.y - 8, width: 4, height: 12, dy: -LASER_SPEED, active: true },
      { x: right, y: paddle.y - 8, width: 4, height: 12, dy: -LASER_SPEED, active: true }
    );
    state.laserCooldown = LASER_COOLDOWN_FRAMES;
  }

  function updateLasers(dt) {
    for (var i = state.lasers.length - 1; i >= 0; i -= 1) {
      var laser = state.lasers[i];
      laser.y += laser.dy * dt;

      if (laser.y + laser.height < 0) {
        state.lasers.splice(i, 1);
        continue;
      }

      for (var j = 0; j < state.bricks.length; j += 1) {
        var brick = state.bricks[j];

        if (!brick.active || !rectsOverlap(laser, brick)) {
          continue;
        }

        brick.active = false;
        state.score += 10;
        spawnPickup(brick);
        state.lasers.splice(i, 1);
        break;
      }
    }
  }

  function ballSpeedScale() {
    return state.activeEffects.slow > 0 ? 0.62 : 1;
  }

  function bounceBallFromPaddle(ball) {
    var paddleCenter = state.paddleX + state.paddleWidth / 2;
    var halfWidth = state.paddleWidth / 2;
    var impact = clamp((ball.x - paddleCenter) / halfWidth, -1, 1);
    var bounceAngle = impact * PADDLE_MAX_BOUNCE_ANGLE;

    ball.dx = BALL_BASE_SPEED * Math.sin(bounceAngle);
    ball.dy = -Math.abs(BALL_BASE_SPEED * Math.cos(bounceAngle));
  }

  function step(dt) {
    if (state.status !== "Playing") {
      return;
    }

    normalizeState();
    renderTick += 1;
    updateEffects();

    if (keys.left) {
      state.paddleX -= paddle.speed * dt;
    }
    if (keys.right) {
      state.paddleX += paddle.speed * dt;
    }

    state.paddleX = clamp(state.paddleX, 0, WIDTH - state.paddleWidth);

    if (state.activeEffects.laser > 0) {
      fireLasers();
    }

    updateLasers(dt);
    updatePickups(dt);
    updateBalls(dt);

    if (state.balls.length === 0) {
      loseLife();
      return;
    }

    if (activeBrickCount() === 0) {
      advanceLevel();
    }
  }

  function updateBalls(dt) {
    var paddleRect = {
      x: state.paddleX,
      y: paddle.y,
      width: state.paddleWidth,
      height: paddle.height
    };

    for (var ballIndex = state.balls.length - 1; ballIndex >= 0; ballIndex -= 1) {
      var ball = state.balls[ballIndex];
      var speedScale = ballSpeedScale();
      ball.x += ball.dx * dt * speedScale;
      ball.y += ball.dy * dt * speedScale;

      if (ball.x - ball.radius <= 0) {
        ball.x = ball.radius;
        ball.dx = Math.abs(ball.dx);
      }
      if (ball.x + ball.radius >= WIDTH) {
        ball.x = WIDTH - ball.radius;
        ball.dx = -Math.abs(ball.dx);
      }
      if (ball.y - ball.radius <= 0) {
        ball.y = ball.radius;
        ball.dy = Math.abs(ball.dy);
      }
      if (ball.y - ball.radius > HEIGHT) {
        state.balls.splice(ballIndex, 1);
        continue;
      }

      if (ball.dy > 0 && circleHitsRect(ball, paddleRect)) {
        ball.y = paddle.y - ball.radius;
        bounceBallFromPaddle(ball);
      }

      for (var i = 0; i < state.bricks.length; i += 1) {
        var brick = state.bricks[i];

        if (!brick.active || !circleHitsRect(ball, brick)) {
          continue;
        }

        brick.active = false;
        state.score += 10;
        spawnPickup(brick);
        reflectFromRect(ball, brick);
        break;
      }

      syncBallAliases(ball);
    }

    state.ball = state.balls[0];
  }

  function drawBricks() {
    var colors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6"];

    for (var i = 0; i < state.bricks.length; i += 1) {
      var brick = state.bricks[i];

      if (!brick.active) {
        continue;
      }

      ctx.fillStyle = powerUpColor(brick.powerUp || brick.powerUpType) || colors[Math.floor((brick.y - brickConfig.top) / (brickConfig.height + brickConfig.gap))] || "#3b82f6";
      ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
      if (brick.powerUp || brick.powerUpType) {
        drawPowerBrickBadge(brick, brick.powerUp || brick.powerUpType);
      }
    }
  }

  function powerUpColor(type) {
    if (type === "wide") return "#14b8a6";
    if (type === "slow") return "#a78bfa";
    if (type === "life") return "#22c55e";
    if (type === "multi") return "#f59e0b";
    if (type === "laser") return "#ef4444";
    return null;
  }

  function drawArcadeCapsule(x, y, width, height, type, letter, blinkOn) {
    var color = powerUpColor(type) || "#f9fafb";
    var midX = x + width / 2;
    var radius = height / 2;

    ctx.save();
    ctx.globalAlpha = blinkOn ? 1 : 0.86;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(midX - radius, y + radius, radius, Math.PI / 2, Math.PI * 1.5);
    ctx.arc(midX + radius, y + radius, radius, Math.PI * 1.5, Math.PI / 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.arc(midX - radius, y + radius, radius * 0.78, Math.PI / 2, Math.PI * 1.5);
    ctx.fill();

    ctx.fillStyle = "rgba(2,6,23,0.22)";
    ctx.beginPath();
    ctx.arc(midX + radius, y + radius, radius * 0.78, Math.PI * 1.5, Math.PI / 2);
    ctx.fill();

    ctx.fillStyle = "#f8fafc";
    ctx.font = "700 12px Arial, Helvetica, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(letter, midX, y + radius + 0.5);
    ctx.restore();
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  function drawPowerBrickBadge(brick, type) {
    var letter = powerUpLetter(type);
    if (!letter) {
      return;
    }

    var badgeWidth = 20;
    var badgeHeight = 14;
    var x = brick.x + brick.width / 2 - badgeWidth / 2;
    var y = brick.y + brick.height / 2 - badgeHeight / 2;
    var blinkOn = ((renderTick / 12) | 0) % 2 === 0;
    drawArcadeCapsule(x, y, badgeWidth, badgeHeight, type, letter, blinkOn);
  }

  function draw() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    drawBricks();

    ctx.fillStyle = "#f9fafb";
    normalizeState();

    ctx.fillRect(state.paddleX, paddle.y, state.paddleWidth, paddle.height);

    for (var i = 0; i < state.pickups.length; i += 1) {
      var pickup = state.pickups[i];
      var blinkOn = ((renderTick / 8) | 0) % 2 === 0;
      drawArcadeCapsule(
        pickup.x,
        pickup.y + 1,
        pickup.width,
        Math.max(12, pickup.height - 2),
        pickup.type,
        powerUpLetter(pickup.type),
        blinkOn
      );
    }

    ctx.fillStyle = "#f87171";
    for (var j = 0; j < state.lasers.length; j += 1) {
      var laser = state.lasers[j];
      ctx.fillRect(laser.x, laser.y, laser.width, laser.height);
    }

    for (var k = 0; k < state.balls.length; k += 1) {
      var ball = state.balls[k];
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.fillStyle = k === 0 ? "#38bdf8" : "#fde047";
      ctx.fill();
    }

    if (state.status !== "Playing") {
      ctx.fillStyle = "rgba(2, 6, 23, 0.72)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = "#f9fafb";
      ctx.font = "700 42px Arial, Helvetica, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(state.status, WIDTH / 2, HEIGHT / 2);
      ctx.font = "20px Arial, Helvetica, sans-serif";
      ctx.fillText("Press Restart to play again", WIDTH / 2, HEIGHT / 2 + 38);
      ctx.textAlign = "start";
    }
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

  function handleKey(event, pressed) {
    if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") {
      keys.left = pressed;
      event.preventDefault();
    }
    if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") {
      keys.right = pressed;
      event.preventDefault();
    }
    if (event.key === " " || event.key === "Spacebar" || event.code === "Space") {
      keys.fire = pressed;
      event.preventDefault();
    }
  }

  function updatePaddlePositionFromClientX(clientX) {
    var rect = canvas.getBoundingClientRect();
    var scale = WIDTH / rect.width;
    normalizeState();
    state.paddleX = clamp((clientX - rect.left) * scale - state.paddleWidth / 2, 0, WIDTH - state.paddleWidth);
  }

  window.addEventListener("keydown", function (event) {
    handleKey(event, true);
  });

  window.addEventListener("keyup", function (event) {
    handleKey(event, false);
  });

  canvas.addEventListener("mousemove", function (event) {
    updatePaddlePositionFromClientX(event.clientX);
  });

  canvas.addEventListener("touchstart", function (event) {
    if (!event.touches.length) {
      return;
    }

    var touch = event.changedTouches[0];
    activeTouchId = touch.identifier;
    updatePaddlePositionFromClientX(touch.clientX);
    event.preventDefault();
  }, { passive: false });

  canvas.addEventListener("touchmove", function (event) {
    var touch = null;

    for (var i = 0; i < event.changedTouches.length; i += 1) {
      if (event.changedTouches[i].identifier === activeTouchId) {
        touch = event.changedTouches[i];
        break;
      }
    }

    if (!touch && event.touches.length) {
      touch = event.touches[0];
      activeTouchId = touch.identifier;
    }

    if (!touch) {
      return;
    }

    updatePaddlePositionFromClientX(touch.clientX);
    event.preventDefault();
  }, { passive: false });

  canvas.addEventListener("touchend", function (event) {
    for (var i = 0; i < event.changedTouches.length; i += 1) {
      if (event.changedTouches[i].identifier === activeTouchId) {
        activeTouchId = null;
        break;
      }
    }

    if (event.cancelable) {
      event.preventDefault();
    }
  }, { passive: false });

  restartButton.addEventListener("click", restart);

  window.__brickbreakerTest = {
    isReady: false,
    getState: function () {
      return publicState();
    },
    readState: function () {
      return publicState();
    },
    setState: function (nextState) {
      var incoming = clone(nextState);
      if (incoming.paddle && typeof incoming.paddle.x === "number") {
        incoming.paddleX = incoming.paddle.x;
      }
      if (incoming.ball) {
        if (Array.isArray(incoming.balls) && incoming.balls.length > 0) {
          incoming.balls[0] = incoming.ball;
        } else {
          incoming.balls = [incoming.ball];
        }
      } else if (Array.isArray(incoming.balls) && incoming.balls.length > 0) {
        incoming.ball = incoming.balls[0];
      }
      state = Object.assign(state, incoming);
      if (!state.ball && (!state.balls || state.balls.length === 0)) {
        resetBall();
      }
      if (!state.bricks) {
        state.bricks = makeBricksForLevel(state.level || 1);
      }
      normalizeState();
      state.paddleX = clamp(state.paddleX, 0, WIDTH - state.paddleWidth);
      updateHud();
      draw();
    },
    setAutoStep: function (enabled) {
      autoStep = Boolean(enabled);
      updateHud();
      draw();
      return publicState();
    },
    advanceFrames: function (frames) {
      var total = Math.max(0, Math.floor(frames));

      for (var i = 0; i < total; i += 1) {
        step(FIXED_DT);
      }

      updateHud();
      draw();
      return publicState();
    },
    restart: function () {
      restart();
      return publicState();
    }
  };

  restart();
  window.__brickbreakerTest.isReady = true;
  window.requestAnimationFrame(frame);
}());
