// Uji deep-load: setiap view/tab dibuka LANGSUNG lewat URL-nya, bukan diklik
// dari tab lain.
//
// Kenapa uji ini ada. Selama migrasi React Query, empat kali kode yang lolos
// `npm run build`, lint, dan seluruh uji unit tetap memutihkan halaman karena
// `ReferenceError: Cannot access 'x' before initialization` — nilai yang dulu
// `useState` di atas komponen dipindah ke bawah sebagai turunan query, sementara
// pemakaiannya tertinggal di atas. Build tidak menangkapnya (itu error runtime),
// dan navigasi klik pun tidak selalu: sebagian hanya muncul saat halaman dimuat
// dari nol di path dalam.
//
// Karena itu uji ini melakukan dua hal untuk setiap tab:
//   1. mencatat `pageerror` selama halaman dimuat — nol toleransi;
//   2. memastikan isi tab benar-benar dirender (judul panel / tab aktif),
//      supaya "halaman kosong tanpa error" juga ketahuan.
const { test, expect } = require('@playwright/test');
const { masuk } = require('./helpers');

// `judul` = heading yang wajib terlihat. `tab` = untuk portal wali, yang
// membuktikan dirinya lewat tab aktif (isinya berubah per tab, tetapi judul
// panelnya tidak).
const KASUS = [
  // --- Admin pusat: seluruh tab sidebar ---
  { peran: 'admin', url: '/admin?tab=cabang', judul: 'Cabang Taruna Prima' },
  { peran: 'admin', url: '/admin?tab=siswa', judul: 'Data Siswa' },
  { peran: 'admin', url: '/admin?tab=staff', judul: 'Staff' },
  { peran: 'admin', url: '/admin?tab=wali', judul: 'Akun Wali' },
  { peran: 'admin', url: '/admin?tab=rombel', judul: 'Rombel' },
  { peran: 'admin', url: '/admin?tab=billing', judul: 'Billing' },
  { peran: 'admin', url: '/admin?tab=laporan', judul: 'Histori & Koreksi Laporan Harian' },
  { peran: 'admin', url: '/admin?tab=izin', judul: 'Izin & sakit' },
  { peran: 'admin', url: '/admin?tab=pengumuman', judul: 'Pengumuman' },
  { peran: 'admin', url: '/admin?tab=kegiatan', judul: 'Galeri kegiatan' },
  { peran: 'admin', url: '/admin?tab=rekap', judul: 'Rekap Absensi Bulanan' },
  { peran: 'admin', url: '/admin?tab=config', judul: 'Konfigurasi Operasional' },
  { peran: 'admin', url: '/admin?tab=kalender', judul: 'Kalender Akademik' },
  { peran: 'admin', url: '/admin?tab=audit', judul: 'Audit Log' },

  // --- Guru ---
  { peran: 'guru', url: '/guru?tab=daily', judul: 'Daily Record' },
  { peran: 'guru', url: '/guru?tab=absensi', judul: 'Absensi Kelas' },
  { peran: 'guru', url: '/guru?tab=modulAjar', judul: 'Focus Theme Mingguan' },
  { peran: 'guru', url: '/guru?tab=izin', judul: 'Izin & sakit' },
  { peran: 'guru', url: '/guru?tab=galeri', judul: 'Galeri kegiatan' },

  // --- Kepala sekolah ---
  { peran: 'kepsek', url: '/kepsek?tab=monitoring', judul: 'Monitoring Hari Ini' },
  { peran: 'kepsek', url: '/kepsek?tab=laporan', judul: 'Laporan Harian' },
  { peran: 'kepsek', url: '/kepsek?tab=rekap', judul: 'Rekap Absensi Bulanan' },
  { peran: 'kepsek', url: '/kepsek?tab=keuangan', judul: 'Laporan Keuangan' },
  { peran: 'kepsek', url: '/kepsek?tab=notifikasi', judul: 'Notifikasi' },
  { peran: 'kepsek', url: '/kepsek?tab=izin', judul: 'Izin & sakit' },
  { peran: 'kepsek', url: '/kepsek?tab=pengumuman', judul: 'Pengumuman' },

  // --- Portal wali: tabnya mengelola dirinya sendiri, jadi diperiksa lewat
  //     status tab aktif (aria-selected). ---
  { peran: 'wali', url: '/wali?tab=catatan', tab: 'Catatan' },
  { peran: 'wali', url: '/wali?tab=kehadiran', tab: 'Kehadiran' },
  { peran: 'wali', url: '/wali?tab=izin', tab: 'Izin' },
  { peran: 'wali', url: '/wali?tab=galeri', tab: 'Galeri' },
  { peran: 'wali', url: '/wali?tab=tagihan', tab: 'Tagihan' },
  { peran: 'wali', url: '/wali?tab=laporan', tab: 'Laporan' },

  // --- Pos gerbang: satu layar, tanpa tab ---
  { peran: 'gerbang', url: '/gerbang', placeholder: 'Scan QR penjemput...' }
];

for (const peran of ['admin', 'guru', 'kepsek', 'wali', 'gerbang']) {
  test.describe(`deep load · ${peran}`, () => {
    for (const kasus of KASUS.filter((k) => k.peran === peran)) {
      test(`${kasus.url}`, async ({ page }) => {
        // Dikumpulkan sejak login: kalau sesi bootstrap pun melempar error,
        // itu juga harus gagal di sini.
        const galat = [];
        page.on('pageerror', (e) => galat.push(e.message));

        await masuk(page, peran);
        await page.goto(kasus.url);

        if (kasus.judul) {
          await expect(page.getByRole('heading', { name: kasus.judul, exact: true })).toBeVisible({
            timeout: 25_000
          });
        } else if (kasus.tab) {
          await expect(page.getByRole('tab', { name: kasus.tab, exact: true })).toHaveAttribute(
            'aria-selected',
            'true',
            { timeout: 25_000 }
          );
        } else if (kasus.placeholder) {
          await expect(page.getByPlaceholder(kasus.placeholder)).toBeVisible({ timeout: 25_000 });
        }

        // URL tidak boleh teralihkan ke view bawaan: itu tanda path yang kita
        // minta tidak dikenali router (mis. tab baru lupa didaftarkan).
        expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(kasus.url);

        expect(galat, `pageerror saat memuat ${kasus.url}: ${galat.join(' | ')}`).toEqual([]);
      });
    }
  });
}
