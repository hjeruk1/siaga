// Pengumuman sekolah ke orang tua: satu pesan, banyak penerima.
//
// Kenapa lewat aplikasi, bukan grup WhatsApp: pengumuman punya jejak (siapa
// mengirim, kapan, berapa penerima), bisa dibaca ulang oleh orang tua yang
// telat membuka HP, dan tidak tenggelam di antara obrolan grup.
//
// Pengiriman memakai notify() yang sudah ada, jadi satu pengumuman otomatis
// masuk ke tiga kanal sekaligus: notifikasi in-app, push, dan WhatsApp (kalau
// WA_TIPE_AKTIF mengizinkannya). Antrean WA sudah berpacu, jadi 300 orang tua
// tidak dikirimi bertubi-tubi dalam satu detik — itu pemicu nomor diblokir.
const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { pengumumanSchema } = require('../schemas');
const { nowUtc, audit, notify } = require('../utils/workflow');

const MAKS_PENERIMA_SINKRON = 2000;

/**
 * Penerima = wali aktif yang punya anak aktif di cabang tersebut.
 * DISTINCT penting: satu wali bisa punya dua anak di cabang yang sama dan
 * hanya boleh menerima satu notifikasi, bukan dua.
 */
function penerima(cabangId) {
  const filterCabang = cabangId ? 'AND se.cabang_id=?' : '';
  const rows = db
    .prepare(
      `SELECT DISTINCT p.id, se.cabang_id
       FROM pengguna p
       JOIN wali_siswa ws ON ws.wali_pengguna_id=p.id AND ws.aktif=1
       JOIN siswa s ON s.id=ws.siswa_id AND s.status='aktif'
       JOIN siswa_enrollment se ON se.siswa_id=ws.siswa_id AND se.status='aktif'
       WHERE p.tipe='wali' AND p.status='aktif' ${filterCabang}`
    )
    .all(...(cabangId ? [cabangId] : []));

  // Satu wali bisa punya anak di dua cabang. Notifikasinya tetap satu, dan
  // cabang yang dipakai adalah cabang pertama yang ditemukan — supaya pesan
  // tidak dikirim dua kali hanya karena anaknya dua.
  const unik = new Map();
  for (const r of rows) if (!unik.has(r.id)) unik.set(r.id, { id: r.id, cabang_id: r.cabang_id });
  return [...unik.values()];
}

// Batas lingkup: admin boleh semua cabang; admin_cabang & kepsek hanya cabangnya.
function cabangDiizinkan(user, cabangId) {
  if (user.role === 'admin') return true;
  return Number(user.cabang_id) === Number(cabangId);
}

router.get('/preview', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const lingkup = req.query.lingkup === 'semua' ? 'semua' : 'cabang';
  if (lingkup === 'semua' && req.user.role !== 'admin')
    return res.status(403).json({ error: 'Hanya admin pusat yang boleh mengirim ke semua cabang' });

  const cabangId = lingkup === 'semua' ? null : Number(req.query.cabang_id || req.user.cabang_id);
  if (lingkup === 'cabang' && !cabangId) return res.status(400).json({ error: 'Pilih cabang tujuan' });
  if (lingkup === 'cabang' && !cabangDiizinkan(req.user, cabangId))
    return res.status(403).json({ error: 'Akses cabang ditolak' });

  const jumlah = penerima(cabangId).length;
  res.json({ lingkup, cabang_id: cabangId, jumlah });
});

