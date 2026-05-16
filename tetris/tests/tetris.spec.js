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
  await expect(page.locator('canvas#game')).toBeVisible();
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
      controlDeck: readBox('.control-deck'),
      gameArea: readBox('.game-area'),
      dpadCluster: readBox('.dpad-cluster'),
      rotateCluster: readBox('.rotate-cluster'),
      left: readBox('[data-action="left"]'),
      right: readBox('[data-action="right"]'),
      softDrop: readBox('[data-action="soft-drop"]'),
      hardDrop: readBox('[data-action="hard-drop"]'),
      rotateCw: readBox('[data-action="rotate-cw"]'),
      rotateCcw: readBox('[data-action="rotate-ccw"]')
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

function expectPortraitErgonomics(layout) {
  const {
    viewport,
    scrollHeight,
    board,
    controlDeck,
    gameArea,
    dpadCluster,
    rotateCluster,
    left,
    right,
    softDrop,
    hardDrop,
    rotateCw,
    rotateCcw
  } = layout;

  for (const box of [board, controlDeck, gameArea, dpadCluster, rotateCluster,
    left, right, softDrop, hardDrop, rotateCw, rotateCcw]) {
    expect(box).not.toBeNull();
    expectVisibleInViewport(box, viewport);
  }

  expect(scrollHeight).toBeLessThanOrEqual(viewport.height + 1);
  expect(controlDeck.y).toBeGreaterThanOrEqual(board.bottom - 2);
  expect(controlDeck.height).toBeLessThanOrEqual(viewport.height * 0.30);
  expect(centerX(dpadCluster)).toBeLessThan(centerX(rotateCluster));
  expectInside(left, dpadCluster);
  expectInside(right, dpadCluster);
  expectInside(softDrop, dpadCluster);
  expectInside(hardDrop, dpadCluster);
  expectInside(rotateCw, rotateCluster);
  expectInside(rotateCcw, rotateCluster);
  expect(Math.abs(left.width - right.width)).toBeLessThan(4);
  expect(Math.abs(left.height - right.height)).toBeLessThan(4);
  expect(Math.abs(left.y - right.y)).toBeLessThan(4);
  expect(Math.abs(rotateCw.width - rotateCcw.width)).toBeLessThan(4);
  expect(Math.abs(rotateCw.height - rotateCcw.height)).toBeLessThan(4);
  expect(hardDrop.y).toBeLessThan(softDrop.y);
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
    statusMessageTimer: 0,
    gravityFrames: 48,
    gravityTick: 0,
    lockTimer: 0,
    heldPiece: 'S',
    holdUsed: false,
    nextPieceType: 'I'
  });
}

