const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const {
  nowUtc,
  todayWIB,
  nowTimeWIB,
  activeEnrollment,
  canAccessSiswa,
  requireCabang,
  requireActiveCabang,
  audit,
  notify,
  isDayClosed,
  rejectFutureTanggal,
  minutesBetween,
  pickupActorId,
  insertPickupLog,
  notifyKepsek
} = require('../utils/workflow');
const { validateBody } = require('../middleware/validate');
const { penjemputanManualSchema } = require('../schemas');
const { broadcastAbsensi } = require('./absensi');

function cfg(e) {
  return (
    db
      .prepare('SELECT * FROM operasional_config WHERE cabang_id=? AND jenjang_id=? AND paket=?')
      .get(e.cabang_id, e.jenjang_id, e.paket) || {}
  );
}

router.post('/scan', auth(['gerbang', 'guru', 'admin', 'admin_cabang']), (req, res) => {
  const qr = String(req.body?.qr_code || '').trim();
  if (!qr) return res.status(400).json({ error: 'QR wajib' });
  const p = db
    .prepare(
      'SELECT p.*,s.nama AS siswa_nama,s.status AS siswa_status FROM penjemput p JOIN siswa s ON s.id=p.siswa_id WHERE p.qr_code=?'
    )
    .get(qr);
  if (!p) return res.status(404).json({ error: 'Penjemput tidak terdaftar' });
  if (!p.aktif || p.siswa_status !== 'aktif')
    return res.status(400).json({ error: 'Penjemput atau siswa tidak aktif' });
  const tanggal = req.body?.tanggal || todayWIB();
  if (!rejectFutureTanggal(req, res, tanggal)) return;
  const e = activeEnrollment(p.siswa_id, tanggal);
  if (!e) return res.status(404).json({ error: 'Enrollment siswa tidak ditemukan' });
  if (!requireActiveCabang(req, res, e.cabang_id)) return;
  if (isDayClosed(tanggal, e.cabang_id))
    return res.status(400).json({ error: 'Hari sudah ditutup, tidak bisa scan penjemput' });
  const c = cfg(e),
    jam = nowTimeWIB();
  const hasEarlyRelease = db
    .prepare('SELECT 1 FROM early_release WHERE siswa_id=? AND tanggal=?')
    .get(p.siswa_id, tanggal);
  if (!c.pickup_fleksibel && jam < (c.jam_pulang || '11:00') && !hasEarlyRelease)
    return res.status(400).json({ error: 'Belum waktu pulang' });
  const absen = db.prepare('SELECT * FROM absensi WHERE siswa_id=? AND tanggal=?').get(p.siswa_id, tanggal);
  if (!absen) return res.status(400).json({ error: 'Siswa belum bisa dijemput' });
  if (absen.status === 'Menunggu') {
    const current = db.prepare('SELECT nama,relasi FROM penjemput WHERE id=?').get(absen.penjemput_id) || {
      nama: p.nama,
      relasi: p.relasi
    };
    return res.status(400).json({
      code: 'ALREADY_WAITING',
      error: 'Siswa sudah menunggu penjemput',
      penjemput: current,
      jam_tunggu: absen.jam_tunggu
    });
  }
  if (absen.status === 'Pulang')
    return res.status(400).json({ code: 'ALREADY_LEFT', error: 'Siswa sudah pulang', jam_pulang: absen.jam_pulang });
  if (!['Hadir', 'Terlambat'].includes(absen.status))
    return res.status(400).json({ error: 'Siswa belum bisa dijemput' });
  const beforeScan = { status: absen.status };
  db.prepare("UPDATE absensi SET status='Menunggu',penjemput_id=?,jam_tunggu=?,updated_at=? WHERE id=?").run(
    p.id,
    jam,
    nowUtc(),
    absen.id
  );
  const gurus = db.prepare('SELECT pengguna_id FROM guru_rombel WHERE rombel_id=?').all(e.rombel_id);
  for (const g of gurus)
    notify(
      g.pengguna_id,
      'pickup_waiting',
      'Penjemput tiba',
      `${p.siswa_nama} dijemput oleh ${p.nama}`,
      'absensi',
      absen.id,
      e.cabang_id
    );
  audit(req.user, 'pickup_scan', 'absensi', absen.id, {
    cabang_id: e.cabang_id,
    before: beforeScan,
    after: { status: 'Menunggu', penjemput_id: p.id, penjemput_nama: p.nama, jam_tunggu: jam }
  });
  broadcastAbsensi(e.cabang_id);
  res.json({
    success: true,
    siswa: { id: p.siswa_id, nama: p.siswa_nama, rombel: e.rombel_nama },
    penjemput: { nama: p.nama, relasi: p.relasi },
    jam_tunggu: jam
  });
});