router.post('/', auth(['admin', 'admin_cabang', 'kepsek']), validateBody(pengumumanSchema), (req, res) => {
  const d = req.body || {};
  const judul = String(d.judul || '').trim();
  const isi = String(d.isi || '').trim();
  if (judul.length < 5) return res.status(400).json({ error: 'Judul minimal 5 karakter' });
  if (judul.length > 120) return res.status(400).json({ error: 'Judul maksimal 120 karakter' });
  if (isi.length < 10) return res.status(400).json({ error: 'Isi pengumuman minimal 10 karakter' });
  if (isi.length > 2000) return res.status(400).json({ error: 'Isi pengumuman maksimal 2000 karakter' });

  const lingkup = d.lingkup === 'semua' ? 'semua' : 'cabang';
  if (lingkup === 'semua' && req.user.role !== 'admin')
    return res.status(403).json({ error: 'Hanya admin pusat yang boleh mengirim ke semua cabang' });

  const cabangId = lingkup === 'semua' ? null : Number(d.cabang_id || req.user.cabang_id);
  if (lingkup === 'cabang' && !cabangId) return res.status(400).json({ error: 'Pilih cabang tujuan' });
  if (lingkup === 'cabang' && !cabangDiizinkan(req.user, cabangId))
    return res.status(403).json({ error: 'Akses cabang ditolak' });

  const daftar = penerima(cabangId);
  // Pengumuman tanpa penerima hanya menciptakan kesan "sudah dikirim".
  // Lebih jujur menolak dan menyebut sebabnya.
  if (!daftar.length)
    return res.status(400).json({ error: 'Tidak ada orang tua aktif di cabang ini — pengumuman tidak dikirim' });
  if (daftar.length > MAKS_PENERIMA_SINKRON)
    return res.status(400).json({ error: 'Penerima terlalu banyak untuk satu pengumuman' });

  const penting = d.penting === true || d.penting === 'true' || d.penting === 1 || d.penting === '1';
  const now = nowUtc();
  const hasil = db.transaction(() => {
    const r = db
      .prepare(
        `INSERT INTO pengumuman(cabang_id,lingkup,judul,isi,penting,status,jumlah_penerima,created_by,created_at)
           VALUES(?,?,?,?,?,'mengirim',?,?,?)`
      )
      .run(cabangId, lingkup, judul, isi, penting ? 1 : 0, daftar.length, req.user.id, now);
    const id = r.lastInsertRowid;

    for (const wali of daftar) {
      // cabangId per penerima: pada pengumuman "semua cabang", pesan harus
      // keluar dari nomor cabang masing-masing — bukan satu nomor pusat.
      notify(wali.id, 'pengumuman', judul, isi.slice(0, 300), 'pengumuman', id, wali.cabang_id ?? cabangId);
    }
    db.prepare("UPDATE pengumuman SET status='terkirim',sent_at=? WHERE id=?").run(nowUtc(), id);
    return id;
  });
  const id = hasil();

  audit(req.user, 'pengumuman_kirim', 'pengumuman', id, {
    cabang_id: cabangId,
    after: { lingkup, judul, penerima: daftar.length, penting }
  });

  res.status(201).json({ success: true, id, penerima: daftar.length });
});

router.get('/', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
  const cabangFilter = req.user.role === 'admin' ? Number(req.query.cabang_id) || null : req.user.cabang_id;
  const rows = db
    .prepare(
      `SELECT p.id,p.cabang_id,p.lingkup,p.judul,p.isi,p.penting,p.status,p.jumlah_penerima,p.created_at,p.sent_at,
              c.nama AS cabang_nama, u.display_name AS pengirim,
              (SELECT COUNT(*) FROM pengumuman_read r WHERE r.pengumuman_id=p.id) AS jumlah_dibaca
       FROM pengumuman p
       LEFT JOIN cabang c ON c.id=p.cabang_id
       LEFT JOIN pengguna u ON u.id=p.created_by
       WHERE (? IS NULL OR p.cabang_id=? OR p.lingkup='semua')
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT ?`
    )
    .all(cabangFilter, cabangFilter, limit);
  res.json({ rows });
});

