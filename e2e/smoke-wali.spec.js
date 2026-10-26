// Uji asap portal wali.
//
// Yang dijaga: portal bisa dibuka, deep link tab bekerja (dulu parameter ?tab=
// dihapus sebelum view sempat membacanya), dan rapor PDF benar-benar bisa
// diambil browser lewat cookie HttpOnly — bukan 401.
const { test, expect } = require('@playwright/test');
const { masuk } = require('./helpers');

test.describe('wali', () => {
  test.beforeEach(async ({ page }) => {
    await masuk(page, 'wali');
  });

  test('portal memuat tab utama', async ({ page }) => {
    await expect(page.getByRole('tab', { name: /Catatan/ })).toBeVisible({ timeout: 25_000 });
    await expect(page.getByRole('tab', { name: /Galeri/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Tagihan/ })).toBeVisible();
  });

  test('deep link ?tab=laporan mendarat di tab yang benar', async ({ page }) => {
    await page.goto('/?tab=laporan');
    await expect(page.getByText('Laporan absensi bulanan')).toBeVisible({ timeout: 25_000 });
  });

  test('rapor bulanan bisa diambil lewat cookie media', async ({ page }) => {
    await page.goto('/?tab=laporan');
    const tautan = page.getByRole('link', { name: /Rapor bulanan/ });
    await expect(tautan).toBeVisible({ timeout: 25_000 });
    const href = await tautan.getAttribute('href');
    expect(href).toMatch(/\/api\/rapor\/\d+\/pdf\?bulan=\d{4}-\d{2}/);

    // request bawaan Playwright memakai cookie context yang sama dengan browser
    // — persis seperti <a href> saat diklik orang tua.
    const res = await page.request.get(href);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type'] || '').toContain('application/pdf');
  });

  test('tab galeri terbuka', async ({ page }) => {
    await page.goto('/?tab=galeri');
    await expect(page.getByText('Galeri kegiatan')).toBeVisible({ timeout: 25_000 });
  });
});
