// TOTP (RFC 6238) untuk verifikasi dua faktor akun staff.
//
// Kenapa TOTP dan bukan kode lewat WhatsApp: sekolah menghadapkan SIAGA ke
// internet, dan password admin memegang SEMUA data. TOTP memakai aplikasi
// authenticator (Google Authenticator, Authy, 1Password, atau aplikasi bank)
// yang bekerja offline — tidak bergantung pada WhatsApp sedang hidup, dan
// tidak bisa dibaca orang yang melihat layar ponsel korban.
//
// Kenapa kode tidak pernah disimpan: TOTP deterministik dari waktu + secret.
// Server hanya perlu secret; kode dihitung ulang setiap kali verifikasi.
//
// Kenapa ada "langkah terakhir dipakai" (replay protection): kode TOTP berlaku
// 30 detik. Tanpa pencatatan langkah, kode yang sama bisa dipakai ulang oleh
// siapa pun yang sempat melihatnya (shoulder-surfing) sampai waktu habis.
//
// Secret disimpan TERENKRIPSI (utils/rahasia.js): backup database diunggah ke
// cloud, dan secret TOTP plaintext di backup = gerbang kedua yang bocor.
const crypto = require('crypto');
const { enkripsi, dekripsi } = require('./rahasia');

const LABEL_KUNCI = 'siaga-totp';
const LANGKAH_DETIK = 30;
const DIGIT = 6;
const JENDELA = 1; // terima ±1 langkah: jam ponsel boleh meleset ~30 detik
const ABJAD_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; // RFC 4648

// ---------------------------------------------------------------------------
// base32 (tanpa dependensi luar)
// ---------------------------------------------------------------------------

function base32(buf) {
  let bit = 0;
  let nilai = 0;
  let out = '';
  for (const b of buf) {
    nilai = (nilai << 8) | b;
    bit += 8;
    while (bit >= 5) {
      out += ABJAD_BASE32[(nilai >>> (bit - 5)) & 31];
      bit -= 5;
    }
  }
  if (bit > 0) out += ABJAD_BASE32[(nilai << (5 - bit)) & 31];
  return out;
}

function base32Decode(teks) {
  const bersih = String(teks || '')
    .toUpperCase()
    .replace(/[^A-Z2-7]/g, ''); // aplikasi authenticator kadang menambah spasi
  const bytes = [];
  let bit = 0;
  let nilai = 0;
  for (const ch of bersih) {
    const idx = ABJAD_BASE32.indexOf(ch);
    if (idx < 0) throw new Error('secret tidak valid');
    nilai = (nilai << 5) | idx;
    bit += 5;
    if (bit >= 8) {
      bytes.push((nilai >>> (bit - 8)) & 0xff);
      bit -= 8;
    }
  }
  return Buffer.from(bytes);
}

// ---------------------------------------------------------------------------
// Secret
// ---------------------------------------------------------------------------

// 20 byte acak = 160 bit, ukuran standar RFC 4226. 160 bit tidak bisa ditebak
// walau penyerang tahu kode yang sedang berlaku (kode hanya 6 digit dan berganti
// tiap 30 detik).
function buatSecret() {
  return base32(crypto.randomBytes(20));
}

function enkripsiSecret(secret) {
  return enkripsi(secret, LABEL_KUNCI);
}

function dekripsiSecret(simpanan) {
  return dekripsi(simpanan, LABEL_KUNCI);
}

// ---------------------------------------------------------------------------
// Kode
// ---------------------------------------------------------------------------

function hitungKode(secret, counter) {
  const k = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', k).update(buf).digest();
  // Dynamic truncation (RFC 4226 bagian 5.3).
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 10 ** DIGIT).padStart(DIGIT, '0');
}

function langkahSekarang(waktu = Date.now()) {
  return Math.floor(waktu / 1000 / LANGKAH_DETIK);
}

