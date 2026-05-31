# SIAGA — System Map Komprehensif
## Sistem Informasi Administrasi & Gestur Anak (Yayasan Taruna Prima)

> Terakhir diperbarui: 26 Mei 2026

---

## 1. Architecture Overview

### Tech Stack

| Layer     | Technology                                          |
|-----------|-----------------------------------------------------|
| Frontend  | React 18 + Vite 5 + Tailwind CSS 3 + lucide-react  |
| Backend   | Express.js + JWT (jsonwebtoken) + bcryptjs          |
| Database  | better-sqlite3 (file: `backend/siaga.db`, WAL mode) |
| Fonts     | DM Sans (Google Fonts)                              |
| Icons     | lucide-react                                        |
| QR Code   | react-qr-code (frontend), QR scanning via BarcodeDetector API |
| PDF       | pdfkit (backend, untuk invoice & receipt)           |
| Upload    | multer (memory storage) + sharp (image processing)  |

### Folder Structure

```
/mnt/c/Users/Hadi/Desktop/Code/siaga/
├── backend/
│   ├── db.js                    # Schema + migrations (SQLite)
│   ├── server.js                # Express app entry, route mounting
│   ├── middleware/
│   │   └── auth.js              # JWT verify + role guard
│   ├── utils/
│   │   ├── workflow.js          # Shared business logic (enrollment, scope, audit, notify)
│   │   └── imageUpload.js       # multer + sharp image processing
│   ├── routes/
│   │   ├── auth.js              # Login, me, change-password
│   │   ├── master.js            # Cabang, jenjang, rombel, operasional-config, kalender, organisasi, audit-log
│   │   ├── pengguna.js          # Staff & wali CRUD, foto, reset-password
│   │   ├── siswa.js             # Siswa CRUD, enrollment, NFC, penjemput, kenaikan
│   │   ├── absensi.js           # Check-in, NFC scan, keterangan, early-release, tutup-hari
│   │   ├── penjemputan.js       # QR scan penjemput, pulangkan
│   │   ├── dailyRecord.js       # Daily record CRUD, publish, comment, attachments
│   │   ├── modulAjar.js         # Modul ajar & focus theme CRUD
│   │   ├── notifikasi.js        # Notifikasi list, read, read-all
│   │   ├── billing.js           # Tarif, diskon, tagihan, pembayaran, invoice, laporan keuangan
│   │   ├── rekap.js             # Dashboard, rekap bulanan, backup/restore, completeness, activity
│   │   ├── laporan.js           # (legacy/redirect)
│   │   ├── guru.js              # (legacy/redirect)
│   │   └── kelas.js             # (legacy/redirect)
│   ├── uploads/                 # Uploaded files (foto, laporan)
│   └── siaga.db                 # SQLite database file
├── frontend/
│   ├── index.html
│   ├── vite.config.js / dev.mjs / build.mjs
│   ├── tailwind.config.js
│   ├── DESIGN.md                # Design system specification
│   ├── tailwind.theme.json      # Auto-generated from DESIGN.md
│   └── src/
│       ├── main.jsx             # React entry point
│       ├── App.jsx              # Root: auth, sidebar, routing, notifications
│       ├── api.js               # API client (fetch wrapper + all endpoints)
│       ├── index.css            # Tailwind imports + custom styles + animations
│       ├── utils/
│       │   └── date.js          # WIB timezone helpers
│       ├── components/
│       │   └── Shared.jsx       # Shared UI components
│       └── views/
│           ├── LoginView.jsx    # Login page
│           ├── AdminView.jsx    # Admin dashboard (4382 lines, 11 tabs)
│           ├── GuruView.jsx     # Guru dashboard (690 lines, 2 tabs)
│           ├── KepsekView.jsx   # Kepala sekolah dashboard (492 lines, 4 tabs)
│           ├── GerbangView.jsx  # Pos gerbang dashboard (84 lines)
│           └── WaliView.jsx     # Portal wali (102 lines)
└── docs/                        # Documentation
```

### Deployment

- **Development:** `npm run dev` → Vite dev server (frontend) + Express (backend on port 3001)
- **Production:** Express serves `frontend/dist` as static files + API routes

---

## 2. Role-Based Access Control

### Roles & Permissions

| Role           | Tipe   | Akses View     | Scope Data                                    |
|----------------|--------|----------------|-----------------------------------------------|
| `admin`        | staff  | admin, kepsek, guru, gerbang | Semua cabang (global)              |
| `admin_cabang` | staff  | admin, kepsek, guru, gerbang | Cabang sendiri saja               |
| `kepsek`       | staff  | kepsek, guru, gerbang         | Cabang sendiri saja               |
| `guru`         | staff  | guru, gerbang                 | Rombel yang di-assign saja        |
| `gerbang`      | staff  | gerbang                       | Cabang sendiri saja               |
| `wali`         | wali   | wali                          | Anak yang ter-link saja           |

### Default View per Role

```
wali          → wali
admin         → admin
admin_cabang  → admin
kepsek        → kepsek
gerbang       → gerbang
guru          → guru (default)
```

### Auth Flow

1. Login via `POST /api/auth/login` (staff: username+password, wali: no_wa+password)
2. JWT token disimpan di `localStorage` (`siaga_token`)
3. Middleware `auth(roles[])` verifikasi token → load user dari DB → cek status aktif → cek role
4. `must_change_password` → redirect ke halaman ganti password wajib
5. Sidebar navigation dihitung berdasarkan role (`navFor(user)`)

### Data Scoping (workflow.js)