router.post('/pulang', auth(['gerbang', 'guru', 'admin', 'admin_cabang']), (req, res) => {
  const ids = Array.isArray(req.body?.siswa_ids) ? req.body.siswa_ids : [];
  if (!ids.length) return res.status(400).json({ error: 'Pilih siswa' });
  const tanggal = req.body?.tanggal || todayWIB(),
    jam = nowTimeWIB();
  if (!rejectFutureTanggal(req, res, tanggal)) return;
  let count = 0;
  const cabangIds = new Set();
  const tx = db.transaction(() => {
    for (const id of ids) {
      const access = canAccessSiswa(req.user, id, { tanggal });
      if (access === false) throw Object.assign(new Error('Akses siswa ditolak'), { status: 403 });
      if (!access) throw Object.assign(new Error('Siswa tidak ditemukan'), { status: 404 });
      const cabang = db.prepare('SELECT aktif FROM cabang WHERE id=?').get(access.enrollment.cabang_id);
      if (!cabang?.aktif)
        throw Object.assign(new Error('Cabang nonaktif tidak bisa menerima transaksi baru'), { status: 400 });
      if (isDayClosed(tanggal, access.enrollment.cabang_id))
        throw Object.assign(new Error('Hari sudah ditutup, tidak bisa konfirmasi pulang'), { status: 400 });
      const absen = db
        .prepare("SELECT * FROM absensi WHERE siswa_id=? AND tanggal=? AND status='Menunggu'")
        .get(id, tanggal);
      if (!absen) throw Object.assign(new Error('Siswa belum menunggu'), { status: 400 });
      db.prepare("UPDATE absensi SET status='Pulang',jam_pulang=?,updated_at=? WHERE id=?").run(
        jam,
        nowUtc(),
        absen.id
      );
      insertPickupLog(absen, req.user.id, access.enrollment.cabang_id, jam, 'manual');
      audit(req.user, 'handoff', 'absensi', absen.id, {
        cabang_id: access.enrollment.cabang_id,
        before: { status: 'Menunggu', penjemput_id: absen.penjemput_id },
        after: { status: 'Pulang', jam_pulang: jam }
      });
      cabangIds.add(access.enrollment.cabang_id);
      count++;
    }
  });
  try {
    tx();
    for (const cId of cabangIds) {
      broadcastAbsensi(cId);
    }
    res.json({ success: true, count, jam_pulang: jam });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Jalan keluar ketika QR penjemput tidak terbaca / kartu hilang: petugas
// memilih siswa + penjemput terdaftar dan menyebut alasan. Guard-nya sama persis
// dengan scan biasa; sisanya dicatat sebagai audit + notifikasi karena jalur ini
// melewati pemindaian.
router.post(
  '/scan-manual',
  auth(['gerbang', 'guru', 'admin', 'admin_cabang']),
  validateBody(penjemputanManualSchema),
  (req, res) => {
    const d = req.body || {};
    const siswaId = d.siswa_id;
    const tanggal = d.tanggal || todayWIB();
    if (!rejectFutureTanggal(req, res, tanggal)) return;
    const access = canAccessSiswa(req.user, siswaId, { tanggal });
    if (access === false) return res.status(403).json({ error: 'Akses siswa ditolak' });
    if (!access) return res.status(404).json({ error: 'Siswa tidak ditemukan' });
    if (access.siswa.status !== 'aktif') return res.status(400).json({ error: 'Siswa nonaktif tidak bisa dijemput' });
    if (!requireActiveCabang(req, res, access.enrollment.cabang_id)) return;
    if (isDayClosed(tanggal, access.enrollment.cabang_id))
      return res.status(400).json({ error: 'Hari sudah ditutup, tidak bisa konfirmasi serah terima' });

    const penjemput = db.prepare('SELECT * FROM penjemput WHERE id=? AND siswa_id=?').get(d.penjemput_id, siswaId);
    if (!penjemput) return res.status(404).json({ error: 'Penjemput tidak ditemukan untuk siswa ini' });
    if (!penjemput.aktif) return res.status(400).json({ error: 'Penjemput sudah dinonaktifkan' });

    const e = access.enrollment;
    const c = cfg(e),
      jam = nowTimeWIB();
    const hasEarlyRelease = db
      .prepare('SELECT 1 FROM early_release WHERE siswa_id=? AND tanggal=?')
      .get(siswaId, tanggal);
    if (!c.pickup_fleksibel && jam < (c.jam_pulang || '11:00') && !hasEarlyRelease)
      return res.status(400).json({ error: 'Belum waktu pulang' });

    const absen = db.prepare('SELECT * FROM absensi WHERE siswa_id=? AND tanggal=?').get(siswaId, tanggal);
    if (!absen) return res.status(400).json({ error: 'Siswa belum bisa dijemput' });
    if (absen.status === 'Menunggu')
      return res.status(400).json({
        code: 'ALREADY_WAITING',
        error: 'Siswa sudah menunggu penjemput',
        jam_tunggu: absen.jam_tunggu
      });
    if (absen.status === 'Pulang')
      return res.status(400).json({
        code: 'ALREADY_LEFT',
        error: 'Siswa sudah pulang',
        jam_pulang: absen.jam_pulang
      });
    if (!['Hadir', 'Terlambat'].includes(absen.status))
      return res.status(400).json({ error: 'Siswa belum bisa dijemput' });

    const catatan = `Serah terima manual: ${d.alasan}`;
    db.prepare(
      "UPDATE absensi SET status='Menunggu',penjemput_id=?,jam_tunggu=?,catatan=?,updated_at=? WHERE id=?"
    ).run(penjemput.id, jam, catatan, nowUtc(), absen.id);

    const gurus = db.prepare('SELECT pengguna_id FROM guru_rombel WHERE rombel_id=?').all(e.rombel_id);
    for (const g of gurus)
      notify(
        g.pengguna_id,
        'pickup_waiting',
        'Penjemput tiba (manual)',
        `${access.siswa.nama} dijemput oleh ${penjemput.nama}. Alasan: ${d.alasan}`,
        'absensi',
        absen.id,
        e.cabang_id
      );
    notifyKepsek(
      e.cabang_id,
      'pickup_manual',
      `Serah terima manual: ${access.siswa.nama}`,
      `${penjemput.nama} - ${d.alasan}`,
      'absensi',
      absen.id,
      req.user.id
    );
    audit(req.user, 'pickup_scan_manual', 'absensi', absen.id, {
      cabang_id: e.cabang_id,
      before: { status: absen.status },
      after: { status: 'Menunggu', penjemput_id: penjemput.id, penjemput_nama: penjemput.nama, alasan: d.alasan }
    });
    broadcastAbsensi(e.cabang_id);
    res.json({
      success: true,
      manual: true,
      siswa: { id: siswaId, nama: access.siswa.nama, rombel: e.rombel_nama },
      penjemput: { nama: penjemput.nama, relasi: penjemput.relasi },
      jam_tunggu: jam
    });
  }
);

// Durasi tunggu anak di gerbang: data sudah dikumpulkan di penjemputan_log
// sejak awal, sekarang dipakai untuk laporan per hari.
router.get('/rekap', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const cabangId = req.user.role === 'admin' ? req.query.cabang_id : req.user.cabang_id;
  if (!cabangId) return res.status(400).json({ error: 'Cabang wajib' });
  if (!requireCabang(req, res, cabangId)) return;
  const tanggal = req.query.tanggal || todayWIB();
  const stat = db
    .prepare(
      `SELECT COUNT(*) AS total,
              AVG(durasi_menit) AS rata2,
              MAX(durasi_menit) AS terlama,
              MIN(durasi_menit) AS tercepat,
              SUM(CASE WHEN durasi_menit IS NULL THEN 1 ELSE 0 END) AS tanpa_durasi
       FROM penjemputan_log WHERE cabang_id=? AND tanggal=?`
    )
    .get(cabangId, tanggal);
  const terlama = db
    .prepare(
      `SELECT pl.durasi_menit,pl.jam_scan,pl.jam_pulang,pl.sumber,s.nama AS siswa_nama,p.nama AS penjemput_nama
       FROM penjemputan_log pl
       LEFT JOIN siswa s ON s.id=pl.siswa_id
       LEFT JOIN penjemput p ON p.id=pl.penjemput_id
       WHERE pl.cabang_id=? AND pl.tanggal=? AND pl.durasi_menit IS NOT NULL
       ORDER BY pl.durasi_menit DESC LIMIT 5`
    )
    .all(cabangId, tanggal);
  res.json({
    tanggal,
    cabang_id: Number(cabangId),
    total: stat.total,
    rata2_menit: stat.rata2 === null ? null : Math.round(stat.rata2),
    terlama_menit: stat.terlama,
    tercepat_menit: stat.tercepat,
    tanpa_durasi: stat.tanpa_durasi,
    terlama
  });
});

module.exports = router;
