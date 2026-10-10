import { defineConfig, devices } from '@playwright/test';

/**
 * Tes end-to-end dijalankan terhadap backend + database PENGEMBANGAN lokal (bukan produksi):
 * tes voting membuat suara sungguhan pada pemilihan yang sedang dibuka. Siapkan dengan:
 *   (server) npm run db:seed:demo -- --open
 * Tes admin opsional: isi E2E_ADMIN_EMAIL & E2E_ADMIN_PASSWORD.
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: 'npm --prefix ../server start',
          url: 'http://127.0.0.1:4000/api/health',
          reuseExistingServer: true,
          timeout: 60_000,
        },
        {
          command: 'npm run dev -- --host 127.0.0.1',
          url: baseURL,
          reuseExistingServer: true,
          timeout: 60_000,
        },
      ],
});
