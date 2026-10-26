// Konfigurasi uji E2E (Playwright Test).
//
// Uji ini berjalan terhadap BUILD PRODUKSI yang disajikan backend, bukan dev
// server. Alasannya bukan teoretis: dua regresi nyata hanya muncul di sana —
// tautan PDF yang dijawab 401 dan modal Billing yang selalu terbuka.
const path = require('path');
const { defineConfig } = require('@playwright/test');

const PORT = process.env.E2E_PORT || '4199';
const BASE = `http://127.0.0.1:${PORT}`;

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: /.*\.spec\.js$/,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Satu worker: semua uji berbagi satu database dan satu server.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: BASE,
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off'
  },
  webServer: {
    // Build dulu supaya yang diuji selalu kode terbaru, bukan dist basi.
    // cwd wajib di root: perintah webServer dijalankan dari folder config.
    command: 'npm run build && node scripts/e2e-server.js',
    cwd: path.resolve(__dirname, '..'),
    url: `${BASE}/api/health`,
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe'
  }
});
