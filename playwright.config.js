import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PORT ?? 8000);
const appBasePath = process.env.APP_BASE_PATH
  ? `/${process.env.APP_BASE_PATH.replace(/^\/+|\/+$/g, '')}/`
  : '/';
const localBaseURL = `http://127.0.0.1:${port}${appBasePath}`;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? localBaseURL;

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL,
    actionTimeout: 5_000,
    trace: 'on-first-retry'
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `PORT=${port} bun server.js`,
        url: localBaseURL,
        env: {
          BASE_PATH: appBasePath
        },
        reuseExistingServer: !process.env.CI,
        timeout: 20_000
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
