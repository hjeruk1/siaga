# SIAGA — Rencana Perbaikan Tech Stack

> Disusun: 16 Oktober 2026
> Basis: audit tech stack + audit layer framework
> Branch kerja: `chore/tech-stack-improvements` (`main` tidak disentuh)

---

## 0. Status Eksekusi

**Selesai dan terverifikasi.** Semua dijalankan di branch kerja, satu fase satu commit.

| Fase | Isi | Status |
|------|-----|--------|
| 0 | Amankan WIP + verifikasi CI | Selesai |
| 1 | Flakiness test, konsolidasi config Vite, ESLint + Prettier | Selesai |
| — | Prettier massal (commit terpisah) | Selesai |
| 2.1 | Express 4 → 5, hapus `async-route.js` | Selesai |
| 2.2 | Validasi Zod (5 endpoint kritikal) | Selesai |
| 2.3 | Structured logging (pino) | Selesai |
| 2.4 | Error tracking opsional (Sentry) | Selesai |
| 3.1 | Migration runner (ganti 43 blok ALTER ad-hoc) | Selesai |
| 3.2 | Otomasi backup (systemd timer) | Selesai |
| 3.3 | Readiness check | Selesai |
| 4.1 | React 18 → 19 + pemisahan vendor chunk | Selesai |
| 5.1 | Pecah GuruView (2895→1341), SiswaTab (1943→1009), BillingTab (2408→1219) | Selesai |
| 5.2 | Rename `admin/shared.jsx` → `AdminShared.jsx` | Selesai |
| 6.1 | Test unit frontend (37 test) | Selesai |
| 6.2 | E2E alur kritikal (wajib ganti password, bayar→FIFO, QR penjemput) | Selesai |
| 5.3 | Konsolidasi design token — `index.css` satu sumber, perantara JSON dihapus | Selesai |
| — | Lint 57 warning → 0 (unused, entitas JSX, fast-refresh, deps effect) | Selesai |
| 4.3 | React Router (path = view, `?tab=` = sub-tab, redirect tautan lama) | Selesai |

**Selesai dengan pengecualian tertulis** — alasannya di §12:

| Item | Catatan |
|------|---------|
| 4.2 | TanStack Query — 17 komponen selesai (pengecualian di §12) |


**Angka akhir:** 420 test lulus (315 backend + 90 frontend + 15 alur workflow)
+ **53 E2E** (20 alur asap/kritikal + 33 uji deep-load), lint 0 error dan
**0 warning**, build hijau.

`npm audit`: root + frontend **0 vulnerability**; backend **0 high**
(`body-parser` dan `multer` sudah dinaikkan lewat `npm audit fix`). Sisa **19
moderate** berasal dari rantai `@sentry/node → @opentelemetry/*` dan
`mammoth → argparse → sprintf-js` — keduanya hanya aktif bila fitur opsionalnya
dipakai, dan menutupnya butuh bump mayor.

**Catatan proses:** `npm test` bukan hanya tes backend — beberapa berkas di
`scripts/` memindai sumber frontend (`adminview-stabilization`). Suite ini
sempat merah delapan commit karena setelah refactor frontend saya hanya
menjalankan E2E + tes frontend. Aturannya sekarang: **setiap perubahan frontend
tetap diakhiri `npm test`.**

---

## 0b. Batch Optimasi Performa & Operasional

Dikerjakan setelah audit optimasi. Semua diukur, bukan diperkirakan.

| Item | Sebelum | Sesudah |
|------|---------|---------|
| `audit-log` (ORDER BY created_at) | 20,3 ms | **0,2 ms** (110x) |
| `daily-record/today` | N query | **2 query** (tetap) |
| `generate-bulanan/preview` | ~1+3N query | **7 query** (tetap) |
| `/api/master/rombel` di kabel | 5737 B | **468 B** (hemat 92%) |

**Index** (`migrations/002_add_hot_query_indexes.js`, 7 index) — dipilih setelah
menelusuri pola query nyata. `pembayaran_alokasi` sebelumnya hanya punya primary
key padahal dipakai sebagai subquery korelatif **per baris** hasil.

