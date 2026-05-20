const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { nowUtc } = require('../utils/workflow');

router.get('/', auth(), (req, res) => {
  res.json(db.prepare(`
    SELECT * FROM notifikasi
    WHERE recipient_pengguna_id=?
    ORDER BY read_at IS NULL DESC,created_at DESC
    LIMIT 80
  `).all(req.user.id));
});

router.put('/:id/read', auth(), (req, res) => {
  const n = db.prepare('SELECT * FROM notifikasi WHERE id=?').get(req.params.id);
  if (!n) return res.status(404).json({ error: 'Notifikasi tidak ditemukan' });
  if (Number(n.recipient_pengguna_id) !== Number(req.user.id)) return res.status(403).json({ error: 'Akses ditolak' });
  db.prepare('UPDATE notifikasi SET read_at=? WHERE id=?').run(nowUtc(), req.params.id);
  res.json({ success: true });
});

router.put('/read-all', auth(), (req, res) => {
  db.prepare('UPDATE notifikasi SET read_at=COALESCE(read_at,?) WHERE recipient_pengguna_id=?').run(nowUtc(), req.user.id);
  res.json({ success: true });
});

module.exports = router;
