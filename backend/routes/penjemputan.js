const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { nowUtc, todayWIB, nowTimeWIB, activeEnrollment, canAccessSiswa, requireActiveCabang, audit, notify, isDayClosed } = require('../utils/workflow');
const { broadcastAbsensi } = require('./absensi');

function cfg(e) {
  return db.prepare('SELECT * FROM operasional_config WHERE cabang_id=? AND jenjang_id=? AND paket=?').get(e.cabang_id, e.jenjang_id, e.paket) || {};
}
function minutesBetween(start, end) {
  if (!start || !end) return null;
  const [sh, sm] = String(start).split(':').map(Number);
  const [eh, em] = String(end).split(':').map(Number);
  if ([sh, sm, eh, em].some(Number.isNaN)) return null;
  return Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
}
function pickupActorId(actorId) {
  if (!actorId) return null;
  return db.prepare("SELECT 1 FROM pengguna WHERE id=? AND role IN ('guru','admin','admin_cabang','gerbang')").get(actorId) ? actorId : null;
}
function insertPickupLog(absen, actorId, cabangId, jamPulang, sumber) {
  db.prepare(`INSERT INTO penjemputan_log(absensi_id,siswa_id,penjemput_id,guru_id,cabang_id,tanggal,jam_scan,jam_pulang,durasi_menit,sumber,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .run(absen.id, absen.siswa_id, absen.penjemput_id || null, pickupActorId(actorId), cabangId, absen.tanggal, absen.jam_tunggu || null, jamPulang, minutesBetween(absen.jam_tunggu, jamPulang), sumber, nowUtc());
}

router.post('/scan', auth(['gerbang','guru','admin','admin_cabang']), (req, res) => {
  const qr = String(req.body?.qr_code || '').trim();
  if (!qr) return res.status(400).json({ error: 'QR wajib' });
  const p = db.prepare('SELECT p.*,s.nama AS siswa_nama,s.status AS siswa_status FROM penjemput p JOIN siswa s ON s.id=p.siswa_id WHERE p.qr_code=?').get(qr);
  if (!p) return res.status(404).json({ error: 'Penjemput tidak terdaftar' });
  if (!p.aktif || p.siswa_status !== 'aktif') return res.status(400).json({ error: 'Penjemput atau siswa tidak aktif' });
  const tanggal = req.body?.tanggal || todayWIB();
  const e = activeEnrollment(p.siswa_id, tanggal);
  if (!e) return res.status(404).json({ error: 'Enrollment siswa tidak ditemukan' });
  if (!requireActiveCabang(req, res, e.cabang_id)) return;
  if (isDayClosed(tanggal, e.cabang_id)) return res.status(400).json({ error: 'Hari sudah ditutup, tidak bisa scan penjemput' });
  const c = cfg(e), jam = nowTimeWIB();
  const hasEarlyRelease = db.prepare('SELECT 1 FROM early_release WHERE siswa_id=? AND tanggal=?').get(p.siswa_id, tanggal);
  if (!c.pickup_fleksibel && jam < (c.jam_pulang || '11:00') && !hasEarlyRelease) return res.status(400).json({ error: 'Belum waktu pulang' });
  const absen = db.prepare('SELECT * FROM absensi WHERE siswa_id=? AND tanggal=?').get(p.siswa_id, tanggal);
  if (!absen) return res.status(400).json({ error: 'Siswa belum bisa dijemput' });
  if (absen.status === 'Menunggu') {
    const current = db.prepare('SELECT nama,relasi FROM penjemput WHERE id=?').get(absen.penjemput_id) || { nama: p.nama, relasi: p.relasi };
    return res.status(400).json({ code: 'ALREADY_WAITING', error: 'Siswa sudah menunggu penjemput', penjemput: current, jam_tunggu: absen.jam_tunggu });
  }
  if (absen.status === 'Pulang') return res.status(400).json({ code: 'ALREADY_LEFT', error: 'Siswa sudah pulang', jam_pulang: absen.jam_pulang });
  if (!['Hadir','Terlambat'].includes(absen.status)) return res.status(400).json({ error: 'Siswa belum bisa dijemput' });
  const beforeScan = { status: absen.status };
  db.prepare("UPDATE absensi SET status='Menunggu',penjemput_id=?,jam_tunggu=?,updated_at=? WHERE id=?").run(p.id, jam, nowUtc(), absen.id);
  const gurus = db.prepare('SELECT pengguna_id FROM guru_rombel WHERE rombel_id=?').all(e.rombel_id);
  for (const g of gurus) notify(g.pengguna_id, 'pickup_waiting', 'Penjemput tiba', `${p.siswa_nama} dijemput oleh ${p.nama}`, 'absensi', absen.id, e.cabang_id);
  audit(req.user, 'pickup_scan', 'absensi', absen.id, { cabang_id: e.cabang_id, before: beforeScan, after: { status: 'Menunggu', penjemput_id: p.id, penjemput_nama: p.nama, jam_tunggu: jam } });
  broadcastAbsensi(e.cabang_id);
  res.json({ success: true, siswa: { id: p.siswa_id, nama: p.siswa_nama, rombel: e.rombel_nama }, penjemput: { nama: p.nama, relasi: p.relasi }, jam_tunggu: jam });
});

router.post('/pulang', auth(['gerbang','guru','admin','admin_cabang']), (req, res) => {
  const ids = Array.isArray(req.body?.siswa_ids) ? req.body.siswa_ids : [];
  if (!ids.length) return res.status(400).json({ error: 'Pilih siswa' });
  const tanggal = req.body?.tanggal || todayWIB(), jam = nowTimeWIB();
  let count = 0;
  const cabangIds = new Set();
  const tx = db.transaction(() => {
    for (const id of ids) {
      const access = canAccessSiswa(req.user, id, { tanggal });
      if (access === false) throw Object.assign(new Error('Akses siswa ditolak'), { status: 403 });
      if (!access) throw Object.assign(new Error('Siswa tidak ditemukan'), { status: 404 });
      const cabang = db.prepare('SELECT aktif FROM cabang WHERE id=?').get(access.enrollment.cabang_id);
      if (!cabang?.aktif) throw Object.assign(new Error('Cabang nonaktif tidak bisa menerima transaksi baru'), { status: 400 });
      if (isDayClosed(tanggal, access.enrollment.cabang_id)) throw Object.assign(new Error('Hari sudah ditutup, tidak bisa konfirmasi pulang'), { status: 400 });
      const absen = db.prepare("SELECT * FROM absensi WHERE siswa_id=? AND tanggal=? AND status='Menunggu'").get(id, tanggal);
      if (!absen) throw Object.assign(new Error('Siswa belum menunggu'), { status: 400 });
      db.prepare("UPDATE absensi SET status='Pulang',jam_pulang=?,updated_at=? WHERE id=?").run(jam, nowUtc(), absen.id);
      insertPickupLog(absen, req.user.id, access.enrollment.cabang_id, jam, 'manual');
      audit(req.user, 'handoff', 'absensi', absen.id, { cabang_id: access.enrollment.cabang_id, before: { status: 'Menunggu', penjemput_id: absen.penjemput_id }, after: { status: 'Pulang', jam_pulang: jam } });
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
  }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

module.exports = router;
