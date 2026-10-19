// Status kanal WhatsApp. Dipakai admin untuk memastikan sesi Easy API masih
// hidup sebelum menunggu kabar yang tidak pernah datang.
//
// Rute ini sengaja TIDAK menampilkan isi pesan/riwayat chat: yang dibutuhkan
// operator hanya "nyambung / siap / antrean sedang ada berapa".
const router = require('express').Router();
const auth = require('../middleware/auth');
const wa = require('../utils/wa');

router.get('/status', auth(['admin', 'admin_cabang', 'kepsek']), async (req, res) => {
  const dasar = wa.statusWA();
  if (!dasar.aktif) return res.json(dasar);
  // Probe kesehatan provider (openwa: GET /health di Easy API).
  try {
    const detail = await wa._providerAktif().status();
    return res.json({ ...dasar, ...detail });
  } catch (e) {
    return res.json({ ...dasar, reachable: false, error: e.message });
  }
});

module.exports = router;
