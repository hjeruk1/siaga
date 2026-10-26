// Uji asap dashboard kepala sekolah.
//
// Satu-satunya peran yang sebelumnya nol cakupan browser, padahal justru
// halaman yang dibuka pertama kali setiap pagi. Dua hal yang dijaga:
//   1. Monitoring benar-benar memuat angka hari ini (bukan kerangka kosong).
//   2. Tab Laporan dan Keuangan memakai ringkasan yang sama — keduanya membaca
//      satu kunci cache, jadi kalau salah satunya berhenti memuat, uji ini
//      merah sebelum kepsek menyadarinya sendiri.
const { test, expect } = require('@playwright/test');
const { masuk } = require('./helpers');

test.describe('kepsek', () => {
  test('monitoring memuat ringkasan hari ini', async ({ page }) => {
    await masuk(page, 'kepsek');
    await expect(page.getByRole('heading', { name: 'Monitoring Hari Ini' })).toBeVisible({ timeout: 25_000 });
    // Kartu statistik hanya muncul setelah data datang; teks ini tidak ada di
    // kerangka pemuatan.
    await expect(page.getByText('CHECK-IN HARI INI')).toBeVisible();
    await expect(page.getByText('Belum check-in')).toBeVisible();
  });

  test('tab Laporan dan Keuangan memakai ringkasan yang sama', async ({ page }) => {
    await masuk(page, 'kepsek');

    await page.getByRole('button', { name: 'Laporan Harian', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Laporan Harian' })).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: 'Keuangan', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Laporan Keuangan' })).toBeVisible({ timeout: 20_000 });

    // Kembali ke monitoring: data dari cache, panel harus langsung terisi.
    await page.getByRole('button', { name: 'Monitoring', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Monitoring Hari Ini' })).toBeVisible();
    await expect(page.getByText('CHECK-IN HARI INI')).toBeVisible();
  });
});
