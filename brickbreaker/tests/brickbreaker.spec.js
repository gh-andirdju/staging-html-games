import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('brickbreaker-help-seen', '1'); } catch {} });
  const runtimeErrors = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      runtimeErrors.push(message.text());
    }
  });

  page.on('pageerror', (error) => {
    runtimeErrors.push(error.message);
  });

  page.__runtimeErrors = runtimeErrors;
});

test.afterEach(async ({ page }) => {
  expect(page.__runtimeErrors).toEqual([]);
});

async function openGame(page) {
  await page.goto('./');
  await page.waitForFunction(() => {
    const api = window.__brickbreakerTest;
    return (
      api &&
      api.isReady === true &&
      (typeof api.getState === 'function' || typeof api.readState === 'function') &&
      typeof api.setState === 'function' &&
      typeof api.advanceFrames === 'function' &&
      typeof api.restart === 'function' &&
      typeof api.setAutoStep === 'function'
    );
  });

  await page.evaluate(() => window.__brickbreakerTest.setAutoStep(false));
  await expect(page.locator('canvas').first()).toBeVisible();
}

async function getState(page) {
  return page.evaluate(() => {
    const api = window.__brickbreakerTest;
    const readState = api.getState ?? api.readState;
    return readState.call(api);
  });
}

async function advanceFrames(page, frames = 1) {
  await page.evaluate(async (frameCount) => {
    await window.__brickbreakerTest.advanceFrames(frameCount);
  }, frames);
}

async function restart(page) {
  await page.evaluate(async () => {
    await window.__brickbreakerTest.restart();
  });
}

async function prepareVisualLayout(page) {
  const state = await getState(page);
  const ball = state.balls?.[0] ?? state.ball ?? {};
  await setState(page, {
    ...state,
    level: 1,
    bricks: null,
    score: 0,
    lives: 3,
    status: 'Playing',
    levelClears: 0,
    pickups: [],
    lasers: [],
    activeEffects: {},
    paddleWidth: 112,
    laserCooldown: 0,
    ball: { ...ball, x: 400, y: 380 }
  });
  await mutateState(page, 'centerPaddle');
  await page.locator('canvas').first().scrollIntoViewIfNeeded();
}

async function setState(page, nextState) {
  await page.evaluate((payload) => {
    window.__brickbreakerTest.setState(payload);
  }, nextState);
}

async function mutateState(page, mutatorName, options = {}) {
  await page.evaluate(
    ({ name, options: mutationOptions }) => {
      const api = window.__brickbreakerTest;
      const readState = api.getState ?? api.readState;
      const clone = structuredClone(readState.call(api));
      const helpers = {
        getBall(state) {
          const ball = state.ball ?? state.balls?.[0];
          if (!ball) throw new Error('Expected test state to expose ball or balls[0].');
          return ball;
        },
        getPaddle(state) {
          const paddle = state.paddle ?? state.player ?? state.bat ?? (typeof state.paddleX === 'number' ? state : undefined);
          if (!paddle) throw new Error('Expected test state to expose paddle, player, or bat.');
          return paddle;
        },
        getBricks(state) {
          const bricks = state.bricks ?? state.level?.bricks;
          if (!Array.isArray(bricks)) throw new Error('Expected test state to expose bricks or level.bricks.');
          return bricks;
        },
        getSize(state) {
          const canvas = document.querySelector('canvas');
          return {
            width: state.width ?? state.canvasWidth ?? state.bounds?.width ?? canvas?.width ?? 800,
            height: state.height ?? state.canvasHeight ?? state.bounds?.height ?? canvas?.height ?? 600
          };
        },
        isBrickAlive(brick) {
          return brick && brick.destroyed !== true && brick.active !== false && brick.visible !== false && brick.hit !== true;
        },
        setBrickDestroyed(brick) {
          if ('destroyed' in brick) brick.destroyed = true;
          else if ('active' in brick) brick.active = false;
          else if ('visible' in brick) brick.visible = false;
          else brick.destroyed = true;

          if ('hit' in brick) brick.hit = true;
          if ('health' in brick) brick.health = 0;
        }
      };

      const mutators = {
        centerPaddle(state) {
          const paddle = helpers.getPaddle(state);
          const { width } = helpers.getSize(state);
          const paddleWidth = paddle.width ?? paddle.w ?? 112;
          if (typeof state.paddleX === 'number' && paddle === state) {
            state.paddleX = width / 2 - paddleWidth / 2;
          } else {
            paddle.x = width / 2 - paddleWidth / 2;
          }
          paddle.dx = 0;
          paddle.velocityX = 0;
        },
        movingBall(state) {
          const ball = helpers.getBall(state);
          const { width, height } = helpers.getSize(state);
          Object.assign(ball, {
            x: width / 2,
            y: height / 2,
            dx: mutationOptions.dx ?? 3,
            dy: mutationOptions.dy ?? -3,
            vx: mutationOptions.dx ?? 3,
            vy: mutationOptions.dy ?? -3,
            velocityX: mutationOptions.dx ?? 3,
            velocityY: mutationOptions.dy ?? -3
          });
        },
        rightWallCollision(state) {
          const ball = helpers.getBall(state);
          const { width, height } = helpers.getSize(state);
          const radius = ball.radius ?? ball.r ?? ball.size ?? 8;
          Object.assign(ball, {
            x: width - radius - 1,
            y: height / 2,
            // Use || (not ??) with a realistic fallback so a parked ball (velocity 0)
            // still gets a true rightward speed that reaches the wall within a few frames.
            dx: Math.abs(ball.dx || ball.velocityX || 240),
            vx: Math.abs(ball.vx || ball.dx || ball.velocityX || 240),
            velocityX: Math.abs(ball.velocityX || ball.dx || 240),
            dy: 0,
            vy: 0,
            velocityY: 0
          });
        },
        brickCollision(state) {
          const ball = helpers.getBall(state);
          const bricks = helpers.getBricks(state);
          const brick = bricks.find(helpers.isBrickAlive);
          if (!brick) throw new Error('Expected at least one live brick for collision testing.');
          const width = brick.width ?? brick.w ?? 50;
          const height = brick.height ?? brick.h ?? 20;
          Object.assign(ball, {
            x: brick.x + width / 2,
            y: brick.y + height / 2,
            dx: 0,
            vx: 0,
            velocityX: 0,
            dy: -4,
            vy: -4,
            velocityY: -4
          });
        },
        missedBall(state) {
          const ball = helpers.getBall(state);
          const { width, height } = helpers.getSize(state);
          state.lives = mutationOptions.lives ?? state.lives ?? 2;
          Object.assign(ball, {
            x: width / 2,
            y: height + (ball.radius ?? ball.r ?? 10) + 4,
            dx: 0,
            vx: 0,
            velocityX: 0,
            dy: 4,
            vy: 4,
            velocityY: 4
          });
        },
        oneBrickRemaining(state) {
          const ball = helpers.getBall(state);
          const bricks = helpers.getBricks(state);
          const liveBricks = bricks.filter(helpers.isBrickAlive);
          if (liveBricks.length === 0) throw new Error('Expected at least one live brick for win testing.');

          for (const brick of bricks) {
            if (brick !== liveBricks[0]) helpers.setBrickDestroyed(brick);
          }

          const lastBrick = liveBricks[0];
          // Ensure the single survivor clears in one hit regardless of level (armored
          // bricks otherwise need multiple hits), so a single contact advances the level.
          if ('hp' in lastBrick) lastBrick.hp = 1;
          if ('maxHp' in lastBrick) lastBrick.maxHp = 1;
          const width = lastBrick.width ?? lastBrick.w ?? 50;
          const height = lastBrick.height ?? lastBrick.h ?? 20;
          Object.assign(ball, {
            x: lastBrick.x + width / 2,
            y: lastBrick.y + height / 2,
            dx: 0,
            vx: 0,
            velocityX: 0,
            dy: -4,
            vy: -4,
            velocityY: -4
          });
        },
        forcedGameOver(state) {
          state.lives = 1;
          state.gameOver = false;
          state.status = state.status === 'Game Over' || state.status === 'gameOver' ? 'Playing' : state.status;
          mutators.missedBall(state);
        },
        powerUpBrickCollision(state) {
          const ball = helpers.getBall(state);
          const bricks = helpers.getBricks(state);
          const brick = bricks.find(helpers.isBrickAlive);
          if (!brick) throw new Error('Expected at least one live brick for power-up collision testing.');

          const type = mutationOptions.type ?? 'wide';
          const width = brick.width ?? brick.w ?? 50;
          const height = brick.height ?? brick.h ?? 20;

          brick.active = true;
          brick.destroyed = false;
          brick.visible = true;
          brick.hit = false;
          brick.health = Math.max(1, brick.health ?? 1);
          brick.powerUp = type;
          brick.powerup = type;
          brick.powerUpType = type;
          brick.powerupType = type;
          brick.bonus = type;
          brick.drop = type;

          Object.assign(ball, {
            x: brick.x + width / 2,
            y: brick.y + height / 2,
            dx: 0,
            vx: 0,
            velocityX: 0,
            dy: -4,
            vy: -4,
            velocityY: -4
          });
        },
        catchPowerUp(state) {
          const type = mutationOptions.type ?? 'wide';
          const paddle = helpers.getPaddle(state);
          const { width, height } = helpers.getSize(state);
          const paddleWidth = paddle.width ?? paddle.w ?? 112;
          const paddleHeight = paddle.height ?? paddle.h ?? 14;
          const paddleY = paddle.y ?? height - 36;
          const paddleX = width / 2 - paddleWidth / 2;

          if (typeof state.paddleX === 'number' && paddle === state) {
            state.paddleX = paddleX;
          } else {
            paddle.x = paddleX;
          }

          const pickup = {
            id: `test-${type}`,
            type,
            powerUp: type,
            powerup: type,
            powerUpType: type,
            powerupType: type,
            x: paddleX + paddleWidth / 2,
            y: paddleY + paddleHeight / 2,
            width: 18,
            height: 18,
            radius: 9,
            dy: 180,
            vy: 180,
            velocityY: 180,
            speed: 180,
            active: true
          };

          const pickupKeys = ['pickups', 'powerUps', 'powerups', 'fallingPowerUps', 'drops'];
          const existingKey = pickupKeys.find((key) => Array.isArray(state[key]));
          state[existingKey ?? 'pickups'] = [pickup];
        },
        laserReady(state) {
          mutators.catchPowerUp(state);
          const bricks = helpers.getBricks(state);
          const { width } = helpers.getSize(state);
          const target = bricks.find(helpers.isBrickAlive) ?? bricks[0];
          if (!target) throw new Error('Expected at least one brick for laser testing.');
          const targetWidth = target.width ?? target.w ?? 50;

          target.x = width / 2 - targetWidth / 2;
          target.y = mutationOptions.targetY ?? 92;
          target.active = true;
          target.destroyed = false;
          target.visible = true;
          target.hit = false;
          target.health = Math.max(1, target.health ?? 1);
        },
        paddleBounce(state) {
          const ball = helpers.getBall(state);
          const paddle = helpers.getPaddle(state);
          const { width, height } = helpers.getSize(state);
          const hit = mutationOptions.hit ?? 'center';
          const hitRatioByType = {
            left: -0.75,
            center: 0,
            right: 0.75
          };
          const hitRatio = hitRatioByType[hit];

          if (typeof hitRatio !== 'number') {
            throw new Error(`Unknown paddleBounce hit target: ${hit}`);
          }

          if (mutationOptions.wide) {
            state.activeEffects = state.activeEffects && typeof state.activeEffects === 'object' ? state.activeEffects : {};
            state.activeEffects.wide = Math.max(state.activeEffects.wide ?? 0, 60);
            state.paddleWidth = mutationOptions.paddleWidth ?? 164;
          }

          const paddleWidth = state.paddleWidth ?? paddle.width ?? paddle.w ?? 112;
          const paddleHeight = paddle.height ?? paddle.h ?? 14;
          const paddleY = paddle.y ?? height - 36;
          const paddleX = width / 2 - paddleWidth / 2;
          const radius = ball.radius ?? ball.r ?? ball.size ?? 8;
          const targetX = paddleX + paddleWidth / 2 + (paddleWidth / 2) * hitRatio;

          if (typeof state.paddleX === 'number' && paddle === state) {
            state.paddleX = paddleX;
          } else {
            paddle.x = paddleX;
          }

          Object.assign(ball, {
            x: targetX,
            y: paddleY - radius - Math.max(1, paddleHeight * 0.1),
            dx: mutationOptions.dx ?? 0,
            vx: mutationOptions.dx ?? 0,
            velocityX: mutationOptions.dx ?? 0,
            dy: Math.abs(mutationOptions.dy ?? 260),
            vy: Math.abs(mutationOptions.dy ?? 260),
            velocityY: Math.abs(mutationOptions.dy ?? 260)
          });
        }
      };

      if (!mutators[name]) throw new Error(`Unknown state mutator: ${name}`);
      mutators[name](clone);
      api.setState(clone);
    },
    { name: mutatorName, options }
  );
}