// Portal wali: pengumuman untuk cabang anak-anaknya + yang lingkupnya semua.
router.get('/wali', auth(['wali']), (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const rows = db
    .prepare(
      `SELECT p.id,p.judul,p.isi,p.penting,p.created_at,c.nama AS cabang_nama,
              EXISTS(SELECT 1 FROM pengumuman_read r WHERE r.pengumuman_id=p.id AND r.pengguna_id=?) AS dibaca
       FROM pengumuman p
       LEFT JOIN cabang c ON c.id=p.cabang_id
       WHERE p.status='terkirim'
         AND (
           p.lingkup='semua'
           OR p.cabang_id IN (
             SELECT se.cabang_id
             FROM wali_siswa ws
             JOIN siswa_enrollment se ON se.siswa_id=ws.siswa_id AND se.status='aktif'
             WHERE ws.wali_pengguna_id=? AND ws.aktif=1
           )
         )
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT ?`
    )
    .all(req.user.id, req.user.id, limit);
  res.json({ rows });
});

// Wali menandai pengumuman sudah dibaca. Dipanggil saat kartu/lembar dibuka,
// bukan saat daftar dimuat: "sudah dibaca" harus berarti isinya benar-benar
// dilihat.
router.post('/:id/dibaca', auth(['wali']), (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Pengumuman tidak valid' });
  const terlihat = db
    .prepare(
      `SELECT p.id FROM pengumuman p
       WHERE p.id=? AND p.status='terkirim'
         AND (p.lingkup='semua' OR p.cabang_id IN (
           SELECT se.cabang_id FROM wali_siswa ws
           JOIN siswa_enrollment se ON se.siswa_id=ws.siswa_id AND se.status='aktif'
           WHERE ws.wali_pengguna_id=? AND ws.aktif=1))`
    )
    .get(id, req.user.id);
  // 404, bukan 403: wali tidak perlu tahu pengumuman cabang lain itu ada.
  if (!terlihat) return res.status(404).json({ error: 'Pengumuman tidak ditemukan' });
  db.prepare('INSERT INTO pengumuman_read(pengumuman_id,pengguna_id,read_at) VALUES(?,?,?) ON CONFLICT DO NOTHING').run(
    id,
    req.user.id,
    nowUtc()
  );
  res.json({ success: true });
});

// Laporan pembaca untuk sekolah: siapa sudah, siapa belum.
router.get('/:id/pembaca', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const p = db.prepare('SELECT * FROM pengumuman WHERE id=?').get(Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Pengumuman tidak ditemukan' });

  // Untuk pengumuman lingkup 'semua', admin cabang tetap boleh melihat —
  // tetapi hanya wali cabangnya, karena itu yang bisa ia tindak lanjuti.
  let cabangFilter;
  if (p.lingkup === 'semua') {
    cabangFilter = req.user.role === 'admin' ? null : req.user.cabang_id;
  } else {
    if (!cabangDiizinkan(req.user, p.cabang_id)) return res.status(403).json({ error: 'Akses ditolak' });
    cabangFilter = p.cabang_id;
  }

  const target = penerima(cabangFilter);
  const ids = target.map((r) => r.id);
  const dibaca = new Map(
    db
      .prepare('SELECT pengguna_id,read_at FROM pengumuman_read WHERE pengumuman_id=?')
      .all(p.id)
      .map((r) => [r.pengguna_id, r.read_at])
  );
  const profil = ids.length
    ? db.prepare(`SELECT id,display_name,no_wa FROM pengguna WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids)
    : [];
  const penerimaRows = profil.map((u) => ({
    nama: u.display_name,
    no_wa: u.no_wa,
    dibaca_at: dibaca.get(u.id) || null
  }));
  // Yang belum membaca ditaruh paling atas: itulah yang perlu ditindaklanjuti.
  penerimaRows.sort(
    (a, b) => Number(!!a.dibaca_at) - Number(!!b.dibaca_at) || String(a.nama).localeCompare(String(b.nama))
  );

  res.json({
    id: p.id,
    judul: p.judul,
    lingkup: p.lingkup,
    total: penerimaRows.length,
    sudah: penerimaRows.filter((r) => r.dibaca_at).length,
    penerima: penerimaRows
  });
});

module.exports = router;