**N+1** — `daily-record` (config per siswa → LEFT JOIN) dan 4 endpoint
`generate-*` (enrollment + diskon per siswa → batch query, statement disiapkan
di luar loop). `enrollmentAt`, `enrollmentOverlap`, dan `discounts` dihapus
karena tak lagi terpakai.

**Retensi** (`scripts/maintenance.js`) — `audit_log` 730 hari, `nfc_scan_log`
180 hari, `penjemputan_log` **default nonaktif** karena data bisnis. Ada
`--dry-run`, dan `VACUUM` opt-in.

**Infra ke repo** — `deploy/nginx/siaga.conf`, `deploy/nginx/proxy_params.conf`,
`deploy/systemd/siaga.service`. Sebelum ini hanya ada di server.

**Frontend** — `loading="lazy"` pada 9 gambar di daftar/grid; nama cache service
worker kini per-build (sebelumnya cache build lama menumpuk selamanya).

### Bug yang ditemukan saat mengerjakan

1. **Middleware `compression` mematikan stream SSE.** Filter memakai `req.url`,
   tetapi filter dievaluasi di dalam handler route — di titik itu Express sudah
   memangkas `req.url` menjadi `/stream`. Pengecekan `/api/absensi/stream`
   tidak pernah cocok, stream ikut terkompresi, dan buffering mematikan absensi
   real-time tanpa pesan error. Perbaikan: `req.originalUrl`.

2. **Saran debounce pencarian saya sendiri salah.** Semua `searchQuery` memfilter
   data yang sudah dimuat di dalam `useMemo` — tidak ada panggilan jaringan per
   ketikan. Debounce hanya akan menunda umpan balik, jadi tidak dikerjakan.

3. **Dugaan index saya juga sebagian salah.** `absensi(siswa_id,tanggal)` sudah
   ada lewat `UNIQUE(siswa_id,tanggal)`, dan tidak ada query yang memfilter
   absensi hanya per cabang — jadi index yang saya duga perlu ternyata tidak perlu.

---

## 1. Temuan Baseline (terverifikasi)

| Item | Hasil |
|------|-------|
| Test suite (`npm test`) | **63 lulus, 0 gagal** |
| Build frontend | **Hijau**, 9.77s, dist 1.8 MB |
| Working tree | **Kotor** — refactor besar belum di-commit |
| CI | Sudah ada (`.github/workflows/ci.yml`), belum pernah diverifikasi jalan |

### Perubahan yang belum di-commit (WIP dari sesi sebelumnya)

- `frontend/src/views/AdminView.jsx` — dipangkas 5188 baris, dipecah ke `frontend/src/views/admin/` (11 tab)
- Migrasi Tailwind 4 — `postcss.config.js` & `tailwind.config.js` dihapus
- `scripts/billing-money.test.js` (baru), `scripts/adminview-stabilization.test.js` (diubah)
- `.github/workflows/ci.yml` (baru)

**Risiko:** semua ini hanya ada di disk. Satu `git checkout` yang salah = hilang.

### Masalah yang ditemukan saat verifikasi

- `scripts/run-tests.js` — `waitForServer()` hanya memberi **8 detik**. Cold start di Windows
  (better-sqlite3 + WAL + antivirus) sering melewatinya → test **flaky**. Terbukti: run pertama
  gagal, run kedua lulus dengan kode yang sama.

---

## 2. Prinsip Eksekusi

1. **Jangan sentuh database produksi.** Test selalu pakai DB di temp dir.
2. **Satu fase = satu commit.** Bisa di-revert terpisah.
3. **Verifikasi tiap fase:** `npm test` + `npm run build` harus tetap hijau.
4. **Kerjakan di branch**, `main` tidak disentuh sampai user memutuskan merge.
5. **Tidak ada perubahan perilaku** di fase hygiene — hanya struktur & tooling.

---

## 3. Fase 0 — Amankan (SEGERA)

