// Pemakaian penyimpanan server — hanya admin pusat.
//
// Sengaja tidak dibuka untuk admin_cabang: angkanya mencakup SELURUH server
// (semua cabang, backup, database), jadi bukan informasi milik satu cabang.
const router = require('express').Router();
const auth = require('../middleware/auth');
const storage = require('../utils/storage');

router.get('/', auth(['admin']), (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(storage.ringkas());
});

module.exports = router;