- `siswaScopeSql(user, alias, requestedCabangId)` → menghasilkan SQL JOIN + WHERE clause berdasarkan role
- `canAccessSiswa(user, siswaId)` → cek akses per siswa (admin=all, admin_cabang/kepsek/gerbang=cabang match, guru=rombel assignment, wali=wali_siswa link)
- `canAccessCabang(user, cabangId)` → admin selalu true, lainnya harus match cabang_id
- `requireActiveCabang()` → cek cabang aktif sebelum transaksi

---

## 3. Semua View dan Tab

### AdminView (admin, admin_cabang)

| Tab         | Komponen Utama        | Fungsi                                                      |
|-------------|-----------------------|-------------------------------------------------------------|
| `siswa`     | SiswaTab              | CRUD siswa, foto, NFC token, penjemput, enrollment, kenaikan |
| `cabang`    | CabangTab             | CRUD cabang, statistik siswa/staff per cabang               |
| `staff`     | StaffTab              | CRUD staff (admin, kepsek, guru, gerbang), foto, reset pw   |
| `wali`      | WaliTab               | CRUD wali, link ke siswa                                    |
| `rombel`    | RombelTab             | CRUD rombel, assign guru, manage anggota                    |
| `billing`   | BillingTab            | Tarif, diskon, generate tagihan, pembayaran, invoice, PDF   |
| `laporan`   | LaporanTab            | Rekap absensi bulanan per siswa                             |
| `modulAjar` | ModulAjarTab          | CRUD modul ajar, focus theme per rombel                     |
| `config`    | ConfigTab             | Operasional config per cabang/jenjang/paket                  |
| `kalender`  | KalenderTab           | Kalender akademik (libur/masuk, scope yayasan/cabang)       |
| `audit`     | AuditTab              | Audit log semua aktivitas                                   |

### GuruView (guru, admin, admin_cabang, kepsek)

| Tab        | Fungsi                                                              |
|------------|---------------------------------------------------------------------|
| `daily`    | Daily record editor: mood, makan, tidur, aktivitas, observasi, focus theme, foto, publish |
| `absensi`  | Absensi siswa: check-in manual/NFC, keterangan (Izin/Sakit/Absen), tutup hari, mode masuk/pulang |

### KepsekView (kepsek, admin, admin_cabang)

| Tab          | Fungsi                                                            |
|--------------|-------------------------------------------------------------------|
| `monitoring` | Dashboard real-time: status counts, per kelas, red flag (>15 min), early release, tutup hari, live clock (auto-refresh 30s) |
| `laporan`    | Summary daily record: published/draft count                       |
| `keuangan`   | Ringkasan tagihan & pembayaran per cabang                         |
| `notifikasi` | Daftar notifikasi masuk                                           |

### GerbangView (gerbang, guru, admin, admin_cabang, kepsek)

| Komponen          | Fungsi                                                |
|-------------------|-------------------------------------------------------|
| QR Scanner        | Scan QR penjemput (input manual / kamera BarcodeDetector) |
| Waiting List      | Daftar siswa menunggu serah terima → tombol "Pulang"  |
| Stats             | Siap dijemput, Menunggu, Pulang                       |
| Activity Log      | Log scan terakhir (8 item)                            |
| Dark theme        | Menggunakan `bg-slate-950` (dark mode)                |

### WaliView (wali)

| Komponen          | Fungsi                                                |
|-------------------|-------------------------------------------------------|
| Anak Selector     | Tab switch antar anak (jika >1)                       |
| History List      | Daftar daily record published (unread indicator)      |
| Record Detail     | Mood, makan, tidur, aktivitas, observasi, foto, komentar |
| Comment           | Feedback wali → notifikasi ke guru                    |
| Notifikasi        | Daftar notifikasi (daily published, guru reply)       |

---

## 4. Backend API Endpoints

### `/api/auth` (auth.js)
```
POST   /api/auth/login              # Login (staff: username, wali: no_wa)
GET    /api/auth/me                  # Current user info
POST   /api/auth/change-password     # Ganti password
```

### `/api/master` (master.js)
```
GET    /api/master/cabang            # List cabang + statistik
POST   /api/master/cabang            # [admin] Create cabang
PUT    /api/master/cabang/:id        # [admin] Update cabang
GET    /api/master/jenjang           # List jenjang
GET    /api/master/rombel            # List rombel (filter cabang_id)
POST   /api/master/rombel            # [admin/admin_cabang] Create rombel
PUT    /api/master/rombel/:id        # [admin/admin_cabang] Update rombel
DELETE /api/master/rombel/:id        # [admin/admin_cabang] Delete rombel
POST   /api/master/rombel/:id/guru   # Assign guru ke rombel
DELETE /api/master/rombel/:id/guru/:gid # Remove guru dari rombel
GET    /api/master/operasional-config # Config per cabang/jenjang/paket
PUT    /api/master/operasional-config/:id # Update config
GET    /api/master/audit-log         # [admin/kepsek] Audit log
GET    /api/master/organisasi        # Info organisasi
PUT    /api/master/organisasi        # [admin] Update organisasi
GET    /api/master/kalender          # List kalender event
POST   /api/master/kalender          # [admin] Create event
PUT    /api/master/kalender/:id      # [admin] Update event
DELETE /api/master/kalender/:id      # [admin] Delete event
```

