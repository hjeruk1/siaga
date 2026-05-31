const router = require('express').Router();
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const auth = require('../middleware/auth');
const { uploadImage, saveSquareJpeg, ensureDir } = require('../utils/image-upload');
const { nowUtc, todayWIB, schoolYearForDate, activeEnrollment, siswaScopeSql, requireCabang, requireActiveCabang, audit } = require('../utils/workflow');

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
const KENAIKAN_ACTIONS = new Set(['naik', 'tinggal', 'lulus', 'tetap', 'skip']);

function normalizeSiswaStatus(value, fallback = 'aktif') {
  const status = value || fallback;
  if (!SISWA_STATUSES.has(status)) {
    const error = new Error('Status siswa tidak valid');
    error.statusCode = 400;
    throw error;
  }
  return status;
}

function kenaikanContext(req) {
  const cabangId = Number(req.user.role === 'admin' ? req.body.cabang_id : req.user.cabang_id);
  const tanggalEfektif = req.body.tanggal_efektif || todayWIB();
  const tahunAjaran = String(req.body.tahun_ajaran || schoolYearForDate(tanggalEfektif));
  return { cabangId, tanggalEfektif, tahunAjaran };
}

function kenaikanTarget(row, jenjang, rombel, action = null) {
  if (row.jenjang_tipe === 'care') {
    return { action: action || 'tetap', target_jenjang: row.jenjang_nama, target_jenjang_id: row.jenjang_id, target_rombel: row.rombel_nama, target_rombel_id: row.rombel_id };
  }
  const nextIdx = jenjang.findIndex(j => Number(j.id) === Number(row.jenjang_id)) + 1;
  if (nextIdx >= jenjang.length || jenjang[nextIdx].tipe === 'care') {
    return { action: action || 'lulus', target_jenjang: 'Lulus', target_jenjang_id: null, target_rombel: '-', target_rombel_id: null };
  }
  const nextJenjang = jenjang[nextIdx];
  const targetRombel = rombel.find(r => Number(r.jenjang_id) === Number(nextJenjang.id));
  if (!targetRombel) {
    return { action: 'error', target_jenjang: nextJenjang.nama, target_jenjang_id: nextJenjang.id, target_rombel: '-', target_rombel_id: null, error: `Rombel tujuan ${nextJenjang.nama} belum tersedia` };
  }
  return { action: action || 'naik', target_jenjang: nextJenjang.nama, target_jenjang_id: nextJenjang.id, target_rombel: targetRombel.nama, target_rombel_id: targetRombel.id };
}

function summarizeKenaikan(items) {
  return items.reduce((acc, item) => {
    acc[item.action] = (acc[item.action] || 0) + 1;
    return acc;
  }, { naik: 0, tinggal: 0, lulus: 0, tetap: 0, skip: 0, error: 0 });
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

  const result = rows.map(ch => {
    let gurus = [];
    if (ch.rombel_id) {
      gurus = db.prepare(`
        SELECT p.id, p.display_name, p.no_wa, sp.foto, gr.role
        FROM guru_rombel gr
        JOIN pengguna p ON p.id=gr.pengguna_id
        LEFT JOIN staff_profile sp ON sp.pengguna_id=p.id
        WHERE gr.rombel_id=? AND p.status='aktif'
      `).all(ch.rombel_id);
    }
    return {
      ...ch,
      gurus
    };
  });

  res.json(result);
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

router.post('/penjemput/:id/qr/reissue', auth(['admin', 'admin_cabang']), (req, res) => {
  const p = db.prepare('SELECT * FROM penjemput WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Penjemput tidak ditemukan' });
  const e = managementEnrollment(p.siswa_id);
  if (!e) return res.status(404).json({ error: 'Enrollment siswa tidak ditemukan' });
  if (!requireCabang(req, res, e.cabang_id)) return;
  const qr = makeQr(p.siswa_id);
  const reason = String(req.body?.reason || 'Reissue QR penjemput').trim();
  db.prepare('UPDATE penjemput SET qr_code=? WHERE id=?').run(qr, p.id);
  db.prepare('INSERT INTO qr_reissue_log(siswa_id,penjemput_id,admin_id,cabang_id,old_qr_code,new_qr_code,reason,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(p.siswa_id, p.id, req.user.id, e.cabang_id, p.qr_code, qr, reason, nowUtc());
  audit(req.user, 'reissue_qr', 'penjemput', p.id, { cabang_id: e.cabang_id, before: { qr_code: p.qr_code }, after: { qr_code: qr, reason } });
  res.json({ id: p.id, qr_code: qr });
});

router.post('/kenaikan/preview', auth(['admin', 'admin_cabang']), (req, res) => {
  const { cabangId, tanggalEfektif, tahunAjaran } = kenaikanContext(req);
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
    preview.push({ ...s, ...kenaikanTarget(s, jenjang, rombel) });
  }
  res.json({ preview, cabang_id: cabangId, tanggal_efektif: tanggalEfektif, tahun_ajaran: tahunAjaran, summary: summarizeKenaikan(preview) });
});

