// Uji rute: URL sebagai sumber kebenaran.
//
// Tiga hal yang dijaga, semuanya tidak terlihat dari build:
//   1. Tautan notifikasi push LAMA (`/?view=wali&tab=tagihan`) tetap mendarat
//      di tab yang benar. URL itu sudah terlanjur tersimpan di HP orang tua dan
//      tidak bisa ditarik kembali — pengalihannya harus hidup selamanya.
//   2. Tombol Back kembali ke tab sebelumnya, bukan keluar dari aplikasi.
//   3. Menyegarkan halaman di path dalam (`/admin?tab=billing`) tetap dilayani
//      SPA fallback, bukan 404.
const { test, expect } = require('@playwright/test');
const { masuk } = require('./helpers');

test.describe('rute', () => {
  test('tautan push lama ?view=&tab= dialihkan ke rute baru', async ({ page }) => {
    await masuk(page, 'wali');
    await page.goto('/?view=wali&tab=tagihan');

    await expect(page).toHaveURL(/\/wali\?tab=tagihan$/);
    await expect(page.getByRole('tab', { name: 'Tagihan', exact: true })).toHaveAttribute('aria-selected', 'true');
  });

  test('tombol Back kembali ke tab sebelumnya', async ({ page }) => {
    await masuk(page, 'admin');
    await page.getByRole('button', { name: 'Siswa', exact: true }).first().click();
    await expect(page).toHaveURL(/\/admin\?tab=siswa$/);

    await page.getByRole('button', { name: 'Billing', exact: true }).first().click();
    await expect(page).toHaveURL(/\/admin\?tab=billing$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/admin\?tab=siswa$/);
  });

  test('menyegarkan halaman di path dalam tidak menghasilkan 404', async ({ page }) => {
    await masuk(page, 'admin');
    await page.goto('/admin?tab=billing');
    await expect(page.getByText('Ekspor untuk pembukuan')).toBeVisible({ timeout: 25_000 });
    await expect(page).toHaveURL(/\/admin\?tab=billing$/);
  });
});
