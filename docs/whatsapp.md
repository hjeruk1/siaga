# Kanal Notifikasi WhatsApp

Dokumen ini menjelaskan bagaimana SIAGA mengirim notifikasi ke orang tua lewat
WhatsApp, **risiko yang harus diterima sebelum mengaktifkannya**, dan langkah
setup untuk open-wa maupun gateway resmi.

---

## 1. Ringkasan arsitektur

```
notify() (backend/utils/workflow.js)
  ├─ notifikasi in-app (selalu)
  ├─ Web Push (kalau VAPID diset)
  └─ WhatsApp (kalau WA_PROVIDER != none)
        └─ antrean berpacu (WA_DELAY_MS + jitter)
              └─ provider aktif
                    ├─ openwa  → Easy API open-wa (HTTP terpisah)
                    └─ gateway → reseller resmi (HTTP generik)
```

Semua jalur bersifat *fire-and-forget*: kegagalan WhatsApp **tidak pernah**
menjatuhkan alur utama (check-in, pembayaran, publish daily record). Kegagalan
tercatat di kolom `notifikasi.wa_error`, keberhasilan di `notifikasi.wa_sent_at`,
sehingga keluhan "saya tidak pernah terima kabar" bisa diaudit.

Hanya tipe notifikasi yang masuk `WA_TIPE_AKTIF` yang dikirim, dan hanya untuk
penerima berperan **wali** yang punya `no_wa`. Notifikasi operasional staff
(guru, kepsek, gerbang) tidak ikut.

Tipe bawaan yang diizinkan: `daily_published`, `guru_reply`,
`payment_verified`, `payment_rejected`, `invoice_issued`, `payment_claim`.

