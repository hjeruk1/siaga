# Backup & Restore SIAGA

Dokumen ini menjawab satu pertanyaan: **kalau server mati atau data rusak, bagaimana
caranya kembali?** Backup yang belum pernah dipulihkan hanyalah asumsi — karena itu
prosedur di bawah sudah diuji nyata (lihat bagian 6).

---

## 1. Apa yang dicadangkan

| Artefak | Isi | Nama berkas |
|---|---|---|
| Database | seluruh data (siswa, absensi, tagihan, catatan harian, izin, audit) | `siaga-backup-YYYY-MM-DD-HHmmss.db` |
| Uploads | foto anak, lampiran catatan harian, **bukti pembayaran**, **surat izin/sakit** | `siaga-uploads-YYYY-MM-DD-HHmmss.tar.gz` |

Keduanya memakai **stempel waktu yang sama** saat dibuat dalam satu kali jalan,
sehingga mudah dipasangkan. Retensi dihitung **per jenis** (default 30 masing-masing),
jadi arsip uploads yang lebih baru tidak pernah "menghapus" cadangan database.

Menjalankan backup:

```bash
npm run db:backup         # atau: node scripts/backup.js
```

Opsional ke Google Cloud Storage: isi `GCS_BUCKET_NAME` + `GCS_KEY_FILE_PATH`
di `/etc/siaga/siaga.env`. Kegagalan upload ke cloud tidak membatalkan backup lokal.

---

## 2. Aturan keselamatan alat restore

`scripts/restore.js` sengaja dibuat "rewel":

1. **Tanpa `--apply` hanya memeriksa (dry-run).** Perintah default tidak menulis
   apa pun, sehingga salah ketik tidak langsung menimpa database produksi.
2. **Cadangan diverifikasi lebih dulu** — `integrity_check` SQLite dan uji gzip
   arsip uploads. Cadangan rusak ditolak sebelum satu berkaspun disentuh.
3. **Data aktif selalu disalin** ke `<db>.pre-restore-<waktu>` sebelum ditimpa,
   dan folder uploads lama **diganti nama** (bukan dihapus).
4. **Urutan eksekusi aman**: arsip uploads diekstrak ke folder sementara lebih
   dulu, baru database ditukar. Kalau arsipnya rusak, database tidak tersentuh.

---

## 3. Prosedur pemulihan di server

```bash
# 0. Hentikan layanan supaya tidak ada yang menulis ke database saat ditukar
sudo systemctl stop siaga

# 1. Lihat cadangan yang tersedia (dipasangkan db + uploads)
node scripts/restore.js --list

# 2. Periksa dulu tanpa menulis apa pun
node scripts/restore.js --from /var/backups/siaga

# 3. Pulihkan
node scripts/restore.js --from /var/backups/siaga --apply

# 4. Jalankan kembali
sudo systemctl start siaga
sudo systemctl status siaga
curl -s localhost:3001/api/health
```

Memilih cadangan tertentu (bukan yang terbaru):

```bash
node scripts/restore.js \
  --db /var/backups/siaga/siaga-backup-2026-10-20-020000.db \
  --uploads /var/backups/siaga/siaga-uploads-2026-10-20-020000.tar.gz \
  --apply
```

Memulihkan **hanya database** (arsip uploads tidak dipakai):

```bash
node scripts/restore.js --db /var/backups/siaga/siaga-backup-....db --apply
```

Memulihkan ke **lokasi lain** untuk diperiksa tanpa menyentuh produksi:

```bash
node scripts/restore.js --from /var/backups/siaga --apply \
  --db-path /tmp/periksa.db --uploads-dir /tmp/periksa-uploads
```

---

## 4. Kalau ternyata salah pilih cadangan

Alat ini tidak punya tombol undo, tetapi selalu meninggalkan jalan kembali:

```bash
ls -la /var/lib/siaga/siaga.db.pre-restore-*     # salinan data sebelum restore
ls -d  /var/lib/siaga/uploads.pre-restore-*      # folder uploads lama
```

Pulihkan kembali dengan menyalin berkas tersebut ke posisi semula (layanan
dalam keadaan berhenti), atau jalankan `restore.js` dengan `--db` menunjuk ke
berkas `pre-restore` itu.

---

## 5. Memulihkan dari Google Cloud Storage

Cadangan di GCS harus diunduh dulu, lalu diperlakukan sebagai berkas lokal:

```bash
gcloud storage cp gs://<bucket>/backups/siaga-backup-2026-10-20-020000.db /tmp/
gcloud storage cp gs://<bucket>/backups/siaga-uploads-2026-10-20-020000.tar.gz /tmp/
node scripts/restore.js --db /tmp/siaga-backup-2026-10-20-020000.db \
                        --uploads /tmp/siaga-uploads-2026-10-20-020000.tar.gz --apply
```

---

## 6. Bukti prosedur ini pernah dijalankan

Uji dilakukan pada data nyata (bukan database kosong):

| Langkah | Hasil |
|---|---|
| Backup database + uploads | 0,6 MB / 10,5 MB, 122 berkas dalam arsip |
| Tambahkan penanda ke data aktif | 60 siswa (59 + 1 penanda) |
| Dry-run | laporan cocok, penanda **masih ada**, tidak ada berkas berubah |
| `--apply` | penanda hilang, 59 siswa, `integrity_check: ok`, uploads 122 berkas |
| Salinan pengaman | `siaga.db.pre-restore-*` dan `uploads.pre-restore-*` terbentuk |
| Cadangan database rusak | ditolak (kode 1), data aktif tidak berubah |
| Arsip uploads rusak | ditolak (kode 1) **sebelum** database ditimpa |
| Tanpa cadangan | kode 2 dengan pesan jelas |

Tes otomatisnya ada di `scripts/restore.test.js` (6 tes) dan ikut berjalan di CI.

> Catatan jujur: uji ini memakai salinan database, bukan server produksi yang
> sedang melayani pengguna. Yang terbukti adalah mekanisme pemulihan dan
> perilakunya saat gagal — bukan waktu henti (downtime) di server sungguhan.
> Lakukan sekali drill di server saat jam sepi sebelum benar-benar dibutuhkan.

---

## 7. Yang TIDAK dilakukan alat ini

- **Bukan point-in-time recovery.** Yang tersedia adalah snapshot saat backup
  berjalan (default harian). Kehilangan data di antara dua backup tidak bisa
  dipulihkan.
- **Tidak mengembalikan skema aplikasi.** Kalau kode sudah naik versi dan
  migrasinya menghapus/mengubah kolom, memulihkan database lama bisa membuat
  aplikasi versi baru tidak cocok. Pulihkan kode ke versi yang sezaman dengan
  cadangan bila perlu.
- **Tidak menyentuh berkas sesi WhatsApp** (`*.data.json`). Sesi itu sengaja
  tidak dicadangkan karena berisi kredensial; setelah restore, pindai QR ulang
  bila perangkat tertaut sudah tidak ada.
- **Tidak otomatis menjalankan migrasi.** Setelah restore, jalankan
  `npm run db:migrate` hanya bila memang ingin menaikkan skema.
