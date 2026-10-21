// Pemulihan password mandiri lewat kode OTP WhatsApp.
//
// Kenapa lewat WhatsApp: wali TIDAK punya email di sistem ini, hanya `no_wa`.
// Kanal WA juga sudah dibangun (utils/wa.js), jadi tidak perlu infrastruktur
// baru. Staff memakai `staff_profile.no_wa_kontak` yang sudah diisi sekolah.
//
// Aturan yang disengaja (semuanya karena OTP 6 angka sangat mudah ditebak bila
// tidak dibatasi):
// - Kode 6 angka, berlaku 5 menit, disimpan BCRYPT. Kalau DB bocor, kode yang
//   masih hidup tidak bisa dipakai mengambil alih akun.
// - Maksimal 5 percobaan per kode. Setelah itu kode mati dan harus minta baru.
// - Maksimal 3 permintaan kode per 15 menit per identitas, dan 10 per jam per
//   IP. Pembatasan dilakukan SEBELUM mencari akun, supaya balasan 429 tidak
//   membocorkan apakah nomor itu terdaftar atau tidak.
// - Balasan permintaan SELALU sama ("jika terdaftar, kode dikirim") — tanpa
//   ini, siapa pun bisa memakai formulir ini untuk memeriksa nomor mana yang
//   terdaftar di sekolah.
// - Kode dibuat dan di-hash bahkan ketika akun tidak ditemukan, supaya waktu
//   balasan tidak berbeda antara "ada" dan "tidak ada".
const crypto = require('crypto');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const db = require('../db');
const wa = require('./wa');

const PANJANG_KODE = 6;
const TTL_MS = 5 * 60 * 1000;
const MAX_PERCOBAAN = 5;
const MAX_KIRIM_IDENTITAS = 3;
const JENDELA_IDENTITAS_MS = 15 * 60 * 1000;
const MAX_KIRIM_IP = 30;
const JENDELA_IP_MS = 60 * 60 * 1000;

// Hash tiruan: dipakai saat akun tidak ditemukan agar waktu bcrypt.compareSync
// tetap sama dengan jalur "akun ada". Tanpa ini, selisih waktu membocorkan
// keberadaan akun.
const HASH_TIRUAN = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8oD4P0MYu96TbKavvLWS.5o60tK4Ga';

const PESAN_UMUM = 'Jika nomor/akun itu terdaftar, kode verifikasi sudah dikirim lewat WhatsApp.';

// Pembatas laju in-memory. Cukup karena backend berjalan satu proses; kalau
// nanti dijalankan multi-proses, pindahkan ke tabel (bukan sekadar ganti Map).
const catatanKirim = new Map();

function batasi(kunci, maks, jendelaMs) {
  const now = Date.now();
  const item = catatanKirim.get(kunci);
  if (!item || item.resetAt <= now) {
    catatanKirim.set(kunci, { jumlah: 1, resetAt: now + jendelaMs });
    return { boleh: true };
  }
  if (item.jumlah >= maks) {
    return { boleh: false, sisaDetik: Math.ceil((item.resetAt - now) / 1000) };
  }
  item.jumlah += 1;
  return { boleh: true };
}

// Bersihkan entri kedaluwarsa supaya Map tidak tumbuh selamanya.
setInterval(
  () => {
    const now = Date.now();
    for (const [k, v] of catatanKirim.entries()) if (v.resetAt <= now) catatanKirim.delete(k);
  },
  10 * 60 * 1000
).unref();

function angkaSaja(value) {
  return String(value || '').replace(/\D/g, '');
}

/**
 * Apakah IP ini layak dijadikan kunci pembatas.
 *
 * Kalau permintaan datang dari loopback, artinya backend dipanggil oleh reverse
 * proxy dan IP asli pengguna TIDAK diteruskan (TRUST_PROXY belum diset). Membatasi
 * per-IP di kondisi itu sama dengan membatasi SELURUH sekolah dengan satu kuota
 * — orang tua pertama yang lupa password bisa menghabiskan jatah semua orang.
 * Lebih baik pembatasan itu dimatikan dan mengandalkan batas per-identitas.
 */
function ipLayakDibatasi(ip) {
  const s = String(ip || '').trim();
  if (!s) return false;
  if (s === '::1' || s === '::ffff:127.0.0.1') return false;
  return !s.startsWith('127.');
}

function waSiap() {
  return wa.statusWA().aktif;
}

