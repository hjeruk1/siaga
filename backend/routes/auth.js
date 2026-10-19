require('dotenv').config();
const crypto = require('crypto');
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const auth = require('../middleware/auth');
const { SECRET, loadUser, MEDIA_COOKIE } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { loginSchema, changePasswordSchema, lupaPasswordSchema, resetPasswordSchema } = require('../schemas');
const { nowUtc, audit } = require('../utils/workflow');
const otp = require('../utils/otp');
const wa = require('../utils/wa');

const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8oD4P0MYu96TbKavvLWS.5o60tK4Ga';
const loginAttempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

function attemptKey(req, tipe, identity) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return `${ip}:${tipe}:${String(identity || '')
    .trim()
    .toLowerCase()}`;
}

function checkLoginLimit(key) {
  const now = Date.now();
  const item = loginAttempts.get(key);
  if (!item || item.resetAt <= now) {
    loginAttempts.set(key, { count: 0, resetAt: now + WINDOW_MS });
    return false;
  }
  return item.count >= MAX_ATTEMPTS;
}

function recordLoginFailure(key) {
  const now = Date.now();
  const item = loginAttempts.get(key) || { count: 0, resetAt: now + WINDOW_MS };
  if (item.resetAt <= now) {
    item.count = 0;
    item.resetAt = now + WINDOW_MS;
  }
  item.count += 1;
  loginAttempts.set(key, item);
}

function clearLoginFailures(key) {
  loginAttempts.delete(key);
}

setInterval(() => {
  const now = Date.now();
  for (const [key, item] of loginAttempts.entries()) {
    if (item.resetAt <= now) loginAttempts.delete(key);
  }
}, WINDOW_MS).unref();

function publicUser(u) {
  return {
    id: u.id,
    tipe: u.tipe,
    role: u.role,
    display_name: u.display_name,
    username: u.username,
    no_wa: u.no_wa,
    status: u.status,
    must_change_password: !!u.must_change_password,
    cabang_id: u.cabang_id,
    cabang_nama: u.cabang_nama,
    cabang_kode: u.cabang_kode,
    foto: u.foto
  };
}