function ballPosition(state) {
  const ball = state.ball ?? state.balls?.[0];
  return { x: ball?.x, y: ball?.y };
}

function ballHorizontalVelocity(state) {
  const ball = state.ball ?? state.balls?.[0] ?? {};
  return ball.dx ?? ball.velocityX ?? ball.vx;
}

function balls(state) {
  if (Array.isArray(state.balls)) return state.balls;
  return state.ball ? [state.ball] : [];
}

function ballSpeed(state) {
  const ball = balls(state)[0] ?? {};
  const xVelocity = ball.dx ?? ball.velocityX ?? ball.vx ?? 0;
  const yVelocity = ball.dy ?? ball.velocityY ?? ball.vy ?? 0;
  return Math.hypot(xVelocity, yVelocity);
}

function paddleX(state) {
  const paddle = state.paddle ?? state.player ?? state.bat;
  return paddle?.x ?? state.paddleX;
}

function paddleWidth(state) {
  const paddle = state.paddle ?? state.player ?? state.bat;
  return paddle?.width ?? paddle?.w ?? state.paddleWidth;
}

function liveBrickCount(state) {
  const bricks = state.bricks ?? state.level?.bricks ?? [];
  return bricks.filter(
    (brick) =>
      brick.destroyed !== true &&
      brick.active !== false &&
      brick.visible !== false &&
      brick.hit !== true &&
      brick.health !== 0
  ).length;
}

function lives(state) {
  return state.lives ?? state.lifeCount ?? state.playerLives;
}

function isGameOver(state) {
  return state.gameOver === true || state.status === 'Game Over' || state.status === 'gameOver' || state.phase === 'gameOver';
}

function isWon(state) {
  return state.won === true || state.win === true || state.gameWon === true || state.status === 'You Win' || state.status === 'won' || state.phase === 'won';
}

function levelNumber(state) {
  const raw =
    state.levelNumber ??
    state.levelIndex ??
    state.currentLevel ??
    state.stage ??
    (typeof state.level === 'number' ? state.level : state.level?.number ?? state.level?.index);

  return typeof raw === 'number' ? raw : 1;
}

function powerUpType(entity) {
  return entity?.powerUpType ?? entity?.powerupType ?? entity?.powerUp ?? entity?.powerup ?? entity?.bonus ?? entity?.drop ?? entity?.type;
}

function powerUpBricks(state) {
  const bricks = state.bricks ?? state.level?.bricks ?? [];
  return bricks.filter((brick) => powerUpType(brick));
}

function brickLayoutSignature(state) {
  const bricks = state.bricks ?? state.level?.bricks ?? [];
  return bricks
    .filter((brick) => brick.active !== false)
    .map((brick) => ({
      x: brick.x,
      y: brick.y,
      width: brick.width,
      height: brick.height,
      row: brick.row,
      col: brick.col,
      type: powerUpType(brick)
    }));
}

function pickups(state) {
  return ['pickups', 'fallingPowerUps', 'drops', 'powerUps', 'powerups']
    .flatMap((key) => (Array.isArray(state[key]) ? state[key] : []))
    .filter((pickup) => pickup && pickup.active !== false && pickup.collected !== true && pickup.caught !== true);
}

function activePowerUpTypes(state) {
  const containers = [
    state.activeEffects,
    state.activePowerUps,
    state.activePowerups,
    state.effects,
    state.powerUpEffects,
    state.powerupsActive
  ];
  const types = new Set();

  for (const container of containers) {
    if (!container) continue;
    if (Array.isArray(container)) {
      for (const item of container) {
        const type = typeof item === 'string' ? item : powerUpType(item);
        if (type) types.add(type);
      }
    } else if (typeof container === 'object') {
      for (const [key, value] of Object.entries(container)) {
        if (value) types.add(key);
      }
    }
  }

  return types;
}

