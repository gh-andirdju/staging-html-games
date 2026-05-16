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
    statusTone: 'normal',
    statusMessageTimer: 180,
    gravityFrames: 48,
    gravityTick: 0,
    lockTimer: 0,
    heldPiece: 'S',
    holdUsed: true,
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

  await page.keyboard.press('Space');
  const dropped = await getState(page);
  // Hard drop locks the piece and spawns a new one; score must have increased
  expect(dropped.score).toBeGreaterThan(rotated.score);
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
  await advanceFrames(page, 1);
  const over = await getState(page);
  expect(over.gameOver).toBe(true);
  expect(over.statusMessage).toBe('Game Over');
  expect(over.statusTone).toBe('warning');
  await expect(page.locator('#status')).toHaveText('Game Over');

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

test('CCW rotation kicks away from right wall when base rotation overflows', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);

  // I-piece vertical (rot 1) at x=8: CCW to rot 0 would place a cell at column 10 (out of bounds)
  // The kick sequence [1,-1,2,-2] must pick offset -1 → x=7, which fits in columns 6-9
  await setState(page, {
    ...state,
    board: Array.from({ length: 20 }, () => Array(10).fill(0)),
    current: { type: 'I', index: 1, x: 8, y: 10, rotation: 1 },
    gravityTick: 0, lockTimer: 0
  });

  await page.keyboard.press('z');
  const after = await getState(page);
  expect(after.current.rotation).toBe(0);
  expect(after.current.x).toBe(7);
});

test('CW rotation kicks away from left wall when base rotation overflows', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);

  // I-piece vertical (rot 3) at x=0: CW to rot 0 would place a cell at column -1 (out of bounds)
  // The kick sequence [-1,1,-2,2] must pick offset +1 → x=1, which fits in columns 1-4
  await setState(page, {
    ...state,
    board: Array.from({ length: 20 }, () => Array(10).fill(0)),
    current: { type: 'I', index: 1, x: 0, y: 10, rotation: 3 },
    gravityTick: 0, lockTimer: 0
  });

  await page.keyboard.press('ArrowUp');
  const after = await getState(page);
  expect(after.current.rotation).toBe(0);
  expect(after.current.x).toBe(1);
});

test('CCW rotation kicks away from left wall when base rotation overflows', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);

  // I-piece vertical (rot 3) at x=0: CCW to rot 2 would place a cell at column -1 (out of bounds)
  // The kick sequence [1,-1,2,-2] picks offset +1 → x=1, fitting columns 0-3
  await setState(page, {
    ...state,
    board: Array.from({ length: 20 }, () => Array(10).fill(0)),
    current: { type: 'I', index: 1, x: 0, y: 10, rotation: 3 },
    gravityTick: 0, lockTimer: 0
  });

  await page.keyboard.press('z');
  const after = await getState(page);
  expect(after.current.rotation).toBe(2);
  expect(after.current.x).toBe(1);
});

test('4-line Tetris clear awards correct score and status message', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);

  // Rows 16-19 complete except column 5; I-piece vertical (rot 3) at x=5 fills the gap
  const board = Array.from({ length: 20 }, () => Array(10).fill(0));
  for (let row = 16; row <= 19; row++) {
    board[row] = [1, 1, 1, 1, 1, 0, 1, 1, 1, 1];
  }

  await setState(page, {
    ...state,
    board,
    score: 0,
    lines: 0,
    level: 1,
    current: { type: 'I', index: 1, x: 5, y: 2, rotation: 3 },
    gravityTick: 0, lockTimer: 0
  });

  const hardBtn = page.locator('[data-action="hard-drop"]');
  await hardBtn.dispatchEvent('pointerdown');
  await advanceFrames(page, 1);
  await hardBtn.dispatchEvent('pointerup');
  // Advance through clear animation (18 frames) plus extra
  await advanceFrames(page, 25);

  const after = await getState(page);
  expect(after.lines).toBe(4);
  expect(after.score).toBeGreaterThanOrEqual(800); // 800 (Tetris) + hard-drop bonus
  expect(after.statusMessage).toMatch(/tetris clear/i);
  expect(after.statusTone).toBe('milestone');
});