### `/api/pengguna` (pengguna.js)
```
GET    /api/pengguna                 # List staff (filter cabang_id)
POST   /api/pengguna/staff           # [admin/admin_cabang] Create staff
PUT    /api/pengguna/staff/:id       # [admin/admin_cabang] Update staff
DELETE /api/pengguna/staff/:id       # [admin] Delete staff
POST   /api/pengguna/:id/reset-password # Reset password (generate temp)
POST   /api/pengguna/staff/:id/foto  # Upload foto staff
DELETE /api/pengguna/staff/:id/foto  # Hapus foto staff
GET    /api/pengguna/wali            # List wali
POST   /api/pengguna/wali            # [admin/admin_cabang] Create wali
PUT    /api/pengguna/wali/:id        # [admin/admin_cabang] Update wali
```

### `/api/siswa` (siswa.js)
```
GET    /api/siswa                    # List siswa (scoped by role)
POST   /api/siswa                    # [admin/admin_cabang] Create siswa
PUT    /api/siswa/:id                # [admin/admin_cabang] Update siswa
GET    /api/siswa/:id                # Detail siswa + enrollment + penjemput
POST   /api/siswa/:id/enrollment     # Pindah/move siswa (enrollment baru)
POST   /api/siswa/:id/nfc/reissue    # Reissue NFC token
POST   /api/siswa/:id/foto           # Upload foto siswa
DELETE /api/siswa/:id/foto           # Hapus foto siswa
POST   /api/siswa/:id/penjemput      # Tambah penjemput
PUT    /api/siswa/penjemput/:id      # Update penjemput
POST   /api/siswa/penjemput/:id/qr/reissue # Reissue QR penjemput
GET    /api/siswa/wali/children      # [wali] Anak-anak wali
POST   /api/siswa/kenaikan/preview   # Preview kenaikan kelas
POST   /api/siswa/kenaikan           # Execute kenaikan kelas
```

### `/api/absensi` (absensi.js)
```
GET    /api/absensi/today            # Absensi hari ini (scoped)
POST   /api/absensi/checkin          # [guru/admin] Check-in siswa (manual)
POST   /api/absensi/nfc-scan         # [guru/admin] NFC tap (checkin/pulang)
POST   /api/absensi/keterangan       # [guru/admin] Set Izin/Sakit/Absen
GET    /api/absensi/early-release    # List izin pulang dini
POST   /api/absensi/early-release    # [admin/kepsek] Buat izin pulang dini
DELETE /api/absensi/early-release/:id # [admin/kepsek] Hapus izin pulang dini
POST   /api/absensi/tutup-hari       # [admin/kepsek/guru] Tutup hari operasional
GET    /api/absensi/tutup-hari/status # Cek status tutup hari
```

### `/api/penjemputan` (penjemputan.js)
```
POST   /api/penjemputan/scan         # [gerbang/guru/admin] Scan QR penjemput → status Menunggu
POST   /api/penjemputan/pulang       # [gerbang/guru/admin] Konfirmasi serah terima → status Pulang
```

### `/api/daily-record` (dailyRecord.js)
```
GET    /api/daily-record/today       # Daily record hari ini (scoped)
GET    /api/daily-record/history/:sid # History daily record per siswa
GET    /api/daily-record/:id         # Detail daily record + attachments + comments
GET    /api/daily-record/:id/edits   # [admin/kepsek] Edit log
POST   /api/daily-record             # [guru/admin] Create/update daily record
POST   /api/daily-record/:id/publish # [guru/admin] Publish → kirim notif ke wali
POST   /api/daily-record/:id/comment # [wali/guru] Tambah komentar
POST   /api/daily-record/:id/attachments # [guru/admin] Upload foto (max 5)
DELETE /api/daily-record/:id/attachments/:aid # Hapus foto
GET    /api/daily-record/admin/history # [admin/kepsek] History semua siswa
```

### `/api/modul-ajar` (modulAjar.js)
```
GET    /api/modul-ajar               # List modul ajar
POST   /api/modul-ajar               # [admin/guru] Create modul ajar
PUT    /api/modul-ajar/:id           # Update modul ajar
GET    /api/modul-ajar/focus-theme   # List focus theme
POST   /api/modul-ajar/focus-theme   # Create/update focus theme
```

### `/api/notifikasi` (notifikasi.js)
```
GET    /api/notifikasi               # List notifikasi user
PUT    /api/notifikasi/:id/read      # Tandai sudah dibaca
PUT    /api/notifikasi/read-all      # Tandai semua sudah dibaca
```

### `/api/billing` (billing.js)
```
GET    /api/billing/tarif            # List tarif
POST   /api/billing/tarif            # [admin] Create tarif
PUT    /api/billing/tarif/:id        # [admin] Update tarif
GET    /api/billing/diskon           # List diskon siswa
POST   /api/billing/diskon           # [admin] Create diskon
PUT    /api/billing/diskon/:id       # [admin] Update diskon
POST   /api/billing/generate-bulanan # [admin] Generate tagihan bulanan
POST   /api/billing/generate-bulanan/preview # Preview generate
POST   /api/billing/generate-kegiatan # [admin] Generate tagihan kegiatan
POST   /api/billing/generate-kegiatan/preview # Preview generate
GET    /api/billing/tagihan          # List tagihan
PUT    /api/billing/tagihan/:id/koreksi # [admin] Koreksi tagihan
POST   /api/billing/tagihan/:id/void # [admin] Void tagihan
GET    /api/billing/pembayaran       # List pembayaran
POST   /api/billing/pembayaran       # Create pembayaran
GET    /api/billing/pembayaran/:id/alokasi # Detail alokasi
GET    /api/billing/pembayaran/preview-alokasi # Preview alokasi otomatis
PUT    /api/billing/pembayaran/:id/alokasi # Update alokasi manual
POST   /api/billing/pembayaran/:id/verify  # [admin] Verifikasi
POST   /api/billing/pembayaran/:id/reject  # [admin] Tolak
POST   /api/billing/pembayaran/:id/void    # [admin] Void
POST   /api/billing/invoice          # [admin] Generate invoice
GET    /api/billing/invoice          # List invoice
GET    /api/billing/invoice/:id/pdf  # Download PDF invoice
GET    /api/billing/pembayaran/:id/pdf # Download PDF receipt
GET    /api/billing/laporan          # Laporan keuangan
```

