require('dotenv').config();
const jwt = require('jsonwebtoken');
const db = require('../db');

const SECRET = process.env.JWT_SECRET || 'siaga-dev';
const MEDIA_COOKIE = 'siaga_media';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('JWT_SECRET wajib diset untuk production.');
  process.exit(1);
}

function loadUser(id) {
  const user = db.prepare(`
    SELECT p.id,p.tipe,p.role,p.display_name,p.username,p.no_wa,p.status,p.must_change_password,p.auth_version,
           sp.cabang_id,c.nama AS cabang_nama,c.kode AS cabang_kode,sp.foto
    FROM pengguna p
    LEFT JOIN staff_profile sp ON sp.pengguna_id=p.id
    LEFT JOIN cabang c ON c.id=sp.cabang_id
    WHERE p.id=?
  `).get(id);
  return user || null;
}

function cookieValue(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return null;
}

function authenticate(req, res, next, roles, allowMediaCookie) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ')
    ? header.slice(7)
    : (allowMediaCookie ? cookieValue(req, MEDIA_COOKIE) : null);
  if (!token) return res.status(401).json({ error: 'Token tidak ada' });
  try {
    const payload = jwt.verify(token, SECRET);
    const user = loadUser(payload.id);
    if (!user || user.status === 'nonaktif') return res.status(401).json({ error: 'Akun tidak aktif' });
    if (Number(payload.v || 0) !== Number(user.auth_version || 0)) return res.status(401).json({ error: 'Sesi sudah tidak berlaku' });
    if (user.must_change_password && req.baseUrl !== '/api/auth') {
      return res.status(403).json({ error: 'Password wajib diganti sebelum melanjutkan', code: 'PASSWORD_CHANGE_REQUIRED' });
    }
    if (roles.length && !roles.includes(user.role)) return res.status(403).json({ error: 'Akses ditolak' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Token tidak valid' });
  }
}

module.exports = (roles = []) => (req, res, next) => authenticate(req, res, next, roles, false);
module.exports.media = (roles = []) => (req, res, next) => authenticate(req, res, next, roles, true);

module.exports.SECRET = SECRET;
module.exports.loadUser = loadUser;
module.exports.MEDIA_COOKIE = MEDIA_COOKIE;