| # | Tugas | Risiko |
|---|-------|--------|
| 0.1 | Commit WIP yang belum tersimpan ke branch kerja | Nol |
| 0.2 | Verifikasi CI benar-benar jalan (node 22, urutan install) | Nol |

**Kenapa penting:** tanpa ini, semua pekerjaan berikutnya menumpuk di atas kode yang belum punya titik balik.

---

## 4. Fase 1 — Fondasi & Hygiene

| # | Tugas | Risiko | Dampak |
|---|-------|--------|--------|
| 1.1 | Perbaiki flakiness `waitForServer` (8s → 60s) | Nol | Test bisa dipercaya |
| 1.2 | Konsolidasi konfigurasi Vite (3 sumber → 1) | Nol | Hilangkan config mati |
| 1.3 | ESLint + Prettier (config + script, tanpa reformat massal) | Nol | Cegah drift |
| 1.4 | Tambah `.workbuddy-ai/` ke `.gitignore` | Nol | `git status` bersih |

**Catatan 1.2:** `frontend/vite.config.js` saat ini **tidak direferensikan script mana pun** —
`dev.mjs` dan `build.mjs` sama-sama memakai `configFile: false` lalu mendeklarasi plugin sendiri.
Tiga sumber konfigurasi, satu di antaranya mati.

**Catatan 1.3:** ESLint dipasang **non-blocking** (aturan berat = `warn`) sampai kode bersih.
Sejak 57 warning dibersihkan, `npm run lint` dan `npm run format:check` sudah jadi langkah
**blocking** di `.github/workflows/ci.yml` — 0 error, 0 warning. Reformat Prettier massal
dilakukan sebagai commit terpisah agar tidak mengaburkan diff logika.

---

## 5. Fase 2 — Backend Framework

| # | Tugas | Risiko | Dampak |
|---|-------|--------|--------|
| 2.1 | Express 4.22 → 5, hapus `utils/async-route.js` | Sedang | Async error native, route matching lebih ketat |
| 2.2 | Validasi input dengan Zod (endpoint kritikal dulu) | Sedang | Cegah input malformed |
| 2.3 | Structured logging (pino) + request id | Rendah | Jejak error di produksi |
| 2.4 | Error tracking (Sentry) — env-gated, mati tanpa DSN | Rendah | Visibilitas error nyata |

**Catatan 2.1:** `async-route.js` hanya dipakai 3 dari 12 file route
(`daily-record.js`, `pengguna.js`, `siswa.js`) — Express 5 menangani promise rejection secara native.

---

## 6. Fase 3 — Operasional

| # | Tugas | Risiko | Dampak |
|---|-------|--------|--------|
| 3.1 | Migration runner SQLite (bernomor, terlacak) | Sedang | Skema aman berevolusi |
| 3.2 | Backup otomatis (systemd timer + `scripts/backup.js`) | Nol | Lindungi data produksi |
| 3.3 | Perluas `/api/health` → health/readiness | Nol | Monitoring |

**Kenapa 3.2 penting:** `scripts/backup.js` sudah bagus (ada `integrity_check` + retensi), tapi
belum ada yang memanggilnya otomatis. Ini mitigasi risiko data hilang yang jauh lebih murah
daripada migrasi PostgreSQL.

---

## 7. Fase 4 — Frontend Framework (BUTUH KEPUTUSAN)

| # | Tugas | Risiko | Dampak |
|---|-------|--------|--------|
| 4.1 | React 18.3 → 19 | Sedang | `useOptimistic`, Actions, ref-as-prop |
| 4.2 | TanStack Query (ganti pola fetch manual di ~160 endpoint) | **Tinggi** | Hapus ratusan baris boilerplate, fix double-fetch |
| 4.3 | React Router v7 (ganti routing custom di `App.jsx`) | **Tinggi** | Deep-linking, back-button, route guard |

**Catatan:** 4.2 dan 4.3 menyentuh hampir seluruh view. Ini refactor multi-hari dengan risiko
regresi nyata pada sistem yang sudah dipakai. **Jangan dikerjakan tanpa staging/testing manual.**

---