### `/api/rekap` (rekap.js)
```
GET    /api/rekap/dashboard          # Dashboard monitoring (statusCounts, byKelas, siswaAktif, earlyReleases, dayCloseStatus)
GET    /api/rekap                    # Rekap absensi bulanan
GET    /api/rekap/backup             # [admin] Download backup DB
POST   /api/rekap/restore            # [admin] Restore DB dari file
GET    /api/rekap/completeness       # [admin/kepsek] Data completeness check
GET    /api/rekap/activity           # [admin/kepsek] Activity log
```

---

## 5. Database Tables & Field Kunci

### Master Data

| Tabel              | Field Kunci                                                                              |
|--------------------|------------------------------------------------------------------------------------------|
| `organisasi`       | id=1, nama, alamat, kontak, rekening_nama/bank/nomor, logo_url                          |
| `cabang`           | id, nama, kode (UNIQUE), alamat, kontak, aktif                                          |
| `jenjang`           | id, kode (UNIQUE), nama, tipe (sekolah/care), urutan, aktif                             |
| `rombel`           | id, cabang_id→cabang, jenjang_id→jenjang, nama, aktif; UNIQUE(cabang_id,nama)           |

### Pengguna

| Tabel              | Field Kunci                                                                              |
|--------------------|------------------------------------------------------------------------------------------|
| `pengguna`         | id, tipe (staff/wali), role, display_name, username, no_wa, password_hash, status (undangan/aktif/nonaktif), must_change_password |
| `staff_profile`    | pengguna_id→pengguna (PK), cabang_id→cabang, foto, jabatan                              |
| `wali_profile`     | pengguna_id→pengguna (PK), no_wa, catatan                                               |

### Siswa & Enrollment

| Tabel              | Field Kunci                                                                              |
|--------------------|------------------------------------------------------------------------------------------|
| `siswa`            | id, nama, nis (UNIQUE), nama_panggilan, gender, tanggal_lahir, foto, nfc_token (UNIQUE), status (aktif/keluar/lulus), status_kartu |
| `siswa_enrollment` | id, siswa_id→siswa, cabang_id, jenjang_id, rombel_id, paket (reguler/full_day/care), tanggal_mulai, tanggal_selesai, status (aktif/selesai) |
| `wali_siswa`       | id, wali_pengguna_id→pengguna, siswa_id→siswa, relasi, aktif; UNIQUE(siswa_id,aktif)    |
| `guru_rombel`      | id, pengguna_id→pengguna, rombel_id→rombel, role (utama/bantu); UNIQUE(pengguna_id,rombel_id) |

### Penjemput

| Tabel              | Field Kunci                                                                              |
|--------------------|------------------------------------------------------------------------------------------|
| `penjemput`        | id, siswa_id→siswa, nama, no_wa, relasi, qr_code (UNIQUE), aktif                        |

### Operasional

| Tabel                | Field Kunci                                                                            |
|----------------------|----------------------------------------------------------------------------------------|
| `operasional_config` | id, cabang_id, jenjang_id, paket, jam_masuk, jam_pulang, hitung_terlambat, daily_record_wajib, daily_record_due_time, pickup_fleksibel; UNIQUE(cabang_id,jenjang_id,paket) |
| `kalender_event`     | id, scope (yayasan/cabang), cabang_id, tanggal, tipe (libur/masuk), nama               |

### Absensi

| Tabel              | Field Kunci                                                                              |
|--------------------|------------------------------------------------------------------------------------------|
| `absensi`          | id, siswa_id, cabang_id, jenjang_id, rombel_id, paket, tanggal, **status** (9 nilai), jam_masuk, jam_pulang, jam_tunggu, penjemput_id→penjemput, manual, catatan; UNIQUE(siswa_id,tanggal) |
| `tutup_hari`       | id, cabang_id, tanggal, closed_by→pengguna, closed_at, summary; UNIQUE(cabang_id,tanggal) |
| `early_release`    | id, siswa_id, cabang_id, tanggal, alasan, created_by→pengguna; UNIQUE(siswa_id,tanggal) |
| `penjemputan_log`  | id, absensi_id, siswa_id, penjemput_id, guru_id, cabang_id, tanggal, jam_scan, jam_pulang, durasi_menit, sumber (manual/nfc/qr) |
| `nfc_scan_log`     | id, siswa_id, pengguna_id, cabang_id, action, status (success/failed), reason, token_masked, tab, tanggal, jam |
| `qr_reissue_log`   | id, siswa_id, penjemput_id, admin_id, old_qr_code, new_qr_code, reason                  |

### Daily Record (Laporan Harian)