test('renders and exposes ready test API', async ({ page }) => {
  await openGame(page);
  await expect.poll(async () => {
    return page.locator('canvas#game').evaluate((canvas) => {
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

test('CCW rotation via z key rotates counterclockwise', async ({ page }) => {
  await openGame(page);
  const initial = await getState(page);
  const initialRotation = initial.current.rotation;

  await page.keyboard.press('ArrowUp');
  const afterCw = await getState(page);
  const cwRotation = (initialRotation + 1) % 4;
  expect(afterCw.current.rotation).toBe(cwRotation);

  await page.keyboard.press('z');
  const afterCcw = await getState(page);
  expect(afterCcw.current.rotation).toBe(initialRotation);
});

test('control deck buttons are keyboard-activatable via Space', async ({ page }) => {
  await openGame(page);
  const initial = await getState(page);

  // Tab to the rotate-cw button and press Space — should rotate CW
  await page.locator('[data-action="rotate-cw"]').focus();
  await page.keyboard.press('Space');
  const afterRotate = await getState(page);
  expect(afterRotate.current.rotation).toBe((initial.current.rotation + 1) % 4);

  // Tab to the rotate-ccw button and press Space — should rotate back
  await page.locator('[data-action="rotate-ccw"]').focus();
  await page.keyboard.press('Space');
  const afterCcw = await getState(page);
  expect(afterCcw.current.rotation).toBe(initial.current.rotation);
});

test('hold-preview div is keyboard-activatable via Space', async ({ page }) => {
  await openGame(page);
  const initial = await getState(page);
  expect(initial.heldPiece).toBeNull();

  await page.locator('[data-action="hold"]').focus();
  await page.keyboard.press('Space');
  const after = await getState(page);
  expect(after.heldPiece).toBe(initial.current.type);
  expect(after.holdUsed).toBe(true);
});

test('hold piece mechanic saves and swaps piece', async ({ page }) => {
  await openGame(page);
  const initial = await getState(page);
  const initialType = initial.current.type;

  await page.keyboard.press('c');
  const afterFirstHold = await getState(page);
  expect(afterFirstHold.heldPiece).toBe(initialType);
  expect(afterFirstHold.holdUsed).toBe(true);
  expect(afterFirstHold.current).not.toBeNull();
  expect(afterFirstHold.current.type).not.toBe(initialType);

  await page.keyboard.press('c');
  const afterSecondAttempt = await getState(page);
  expect(afterSecondAttempt.heldPiece).toBe(initialType);
  expect(afterSecondAttempt.current.type).toBe(afterFirstHold.current.type);

  await page.keyboard.press('Space');
  const afterDrop = await getState(page);
  expect(afterDrop.holdUsed).toBe(false);

  const beforeSwapType = afterDrop.current.type;
  await page.keyboard.press('c');
  const afterSwap = await getState(page);
  expect(afterSwap.heldPiece).toBe(beforeSwapType);
  expect(afterSwap.current.type).toBe(initialType);
});

test('touch hard-drop does not chain-drop subsequent pieces while button is held', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);
  await setState(page, {
    ...state,
    board: Array.from({ length: 20 }, () => Array(10).fill(0)),
    gravityFrames: 48, gravityTick: 0, lockTimer: 0, score: 0
  });

  const hardDropBtn = page.locator('[data-action="hard-drop"]');
  await hardDropBtn.dispatchEvent('pointerdown');
  await advanceFrames(page, 100);
  await hardDropBtn.dispatchEvent('pointerup');

  const after = await getState(page);
  // Without the fix, held.hardDrop stays true and every frame hard-drops a new piece;
  // on an empty board 100 consecutive hard-drops fills the board and causes game over.
  // With the fix, held.hardDrop is cleared on the first call so only one piece drops.
  expect(after.gameOver).toBe(false);
  expect(after.current).not.toBeNull();
});

test('hold swap cancelled without state corruption when spawn is blocked', async ({ page }) => {
  await openGame(page);

  const board = Array.from({ length: 20 }, () => Array(10).fill(0));
  board[0][3] = 1; board[0][4] = 1; board[0][5] = 1; board[0][6] = 1;

  await setState(page, {
    board,
    current: { type: 'T', index: 3, x: 4, y: 10, rotation: 0 },
    heldPiece: 'I',
    holdUsed: false,
    score: 0, lines: 0, level: 1,
    gravityFrames: 48, gravityTick: 0, lockTimer: 0,
    gameOver: false, clearAnimation: null,
    statusMessage: '', statusTone: 'normal', statusMessageTimer: 0,
    nextPieceType: 'O'
  });

  await page.keyboard.press('c');
  const after = await getState(page);

  expect(after.current.type).toBe('T');
  expect(after.heldPiece).toBe('I');
  expect(after.holdUsed).toBe(false);
});

test('ghost piece renders at piece position without error when already at floor', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);

  await setState(page, {
    ...state,
    board: Array.from({ length: 20 }, () => Array(10).fill(0)),
    current: { type: 'O', index: 2, x: 4, y: 18, rotation: 0 },
    gravityTick: 0, lockTimer: 0
  });

  await advanceFrames(page, 1);
  const after = await getState(page);
  expect(after.current).not.toBeNull();
});

test('ghost piece stops at board obstacle, not at floor', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);

  // Place filled cells at row 15 in columns 3-6 to block an O-piece dropped at x=4
  const board = Array.from({ length: 20 }, () => Array(10).fill(0));
  board[15] = [0, 0, 0, 1, 1, 1, 1, 0, 0, 0];

  await setState(page, {
    ...state,
    board,
    current: { type: 'O', index: 2, x: 4, y: 2, rotation: 0 },
    gravityTick: 0, lockTimer: 0
  });

  // Verify ghost stops at row 13 (obstacle at row 15 blocks the cell below y=14) by hard-dropping:
  const hardDropBtn = '[data-action="hard-drop"]';
  await page.locator(hardDropBtn).dispatchEvent('pointerdown');
  await advanceFrames(page, 1);
  await page.locator(hardDropBtn).dispatchEvent('pointerup');
  await advanceFrames(page, 2);

  const dropped = await getState(page);
  // After hard drop from y=2, piece locks at y=13 (row 15 blocks the cell below y=14)
  expect(dropped.board[13][4]).toBeGreaterThan(0);
  expect(dropped.board[15][4]).toBeGreaterThan(0); // original obstacle still there
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

    const right = page.locator('[data-action="right"]');
    await right.dispatchEvent('pointerdown');
    await advanceFrames(page, 22);
    await right.dispatchEvent('pointerup');
    const moved = await getState(page);
    expect(moved.current.x).toBeGreaterThan(start.current.x);

    const rotateCw = page.locator('[data-action="rotate-cw"]');
    const beforeRotate = moved.current.rotation;
    await rotateCw.dispatchEvent('pointerdown');
    await rotateCw.dispatchEvent('pointerup');
    const rotated = await getState(page);
    expect(rotated.current.rotation).not.toBe(beforeRotate);

    const soft = page.locator('[data-action="soft-drop"]');
    const beforeSoftY = rotated.current.y;
    await soft.dispatchEvent('pointerdown');
    await advanceFrames(page, 6);
    await soft.dispatchEvent('pointerup');
    const softened = await getState(page);
    expect(softened.current.y).toBeGreaterThan(beforeSoftY);

    const hard = page.locator('[data-action="hard-drop"]');
    const scoreBeforeHard = softened.score;
    await hard.dispatchEvent('pointerdown');
    await hard.dispatchEvent('pointerup');
    const hardened = await getState(page);
    expect(hardened.score).toBeGreaterThanOrEqual(scoreBeforeHard);
  });

  test('CCW touch button rotates counterclockwise', async ({ page }) => {
    await openGame(page);
    const initial = await getState(page);
    const initialRotation = initial.current.rotation;

    const cw = page.locator('[data-action="rotate-cw"]');
    await cw.dispatchEvent('pointerdown');
    await cw.dispatchEvent('pointerup');
    const afterCw = await getState(page);
    expect(afterCw.current.rotation).toBe((initialRotation + 1) % 4);

    const ccw = page.locator('[data-action="rotate-ccw"]');
    await ccw.dispatchEvent('pointerdown');
    await ccw.dispatchEvent('pointerup');
    const afterCcw = await getState(page);
    expect(afterCcw.current.rotation).toBe(initialRotation);
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

    expectPortraitErgonomics(layout);
    expect(restartStyles.borderTopColor).not.toBe('rgb(51, 65, 85)');
    expect(restartStyles.backgroundImage).toContain('gradient');
  });

  test('keeps the handheld deck in view on shorter portrait screens', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await openGame(page);

    const layout = await getPortraitLayout(page);
    expectPortraitErgonomics(layout);
  });

  test('touch hold button saves and swaps pieces', async ({ page }) => {
    await openGame(page);
    const initial = await getState(page);
    expect(initial.heldPiece).toBeNull();
    const firstType = initial.current.type;

    // First hold: saves current piece and spawns next
    const holdEl = page.locator('[data-action="hold"]');
    await holdEl.dispatchEvent('pointerdown');
    await holdEl.dispatchEvent('pointerup');
    const afterFirst = await getState(page);
    expect(afterFirst.heldPiece).toBe(firstType);
    expect(afterFirst.holdUsed).toBe(true);

    // Hard-drop the new piece to get a fresh spawn with holdUsed reset.
    // Must advance frames between pointerdown and pointerup so the frame loop fires.
    const hardBtn = page.locator('[data-action="hard-drop"]');
    await hardBtn.dispatchEvent('pointerdown');
    await advanceFrames(page, 1);
    await hardBtn.dispatchEvent('pointerup');
    await advanceFrames(page, 2);
    const fresh = await getState(page);
    expect(fresh.holdUsed).toBe(false);

    // Second hold: swaps held piece with current piece
    const heldBefore = fresh.heldPiece;
    const currentBefore = fresh.current.type;
    await holdEl.dispatchEvent('pointerdown');
    await holdEl.dispatchEvent('pointerup');
    const afterSwap = await getState(page);
    expect(afterSwap.heldPiece).toBe(currentBefore);
    expect(afterSwap.current.type).toBe(heldBefore);
  });

  test('matches the portrait layout baseline', async ({ page }) => {
    await openGame(page);
    await prepareVisualLayout(page);

    const layout = await getPortraitLayout(page);
    expectPortraitErgonomics(layout);

    await expect(page).toHaveScreenshot('tetris-portrait-layout.png', {
      animations: 'disabled',
      fullPage: false,
      maxDiffPixels: 10
    });
  });
});