function validPassword(value) {
  const password = String(value || '');
  return password.length >= 10 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

function mediaCookieOptions() {
  const secure = process.env.NODE_ENV === 'production';
  return [`${MEDIA_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', secure ? 'Secure' : null].filter(Boolean);
}

function setMediaCookie(res, token, maxAgeSeconds = 12 * 60 * 60) {
  const parts = mediaCookieOptions();
  parts[0] = `${MEDIA_COOKIE}=${encodeURIComponent(token)}`;
  parts.push(`Max-Age=${maxAgeSeconds}`);
  res.setHeader('Set-Cookie', parts.join('; '));
}

router.post('/login', validateBody(loginSchema), (req, res) => {
  const { tipe = 'staff', username, no_wa, password } = req.body || {};
  const loginType = tipe === 'wali' ? 'wali' : 'staff';
  const identity = loginType === 'wali' ? String(no_wa || '').trim() : String(username || '').trim();
  const pass = String(password || '');
  if (!identity || !pass) return res.status(400).json({ error: 'Username/nomor WA dan password wajib diisi' });
  if (identity.length > 80 || pass.length > 128) return res.status(400).json({ error: 'Login gagal' });
  const key = attemptKey(req, loginType, identity);
  if (checkLoginLimit(key))
    return res.status(429).json({ error: 'Terlalu banyak percobaan login. Coba lagi beberapa menit.' });
  const user =
    loginType === 'wali'
      ? db.prepare("SELECT * FROM pengguna WHERE tipe='wali' AND no_wa=?").get(identity)
      : db.prepare("SELECT * FROM pengguna WHERE tipe='staff' AND username=?").get(identity);
  if (!bcrypt.compareSync(pass, user?.password_hash || DUMMY_HASH)) {
    recordLoginFailure(key);
    return res.status(401).json({ error: 'Login gagal' });
  }
  clearLoginFailures(key);
  if (user.status === 'nonaktif') return res.status(403).json({ error: 'Akun nonaktif' });
  const loaded = loadUser(user.id);
  const token = jwt.sign({ id: user.id, v: Number(user.auth_version || 0) }, SECRET, { expiresIn: '12h' });
  setMediaCookie(res, token);
  res.json({ token, user: publicUser(loaded) });
});

router.post('/logout', (_req, res) => {
  const parts = mediaCookieOptions();
  parts.push('Max-Age=0');
  res.setHeader('Set-Cookie', parts.join('; '));
  res.json({ success: true });
});

router.get('/me', auth(), (req, res) => {
  res.json(publicUser(req.user));
});

router.post('/change-password', auth(), validateBody(changePasswordSchema), (req, res) => {
  const { old_password, new_password } = req.body || {};
  if (!validPassword(new_password))
    return res.status(400).json({ error: 'Password baru minimal 10 karakter serta mengandung huruf dan angka' });
  const row = db.prepare('SELECT password_hash FROM pengguna WHERE id=?').get(req.user.id);
  if (!row) return res.status(404).json({ error: 'Akun tidak ditemukan' });
  if (!req.user.must_change_password && !bcrypt.compareSync(old_password || '', row.password_hash)) {
    return res.status(400).json({ error: 'Password lama salah' });
  }
  db.prepare(
    'UPDATE pengguna SET password_hash=?,status=?,must_change_password=0,auth_version=auth_version+1,updated_at=? WHERE id=?'
  ).run(bcrypt.hashSync(new_password, 10), 'aktif', nowUtc(), req.user.id);
  audit(req.user, 'password_changed', 'pengguna', req.user.id);
  const loaded = loadUser(req.user.id);
  const token = jwt.sign({ id: loaded.id, v: Number(loaded.auth_version || 0) }, SECRET, { expiresIn: '12h' });
  setMediaCookie(res, token);
  res.json({ success: true, token, user: publicUser(loaded) });
});

// ---------------------------------------------------------------------------
// Lupa password — kode OTP lewat WhatsApp
// ---------------------------------------------------------------------------
// Dua langkah, dua rute:
//   1. POST /api/auth/lupa-password  -> kirim kode 6 angka ke nomor terdaftar
//   2. POST /api/auth/reset-password -> kode + password baru
//
// Kenapa tidak satu rute dengan token: kode OTP hanya 6 angka dan berumur 5
// menit, jadi tidak ada gunanya menukarnya dengan token perantara. Lebih
// sedikit langkah = lebih sedikit tempat untuk salah.
//
// Balasan langkah 1 SELALU sama, baik akunnya ada maupun tidak. Tanpa itu,
// formulir ini menjadi alat untuk memeriksa nomor mana yang terdaftar di
// sekolah — informasi yang tidak boleh bocor ke publik.
router.post('/lupa-password', validateBody(lupaPasswordSchema), async (req, res) => {
  const { tipe = 'wali', no_wa, username } = req.body || {};
  const jenis = tipe === 'staff' ? 'staff' : 'wali';

  // Jujur kalau kanal WA belum aktif: lebih baik orang tua diarahkan ke admin
  // daripada menunggu kode yang tidak akan pernah datang.
  if (!otp.waSiap()) {
    return res.status(503).json({
      error:
        'Pemulihan lewat WhatsApp belum diaktifkan di server ini. Hubungi admin sekolah untuk mengatur ulang password Anda.',
      code: 'WA_NONAKTIF'
    });
  }

  const hasil = await otp.kirimKode({ tipe: jenis, no_wa, username, ip: req.ip });
  if (hasil.status === 'terlalu-sering') {
    const menit = Math.max(1, Math.ceil((hasil.sisaDetik || 60) / 60));
    return res.status(429).json({
      error: `Terlalu banyak permintaan kode. Coba lagi dalam ${menit} menit.`,
      code: 'TERLALU_SERING'
    });
  }
  if (hasil.status === 'gagal-kirim') {
    return res.status(502).json({
      error: 'Kode gagal dikirim lewat WhatsApp. Coba lagi beberapa saat atau hubungi admin sekolah.',
      code: 'GAGAL_KIRIM'
    });
  }

  res.json({
    success: true,
    pesan: otp.PESAN_UMUM,
    berlaku_detik: Math.floor(otp.TTL_MS / 1000)
  });
});

router.post('/reset-password', validateBody(resetPasswordSchema), (req, res) => {
  const { tipe = 'wali', no_wa, username, kode, password_baru } = req.body || {};
  const jenis = tipe === 'staff' ? 'staff' : 'wali';

  if (!validPassword(password_baru))
    return res.status(400).json({ error: 'Password baru minimal 10 karakter serta mengandung huruf dan angka' });
  if (!/^\d{6}$/.test(String(kode || '')))
    return res.status(400).json({ error: 'Kode verifikasi harus 6 angka' });

  const pengguna = otp.cariPengguna({ tipe: jenis, no_wa, username });
  // Akun tidak ada tetap menjalani verifikasi (dengan id -1) supaya waktu
  // balasannya setara dan tidak membocorkan keberadaan akun.
  const hasil = otp.verifikasiKode(pengguna?.id ?? -1, kode);
  if (!pengguna || !hasil.ok) {
    return res.status(400).json({ error: hasil.error || 'Kode tidak valid atau sudah kedaluwarsa. Minta kode baru.' });
  }

  // status sengaja TIDAK diubah: akun yang dinonaktifkan sekolah tidak boleh
  // hidup lagi lewat pemulihan mandiri. must_change_password dimatikan karena
  // pengguna baru saja memilih passwordnya sendiri.
  db.prepare(
    'UPDATE pengguna SET password_hash=?,must_change_password=0,auth_version=auth_version+1,updated_at=? WHERE id=?'
  ).run(bcrypt.hashSync(password_baru, 10), nowUtc(), pengguna.id);

  audit({ id: pengguna.id }, 'password_reset_otp', 'pengguna', pengguna.id, {
    reason: 'reset mandiri lewat OTP WhatsApp'
  });

  // Kabari pemilik nomor. Kalau ini bukan dia, satu-satunya tanda yang mungkin
  // dilihatnya adalah pesan ini — jadi jangan dilewatkan.
  if (pengguna.no_wa) {
    wa.kirimWA({
      no_wa: pengguna.no_wa,
      pesan: [
        '*SIAGA Taruna Prima*',
        '',
        'Password akun SIAGA Anda baru saja diubah lewat pemulihan WhatsApp.',
        '',
        'Jika ini bukan Anda, segera hubungi admin sekolah — akun Anda mungkin sedang diambil alih.'
      ].join('\n')
    }).catch(() => {});
  }

  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// PIN 6 angka — gerbang tambahan untuk aksi finansial wali
// ---------------------------------------------------------------------------
// Yang dilindungi: konfirmasi pembayaran dan membaca rincian tagihan/riwayat
// bayar. Tujuannya skenario "HP dipinjam keluarga": tetap bisa lihat kabar
// anak, tapi tidak bisa mengajukan pembayaran atau membuka data uang.
//
// Aturan main (semua disengaja):
// - PIN hanya 6 angka -> WAJIB dibatasi percobaan. 5 kali salah -> terkunci
//   15 menit. Tanpa ini, 6 angka bisa ditebak habis.
// - PIN disimpan bcrypt, BUKAN hash biasa. SHA-256 atas 6 angka bisa diuji
//   jutaan kali per detik pada GPU; bcrypt memperlambat itu secara drastis.
// - Verifikasi menghasilkan token HMAC berumur 10 menit (pinToken), dikirim
//   sebagai header X-Pin-Token pada permintaan yang dilindungi. Server tidak
//   menyimpan sesi; token kedaluwarsa sendiri.
// - Status akun 'undangan' (belum aktif) tidak boleh punya PIN: akun itu baru
//   setengah jadi.

const PIN_MAX_COBA = 5;
const PIN_KUNCI_MS = 15 * 60 * 1000;
const PIN_TOKEN_MS = 10 * 60 * 1000;

function pinValid(value) {
  return /^\d{6}$/.test(String(value || ''));
}

// Token pin mirip konsep kunci publik invoice/kuitansi: HMAC, tanpa database.
function pinTokenUntuk(userId) {
  const exp = Math.floor((Date.now() + PIN_TOKEN_MS) / 1000);
  const isi = `pin:${userId}:${exp}`;
  const sig = crypto.createHmac('sha256', SECRET).update(isi).digest('hex');
  return `${exp}.${sig}`;
}

function pinTokenValid(userId, token) {
  const [expRaw, sig] = String(token || '').split('.');
  const exp = Number(expRaw);
  if (!Number.isInteger(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  if (!/^[a-f0-9]{64}$/.test(sig || '')) return false;
  const isi = `pin:${userId}:${exp}`;
  const expected = crypto.createHmac('sha256', SECRET).update(isi).digest('hex');
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  // timingSafeEqual mencegah kebocoran lewat waktu eksekusi.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Status lengkap + kunci; dipakai middleware requirePin.
function pinStatus(userId) {
  const row = db
    .prepare('SELECT pin_hash, pin_failed_count, pin_locked_until FROM pengguna WHERE id=?')
    .get(userId);
  if (!row || !row.pin_hash) return { punyaPin: false, terkunci: false, sisaCoba: PIN_MAX_COBA };
  const locked = row.pin_locked_until && new Date(row.pin_locked_until).getTime() > Date.now();
  return {
    punyaPin: true,
    terkunci: !!locked,
    kunciSampai: locked ? row.pin_locked_until : null,
    sisaCoba: Math.max(0, PIN_MAX_COBA - (row.pin_failed_count || 0))
  };
}

// Verifikasi PIN. Mengembalikan { ok, token?, error?, status? }.
function verifikasiPin(userId, pin) {
  const status = pinStatus(userId);
  if (status.terkunci) return { ok: false, error: 'PIN terkunci sementara. Coba lagi beberapa menit.', status };
  const row = db.prepare('SELECT pin_hash FROM pengguna WHERE id=?').get(userId);
  if (!row || !bcrypt.compareSync(String(pin || ''), row.pin_hash)) {
    const gagal = (db.prepare('SELECT pin_failed_count c FROM pengguna WHERE id=?').get(userId).c || 0) + 1;
    const kunciSampai =
      gagal >= PIN_MAX_COBA ? new Date(Date.now() + PIN_KUNCI_MS).toISOString() : null;
    db.prepare('UPDATE pengguna SET pin_failed_count=?, pin_locked_until=?, updated_at=? WHERE id=?').run(
      gagal,
      kunciSampai,
      nowUtc(),
      userId
    );
    return {
      ok: false,
      error: kunciSampai ? 'PIN salah 5 kali. Dikunci 15 menit.' : `PIN salah. Sisa ${PIN_MAX_COBA - gagal} percobaan.`,
      status: pinStatus(userId)
    };
  }
  db.prepare('UPDATE pengguna SET pin_failed_count=0, pin_locked_until=NULL, updated_at=? WHERE id=?').run(
    nowUtc(),
    userId
  );
  return { ok: true, token: pinTokenUntuk(userId), status: pinStatus(userId) };
}

router.get('/pin/status', auth(), (req, res) => {
  res.json(pinStatus(req.user.id));
});

router.post('/pin', auth(), (req, res) => {
  const { pin, password } = req.body || {};
  if (req.user.status !== 'aktif')
    return res.status(403).json({ error: 'Ganti password akun terlebih dahulu sebelum mengatur PIN' });
  if (!pinValid(pin)) return res.status(400).json({ error: 'PIN harus 6 angka' });
  const pinStr = String(pin);
  if (pinStr === '123456' || /^(\d)\1{5}$/.test(pinStr) || pinStr === '654321')
    return res.status(400).json({ error: 'Pilih PIN yang tidak mudah ditebak' });
  // Membuat ATAU mengganti PIN selalu wajib password. Alasannya sederhana:
  // kalau ganti PIN hanya butuh sesi yang sudah login, siapa pun yang memegang
  // HP orang tua bisa memasang PIN baru dan mengambil alih akun. Password
  // adalah bukti kepemilikan; PIN lama tidak perlu ditanya karena password
  // lebih kuat dari PIN 6 angka.
  const row = db.prepare('SELECT password_hash FROM pengguna WHERE id=?').get(req.user.id);
  if (!row) return res.status(404).json({ error: 'Akun tidak ditemukan' });
  if (!bcrypt.compareSync(String(password || ''), row.password_hash))
    return res.status(400).json({ error: 'Password salah' });
  db.prepare(
    'UPDATE pengguna SET pin_hash=?, pin_failed_count=0, pin_locked_until=NULL, pin_updated_at=?, updated_at=? WHERE id=?'
  ).run(bcrypt.hashSync(pinStr, 10), nowUtc(), nowUtc(), req.user.id);
  audit(req.user, 'pin_set', 'pengguna', req.user.id);
  res.json({ success: true, status: pinStatus(req.user.id) });
});

router.post('/pin/verify', auth(), (req, res) => {
  const { pin } = req.body || {};
  if (!pinValid(pin)) return res.status(400).json({ error: 'PIN harus 6 angka' });
  const hasil = verifikasiPin(req.user.id, pin);
  if (!hasil.ok) {
    const code = hasil.status?.terkunci ? 'PIN_LOCKED' : 'PIN_SALAH';
    return res.status(429).json({ error: hasil.error, code, status: hasil.status });
  }
  audit(req.user, 'pin_verify', 'pengguna', req.user.id);
  res.json({ success: true, pin_token: hasil.token, berlaku_detik: Math.floor(PIN_TOKEN_MS / 1000) });
});

router.delete('/pin', auth(), (req, res) => {
  const { password } = req.body || {};
  const row = db.prepare('SELECT password_hash, pin_hash FROM pengguna WHERE id=?').get(req.user.id);
  if (!row) return res.status(404).json({ error: 'Akun tidak ditemukan' });
  if (!row.pin_hash) return res.status(400).json({ error: 'Belum ada PIN' });
  if (!bcrypt.compareSync(String(password || ''), row.password_hash))
    return res.status(400).json({ error: 'Password salah' });
  db.prepare('UPDATE pengguna SET pin_hash=NULL, pin_failed_count=0, pin_locked_until=NULL, pin_updated_at=NULL, updated_at=? WHERE id=?').run(
    nowUtc(),
    req.user.id
  );
  audit(req.user, 'pin_delete', 'pengguna', req.user.id);
  res.json({ success: true });
});

module.exports = router;
// Dipakai middleware/pin.js. Sengaja diekspor: logika validasi token harus
// hidup di SATU tempat. Kalau diduplikasi, perubahan kebijakan (mis. durasi
// token) gampang hanya diterapkan di salah satu berkas.
module.exports.pinTokenValid = pinTokenValid;
