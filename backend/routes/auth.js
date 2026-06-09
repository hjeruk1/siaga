require('dotenv').config();
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const auth = require('../middleware/auth');
const { SECRET, loadUser, MEDIA_COOKIE } = require('../middleware/auth');
const { nowUtc, audit } = require('../utils/workflow');

const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8oD4P0MYu96TbKavvLWS.5o60tK4Ga';
const loginAttempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

function attemptKey(req, tipe, identity) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return `${ip}:${tipe}:${String(identity || '').trim().toLowerCase()}`;
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
  return [
    `${MEDIA_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    secure ? 'Secure' : null
  ].filter(Boolean);
}

function setMediaCookie(res, token, maxAgeSeconds = 12 * 60 * 60) {
  const parts = mediaCookieOptions();
  parts[0] = `${MEDIA_COOKIE}=${encodeURIComponent(token)}`;
  parts.push(`Max-Age=${maxAgeSeconds}`);
  res.setHeader('Set-Cookie', parts.join('; '));
}

router.post('/login', (req, res) => {
  const { tipe = 'staff', username, no_wa, password } = req.body || {};
  const loginType = tipe === 'wali' ? 'wali' : 'staff';
  const identity = loginType === 'wali' ? String(no_wa || '').trim() : String(username || '').trim();
  const pass = String(password || '');
  if (!identity || !pass) return res.status(400).json({ error: 'Username/nomor WA dan password wajib diisi' });
  if (identity.length > 80 || pass.length > 128) return res.status(400).json({ error: 'Login gagal' });
  const key = attemptKey(req, loginType, identity);
  if (checkLoginLimit(key)) return res.status(429).json({ error: 'Terlalu banyak percobaan login. Coba lagi beberapa menit.' });
  const user = loginType === 'wali'
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

router.post('/change-password', auth(), (req, res) => {
  const { old_password, new_password } = req.body || {};
  if (!validPassword(new_password)) return res.status(400).json({ error: 'Password baru minimal 10 karakter serta mengandung huruf dan angka' });
  const row = db.prepare('SELECT password_hash FROM pengguna WHERE id=?').get(req.user.id);
  if (!row) return res.status(404).json({ error: 'Akun tidak ditemukan' });
  if (!req.user.must_change_password && !bcrypt.compareSync(old_password || '', row.password_hash)) {
    return res.status(400).json({ error: 'Password lama salah' });
  }
  db.prepare('UPDATE pengguna SET password_hash=?,status=?,must_change_password=0,auth_version=auth_version+1,updated_at=? WHERE id=?')
    .run(bcrypt.hashSync(new_password, 10), 'aktif', nowUtc(), req.user.id);
  audit(req.user, 'password_changed', 'pengguna', req.user.id);
  const loaded = loadUser(req.user.id);
  const token = jwt.sign({ id: loaded.id, v: Number(loaded.auth_version || 0) }, SECRET, { expiresIn: '12h' });
  setMediaCookie(res, token);
  res.json({ success: true, token, user: publicUser(loaded) });
});

module.exports = router;
