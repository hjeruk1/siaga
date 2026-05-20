const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { nowUtc, todayWIB, nowTimeWIB, activeEnrollment, canAccessSiswa, siswaScopeSql, requireCabang, requireActiveCabang, audit, isSchoolDay, isDayClosed } = require('../utils/workflow');

function configFor(e) {
  return db.prepare('SELECT * FROM operasional_config WHERE cabang_id=? AND jenjang_id=? AND paket=?').get(e.cabang_id, e.jenjang_id, e.paket) || {};
}
function late(jam, cfg) {
  if (!cfg.hitung_terlambat) return false;
  return String(jam) > String(cfg.jam_masuk || '08:00');
}
function ensureAbsensi(siswaId, tanggal) {
  const e = activeEnrollment(siswaId, tanggal);
  if (!e) return null;
  const existing = db.prepare('SELECT * FROM absensi WHERE siswa_id=? AND tanggal=?').get(siswaId, tanggal);
  if (existing) return { row: existing, enrollment: e };
  const r = db.prepare(`INSERT INTO absensi(siswa_id,cabang_id,jenjang_id,rombel_id,paket,tanggal,status,created_at,updated_at)
    VALUES(?,?,?,?,?,?,'Belum',?,?)`).run(siswaId, e.cabang_id, e.jenjang_id, e.rombel_id, e.paket, tanggal, nowUtc(), nowUtc());
  return { row: db.prepare('SELECT * FROM absensi WHERE id=?').get(r.lastInsertRowid), enrollment: e };
}
function canMarkArrival(status) {
  return ['Belum', 'Absen'].includes(status);
}
function canSetKeterangan(status) {
  return !['Hadir', 'Terlambat', 'Menunggu', 'Pulang'].includes(status);
}
function normalizeNfcToken(raw) {
  const value = String(raw || '').trim().toUpperCase();
  const match = value.match(/SIAGA-STU-[A-F0-9]{10}/);
  return match ? match[0] : value;
}
function maskToken(token) {
  if (!token) return null;
  return token.length > 8 ? `${token.slice(0, 10)}...${token.slice(-4)}` : '***';
}
function logNfc({ siswaId = null, penggunaId = null, cabangId = null, action, status, reason = null, token = null, tab = null, tanggal = null, jam = null }) {
  db.prepare(`INSERT INTO nfc_scan_log(siswa_id,pengguna_id,cabang_id,action,status,reason,token_masked,tab,tanggal,jam,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .run(siswaId, penggunaId, cabangId, action || 'unknown', status, reason, maskToken(token), tab, tanggal, jam, nowUtc());
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
  try {
    return db.prepare('SELECT 1 FROM guru WHERE id=?').get(actorId) ? actorId : null;
  } catch {
    return actorId;
  }
}
function insertPickupLog(absen, actorId, cabangId, jamPulang, sumber) {
  db.prepare(`INSERT INTO penjemputan_log(absensi_id,siswa_id,penjemput_id,guru_id,cabang_id,tanggal,jam_scan,jam_pulang,durasi_menit,sumber,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .run(absen.id, absen.siswa_id, absen.penjemput_id || null, pickupActorId(actorId), cabangId, absen.tanggal, absen.jam_tunggu || null, jamPulang, minutesBetween(absen.jam_tunggu, jamPulang), sumber, nowUtc());
}

router.get('/today', auth(), (req, res) => {
  const tanggal = req.query.tanggal || todayWIB();
  const scope = siswaScopeSql(req.user, 's', req.query.cabang_id);
  const rows = db.prepare(`
    SELECT DISTINCT s.id AS siswa_id,s.nama,s.foto,se_scope.cabang_id,se_scope.rombel_id,se_scope.jenjang_id,se_scope.paket,
      c.nama AS cabang_nama,r.nama AS rombel_nama,j.nama AS jenjang_nama,
      COALESCE(a.status,'Belum') AS status,a.jam_masuk,a.jam_tunggu,a.jam_pulang,p.nama AS penjemput_nama
    FROM siswa s
    ${scope.join}
    JOIN cabang c ON c.id=se_scope.cabang_id
    JOIN rombel r ON r.id=se_scope.rombel_id
    JOIN jenjang j ON j.id=se_scope.jenjang_id
    LEFT JOIN absensi a ON a.siswa_id=s.id AND a.tanggal=?
    LEFT JOIN penjemput p ON p.id=a.penjemput_id
    WHERE ${scope.where} AND s.status='aktif'
    ORDER BY c.nama,r.nama,s.nama
  `).all(tanggal, ...scope.params);
  const cabangId = req.query.cabang_id || (req.user.role !== 'admin' ? req.user.cabang_id : null);
  const schoolDay = cabangId ? isSchoolDay(tanggal, cabangId) : null;
  res.json({ rows, is_school_day: schoolDay, tanggal });
});

router.post('/checkin', auth(['guru','admin','admin_cabang']), (req, res) => {
  const tanggal = req.body?.tanggal || todayWIB();
  const siswaId = req.body?.siswa_id;
  const access = canAccessSiswa(req.user, siswaId, { tanggal });
  if (access === false) return res.status(403).json({ error: 'Akses siswa ditolak' });
  if (!access) return res.status(404).json({ error: 'Siswa tidak ditemukan' });
  if (access.siswa.status !== 'aktif') return res.status(400).json({ error: 'Siswa nonaktif tidak bisa check-in' });
  if (!requireActiveCabang(req, res, access.enrollment.cabang_id)) return;
  if (!isSchoolDay(tanggal, access.enrollment.cabang_id)) return res.status(400).json({ error: 'Hari ini libur, tidak bisa check-in' });
  if (isDayClosed(tanggal, access.enrollment.cabang_id)) return res.status(400).json({ error: 'Hari sudah ditutup, tidak bisa check-in' });
  const item = ensureAbsensi(siswaId, tanggal);
  if (!canMarkArrival(item.row.status)) return res.status(400).json({ error: `Status ${item.row.status} tidak bisa diubah menjadi hadir` });
  const jam = nowTimeWIB();
  const status = late(jam, configFor(item.enrollment)) ? 'Terlambat' : 'Hadir';
  const beforeStatus = item.row.status;
  db.prepare('UPDATE absensi SET status=?,jam_masuk=?,manual=?,updated_at=? WHERE id=?')
    .run(status, jam, req.body?.manual ? 1 : 0, nowUtc(), item.row.id);
  audit(req.user, 'checkin', 'absensi', item.row.id, { cabang_id: item.enrollment.cabang_id, before: { status: beforeStatus }, after: { status, jam_masuk: jam } });
  res.json({ success: true, status, jam_masuk: jam });
});

router.post('/keterangan', auth(['guru','admin','admin_cabang']), (req, res) => {
  const tanggal = req.body?.tanggal || todayWIB();
  const { siswa_id, status, catatan } = req.body || {};
  if (!['Izin','Sakit','Absen'].includes(status)) return res.status(400).json({ error: 'Status tidak valid' });
  const access = canAccessSiswa(req.user, siswa_id, { tanggal });
  if (access === false) return res.status(403).json({ error: 'Akses siswa ditolak' });
  if (!access) return res.status(404).json({ error: 'Siswa tidak ditemukan' });
  if (access.siswa.status !== 'aktif') return res.status(400).json({ error: 'Siswa nonaktif tidak bisa diubah status absensinya' });
  if (!requireActiveCabang(req, res, access.enrollment.cabang_id)) return;
  if (isDayClosed(tanggal, access.enrollment.cabang_id)) return res.status(400).json({ error: 'Hari sudah ditutup, tidak bisa ubah keterangan' });
  const item = ensureAbsensi(siswa_id, tanggal);
  if (!canSetKeterangan(item.row.status)) return res.status(400).json({ error: `Status ${item.row.status} tidak boleh ditimpa oleh keterangan` });
  db.prepare('UPDATE absensi SET status=?,catatan=?,manual=1,updated_at=? WHERE id=?').run(status, catatan || null, nowUtc(), item.row.id);
  audit(req.user, 'set_keterangan', 'absensi', item.row.id, { cabang_id: item.enrollment.cabang_id, after: { status, catatan } });
  res.json({ success: true });
});

router.post('/nfc-scan', auth(['guru','admin','admin_cabang']), (req, res) => {
  const tanggal = req.body?.tanggal || todayWIB();
  const jam = nowTimeWIB();
  const action = req.body?.action === 'pulang' ? 'pulang' : 'checkin';
  const token = normalizeNfcToken(req.body?.token);
  const tab = req.body?.tab || null;
  const fail = (status, message, extras = {}) => {
    logNfc({ penggunaId: req.user.id, action, status: 'failed', reason: message, token, tab, tanggal, jam, ...extras });
    return res.status(status).json({ error: message, ...extras });
  };
  if (!/^SIAGA-STU-[A-F0-9]{10}$/.test(token)) return fail(400, 'Format token NFC tidak valid');
  const siswa = db.prepare('SELECT * FROM siswa WHERE nfc_token=?').get(token);
  if (!siswa) return fail(404, 'Kartu NFC tidak dikenal');
  const access = canAccessSiswa(req.user, siswa.id, { tanggal });
  if (access === false) return fail(403, 'Akses siswa ditolak', { siswa_id: siswa.id });
  if (!access) return fail(404, 'Enrollment siswa tidak ditemukan', { siswa_id: siswa.id });
  if (siswa.status !== 'aktif') return fail(400, 'Siswa nonaktif tidak bisa diproses', { siswa_id: siswa.id, cabangId: access.enrollment.cabang_id });
  if (!requireActiveCabang(req, res, access.enrollment.cabang_id)) return;

  try {
    if (isDayClosed(tanggal, access.enrollment.cabang_id)) return fail(400, 'Hari sudah ditutup, tidak bisa proses NFC', { siswa_id: siswa.id, cabangId: access.enrollment.cabang_id });
    if (action === 'checkin') {
      if (!isSchoolDay(tanggal, access.enrollment.cabang_id)) return fail(400, 'Hari ini libur, tidak bisa check-in', { siswa_id: siswa.id, cabangId: access.enrollment.cabang_id });
      const item = ensureAbsensi(siswa.id, tanggal);
      if (!canMarkArrival(item.row.status)) return fail(400, `Status ${item.row.status} tidak bisa diubah menjadi hadir`, { siswa_id: siswa.id, cabangId: access.enrollment.cabang_id });
      const status = late(jam, configFor(item.enrollment)) ? 'Terlambat' : 'Hadir';
      const beforeStatusNfc = item.row.status;
      db.prepare('UPDATE absensi SET status=?,jam_masuk=?,manual=0,updated_at=? WHERE id=?')
        .run(status, jam, nowUtc(), item.row.id);
      logNfc({ siswaId: siswa.id, penggunaId: req.user.id, cabangId: item.enrollment.cabang_id, action, status: 'success', token, tab, tanggal, jam });
      audit(req.user, 'nfc_checkin', 'absensi', item.row.id, { cabang_id: item.enrollment.cabang_id, before: { status: beforeStatusNfc }, after: { status, jam_masuk: jam } });
      return res.json({ success: true, action, siswa: { id: siswa.id, nama: siswa.nama }, status, jam_masuk: jam });
    }

    const absen = db.prepare("SELECT * FROM absensi WHERE siswa_id=? AND tanggal=? AND status='Menunggu'").get(siswa.id, tanggal);
    if (!absen) return fail(400, 'Siswa belum berstatus Menunggu, tidak bisa tap pulang', { siswa_id: siswa.id, cabangId: access.enrollment.cabang_id });
    db.prepare("UPDATE absensi SET status='Pulang',jam_pulang=?,updated_at=? WHERE id=?").run(jam, nowUtc(), absen.id);
    insertPickupLog(absen, req.user.id, access.enrollment.cabang_id, jam, 'nfc');
    logNfc({ siswaId: siswa.id, penggunaId: req.user.id, cabangId: access.enrollment.cabang_id, action, status: 'success', token, tab, tanggal, jam });
    audit(req.user, 'nfc_handoff', 'absensi', absen.id, { cabang_id: access.enrollment.cabang_id, before: { status: 'Menunggu', penjemput_id: absen.penjemput_id }, after: { status: 'Pulang', jam_pulang: jam } });
    res.json({ success: true, action, siswa: { id: siswa.id, nama: siswa.nama }, status: 'Pulang', jam_pulang: jam });
  } catch (e) {
    return fail(500, e.message || 'Gagal memproses NFC', { siswa_id: siswa.id, cabangId: access.enrollment.cabang_id });
  }
});

router.post('/early-release', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const d = req.body || {};
  if (!d.siswa_id || !d.tanggal || !d.alasan) return res.status(400).json({ error: 'Siswa, tanggal, dan alasan wajib' });
  const access = canAccessSiswa(req.user, d.siswa_id, { tanggal: d.tanggal });
  if (access === false) return res.status(403).json({ error: 'Akses siswa ditolak' });
  if (!access) return res.status(404).json({ error: 'Siswa tidak ditemukan' });
  if (!requireActiveCabang(req, res, access.enrollment.cabang_id)) return;
  try {
    const r = db.prepare('INSERT INTO early_release(siswa_id,cabang_id,tanggal,alasan,created_by,created_at) VALUES(?,?,?,?,?,?)')
      .run(d.siswa_id, access.enrollment.cabang_id, d.tanggal, d.alasan, req.user.id, nowUtc());
    audit(req.user, 'create_early_release', 'early_release', r.lastInsertRowid, { cabang_id: access.enrollment.cabang_id, after: d });
    res.json({ id: r.lastInsertRowid });
  } catch {
    res.status(400).json({ error: 'Izin pulang dini sudah ada untuk siswa ini di tanggal tersebut' });
  }
});

router.get('/early-release', auth(['admin', 'admin_cabang', 'kepsek', 'guru', 'gerbang']), (req, res) => {
  const cabangId = req.user.role === 'admin' ? req.query.cabang_id : req.user.cabang_id;
  const tanggal = req.query.tanggal || todayWIB();
  if (!cabangId) return res.json([]);
  if (!requireCabang(req, res, cabangId)) return;
  res.json(db.prepare(`
    SELECT er.*,s.nama AS siswa_nama,p.display_name AS created_by_name
    FROM early_release er JOIN siswa s ON s.id=er.siswa_id LEFT JOIN pengguna p ON p.id=er.created_by
    WHERE er.cabang_id=? AND er.tanggal=? ORDER BY er.created_at DESC
  `).all(cabangId, tanggal));
});

router.delete('/early-release/:id', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const er = db.prepare('SELECT * FROM early_release WHERE id=?').get(req.params.id);
  if (!er) return res.status(404).json({ error: 'Izin tidak ditemukan' });
  if (!requireCabang(req, res, er.cabang_id)) return;
  db.prepare('DELETE FROM early_release WHERE id=?').run(req.params.id);
  audit(req.user, 'delete_early_release', 'early_release', req.params.id, { cabang_id: er.cabang_id, before: er });
  res.json({ success: true });
});