function activeEffectTimers(state) {
  const containers = [
    state.activeEffects,
    state.activePowerUps,
    state.activePowerups,
    state.effects,
    state.powerUpEffects,
    state.powerupsActive
  ];
  const timers = {};

  for (const container of containers) {
    if (!container || typeof container !== 'object' || Array.isArray(container)) continue;
    for (const [key, value] of Object.entries(container)) {
      if (typeof value === 'number' && value > 0) timers[key] = value;
    }
  }

  return timers;
}

async function readHudText(page) {
  return page.locator('.hud').first().textContent().then((text) => (text ?? '').toLowerCase());
}

async function moveFirstPickupOverPaddle(page) {
  await page.evaluate(() => {
    const api = window.__brickbreakerTest;
    const readState = api.getState ?? api.readState;
    const clone = structuredClone(readState.call(api));
    const paddle = clone.paddle ?? clone.player ?? clone.bat ?? {};
    const paddleWidth = paddle.width ?? paddle.w ?? clone.paddleWidth ?? 112;
    const paddleHeight = paddle.height ?? paddle.h ?? 14;
    const paddleX = paddle.x ?? clone.paddleX ?? 0;
    const paddleY = paddle.y ?? clone.height - 36;
    const pickupKeys = ['pickups', 'fallingPowerUps', 'drops', 'powerUps', 'powerups'];

    for (const key of pickupKeys) {
      if (!Array.isArray(clone[key]) || clone[key].length === 0) continue;
      const pickup = clone[key].find((candidate) => candidate && candidate.active !== false) ?? clone[key][0];
      pickup.x = paddleX + paddleWidth / 2;
      pickup.y = paddleY + paddleHeight / 2;
      pickup.dy = Math.abs(pickup.dy ?? pickup.vy ?? pickup.velocityY ?? pickup.speed ?? 180);
      pickup.vy = pickup.dy;
      pickup.velocityY = pickup.dy;
      pickup.active = true;
      break;
    }

    api.setState(clone);
  });
}

async function runPaddleBounceScenario(page, options) {
  await mutateState(page, 'paddleBounce', options);
  const before = await getState(page);
  await advanceFrames(page, 2);
  const after = await getState(page);
  return { before, after };
}

test('renders the game and exposes the test control contract', async ({ page }) => {
  await openGame(page);

  await expect
    .poll(async () => {
      await page.evaluate(() => window.__brickbreakerTest.advanceFrames(0));

      return page.locator('canvas').evaluate((canvas) => {
        const context = canvas.getContext('2d');
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let count = 0;

        for (let index = 0; index < pixels.length; index += 4) {
          if (pixels[index] !== 0 || pixels[index + 1] !== 0 || pixels[index + 2] !== 0 || pixels[index + 3] !== 0) {
            count += 1;
          }
        }

        return count;
      });
    })
    .toBeGreaterThan(1000);

  const state = await getState(page);
  expect(ballPosition(state).x).toEqual(expect.any(Number));
  expect(ballPosition(state).y).toEqual(expect.any(Number));
  expect(paddleX(state)).toEqual(expect.any(Number));
  expect(liveBrickCount(state)).toBeGreaterThan(0);
});

test('moves the paddle with keyboard controls', async ({ page }) => {
  await openGame(page);
  await mutateState(page, 'centerPaddle');
  const startX = paddleX(await getState(page));

  await page.keyboard.down('ArrowRight');
  await advanceFrames(page, 8);
  await page.keyboard.up('ArrowRight');
  const rightX = paddleX(await getState(page));
  expect(rightX).toBeGreaterThan(startX);

  await page.keyboard.down('ArrowLeft');
  await advanceFrames(page, 16);
  await page.keyboard.up('ArrowLeft');
  expect(paddleX(await getState(page))).toBeLessThan(rightX);
});

test('pressing R restarts the game', async ({ page }) => {
  await openGame(page);
  await setState(page, { score: 250, lives: 1, level: 3 });

  await page.keyboard.press('r');

  const state = await getState(page);
  expect(state.score).toBe(0);
  expect(lives(state)).toBe(3);
  expect(levelNumber(state)).toBe(1);
});

test('pressing P pauses and freezes ball movement and power-up timers', async ({ page }) => {
  await openGame(page);
  await mutateState(page, 'movingBall');
  await setState(page, { activeEffects: { slow: 300 } });

  await page.keyboard.press('p');
  let state = await getState(page);
  expect(state.paused).toBe(true);
  await expect(page.locator('#status')).toHaveText('Paused');

  const before = await getState(page);
  await advanceFrames(page, 10);
  state = await getState(page);
  expect(ballPosition(state)).toEqual(ballPosition(before));
  expect(state.activeEffects.slow).toBe(300);
});

test('the canvas exposes a live accessible description of game state', async ({ page }) => {
  await openGame(page);
  await setState(page, { score: 555, lives: 2, level: 4 });
  const label = await page.evaluate(() => document.getElementById('game').getAttribute('aria-label'));
  expect(label).toContain('Level 4');
  expect(label).toContain('2 lives');
  expect(label).toContain('score 555');

  await setState(page, { status: 'Game Over', score: 555, level: 4 });
  const overLabel = await page.evaluate(() => document.getElementById('game').getAttribute('aria-label'));
  expect(overLabel.toLowerCase()).toContain('game over');
});

test('the status region is an aria-live polite region that announces state changes', async ({ page }) => {
  await openGame(page);
  const wrap = page.locator('.status-wrap');
  await expect(wrap).toHaveAttribute('role', 'status');
  await expect(wrap).toHaveAttribute('aria-live', 'polite');

  // Pausing updates the announced text inside the live region.
  await page.keyboard.press('p');
  await expect(page.locator('#status')).toHaveText('Paused');
});

test('auto-pauses an in-progress game when the window loses focus', async ({ page }) => {
  await openGame(page);
  expect((await getState(page)).paused).toBe(false);

  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect((await getState(page)).paused).toBe(true);

  // Refocus does not auto-resume.
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  expect((await getState(page)).paused).toBe(true);
});

test('auto-pauses an in-progress game when the tab is hidden', async ({ page }) => {
  await openGame(page);
  let state = await getState(page);
  expect(state.paused).toBe(false);

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  state = await getState(page);
  expect(state.paused).toBe(true);

  // Returning to the tab does NOT auto-resume — the player resumes deliberately.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  state = await getState(page);
  expect(state.paused).toBe(true);
});

test('pressing P again resumes the simulation', async ({ page }) => {
  await openGame(page);
  await mutateState(page, 'movingBall');

  await page.keyboard.press('p');
  const before = await getState(page);

  await page.keyboard.press('p');
  let state = await getState(page);
  expect(state.paused).toBe(false);

  await advanceFrames(page, 10);
  state = await getState(page);
  expect(ballPosition(state)).not.toEqual(ballPosition(before));
});

test('keyboard and pointer paddle input is ignored while paused', async ({ page }) => {
  await openGame(page);
  await mutateState(page, 'centerPaddle');
  const startX = paddleX(await getState(page));

  await page.keyboard.press('p');

  await page.keyboard.down('ArrowRight');
  await advanceFrames(page, 8);
  await page.keyboard.up('ArrowRight');
  expect(paddleX(await getState(page))).toBe(startX);

  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.8);
  expect(paddleX(await getState(page))).toBe(startX);
});

test('pause button toggles pause and flips its label', async ({ page }) => {
  await openGame(page);
  const pauseBtn = page.locator('#pause');
  await expect(pauseBtn).toHaveText('Pause');
  await expect(pauseBtn).toHaveAttribute('aria-pressed', 'false');

  await pauseBtn.click();
  let state = await getState(page);
  expect(state.paused).toBe(true);
  await expect(pauseBtn).toHaveText('Resume');
  await expect(pauseBtn).toHaveAttribute('aria-pressed', 'true');

  await pauseBtn.click();
  state = await getState(page);
  expect(state.paused).toBe(false);
  await expect(pauseBtn).toHaveText('Pause');
  await expect(pauseBtn).toHaveAttribute('aria-pressed', 'false');
});

test('pressing R while paused restarts the game unpaused', async ({ page }) => {
  await openGame(page);
  await setState(page, { score: 250, lives: 1, level: 3 });

  await page.keyboard.press('p');
  let state = await getState(page);
  expect(state.paused).toBe(true);

  await page.keyboard.press('r');
  state = await getState(page);
  expect(state.paused).toBe(false);
  expect(state.score).toBe(0);
  expect(lives(state)).toBe(3);
  expect(levelNumber(state)).toBe(1);

  // A fresh life starts with the ball parked for serve; launch it, then it moves.
  await page.evaluate(() => window.__brickbreakerTest.launchBall());
  const before = await getState(page);
  await advanceFrames(page, 10);
  state = await getState(page);
  expect(ballPosition(state)).not.toEqual(ballPosition(before));
});