| Tabel                  | Field Kunci                                                                            |
|------------------------|----------------------------------------------------------------------------------------|
| `laporan_harian`       | id, siswa_id, cabang_id, jenjang_id, rombel_id, paket, tanggal, guru_id, **status** (draft/published), mood (ceria/biasa/rewel), makan (habis/setengah/tidak), tidur (0/1), aktivitas (JSON array), catatan, focus_theme_id, observation_domain, observation_note, parent_note, structured_observation_json, published_at, last_published_change_at; UNIQUE(siswa_id,tanggal) |
| `laporan_edit_log`     | id, laporan_id→laporan_harian, pengguna_id, perubahan (JSON), reason                    |
| `laporan_attachment`   | id, laporan_id→laporan_harian, url, filename, size_bytes, sort_order, created_by        |
| `laporan_read`         | id, laporan_id→laporan_harian, wali_pengguna_id, read_at; UNIQUE(laporan_id,wali_pengguna_id) |
| `laporan_comment`      | id, laporan_id→laporan_harian, siswa_id, cabang_id, author_pengguna_id, body            |

### Modul Ajar & Focus Theme

| Tabel              | Field Kunci                                                                              |
|--------------------|------------------------------------------------------------------------------------------|
| `modul_ajar`       | id, cabang_id, jenjang_id, rombel_id, paket, title, week_start, week_end, goals (JSON), suggested_activities (JSON), suggested_domains (JSON), attachment_url |
| `focus_theme`      | id, modul_ajar_id→modul_ajar, cabang_id, rombel_id, tanggal, title, activity_summary, suggested_domains (JSON), teacher_prompt; UNIQUE(rombel_id,tanggal) |

### Billing

| Tabel              | Field Kunci                                                                              |
|--------------------|------------------------------------------------------------------------------------------|
| `biaya_tarif`      | id, cabang_id, tahun_ajaran, jenjang_id, jenis (spp/full_day/care/kegiatan), nama, nominal, aktif |
| `diskon_siswa`     | id, siswa_id, cabang_id, tahun_ajaran, jenis, tipe (persen/nominal), nilai, aktif        |
| `tagihan`          | id, siswa_id, cabang_id, jenjang_id, rombel_id, paket, tahun_ajaran, periode, jenis, nama, nominal_awal, prorata_amount, koreksi_amount, diskon_amount, nominal_final, **status** (open/sebagian/lunas/void); UNIQUE(siswa_id,...,nama) |
| `pembayaran`       | id, cabang_id, siswa_id, receipt_no (UNIQUE), tanggal_bayar, nominal, metode (tunai/transfer/qris/lainnya), **status** (pending_verification/confirmed/rejected/void), verified_by |
| `pembayaran_alokasi` | id, pembayaran_id→pembayaran, tagihan_id→tagihan, nominal                              |
| `saldo_kredit`     | id, siswa_id, cabang_id, pembayaran_id, nominal, tipe (credit/used/void)                 |
| `invoice`          | id, cabang_id, siswa_id, invoice_no (UNIQUE), tahun_ajaran, status (issued/void)         |
| `invoice_item`     | id, invoice_id→invoice, tagihan_id→tagihan                                               |

### Audit & Notifikasi

| Tabel              | Field Kunci                                                                              |
|--------------------|------------------------------------------------------------------------------------------|
| `audit_log`        | id, actor_pengguna_id, action, entity_type, entity_id, cabang_id, before_json, after_json, reason, created_at |
| `notifikasi`       | id, recipient_pengguna_id, tipe, title, body, entity_type, entity_id, cabang_id, read_at, created_at |

### Utility

| Tabel                | Field Kunci                                                                            |
|----------------------|----------------------------------------------------------------------------------------|
| `sequence_counter`   | key (PK), value                                                                        |
| `kenaikan_batch`     | id, cabang_id, tahun_ajaran, tanggal_efektif, summary_json; UNIQUE(cabang_id,tahun_ajaran) |

---

## 6. Status Lifecycle Absensi (9 Status + Transisi)

### Status Values

| Status       | Warna UI                  | Keterangan                                     |
|--------------|---------------------------|------------------------------------------------|
| `Belum`      | slate (abu-abu)           | Default, belum ada aktivitas hari ini           |
| `Hadir`      | emerald (hijau)           | Check-in tepat waktu                            |
| `Terlambat`  | orange                    | Check-in setelah jam_masuk (dari operasional_config) |
| `Menunggu`   | sky/amber (biru muda)     | Penjemput sudah scan QR, siswa menunggu dijemput |
| `Pulang`     | slate (abu gelap)         | Serah terima selesai, siswa sudah pulang        |
| `Izin`       | sky (biru)                | Guru set keterangan izin                         |
| `Sakit`      | ungu                      | Guru set keterangan sakit                        |
| `Absen`      | red (merah)               | Tidak hadir tanpa keterangan / auto-set saat tutup hari |
| `Libur`      | indigo                    | Hari libur (dari kalender_event)                |

### Transisi Status

```
                    ┌─────────────────────────────────────┐
                    │              Belum                   │
                    └───┬──────────┬──────────┬───────────┘
                        │          │          │
                   checkin()  keterangan()  tutup_hari()
                        │          │          │
                        ▼          ▼          ▼
                   ┌─────────┐ ┌────────┐ ┌────────┐
                   │ Hadir / │ │Izin /  │ │ Absen  │
                   │Terlambat│ │Sakit / │ │(final) │
                   └────┬────┘ │ Absen  │ └────────┘
                        │      │(final) │
                   scan_penjemput()
                        │
                        ▼
                   ┌──────────┐
                   │ Menunggu │
                   └────┬─────┘
                        │
                   pulang() / nfc-scan(pulang)
                        │
                        ▼
                   ┌──────────┐
                   │  Pulang  │
                   │ (final)  │
                   └──────────┘
```

### Aturan Transisi

