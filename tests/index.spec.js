import { test, expect } from '@playwright/test';

const games = [
  ['Dash Arena', './dash-arena/'], ['Brick Breaker', './brickbreaker/'],
  ['Tetris', './tetris/'], ['Tetris — 2P Versus', './tetris/versus.html'],
  ['2048', './2048/'], ['Snake', './snake/'], ['Asteroids', './asteroids/'],
  ['Pinball', './pinball/'], ['Space Invaders', './space-invaders/'],
  ['Sokoban', './sokoban/'], ['Pong', './pong/'], ['Pac-Man', './pacman/'],
  ['Minesweeper', './minesweeper/']
];

test.beforeEach(async ({ page }) => { await page.goto('./'); });

test('landing page lists all games', async ({ page }) => {
  await expect(page.locator('h1')).toContainText('HTML Games');
  const links = page.locator('ul li a');
  await expect(links).toHaveCount(games.length);
  await expect(links).toHaveText(games.map(([name]) => name));
});

test('game links point to correct subpaths', async ({ page }) => {
  for (const [name, href] of games) await expect(page.getByRole('link', { name, exact: true })).toHaveAttribute('href', href);
});

test('landing page opens Dash Arena under the collection base path', async ({ page }) => {
  await page.getByRole('link', { name: 'Dash Arena', exact: true }).click();
  await expect(page).toHaveURL(/\/dash-arena\/$/);
  await expect(page).toHaveTitle('Dash Arena');
});

test('landing page visual screenshot', async ({ page }) => {
  await expect(page).toHaveScreenshot('root-index-desktop.png', { animations: 'disabled', fullPage: false, maxDiffPixels: 10 });
});

test('landing page visual screenshot portrait', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page).toHaveScreenshot('root-index-portrait.png', { animations: 'disabled', fullPage: false, maxDiffPixels: 10 });
});
