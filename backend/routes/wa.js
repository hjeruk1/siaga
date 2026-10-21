// Status kanal WhatsApp. Dipakai admin untuk memastikan sesi Easy API masih
// hidup sebelum menunggu kabar yang tidak pernah datang.
//
// Rute ini sengaja TIDAK menampilkan isi pesan/riwayat chat: yang dibutuhkan
// operator hanya "nyambung / siap / antrean sedang ada berapa".
const router = require('express').Router();
const auth = require('../middleware/auth');
const wa = require('../utils/wa');
const monitor = require('../utils/wa-monitor');

router.get('/status', auth(['admin', 'admin_cabang', 'kepsek']), async (req, res) => {
  const dasar = wa.statusWA();
  const pantau = monitor.baca();
  if (!dasar.aktif) return res.json({ ...dasar, pantau });
  // Probe kesehatan provider (openwa: GET /health di Easy API).
  try {
    const detail = await wa.cekStatus();
    return res.json({ ...dasar, ...detail, pantau });
  } catch (e) {
    return res.json({ ...dasar, reachable: false, error: e.message, pantau });
  }
});

// Periksa sekarang tanpa menunggu jadwal berkala. Dipakai tombol "Periksa"
// di layar admin setelah memperbaiki sesi — menunggu 5 menit berikutnya
// membuat orang ragu apakah perbaikannya berhasil.
router.post('/check', auth(['admin', 'admin_cabang', 'kepsek']), async (req, res) => {
  const hasil = await monitor.cekSekarang();
  res.json({ success: true, ...hasil, pantau: monitor.baca() });
});

module.exports = router;