test('moves the paddle with desktop pointer control', async ({ page }) => {
  await openGame(page);
  await mutateState(page, 'centerPaddle');

  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.8);
  const movedRight = paddleX(await getState(page));

  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.8);
  expect(paddleX(await getState(page))).toBeLessThan(movedRight);
});

test('keeps the stacked touch layout on desktop widths', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await openGame(page);

  const controlsBox = await page.locator('.touch-controls').boundingBox();
  const laneBox = await page.locator('#paddle-drag-lane').boundingBox();
  const restartBox = await page.locator('#restart').boundingBox();

  expect(controlsBox).not.toBeNull();
  expect(laneBox).not.toBeNull();
  expect(restartBox).not.toBeNull();
  expect(laneBox.x).toBeLessThanOrEqual(controlsBox.x + 1);
  expect(laneBox.width).toBeGreaterThanOrEqual(controlsBox.width - 2);
  expect(restartBox.y).toBeGreaterThanOrEqual(laneBox.y + laneBox.height);
  expect(restartBox.width).toBeLessThan(laneBox.width * 0.5);
});

test('matches the desktop layout baseline', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await openGame(page);
  await prepareVisualLayout(page);

  await expect(page).toHaveScreenshot('brickbreaker-desktop-layout.png', {
    animations: 'disabled',
    fullPage: false,
    maxDiffPixels: 10
  });
});

test('advances ball movement across frames', async ({ page }) => {
  await openGame(page);
  await mutateState(page, 'movingBall');
  const start = ballPosition(await getState(page));

  await advanceFrames(page, 12);

  expect(ballPosition(await getState(page))).not.toEqual(start);
});

test('bounces the ball on wall collision', async ({ page }) => {
  await openGame(page);
  await mutateState(page, 'rightWallCollision');
  expect(ballHorizontalVelocity(await getState(page))).toBeGreaterThan(0);

  await advanceFrames(page, 4);

  expect(ballHorizontalVelocity(await getState(page))).toBeLessThan(0);
});

test('uses deterministic paddle bounce direction for left/right/center hits, including wide paddle', async ({ page }) => {
  await openGame(page);

  const left = await runPaddleBounceScenario(page, { hit: 'left' });
  expect(ballHorizontalVelocity(left.after)).toBeLessThan(0);

  const right = await runPaddleBounceScenario(page, { hit: 'right' });
  expect(ballHorizontalVelocity(right.after)).toBeGreaterThan(0);

  const center = await runPaddleBounceScenario(page, { hit: 'center' });
  expect(Math.abs(ballHorizontalVelocity(center.after))).toBeLessThan(10);

  const wideRight = await runPaddleBounceScenario(page, { hit: 'right', wide: true });
  expect(paddleWidth(wideRight.after)).toBeGreaterThan(paddleWidth(right.after));
  expect(ballHorizontalVelocity(wideRight.after)).toBeGreaterThan(0);
  expect(Math.abs(ballHorizontalVelocity(wideRight.after))).toBeGreaterThan(40);
});

test('removes a brick or updates score on brick collision', async ({ page }) => {
  await openGame(page);
  await mutateState(page, 'brickCollision');
  const before = await getState(page);

  await advanceFrames(page, 6);
  const after = await getState(page);

  expect(liveBrickCount(after) < liveBrickCount(before) || (after.score ?? 0) > (before.score ?? 0)).toBe(true);
});

test('breaking a brick emits haptic feedback, and the toggle suppresses it', async ({ page }) => {
  await openGame(page);
  expect(await page.evaluate(() => window.__brickbreakerTest.getHaptics())).toBe(true);
  await page.evaluate(() => {
    window.__vibes = [];
    navigator.vibrate = (pattern) => { window.__vibes.push(pattern); return true; };
  });

  await mutateState(page, 'brickCollision');
  await advanceFrames(page, 3);
  expect(await page.evaluate(() => window.__vibes.filter((v) => v !== 0).length)).toBeGreaterThan(0);

  // Disabling haptics suppresses further vibration and persists.
  await page.evaluate(() => {
    window.__vibes = [];
    window.__brickbreakerTest.setHaptics(false);
  });
  expect(await page.evaluate(() => window.localStorage.getItem('brickbreaker-haptics'))).toBe('0');
  await mutateState(page, 'brickCollision');
  await advanceFrames(page, 3);
  expect(await page.evaluate(() => window.__vibes.filter((v) => v !== 0).length)).toBe(0);
});

test('tracks bricks broken and best combo for the game-over stats line', async ({ page }) => {
  await openGame(page);
  expect(await page.evaluate(() => window.__brickbreakerTest.getState().bricksBroken ?? 0)).toBe(0);

  // Break three bricks in a row.
  for (let i = 0; i < 3; i += 1) {
    await mutateState(page, 'brickCollision');
    await advanceFrames(page, 2);
  }
  const s = await getState(page);
  expect(s.bricksBroken).toBe(3);
  expect(s.bestCombo).toBeGreaterThanOrEqual(3);

  // A restart resets the run stats.
  await restart(page);
  expect(await page.evaluate(() => window.__brickbreakerTest.getState().bricksBroken ?? 0)).toBe(0);
});

test('the start-zone selector begins a new run at the chosen zone and persists', async ({ page }) => {
  await openGame(page);
  expect(await page.evaluate(() => window.__brickbreakerTest.getStartZone())).toBe(1);

  // Choose zone 4 via the hook — the game restarts at level 4.
  await page.evaluate(() => window.__brickbreakerTest.setStartZone(4));
  let s = await getState(page);
  expect(s.level).toBe(4);
  expect(await page.evaluate(() => window.__brickbreakerTest.getStartZone())).toBe(4);
  expect(await page.evaluate(() => window.localStorage.getItem('brickbreaker-start-zone'))).toBe('4');

  // A plain restart keeps the chosen start zone.
  await restart(page);
  expect((await getState(page)).level).toBe(4);

  // Persists across reload, and the select reflects it.
  await page.reload();
  await page.waitForFunction(() => window.__brickbreakerTest && window.__brickbreakerTest.isReady === true);
  expect(await page.evaluate(() => window.__brickbreakerTest.getStartZone())).toBe(4);
  expect(await page.evaluate(() => document.getElementById('start-zone').value)).toBe('4');

  // Out-of-range values clamp to 1..10.
  await page.evaluate(() => window.__brickbreakerTest.setStartZone(99));
  expect(await page.evaluate(() => window.__brickbreakerTest.getStartZone())).toBe(10);
});

test('the accent swatches re-theme the UI and persist across reloads', async ({ page }) => {
  await openGame(page);
  // Default accent is amber.
  const initial = await page.evaluate(() => window.__brickbreakerTest.getAccent());
  expect(initial.toLowerCase()).toBe('#f59e0b');

  // Click the cyan swatch (it lives in the hidden help panel, so click it in-page).
  await page.evaluate(() => document.querySelector('.swatch[data-accent="#34d2e8"]').click());
  expect((await page.evaluate(() => window.__brickbreakerTest.getAccent())).toLowerCase()).toBe('#34d2e8');
  expect(await page.evaluate(() => window.localStorage.getItem('brickbreaker-accent'))).toBe('#34d2e8');
  // The pressed swatch is reflected for a11y.
  expect(await page.evaluate(() => document.querySelector('.swatch[data-accent="#34d2e8"]').getAttribute('aria-pressed'))).toBe('true');

  // Persists across reload.
  await page.reload();
  await page.waitForFunction(() => window.__brickbreakerTest && window.__brickbreakerTest.isReady === true);
  expect((await page.evaluate(() => window.__brickbreakerTest.getAccent())).toLowerCase()).toBe('#34d2e8');

  // An unknown accent falls back to the default.
  await page.evaluate(() => window.__brickbreakerTest.setAccent('#123456'));
  expect((await page.evaluate(() => window.__brickbreakerTest.getAccent())).toLowerCase()).toBe('#f59e0b');
});

