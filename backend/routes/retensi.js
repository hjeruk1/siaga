// Kebijakan retensi galeri — hanya admin pusat.
//
// Sama seperti /api/storage: keputusan ini menyentuh seluruh server (semua
// cabang, satu disk), jadi bukan wewenang admin cabang. Angka pratinjau
// dihitung dengan fungsi yang sama yang dipakai pelaksana (pratinjau vs
// jalankan memakai batas dan query yang sama), sehingga yang tertulis di layar
// tidak bisa berbeda dari yang benar-benar terjadi saat tombol ditekan.
const router = require('express').Router();
const auth = require('../middleware/auth');
const retensi = require('../utils/retensi');

const ADMIN = ['admin'];

router.get('/', auth(ADMIN), (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ...retensi.pratinjau(), riwayat: retensi.riwayat() });
});

router.put('/', auth(ADMIN), (req, res) => {
  try {
    retensi.simpanSetelan(req.body || {}, req.user);
    res.json({ success: true, ...retensi.pratinjau(), riwayat: retensi.riwayat() });
  } catch (e) {
    // Batas yang bertabrakan (hapus <= arsip) adalah input admin, bukan
    // kegagalan server.
    res.status(400).json({ error: e.message });
  }
});

router.post('/jalankan', auth(ADMIN), (req, res) => {
  try {
    const hasil = retensi.jalankan({ mode: 'manual', aktor: req.user });
    // `hasil` dan `pratinjau` sama-sama punya kunci `yatim` (yang dibersihkan
    // vs yang masih tersisa). Digabung rata, angka "dibersihkan" akan tertimpa
    // angka sisa — jadi keduanya dipisah, bukan di-spread.
    res.json({ success: true, hasil, pratinjau: retensi.pratinjau() });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