| Dari        | Ke                      | Trigger                                    | Guard                                                |
|-------------|-------------------------|--------------------------------------------|------------------------------------------------------|
| Belum       | Hadir / Terlambat       | checkin / nfc-scan(checkin)                | isSchoolDay, !isDayClosed, canMarkArrival             |
| Belum       | Izin / Sakit / Absen    | keterangan                                 | canSetKeterangan (tidak bisa timpa Hadir/Terlambat/Menunggu/Pulang) |
| Hadir/Terlambat | Menunggu            | penjemputan/scan (QR)                      | jam >= jam_pulang atau early_release ada atau pickup_fleksibel |
| Menunggu    | Pulang                  | penjemputan/pulang / nfc-scan(pulang)      | Status harus Menunggu                                 |
| Belum       | Absen                   | tutup-hari (otomatis)                      | Batch saat tutup hari                                 |
| Absen       | Hadir / Terlambat       | checkin / nfc-scan(checkin)                | canMarkArrival (Absen bisa diubah ke hadir)           |

### Konfigurasi Keterlambatan

- `operasional_config.hitung_terlambat` → 1 = aktif
- `operasional_config.jam_masuk` → default "08:00"
- Jika `jam_masuk` > config → status = Terlambat, else Hadir

---

## 7. Alur Data End-to-End

### Alur Absensi Harian

```
┌───────────────┐     ┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│    GURU       │     │   GERBANG     │     │    KEPSEK     │     │    WALI       │
│  (Check-in)   │     │ (Scan QR)     │     │  (Monitoring) │     │ (Portal)      │
└───────┬───────┘     └───────┬───────┘     └───────┬───────┘     └───────┬───────┘
        │                     │                     │                     │
   1. Guru tap NFC /          │                     │                     │
      manual check-in         │                     │                     │
      → Belum → Hadir         │                     │                     │
      → checkin() API         │                     │                     │
        │                     │                     │                     │
   2. Siswa masuk kelas       │                     │                     │
      (status: Hadir)         │                     │                     │
        │                     │                     │                     │
        │            3. Penjemput datang,            │                     │
        │               scan QR di gerbang           │                     │
        │               → Hadir → Menunggu           │                     │
        │               → scanPenjemput() API        │                     │
        │               → Notifikasi ke guru ROMBEL  │                     │
        │                     │                     │                     │
   4. Guru lihat notif        │                     │                     │
      "Penjemput tiba"        │                     │                     │
      → Antar siswa ke        │                     │                     │
        gerbang               │                     │                     │
        │                     │                     │                     │
        │            5. Gerbang konfirmasi            │                     │
        │               serah terima                  │                     │
        │               → Menunggu → Pulang          │                     │
        │               → pulangkan() API            │                     │
        │               → Log penjemputan            │                     │
        │                     │                     │                     │
        │                     │              6. Kepsek monitor            │
        │                     │                 real-time:                 │
        │                     │                 - Status counts            │
        │                     │                 - Red flag >15min          │
        │                     │                 - Early release            │
        │                     │                 - Auto-refresh 30s         │
        │                     │                     │                     │
   7. Guru isi daily record    │                     │                     │
      untuk setiap siswa:      │                     │                     │
      - Focus theme            │                     │                     │
      - Mood/Makan/Tidur       │                     │                     │
      - Observasi domain       │                     │                     │
      - Observasi note (≥12char)│                    │                     │
      - Foto (max 5)           │                     │                     │
      → save → draft           │                     │                     │
      → publish()              │                     │                     │
      → Notifikasi ke wali     │                     │                     │
        │                     │                     │                     │
        │                     │                     │              8. Wali terima
        │                     │                     │                 notifikasi
        │                     │                     │                 "Daily record baru"
        │                     │                     │                 → Buka detail
        │                     │                     │                 → Read tracking
        │                     │                     │                 → Kirim feedback
        │                     │                     │                 → Notif ke guru
        │                     │                     │                     │
   9. Guru tutup hari          │                     │                     │
      (akhir hari)             │                     │                     │
      → Belum → Absen          │                     │                     │
      (batch otomatis)         │                     │                     │
      → tutup_hari() API       │                     │                     │
      → Semua operasi locked   │                     │                     │
```

### Alur Daily Record

```
Guru buka tab "Daily Record"
  → List siswa (dari enrollment + guru_rombel assignment)
  → Filter: Semua / Belum / Sebagian / Lengkap
  → Search: nama siswa / rombel

Guru klik siswa → Editor:
  1. Pilih Focus Theme (dari modul_ajar → focus_theme per rombel per tanggal)
  2. Isi Mood (ceria/biasa/rewel)
  3. Isi Makan (habis/setengah/tidak)
  4. Isi Tidur (ya/tidak)
  5. Pilih Aktivitas (dari preset + custom)
  6. Pilih Observation Domain (8 domain kurikulum)
  7. Tulis Observation Note (minimal 12 karakter, kalimat objektif)
  8. Catatan tambahan (opsional)
  9. Catatan untuk wali (opsional)
  10. Upload foto (max 5, auto-crop square JPEG)
  11. Save (draft) → Publish

Completeness Score = 6 komponen: mood + makan + tidur + focus_theme + observation_domain + observation_note(≥12char)
  0% = Belum diisi
  1-99% = Sebagian
  100% = Lengkap

Publish Validation:
  - focus_theme_id wajib
  - mood + makan + tidur wajib
  - observation_domain wajib
  - observation_note ≥ 12 karakter wajib
```

### Alur Billing

