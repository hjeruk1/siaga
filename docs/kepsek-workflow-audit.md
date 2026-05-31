# SIAGA Workflow Audit - Kepsek View Integration

## Database Schema (Tabel Relevan)

| Tabel | Fungsi | Field Kunci |
|---|---|---|
| `absensi` | Absensi harian per siswa | `status` CHECK IN ('Belum','Hadir','Terlambat','Menunggu','Pulang','Izin','Sakit','Absen','Libur'), `jam_masuk`, `jam_tunggu`, `jam_pulang`, `penjemput_id`, `manual`, `catatan` |
| `penjemputan_log` | Log serah terima | `jam_scan`, `jam_pulang`, `durasi_menit`, `sumber` CHECK IN ('manual','nfc','qr') |
| `early_release` | Izin pulang sebelum waktunya | `siswa_id`, `tanggal`, `alasan`, UNIQUE(siswa_id, tanggal) |
| `tutup_hari` | Penutupan hari operasional | `cabang_id`, `tanggal`, `summary` (JSON) |
| `penjemput` | Master penjemput per siswa | `qr_code`, `aktif`, `relasi` |
| `laporan_harian` | Daily record per siswa | `status` CHECK IN ('draft','published'), `mood`, `makan`, `tidur` |
| `notifikasi` | Notifikasi pengguna | `tipe`, `entity_type`, `entity_id`, `read_at` |

## 9 Status Absensi

1. **Belum** - Default awal hari, belum ada aktivitas
2. **Hadir** - Check-in tepat waktu
3. **Terlambat** - Check-in setelah jam_masuk config
4. **Menunggu** - Penjemput scan QR, menunggu serah terima
5. **Pulang** - Serah terima selesai
6. **Izin** - Tidak masuk (izin)
7. **Sakit** - Tidak masuk (sakit)
8. **Absen** - Tidak hadir tanpa keterangan (auto dari tutup_hari)
9. **Libur** - Virtual, dari rekap bulanan

## Alur Data

```
PAGI:
  Guru check-in manual/NFC -> Belum -> Hadir/Terlambat
  Guru set keterangan -> Belum/Absen -> Izin/Sakit/Absen

SIANG:
  Gerbang scan QR penjemput -> Hadir/Terlambat -> Menunggu
  Guru/Gerbang konfirmasi serah terima -> Menunggu -> Pulang

AKHIR HARI:
  Guru tutup hari -> semua Belum -> Absen

PULANG DINI:
  Kepsek/admin buat early_release -> early_release table
  Gerbang cek early_release saat scan -> bypass jam_pulang check
```

## Backend API Endpoints

### Absensi (server/routes/absensi.js)
- GET /api/absensi/today - Data absensi hari ini
- POST /api/absensi/checkin - Check-in manual (guru, admin)
- POST /api/absensi/keterangan - Set Izin/Sakit/Absen (guru, admin)
- POST /api/absensi/nfc-scan - NFC check-in/pulang
- POST /api/absensi/early-release - Buat izin pulang dini (admin, kepsek)
- GET /api/absensi/early-release - Lihat daftar pulang dini (semua)
- DELETE /api/absensi/early-release/:id - Hapus izin pulang dini (admin, kepsek)
- POST /api/absensi/tutup-hari - Tutup hari, Belum->Absen

### Penjemputan (server/routes/penjemputan.js)
- POST /api/penjemputan/scan - Scan QR -> Menunggu
- POST /api/penjemputan/pulang - Konfirmasi serah terima -> Pulang

### Rekap (server/routes/rekap.js)
- GET /api/rekap/dashboard - Dashboard monitoring (SUMBER UTAMA KepsekView)

## SUDAH ADA vs BELUM ADA

### Sudah Berfungsi Lengkap:
- Check-in manual & NFC (GuruView)
- Keterangan Izin/Sakit/Absen (GuruView)
- Scan QR penjemput (GerbangView)
- Serah terima/pulang (GerbangView + GuruView)
- NFC pulang
- Tutup hari
- Monitoring real-time kepsek (30s refresh)
- Dashboard per rombel (progress bar + list siswa aktif)
- Notifikasi ke guru saat penjemput tiba
- Early release backend CRUD
- Audit trail
- Rekap bulanan
- Daily record (laporan harian)

### GAP (Backend ada, UI belum ada):
1. **Early Release UI di KepsekView** - Backend support role kepsek, tapi tidak ada komponen UI
2. **Early Release UI di GerbangView** - GerbangView tidak tampilkan daftar early_release hari ini
3. **Early Release UI di GuruView** - Tidak ada akses
4. **Statistik Izin/Sakit/Absen/Terlambat di KepsekView** - MonitoringPanel hanya: Hadir, Masih di Sekolah, Menunggu, Red Flag. Tidak ada counter Izin/Sakit/Absen
5. **Detail jam masuk per siswa di KepsekView** - Data tersedia tapi tidak ditampilkan
6. **Aksi kepsek dari monitoring** - Kepsek hanya lihat, tidak bisa approve early release atau tutup hari dari KepsekView (backend sudah allow)
7. **Rekap harian lengkap kepsek** - Tidak ada "Hadir X, Terlambat X, Izin X, Sakit X, Absen X, Belum X" di satu tempat
8. **Notifikasi ke kepsek** - Tidak ada notif untuk event penting (red flag, early release, izin/sakit baru)

## Status Board Integration Map

### Grup Status untuk Status Board:
- **Red Flag**: siswaAktif where status=Menunggu && meniTunggu > 15 menit
- **Menunggu Jemput**: siswaAktif where status=Menunggu && meniTunggu <= 15 menit
- **Masih di Sekolah**: siswaAktif where status != Menunggu (Hadir/Terlambat)
- **Pulang**: siswa where status=Pulang (opsional, ringkasan saja)
- **Izin/Sakit**: perlu query tambahan dari absensi where status IN ('Izin','Sakit')
- **Early Release**: perlu query ke tabel early_release
- **Terlambat**: dari absensi where status=Terlambat
- **Absen/Belum**: dari tutup_hari summary atau query absensi where status IN ('Belum','Absen')

### Data yang sudah tersedia di api.dashboard():
- byKelas: per rombel (total, hadir, menunggu, pulang)
- siswaAktif: semua siswa yang belum pulang
- hari_status: status hari (nama hari, libur/tidak)

### Data yang PERLU ditambahkan ke api.dashboard():
- count_izin: total izin hari ini
- count_sakit: total sakit hari ini
- count_terlambat: total terlambat hari ini
- count_absen: total absen hari ini
- early_releases: daftar siswa dengan izin pulang dini
- rekap_hari: summary lengkap semua status