router.post('/kenaikan', auth(['admin', 'admin_cabang']), (req, res) => {
  const { cabangId, tanggalEfektif, tahunAjaran } = kenaikanContext(req);
  if (!cabangId) return res.status(400).json({ error: 'Cabang wajib' });
  if (!requireActiveCabang(req, res, cabangId)) return;
  const jenjang = db.prepare('SELECT * FROM jenjang WHERE aktif=1 ORDER BY urutan').all();
  const rombel = db.prepare('SELECT * FROM rombel WHERE cabang_id=? AND aktif=1 ORDER BY nama').all(cabangId);
  const siswa = db.prepare(`
    SELECT s.*,e.id AS enrollment_id,e.jenjang_id,e.rombel_id,e.paket,j.nama AS jenjang_nama,j.tipe AS jenjang_tipe,j.urutan AS jenjang_urutan,r.nama AS rombel_nama
    FROM siswa s
    JOIN siswa_enrollment e ON e.siswa_id=s.id AND e.status='aktif'
    JOIN jenjang j ON j.id=e.jenjang_id
    JOIN rombel r ON r.id=e.rombel_id
    WHERE s.status='aktif' AND e.cabang_id=?
  `).all(cabangId);
  const byId = new Map(siswa.map(s => [Number(s.id), s]));
  const requestedItems = Array.isArray(req.body.items) ? req.body.items : null;
  const items = requestedItems && requestedItems.length ? requestedItems : siswa.map(s => ({ siswa_id: s.id, ...kenaikanTarget(s, jenjang, rombel) }));
  const normalizedItems = [];
  for (const raw of items) {
    const siswaId = Number(raw.siswa_id || raw.id);
    const row = byId.get(siswaId);
    if (!row) return res.status(400).json({ error: `Siswa ${siswaId || '-'} tidak aktif di cabang ini` });
    const action = raw.action || kenaikanTarget(row, jenjang, rombel).action;
    if (!KENAIKAN_ACTIONS.has(action)) return res.status(400).json({ error: `Aksi kenaikan tidak valid untuk ${row.nama}` });
    if (action === 'skip' || action === 'tetap') {
      normalizedItems.push({ row, action });
      continue;
    }
    if (action === 'lulus') {
      normalizedItems.push({ row, action });
      continue;
    }
    let targetJenjangId = Number(raw.target_jenjang_id);
    let targetRombelId = Number(raw.target_rombel_id);
    if (action === 'naik' && (!targetJenjangId || !targetRombelId)) {
      const target = kenaikanTarget(row, jenjang, rombel);
      if (target.action === 'error') return res.status(400).json({ error: `${row.nama}: ${target.error}` });
      targetJenjangId = Number(target.target_jenjang_id);
      targetRombelId = Number(target.target_rombel_id);
    }
    if (action === 'tinggal') {
      targetJenjangId = targetJenjangId || Number(row.jenjang_id);
    }
    const targetRombel = rombel.find(r => Number(r.id) === targetRombelId && Number(r.jenjang_id) === targetJenjangId);
    const targetJenjang = jenjang.find(j => Number(j.id) === targetJenjangId);
    if (!targetJenjang || !targetRombel) return res.status(400).json({ error: `${row.nama}: Rombel tujuan tidak sesuai cabang/jenjang` });
    normalizedItems.push({ row, action, targetJenjang, targetRombel, paket: raw.paket || row.paket });
  }
  const results = [];
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO kenaikan_batch(cabang_id,tahun_ajaran,tanggal_efektif,summary_json,created_by,created_at) VALUES(?,?,?,?,?,?)')
      .run(cabangId, tahunAjaran, tanggalEfektif, JSON.stringify(summarizeKenaikan(normalizedItems)), req.user.id, nowUtc());
    for (const item of normalizedItems) {
      const s = item.row;
      if (item.action === 'skip' || item.action === 'tetap') {
        results.push({ siswa: s.nama, siswa_id: s.id, action: item.action });
        continue;
      }
      if (item.action === 'lulus') {
        db.prepare("UPDATE siswa SET status='lulus',updated_at=? WHERE id=?").run(nowUtc(), s.id);
        db.prepare("UPDATE siswa_enrollment SET status='selesai',tanggal_selesai=? WHERE id=?").run(tanggalEfektif, s.enrollment_id);
        results.push({ siswa: s.nama, siswa_id: s.id, action: 'lulus' });
        continue;
      }
      db.prepare("UPDATE siswa_enrollment SET status='selesai',tanggal_selesai=? WHERE id=?").run(tanggalEfektif, s.enrollment_id);
      db.prepare('INSERT INTO siswa_enrollment(siswa_id,cabang_id,jenjang_id,rombel_id,paket,tanggal_mulai,status,alasan,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(s.id, cabangId, item.targetJenjang.id, item.targetRombel.id, item.paket, tanggalEfektif, 'aktif', item.action === 'tinggal' ? 'Tinggal kelas' : 'Kenaikan tahun ajaran', nowUtc(), req.user.id);
      results.push({ siswa: s.nama, siswa_id: s.id, action: item.action, target: item.targetJenjang.nama, target_rombel: item.targetRombel.nama });
    }
    audit(req.user, 'kenaikan_tahun_ajaran', 'siswa', null, { cabang_id: cabangId, after: { tanggal: tanggalEfektif, tahun_ajaran: tahunAjaran, count: results.length, results } });
  });
  try {
    tx();
    res.json({ success: true, results, cabang_id: cabangId, tanggal_efektif: tanggalEfektif, tahun_ajaran: tahunAjaran, summary: summarizeKenaikan(normalizedItems) });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'Kenaikan tahun ajaran untuk cabang dan tahun ajaran ini sudah pernah diproses' });
    res.status(400).json({ error: e.message || 'Gagal memproses kenaikan tahun ajaran' });
  }
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