test('the help-panel vibration toggle controls and persists haptics', async ({ page }) => {
  await openGame(page);
  expect(await page.evaluate(() => document.getElementById('haptics-toggle')?.checked)).toBe(true);
  expect(await page.evaluate(() => window.__brickbreakerTest.getHaptics())).toBe(true);

  // Unchecking the toggle disables haptics and persists the choice.
  await page.evaluate(() => {
    const toggle = document.getElementById('haptics-toggle');
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
  });
  expect(await page.evaluate(() => window.__brickbreakerTest.getHaptics())).toBe(false);
  expect(await page.evaluate(() => window.localStorage.getItem('brickbreaker-haptics'))).toBe('0');

  // The hook keeps the checkbox in sync.
  await page.evaluate(() => window.__brickbreakerTest.setHaptics(true));
  expect(await page.evaluate(() => document.getElementById('haptics-toggle')?.checked)).toBe(true);
  expect(await page.evaluate(() => window.localStorage.getItem('brickbreaker-haptics'))).toBe('1');
});

test('combo builds across consecutive brick breaks and scales the score', async ({ page }) => {
  await openGame(page);

  // Break four bricks in a single volley (no paddle touch between) by repeatedly
  // parking the ball on the next live brick.
  const combos = [];
  const scores = [];
  for (let i = 0; i < 4; i += 1) {
    await mutateState(page, 'brickCollision');
    await advanceFrames(page, 2);
    const s = await getState(page);
    combos.push(s.combo);
    scores.push(s.score);
  }

  expect(combos).toEqual([1, 2, 3, 4]);
  // First three bricks score at x1 (10 each); the fourth crosses into the x2 tier (+20).
  expect(scores).toEqual([10, 20, 30, 50]);

  const final = await getState(page);
  expect(final.comboMultiplier).toBe(2);
  expect(final.bestCombo).toBeGreaterThanOrEqual(4);
});

test('a paddle bounce resets the combo chain', async ({ page }) => {
  await openGame(page);

  await mutateState(page, 'brickCollision');
  await advanceFrames(page, 2);
  expect((await getState(page)).combo).toBe(1);

  await mutateState(page, 'paddleBounce');
  await advanceFrames(page, 4);
  expect((await getState(page)).combo).toBe(0);
});

test('losing a life resets the combo chain', async ({ page }) => {
  await openGame(page);

  await mutateState(page, 'brickCollision');
  await advanceFrames(page, 2);
  expect((await getState(page)).combo).toBe(1);

  await mutateState(page, 'missedBall', { lives: 2 });
  await advanceFrames(page, 8);
  expect((await getState(page)).combo).toBe(0);
});

test('armored bricks take multiple hits and only score the combo on destruction', async ({ page }) => {
  await openGame(page);
  // One armored brick (target) plus a far-away filler so destroying the target does
  // not clear the level (which would advance and regenerate bricks).
  await setState(page, {
    score: 0,
    combo: 0,
    bestCombo: 0,
    bricks: [
      { x: 380, y: 120, width: 60, height: 20, active: true, row: 0, col: 0, hp: 2, maxHp: 2, powerUp: null, powerUpType: null },
      { x: 40, y: 320, width: 60, height: 20, active: true, row: 4, col: 0, hp: 1, maxHp: 1, powerUp: null, powerUpType: null }
    ]
  });

  // First hit chips the armor but leaves the brick standing.
  await mutateState(page, 'brickCollision');
  await advanceFrames(page, 3);
  let s = await getState(page);
  expect(s.bricks[0].active).not.toBe(false);
  expect(s.bricks[0].hp).toBe(1);
  expect(s.combo).toBe(0);   // combo only counts destroyed bricks
  expect(s.score).toBe(5);   // chip-damage points only

  // Second hit destroys it: combo advances and full points land.
  await mutateState(page, 'brickCollision');
  await advanceFrames(page, 3);
  s = await getState(page);
  expect(s.bricks[0].active).toBe(false);
  expect(s.combo).toBe(1);
  expect(s.score).toBe(15);  // 5 chip + 10 destroy
  expect(liveBrickCount(s)).toBe(1); // the filler brick remains
});

test('higher levels introduce armored (multi-hit) bricks', async ({ page }) => {
  await openGame(page);
  // Passing bricks:null makes the engine regenerate the layout for the given level.
  await setState(page, { level: 2, bricks: null });
  const s = await getState(page);
  const armored = s.bricks.filter((brick) => (brick.maxHp || 1) > 1);
  expect(armored.length).toBeGreaterThan(0);
  expect(s.bricks.every((brick) => (brick.hp || 1) >= 1)).toBe(true);
});

test('destroying a brick spawns debris particles that decay away', async ({ page }) => {
  await openGame(page);

  await mutateState(page, 'brickCollision');
  await advanceFrames(page, 2);
  let s = await getState(page);
  expect((s.particles || []).length).toBeGreaterThan(0);

  // Inject a clean decay scenario: a stationary ball (no further collisions) and a
  // short-lived particle, then advance past its lifetime.
  await setState(page, {
    particles: [{ x: 200, y: 200, dx: 0, dy: 0, life: 8, maxLife: 8, size: 3, color: '#ffffff' }],
    ball: { x: 400, y: 300, dx: 0, dy: 0, radius: 8 }
  });
  await advanceFrames(page, 12);
  s = await getState(page);
  expect((s.particles || []).length).toBe(0);
});

test('respects reduced motion — no debris particles', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGame(page);

  await mutateState(page, 'brickCollision');
  await advanceFrames(page, 2);
  const s = await getState(page);
  expect((s.particles || []).length).toBe(0);
});

test('loses a life when the ball falls below the paddle', async ({ page }) => {
  await openGame(page);
  await mutateState(page, 'missedBall', { lives: 2 });
  const beforeLives = lives(await getState(page));

  await advanceFrames(page, 8);

  expect(lives(await getState(page))).toBeLessThan(beforeLives);
});

test('enters game over when the final life is lost', async ({ page }) => {
  await openGame(page);
  await mutateState(page, 'forcedGameOver');

  await advanceFrames(page, 8);

  expect(isGameOver(await getState(page))).toBe(true);
});

test('increments level and regenerates bricks when the final brick is cleared while score/lives persist', async ({ page }) => {
  await openGame(page);
  const before = await getState(page);
  const beforeLevel = levelNumber(before);
  const beforeLives = lives(before);
  const beforeScore = before.score ?? 0;
  await mutateState(page, 'oneBrickRemaining');

  await advanceFrames(page, 8);
  const after = await getState(page);

  expect(levelNumber(after)).toBeGreaterThan(beforeLevel);
  expect(liveBrickCount(after)).toBeGreaterThan(0);
  expect((after.score ?? 0)).toBeGreaterThan(beforeScore);
  expect(lives(after)).toBe(beforeLives);
  expect(isWon(after)).toBe(false);
});

test('restart resets terminal state and restores playable state', async ({ page }) => {
  await openGame(page);
  await mutateState(page, 'forcedGameOver');
  await advanceFrames(page, 8);
  expect(isGameOver(await getState(page))).toBe(true);

  await page.getByRole('button', { name: 'Restart' }).click();
  const state = await getState(page);

  expect(isGameOver(state)).toBe(false);
  expect(lives(state)).toBeGreaterThan(0);
  expect(liveBrickCount(state)).toBeGreaterThan(0);
});

test('multiple brick clears continue progression without terminal win', async ({ page }) => {
  await openGame(page);
  const start = await getState(page);
  const startLevel = levelNumber(start);
  const startLives = lives(start);
  const clears = 3;

  for (let clear = 0; clear < clears; clear += 1) {
    await mutateState(page, 'oneBrickRemaining');
    await advanceFrames(page, 8);
    const state = await getState(page);
    expect(liveBrickCount(state)).toBeGreaterThan(0);
    expect(isWon(state)).toBe(false);
    expect(isGameOver(state)).toBe(false);
  }

  const finalState = await getState(page);
  expect(levelNumber(finalState)).toBeGreaterThanOrEqual(startLevel + clears);
  expect(lives(finalState)).toBe(startLives);
});

test('lays out arcade power-up bricks deterministically across restarts', async ({ page }) => {
  await openGame(page);

  const firstLayout = powerUpBricks(await getState(page)).map((brick) => ({
    x: brick.x,
    y: brick.y,
    type: powerUpType(brick)
  }));

  await restart(page);
  const secondLayout = powerUpBricks(await getState(page)).map((brick) => ({
    x: brick.x,
    y: brick.y,
    type: powerUpType(brick)
  }));

  expect(firstLayout.length).toBeGreaterThan(0);
  expect(secondLayout).toEqual(firstLayout);
});