**Tidak ada open-wa di dalam repo ini.** Tidak ada paket `@open-wa` di
`package.json`, tidak ada Chromium yang diunduh saat `npm install`, dan tidak
ada kode yang mengaktifkannya sendiri. open-wa adalah **proses terpisah di
server** yang dipanggil lewat HTTP; komputer pengembangan yang terlanjur
memasangnya tidak memengaruhi apa pun. Lihat [bagian 6](#6-deploy-di-server-sendiri-bukan-komputer-pengembangan)
untuk topologi dan langkah deploy.

---

## 2. ⚠️ Risiko open-wa — baca sebelum produksi

open-wa bekerja dengan **mengotomasi WhatsApp Web**. Meta tidak mengizinkan
ini dalam Ketentuan Layanan WhatsApp. Konsekuensinya, secara jujur:

| Risiko | Dampak | Mitigasi |
| --- | --- | --- |
| **Nomor diblokir** | Sekolah kehilangan nomor, harus pindah nomor &.infokan ulang ke semua orang tua | Pakai **nomor khusus**, bukan nomor utama yayasan. Sediakan nomor cadangan. |
| **Sesi terputus** | HP mati/offline → tidak ada pesan terkirim | Pantau `GET /api/wa/status`; HP harus menyala & terhubung. |
| **Berkas sesi = kredensial** | `*.data.json` bisa dipakai siapa pun untuk mengambil alih sesi WhatsApp | Jangan di-commit (sudah di-gitignore), batasi izin berkas, backup terenkripsi. |
| **Chat baru bisa dibatasi** | Dokumentasi open-wa: mengirim ke nomor yang **belum pernah** mengirim pesan lebih dulu perlu lisensi restricted/premium | Uji dahulu ke nomor yang sudah pernah menghubungi. Untuk berskala besar, pindah ke gateway resmi. |
| **Berat** | Easy API menjalankan Chromium (ratusan MB RAM) | Jalankan sebagai service terpisah; backend SIAGA tetap ringan karena hanya HTTP. |
| **Perubahan protokol WhatsApp Web** | Fitur bisa rusak tanpa peringatan | Pantau rilis open-wa; siapkan fallback ke gateway. |

**Rekomendasi:** untuk pilot/percobaan, open-wa cukup. Untuk operasional harian
yang menjadi janji ke orang tua, gunakan gateway resmi (Fonnte, Wablas,
Twilio) atau WhatsApp Business Cloud API resmi — biaya per pesan kecil
dibanding risiko nomor sekolah diblokir.

---

## 3. Konfigurasi (`.env` backend)

```bash
# Mati (bawaan) — hanya in-app + push
WA_PROVIDER=none

# Easy API open-wa (proses terpisah)
WA_PROVIDER=openwa
WA_API_URL=http://127.0.0.1:8080
WA_API_KEY=<kunci-panjang-acak>

# Gateway resmi (Fonnte/Wablas/dll)
WA_PROVIDER=gateway
WA_GATEWAY_URL=https://api.fonnte.com/send
WA_GATEWAY_TOKEN=<token>

# Jeda antar pesan; 1500 ms + jitter hingga 700 ms. Jangan turunkan ke 0 di
# produksi — pengiriman deras adalah pemicu pemblokiran nomor.
WA_DELAY_MS=1500

# Tipe yang boleh keluar sebagai WhatsApp
WA_TIPE_AKTIF=daily_published,guru_reply,payment_verified,payment_rejected,invoice_issued,payment_claim
```

Contoh lengkap ada di `backend/.env.example`.

---

## 4. Setup open-wa (Easy API)

Easy API dijalankan sebagai proses terpisah — backend SIAGA hanya memanggilnya
lewat HTTP, jadi restart backend tidak memutus sesi WhatsApp.

```bash
export WA_API_KEY="kunci-acak-yang-panjang"
npx @open-wa/wa-automate@5.6.6 \
  --session-id siaga \
  --host 127.0.0.1 --port 8080 \
  --api-key "$WA_API_KEY"
```

1. Buka `http://127.0.0.1:8080/dashboard/`.
2. Di HP nomor sekolah: **WhatsApp → Perangkat Tertaut → Tautkan Perangkat**,
   lalu pindai QR.
3. Tunggu status sesi *ready*.
4. Verifikasi dari SIAGA: `GET /api/wa/status` (peran admin/admin_cabang/kepsek)
   harus menampilkan `aktif: true`, `provider: "openwa"`, `connected: true`,
   `ready: true`.

Catatan operasional:

- Sesi disimpan di `siaga.data.json` pada direktori tempat Easy API dijalankan.
  Perlakukan berkas ini seperti password.
- Jalankan Easy API sebagai service systemd agar hidup otomatis setelah reboot.
- Jangan membuka port 8080 ke internet; akses hanya dari localhost. Kalau
  Easy API di host berbeda, wajib HTTPS + API key, dan batasi firewall.

---

## 5. Pantau & audit

### Pemantau otomatis (berjalan sendiri)

Sesi WhatsApp bisa berhenti bekerja **tanpa suara**: Easy API mati, sesi logout
(perlu pindai QR ulang), atau token gateway kedaluwarsa. Tanpa pemantau, yang
pertama tahu adalah orang tua yang bertanya "kenapa saya tidak menerima kabar?".

Karena itu backend memeriksa kanal setiap **5 menit** (`WA_CHECK_MS`, bisa
diubah; `WA_MONITOR=off` mematikannya) dan:

- menyimpan keadaan terakhir di tabel `wa_monitor` (status, sejak kapan,
  berapa kali gagal beruntun, kapan terakhir sehat);
- mengirim **satu** notifikasi ke semua admin saat kanal putus, lalu
  mengingatkan tiap **6 jam** selama masih putus — alarm tiap 5 menit akan
  diabaikan orang, dan itu sama saja dengan tidak memberi tahu;
- mengirim notifikasi **pulih** sekali ketika kanal kembali sehat;
- **tidak** memberi alarm kalau `WA_PROVIDER=none` — kanal yang memang
  dimatikan bukan gangguan.

Notifikasi itu masuk lewat aplikasi + push (bukan WhatsApp, karena kanalnya
sedang bermasalah). Statusnya juga terlihat di **Admin → Konfigurasi → Status
WhatsApp**, lengkap dengan tombol *Periksa sekarang* supaya admin tidak perlu
menunggu jadwal berikutnya setelah memperbaiki sesi.

```bash
# periksa manual tanpa menunggu 5 menit
curl -X POST localhost:3001/api/wa/check -H "Authorization: Bearer <token-admin>"
```

### Yang bisa dibaca manual

- `GET /api/wa/status` — apakah kanal aktif, provider apa, sesi terhubung,
  berapa pesan menunggu di antrean, plus keadaan pemantau terakhir.
- `notifikasi.wa_sent_at` — kapan WhatsApp berhasil dikirim.
- `notifikasi.wa_error` — alasan kegagalan (mis. "Easy API 404", "nomor tidak
  valid"). Baris ini dipakai saat menelusuri keluhan orang tua.

Query audit cepat:

```sql
SELECT tipe, COUNT(*) total,
       SUM(wa_sent_at IS NOT NULL) terkirim_wa,
       SUM(wa_error IS NOT NULL) gagal_wa
FROM notifikasi
WHERE created_at > datetime('now', '-7 days')
GROUP BY tipe ORDER BY total DESC;
```

---

## 6. Nomor WhatsApp per cabang

Bawaannya satu nomor untuk semua cabang (dari `.env`). Kalau tiap cabang punya
nomornya sendiri, tambahkan di **Admin → Konfigurasi → Nomor WhatsApp per
cabang**. Setelah ada minimal satu akun, aplikasi otomatis beralih ke mode
per-cabang:

- pesan untuk orang tua cabang Godean keluar dari nomor Godean;
- pengumuman "semua cabang" dikirim dari nomor **masing-masing** cabang, bukan
  satu nomor pusat;
- cabang yang belum punya nomor memakai **nomor pusat** (akun dengan tujuan
  "Pusat (cadangan)"). Kalau cadangan tidak ada, pesan untuk cabang itu **tidak
  dikirim** dan tercatat sebagai `dilewati` — lebih baik diam daripada mengirim
  dari nomor yang tidak dikenal orang tua.

**Provider dipilih per akun**, bukan global: satu cabang boleh memakai open-wa
sementara cabang lain memakai gateway resmi. Kalau nanti satu nomor kena
blokir, pindah provider cukup mengubah satu baris — tidak ada kode yang
disentuh.

**Kredensial disimpan terenkripsi** (AES-256-GCM). Kuncinya berasal dari
`WA_SECRET_KEY`, atau diturunkan dari `JWT_SECRET` bila variabel itu kosong.
Kunci hidup di environment, jadi berkas backup database **tidak** memuat token
yang bisa dipakai langsung. Kalau `JWT_SECRET` diganti, kredensial harus diisi
ulang — kolom "Kredensial" di layar admin akan menandainya.

⚠️ **Biaya sumber daya open-wa berlipat.** Satu Easy API menjalankan Chromium
dan memakai 400–900 MB RAM. Lima cabang = lima proses. Di VPS 2 GB ini tidak
muat; pakai gateway untuk sebagian/semua cabang, atau sediakan ≥4 GB.

Setiap nomor diperiksa terpisah oleh pemantau (bagian 5): satu cabang bisa
putus sementara cabang lain sehat, dan alarmnya menyebut cabang mana.

### Multi-sesi: satu proses open-wa, banyak nomor

Sebagian build open-wa (yang punya dashboard **Sessions** dengan tombol "New
Session") menangangi **beberapa nomor dalam satu proses**: tiap nomor adalah
satu sesi dengan Session ID sendiri. Ini lebih sederhana daripada menjalankan
satu Easy API per cabang — satu proses, satu port, satu API key, N sesi.

Cara memakainya di SIAGA: isi kolom **Session ID** pada akun open-wa
(Admin → Konfigurasi → Nomor WhatsApp per cabang). URL dan API key boleh sama
untuk beberapa akun; yang membedakan adalah Session ID-nya. Pesan cabang A
otomatis keluar lewat sesi A, cabang B lewat sesi B.

Dialek dipilih **per baris akun**, bukan per server:

| Session ID | Endpoint yang dipakai |
| --- | --- |
| kosong | `POST {url}/api/messages/sendText` — Easy API satu nomor |
| terisi | `POST {url}/api/sessions/{sessionId}/messages/send-text` |

Status sesi dibaca dari `GET {url}/api/sessions/{sessionId}`: `connected` →
siap, `qr_ready`/`disconnected` → terputus (alarm), layanan tak terjangkau →
terputus. Alarm multi-sesi mengarahkan perbaikan ke dashboard OpenWA
(hubungkan ulang sesi atau minta kode pairing), bukan ke Easy API satu nomor.

Alur setup satu cabang:

1. Di dashboard OpenWA, buat sesi baru (mis. "godean") — catat Session ID-nya.
2. Hubungkan nomor: pindai QR di dashboard, **atau** minta kode pairing
   (`POST /api/sessions/{id}/pairing-code` dengan nomor cabang) lalu masukkan
   kode itu di HP cabang (Perangkat Tertaut → Tautkan dengan nomor telepon).
   Jalur kedua tidak perlu menyambar screenshot QR.
3. Di SIAGA, tambah akun open-wa untuk cabang itu dengan URL & API key
   instance tersebut, lalu isi Session ID dari langkah 1.
4. Tekan tombol uji (ikon ↻) di baris akun: status harus menjadi "Siap".

Catatan yang tetap berlaku: folder sesi open-wa berisi kredensial WhatsApp
(backup seperti database, jangan di-commit), dan **setiap sesi tetap memuat
engine sendiri** — RAM per sesi masih timbul walau prosesnya satu.

### Hubungkan nomor mandiri (tanpa dashboard OpenWA)

Admin cabang bisa menghubungkan nomor cabangnya **sendiri lewat SIAGA** —
tidak perlu mengakses dashboard OpenWA di server, tidak perlu tahu URL atau
API key-nya. Kredensial instance hidup di `.env` server (`WA_API_URL`,
`WA_API_KEY`); semua permintaan ke OpenWA dilakukan server atas nama pengguna
yang sudah login.

Alur di **Konfigurasi → Nomor WhatsApp per cabang → "Hubungkan nomor
mandiri"**:

1. Pilih cabang (admin cabang terkunci ke cabangnya sendiri) dan nama sesi —
   atau pakai sesi yang sudah ada di instance.
2. SIAGA membuat sesi, menyalakannya, lalu menampilkan **QR** (segar otomatis
   tiap 5 detik). Alternatifnya: minta **kode pairing** dengan nomor HP
   cabang (maks 1x per menit per sesi — permintaan beruntun memicu blokir).
3. Di HP cabang: WhatsApp → Perangkat Tertaut → Tautkan Perangkat (pindai QR)
   **atau** Tautkan dengan nomor telepon (masukkan kode pairing).
4. Setelah sesi `ready`, SIAGA menampilkan nama/phone pemilik dan menyimpan
   sesi itu sebagai akun pengirim cabang — URL & API key diambil dari `.env`
   lalu disimpan terenkripsi seperti akun lain.

Hak akses: `admin` (pusat) mengelola semua cabang + akun pusat (cadangan);
`admin_cabang` hanya sesi dan nomor untuk cabangnya sendiri. Menghapus sesi
dari instance hanya untuk admin pusat. Semua tindakan (sesi dibuat, kode
pairing diminta, nomor disimpan, sesi dihapus) tercatat di audit log. QR
adalah kredensial hidup — tidak pernah ditulis ke log dan hanya tampil untuk
pemegang sesi admin yang berhak.

Endpoint yang dipakai server ke OpenWA (untuk diagnosa):
`POST /api/sessions`, `POST /api/sessions/{id}/start`,
`GET /api/sessions/{id}/qr`, `POST /api/sessions/{id}/pairing-code`,
`GET /api/sessions/{id}`.

---

## 7. Deploy di server sendiri (bukan komputer pengembangan)

**Repo ini tidak punya dependensi ke open-wa.** Tidak ada paket `@open-wa` di
`package.json`, tidak ada Chromium yang diunduh saat `npm install`, dan tidak
ada kode yang mencoba mengaktifkannya sendiri. Yang ada hanya klien HTTP di
`backend/utils/wa.js` yang memanggil Easy API kalau `WA_PROVIDER=openwa`.

Artinya: komputer pengembangan yang terlanjur memasang open-wa **tidak
menentukan apa pun** untuk server. Semuanya ditentukan oleh `.env` di server:

| Lingkungan | `.env` server/komputer | Akibat |
| --- | --- | --- |
| Server produksi | `WA_PROVIDER=gateway` + token resmi | Pesan lewat reseller, tanpa risiko blokir, tanpa Chromium |
| Server pilot | `WA_PROVIDER=openwa` + `WA_API_URL` | Easy API dijalankan sebagai service di server yang sama |
| Pengembangan lokal | `WA_PROVIDER=log` / `none` | Tidak mengirim apa pun; aman untuk tes |

Karena `.env` tidak masuk git, setiap lingkungan memilih sendiri. Tidak ada
kode versi-produksi yang "kebawa" pengaturan laptop pengembang.

### 6a. Topologi di server

```
         HP orang tua  <------ WhatsApp ------  HP nomor sekolah
                                                 ^  (Linked Devices)
                                                 |
                            [server sekolah]     |
                            +----------------+   |
   nginx :443 -------------> SIAGA Backend :3001|
                            +----------------+   |
                                    |            |
                                    | HTTP       |
                                    v            |
                            Easy API open-wa :8080 (127.0.0.1)
                              - proses terpisah (systemd: siaga-wa.service)
                              - Chromium + berkas sesi *.data.json
                              - HANYA di localhost, tidak diekspos nginx
```

Dua keputusan penting di topologi ini:

1. **Port 8080 tidak pernah dibuka ke internet.** Easy API berjalan di
   `127.0.0.1:8080` dan nginx **tidak** mem-proxy-nya. Satu-satuntu jalan
   keluar adalah proses backend yang sudah terautentikasi dengan API key.
   Kalau Easy API dibuka publik, siapa pun yang menemukan port itu bisa
   mengirim WhatsApp atas nama sekolah.
2. **Sesi ada di direktori persisten** (`/var/lib/siaga/wa`), bukan `/tmp`,
   supaya tidak perlu pindai QR setiap kali server reboot.

### 6b. Langkah instalasi di server (Ubuntu/Debian dengan systemd)

```bash
# 1. Direktori sesi (hanya user siaga yang boleh membaca)
sudo mkdir -p /var/lib/siaga/wa
sudo chown siaga:siaga /var/lib/siaga/wa
sudo chmod 700 /var/lib/siaga/wa

# 2. Pasang Easy API secara GLOBAL (bukan npx): service tidak boleh bergantung
#    pada registry npm setiap kali start.
sudo npm install -g @open-wa/wa-automate@5.6.6
sudo readlink -f "$(command -v wa-automate)"   # catat path binari-nya

# 3. Konfigurasi WA di berkas environment yang SUDAH dipakai backend:
#    /etc/siaga/siaga.env  (tambahkan/edit)
#      WA_PROVIDER=openwa
#      WA_API_URL=http://127.0.0.1:8080
#      WA_API_KEY=<kunci-acak-panjang>

# 4. Pasang unit service yang sudah disiapkan di repo.
#    Kalau path binari wa-automate di server Anda bukan /usr/local/bin,
#    sesuaikan ExecStart.
sudo cp deploy/systemd/siaga-wa.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now siaga-wa

# 5. Cek log sampai muncul QR / status ready
sudo journalctl -u siaga-wa -f
```

### 6c. Memindai QR tanpa membuka port ke internet

Dashboard Easy API hanya di `127.0.0.1:8080`. Dari komputer Anda:

```bash
ssh -L 8080:127.0.0.1:8080 user@server-sekolah
```

Lalu buka `http://127.0.0.1:8080/dashboard/` di browser lokal dan pindai QR
dengan HP nomor sekolah. Tunnel SSH yang jadi jalan akses, bukan port publik.

### 6d. Menyalakan-kanal di backend

Setelah Easy API `ready`:

```bash
# restart backend supaya membaca WA_PROVIDER terbaru
sudo systemctl restart siaga

# verifikasi (dari server, dengan token admin)
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3001/api/wa/status
```

Harus menampilkan `aktif: true`, `provider: "openwa"`, `connected: true`,
`ready: true`.

### 6e. Catatan operasional khusus server

- **RAM.** Chromium di dalam Easy API bisa memakai 500 MB–1,5 GB. Unit service
  sudah membatasi `MemoryMax=1500M` agar tidak menghabiskan RAM server dan
  membunuh backend. Sesuaikan angka itu dengan RAM server.
- **Update versi.** Versi open-wa dipatok di unit service (`@5.6.6`). Naikkan
  sengaja, lalu cek `journalctl -u siaga-wa` — perubahan protokol WhatsApp Web
  kadang membuat versi lama berhenti bekerja.
- **Sesi rusak.** Kalau `journalctl` menunjukkan sesi tidak bisa dipulihkan,
  hapus berkas sesi di `/var/lib/siaga/wa` dan pindai QR baru.
- **Firewall.** Pastikan 8080 hanya terbuka untuk `127.0.0.1`
  (`ss -tlnp | grep 8080`). Kalau terlihat `0.0.0.0:8080`, HATI-HATI: Easy API
  bisa diakses dari luar; perbaiki binding atau firewall segera.
- **Backup.** Jangan mem-backup direktori sesi bersama backup database biasa.
  Berkas itu kredensial; kalau ikut ter-backup, ikut pula risikonya.

---

## 8. Pemulihan password lewat OTP WhatsApp

Wali tidak punya email di sistem ini — satu-satunya identitas yang benar-benar
dimiliki orang tua adalah nomor WhatsApp yang terdaftar. Jadi "lupa password"
diselesaikan lewat kode OTP di kanal ini.

**Alur di aplikasi:** halaman login → *Lupa password?* → masukkan nomor
(wali) atau username (staff) → kode 6 angka masuk lewat WhatsApp → masukkan
kode + password baru. Untuk staff, kode dikirim ke
`staff_profile.no_wa_kontak`.

**Syarat:** kanal WA harus aktif (`WA_PROVIDER` bukan `none`). Kalau belum,
tombolnya menjawab jujur dengan pesan "belum diaktifkan — hubungi admin
sekolah", bukan pura-pura mengirim kode yang tak akan pernah datang.

**Batas yang dipasang (semua disengaja):**

| Aturan | Nilai | Alasan |
|---|---|---|
| Panjang kode | 6 angka | mudah diketik di HP |
| Masa berlaku | 5 menit | cukup untuk berpindah aplikasi, terlalu pendek untuk ditebak |
| Percobaan per kode | 5 | kode mati setelah itu, harus minta baru |
| Permintaan per nomor | 3 / 15 menit | mencegah spam ke satu orang tua |
| Permintaan per IP | 30 / jam | mencegah penyalahgunaan massal |

**Yang dijaga di sisi keamanan:**

- Kode disimpan **bcrypt**, bukan plaintext. Kalau database bocor, kode yang
  masih berlaku tidak bisa dipakai mengambil alih akun.
- Balasan permintaan **selalu sama** ("jika terdaftar, kode sudah dikirim").
  Tanpa ini, formulir lupa password menjadi alat memeriksa nomor mana yang
  terdaftar di sekolah.
- Reset memutus **semua sesi lama** (`auth_version` naik) dan mengirim pesan
  konfirmasi ke nomor tersebut — kalau bukan pemiliknya yang melakukan, itu
  satu-satunya tanda yang akan terlihat.
- Akun berstatus **nonaktif** tidak dikirimi kode dan tidak bisa dihidupkan
  lewat pemulihan mandiri.

⚠️ **Dampak ke risiko open-wa:** OTP menambah volume pesan keluar secara
signifikan, dan pengiriman ke nomor yang belum pernah menghubungi sekolah
adalah pola yang paling dicurigai WhatsApp. Kalau pemulihan password dipakai
rutin, ini alasan tambahan untuk pindah ke gateway resmi (bagian 9).

📌 **`TRUST_PROXY=true` wajib di produksi.** Tanpa itu backend melihat semua
permintaan berasal dari `127.0.0.1` (IP reverse proxy), sehingga pembatasan
per-IP otomatis dimatikan — kalau tidak dimatikan, satu kuota 30/jam akan
menjadi jatah seluruh sekolah.

**Menguji tanpa WhatsApp sungguhan:**

```bash
# kode ditulis ke berkas, bukan dikirim; khusus pengujian
WA_PROVIDER=log OTP_DEBUG_FILE=/tmp/otp.txt npm run dev
```

`OTP_DEBUG_FILE` tidak pernah diset di server produksi. Tes otomatisnya ada di
`scripts/reset-password.test.js`.

---

## 9. Pindah ke gateway resmi

Karena pemanggil hanya bergantung pada `utils/wa.js`, pindah provider cukup
mengubah `.env`:

```diff
-WA_PROVIDER=openwa
-WA_API_URL=http://127.0.0.1:8080
-WA_API_KEY=...
+WA_PROVIDER=gateway
+WA_GATEWAY_URL=https://api.fonnte.com/send
+WA_GATEWAY_TOKEN=...
```

Tidak ada perubahan kode pemanggil. Provider gateway memakai bentuk body
generik `{ target, message }` dengan header `Authorization: Bearer <token>`;
sesuaikan mapping di `backend/utils/wa.js` bila reseller memakai bentuk lain
(mis. `{ phone, text }` atau `{ number, message }`).

---

## 10. Menguji tanpa mengirim pesan

```bash
# tidak mengirim apa pun; alur normal & pelacakan wa_sent_at tetap teruji
WA_PROVIDER=log npm test
```

Tes otomatis ada di `scripts/wa.test.js` (normalisasi nomor, format pesan,
gate tipe, isolasi kegagalan, kontrak HTTP Easy API via stub server).

---

## 11. Yang TIDAK dilakukan kanal ini (sengaja)

- **Tidak ada auto-reply / chatbot.** Kalau orang tua membalas pesan, balasan
  masuk ke WhatsApp nomor sekolah, bukan ke aplikasi (open-wa Easy API bisa
  dipakai untuk itu, tapi menambah permukaan risiko dan kode yang perlu
  dirawat).
- **Tidak ada broadcast massal.** Semua pesan terpicu oleh peristiwa
  (tagihan terbit, pembayaran terverifikasi, catatan diterbitkan). Pengumiman
  massal sebaiknya lewat jalur resmi biar bisa dilacak dan tidak memicu blokir.
- **Tidak ada pesan ke nomor selain wali terdaftar.**
