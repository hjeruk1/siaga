const router = require('express').Router();
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const auth = require('../middleware/auth');
const { uploadImage, saveSquareJpeg, ensureDir } = require('../utils/imageUpload');
const { nowUtc, todayWIB, activeEnrollment, siswaScopeSql, requireCabang, requireActiveCabang, audit } = require('../utils/workflow');

const FOTO_DIR = path.join(__dirname, '../uploads/foto');
ensureDir(FOTO_DIR);

function makeQr(siswaId) {
  let qr;
  do { qr = `QR-${siswaId}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`; }
  while (db.prepare('SELECT 1 FROM penjemput WHERE qr_code=?').get(qr));
  return qr;
}

function makeNfc() {
  let token;
  do { token = `SIAGA-STU-${crypto.randomBytes(5).toString('hex').toUpperCase()}`; }
  while (db.prepare('SELECT 1 FROM siswa WHERE nfc_token=?').get(token));
  return token;
}

function dateBefore(date) {
  const d = new Date(`${date}T00:00:00+07:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

const SISWA_STATUSES = new Set(['aktif', 'keluar', 'lulus']);

function normalizeSiswaStatus(value, fallback = 'aktif') {
  const status = value || fallback;
  if (!SISWA_STATUSES.has(status)) {
    const error = new Error('Status siswa tidak valid');
    error.statusCode = 400;
    throw error;
  }
  return status;
}

function managementEnrollment(siswaId) {
  return activeEnrollment(siswaId) || db.prepare(`
    SELECT e.*,c.nama AS cabang_nama,c.kode AS cabang_kode,j.nama AS jenjang_nama,j.tipe AS jenjang_tipe,r.nama AS rombel_nama
    FROM siswa_enrollment e
    JOIN cabang c ON c.id=e.cabang_id
    JOIN jenjang j ON j.id=e.jenjang_id
    JOIN rombel r ON r.id=e.rombel_id
    WHERE e.siswa_id=? AND e.status='aktif'
    ORDER BY e.tanggal_mulai DESC,e.id DESC LIMIT 1
  `).get(siswaId);
}

router.get('/', auth(), (req, res) => {
  const scope = siswaScopeSql(req.user, 's', req.query.cabang_id);
  const status = req.query.status || 'aktif';
  const rows = db.prepare(`
    SELECT DISTINCT s.*,se_scope.cabang_id,se_scope.rombel_id,se_scope.jenjang_id,se_scope.paket,
           c.nama AS cabang_nama,j.nama AS jenjang_nama,r.nama AS rombel_nama,
           (SELECT COUNT(*) FROM penjemput p WHERE p.siswa_id=s.id AND p.aktif=1) AS jumlah_penjemput
    FROM siswa s
    ${scope.join}
    LEFT JOIN cabang c ON c.id=se_scope.cabang_id
    LEFT JOIN jenjang j ON j.id=se_scope.jenjang_id
    LEFT JOIN rombel r ON r.id=se_scope.rombel_id
    WHERE ${scope.where} ${status === 'semua' ? '' : 'AND s.status=?'}
    ORDER BY c.nama,r.nama,s.nama
  `).all(...scope.params, ...(status === 'semua' ? [] : [status]));
  res.json(rows);
});

router.get('/wali/children', auth(['wali']), (req, res) => {
  const rows = db.prepare(`
    SELECT s.*,e.cabang_id,e.rombel_id,e.jenjang_id,e.paket,
           c.nama AS cabang_nama,j.nama AS jenjang_nama,r.nama AS rombel_nama
    FROM wali_siswa ws
    JOIN siswa s ON s.id=ws.siswa_id
    LEFT JOIN siswa_enrollment e ON e.id=(
      SELECT e2.id FROM siswa_enrollment e2
      WHERE e2.siswa_id=s.id
      ORDER BY CASE WHEN e2.status='aktif' THEN 0 ELSE 1 END,e2.tanggal_mulai DESC,e2.id DESC
      LIMIT 1
    )
    LEFT JOIN cabang c ON c.id=e.cabang_id
    LEFT JOIN jenjang j ON j.id=e.jenjang_id
    LEFT JOIN rombel r ON r.id=e.rombel_id
    WHERE ws.wali_pengguna_id=? AND ws.aktif=1
    ORDER BY s.nama
  `).all(req.user.id);
  res.json(rows);
});

router.get('/:id', auth(), (req, res) => {
  const siswa = db.prepare('SELECT * FROM siswa WHERE id=?').get(req.params.id);
  if (!siswa) return res.status(404).json({ error: 'Siswa tidak ditemukan' });
  const e = managementEnrollment(siswa.id);
  if (!e) return res.status(404).json({ error: 'Enrollment siswa tidak ditemukan' });
  if (!['admin', 'wali'].includes(req.user.role) && !requireCabang(req, res, e.cabang_id)) return;
  if (req.user.role === 'wali') {
    const ok = db.prepare('SELECT 1 FROM wali_siswa WHERE wali_pengguna_id=? AND siswa_id=? AND aktif=1').get(req.user.id, siswa.id);
    if (!ok) return res.status(403).json({ error: 'Akses ditolak' });
  }
  const penjemput = db.prepare('SELECT * FROM penjemput WHERE siswa_id=? ORDER BY aktif DESC,nama').all(siswa.id);
  const wali = db.prepare(`
    SELECT p.id,p.display_name,p.no_wa,ws.relasi,p.status
    FROM wali_siswa ws JOIN pengguna p ON p.id=ws.wali_pengguna_id
    WHERE ws.siswa_id=? AND ws.aktif=1
  `).get(siswa.id);
  res.json({ ...siswa, enrollment: e, penjemput, wali });
});

router.post('/', auth(['admin', 'admin_cabang']), (req, res) => {
  const d = req.body || {};
  const cabangId = Number(req.user.role === 'admin' ? d.cabang_id : req.user.cabang_id);
  const rombelId = Number(Array.isArray(d.rombel_id) ? d.rombel_id[0] : d.rombel_id);
  const jenjangId = Number(Array.isArray(d.jenjang_id) ? d.jenjang_id[0] : d.jenjang_id);
  if (!requireActiveCabang(req, res, cabangId)) return;
  if (!d.nama || !rombelId || !jenjangId || !d.paket) return res.status(400).json({ error: 'Nama, rombel, jenjang, dan paket wajib' });
  const rombel = db.prepare('SELECT * FROM rombel WHERE id=? AND cabang_id=? AND jenjang_id=?').get(rombelId, cabangId, jenjangId);
  if (!rombel) return res.status(400).json({ error: 'Rombel tidak sesuai cabang/jenjang' });
  try {
    const status = normalizeSiswaStatus(d.status, 'aktif');
    const tx = db.transaction(() => {
      const r = db.prepare(`INSERT INTO siswa(nama,nis,nama_panggilan,gender,tanggal_lahir,alamat,catatan_khusus,catatan_sekolah_luar,status,status_kartu,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(d.nama, d.nis || null, d.nama_panggilan || null, d.gender || null, d.tanggal_lahir || null, d.alamat || null, d.catatan_khusus || null, d.catatan_sekolah_luar || null, status, d.status_kartu || 'aktif', nowUtc(), nowUtc());
      db.prepare(`INSERT INTO siswa_enrollment(siswa_id,cabang_id,jenjang_id,rombel_id,paket,tanggal_mulai,status,alasan,created_at,created_by)
        VALUES(?,?,?,?,?,?, 'aktif',?,?,?)`)
        .run(r.lastInsertRowid, cabangId, jenjangId, rombelId, d.paket, d.tanggal_mulai || todayWIB(), d.alasan || 'Enrollment awal', nowUtc(), req.user.id);
      audit(req.user, 'create', 'siswa', r.lastInsertRowid, { cabang_id: cabangId, after: d });
      return r.lastInsertRowid;
    });
    res.json({ id: tx() });
  } catch (e) {
    res.status(e.statusCode || 400).json({ error: e.code === 'SQLITE_CONSTRAINT_UNIQUE' ? 'NIS sudah dipakai' : (e.message || 'Gagal menyimpan siswa') });
  }
});