test('regenerates the same deterministic layout for the same level seed', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);

  state.level = 6;
  state.bricks = null;
  await page.evaluate((payload) => {
    window.__brickbreakerTest.setState(payload);
  }, state);
  const firstLevel = await getState(page);
  const firstLayout = brickLayoutSignature(firstLevel);

  const duplicate = structuredClone(firstLevel);
  duplicate.bricks = null;
  await page.evaluate((payload) => {
    window.__brickbreakerTest.setState(payload);
  }, duplicate);
  const secondLevel = await getState(page);
  const secondLayout = brickLayoutSignature(secondLevel);

  expect(firstLayout.length).toBeGreaterThan(0);
  expect(secondLayout).toEqual(firstLayout);
});

test('higher levels produce denser or more advanced brick fields', async ({ page }) => {
  await openGame(page);
  const levelOne = brickLayoutSignature(await getState(page));
  const state = await getState(page);

  state.level = 8;
  state.bricks = null;
  await page.evaluate((payload) => {
    window.__brickbreakerTest.setState(payload);
  }, state);
  const higher = brickLayoutSignature(await getState(page));

  expect(higher.length).toBeGreaterThan(levelOne.length);
  expect(higher.some((brick) => brick.row >= 5)).toBe(true);
});

test('spawns falling pickup from a power-up brick and catches it with the paddle', async ({ page }) => {
  await openGame(page);
  await mutateState(page, 'powerUpBrickCollision', { type: 'wide' });

  await advanceFrames(page, 2);
  const spawned = pickups(await getState(page));
  expect(spawned.length).toBeGreaterThan(0);
  expect(spawned.some((pickup) => powerUpType(pickup) === 'wide')).toBe(true);

  const startY = spawned[0].y;
  await advanceFrames(page, 10);
  expect(pickups(await getState(page))[0].y).toBeGreaterThan(startY);

  await moveFirstPickupOverPaddle(page);
  const beforeCatch = await getState(page);
  await advanceFrames(page, 4);
  const afterCatch = await getState(page);

  expect(pickups(afterCatch).length).toBeLessThan(pickups(beforeCatch).length);
  expect(paddleWidth(afterCatch)).toBeGreaterThan(paddleWidth(beforeCatch));
});

test('wide paddle pickup expands the paddle', async ({ page }) => {
  await openGame(page);
  const before = await getState(page);

  await mutateState(page, 'catchPowerUp', { type: 'wide' });
  await advanceFrames(page, 4);

  expect(paddleWidth(await getState(page))).toBeGreaterThan(paddleWidth(before));
});

test('slow ball pickup reduces ball speed', async ({ page }) => {
  await openGame(page);
  await mutateState(page, 'movingBall', { dx: 210, dy: -260 });
  const beforeStart = ballPosition(await getState(page));
  await advanceFrames(page, 10);
  const beforeEnd = ballPosition(await getState(page));
  const beforeDistance = Math.hypot(beforeEnd.x - beforeStart.x, beforeEnd.y - beforeStart.y);

  await mutateState(page, 'catchPowerUp', { type: 'slow' });
  await advanceFrames(page, 4);
  expect(activePowerUpTypes(await getState(page)).has('slow')).toBe(true);

  const afterStart = ballPosition(await getState(page));
  await advanceFrames(page, 10);
  const afterEnd = ballPosition(await getState(page));
  const afterDistance = Math.hypot(afterEnd.x - afterStart.x, afterEnd.y - afterStart.y);

  expect(afterDistance).toBeLessThan(beforeDistance);
});

test('timed effects appear and count down in HUD and state', async ({ page }) => {
  await openGame(page);
  await mutateState(page, 'catchPowerUp', { type: 'slow' });
  await advanceFrames(page, 1);

  const armed = await getState(page);
  const armedTimers = activeEffectTimers(armed);
  const armedValue = armedTimers.slow;
  expect(typeof armedValue).toBe('number');
  expect(armedValue).toBeGreaterThan(0);

  const armedHud = await readHudText(page);
  expect(armedHud).toContain('slow');

  await advanceFrames(page, 8);
  const ticking = await getState(page);
  const tickingValue = activeEffectTimers(ticking).slow ?? 0;
  expect(tickingValue).toBeLessThan(armedValue);

  const tickingHud = await readHudText(page);
  expect(tickingHud).toContain('slow');
});

test('extra life pickup increases lives', async ({ page }) => {
  await openGame(page);
  const beforeLives = lives(await getState(page));

  await mutateState(page, 'catchPowerUp', { type: 'life' });
  await advanceFrames(page, 4);

  expect(lives(await getState(page))).toBeGreaterThan(beforeLives);
});

test('the shield power-up arms a one-time safety net that saves a falling ball', async ({ page }) => {
  await openGame(page);
  const height = await page.evaluate(() => document.getElementById('game').height);

  // Catching the shield pickup arms the safety net.
  await mutateState(page, 'catchPowerUp', { type: 'shield' });
  await advanceFrames(page, 4);
  expect((await getState(page)).shield).toBe(true);

  // A ball that drops past the floor is bounced back (not lost) and the shield is spent.
  await setState(page, { shield: true, lives: 3, balls: [{ x: 400, y: height + 12, dx: 0, dy: 240, radius: 8 }] });
  await advanceFrames(page, 1);
  let s = await getState(page);
  expect(s.balls.length).toBe(1);     // saved, not lost
  expect(s.shield).toBe(false);       // consumed
  expect(s.balls[0].dy).toBeLessThan(0); // now travelling upward
  expect(s.lives).toBe(3);            // no life lost

  // With the shield spent, the next fall costs a life.
  await setState(page, { shield: false, lives: 3, balls: [{ x: 400, y: height + 12, dx: 0, dy: 240, radius: 8 }] });
  await advanceFrames(page, 2);
  s = await getState(page);
  expect(s.lives).toBeLessThan(3);
});

test('multiball pickup adds active balls', async ({ page }) => {
  await openGame(page);
  const beforeCount = balls(await getState(page)).length;

  await mutateState(page, 'catchPowerUp', { type: 'multiball' });
  await advanceFrames(page, 4);

  expect(balls(await getState(page)).length).toBeGreaterThan(beforeCount);
});

test('laser pickup auto-fires and removes bricks on cooldown cadence', async ({ page }) => {
  await openGame(page);
  await mutateState(page, 'laserReady', { type: 'laser' });
  await advanceFrames(page, 4);

  const armed = await getState(page);
  expect(activePowerUpTypes(armed).has('laser')).toBe(true);
  const initialBrickCount = liveBrickCount(armed);

  const fireFrames = [];
  let previousCooldown = armed.laserCooldown ?? 0;

  for (let frame = 1; frame <= 120; frame += 1) {
    await advanceFrames(page, 1);
    const state = await getState(page);
    const cooldown = state.laserCooldown ?? 0;
    if (cooldown > previousCooldown) {
      fireFrames.push(frame);
    }
    previousCooldown = cooldown;
  }

  const finalState = await getState(page);
  expect(fireFrames.length).toBeGreaterThan(0);
  expect(finalState.lasers?.length ?? 0).toBeGreaterThan(0);
  expect(liveBrickCount(finalState)).toBeLessThan(initialBrickCount);

  if (fireFrames.length > 1) {
    for (let index = 1; index < fireFrames.length; index += 1) {
      expect(fireFrames[index] - fireFrames[index - 1]).toBeGreaterThanOrEqual(18);
    }
  }
});

test('restart resets to level 1 and clears active power-up state from HUD and state', async ({ page }) => {
  await openGame(page);
  await mutateState(page, 'catchPowerUp', { type: 'wide' });
  await advanceFrames(page, 4);
  await mutateState(page, 'catchPowerUp', { type: 'slow' });
  await advanceFrames(page, 4);
  await mutateState(page, 'catchPowerUp', { type: 'multiball' });
  await advanceFrames(page, 4);

  const powered = await getState(page);
  expect(pickups(powered).length > 0 || activePowerUpTypes(powered).size > 0 || balls(powered).length > 1 || paddleWidth(powered) > 112).toBe(true);

  await restart(page);
  const reset = await getState(page);
  const resetHud = await readHudText(page);

  expect(pickups(reset)).toEqual([]);
  expect(activePowerUpTypes(reset).size).toBe(0);
  expect(Object.keys(activeEffectTimers(reset))).toHaveLength(0);
  expect(balls(reset).length).toBe(1);
  expect(paddleWidth(reset)).toBeLessThanOrEqual(paddleWidth(powered));
  expect(levelNumber(reset)).toBe(1);
  expect(resetHud).not.toContain('wide');
  expect(resetHud).not.toContain('slow');
  expect(resetHud).not.toContain('laser');
});

