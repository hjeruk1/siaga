// Uji alur kritikal — tiga jalur yang paling mahal kalau rusak diam-diam.
//
// Uji asap (smoke-*.spec.js) membuktikan halaman terbuka. Berkas ini
// membuktikan pekerjaan benar-benar selesai:
//
//   1. Akun staff baru → password sementara → wajib ganti password → dashboard.
//      Kalau gerbang ini jebol, akun bersandi sementara bisa dipakai selamanya.
//   2. Pembayaran tunai → pratinjau alokasi FIFO → tersimpan, dan tagihannya
//      berubah jadi Lunas. Ini jalur uang; salah alokasi berarti orang tua
//      membayar tagihan yang salah.
//   3. Scan QR penjemput → siswa berstatus menunggu. Ini jalur anak pulang.
//
// Uji ini mengubah data (membuat akun, membayar tagihan), karena itu server uji
// TIDAK boleh dipakai ulang antar-jalan — lihat `reuseExistingServer` di
// playwright.config.js.
const { test, expect } = require('@playwright/test');
const { masuk } = require('./helpers');

test.describe('alur kritikal', () => {
  test('staff baru wajib mengganti password sementara sebelum bisa masuk', async ({ page }) => {
    await masuk(page, 'admin');
    const akhiran = Date.now();
    const username = `ujistaff${akhiran}`;

    await page.goto('/?view=admin&tab=staff');
    await page.getByRole('button', { name: 'Tambah Staff' }).first().click();

    const modal = page.getByRole('dialog', { name: 'Tambah Staff' });
    await expect(modal).toBeVisible({ timeout: 20_000 });
    await modal.getByLabel('Nama Lengkap').fill('Petugas Uji');
    await modal.getByLabel('Username').fill(username);

    // Role bawaan form adalah "guru", jadi cukup cabang yang perlu dipilih.
    await modal.getByRole('combobox').filter({ hasText: 'Pilih cabang' }).click();
    await page.getByRole('option', { name: 'Godean' }).click();
    await modal.getByRole('button', { name: 'Tambah Staff' }).click();

    // Password sementara ditampilkan sekali; uji membacanya dari dialog.
    const pwDialog = page.getByRole('dialog', { name: 'Password Sementara' });
    await expect(pwDialog).toBeVisible({ timeout: 20_000 });
    const sementara = (await page.locator('#staff-temp-password').innerText()).trim();
    expect(sementara.length).toBeGreaterThan(5);
    await page.keyboard.press('Escape');

    // Akun baru harus langsung muncul di daftar. Ini yang membuktikan jalur
    // "simpan lalu muat ulang" benar-benar jalan setelah daftar pindah ke
    // React Query (refetch menggantikan pemanggilan load manual).
    await expect(page.getByText('Petugas Uji').first()).toBeVisible({ timeout: 20_000 });

    // Keluar lewat tombol sidebar, bukan menghapus token: yang diuji adalah
    // jalur yang benar-benar dipakai admin.
    await page.getByRole('button', { name: 'Keluar' }).first().click();
    await expect(page.locator('#siaga-password')).toBeVisible({ timeout: 20_000 });

    await page.fill('#siaga-username', username);
    await page.fill('#siaga-password', sementara);
    await page.getByRole('button', { name: 'Masuk', exact: true }).click();

    // Gerbang wajib ganti password: bukan dashboard, bukan form login.
    await expect(page.getByText('Ganti password')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/password sementara harus diganti/i)).toBeVisible();

    await page.getByLabel('Password baru', { exact: true }).fill('RahasiaBaru123');
    await page.getByLabel('Ulangi password baru').fill('RahasiaBaru123');
    await page.getByRole('button', { name: 'Simpan' }).click();

    // Sesi baru terbentuk: sidebar dengan nama pengguna tampil.
    await expect(page.getByText('Petugas Uji').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Ganti password')).toHaveCount(0);
  });

  test('pembayaran tunai teralokasi FIFO dan tagihannya jadi lunas', async ({ page }) => {
    await masuk(page, 'admin');
    await page.goto('/?view=admin&tab=billing');
    await page.getByText('Catat Pembayaran', { exact: true }).first().click();

    const modal = page.getByRole('dialog', { name: 'Catat Pembayaran Siswa' });
    await expect(modal).toBeVisible({ timeout: 20_000 });

    await modal.getByRole('combobox').filter({ hasText: 'Pilih Siswa' }).click();
    await page.getByPlaceholder('Cari nama siswa…').fill('Zahra');
    await page.getByRole('option', { name: /Zahra Kamila/ }).click();

    await modal.getByPlaceholder('Nominal pembayaran').fill('650000');

    // Pratinjau FIFO dihitung server: tagihan terlama dipelunasi lebih dulu.
    // Inilah yang membedakan "uang tercatat" dari "tagihan terbayar".
    const pratinjau = modal.locator('table');
    await expect(pratinjau.getByText('SPP Agustus 2026')).toBeVisible({ timeout: 20_000 });
    await expect(pratinjau.getByText('Rp 650.000').first()).toBeVisible();
    await expect(modal.getByText(/Sisa dana belum dialokasikan/)).toHaveCount(0);

    await modal.getByRole('button', { name: /Simpan & Catat Pembayaran/ }).click();

    // Nomor kuitansi hanya keluar kalau pembayaran benar-benar tersimpan.
    await expect(page.getByText(/Pembayaran: \S+/)).toBeVisible({ timeout: 20_000 });

    // Bukti akhir: tagihannya tidak lagi "Belum Bayar".
    await page.getByRole('button', { name: 'Tagihan', exact: true }).first().click();
    const baris = page.locator('tr', { hasText: 'SPP Agustus 2026' }).first();
    await expect(baris).toBeVisible({ timeout: 20_000 });
    await expect(baris.getByText('Lunas')).toBeVisible();
  });

  test('scan QR penjemput menandai siswa menunggu dijemput', async ({ page }) => {
    await masuk(page, 'gerbang');
    await expect(page.getByPlaceholder('Scan QR penjemput...')).toBeVisible({ timeout: 25_000 });

    // Jalur utama petugas: tempel/ketik kode QR lalu Enter, tanpa kamera.
    await page.getByPlaceholder('Scan QR penjemput...').fill('E2E-PICKUP-1');
    await page.getByPlaceholder('Scan QR penjemput...').press('Enter');

    await expect(page.getByText('Penjemput valid')).toBeVisible({ timeout: 20_000 });
    // Nama siswa muncul di kartu hasil, di log aktivitas, dan di toast —
    // `.first()` menunjuk kartu hasilnya.
    await expect(page.getByText('Bintang Uji').first()).toBeVisible();
    await expect(page.getByText(/Dijemput oleh Bapak Uji/)).toBeVisible();
  });
});
