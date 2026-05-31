require('dotenv').config();
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const auth = require('../middleware/auth');
const { SECRET, loadUser } = require('../middleware/auth');
const { nowUtc, audit } = require('../utils/workflow');

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

router.post('/login', (req, res) => {
  const { tipe = 'staff', username, no_wa, password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Password wajib' });
  const user = tipe === 'wali'
    ? db.prepare("SELECT * FROM pengguna WHERE tipe='wali' AND no_wa=?").get(String(no_wa || '').trim())
    : db.prepare("SELECT * FROM pengguna WHERE tipe='staff' AND username=?").get(String(username || '').trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Login gagal' });
  }
  if (user.status === 'nonaktif') return res.status(403).json({ error: 'Akun nonaktif' });
  const loaded = loadUser(user.id);
  const token = jwt.sign({ id: user.id }, SECRET, { expiresIn: '12h' });
  res.json({ token, user: publicUser(loaded) });
});

router.get('/me', auth(), (req, res) => {
  res.json(publicUser(req.user));
});

router.post('/change-password', auth(), (req, res) => {
  const { old_password, new_password } = req.body || {};
  if (!new_password || String(new_password).length < 8) return res.status(400).json({ error: 'Password baru minimal 8 karakter' });
  const row = db.prepare('SELECT password_hash FROM pengguna WHERE id=?').get(req.user.id);
  if (!row) return res.status(404).json({ error: 'Akun tidak ditemukan' });
  if (!req.user.must_change_password && !bcrypt.compareSync(old_password || '', row.password_hash)) {
    return res.status(400).json({ error: 'Password lama salah' });
  }
  db.prepare('UPDATE pengguna SET password_hash=?,status=?,must_change_password=0,updated_at=? WHERE id=?')
    .run(bcrypt.hashSync(new_password, 10), 'aktif', nowUtc(), req.user.id);
  audit(req.user, 'password_changed', 'pengguna', req.user.id);
  res.json({ success: true });
});

module.exports = router;