test('scoring past the stored best updates highScore live and persists to localStorage', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('brickbreaker-high-score', '5'));
  await openGame(page);

  const before = await getState(page);
  expect(before.highScore).toBe(5);
  await expect(page.locator('#best')).toHaveText('5');

  await mutateState(page, 'brickCollision');
  await advanceFrames(page, 6);

  const after = await getState(page);
  expect(after.score).toBeGreaterThanOrEqual(10);
  expect(after.highScore).toBe(after.score);
  await expect(page.locator('#best')).toHaveText(String(after.score));
  const stored = await page.evaluate(() => window.localStorage.getItem('brickbreaker-high-score'));
  expect(stored).toBe(String(after.score));
});

test('game over after a scoring run reports gameOver with highScore intact', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('brickbreaker-high-score', '5000'));
  await openGame(page);

  await mutateState(page, 'brickCollision');
  await advanceFrames(page, 6);
  await mutateState(page, 'forcedGameOver');
  await advanceFrames(page, 8);

  const after = await getState(page);
  expect(isGameOver(after)).toBe(true);
  expect(after.score).toBeGreaterThanOrEqual(10);
  expect(after.highScore).toBe(5000);
  expect(after.newRecord).toBe(false);
  await expect(page.locator('#status')).toHaveText('Game Over');
  const stored = await page.evaluate(() => window.localStorage.getItem('brickbreaker-high-score'));
  expect(stored).toBe('5000');
});

test('new-record run shows New record! status on game over', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('brickbreaker-high-score', '5'));
  await openGame(page);

  await mutateState(page, 'brickCollision');
  await advanceFrames(page, 6);
  await mutateState(page, 'forcedGameOver');
  await advanceFrames(page, 8);

  const after = await getState(page);
  expect(isGameOver(after)).toBe(true);
  expect(after.newRecord).toBe(true);
  expect(after.highScore).toBe(after.score);
  await expect(page.locator('#status')).toHaveText('New record!');
});

async function dragTouchOnLane(page, relativePoints) {
  await page.evaluate((points) => {
    const lane = document.getElementById('paddle-drag-lane');
    if (!lane) throw new Error('Drag lane not found for touch drag test.');

    const rect = lane.getBoundingClientRect();
    const makeEventInit = (point, type) => ({
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      clientX: rect.left + rect.width * point.x,
      clientY: rect.top + rect.height * point.y,
      buttons: type === 'pointerup' ? 0 : 1
    });

    lane.dispatchEvent(new PointerEvent('pointerdown', makeEventInit(points[0], 'pointerdown')));

    for (let index = 1; index < points.length; index += 1) {
      lane.dispatchEvent(new PointerEvent('pointermove', makeEventInit(points[index], 'pointermove')));
    }

    lane.dispatchEvent(new PointerEvent('pointerup', makeEventInit(points[points.length - 1], 'pointerup')));
  }, relativePoints);
}

test.describe('mobile touch controls', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true
  });

  test('moves paddle right from the bottom drag lane', async ({ page }) => {
    await openGame(page);
    await mutateState(page, 'centerPaddle');
    const startX = paddleX(await getState(page));

    await dragTouchOnLane(page, [
      { x: 0.18, y: 0.5 },
      { x: 0.38, y: 0.5 },
      { x: 0.62, y: 0.5 },
      { x: 0.82, y: 0.5 }
    ]);
    await advanceFrames(page, 2);

    expect(paddleX(await getState(page))).toBeGreaterThan(startX);
  });

  test('moves paddle left after dragging back across the bottom lane', async ({ page }) => {
    await openGame(page);
    await mutateState(page, 'centerPaddle');

    await dragTouchOnLane(page, [
      { x: 0.22, y: 0.5 },
      { x: 0.52, y: 0.5 },
      { x: 0.8, y: 0.5 }
    ]);
    await advanceFrames(page, 2);
    const rightX = paddleX(await getState(page));

    await dragTouchOnLane(page, [
      { x: 0.8, y: 0.5 },
      { x: 0.56, y: 0.5 },
      { x: 0.34, y: 0.5 },
      { x: 0.16, y: 0.5 }
    ]);
    await advanceFrames(page, 2);

    expect(paddleX(await getState(page))).toBeLessThan(rightX);
  });

  test('keeps the control band below the game canvas', async ({ page }) => {
    await openGame(page);

    const canvasBox = await page.locator('#game').boundingBox();
    const controlsBox = await page.locator('.touch-controls').boundingBox();
    const laneBox = await page.locator('#paddle-drag-lane').boundingBox();
    const restartBox = await page.locator('#restart').boundingBox();

    expect(canvasBox).not.toBeNull();
    expect(controlsBox).not.toBeNull();
    expect(laneBox).not.toBeNull();
    expect(restartBox).not.toBeNull();
    expect(controlsBox.y).toBeGreaterThanOrEqual(canvasBox.y + canvasBox.height);
    expect(laneBox.x).toBeLessThanOrEqual(controlsBox.x + 1);
    expect(laneBox.width).toBeGreaterThanOrEqual(controlsBox.width - 2);
    expect(restartBox.y).toBeGreaterThanOrEqual(laneBox.y + laneBox.height);
    expect(restartBox.width).toBeLessThan(laneBox.width * 0.5);
    expect(restartBox.height).toBeLessThan(laneBox.height * 0.75);
  });

  test('matches the mobile layout baseline', async ({ page }) => {
    await openGame(page);
    await prepareVisualLayout(page);

    await expect(page).toHaveScreenshot('brickbreaker-mobile-layout.png', {
      animations: 'disabled',
      fullPage: false,
      maxDiffPixels: 10
    });
  });

  test('auto-fires laser without a manual input', async ({ page }) => {
    await openGame(page);
    await mutateState(page, 'catchPowerUp', { type: 'laser' });
    await advanceFrames(page, 20);
    const state = await getState(page);

    expect(state.lasers.length).toBeGreaterThan(0);
  });
});

test.describe('how to play help', () => {
  async function clearHelpSeenOnce(page) {
    await page.addInitScript(() => {
      try {
        if (!localStorage.getItem('brickbreaker-help-clear-done')) {
          localStorage.removeItem('brickbreaker-help-seen');
          localStorage.setItem('brickbreaker-help-clear-done', '1');
        }
      } catch {}
    });
  }

  test('first visit shows the help panel and pauses the game', async ({ page }) => {
    await clearHelpSeenOnce(page);
    await openGame(page);

    await expect(page.locator('#help-overlay')).toBeVisible();
    const state = await getState(page);
    expect(state.helpOpen).toBe(true);
    expect(state.paused).toBe(true);
  });

  test('dismissing help sets the seen flag, unpauses, and stays hidden after reload', async ({ page }) => {
    await clearHelpSeenOnce(page);
    await openGame(page);
    await expect(page.locator('#help-overlay')).toBeVisible();

    await page.locator('#help-close').click();
    await expect(page.locator('#help-overlay')).toBeHidden();
    let state = await getState(page);
    expect(state.helpOpen).toBe(false);
    expect(state.paused).toBe(false);
    const flag = await page.evaluate(() => localStorage.getItem('brickbreaker-help-seen'));
    expect(flag).toBe('1');

    await openGame(page);
    await expect(page.locator('#help-overlay')).toBeHidden();
    state = await getState(page);
    expect(state.helpOpen).toBe(false);
  });

  test('help button reopens the panel and Escape closes it without pausing the game', async ({ page }) => {
    await openGame(page);
    await expect(page.locator('#help-overlay')).toBeHidden();

    await page.locator('#help').click();
    let state = await getState(page);
    expect(state.helpOpen).toBe(true);
    expect(state.paused).toBe(true);
    await expect(page.locator('#help-close')).toBeFocused();

    await page.keyboard.press('Escape');
    state = await getState(page);
    expect(state.helpOpen).toBe(false);
    expect(state.paused).toBe(false);
    await expect(page.locator('#help')).toBeFocused();
  });

  test('closing help keeps a manually paused game paused', async ({ page }) => {
    await openGame(page);
    await page.keyboard.press('p');
    let state = await getState(page);
    expect(state.paused).toBe(true);

    await page.locator('#help').click();
    state = await getState(page);
    expect(state.helpOpen).toBe(true);

    await page.locator('#help-close').click();
    state = await getState(page);
    expect(state.helpOpen).toBe(false);
    expect(state.paused).toBe(true);
  });
});