// Verifikasi satu kode.
//   lastStep: langkah terakhir yang sudah diterima (dari DB) untuk replay check.
// Mengembalikan { ok, step } | { ok:false, alasan }.
//
// Kode dari langkah terbaru didahulukan: kalau kode cocok dengan beberapa
// langkah di jendela (sangat jarang), yang dipakai adalah yang terbaru dan
// belum pernah dipakai.
function verifikasiKode(secret, kode, lastStep, { sekarang = Date.now(), jendela = JENDELA } = {}) {
  const teks = String(kode || '');
  if (!/^\d{6}$/.test(teks)) return { ok: false, alasan: 'format' };
  const c = langkahSekarang(sekarang);
  const kandidat = [];
  for (const step of [c + jendela, c, c - jendela]) {
    if (step <= 0) continue;
    const expect = hitungKode(secret, step);
    // timingSafeEqual: jangan bocorkan kecocokan lewat waktu eksekusi.
    const sama =
      expect.length === teks.length && crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(teks, 'utf8'));
    if (sama) kandidat.push(step);
  }
  if (!kandidat.length) return { ok: false, alasan: 'salah' };
  const boleh = kandidat.find((s) => !lastStep || s > lastStep);
  if (!boleh) return { ok: false, alasan: 'kode-sudah-dipakai' };
  return { ok: true, step: boleh };
}

// Sisa detik sebelum kode berganti — dipakai UI login untuk memberi jeda.
function sisaDetikKode(sekarang = Date.now()) {
  const detik = Math.floor(sekarang / 1000);
  return LANGKAH_DETIK - (detik % LANGKAH_DETIK);
}

// ---------------------------------------------------------------------------
// URI untuk aplikasi authenticator (otpauth:// — standar de facto, dipahami
// Google/Microsoft Authenticator, Authy, 1Password, Aegis, dll.)
// ---------------------------------------------------------------------------

function otpauthUri({ secret, akun, issuer = 'SIAGA Taruna Prima' }) {
  const label = encodeURIComponent(`${issuer}:${akun}`);
  const q = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGIT),
    period: String(LANGKAH_DETIK)
  });
  return `otpauth://totp/${label}?${q.toString()}`;
}

// ---------------------------------------------------------------------------
// Kode pemulihan (recovery codes)
// ---------------------------------------------------------------------------
// Dipakai kalau ponsel dengan aplikasi authenticator hilang. Sengaja:
// - 8 kode, sekali pakai (dihapus dari daftar setelah dipakai)
// - 10 karakter dari abjad tanpa huruf mirip (I/O/0/1 dibuang) supaya aman
//   dibaca dan diketik ulang
// - disimpan sebagai hash SHA-256: kode sudah acak 50 bit, bcrypt tidak
//   menambah arti di sini — yang penting hash satu arah

const ABJAD_PEMULIHAN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PANJANG_PEMULIHAN = 10;
const JUMLAH_PEMULIHAN = 8;

function buatKodePemulihan(jumlah = JUMLAH_PEMULIHAN) {
  return Array.from({ length: jumlah }, () =>
    Array.from({ length: PANJANG_PEMULIHAN }, () => ABJAD_PEMULIHAN[crypto.randomInt(ABJAD_PEMULIHAN.length)]).join('')
  );
}

function normalkanKode(kode) {
  return String(kode || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function hashKodePemulihan(kode) {
  return crypto.createHash('sha256').update(normalkanKode(kode)).digest('hex');
}

// Daftar hash (JSON dari DB) -> daftar string.
function bacaHashPemulihan(simpanan) {
  if (!simpanan) return [];
  try {
    const arr = JSON.parse(simpanan);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

// Cari kode di daftar hash. Mengembalikan index atau -1.
// Sengaja TIDAL menghapus di sini: pemanggil yang tahu cara menyimpan
// (route, dengan UPDATE) supaya fungsi ini tetap murni dan mudah diuji.
function cariKodePemulihan(simpanan, kode) {
  const hash = hashKodePemulihan(kode);
  return bacaHashPemulihan(simpanan).indexOf(hash);
}

module.exports = {
  LANGKAH_DETIK,
  DIGIT,
  buatSecret,
  enkripsiSecret,
  dekripsiSecret,
  hitungKode,
  langkahSekarang,
  verifikasiKode,
  sisaDetikKode,
  otpauthUri,
  buatKodePemulihan,
  hashKodePemulihan,
  bacaHashPemulihan,
  cariKodePemulihan,
  normalkanKode,
  JUMLAH_PEMULIHAN
};