router.put('/:id', auth(['admin', 'admin_cabang']), (req, res) => {
  const before = db.prepare('SELECT * FROM siswa WHERE id=?').get(req.params.id);
  if (!before) return res.status(404).json({ error: 'Siswa tidak ditemukan' });
  const e = managementEnrollment(req.params.id);
  if (!e) return res.status(404).json({ error: 'Enrollment siswa tidak ditemukan' });
  if (!requireCabang(req, res, e.cabang_id)) return;
  const d = req.body || {};
  try {
    const status = normalizeSiswaStatus(d.status, before.status);
    db.prepare(`UPDATE siswa SET nama=?,nis=?,nama_panggilan=?,gender=?,tanggal_lahir=?,alamat=?,catatan_khusus=?,catatan_sekolah_luar=?,status=?,status_kartu=?,updated_at=? WHERE id=?`)
      .run(d.nama || before.nama, d.nis || null, d.nama_panggilan || null, d.gender || null, d.tanggal_lahir || null, d.alamat || null, d.catatan_khusus || null, d.catatan_sekolah_luar || null, status, d.status_kartu || before.status_kartu, nowUtc(), req.params.id);
    audit(req.user, 'update', 'siswa', req.params.id, { cabang_id: e.cabang_id, before, after: d });
    res.json({ success: true });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.message || 'Gagal menyimpan siswa' });
  }
});

