import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const runtimeErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
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
  await page.evaluate(() => window.localStorage.removeItem('tetris-handedness'));
  await page.reload();
  await page.waitForFunction(() => {
    const api = window.__tetrisTest;
    return (
      api &&
      api.isReady === true &&
      (typeof api.getState === 'function' || typeof api.readState === 'function') &&
      typeof api.setState === 'function' &&
      typeof api.advanceFrames === 'function' &&
      typeof api.restart === 'function' &&
      typeof api.setAutoStep === 'function' &&
      typeof api.getControlsState === 'function' &&
      typeof api.setHandedness === 'function'
    );
  });
  await page.evaluate(() => window.__tetrisTest.setAutoStep(false));
  await expect(page.locator('canvas')).toBeVisible();
}

async function getState(page) {
  return page.evaluate(() => {
    const api = window.__tetrisTest;
    const reader = api.getState ?? api.readState;
    return reader.call(api);
  });
}

async function setState(page, nextState) {
  await page.evaluate((payload) => {
    window.__tetrisTest.setState(payload);
  }, nextState);
}

async function advanceFrames(page, frames = 1) {
  await page.evaluate(async (value) => {
    await window.__tetrisTest.advanceFrames(value);
  }, frames);
}

async function getControlsState(page) {
  return page.evaluate(() => window.__tetrisTest.getControlsState());
}

async function getPortraitLayout(page) {
  return page.evaluate(() => {
    const readBox = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        right: box.right,
        bottom: box.bottom
      };
    };

    return {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      scrollHeight: document.scrollingElement.scrollHeight,
      board: readBox('#game'),
      controls: readBox('.touch-controls'),
      playfield: readBox('.playfield'),
      status: readBox('.status-wrap'),
      moveZone: readBox('.move-zone'),
      actionZone: readBox('.action-zone'),
      toggle: readBox('#handedness-toggle'),
      left: readBox('[data-action="left"]'),
      right: readBox('[data-action="right"]'),
      softDrop: readBox('[data-action="soft-drop"]'),
      rotate: readBox('[data-action="rotate"]'),
      hardDrop: readBox('[data-action="hard-drop"]')
    };
  });
}

function expectInside(inner, outer) {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - 1);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - 1);
  expect(inner.right).toBeLessThanOrEqual(outer.right + 1);
  expect(inner.bottom).toBeLessThanOrEqual(outer.bottom + 1);
}

function expectVisibleInViewport(box, viewport) {
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.bottom).toBeLessThanOrEqual(viewport.height + 1);
}

function centerX(box) {
  return box.x + box.width / 2;
}

function centerY(box) {
  return box.y + box.height / 2;
}

function expectRightHandedErgonomics(layout) {
  const {
    viewport,
    scrollHeight,
    board,
    controls,
    playfield,
    status,
    moveZone,
    actionZone,
    toggle,
    left,
    right,
    softDrop,
    rotate,
    hardDrop
  } = layout;

  for (const box of [board, controls, playfield, status, moveZone, actionZone, toggle, left, right, softDrop, rotate, hardDrop]) {
    expect(box).not.toBeNull();
    expectVisibleInViewport(box, viewport);
  }

  expect(scrollHeight).toBeLessThanOrEqual(viewport.height + 1);
  expect(board.height).toBeGreaterThan(status.height * 5);
  expect(playfield.height).toBeGreaterThan(controls.height * 2.5);
  expect(controls.y).toBeGreaterThanOrEqual(board.bottom - 1);
  expect(controls.height).toBeLessThanOrEqual(viewport.height * 0.26);
  expect(Math.abs(centerX(toggle) - centerX(controls))).toBeLessThan(4);
  expect(moveZone.x).toBeLessThan(actionZone.x);
  expect(moveZone.right).toBeLessThanOrEqual(actionZone.x + 4);
  expect(Math.abs(moveZone.width - actionZone.width)).toBeLessThan(2);
  expect(Math.abs(moveZone.height - actionZone.height)).toBeLessThan(2);
  expect(Math.abs(moveZone.y - actionZone.y)).toBeLessThan(2);
  expect(Math.abs(moveZone.bottom - actionZone.bottom)).toBeLessThan(2);
  expect(toggle.bottom).toBeLessThanOrEqual(moveZone.y + 4);
  expectInside(left, moveZone);
  expectInside(right, moveZone);
  expectInside(softDrop, moveZone);
  expectInside(rotate, actionZone);
  expectInside(hardDrop, actionZone);
  expect(Math.abs(left.width - right.width)).toBeLessThan(2);
  expect(Math.abs(left.width - softDrop.width)).toBeLessThan(2);
  expect(Math.abs(left.height - right.height)).toBeLessThan(2);
  expect(Math.abs(left.height - softDrop.height)).toBeLessThan(2);
  expect(Math.abs(centerY(left) - centerY(right))).toBeLessThan(2);
  expect(softDrop.y).toBeGreaterThan(left.y);
  expect(centerX(softDrop)).toBeGreaterThan(centerX(left));
  expect(centerX(softDrop)).toBeLessThan(centerX(right));
  expect(rotate.height).toBeGreaterThan(hardDrop.height);
  expect(Math.abs(rotate.width - rotate.height)).toBeLessThan(2);
  expect(Math.abs(hardDrop.width - hardDrop.height)).toBeLessThan(2);
  expect(centerX(rotate)).toBeGreaterThan(centerX(hardDrop));
  expect(centerY(hardDrop)).toBeGreaterThanOrEqual(centerY(rotate));
}

