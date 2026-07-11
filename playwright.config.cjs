'use strict';
// @ts-check
const { defineConfig } = require('@playwright/test');

// Auth E2E needs a host that can reach Supabase (local static server has no /api/config).
// When credentials are provided and no base URL is set, default to production deploy.
const hasAuthCreds = !!(
  (process.env.E2E_OUTLET_SLUG || process.env.E2E_TENANT) &&
  (process.env.E2E_USERNAME || process.env.E2E_USER) &&
  (process.env.E2E_PASSWORD || process.env.E2E_PASS)
);
const baseURL =
  process.env.E2E_BASE_URL ||
  (hasAuthCreds ? 'https://codearc-restrosuite.vercel.app' : 'http://127.0.0.1:4173');
const isLocal = /127\.0\.0\.1|localhost/.test(baseURL);

module.exports = defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    headless: true,
    trace: 'on-first-retry',
  },
  // Only spin local static server for unauthenticated smoke against localhost
  webServer: isLocal
    ? {
        command: 'node scripts/e2e-static-server.cjs 4173',
        url: 'http://127.0.0.1:4173/login.html',
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      }
    : undefined,
});
