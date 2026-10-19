// Gerbang PIN untuk aksi finansial wali.
//
// Aturan penyaringan (penting, jangan dilonggarkan sembarangan):
// - Hanya berlaku untuk pengguna berperan WALI. Staff (admin, admin_cabang,
//   kepsek, guru, gerbang) tidak pernah ikut: mereka tidak punya PIN dan
//   jalur kerja mereka sudah dilindungi hak akses sendiri.
// - Wali yang BELUM memasang PIN tidak ikut. PIN itu opsional; memaksanya
//   akan mengunci orang tua dari tagihannya sendiri hanya karena belum
//   menyiapkan PIN.
// - Yang divalidasi adalah token HMAC berumur 10 menit dari POST /api/auth/pin/verify,
//   dikirim sebagai header X-Pin-Token. Tidak ada sesi yang disimpan server.
//
// Validasi token TIDAK diduplikasi di sini: dipakai langsung dari routes/auth.js
// supaya aturan (durasi, format) hanya hidup di satu berkas.
const db = require('../db');
const { pinTokenValid } = require('../routes/auth');

function punyaPin(userId) {
  const row = db.prepare('SELECT pin_hash FROM pengguna WHERE id=?').get(userId);
  return !!(row && row.pin_hash);
}

/**
 * Pasang setelah auth() pada route yang menyentuh data uang wali:
 *   router.get('/wali/siswa/:id', auth(['wali']), requirePin, handler)
 *
 * Kalau PIN diperlukan tapi belum/belum valid -> 403 dengan code PIN_REQUIRED
 * supaya frontend bisa menampilkan dialog PIN lalu mengulang permintaan.
 */
function requirePin(req, res, next) {
  if (!req.user || req.user.role !== 'wali') return next();
  if (!punyaPin(req.user.id)) return next();
  if (pinTokenValid(req.user.id, req.headers['x-pin-token'])) return next();
  return res.status(403).json({
    error: 'Masukkan PIN untuk membuka bagian keuangan',
    code: 'PIN_REQUIRED'
  });
}

module.exports = requirePin;
module.exports.punyaPin = punyaPin;