router.post('/:id/enrollment', auth(['admin', 'admin_cabang']), (req, res) => {
  const current = managementEnrollment(req.params.id);
  if (!current) return res.status(404).json({ error: 'Enrollment aktif tidak ditemukan' });
  const d = req.body || {};
  const cabangId = Number(req.user.role === 'admin' ? d.cabang_id : req.user.cabang_id);
  const rombelId = Number(Array.isArray(d.rombel_id) ? d.rombel_id[0] : d.rombel_id);
  const jenjangId = Number(Array.isArray(d.jenjang_id) ? d.jenjang_id[0] : d.jenjang_id);
  if (!requireActiveCabang(req, res, cabangId)) return;
  const rombel = db.prepare('SELECT * FROM rombel WHERE id=? AND cabang_id=? AND jenjang_id=?').get(rombelId, cabangId, jenjangId);
  if (!rombel) return res.status(400).json({ error: 'Rombel tujuan tidak valid' });
  const mulai = d.tanggal_mulai || todayWIB();
  const tx = db.transaction(() => {
    db.prepare("UPDATE siswa_enrollment SET status='selesai',tanggal_selesai=? WHERE id=?").run(dateBefore(mulai), current.id);
    const r = db.prepare(`INSERT INTO siswa_enrollment(siswa_id,cabang_id,jenjang_id,rombel_id,paket,tanggal_mulai,status,alasan,created_at,created_by)
      VALUES(?,?,?,?,?,?, 'aktif',?,?,?)`)
      .run(req.params.id, cabangId, jenjangId, rombelId, d.paket, mulai, d.alasan || 'Pindah enrollment', nowUtc(), req.user.id);
    audit(req.user, 'change_enrollment', 'siswa', req.params.id, { cabang_id: cabangId, before: current, after: d });
    return r.lastInsertRowid;
  });
  res.json({ id: tx() });
});

router.post('/:id/nfc/reissue', auth(['admin', 'admin_cabang']), (req, res) => {
  const e = managementEnrollment(req.params.id);
  if (!e) return res.status(404).json({ error: 'Enrollment siswa tidak ditemukan' });
  if (!requireCabang(req, res, e.cabang_id)) return;
  const token = makeNfc();
  db.prepare('UPDATE siswa SET nfc_token=?,updated_at=? WHERE id=?').run(token, nowUtc(), req.params.id);
  audit(req.user, 'reissue_nfc', 'siswa', req.params.id, { cabang_id: e.cabang_id });
  res.json({ nfc_token: token });
});

router.get('/:id/penjemput', auth(), (req, res) => {
  const e = managementEnrollment(req.params.id);
  if (!e) return res.status(404).json({ error: 'Siswa tidak ditemukan' });
  if (req.user.role !== 'admin' && req.user.role !== 'wali' && !requireCabang(req, res, e.cabang_id)) return;
  res.json(db.prepare('SELECT * FROM penjemput WHERE siswa_id=? ORDER BY aktif DESC,nama').all(req.params.id));
});

router.post('/:id/penjemput', auth(['admin', 'admin_cabang']), (req, res) => {
  const e = managementEnrollment(req.params.id);
  if (!e) return res.status(404).json({ error: 'Enrollment siswa tidak ditemukan' });
  if (!requireCabang(req, res, e.cabang_id)) return;
  const d = req.body || {};
  if (!d.nama) return res.status(400).json({ error: 'Nama penjemput wajib' });
  const qr = makeQr(req.params.id);
  const r = db.prepare('INSERT INTO penjemput(siswa_id,nama,no_wa,relasi,qr_code,catatan,aktif) VALUES(?,?,?,?,?,?,1)')
    .run(req.params.id, d.nama, d.no_wa || null, d.relasi || null, qr, d.catatan || null);
  audit(req.user, 'create', 'penjemput', r.lastInsertRowid, { cabang_id: e.cabang_id, after: d });
  res.json({ id: r.lastInsertRowid, qr_code: qr });
});