```
Admin → Tab Billing:
  1. Setup Tarif (per cabang, tahun ajaran, jenjang, jenis: spp/full_day/care/kegiatan)
  2. Setup Diskon (per siswa, persen/nominal)
  3. Generate Tagihan Bulanan (preview → confirm)
     → Auto-hitung: nominal_awal - diskon = nominal_final
     → Status: open
  4. Generate Tagihan Kegiatan (preview → confirm)
  5. Record Pembayaran (tunai/transfer/qris)
     → Auto-allocate ke tagihan open (FIFO)
     → Status pembayaran: confirmed
     → Tagihan: open → sebagian → lunas
  6. Verifikasi / Reject / Void pembayaran
  7. Generate Invoice (PDF)
  8. Download Receipt (PDF)
  9. Laporan Keuangan (summary per periode)
```

---

## 8. Shared Components (Shared.jsx)

| Komponen              | Props                                                  | Fungsi                                           |
|-----------------------|--------------------------------------------------------|--------------------------------------------------|
| `Chip`                | `{status, manual}`                                     | Badge status absensi dengan ikon pencil (manual) |
| `SS` (Status Style)   | -                                                      | Object mapping status → Tailwind classes          |
| `LogoMark`            | `{className}`                                          | Logo Taruna Prima                                |
| `LiveClock`           | `{className}`                                          | Jam real-time WIB (update tiap detik)            |
| `Toast`               | `{items}`                                              | Notifikasi toast (ok/warn/err)                   |
| `IconButton`          | `{icon, label, onClick, variant, size, disabled}`      | Tombol icon-only (ghost/primary/secondary/danger/plain) |
| `ActionButton`        | `{icon, children, label, onClick, variant, disabled}`  | Tombol dengan teks (primary/secondary/ghost/danger) |
| `Modal`               | `{title, onClose, children, maxWidth}`                 | Modal dialog (max-w-md default, ESC to close)    |
| `Spinner`             | -                                                      | Loading spinner (border animation)               |
| `EmptyState`          | `{icon, title, description, action}`                   | Empty state placeholder                          |
| `ConfirmActionModal`  | `{title, onClose, onSubmit, entityName, affectedBranch, consequence, requireReason, actionLabel, actionVariant, icon}` | Modal konfirmasi dengan alasan wajib opsional |
| `CustomSelect`        | `{value, onChange, className, children, placeholder, disabled}` | Dropdown select (portal-based, auto-position up/down) |
| `SearchableSelect`    | `{value, onChange, className, children, placeholder, searchPlaceholder, disabled}` | Dropdown dengan search input |
| `nowWIB()`            | -                                                      | Waktu sekarang WIB {h, m, s}                     |
| `todayWIB()`          | -                                                      | Tanggal hari ini WIB (YYYY-MM-DD)                |
| `meniTunggu(jam)`     | `jam` (HH:MM)                                          | Hitung menit sejak jam_tunggu                    |

---

## 9. Design System

### Warna (DESIGN.md + tailwind.theme.json)

| Token               | Hex       | Penggunaan                              |
|---------------------|-----------|-----------------------------------------|
| `primary`           | `#f59e0b` | Amber — accent utama, tombol, link      |
| `primary-hover`     | `#d97706` | Hover state                             |
| `primary-active`    | `#b45309` | Active/pressed state                    |
| `primary-container` | `#fffbeb` | Background container primary-light      |
| `text-main`         | `#0f172a` | Teks utama (dark slate)                 |
| `surface-disabled`  | `#f8fafc` | Background disabled                     |
| `border-subtle`     | `#64748b` | Border subtle, label text               |
| `scrollbar-thumb`   | `#d1d5db` | Scrollbar custom                        |

### Typography

- **Font:** DM Sans (Google Fonts)
- **Weight:** 400 (normal), 500 (medium), 600 (semibold), 700 (bold), 800 (extrabold), 900 (black)
- **Heading pattern:** `font-black` (900) untuk judul
- **Label pattern:** `text-xs font-black text-border-subtle` (`.label` class)

### Spacing & Rounded

| Token   | Value  | Penggunaan                        |
|---------|--------|-----------------------------------|
| `sm`    | 4px    | Gap kecil                         |
| `md`    | 8px    | Border radius standar             |
| `lg`    | 12px   | Card radius                       |
| `xl`    | 16px   | Modal/input radius                |
| `2xl`   | 20px   | Large card/section radius         |

### Component Classes (CSS @layer components)

```css
.input        → px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:ring-2 focus:ring-primary/30
.btn          → h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium
.btn-secondary → h-9 px-4 rounded-lg bg-text-main text-white text-sm font-medium
.link         → text-sm font-black text-primary hover:text-primary-hover
.label        → text-xs font-black text-border-subtle block mb-1
.td           → py-2 px-3 text-slate-700 whitespace-nowrap
```

### Animations

| Class              | Effect                                              |
|--------------------|-----------------------------------------------------|
| `animate-slide-up` | Slide up 16px + fade in (0.3s)                      |
| `animate-bounce-in`| Scale 0.85→1.05→1 (0.4s)                           |
| `animate-blink`    | Opacity 1→0.3→1 infinite (1.2s)                     |
| `active:scale-95`  | Press feedback pada button                           |
| `active:scale-[0.98]` | Press feedback pada action button                |

### Responsive Breakpoints

| Breakpoint | Width   | Penggunaan                              |
|------------|---------|-----------------------------------------|
| (default)  | <640px  | Mobile-first                            |
| `xs`       | ≥475px  | Custom small screen                     |
| `sm`       | ≥640px  | Small tablet                            |
| `md`       | ≥768px  | Tablet / sidebar visible                |
| `lg`       | ≥1024px | Desktop / split layout                  |
| `xl`       | ≥1280px | Large desktop                           |
| `2xl`      | ≥1536px | Extra large                             |

