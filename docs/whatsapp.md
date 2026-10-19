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

- `GET /api/wa/status` — apakah kanal aktif, provider apa, sesi terhubung,
  berapa pesan menunggu di antrean.
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

## 6. Pindah ke gateway resmi

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

## 7. Menguji tanpa mengirim pesan

```bash
# tidak mengirim apa pun; alur normal & pelacakan wa_sent_at tetap teruji
WA_PROVIDER=log npm test
```

Tes otomatis ada di `scripts/wa.test.js` (normalisasi nomor, format pesan,
gate tipe, isolasi kegagalan, kontrak HTTP Easy API via stub server).

---

## 8. Yang TIDAK dilakukan kanal ini (sengaja)

- **Tidak ada auto-reply / chatbot.** Kalau orang tua membalas pesan, balasan
  masuk ke WhatsApp nomor sekolah, bukan ke aplikasi (open-wa Easy API bisa
  dipakai untuk itu, tapi menambah permukaan risiko dan kode yang perlu
  dirawat).
- **Tidak ada broadcast massal.** Semua pesan terpicu oleh peristiwa
  (tagihan terbit, pembayaran terverifikasi, catatan diterbitkan). Pengumiman
  massal sebaiknya lewat jalur resmi biar bisa dilacak dan tidak memicu blokir.
- **Tidak ada pesan ke nomor selain wali terdaftar.**