async function prepareVisualLayout(page) {
  const board = Array.from({ length: 20 }, () => Array(10).fill(0));
  board[17] = [0, 0, 3, 3, 3, 0, 4, 4, 0, 0];
  board[18] = [0, 5, 5, 0, 2, 2, 0, 1, 1, 1];
  board[19] = [6, 6, 5, 2, 2, 7, 7, 0, 3, 3];
  await setState(page, {
    board,
    current: { type: 'T', index: 3, x: 4, y: 3, rotation: 0 },
    score: 1200,
    lines: 4,
    level: 1,
    gameOver: false,
    clearAnimation: null,
    statusMessage: 'Level 1',
    statusTone: '',
    statusMessageTimer: 0
  });
}

test('renders and exposes ready test API', async ({ page }) => {
  await openGame(page);
  await expect.poll(async () => {
    return page.locator('canvas').evaluate((canvas) => {
      const context = canvas.getContext('2d');
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let colored = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index] || pixels[index + 1] || pixels[index + 2] || pixels[index + 3]) colored += 1;
      }
      return colored;
    });
  }).toBeGreaterThan(500);
});

test('keyboard move rotate and hard drop work', async ({ page }) => {
  await openGame(page);
  const start = await getState(page);

  await page.keyboard.press('ArrowLeft');
  const moved = await getState(page);
  expect(moved.current.x).toBeLessThan(start.current.x);

  const beforeRotate = moved.current.rotation;
  await page.keyboard.press('ArrowUp');
  const rotated = await getState(page);
  expect(rotated.current.rotation).not.toBe(beforeRotate);

  const yBeforeDrop = rotated.current.y;
  await page.keyboard.press('Space');
  const dropped = await getState(page);
  expect(dropped.current.y).toBeLessThanOrEqual(yBeforeDrop);
  expect(dropped.score).toBeGreaterThanOrEqual(rotated.score);
});

test('tap left and right moves exactly one column', async ({ page }) => {
  await openGame(page);
  const start = await getState(page);

  await page.keyboard.press('ArrowLeft');
  const afterLeft = await getState(page);
  expect(afterLeft.current.x).toBe(start.current.x - 1);

  await page.keyboard.press('ArrowRight');
  const afterRight = await getState(page);
  expect(afterRight.current.x).toBe(start.current.x);
});

test('hold left waits for DAS then repeats by ARR cadence', async ({ page }) => {
  await openGame(page);
  const start = await getState(page);

  await page.keyboard.down('ArrowLeft');
  const afterPress = await getState(page);
  expect(afterPress.current.x).toBe(start.current.x - 1);

  await advanceFrames(page, 15);
  const beforeDas = await getState(page);
  expect(beforeDas.current.x).toBe(afterPress.current.x);

  await advanceFrames(page, 1);
  const atDas = await getState(page);
  expect(atDas.current.x).toBe(afterPress.current.x);

  await advanceFrames(page, 6);
  const firstRepeat = await getState(page);
  expect(firstRepeat.current.x).toBe(atDas.current.x - 1);

  await advanceFrames(page, 6);
  const secondRepeat = await getState(page);
  expect(secondRepeat.current.x).toBe(firstRepeat.current.x - 1);
  await page.keyboard.up('ArrowLeft');
});

