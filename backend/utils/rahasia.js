// Penyimpanan rahasia terenkripsi (AES-256-GCM) untuk kredensial di DB.
//
// Dipakai bersama oleh wa-akun (API key/token gateway) dan totp (secret TOTP).
// Kenapa ada berkas sendiri: cadangan database kini ikut diunggah ke cloud
// (scripts/backup.js). Rahasia plaintext di DB berarti satu berkas backup yang
// bocor = semua kredensial bocor. Kunci hidup di environment (WA_SECRET_KEY atau
// JWT_SECRET) dan TIDAK ikut ke backup.
//
// Setiap pemakai memakai LABEL berbeda saat menurunkan kunci: kunci yang sama
// untuk dua tujuan berbeda adalah kesalahan kriptografi klasik.
const crypto = require('crypto');

function kunciDari(label) {
  const bahan = process.env.WA_SECRET_KEY || process.env.JWT_SECRET;
  if (!bahan) return null;
  return crypto.createHash('sha256').update(`${label}:${bahan}`).digest();
}

// Simpanan: 'enc:v1:<iv>:<tag>:<ciphertext>' (semua hex), atau 'plain:<teks>'
// kalau tidak ada kunci di environment (dev tanpa JWT_SECRET — data lama yang
// masih polos juga terbaca).
function enkripsi(teks, label) {
  if (!teks) return null;
  const k = kunciDari(label);
  if (!k) return `plain:${teks}`;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const isi = Buffer.concat([c.update(String(teks), 'utf8'), c.final()]);
  return `enc:v1:${iv.toString('hex')}:${c.getAuthTag().toString('hex')}:${isi.toString('hex')}`;
}

// Kunci berubah (mis. JWT_SECRET diganti) -> null; pemakai harus mengisi ulang.
function dekripsi(simpanan, label) {
  if (!simpanan) return null;
  const teks = String(simpanan);
  if (teks.startsWith('plain:')) return teks.slice(6);
  if (!teks.startsWith('enc:v1:')) return teks; // data lama, belum terenkripsi
  const k = kunciDari(label);
  if (!k) return null;
  const bagian = teks.split(':');
  if (bagian.length !== 5) return null;
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(bagian[2], 'hex'));
    d.setAuthTag(Buffer.from(bagian[3], 'hex'));
    return Buffer.concat([d.update(Buffer.from(bagian[4], 'hex')), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

module.exports = { enkripsi, dekripsi };