test.describe('sound and mute', () => {
  test('mute button toggles aria-pressed and persists brickbreaker-muted across reload', async ({ page }) => {
    await openGame(page);
    const muteBtn = page.locator('#mute');
    await expect(muteBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(muteBtn).toHaveText('🔊');

    await muteBtn.click();
    await expect(muteBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(muteBtn).toHaveText('🔇');
    let stored = await page.evaluate(() => window.localStorage.getItem('brickbreaker-muted'));
    expect(stored).toBe('1');

    await openGame(page);
    await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'true');
    let state = await getState(page);
    expect(state.muted).toBe(true);

    await page.locator('#mute').click();
    await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'false');
    stored = await page.evaluate(() => window.localStorage.getItem('brickbreaker-muted'));
    expect(stored).toBe('0');
  });

  test('muted state is exposed via getState and setMuted updates it', async ({ page }) => {
    await openGame(page);
    let state = await getState(page);
    expect(state.muted).toBe(false);

    await page.evaluate(() => window.__brickbreakerTest.setMuted(true));
    state = await getState(page);
    expect(state.muted).toBe(true);
    await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'true');

    await page.evaluate(() => window.__brickbreakerTest.setMuted(false));
    state = await getState(page);
    expect(state.muted).toBe(false);
  });

  test('brick breaks, paddle bounces, and game over run cleanly with sound wired', async ({ page }) => {
    await openGame(page);

    await mutateState(page, 'brickCollision');
    await advanceFrames(page, 6);
    let state = await getState(page);
    expect(state.score).toBeGreaterThanOrEqual(10);

    await mutateState(page, 'paddleBounce', { hit: 'center' });
    await advanceFrames(page, 2);

    await mutateState(page, 'forcedGameOver');
    await advanceFrames(page, 8);
    state = await getState(page);
    expect(isGameOver(state)).toBe(true);
  });
});

test.describe('ball serve', () => {
  async function isAwaitingServe(page) {
    return page.evaluate(() => window.__brickbreakerTest.isAwaitingServe());
  }
  function ballVerticalVelocity(state) {
    const ball = state.ball ?? state.balls?.[0] ?? {};
    return ball.dy ?? ball.velocityY ?? ball.vy;
  }

  test('a fresh game parks the ball for serve and it stays put until launched', async ({ page }) => {
    await openGame(page);
    expect(await isAwaitingServe(page)).toBe(true);
    const before = ballPosition(await getState(page));
    await advanceFrames(page, 20);
    const after = ballPosition(await getState(page));
    expect(after).toEqual(before); // glued to the paddle, no motion
  });

  test('launching releases the ball upward and clears the serve state', async ({ page }) => {
    await openGame(page);
    await page.evaluate(() => window.__brickbreakerTest.launchBall());
    expect(await isAwaitingServe(page)).toBe(false);
    const launched = await getState(page);
    expect(ballVerticalVelocity(launched)).toBeLessThan(0); // moving up
    const before = ballPosition(launched);
    await advanceFrames(page, 10);
    const after = ballPosition(await getState(page));
    expect(after).not.toEqual(before);
  });

  test('the parked ball tracks the paddle, then Space launches it', async ({ page }) => {
    await openGame(page);
    // Steer the paddle via paddleX only (no authored ball, so the serve state survives);
    // the parked ball should follow the paddle center.
    await setState(page, { paddleX: 120 });
    await advanceFrames(page, 1);
    expect(await isAwaitingServe(page)).toBe(true);
    let state = await getState(page);
    expect(ballPosition(state).x).toBeCloseTo(paddleX(state) + paddleWidth(state) / 2, 0);

    await page.keyboard.press('Space');
    expect(await isAwaitingServe(page)).toBe(false);
    expect(ballVerticalVelocity(await getState(page))).toBeLessThan(0);
  });

  test('losing a life re-parks the ball for a fresh serve', async ({ page }) => {
    await openGame(page);
    await page.evaluate(() => window.__brickbreakerTest.launchBall());
    expect(await isAwaitingServe(page)).toBe(false);
    await mutateState(page, 'missedBall', { lives: 3 });
    await advanceFrames(page, 4);
    expect(await isAwaitingServe(page)).toBe(true);
    expect(lives(await getState(page))).toBe(2);
  });
});

test.describe('ball trail', () => {
  function firstBall(state) {
    return state.ball ?? state.balls?.[0] ?? {};
  }

  test('a moving ball accumulates a fading trail', async ({ page }) => {
    await openGame(page);
    await mutateState(page, 'movingBall', { dx: 3, dy: -3 });
    expect(firstBall(await getState(page)).trail ?? []).toHaveLength(0); // none before stepping
    await advanceFrames(page, 6);
    const trail = firstBall(await getState(page)).trail ?? [];
    expect(trail.length).toBeGreaterThan(1);
    expect(trail.length).toBeLessThanOrEqual(7); // capped
  });

  test('reduced motion suppresses the ball trail', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openGame(page);
    await mutateState(page, 'movingBall', { dx: 3, dy: -3 });
    await advanceFrames(page, 6);
    const trail = firstBall(await getState(page)).trail;
    expect(trail == null || trail.length === 0).toBe(true);
  });
});

test.describe('serve accessibility cue', () => {
  test('the status region and canvas announce the launch prompt while awaiting serve', async ({ page }) => {
    await openGame(page);
    expect(await page.evaluate(() => window.__brickbreakerTest.isAwaitingServe())).toBe(true);
    await expect(page.locator('#status')).toContainText('launch');
    await expect(page.locator('canvas#game')).toHaveAttribute('aria-label', /Ready to launch/);

    await page.evaluate(() => window.__brickbreakerTest.launchBall());
    await expect(page.locator('#status')).not.toContainText('launch');
    await expect(page.locator('canvas#game')).not.toHaveAttribute('aria-label', /Ready to launch/);
  });
});

test.describe('level-clear flash', () => {
  test('clearing a zone triggers a decaying flash', async ({ page }) => {
    await openGame(page);
    await mutateState(page, 'oneBrickRemaining');
    await advanceFrames(page, 6);
    const state = await getState(page);
    expect(levelNumber(state)).toBe(2);
    expect(state.levelFlash).toBeGreaterThan(0);
  });

  test('reduced motion suppresses the level-clear flash', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openGame(page);
    await mutateState(page, 'oneBrickRemaining');
    await advanceFrames(page, 6);
    const state = await getState(page);
    expect(levelNumber(state)).toBe(2);
    expect(state.levelFlash || 0).toBe(0);
  });
});

test.describe('help-panel keyboard focus', () => {
  test('the start-zone select shows a keyboard focus ring', async ({ page }) => {
    await openGame(page);
    await page.locator('#help').click();
    await expect(page.locator('#help-overlay')).toBeVisible();
    // Keyboard navigation (not a programmatic focus) triggers :focus-visible.
    await page.locator('#help-close').focus();
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('start-zone');
    const outlineStyle = await page.locator('#start-zone').evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outlineStyle).not.toBe('none');
  });
});

test('exposes theme-color, description, favicon, and Open Graph meta', async ({ page }) => {
  await openGame(page);
  const meta = await page.evaluate(() => ({
    theme: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
    desc: document.querySelector('meta[name="description"]')?.getAttribute('content'),
    icon: document.querySelector('link[rel="icon"]')?.getAttribute('href'),
    ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute('content')
  }));
  expect(meta.theme).toBe('#080400');
  expect(meta.desc).toMatch(/Brick Breaker/);
  expect(meta.icon).toBe('favicon.svg');
  expect(meta.ogTitle).toBe('Brick Breaker');
});

test('serves the favicon asset', async ({ page }) => {
  const response = await page.request.get('./favicon.svg');
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toContain('svg');
});

test('is an installable PWA (linked, valid manifest)', async ({ page }) => {
  await openGame(page);
  const href = await page.evaluate(() => document.querySelector('link[rel="manifest"]')?.getAttribute('href'));
  expect(href).toBe('manifest.webmanifest');
  const response = await page.request.get('./manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest.name).toBe('Brick Breaker');
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.length).toBeGreaterThan(0);
});

test.describe('no-JavaScript fallback', () => {
  test.use({ javaScriptEnabled: false });
  test('shows a message when JavaScript is disabled', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByText(/needs JavaScript enabled/i)).toBeVisible();
  });
});