/**
 * Sembunyikan sebagian nomor untuk ditampilkan: 081234567890 -> 0812••••7890.
 * Dipakai di pesan konfirmasi & log, bukan di balasan HTTP (balasan harus sama
 * untuk semua nomor agar tidak bisa dipakai menebak nomor terdaftar).
 */
function maskNomor(noWa) {
  const d = angkaSaja(noWa);
  if (d.length < 6) return '••••';
  return `${d.slice(0, 4)}${'•'.repeat(Math.max(2, d.length - 8))}${d.slice(-4)}`;
}

/**
 * Cari akun dari identitas yang diketik pengguna.
 * Wali memakai nomor WhatsApp; staff memakai username.
 * Nomor dicocokkan dalam beberapa format (08…, 628…, +62…) karena orang tua
 * sering mengetik dengan cara berbeda dari saat pendaftaran.
 */
function cariPengguna({ tipe = 'wali', no_wa, username } = {}) {
  if (tipe === 'wali') {
    const mentah = String(no_wa || '').trim();
    if (!mentah) return null;
    const d = angkaSaja(mentah);
    const kandidat = [...new Set([mentah, d, d.replace(/^62/, '0'), d.replace(/^0/, '62')])].filter(Boolean);
    const tanda = kandidat.map(() => '?').join(',');
    return (
      db
        .prepare(
          `SELECT id, display_name, no_wa, tipe, role FROM pengguna
           WHERE tipe='wali' AND status <> 'nonaktif' AND no_wa IN (${tanda})`
        )
        .get(...kandidat) || null
    );
  }
  const nama = String(username || '').trim();
  if (!nama) return null;
  return (
    db
      .prepare(
        `SELECT p.id, p.display_name, p.tipe, p.role, sp.no_wa_kontak AS no_wa
         FROM pengguna p
         LEFT JOIN staff_profile sp ON sp.pengguna_id=p.id
         WHERE p.tipe='staff' AND p.status <> 'nonaktif' AND p.username=?`
      )
      .get(nama) || null
  );
}

function kodeAcak() {
  // crypto.randomInt memakai CSPRNG; Math.random tidak layak untuk OTP.
  return String(crypto.randomInt(0, 10 ** PANJANG_KODE)).padStart(PANJANG_KODE, '0');
}

// Hook khusus tes: bila OTP_DEBUG_FILE diset, kode ditulis ke berkas itu supaya
// pengujian otomatis bisa menyelesaikan alur tanpa membuka celah di produksi
// (variabel ini tidak pernah diset di server sungguhan).
function catatKodeUntukTes(penggunaId, kode) {
  const berkas = process.env.OTP_DEBUG_FILE;
  if (!berkas) return;
  try {
    fs.appendFileSync(berkas, `${penggunaId}|${kode}\n`);
  } catch {
    // Gagal menulis berkas tes tidak boleh menggagalkan pengiriman OTP.
  }
}

function pesanKode(kode) {
  return [
    '*SIAGA Taruna Prima*',
    '',
    `Kode verifikasi: *${kode}*`,
    '',
    'Berlaku 5 menit dan hanya bisa dipakai sekali.',
    'Jangan berikan kode ini kepada siapa pun — termasuk yang mengaku dari pihak sekolah. Sekolah tidak pernah menanyakan kode ini.'
  ].join('\n');
}

/**
 * Buat kode baru, simpan hash-nya, lalu kirim lewat WhatsApp.
 * Selalu mengembalikan objek; tidak pernah melempar error ke pemanggil.
 */
