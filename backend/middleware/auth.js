require('dotenv').config();
const jwt = require('jsonwebtoken');
const db = require('../db');

const SECRET = process.env.JWT_SECRET || 'siaga-dev';

function loadUser(id) {
  const user = db.prepare(`
    SELECT p.id,p.tipe,p.role,p.display_name,p.username,p.no_wa,p.status,p.must_change_password,
           sp.cabang_id,c.nama AS cabang_nama,c.kode AS cabang_kode,sp.foto
    FROM pengguna p
    LEFT JOIN staff_profile sp ON sp.pengguna_id=p.id
    LEFT JOIN cabang c ON c.id=sp.cabang_id
    WHERE p.id=?
  `).get(id);
  return user || null;
}

module.exports = (roles = []) => (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token tidak ada' });
  try {
    const payload = jwt.verify(token, SECRET);
    const user = loadUser(payload.id);
    if (!user || user.status === 'nonaktif') return res.status(401).json({ error: 'Akun tidak aktif' });
    if (roles.length && !roles.includes(user.role)) return res.status(403).json({ error: 'Akses ditolak' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Token tidak valid' });
  }
};

module.exports.SECRET = SECRET;
module.exports.loadUser = loadUser;
