// Uji asap sisi guru: absensi dan antrean offline.
//
// Antrean offline diuji dengan memutus jaringan di level browser, bukan dengan
// memalsukan state: yang ingin dipastikan adalah perilaku nyata saat sinyal
// hilang — absensi tersimpan, lalu terkirim sendiri ketika online.
const { test, expect } = require('@playwright/test');
const { masuk, bukaAbsensiKartu } = require('./helpers');

test.describe('guru', () => {
  test.beforeEach(async ({ page }) => {
    await masuk(page, 'guru');
  });

  test('tab absensi memuat daftar siswa', async ({ page }) => {
    await page.goto('/?view=guru&tab=absensi');
    await expect(page.getByRole('heading', { name: 'Absensi Kelas' })).toBeVisible({ timeout: 25_000 });
    await expect(page.getByRole('button', { name: 'Check-in' }).first()).toBeVisible({ timeout: 20_000 });
  });

  test('check-in saat offline masuk antrean dan tersinkron ketika online', async ({ page, context }) => {
    await bukaAbsensiKartu(page);
    // Jumlah tombol Check-in sebelum apa pun terjadi: satu per siswa yang belum
    // masuk. Dipakai untuk membuktikan daftar benar-benar disegarkan setelah
    // antrean terkirim — bukan hanya toast-nya muncul.
    const tombolAwal = await page.getByRole('button', { name: 'Check-in' }).count();

    await context.setOffline(true);
    await page.getByRole('button', { name: 'Check-in' }).first().click();
    await expect(page.getByText(/disimpan di perangkat/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/absensi tersimpan di perangkat/)).toBeVisible();

    const antrean = await page.evaluate(() => {
      const kunci = Object.keys(localStorage).find((k) => k.startsWith('siaga_absensi_antrean_'));
      return kunci ? JSON.parse(localStorage.getItem(kunci)).length : 0;
    });
    expect(antrean).toBe(1);

    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.getByText(/absensi terkirim/)).toBeVisible({ timeout: 20_000 });

    const sisa = await page.evaluate(() => {
      const kunci = Object.keys(localStorage).find((k) => k.startsWith('siaga_absensi_antrean_'));
      return kunci ? JSON.parse(localStorage.getItem(kunci)).length : 0;
    });
    expect(sisa).toBe(0);

    // Daftar ikut menyegarkan diri: siswa yang baru check-in tidak lagi punya
    // tombol Check-in. Sebelum perbaikan ini, layar guru tetap menampilkan
    // status lama sampai ia melakukan hal lain.
    await expect(page.getByRole('button', { name: 'Check-in' })).toHaveCount(tombolAwal - 1, { timeout: 20_000 });
  });

  test('tab galeri tersedia untuk guru', async ({ page }) => {
    await page.goto('/?view=guru&tab=galeri');
    await expect(page.getByText('Galeri kegiatan')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByRole('button', { name: 'Unggah foto' })).toBeVisible();
  });
});