test('line clear animates before lines and score update', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);

  const board = state.board.map((row) => row.slice());
  for (let x = 0; x < 10; x += 1) board[19][x] = 1;
  board[19][3] = 0;
  board[19][4] = 0;
  board[19][5] = 0;
  board[19][6] = 0;

  state.board = board;
  state.current = { type: 'I', index: 1, x: 4, y: 17, rotation: 0 };
  state.score = 0;
  state.lines = 0;
  state.level = 1;
  state.gravityFrames = 48;
  state.gravityTick = 0;
  state.gameOver = false;
  await setState(page, state);

  await page.keyboard.press('Space');
  const during = await getState(page);
  const dropScore = during.score;
  expect(during.clearAnimation).not.toBeNull();
  expect(during.clearAnimation.rows).toEqual([19]);
  expect(during.lines).toBe(0);
  expect(dropScore).toBeGreaterThan(0);

  await advanceFrames(page, 17);
  const stillAnimating = await getState(page);
  expect(stillAnimating.clearAnimation).not.toBeNull();
  expect(stillAnimating.lines).toBe(0);

  await advanceFrames(page, 1);
  const after = await getState(page);
  expect(after.clearAnimation).toBeNull();
  expect(after.lines).toBe(1);
  expect(after.score).toBe(dropScore + 100);
});

test('level progression increases speed', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);
  state.lines = 9;
  state.level = 1;
  state.gravityFrames = 48;
  const board = state.board.map((row) => row.slice());
  for (let x = 0; x < 10; x += 1) board[19][x] = 1;
  board[19][3] = 0;
  board[19][4] = 0;
  board[19][5] = 0;
  board[19][6] = 0;
  state.board = board;
  state.current = { type: 'I', index: 1, x: 4, y: 17, rotation: 0 };
  await setState(page, state);

  await page.keyboard.press('Space');
  await advanceFrames(page, 18);
  const after = await getState(page);
  expect(after.level).toBe(2);
  expect(after.gravityFrames).toBe(44);
  await expect(page.locator('#status')).toHaveText('Level 2 speed up');
});

test('milestone status persists briefly then falls back to next target message', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);
  state.lines = 39;
  state.level = 4;
  state.gravityFrames = 34;
  const board = state.board.map((row) => row.slice());
  for (let x = 0; x < 10; x += 1) board[19][x] = 1;
  board[19][3] = 0;
  board[19][4] = 0;
  board[19][5] = 0;
  board[19][6] = 0;
  state.board = board;
  state.current = { type: 'I', index: 1, x: 4, y: 17, rotation: 0 };
  await setState(page, state);

  await page.keyboard.press('Space');
  await advanceFrames(page, 18);
  const after = await getState(page);
  expect(after.level).toBe(5);
  expect(after.gravityFrames).toBe(30);
  expect(after.statusTone).toBe('milestone');
  await expect(page.locator('#status')).toHaveText('Milestone reached: level 5');

  await advanceFrames(page, 180);
  await expect(page.locator('#status')).toHaveText('Marathon pace: 10 lines to level 6');
});

test('higher levels taper speed instead of jumping to minimum too early', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);
  state.lines = 89;
  state.level = 9;
  state.gravityFrames = 18;
  const board = state.board.map((row) => row.slice());
  for (let x = 0; x < 10; x += 1) board[19][x] = 1;
  board[19][3] = 0;
  board[19][4] = 0;
  board[19][5] = 0;
  board[19][6] = 0;
  state.board = board;
  state.current = { type: 'I', index: 1, x: 4, y: 17, rotation: 0 };
  await setState(page, state);

  await page.keyboard.press('Space');
  await advanceFrames(page, 18);
  const after = await getState(page);
  expect(after.level).toBe(10);
  expect(after.gravityFrames).toBe(16);
  await expect(page.locator('#status')).toHaveText('Milestone reached: level 10');
});

test('minimum speed is delayed until level fifteen', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);
  state.lines = 139;
  state.level = 14;
  state.gravityFrames = 8;
  const board = state.board.map((row) => row.slice());
  for (let x = 0; x < 10; x += 1) board[19][x] = 1;
  board[19][3] = 0;
  board[19][4] = 0;
  board[19][5] = 0;
  board[19][6] = 0;
  state.board = board;
  state.current = { type: 'I', index: 1, x: 4, y: 17, rotation: 0 };
  await setState(page, state);

  await page.keyboard.press('Space');
  await advanceFrames(page, 18);
  const after = await getState(page);
  expect(after.level).toBe(15);
  expect(after.gravityFrames).toBe(6);
  await expect(page.locator('#status')).toHaveText('Milestone reached: level 15');
});

test('game over on spawn collision then restart recovers', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);
  const board = state.board.map((row) => row.slice());
  board[0][4] = 2;
  board[0][5] = 2;
  board[1][4] = 2;
  board[1][5] = 2;
  state.board = board;
  state.current = { type: 'I', index: 1, x: 4, y: 17, rotation: 0 };
  await setState(page, state);

  await page.keyboard.press('Space');
  const over = await getState(page);
  expect(over.gameOver).toBe(true);

  await page.keyboard.press('r');
  const restarted = await getState(page);
  expect(restarted.gameOver).toBe(false);
  expect(restarted.lines).toBe(0);
  expect(restarted.score).toBe(0);
});