---

## 10. Refinements yang Sudah Dilakukan

### UI/UX Refinements

| Refinement                      | Deskripsi                                                                                  |
|---------------------------------|--------------------------------------------------------------------------------------------|
| **Compact RombelCard**          | Kartu rombel yang lebih ringkas dan padat informasi                                        |
| **Status Summary Strip**        | Strip horizontal berisi ringkasan status (Hadir, Terlambat, Menunggu, dll) dengan color coding |
| **Priority Section**            | Bagian prioritas di monitoring (Red Flag > 15 menit menunggu)                              |
| **Early Release Panel**         | Panel izin pulang dini di monitoring kepsek                                                |
| **Sticky Searchbar**            | Search bar yang tetap visible saat scroll (sticky positioning)                             |
| **Glassmorphism Mobile**        | Efek backdrop-blur pada header/sidebar mobile (`bg-white/80 backdrop-blur-md`)             |
| **Unified Filter Row**          | Baris filter yang konsisten (search + status filter + date picker dalam satu row)          |
| **Sidebar Collapse**            | Desktop sidebar bisa collapse (icon-only) dengan localStorage persistence                  |
| **Mobile Sidebar Drawer**       | Sidebar mobile sebagai drawer overlay dengan backdrop blur                                  |
| **URL State Sync**              | View dan tab disinkronisasi ke URL query params (`?view=admin&tab=siswa`)                  |
| **CompleteBadge**               | Badge completeness daily record (Belum / Sebagian X% / ✓ Lengkap)                         |
| **StudentAvatar**               | Avatar dengan initials + deterministic color dari hash nama                                |
| **StatusBadge**                 | Badge status siswa (aktif/lulus/keluar/undangan/nonaktif) dengan dot indicator             |
| **Live Clock**                  | Jam real-time WIB di monitoring kepsek                                                     |
| **Auto-refresh 30s**            | Monitoring kepsek auto-refresh setiap 30 detik                                             |
| **Reminder Pengingat**          | Notifikasi di GuruView jika daily record belum lengkap setelah jam yang ditentukan         |
| **Dark Theme Gerbang**          | GerbangView menggunakan dark theme (`bg-slate-950`) untuk visibilitas di pos gerbang       |
| **NFC Support**                 | Support Web NFC API untuk tap kartu siswa + fallback input manual                          |
| **QR Camera Scanner**           | BarcodeDetector API untuk scan QR penjemput via kamera                                     |
| **Wali Multi-Child**            | Tab selector untuk wali dengan >1 anak                                                     |
| **Read Tracking**               | Tracking kapan wali membaca daily record (laporan_read table)                              |
| **Comment Thread**              | Thread komentar dua arah (guru ↔ wali) pada daily record                                  |
| **Audit Trail**                 | Semua perubahan tercatat di audit_log dengan before/after JSON                             |
| **Toast Notifications**         | Notifikasi toast dengan 3 variant (ok/warn/err) dan auto-dismiss 3.5s                     |
| **Notification Bell**           | Badge counter notifikasi di header, dropdown preview                                       |
| **Confirm Action Modal**        | Modal konfirmasi untuk aksi destructive (tutup hari, void, delete) dengan reason wajib opsional |
| **Custom Select**               | Dropdown custom (portal-based) menggantikan native select yang kurang konsisten            |
| **Searchable Select**           | Dropdown dengan search untuk list panjang (siswa, rombel)                                  |
| **Day Close Flow**              | Alur tutup hari: Belum → Absen otomatis, lock semua operasi                                |
| **Backup/Restore**              | Download backup DB + restore dari file dengan integrity check                              |
| **PDF Invoice & Receipt**       | Generate PDF invoice dan receipt pembayaran                                                |
| **Kenaikan Kelas**              | Preview dan execute kenaikan kelas batch                                                   |
| **NFC Scan Logging**            | Log semua scan NFC (success/failed) dengan token masking                                   |
| **Penjemputan Log**             | Log lengkap penjemputan (scan time, pulang time, durasi, sumber)                           |

---

## Appendix: Notification Types

| Tipe                  | Trigger                           | Recipient         |
|-----------------------|-----------------------------------|-------------------|
| `pickup_waiting`      | Penjemput scan QR                 | Guru rombel       |
| `absensi_keterangan`  | Guru set Izin/Sakit/Absen         | Kepsek cabang     |
| `early_release`       | Admin/kepsek buat izin pulang dini| Kepsek cabang     |
| `daily_published`     | Guru publish daily record         | Wali siswa        |
| `wali_comment`        | Wali kirim feedback               | Guru rombel       |
| `guru_reply`          | Guru balas komentar               | Wali siswa        |

---

## Appendix: School Year Logic

```javascript
// schoolYearForDate(tanggal)
// Juli-Desember → tahun/tahun+1
// Januari-Juni → tahun-1/tahun
// Contoh: "2026-07-15" → "2026/2027"
// Contoh: "2026-03-10" → "2025/2026"
```

## Appendix: School Day Logic

```javascript
// isSchoolDay(tanggal, cabangId)
// 1. Cek kalender_event scope='cabang' → tipe='masuk' atau 'libur'
// 2. Jika tidak ada, cek kalender_event scope='yayasan'
// 3. Jika tidak ada, default: Senin-Jumat = masuk, Sabtu-Minggu = libur
```