router.put('/penjemput/:id', auth(['admin', 'admin_cabang']), (req, res) => {
  const p = db.prepare('SELECT * FROM penjemput WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Penjemput tidak ditemukan' });
  const e = managementEnrollment(p.siswa_id);
  if (!e) return res.status(404).json({ error: 'Enrollment siswa tidak ditemukan' });
  if (!requireCabang(req, res, e.cabang_id)) return;
  const d = req.body || {};
  db.prepare('UPDATE penjemput SET nama=?,no_wa=?,relasi=?,catatan=?,aktif=? WHERE id=?')
    .run(d.nama || p.nama, d.no_wa || null, d.relasi || null, d.catatan || null, d.aktif === 0 ? 0 : 1, req.params.id);
  audit(req.user, 'update', 'penjemput', req.params.id, { cabang_id: e.cabang_id, before: p, after: d });
  res.json({ success: true });
});

router.post('/kenaikan/preview', auth(['admin', 'admin_cabang']), (req, res) => {
  const cabangId = req.user.role === 'admin' ? req.body.cabang_id : req.user.cabang_id;
  if (!cabangId) return res.status(400).json({ error: 'Cabang wajib' });
  if (!requireActiveCabang(req, res, cabangId)) return;
  const jenjang = db.prepare('SELECT * FROM jenjang WHERE aktif=1 ORDER BY urutan').all();
  const rombel = db.prepare('SELECT * FROM rombel WHERE cabang_id=? AND aktif=1 ORDER BY nama').all(cabangId);
  const siswa = db.prepare(`
    SELECT s.*,e.jenjang_id,e.rombel_id,e.paket,j.nama AS jenjang_nama,j.tipe AS jenjang_tipe,j.urutan AS jenjang_urutan,r.nama AS rombel_nama
    FROM siswa s
    JOIN siswa_enrollment e ON e.siswa_id=s.id AND e.status='aktif'
    JOIN jenjang j ON j.id=e.jenjang_id
    JOIN rombel r ON r.id=e.rombel_id
    WHERE s.status='aktif' AND e.cabang_id=?
    ORDER BY s.nama
  `).all(cabangId);
  const preview = [];
  for (const s of siswa) {
    if (s.jenjang_tipe === 'care') { preview.push({ ...s, action: 'tetap', target_jenjang: s.jenjang_nama, target_rombel: s.rombel_nama }); continue; }
    const nextIdx = jenjang.findIndex(j => j.id === s.jenjang_id) + 1;
    if (nextIdx >= jenjang.length || jenjang[nextIdx].tipe === 'care') {
      preview.push({ ...s, action: 'lulus', target_jenjang: 'Lulus', target_rombel: '-' });
      continue;
    }
    const nextJenjang = jenjang[nextIdx];
    const targetRombel = rombel.find(r => r.jenjang_id === nextJenjang.id) || rombel[0];
    preview.push({ ...s, action: 'naik', target_jenjang: nextJenjang.nama, target_jenjang_id: nextJenjang.id, target_rombel: targetRombel?.nama || '-', target_rombel_id: targetRombel?.id });
  }
  res.json({ preview, cabang_id: cabangId });
});