## 8. Fase 5 — Struktur & Maintainability

| # | Tugas | Risiko | Dampak |
|---|-------|--------|--------|
| 5.1 | Pecah `BillingTab.jsx` (2408→1219), `GuruView.jsx` (2895→1341), `SiswaTab.jsx` (1943→1009) | Selesai | Bisa di-maintain |
| 5.2 | Rename `views/admin/shared.jsx` → `AdminShared.jsx` | Nol | Hilangkan kebingungan nama |
| 5.3 | Konsolidasi design token (`DESIGN.md` → `tailwind.theme.json` → `index.css`) | Rendah | Satu sumber kebenaran |

**Catatan 5.1:** ini masalah maintainability nomor satu, bukan pilihan library. Pola perbaikan
sudah ada di `AdminView.jsx` (shell kecil + lazy-load tab) — tinggal diterapkan ke sisanya.

---

## 9. Fase 6 — Testing

| # | Tugas | Risiko | Dampak |
|---|-------|--------|--------|
| 6.1 | Frontend unit test (komponen kritis) | Nol | Cakupan UI |
| 6.2 | E2E Playwright: login, check-in absensi, pembayaran billing | Rendah | Lindungi alur kritikal |

---

## 10. Ditolak / Ditunda (dengan alasan)

| Item | Keputusan | Alasan |
|------|-----------|--------|
| Migrasi PostgreSQL | **Tunda** | Skala sekarang belum butuh. `better-sqlite3` tepat. Jawaban lebih murah: backup otomatis (3.2) |
| Next.js / Remix | **Tolak** | Dashboard internal di balik login — tidak ada kebutuhan SSR/SEO. Menambah kompleksitas deploy di VPS 2 GB |
| NestJS | **Tolak** | Terlalu berat (DI, decorator, module) untuk 12 file route |
| Fastify | **Tolak** | Bukan bottleneck. Plafon sebenarnya adalah query **sinkron** `better-sqlite3`, bukan overhead HTTP |
| Hono | **Tolak** | Ditujukan untuk edge/serverless; deploy di VPS |
| TypeScript penuh | **Tunda** | Lever terbesar, tapi migrasi termahal. Jalan tengah: JSDoc + `// @ts-check` (Fase 2, bisa ditambahkan) |
| Backend → ESM | **Tunda** | Kosmetik; mismatch CommonJS/ESM tidak menyebabkan bug |
| bcryptjs → argon2 | **Tunda** | Prioritas rendah; kerjakan kalau menyentuh auth |

---

## 11. Definisi Selesai

Sebuah fase dianggap selesai bila:

- [x] `npm run test:all` lulus (420 test, tidak flaky)
- [x] `npm run build --prefix frontend` hijau
- [x] `npm run lint` 0 error
- [x] `npm run format:check` bersih
- [x] `npm run smoke:prod` lulus
- [x] Perubahan ter-commit di branch dengan pesan jelas
- [x] Tidak ada perubahan perilaku yang tidak disengaja
- [x] Perubahan didokumentasikan bila menyentuh operasional (deploy/backup)

---

## 12. Catatan Pengerjaan Terperinci

### 5.1 lanjutan — `BillingTab.jsx` (SELESAI)

**2.408 → 1.219 baris.** Berbeda dari GuruView dan SiswaTab, berkas ini tidak
punya fungsi murni atau komponen terpisah untuk dipindahkan: seluruh isinya satu
komponen. Yang bisa dikeluarkan hanya blok render, dan itu yang dikerjakan —
satu blok per commit, masing-masing diverifikasi build + lint + E2E.

Hasilnya di `views/admin/billing/`: `RingkasanTab`, `TagihanTab`,
`PembayaranTab`, `TarifTab`, `InvoiceTab`, plus `PreviewGenerateModal` yang
sudah keluar lebih dulu. Pola yang dipakai seragam: induk tetap memegang state
dan mutasi, anak menerima props dan murni tampilan.

Dua hal yang membuat pemecahan ini tidak mekanis:

