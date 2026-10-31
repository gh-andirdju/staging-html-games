import { defineConfig, devices } from '@playwright/test';
const port = Number(process.env.PORT || 5205);
const path = process.env.APP_BASE_PATH ? `/${process.env.APP_BASE_PATH.replace(/^\/+|\/+$/g, '')}/` : '/';
const localURL = `http://127.0.0.1:${port}${path}`;
export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  expect: { timeout: 5000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: 'list',
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL || localURL, trace: 'on-first-retry' },
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: `PORT=${port} BASE_PATH=${path} bun server.js`, url: localURL,
    reuseExistingServer: !process.env.CI
  },
  projects: [{ name: 'chromium', use: {
    ...devices['Desktop Chrome'],
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
  }}]
});
