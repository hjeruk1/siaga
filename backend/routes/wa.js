// Status & pengelolaan kanal WhatsApp.
//
// Dua hal yang dilayani di sini:
// 1. Status kanal (dipakai layar admin): sesi hidup, antrean, keadaan pemantau.
// 2. Registry nomor per cabang: tambah/ubah/hapus akun pengirim.
//
// Rute ini sengaja TIDAK menampilkan isi pesan/riwayat chat: yang dibutuhkan
// operator hanya "nyambung / siap / antrean sedang ada berapa". Kredensial
// (API key/token) juga tidak pernah dikirim balik — hanya penanda ada/tidak.
const router = require('express').Router();
const auth = require('../middleware/auth');
const wa = require('../utils/wa');
const akunWa = require('../utils/wa-akun');
const monitor = require('../utils/wa-monitor');

const ADMIN = ['admin'];

router.get('/status', auth(['admin', 'admin_cabang', 'kepsek']), async (req, res) => {
  const dasar = wa.statusWA();
  const akun = akunWa.daftar();
  const pantau = monitor.ringkasan();
  if (!dasar.aktif) return res.json({ ...dasar, akun, pantau });
  // Probe kesehatan provider (openwa: GET /health di Easy API).
  try {
    const detail = await wa.cekStatus();
    return res.json({ ...dasar, ...detail, akun, pantau });
  } catch (e) {
    return res.json({ ...dasar, reachable: false, error: e.message, akun, pantau });
  }
});

// Periksa sekarang tanpa menunggu jadwal berkala. Dipakai tombol "Periksa"
// di layar admin setelah memperbaiki sesi — menunggu 5 menit berikutnya
// membuat orang ragu apakah perbaikannya berhasil.
router.post('/check', auth(['admin', 'admin_cabang', 'kepsek']), async (req, res) => {
  const hasil = await monitor.cekSekarang();
  res.json({ success: true, ...hasil, pantau: monitor.ringkasan(), akun: akunWa.daftar() });
});

// ---------------------------------------------------------------------------
// Registry nomor per cabang
// ---------------------------------------------------------------------------
// Daftar akun: admin pusat melihat semua; admin_cabang hanya milik cabangnya
// (dibutuhkan alur "hubungkan nomor mandiri" — mereka melihat status nomor
// sendiri tanpa bisa mengubah kredensial).
router.get('/akun', auth(['admin', 'admin_cabang']), (req, res) => {
  const rows = akunWa.daftar();
  if (req.user.role === 'admin_cabang') {
    const cabang = Number(req.user.cabang_id);
    return res.json({ rows: rows.filter((a) => Number(a.cabang_id) === cabang) });
  }
  res.json({ rows });
});

router.post('/akun', auth(ADMIN), (req, res) => {
  try {
    const id = akunWa.simpan(req.body || {});
    res.status(201).json({ success: true, id });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/akun/:id', auth(ADMIN), (req, res) => {
  try {
    akunWa.simpan(req.body || {}, Number(req.params.id));
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/akun/:id', auth(ADMIN), (req, res) => {
  const ok = akunWa.hapus(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: 'Akun tidak ditemukan' });
  res.json({ success: true });
});

// Uji satu nomor tanpa menunggu jadwal pemantau. admin_cabang boleh menguji
// nomor cabangnya sendiri (pemeriksaan hanya baca, tidak mengubah apa pun).
router.post('/akun/:id/uji', auth(['admin', 'admin_cabang']), async (req, res) => {
  const akun = akunWa.ambil(Number(req.params.id));
  if (!akun) return res.status(404).json({ error: 'Akun tidak ditemukan' });
  if (req.user.role === 'admin_cabang' && Number(akun.cabang_id) !== Number(req.user.cabang_id))
    return res.status(403).json({ error: 'Anda hanya boleh menguji nomor cabang sendiri.' });
  const hasil = await monitor.cekAkun(akun);
  res.json({ success: true, ...hasil });
});

module.exports = router;
