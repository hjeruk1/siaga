// Helper bersama untuk uji E2E.
//
// Akun demo berasal dari backend/init.js (dibuat ulang setiap kali uji jalan),
// jadi kredensial ini memang bagian dari fixture, bukan rahasia.
const { expect } = require('@playwright/test');

const AKUN = {
  admin: { username: 'admin', password: 'admin123' },
  guru: { username: 'guru1', password: 'admin123' },
  gerbang: { username: 'gerbang1', password: 'admin123' },
  kepsek: { username: 'kepsek1', password: 'admin123' },
  wali: { no_wa: '081200000000', password: 'admin123' }
};

async function masuk(page, siapa) {
  const akun = AKUN[siapa];
  if (!akun) throw new Error(`Akun uji tidak dikenal: ${siapa}`);
  await page.goto('/');
  await expect(page.locator('#siaga-password')).toBeVisible();
  if (akun.no_wa) {
    await page.getByRole('tab', { name: /Wali Murid/i }).click();
    await page.fill('#siaga-no-wa', akun.no_wa);
  } else {
    await page.fill('#siaga-username', akun.username);
  }
  await page.fill('#siaga-password', akun.password);
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  // Form login hilang = sesi terbentuk.
  await expect(page.locator('#siaga-password')).toHaveCount(0, { timeout: 20_000 });
}

// Absensi punya dua tampilan (kartu & daftar). Tombol "Check-in" hanya ada di
// tampilan kartu, jadi uji memastikan tampilan itu aktif.
async function bukaAbsensiKartu(page) {
  await page.goto('/?view=guru&tab=absensi');
  const tombol = page.getByRole('button', { name: 'Check-in' });
  if ((await tombol.count()) === 0) {
    await page
      .getByRole('button', { name: /Tampilan kartu/ })
      .click()
      .catch(() => {});
  }
  await expect(page.getByRole('button', { name: 'Check-in' }).first()).toBeVisible({ timeout: 20_000 });
}

module.exports = { AKUN, masuk, bukaAbsensiKartu };
