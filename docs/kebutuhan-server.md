# Kebutuhan Server SIAGA (ukur, bukan tebakan)

Dokumen ini menjawab satu pertanyaan: **server secukit apa yang cukup untuk
SIAGA?** Angkanya diambil dari pengukuran nyata pada proses yang berjalan, bukan
estimasi.

## 1. Jejak sumber daya yang terukur

| Komponen | Terukur | Catatan |
| --- | --- | --- |
| Backend (Node + Express + better-sqlite3) | **~150 MB RAM**, CPU 1,9 detik seumur hidup proses | SQLite berjalan di dalam proses Node — **tidak ada database server terpisah** |
| Database (`siaga.db`) | 572 KB | Beberapa bulan data demo. Bertambah puluhan MB/tahun, bukan puluhan GB |
| Foto & lampiran unggahan (`backend/uploads`) | 8,2 MB (74 berkas) | Foto sudah dikompresi sharp (400px). Rata-rata ~100 KB/berkas |
| Frontend hasil build (`frontend/dist`) | 1,5 MB | Sudah terkompresi + ber-hash |
| Dependensi backend (`node_modules`) | ~273 MB termasuk dev-dep | Produksi (`npm ci --omit=dev`) lebih kecil |

Total awal di server: **di bawah 1 GB disk** untuk aplikasi + data. Sisanya
untuk sistem operasi dan ruang napas.

## 2. Verdict per spesifikasi

Berikut penilaian untuk bundle VPS murah yang biasa ditawarkan
(**2 vCPU / 2 GB RAM / 20 Mbps / 40 GB disk**, sekitar US$ 8–10/tahun):

| Spesifikasi | Cukup? | Alasan |
| --- | --- | --- |
| **RAM 2 GB** | ✅ Cukup (tanpa open-wa) | Budget: OS ~150 MB + nginx ~50 MB + backend ~150–250 MB (puncak: generate PDF, resize foto). Sisa ~1,5 GB |
| **RAM 2 GB + open-wa** | ⚠️ Mepet | Chromium WhatsApp Web butuh 400–900 MB dan bisa memuncak 1,2 GB. Bersama backend, total bisa menyentuh 1,4 GB. Tidak akan crash kalau ada swap, tapi akan lelet saat buru-buru |
| **CPU 2 vCPU** | ✅ Cukup | Beban terukur 1,9 detik CPU seumur hidup proses. Operasi terberat (PDF kuitansi, resize sharp) adalah burst pendetik |
| **Disk 40 GB** | ✅ Cukup | Aplikasi + data < 1 GB. Sisanya untuk backup lokal, log, dan tumbuhnya foto |
| **Bandwidth 20 Mbps** | ✅ Cukup | Satu kunjungan orang tua ≈ 0,8–1,5 MB. 30 orang tua × 2 kunjungan/hari ≈ **2,2 GB/bulan**. Periksa apakah ada kuota bulanan di panel (umumnya 500 GB–1 TB — aman) |

**Kesimpulan untuk SIAGA saja: kuat.** Untuk beberapa cabang dengan beban
sekolah nyata (ratusan siswa, puluhan orang tua), 2 vCPU/2 GB masih nyaman.

**Kesimpulan untuk open-wa di server yang sama: jangan.** Kecuali upgrade ke
4 GB RAM. Untuk kanal WhatsApp di VPS 2 GB, pakai provider `gateway`
(Fonnte/Wablas) — tidak ada Chromium, tidak ada risiko RAM. Lihat
[docs/whatsapp.md](whatsapp.md).

## 3. Yang perlu diperhatikan saat deploy di VPS murah

1. **Harga perpanjangan.** Diskon 80% biasanya hanya tahun pertama. Anggaran
   untuk harga normal (~US$ 50/tahun untuk bundle di atas), bukan harga promo.
2. **Region.** Pilih yang paling dekat dengan pengguna (Singapura/Jakarta untuk
   Indonesia). Latensi rendah = portal terasa responsif.
3. **Swap wajib ada.** Script bootstrap (`scripts/tencent-lighthouse-bootstrap.sh`)
   sudah membuat swap 4 GB. Ini penyelamat saat lonjakan memori; jangan dilewat.
4. **Jangan jalankan open-wa di sini** (kecuali RAM ditambah). Kalau terpaksa,
   turunkan `MemoryMax` di `deploy/systemd/siaga-wa.service` dari 1500M menjadi
   **700M** agar Chromium dimatikan sebelum menghabiskan RAM backend.
5. **Backup lokal menempati disk.** Dengan retensi 30 cadangan DB + 30 arsip
   uploads, perkirakan `30 × (ukuran DB + ukuran uploads)`. Untuk ukuran sekarang
   itu < 500 MB — aman. Kalau foto menumpuk, naikkan BACKUP_DIR ke disk lain
   atau kurangi `BACKUP_RETENTION_COUNT`.
6. **Backup TIDAK cuma database.** `scripts/backup.js` sekarang mengarsipkan
   `backend/uploads` juga (foto anak + foto bukti pembayaran). Bukti pembayaran
   adalah bukti finansial — pasca-bencana, database yang utuh tapi bukti transfer
   yang hilang tetap masalah besar.
7. **CPU VPS murah biasanya dibagi (burstable).** Kalau terasa lambat saat
   banyak orang tua membuka portal bersamaan (mis. pagi saat tagihan terbit),
   itu wajar. Amati dengan `htop`/`vmstat 1` sebelum memutuskan upgrade.
8. **SQLite butuh disk lokal.** Jangan menaruh database di network filesystem
   (NFS/GlusterFS) — WAL mode membutuhkan locking lokal. Di VPS biasa disknya
   lokal, jadi aman.

## 4. Tanda sudah waktunya upgrade

- Backend RSS > 500 MB terus-menerus (bukan sesaat) → cari kebocoran, baru
  naikkan RAM.
- `iostat -x 1` menunjukkan disk 100% utilized saat jam sibuk.
- Latensi API > 1 detik dari jaringan orang tua (ukur dari HP, bukan dari
  server).
- Uploads > beberapa GB (foto menumpuk) → pindahkan ke object storage.

## 5. Rencana skala (kalau nanti berkembang)

| Pengguna | Spek yang disarankan | Catatan |
| --- | --- | --- |
| 1–3 cabang, < 200 siswa | 2 vCPU / 2 GB | Nyaman. open-wa **tidak** disarankan di sini |
| 3–8 cabang, < 800 siswa | 2 vCPU / 4 GB | Bisa menjalankan open-wa (batasi 800M) |
| > 8 cabang / > 800 siswa | 4 vCPU / 8 GB + review indeks DB | Backup ke object storage, pertimbangkan Postgres |

---

*Angka di halaman ini berasal dari pengukuran pada instance pengembangan
(Windows, Node 22) sebagai representasi proses aplikasi yang sama. Angka pada
server Linux akan sebanding; verifikasi ulang dengan `systemctl status siaga`
dan `ps -o rss= -p $(pgrep -f 'node backend/server.js')` setelah deploy.*