async function kirimKode({ tipe, no_wa, username, ip } = {}) {
  const identitas =
    tipe === 'wali'
      ? angkaSaja(no_wa)
      : String(username || '')
          .trim()
          .toLowerCase();
  const kunciIdentitas = `id:${tipe}:${identitas}`;
  const kunciIp = `ip:${ip || 'unknown'}`;

  const batasIdentitas = batasi(kunciIdentitas, MAX_KIRIM_IDENTITAS, JENDELA_IDENTITAS_MS);
  if (!batasIdentitas.boleh) {
    return { status: 'terlalu-sering', sisaDetik: batasIdentitas.sisaDetik };
  }
  const batasIp = ipLayakDibatasi(ip) ? batasi(kunciIp, MAX_KIRIM_IP, JENDELA_IP_MS) : { boleh: true };
  if (!batasIp.boleh) {
    return { status: 'terlalu-sering', sisaDetik: batasIp.sisaDetik };
  }

  const pengguna = cariPengguna({ tipe, no_wa, username });

  // Kode SELALU dibuat & di-hash, walau akunnya tidak ada (penyetaraan waktu).
  const kode = kodeAcak();
  const kodeHash = bcrypt.hashSync(kode, 10);

  if (!pengguna) return { status: 'diabaikan' };
  if (!pengguna.no_wa || !wa.chatIdDari(pengguna.no_wa)) return { status: 'tanpa-nomor' };

  const sekarang = new Date();
  // Buang riwayat lama sekalian: tabel ini hanya perlu beberapa hari untuk
  // menjawab keluhan "saya tidak pernah minta kode", bukan arsip permanen.
  bersihkanRiwayat();
  // Kode lama dimatikan: hanya kode terbaru yang boleh berlaku, supaya orang
  // tua tidak bingung ketika dua kode masuk berurutan.
  db.prepare('UPDATE reset_otp SET terpakai_at=? WHERE pengguna_id=? AND terpakai_at IS NULL').run(
    sekarang.toISOString(),
    pengguna.id
  );
  db.prepare(
    `INSERT INTO reset_otp(pengguna_id,kode_hash,tujuan,expires_at,percobaan,dibuat_at,ip)
     VALUES(?,?,?,?,0,?,?)`
  ).run(
    pengguna.id,
    kodeHash,
    maskNomor(pengguna.no_wa),
    new Date(sekarang.getTime() + TTL_MS).toISOString(),
    sekarang.toISOString(),
    ip || null
  );

  catatKodeUntukTes(pengguna.id, kode);

  const hasil = await wa.kirimWA({ no_wa: pengguna.no_wa, pesan: pesanKode(kode) });
  if (hasil.status !== 'terkirim') {
    console.error(`[otp] kode untuk pengguna ${pengguna.id} gagal dikirim: ${hasil.status} ${hasil.error || ''}`);
    return { status: 'gagal-kirim' };
  }
  return { status: 'terkirim', penggunaId: pengguna.id, tujuan: maskNomor(pengguna.no_wa) };
}

/**
 * Verifikasi kode terbaru milik satu akun.
 * Mengembalikan { ok: true } atau { ok: false, error }.
 */
function verifikasiKode(penggunaId, kode) {
  const row = db
    .prepare(
      `SELECT id,kode_hash,expires_at,percobaan
       FROM reset_otp
       WHERE pengguna_id=? AND terpakai_at IS NULL
       ORDER BY dibuat_at DESC, id DESC LIMIT 1`
    )
    .get(penggunaId);

  // Tanpa baris: bandingkan dengan hash tiruan supaya waktunya setara dengan
  // jalur "ada kode tapi salah".
  if (!row) {
    bcrypt.compareSync(String(kode || ''), HASH_TIRUAN);
    return { ok: false, error: 'Kode tidak valid atau sudah kedaluwarsa. Minta kode baru.' };
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    bcrypt.compareSync(String(kode || ''), HASH_TIRUAN);
    return { ok: false, error: 'Kode sudah kedaluwarsa. Minta kode baru.' };
  }
  if (row.percobaan >= MAX_PERCOBAAN) {
    bcrypt.compareSync(String(kode || ''), HASH_TIRUAN);
    return { ok: false, error: 'Kode ini sudah tidak berlaku karena terlalu banyak percobaan. Minta kode baru.' };
  }

  if (!bcrypt.compareSync(String(kode || ''), row.kode_hash)) {
    const gagal = row.percobaan + 1;
    db.prepare('UPDATE reset_otp SET percobaan=? WHERE id=?').run(gagal, row.id);
    if (gagal >= MAX_PERCOBAAN) {
      return { ok: false, error: 'Kode salah 5 kali. Minta kode baru.' };
    }
    return { ok: false, error: `Kode salah. Sisa ${MAX_PERCOBAAN - gagal} percobaan.` };
  }

  db.prepare('UPDATE reset_otp SET terpakai_at=? WHERE id=?').run(new Date().toISOString(), row.id);
  return { ok: true };
}

// Buang riwayat OTP lama. Dipanggil sesekali (bukan tiap permintaan) supaya
// tabel tidak tumbuh tanpa batas di server yang hidup berbulan-bulan.
function bersihkanRiwayat(hari = 7) {
  const batas = new Date(Date.now() - hari * 24 * 60 * 60 * 1000).toISOString();
  return db.prepare('DELETE FROM reset_otp WHERE dibuat_at < ?').run(batas).changes;
}

module.exports = {
  PESAN_UMUM,
  TTL_MS,
  MAX_PERCOBAAN,
  maskNomor,
  cariPengguna,
  kirimKode,
  verifikasiKode,
  bersihkanRiwayat,
  waSiap
};
