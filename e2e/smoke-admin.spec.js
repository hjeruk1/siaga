// Uji asap panel admin.
//
// Dua regresi yang pernah lolos ke produksi dan kini dijaga di sini:
//   1. Modal "Catat Pembayaran" terbuka sendiri setiap kali tab Billing dibuka
//      (dirender tanpa gerbang), menutupi seluruh halaman.
//   2. Tautan PDF dijawab 401 karena rutenya tidak menerima cookie media.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { masuk } = require('./helpers');

test.describe('admin', () => {
  test.beforeEach(async ({ page }) => {
    await masuk(page, 'admin');
  });

  test('tab Billing terbuka tanpa modal yang menutupi halaman', async ({ page }) => {
    await page.goto('/?view=admin&tab=billing');
    await expect(page.getByText('Ekspor untuk pembukuan')).toBeVisible({ timeout: 25_000 });
    await expect(page.locator('div.fixed.inset-0')).toHaveCount(0);

    // Modal tetap bisa dibuka lewat tombolnya sendiri.
    await page.getByText('Catat Pembayaran', { exact: true }).first().click();
    await expect(page.locator('div.fixed.inset-0')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('div.fixed.inset-0')).toHaveCount(0);
  });

  test('ekspor tagihan mengunduh CSV yang benar', async ({ page }) => {
    await page.goto('/?view=admin&tab=billing');
    await expect(page.locator('#ekspor-periode')).toBeVisible({ timeout: 25_000 });
    await page.fill('#ekspor-periode', '2026-09');

    const kartu = page
      .locator('div')
      .filter({ has: page.locator('#ekspor-periode') })
      .last();
    const [unduhan] = await Promise.all([
      page.waitForEvent('download'),
      kartu.getByRole('button', { name: 'Tagihan', exact: true }).click()
    ]);
    expect(unduhan.suggestedFilename()).toMatch(/^Keuangan_Tagihan_2026-09.*\.csv$/);

    const isi = fs.readFileSync(await unduhan.path(), 'utf8');
    expect(isi).toContain('"Cabang","Siswa","Rombel","Periode"');
    expect(isi).toContain('Belum dibayar');
  });

  // Tiga panel bersama (dipakai admin, kepsek, dan guru) — dulu satu-satunya
  // yang memuat datanya lewat effect manual. Kalau salah satunya berhenti
  // memuat, gejalanya "kerangka kosong" yang tidak terlihat dari build.
  test('panel izin, pengumuman, dan rekap memuat isinya', async ({ page }) => {
    await page.goto('/admin?tab=izin');
    await expect(page.getByRole('heading', { name: 'Izin & sakit', exact: true })).toBeVisible({ timeout: 25_000 });

    await page.goto('/admin?tab=pengumuman');
    await expect(page.getByRole('heading', { name: 'Pengumuman', exact: true })).toBeVisible({ timeout: 25_000 });

    await page.goto('/admin?tab=rekap');
    await expect(page.getByRole('heading', { name: 'Rekap Absensi Bulanan', exact: true })).toBeVisible({
      timeout: 25_000
    });
    // Matriks butuh data; angka kehadiran hanya muncul setelah rekap termuat.
    await expect(page.getByText('KEHADIRAN')).toBeVisible();
  });

  // Pratinjau generate adalah satu-satunya tempat admin melihat apa yang AKAN
  // ditagihkan sebelum menekan konfirmasi. Modal ini pernah dipindah ke
  // berkasnya sendiri tanpa uji; di sini jalurnya dikunci.
  test('pratinjau generate tagihan tampil sebelum konfirmasi', async ({ page }) => {
    await page.goto('/admin?tab=billing');
    await page.getByRole('button', { name: 'Tagihan', exact: true }).first().click();

    await page
      .getByRole('button', { name: /Generate Tagihan/ })
      .first()
      .click();

    // Admin wajib memilih cabang dulu — tanpa itu `previewBulanan` menolak
    // dengan toast, bukan membuka pratinjau.
    await page.getByRole('combobox').filter({ hasText: 'Pilih Cabang...' }).click();
    await page.getByRole('option', { name: 'Godean' }).click();

    await page.getByRole('button', { name: 'Pilih bulan' }).click();
    await page.getByRole('button', { name: 'Okt', exact: true }).click();
    await page.getByRole('button', { name: 'Bulanan', exact: true }).click();

    const pratinjau = page.getByRole('dialog', { name: /Preview Generate/ });
    await expect(pratinjau).toBeVisible({ timeout: 25_000 });
    // Isinya harus menjelaskan hasilnya, bukan sekadar kerangka kosong.
    await expect(pratinjau.getByText(/Tagihan baru|sudah ada dan akan dilewati|Tidak ada tagihan/)).toBeVisible();

    // Batal = tidak ada yang dibuat.
    await pratinjau.getByRole('button', { name: 'Batal' }).click();
    await expect(pratinjau).toHaveCount(0);
  });

  test('kartu pengingat, penyimpanan, dan retensi tampil di Konfigurasi', async ({ page }) => {
    await page.goto('/?view=admin&tab=config');
    await expect(page.getByText('Pengingat tagihan')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText('Penyimpanan server')).toBeVisible();
    // Kartu retensi memuat pratinjau dari server; kalau endpoint-nya rusak,
    // kartunya berhenti di "Membaca kebijakan retensi" dan uji ini gagal.
    await expect(page.getByText('Retensi galeri')).toBeVisible();
    await expect(page.getByText('Akan diarsipkan')).toBeVisible();
    await expect(page.getByText('Jalankan sekarang')).toBeVisible();
  });
});