router.post('/tutup-hari', auth(['admin', 'admin_cabang', 'kepsek', 'guru']), (req, res) => {
  const tanggal = req.body?.tanggal || todayWIB();
  const cabangId = req.user.role === 'admin' ? req.body.cabang_id : req.user.cabang_id;
  if (!cabangId) return res.status(400).json({ error: 'Cabang wajib' });
  if (!requireActiveCabang(req, res, cabangId)) return;
  if (isDayClosed(tanggal, cabangId)) return res.status(400).json({ error: 'Hari sudah ditutup sebelumnya' });
  const students = db.prepare(`
    SELECT s.id AS siswa_id,s.nama,se.cabang_id,se.jenjang_id,se.rombel_id,se.paket,
           a.id AS absensi_id,COALESCE(a.status,'Belum') AS status
    FROM siswa s
    JOIN siswa_enrollment se ON se.siswa_id=s.id
      AND se.tanggal_mulai<=?
      AND (se.tanggal_selesai IS NULL OR se.tanggal_selesai>=?)
    LEFT JOIN absensi a ON a.siswa_id=s.id AND a.tanggal=?
    WHERE s.status='aktif' AND se.cabang_id=?
  `).all(tanggal, tanggal, tanggal, cabangId);
  const tx = db.transaction(() => {
    const details = [];
    for (const r of students) {
      let absensiId = r.absensi_id;
      if (!absensiId) {
        const created = db.prepare(`INSERT INTO absensi(siswa_id,cabang_id,jenjang_id,rombel_id,paket,tanggal,status,created_at,updated_at)
          VALUES(?,?,?,?,?,?,'Belum',?,?)`)
          .run(r.siswa_id, r.cabang_id, r.jenjang_id, r.rombel_id, r.paket, tanggal, nowUtc(), nowUtc());
        absensiId = created.lastInsertRowid;
      }
      if (r.status === 'Belum') {
        db.prepare("UPDATE absensi SET status='Absen',updated_at=? WHERE id=?").run(nowUtc(), absensiId);
      }
      details.push({ id: absensiId, nama: r.nama, status: r.status });
    }
    const summary = JSON.stringify({
      total: details.length,
      set_absen: details.filter(r=>r.status==='Belum').length,
      masih_menunggu: details.filter(r=>r.status==='Menunggu').length,
      masih_hadir: details.filter(r=>['Hadir','Terlambat'].includes(r.status)).length
    });
    db.prepare('INSERT INTO tutup_hari(cabang_id,tanggal,closed_by,closed_at,summary) VALUES(?,?,?,?,?)')
      .run(cabangId, tanggal, req.user.id, nowUtc(), summary);
    audit(req.user, 'tutup_hari', 'tutup_hari', null, { cabang_id: cabangId, after: { tanggal, summary } });
    return details;
  });
  try {
    const details = tx();
    res.json({ success: true, tanggal, cabang_id: cabangId, remaining_count: details.length, details });
  }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/tutup-hari/status', auth(), (req, res) => {
  const cabangId = req.user.role === 'admin' ? req.query.cabang_id : req.user.cabang_id;
  const tanggal = req.query.tanggal || todayWIB();
  if (!cabangId) return res.json({ closed: false });
  const row = db.prepare('SELECT * FROM tutup_hari WHERE cabang_id=? AND tanggal=?').get(cabangId, tanggal);
  res.json({ closed: !!row, detail: row || null });
});

module.exports = router;