test('Tetris clear message shown even when clear also causes a level-up', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);

  // lines=6 so clearing 4 pushes total to 10 → level 2 (crosses boundary)
  const board = Array.from({ length: 20 }, () => Array(10).fill(0));
  for (let row = 16; row <= 19; row++) {
    board[row] = [1, 1, 1, 1, 1, 0, 1, 1, 1, 1];
  }

  await setState(page, {
    ...state,
    board,
    score: 0,
    lines: 6,
    level: 1,
    current: { type: 'I', index: 1, x: 5, y: 2, rotation: 3 },
    gravityTick: 0, lockTimer: 0
  });

  const hardBtn = page.locator('[data-action="hard-drop"]');
  await hardBtn.dispatchEvent('pointerdown');
  await advanceFrames(page, 1);
  await hardBtn.dispatchEvent('pointerup');
  await advanceFrames(page, 25);

  const after = await getState(page);
  expect(after.lines).toBe(10);
  expect(after.level).toBe(2);
  expect(after.statusMessage).toMatch(/tetris clear/i);
  expect(after.statusTone).toBe('milestone');
});

test('control deck buttons are keyboard-activatable via Enter', async ({ page }) => {
  await openGame(page);
  const initial = await getState(page);

  await page.locator('[data-action="rotate-cw"]').focus();
  await page.keyboard.press('Enter');
  const afterRotate = await getState(page);
  expect(afterRotate.current.rotation).toBe((initial.current.rotation + 1) % 4);

  await page.locator('[data-action="rotate-ccw"]').focus();
  await page.keyboard.press('Enter');
  const afterCcw = await getState(page);
  expect(afterCcw.current.rotation).toBe(initial.current.rotation);
});

test('NEXT and HOLD canvases render non-blank pixels after preview is set', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);
  await setState(page, { ...state, heldPiece: 'S', nextPieceType: 'I' });
  await advanceFrames(page, 1);

  const hasPixels = await page.evaluate(() => {
    function canvasHasContent(id) {
      const canvas = document.getElementById(id);
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      return Array.from(data).some((v, i) => i % 4 === 3 && v > 0);
    }
    return { next: canvasHasContent('next-canvas'), hold: canvasHasContent('hold-canvas') };
  });
  expect(hasPixels.next).toBe(true);
  expect(hasPixels.hold).toBe(true);
});

test('natural gravity locks piece immediately with no extra delay', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);
  await setState(page, {
    ...state,
    board: Array.from({ length: 20 }, () => Array(10).fill(0)),
    current: { type: 'O', index: 2, x: 4, y: 18, rotation: 0 },
    gravityTick: 47, lockTimer: 0
  });

  await advanceFrames(page, 1);
  const after = await getState(page);
  // Gravity fires and immediately locks (no LOCK_DELAY_FRAMES buffer on gravity drops)
  expect(after.board[18][4]).toBeGreaterThan(0);
  expect(after.current).not.toBeNull();
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

test('hold-preview div is keyboard-activatable via Space and Enter', async ({ page }) => {
  await openGame(page);
  const initial = await getState(page);
  expect(initial.heldPiece).toBeNull();

  // Space path
  await page.locator('[data-action="hold"]').focus();
  await page.keyboard.press('Space');
  const afterSpace = await getState(page);
  expect(afterSpace.heldPiece).toBe(initial.current.type);
  expect(afterSpace.holdUsed).toBe(true);
  expect(afterSpace.nextPieceType).not.toBeNull();

  // Drop the current piece so holdUsed resets, then test Enter path
  const hardBtn = page.locator('[data-action="hard-drop"]');
  await hardBtn.dispatchEvent('pointerdown');
  await advanceFrames(page, 1);
  await hardBtn.dispatchEvent('pointerup');
  await advanceFrames(page, 2);

  await page.locator('[data-action="hold"]').focus();
  await page.keyboard.press('Enter');
  const afterEnter = await getState(page);
  expect(afterEnter.holdUsed).toBe(true);
});

