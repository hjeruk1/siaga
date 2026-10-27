// Manajemen sesi open-wa multi-sesi LEWAT SIAGA — alur "hubungkan nomor
// mandiri": admin cabang menghubungkan nomor cabangnya tanpa membuka dashboard
// OpenWA di server.
//
// Semua panggilan ke open-wa terjadi di server (utils/wa-sesi.js memegang
// WA_API_URL/WA_API_KEY dari .env). Browser hanya menerima QR (data-URL),
// kode pairing, dan status.
//
// Hak akses:
//   - admin (pusat)   : semua cabang + akun pusat (cadangan)
//   - admin_cabang    : hanya sesi & nomor untuk cabangnya sendiri
// Akun pusat (cabang_id kosong) hanya boleh dibuat admin pusat — jika admin
// cabang bisa membuatnya, pesan cadangan bisa dialihkan ke nomor cabang.
const router = require('express').Router();
const auth = require('../middleware/auth');
const sesi = require('../utils/wa-sesi');
const { audit } = require('../utils/workflow');

const KELOLA = ['admin', 'admin_cabang'];

function cabangDiizinkan(user, cabangId) {
  if (user.role === 'admin') return true;
  if (user.role === 'admin_cabang') {
    const id = cabangId === '' || cabangId === null || cabangId === undefined ? null : Number(cabangId);
    return id !== null && Number(user.cabang_id) === id;
  }
  return false;
}

function galat(res, e) {
  if (e.code === 'TERLALU_SERING') return res.status(429).json({ error: e.message, code: 'TERLALU_SERING' });
  if (e.code === 'NOMOR_TIDAK_VALID') return res.status(400).json({ error: e.message, code: 'NOMOR_TIDAK_VALID' });
  return res.status(400).json({ error: e.message });
}

const PESAN_SESI_DITOLAK = 'Anda hanya boleh mengelola sesi nomor cabang sendiri.';

// Sesi tanpa catatan kepemilikan (dibuat sebelum migrasi 021) hanya boleh
// dibuka admin pusat; admin cabang harus lewat sesi yang ia buat sendiri.
function sesiBoleh(req, res) {
  if (sesi.sesiDiizinkan(req.user, req.params.id)) return true;
  res.status(403).json({ error: PESAN_SESI_DITOLAK });
  return false;
}

// Daftar sesi di instance (untuk "pakai sesi yang sudah ada").
router.get('/', auth(KELOLA), async (req, res) => {
  if (!sesi.instanceSiap())
    return res.status(400).json({ error: 'Instance OpenWA belum dikonfigurasi di server (WA_API_URL/WA_API_KEY).' });
  try {
    const rows = await sesi.daftarSesi();
    // Admin cabang hanya melihat sesi milik cabangnya; daftar mentah dari
    // instance memuat sesi semua cabang. Bentuk balasan yang tidak dikenal
    // diperlakukan sebagai daftar kosong, jangan diteruskan mentah.
    if (req.user.role === 'admin_cabang') {
      const milik = Array.isArray(rows) ? rows.filter((r) => sesi.sesiDiizinkan(req.user, r.id)) : [];
      return res.json({ rows: milik });
    }
    res.json({ rows });
  } catch (e) {
    galat(res, e);
  }
});

router.get('/:id', auth(KELOLA), async (req, res) => {
  if (!sesiBoleh(req, res)) return;
  try {
    res.json(await sesi.detailSesi(req.params.id));
  } catch (e) {
    galat(res, e);
  }
});

// Buat sesi baru (+start). cabang_id dipakai untuk hak akses SEKARANG juga:
// admin cabang hanya boleh menyiapkan sesi untuk cabangnya.
router.post('/', auth(KELOLA), async (req, res) => {
  const { nama, cabang_id } = req.body || {};
  if (!cabangDiizinkan(req.user, cabang_id))
    return res.status(403).json({ error: 'Anda hanya boleh mengelola nomor cabang sendiri.' });
  try {
    const s = await sesi.buatSesi(nama);
    // Catat kepemilikan sekarang: rute detail/QR/pairing memeriksanya.
    sesi.catatPending(s.id, cabang_id, req.user.id);
    audit(req.user, 'wa_sesi_dibuat', 'wa_akun', null, {
      after: { session_id: s.id, nama: s.name, cabang_id: cabang_id ?? null }
    });
    res.status(201).json(s);
  } catch (e) {
    galat(res, e);
  }
});

router.post('/:id/start', auth(KELOLA), async (req, res) => {
  if (!sesiBoleh(req, res)) return;
  try {
    res.json(await sesi.startSesi(req.params.id));
  } catch (e) {
    galat(res, e);
  }
});

// QR sesi (data-URL PNG). Cache 3 detik ada di util.
router.get('/:id/qr', auth(KELOLA), async (req, res) => {
  if (!sesiBoleh(req, res)) return;
  try {
    res.json(await sesi.qrSesi(req.params.id));
  } catch (e) {
    galat(res, e);
  }
});

// Kode pairing untuk nomor cabang (alternatif scan QR).
router.post('/:id/pairing', auth(KELOLA), async (req, res) => {
  if (!sesiBoleh(req, res)) return;
  try {
    const { nomor } = req.body || {};
    const hasil = await sesi.kodePairing(req.params.id, nomor);
    audit(req.user, 'wa_sesi_pairing', 'wa_akun', null, {
      after: { session_id: req.params.id, nomor: hasil.nomor }
    });
    res.json(hasil);
  } catch (e) {
    galat(res, e);
  }
});

// Sesi sudah 'ready' -> simpan sebagai nomor pengirim cabang.
router.post('/:id/simpan', auth(KELOLA), async (req, res) => {
  const { cabang_id, label } = req.body || {};
  if (!cabangDiizinkan(req.user, cabang_id))
    return res.status(403).json({ error: 'Anda hanya boleh mengelola nomor cabang sendiri.' });
  if (!sesiBoleh(req, res)) return;
  try {
    const hasil = await sesi.simpanSebagaiAkun(req.params.id, { cabang_id, label }, req.user);
    res.status(201).json({ success: true, ...hasil });
  } catch (e) {
    galat(res, e);
  }
});

// Hapus sesi dari instance — hanya admin pusat: sesi pusat/cadangan tidak
// boleh bisa dihapus admin cabang.
router.delete('/:id', auth(['admin']), async (req, res) => {
  try {
    await sesi.hapusSesi(req.params.id);
    audit(req.user, 'wa_sesi_dihapus', 'wa_akun', null, { after: { session_id: req.params.id } });
    res.json({ success: true });
  } catch (e) {
    galat(res, e);
  }
});

module.exports = router;