test('matches the desktop layout baseline', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGame(page);
  await prepareVisualLayout(page);

  await expect(page).toHaveScreenshot('tetris-desktop-layout.png', {
    animations: 'disabled',
    fullPage: false,
    maxDiffPixels: 10
  });
});

test.describe('mobile touch controls', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true
  });

  test('touch buttons move rotate and soft drop', async ({ page }) => {
    await openGame(page);
    const start = await getState(page);

    const right = page.getByRole('button', { name: 'Right' });
    await right.dispatchEvent('pointerdown');
    await advanceFrames(page, 22);
    await right.dispatchEvent('pointerup');
    const moved = await getState(page);
    expect(moved.current.x).toBeGreaterThan(start.current.x);

    const rotate = page.getByRole('button', { name: 'Rotate' });
    const beforeRotate = moved.current.rotation;
    await rotate.click();
    const rotated = await getState(page);
    expect(rotated.current.rotation).not.toBe(beforeRotate);

    const soft = page.getByRole('button', { name: 'Soft Drop' });
    const beforeSoftY = rotated.current.y;
    await soft.dispatchEvent('pointerdown');
    await advanceFrames(page, 6);
    await soft.dispatchEvent('pointerup');
    const softened = await getState(page);
    expect(softened.current.y).toBeGreaterThan(beforeSoftY);

    const hard = page.getByRole('button', { name: 'Hard Drop' });
    const scoreBeforeHard = softened.score;
    await hard.click();
    const hardened = await getState(page);
    expect(hardened.score).toBeGreaterThanOrEqual(scoreBeforeHard);
  });

  test('keeps touch controls below the board in portrait layout', async ({ page }) => {
    await openGame(page);

    const layout = await getPortraitLayout(page);
    const restartStyles = await page.locator('#restart').evaluate((element) => {
      const style = window.getComputedStyle(element);
      return {
        borderTopColor: style.borderTopColor,
        backgroundImage: style.backgroundImage
      };
    });

    expectRightHandedErgonomics(layout);
    expect(restartStyles.borderTopColor).not.toBe('rgb(51, 65, 85)');
    expect(restartStyles.backgroundImage).toContain('gradient');
  });

  test('keeps the handheld deck in view on shorter portrait screens', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await openGame(page);

    const layout = await getPortraitLayout(page);
    expectRightHandedErgonomics(layout);
  });

  test('handedness toggle swaps zones and persists after reload', async ({ page }) => {
    await openGame(page);

    await expect(page.locator('#handedness-toggle')).toHaveText('Right-handed');
    await expect.poll(async () => {
      const state = await getControlsState(page);
      return state.handedness;
    }).toBe('right');

    const beforeMoveBox = await page.locator('.move-zone').boundingBox();
    const beforeActionBox = await page.locator('.action-zone').boundingBox();
    expect(beforeMoveBox).not.toBeNull();
    expect(beforeActionBox).not.toBeNull();
    expect(beforeMoveBox.x).toBeLessThan(beforeActionBox.x);

    await page.locator('#handedness-toggle').tap();
    await expect(page.locator('#handedness-toggle')).toHaveText('Left-handed');
    await expect.poll(async () => {
      const state = await getControlsState(page);
      return state.handedness;
    }).toBe('left');

    const afterMoveBox = await page.locator('.move-zone').boundingBox();
    const afterActionBox = await page.locator('.action-zone').boundingBox();
    expect(afterMoveBox).not.toBeNull();
    expect(afterActionBox).not.toBeNull();
    expect(afterMoveBox.x).toBeGreaterThan(afterActionBox.x);

    await page.reload();
    await page.waitForFunction(() => window.__tetrisTest?.isReady === true);
    await page.evaluate(() => window.__tetrisTest.setAutoStep(false));
    await expect(page.locator('#handedness-toggle')).toHaveText('Left-handed');
    await expect.poll(async () => {
      const state = await getControlsState(page);
      return state.handedness;
    }).toBe('left');
  });

  test('matches the portrait layout baseline', async ({ page }) => {
    await openGame(page);
    await prepareVisualLayout(page);

    const layout = await getPortraitLayout(page);
    expectRightHandedErgonomics(layout);

    await expect(page).toHaveScreenshot('tetris-portrait-layout.png', {
      animations: 'disabled',
      fullPage: false,
      maxDiffPixels: 10
    });
  });
});
