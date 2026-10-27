// Penyimpanan rahasia terenkripsi (AES-256-GCM) untuk kredensial di DB.
//
// Dipakai bersama oleh wa-akun (API key/token gateway) dan totp (secret TOTP).
// Kenapa ada berkas sendiri: cadangan database kini ikut diunggah ke cloud
// (scripts/backup.js). Rahasia plaintext di DB berarti satu berkas backup yang
// bocor = semua kredensial bocor. Kunci hidup di environment
// (SECRET_ENCRYPTION_KEY/WA_SECRET_KEY, atau JWT_SECRET sebagai legacy) dan
// TIDAK ikut ke backup.
//
// Setiap pemakai memakai LABEL berbeda saat menurunkan kunci: kunci yang sama
// untuk dua tujuan berbeda adalah kesalahan kriptografi klasik.
//
// Sumber kunci, urut prioritas:
//   1. SECRET_ENCRYPTION_KEY (disarankan) atau WA_SECRET_KEY (nama lama).
//   2. JWT_SECRET, hanya sebagai kunci legacy: tulisan baru memakainya bila
//      kunci khusus belum diset, dan bacaan lama tetap dicoba dengan kunci ini
//      sesudah kunci khusus. Tanpa itu, menyetel kunci khusus akan membuat
//      semua secret lama tidak terbaca.
// Di production, enkripsi TANPA kunci apa pun adalah error, bukan teks polos:
// menyimpan kredensial sebagai 'plain:' secara diam-diam lebih berbahaya
// daripada gagal keras saat menyimpan.
const crypto = require('crypto');

function kunciDari(label, bahan) {
  if (!bahan) return null;
  return crypto.createHash('sha256').update(`${label}:${bahan}`).digest();
}

function bahanUtama() {
  return process.env.SECRET_ENCRYPTION_KEY || process.env.WA_SECRET_KEY || null;
}

function kunciEnkripsi(label) {
  return kunciDari(label, bahanUtama() || process.env.JWT_SECRET);
}

// Dekripsi mencoba setiap sumber kunci satu per satu (bukan hanya kunci
// utama + JWT): data yang dulu terenkripsi dari WA_SECRET_KEY harus tetap
// terbaca sesudah SECRET_ENCRYPTION_KEY diset, dan sebaliknya.
function kunciDekripsi(label) {
  const bahan = [process.env.SECRET_ENCRYPTION_KEY, process.env.WA_SECRET_KEY, process.env.JWT_SECRET]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i);
  return bahan.map((b) => kunciDari(label, b)).filter(Boolean);
}

// Simpanan: 'enc:v1:<iv>:<tag>:<ciphertext>' (semua hex). Format lama
// 'plain:<teks>' (dev tanpa kunci) dan teks polos tanpa awalan tetap terbaca
// saat dekripsi supaya data lama tidak hilang.
function enkripsi(teks, label) {
  if (!teks) return null;
  const k = kunciEnkripsi(label);
  if (!k) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'SECRET_ENCRYPTION_KEY/WA_SECRET_KEY atau JWT_SECRET wajib diset untuk menyimpan rahasia terenkripsi'
      );
    }
    return `plain:${teks}`;
  }
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const isi = Buffer.concat([c.update(String(teks), 'utf8'), c.final()]);
  return `enc:v1:${iv.toString('hex')}:${c.getAuthTag().toString('hex')}:${isi.toString('hex')}`;
}

// Kunci utama berubah tanpa kunci legacy -> null; pemakai harus mengisi ulang.
function dekripsi(simpanan, label) {
  if (!simpanan) return null;
  const teks = String(simpanan);
  if (teks.startsWith('plain:')) return teks.slice(6);
  if (!teks.startsWith('enc:v1:')) return teks; // data lama, belum terenkripsi
  const bagian = teks.split(':');
  if (bagian.length !== 5) return null;
  for (const k of kunciDekripsi(label)) {
    try {
      const d = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(bagian[2], 'hex'));
      d.setAuthTag(Buffer.from(bagian[3], 'hex'));
      return Buffer.concat([d.update(Buffer.from(bagian[4], 'hex')), d.final()]).toString('utf8');
    } catch {
      // Coba kunci berikutnya (legacy).
    }
  }
  return null;
}

module.exports = { enkripsi, dekripsi };