1. **Dependensi tersembunyi.** Tiap blok memakai 8–20 nilai dari lingkup induk
   (`billingStats`, `groupedTarif`, `canSelectBill`, …). Daftarnya dipetakan
   dengan memindai nama yang benar-benar muncul di blok, bukan ditebak; tanpa
   itu `build` lolos tetapi halaman putih saat tab dibuka.
2. **Helper ikut terbawa.** `blankTarifForm` dipakai di dalam blok Tarif, jadi
   ia harus jadi prop, bukan disalin — salinan akan menyimpang dari induk.

Sisa di induk (±500 baris) adalah state, mutasi, dan modal tarif/diskon/edit.
Modal-modal itu **sengaja belum dipindah**: isinya form dengan state yang
dikendalikan induk (`tarifForm`, `diskonForm`, `payForm`, flag dirty), jadi
memindahkannya berarti memindahkan state juga — keuntungannya kecil, risikonya
justru besar. Ukuran berkas 1.219 baris sudah di bawah ambang yang menyulitkan
navigasi.

### 4.3 React Router

**Selesai** — dengan satu keputusan yang berbeda dari rencana awal: sub-tab
tetap di query (`?tab=`), bukan di path (`/admin/siswa`). Alasannya, portal
wali dan gerbang mengelola tabnya sendiri dan membacanya dari `?tab=` saat
mount; memindahkan tab ke path berarti menyeragamkan state internal ketiga view
sekaligus, tanpa manfaat yang sebanding.

Yang dikerjakan:

- `BrowserRouter` di `main.jsx`; `view` dan `activeTab` diturunkan dari URL,
  bukan state yang disalin dua arah.
- `must_change_password` tetap dirender sebelum rute apa pun, dan path yang
  tidak ada di `navFor(user)` dialihkan ke view bawaan — `/admin` sebagai wali
  tidak membuka apa pun.
- **Redirect tautan lama dipertahankan.** Notifikasi push yang sudah terkirim
  berbentuk `/?view=wali&tab=tagihan`; bentuk itu tidak bisa ditarik dari HP
  orang tua. Backend sengaja tidak diubah supaya jalur kompatibilitas ini terus
  teruji.
- Tombol Back kini berfungsi (dulu `replaceState` tanpa `pushState` membuat
  Back keluar dari aplikasi).
- `e2e/rute.spec.js`: tautan lama, tombol Back, dan refresh di path dalam.

### 4.2 TanStack Query

**Selesai** untuk semua daftar yang memang layak di-cache: 17 komponen.
Empat kelompok sengaja dibiarkan memakai pola lama, dengan alasan tertulis:

| Yang tidak dipindah | Alasan |
|---|---|
| `ConfigTab`, `RetensiCard`, `PengingatTagihanCard` | data disunting di tempat sebelum disimpan; query hanya menambah penyalinan lewat effect |
| `WaliView.loadBilling` | PIN-gated: `PIN_REQUIRED` harus membuka dialog, bukan toast |
| `WaliView.dailyHistory` | paginasi 30/klik → `useInfiniteQuery` |
| `WizardSesiWa` | dua timer saling bergantung (status + QR), tanpa uji otomatis; `refetchInterval` yang salah akan menghantam instance open-wa sekolah |

Yang sudah ada:

- `frontend/src/lib/queryClient.js` — satu klien, `staleTime` 30 detik,
  `retry: 1`, `refetchOnWindowFocus: false`. Error query yang tidak ditangani
  lokal dilaporkan ke satu handler yang didaftarkan `App.jsx` → `toast`.
  Klien sengaja singleton di tingkat modul karena provider harus membungkus
  App (termasuk layar login), sedangkan `toast` hidup di dalam App.
- Sudah pindah (12 view + 3 panel): **LaporanTab**, **AuditTab**, **KalenderTab**
  (tiga bentuk berbeda — daftar berfilter + detail, daftar sederhana, daftar +
  state tampilan turunan), lalu **CabangTab**, **WaliTab**, **StaffTab**,
  **SiswaTab**, **RombelTab**, dan **KepsekView** (semua tabnya, termasuk
  monitoring yang disegarkan SSE lewat `invalidateQueries`), dan **GuruView**
  (daily record + absensi; antrean offline kini memberi tahu cache lewat
  `onTersinkron`), dan **BillingTab** (lima sumber billing; daftar siswa
  berbagi kunci dengan tab Siswa).
