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
| 5.1 | Pecah GuruView (2895→1341), SiswaTab (1943→1009) | Sebagian |
| 5.2 | Rename `admin/shared.jsx` → `AdminShared.jsx` | Selesai |
| 6.1 | Test unit frontend (37 test) | Selesai |

**Belum dikerjakan** — lihat §12 untuk alasan dan rencananya:

| Item | Catatan |
|------|---------|
| 5.1 lanjutan | `BillingTab.jsx` (2698 baris) — seluruhnya satu komponen 2611 baris, tidak ada fungsi murni untuk diekstrak. Butuh refactor bertahap, bukan pemindahan mekanis. |
| 5.3 | Konsolidasi design token (`DESIGN.md` → `tailwind.theme.json` → `index.css`) |
| 4.2 | TanStack Query — menyentuh ~160 endpoint di seluruh view |
| 4.3 | React Router — mengubah routing custom di `App.jsx` |
| 6.2 | E2E Playwright (login, check-in, pembayaran) |
| Lain | `useMaster` terduplikasi di `KegiatanMingguanTab.jsx` dan `admin/AdminShared.jsx` |

**Angka akhir:** 128 test lulus (80 backend + 11 workflow + 37 frontend),
lint 0 error, build hijau, `npm audit` 0 vulnerabilities (root + frontend).

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

**Catatan 1.3:** ESLint dipasang **non-blocking** (aturan berat = `warn`). Belum dijadikan gate CI
sampai kode bersih. Reformat Prettier massal dilakukan sebagai commit terpisah agar tidak
mengaburkan diff logika.

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
| 5.1 | Pecah `BillingTab.jsx` (107 KB), `GuruView.jsx` (105 KB), `SiswaTab.jsx` (66 KB) | Sedang | Bisa di-maintain |
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

- [x] `npm run test:all` lulus (128 test, tidak flaky)
- [x] `npm run build --prefix frontend` hijau
- [x] `npm run lint` 0 error
- [x] `npm run format:check` bersih
- [x] `npm run smoke:prod` lulus
- [x] Perubahan ter-commit di branch dengan pesan jelas
- [x] Tidak ada perubahan perilaku yang tidak disengaja
- [x] Perubahan didokumentasikan bila menyentuh operasional (deploy/backup)

---

## 12. Sisa Pekerjaan — Rencana Konkret

### 5.1 lanjutan — `BillingTab.jsx` (2698 baris)

Berbeda dari GuruView dan SiswaTab, file ini **tidak punya fungsi murni maupun
komponen terpisah** untuk dipindahkan. Seluruh 2611 baris berada dalam satu
komponen. Pemindahan mekanis tidak bisa dilakukan tanpa membaca dan memahami
alur state-nya lebih dulu.

Pendekatan yang disarankan (bertahap, satu commit per langkah):

1. Petakan state dan turunannya — daftar `useState`/`useMemo` dan siapa memakai apa.
2. Identifikasi blok render yang mandiri (mis. modal konfirmasi, tabel tagihan,
   form pembayaran) dan ubah menjadi komponen anak yang menerima props.
3. Pindahkan helper murni yang muncul ke `admin/billing/helpers.js` — lalu tulis
   test seperti yang sudah dilakukan untuk `guru/helpers.js`.
4. Verifikasi build + lint setiap langkah. Perhatikan: lint akan menangkap
   variabel tak terdefinisi yang lolos dari build (lihat catatan di commit
   `4bc369c`).

### 4.3 React Router

Mengubah URL aplikasi. Butuh verifikasi di browser, bukan hanya build:

- Petakan view per role yang sekarang ditangani `navFor(user)` di `App.jsx`.
- Tentukan struktur rute (`/admin/siswa`, `/guru/absensi`, dst.) dan rute default
  per role.
- Perhatikan `must_change_password`: rute wajib ganti password harus tidak bisa
  dilewati lewat URL langsung.
- Uji manual: deep-link, tombol back, refresh di tengah alur, dan perpindahan role.

### 4.2 TanStack Query

Menyentuh hampir seluruh view. Kerjakan setelah 4.3 agar pola rute sudah stabil.
Mulai dari satu tab (mis. `LaporanTab`) sebagai percontohan, ukur berapa banyak
boilerplate loading/error yang hilang, baru sebarkan.

### 6.2 E2E Playwright

Alur kritikal yang layak ditutup lebih dulu:
1. Login staff + wajib ganti password.
2. Check-in absensi dan set keterangan.
3. Buat pembayaran tunai → verifikasi alokasi FIFO ke tagihan.
4. Scan QR penjemput → pulangkan siswa.

Ketiganya sudah punya cakupan API (lihat `scripts/*.test.js`); E2E menambahkan
lapisan UI yang saat ini sama sekali belum teruji.