router.post('/kenaikan', auth(['admin', 'admin_cabang']), (req, res) => {
  const cabangId = req.user.role === 'admin' ? req.body.cabang_id : req.user.cabang_id;
  if (!cabangId) return res.status(400).json({ error: 'Cabang wajib' });
  if (!requireActiveCabang(req, res, cabangId)) return;
  const tanggal = req.body.tanggal_efektif || todayWIB();
  const jenjang = db.prepare('SELECT * FROM jenjang WHERE aktif=1 ORDER BY urutan').all();
  const rombel = db.prepare('SELECT * FROM rombel WHERE cabang_id=? AND aktif=1 ORDER BY nama').all(cabangId);
  const siswa = db.prepare(`
    SELECT s.*,e.id AS enrollment_id,e.jenjang_id,e.rombel_id,e.paket,j.tipe AS jenjang_tipe,j.urutan AS jenjang_urutan
    FROM siswa s
    JOIN siswa_enrollment e ON e.siswa_id=s.id AND e.status='aktif'
    JOIN jenjang j ON j.id=e.jenjang_id
    WHERE s.status='aktif' AND e.cabang_id=?
  `).all(cabangId);
  const results = [];
  const tx = db.transaction(() => {
    for (const s of siswa) {
      if (s.jenjang_tipe === 'care') { results.push({ siswa: s.nama, action: 'tetap' }); continue; }
      const nextIdx = jenjang.findIndex(j => j.id === s.jenjang_id) + 1;
      if (nextIdx >= jenjang.length || jenjang[nextIdx].tipe === 'care') {
        db.prepare("UPDATE siswa SET status='lulus',updated_at=? WHERE id=?").run(nowUtc(), s.id);
        db.prepare("UPDATE siswa_enrollment SET status='selesai',tanggal_selesai=? WHERE id=?").run(tanggal, s.enrollment_id);
        results.push({ siswa: s.nama, action: 'lulus' });
        continue;
      }
      const nextJenjang = jenjang[nextIdx];
      const targetRombel = rombel.find(r => r.jenjang_id === nextJenjang.id) || rombel[0];
      if (!targetRombel) { results.push({ siswa: s.nama, action: 'error', error: 'Rombel tujuan tidak ditemukan' }); continue; }
      db.prepare("UPDATE siswa_enrollment SET status='selesai',tanggal_selesai=? WHERE id=?").run(tanggal, s.enrollment_id);
      db.prepare('INSERT INTO siswa_enrollment(siswa_id,cabang_id,jenjang_id,rombel_id,paket,tanggal_mulai,status,alasan,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(s.id, cabangId, nextJenjang.id, targetRombel.id, s.paket, tanggal, 'aktif', 'Kenaikan tahun ajaran', nowUtc(), req.user.id);
      results.push({ siswa: s.nama, action: 'naik', target: nextJenjang.nama });
    }
    audit(req.user, 'kenaikan_tahun_ajaran', 'siswa', null, { cabang_id: cabangId, after: { tanggal, count: results.length } });
  });
  tx();
  res.json({ success: true, results });
});

router.post('/:id/foto', auth(['admin', 'admin_cabang']), uploadImage.single('foto'), async (req, res) => {
  const siswa = db.prepare('SELECT * FROM siswa WHERE id=?').get(req.params.id);
  if (!siswa) return res.status(404).json({ error: 'Siswa tidak ditemukan' });
  const access = activeEnrollment(siswa.id) || db.prepare('SELECT cabang_id FROM siswa_enrollment WHERE siswa_id=? ORDER BY tanggal_mulai DESC LIMIT 1').get(siswa.id);
  if (!access) return res.status(404).json({ error: 'Enrollment tidak ditemukan' });
  if (!requireCabang(req, res, access.cabang_id)) return;
  if (!req.file) return res.status(400).json({ error: 'File foto wajib' });
  if (siswa.foto) {
    try { fs.unlinkSync(path.join(FOTO_DIR, siswa.foto)); } catch {}
  }
  const filename = `siswa-${siswa.id}-${Date.now()}.jpg`;
  const outPath = path.join(FOTO_DIR, filename);
  await saveSquareJpeg(req.file.buffer, outPath);
  const url = `/uploads/foto/${filename}`;
  db.prepare('UPDATE siswa SET foto=?,updated_at=? WHERE id=?').run(url, nowUtc(), siswa.id);
  audit(req.user, 'upload_foto', 'siswa', siswa.id, { cabang_id: access.cabang_id });
  res.json({ url });
});

router.delete('/:id/foto', auth(['admin', 'admin_cabang']), (req, res) => {
  const siswa = db.prepare('SELECT * FROM siswa WHERE id=?').get(req.params.id);
  if (!siswa) return res.status(404).json({ error: 'Siswa tidak ditemukan' });
  const access = activeEnrollment(siswa.id) || db.prepare('SELECT cabang_id FROM siswa_enrollment WHERE siswa_id=? ORDER BY tanggal_mulai DESC LIMIT 1').get(siswa.id);
  if (!access) return res.status(404).json({ error: 'Enrollment tidak ditemukan' });
  if (!requireCabang(req, res, access.cabang_id)) return;
  if (siswa.foto) {
    const fname = path.basename(siswa.foto);
    try { fs.unlinkSync(path.join(FOTO_DIR, fname)); } catch {}
  }
  db.prepare('UPDATE siswa SET foto=NULL,updated_at=? WHERE id=?').run(nowUtc(), siswa.id);
  audit(req.user, 'delete_foto', 'siswa', siswa.id, { cabang_id: access.cabang_id });
  res.json({ success: true });
});

module.exports = router;