- **ConfigTab sengaja belum** — datanya disunting di tempat (`cfg`, `org`)
  sebelum disimpan; query + salinan lokal hanya menambah upacara.

Yang hilang per tab: state `rows` + `setRows`, `load` useCallback beserta
dependensinya, `useEffect` pemanggilnya, `try/catch` + `toast('err', …)`, dan
pemanggilan ulang manual setelah mutasi. Yang muncul: satu blok `useQuery`
yang sekaligus menyatakan kunci cache-nya.

Angka yang terukur: membuka Audit → pindah ke Siswa → kembali ke Audit
sebelumnya menghasilkan **2 permintaan**, sekarang **1** (cache 30 detik).
Jumlah baris nyaris tidak berubah (+8 untuk tiga tab, termasuk komentar dan
status memuat) — keuntungannya bukan pada panjang berkas, melainkan pada
hilangnya seluruh kelas bug: closure basi, dependensi effect yang terlewat,
permintaan ganda saat mount, dan balapan saat filter diubah cepat.

Urutan penyebaran yang disarankan: satu tab per commit, mulai dari yang
bentuknya paling mirip percontohan (daftar berfilter). Mutasi (simpan, hapus,
verifikasi) belum dipindah ke `useMutation` — untuk sekarang tetap imperatif
lalu `refetch()`, karena jumlahnya sedikit dan alurnya bercabang (konfirmasi,
PIN, antrean offline).

### 6.2 E2E Playwright

**Selesai.** `e2e/alur-kritikal.spec.js` menutup tiga jalur yang paling mahal
kalau rusak diam-diam, di atas 10 uji asap yang sudah ada:

1. Login staff + wajib ganti password — admin membuat akun lewat UI, password
   sementara dibaca dari dialog, lalu staff dipaksa mengganti sebelum masuk.
2. Check-in absensi — sudah tercakup sejak awal (termasuk jalur offline).
3. Pembayaran tunai → pratinjau alokasi FIFO → tersimpan → tagihan jadi Lunas.
4. Scan QR penjemput → siswa berstatus menunggu dijemput.

Dua hal yang ditemukan saat mengerjakan:

- `reuseExistingServer` harus `false`. Uji ini membuat akun dan melunasi
  tagihan; memakai server lama membuat jalan kedua menemukan data yang sudah
  berubah. CI sudah `false`; lokal disamakan.
- Uji pembayaran dan uji ekspor CSV saling bertentangan kalau memakai tagihan
  yang sama (satu melunasi, satu mengharapkan "Belum dibayar"). Seeder kini
  membuat dua tagihan dengan periode berbeda.

**Tambahan: `e2e/deep-load.spec.js` (33 kasus).** Selama migrasi React Query dan
pemecahan BillingTab, empat kali kode yang lolos `build`, lint, dan seluruh uji
unit tetap **memutihkan halaman** — `ReferenceError: Cannot access 'x' before
initialization`, karena nilai yang dulu `useState` di atas komponen berpindah ke
bawah sebagai turunan query sementara pemakaiannya tertinggal di atas. Build
tidak menangkapnya (itu error runtime), dan navigasi klik tidak selalu: sebagian
hanya muncul saat halaman dimuat dari nol di path dalam.

Uji ini membuka setiap view dan tab lewat URL-nya langsung, lalu memeriksa dua
hal: nol `pageerror`, dan isi tab benar-benar dirender (bukan dialihkan ke view
bawaan). Ia langsung menemukan bug nyata: `KepsekView.TABS` tidak memuat `izin`
dan `pengumuman` padahal sidebar menautkannya — menu itu selalu mendarat di
Monitoring. Menambah tab baru berarti menambah satu baris di tabel `KASUS`.
