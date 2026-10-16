# SIAGA — Rencana Perbaikan Tech Stack

> Disusun: 16 Oktober 2026
> Basis: audit tech stack + audit layer framework
> Status: Fase 0 & 1 dieksekusi; Fase 2–6 menunggu konfirmasi cakupan

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

- [ ] `npm test` lulus (63+ test, tidak flaky)
- [ ] `npm run build --prefix frontend` hijau
- [ ] Perubahan ter-commit di branch dengan pesan jelas
- [ ] Tidak ada perubahan perilaku yang tidak disengaja
- [ ] Perubahan didokumentasikan bila menyentuh operasional (deploy/backup)