test('hold piece mechanic saves and swaps piece', async ({ page }) => {
  await openGame(page);
  const initial = await getState(page);
  const initialType = initial.current.type;
  const holdBox = page.locator('[data-action="hold"]');
  await expect(holdBox).toHaveClass(/hold-empty/);
  await expect(holdBox).not.toHaveClass(/hold-locked/);

  await page.keyboard.press('c');
  await advanceFrames(page, 1);
  const afterFirstHold = await getState(page);
  expect(afterFirstHold.heldPiece).toBe(initialType);
  expect(afterFirstHold.holdUsed).toBe(true);
  expect(afterFirstHold.current).not.toBeNull();
  expect(afterFirstHold.current.type).not.toBe(initialType);
  expect(afterFirstHold.nextPieceType).not.toBeNull();
  expect(afterFirstHold.statusMessage).toMatch(/hold/i);
  await expect(page.locator('#status')).toHaveText(afterFirstHold.statusMessage);
  await expect(holdBox).toHaveAttribute('aria-disabled', 'true');
  await expect(holdBox).toHaveAttribute('aria-label', `Hold piece: ${initialType}`);
  await expect(holdBox).toHaveClass(/hold-locked/);
  await expect(holdBox).not.toHaveClass(/hold-empty/);

  await page.keyboard.press('c');
  await advanceFrames(page, 1);
  const afterSecondAttempt = await getState(page);
  expect(afterSecondAttempt.heldPiece).toBe(initialType);
  expect(afterSecondAttempt.current.type).toBe(afterFirstHold.current.type);
  expect(afterSecondAttempt.statusMessage).toBe('Hold not available');
  await expect(page.locator('#status')).toHaveText('Hold not available');

  await page.keyboard.press('Space');
  await advanceFrames(page, 1);
  const afterDrop = await getState(page);
  expect(afterDrop.holdUsed).toBe(false);
  await expect(holdBox).toHaveAttribute('aria-disabled', 'false');
  await expect(holdBox).not.toHaveClass(/hold-locked/);

  const beforeSwapType = afterDrop.current.type;
  await page.keyboard.press('c');
  await advanceFrames(page, 1);
  const afterSwap = await getState(page);
  expect(afterSwap.heldPiece).toBe(beforeSwapType);
  expect(afterSwap.current.type).toBe(initialType);
  expect(afterSwap.nextPieceType).not.toBeNull();
  expect(afterSwap.statusMessage).toMatch(/hold/i);
  await expect(page.locator('#status')).toHaveText(afterSwap.statusMessage);
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

test('keyboard Space held does not chain hard-drop multiple pieces', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);
  await setState(page, {
    ...state,
    board: Array.from({ length: 20 }, () => Array(10).fill(0)),
    gravityFrames: 48, gravityTick: 0, lockTimer: 0, score: 0
  });

  // Simulate keyboard repeat: dispatch many keydown events with repeat: true
  await page.evaluate(() => {
    for (let i = 0; i < 50; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', repeat: true, bubbles: true }));
    }
  });
  await advanceFrames(page, 10);

  const after = await getState(page);
  // Without the event.repeat guard, Space repeat would hard-drop piece after piece;
  // with the guard, repeated keydown events are no-ops and the board stays alive.
  expect(after.gameOver).toBe(false);
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

test('first hold resets gravityTick so new piece gets a full gravity cycle', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);

  // Set gravityTick to 47 — one frame from firing at gravityFrames=48
  await setState(page, {
    ...state,
    heldPiece: null,
    holdUsed: false,
    gravityTick: 47,
    gravityFrames: 48,
    lockTimer: 0
  });
  const beforeY = (await getState(page)).current.y;

  await page.keyboard.press('c'); // first hold
  await advanceFrames(page, 1);  // one gravity tick on newly spawned piece
  const afterY = (await getState(page)).current.y;

  // Without the fix, the spawned piece inherits gravityTick=47 and drops on the first frame.
  expect(afterY).toBe(beforeY);
});

test('natural gravity fires and locks piece at floor without rendering error', async ({ page }) => {
  await openGame(page);
  const state = await getState(page);

  await setState(page, {
    ...state,
    board: Array.from({ length: 20 }, () => Array(10).fill(0)),
    current: { type: 'O', index: 2, x: 4, y: 18, rotation: 0 },
    gravityTick: 47, lockTimer: 0
  });

  await advanceFrames(page, 1);
  const after = await getState(page);
  // Gravity fired, piece was at floor → locked immediately, new piece spawned
  expect(after.current).not.toBeNull();
  expect(after.board[18][4]).toBeGreaterThan(0); // O-piece locked at y=18, cols 4-5
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
  await advanceFrames(page, 1);

  // Ghost should be rendered at row 13 (cols 4-5). Sample a pixel inside the ghost cell
  // at the predicted ghost position and verify it differs from the background (#080400).
  const ghostRow = 13;
  const ghostCol = 4;
  const hasGhostPixel = await page.evaluate(({ row, col }) => {
    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');
    const cellSize = canvas.width / 10; // 30px
    // Sample the left stroke edge of the ghost cell (strokeRect draws 2px inside the cell).
    // Ghost is rgba(255,255,255,0.22) over the background (#020617, r=2): r blends to ~58.
    const px = col * cellSize + 2;          // left stroke edge x
    const py = Math.floor(row * cellSize + cellSize / 2); // vertical midpoint
    const data = ctx.getImageData(px, py, 1, 1).data;
    // Background red channel = 2; ghost white stroke at 22% alpha raises it to ~58.
    return data[0] > 20;
  }, { row: ghostRow, col: ghostCol });
  expect(hasGhostPixel).toBe(true);

  // Also verify hard-drop lands at ghost position
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
    await advanceFrames(page, 1);
    await hard.dispatchEvent('pointerup');
    const hardened = await getState(page);
    expect(hardened.score).toBeGreaterThan(scoreBeforeHard);
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
