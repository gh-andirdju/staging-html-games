import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('landing page lists all games', async ({ page }) => {
  await expect(page.locator('h1')).toContainText('HTML Games');
  const links = page.locator('ul li a');
  await expect(links).toHaveCount(7);
  await expect(links.nth(0)).toHaveText('Brick Breaker');
  await expect(links.nth(1)).toHaveText('Tetris');
  await expect(links.nth(2)).toHaveText('2048');
  await expect(links.nth(3)).toHaveText('Snake');
  await expect(links.nth(4)).toHaveText('Asteroids');
  await expect(links.nth(5)).toHaveText('Pinball');
  await expect(links.nth(6)).toHaveText('Space Invaders');
});

test('game links point to correct subpaths', async ({ page }) => {
  await expect(page.locator('a[href="./brickbreaker/"]')).toBeVisible();
  await expect(page.locator('a[href="./tetris/"]')).toBeVisible();
  await expect(page.locator('a[href="./2048/"]')).toBeVisible();
  await expect(page.locator('a[href="./snake/"]')).toBeVisible();
  await expect(page.locator('a[href="./asteroids/"]')).toBeVisible();
  await expect(page.locator('a[href="./pinball/"]')).toBeVisible();
  await expect(page.locator('a[href="./space-invaders/"]')).toBeVisible();
});

test('landing page visual screenshot', async ({ page }) => {
  await expect(page).toHaveScreenshot('root-index-desktop.png');
});

test('landing page visual screenshot portrait', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page).toHaveScreenshot('root-index-portrait.png');
});
