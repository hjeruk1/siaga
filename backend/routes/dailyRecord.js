const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const db = require('../db');
const auth = require('../middleware/auth');
const { uploadImage, saveSquareJpeg, ensureDir } = require('../utils/imageUpload');
const { nowUtc, todayWIB, nowTimeWIB, activeEnrollment, canAccessSiswa, canWaliAccessSiswa, siswaScopeSql, requireCabang, requireActiveCabang, audit, notify, isSchoolDay } = require('../utils/workflow');

const UPLOAD_DIR = path.join(__dirname, '../uploads/laporan');
ensureDir(UPLOAD_DIR);

function parseActivities(v) {
  if (Array.isArray(v)) return v;
  try { const x = JSON.parse(v || '[]'); return Array.isArray(x) ? x : []; } catch { return []; }
}

function parseJsonArray(v) {
  if (Array.isArray(v)) return v;
  try { const x = JSON.parse(v || '[]'); return Array.isArray(x) ? x : []; } catch { return []; }
}

function parseJsonObject(v) {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  try {
    const x = JSON.parse(v || '{}');
    return x && typeof x === 'object' && !Array.isArray(x) ? x : {};
  } catch {
    return {};
  }
}

function dailyCompletionError(l) {
  if (!l.focus_theme_id) return 'Focus Theme wajib dibuat sebelum daily record dikirim ke wali';
  if (!l.mood || !l.makan || l.tidur === null || l.tidur === undefined) return 'Mood, makan, dan tidur wajib diisi';
  if (!String(l.observation_domain || '').trim()) return 'Domain observasi wajib diisi';
  const note = String(l.observation_note || '').trim();
  if (note.length < 12) return 'Catatan observasi wajib diisi dengan kalimat objektif';
  return null;
}

function withDetails(l, user) {
  if (!l) return null;
  const attachments = db.prepare('SELECT * FROM laporan_attachment WHERE laporan_id=? ORDER BY sort_order,id').all(l.id);
  const comments = db.prepare(`
    SELECT c.*,p.display_name AS author_name,p.role AS author_role
    FROM laporan_comment c JOIN pengguna p ON p.id=c.author_pengguna_id
    WHERE c.laporan_id=? ORDER BY c.id
  `).all(l.id);
  let read = null;
  if (user?.role === 'wali') {
    read = db.prepare('SELECT read_at FROM laporan_read WHERE laporan_id=? AND wali_pengguna_id=?').get(l.id, user.id) || null;
  }
  return {
    ...l,
    aktivitas: parseActivities(l.aktivitas),
    focus_theme_domains: parseJsonArray(l.focus_theme_domains),
    structured_observation: parseJsonObject(l.structured_observation_json),
    attachments,
    comments,
    read
  };
}

function canComment(user, laporan) {
  const current = activeEnrollment(laporan.siswa_id) || activeEnrollment(laporan.siswa_id, laporan.tanggal);
  if (!current) return false;
  if (Number(current.cabang_id) !== Number(laporan.cabang_id) || Number(current.rombel_id) !== Number(laporan.rombel_id)) return false;
  if (user.role === 'wali') {
    return !!db.prepare('SELECT 1 FROM wali_siswa WHERE wali_pengguna_id=? AND siswa_id=? AND aktif=1').get(user.id, laporan.siswa_id);
  }
  if (user.role === 'guru') {
    return !!db.prepare('SELECT 1 FROM guru_rombel WHERE pengguna_id=? AND rombel_id=?').get(user.id, laporan.rombel_id);
  }
  return false;
}

router.get('/today', auth(), (req, res) => {
  const tanggal = req.query.tanggal || todayWIB();
  const scope = siswaScopeSql(req.user, 's', req.query.cabang_id);
  const rows = db.prepare(`
    SELECT DISTINCT s.id AS siswa_id,s.nama,s.foto,se_scope.cabang_id,se_scope.rombel_id,se_scope.jenjang_id,se_scope.paket,
           c.nama AS cabang_nama,j.nama AS jenjang_nama,r.nama AS rombel_nama,
           l.id AS laporan_id,l.status AS laporan_status,l.published_at,l.last_published_change_at,l.updated_at,
           ft.id AS focus_theme_id,ft.title AS focus_theme_title,
           ft.activity_summary AS focus_theme_activity_summary,ft.suggested_domains AS focus_theme_domains,
           l.mood,l.makan,l.tidur,l.aktivitas,l.catatan,l.observation_domain,l.observation_note,l.parent_note
    FROM siswa s
    ${scope.join}
    JOIN cabang c ON c.id=se_scope.cabang_id
    JOIN jenjang j ON j.id=se_scope.jenjang_id
    JOIN rombel r ON r.id=se_scope.rombel_id
    LEFT JOIN laporan_harian l ON l.siswa_id=s.id AND l.tanggal=?
    LEFT JOIN focus_theme ft ON ft.rombel_id=se_scope.rombel_id AND ft.tanggal=?
    WHERE ${scope.where} AND s.status='aktif'
    ORDER BY c.nama,r.nama,s.nama
  `).all(tanggal, tanggal, ...scope.params);
  const cabangId = req.query.cabang_id || (req.user.role !== 'admin' ? req.user.cabang_id : null);
  const schoolDay = cabangId ? isSchoolDay(tanggal, cabangId) : null;
  const now = nowTimeWIB();
  const rowsWithLate = rows.map(r => {
    const cfg = db.prepare('SELECT daily_record_due_time FROM operasional_config WHERE cabang_id=? AND jenjang_id=? AND paket=?').get(r.cabang_id, r.jenjang_id, r.paket);
    const dueTime = cfg?.daily_record_due_time || '18:00';
    const isLate = !r.laporan_status || r.laporan_status === 'draft' ? now > dueTime : (r.published_at ? r.published_at.slice(11, 16) > dueTime : false);
    return { ...r, aktivitas: parseActivities(r.aktivitas), focus_theme_domains: parseJsonArray(r.focus_theme_domains), is_late: isLate, due_time: dueTime };
  });
  res.json({ rows: rowsWithLate, is_school_day: schoolDay, tanggal });
});

router.get('/history/:siswa_id', auth(), (req, res) => {
  if (req.user.role === 'wali') {
    if (!canWaliAccessSiswa(req.user, req.params.siswa_id)) return res.status(403).json({ error: 'Akses ditolak' });
  } else {
    const access = canAccessSiswa(req.user, req.params.siswa_id);
    if (access === false) return res.status(403).json({ error: 'Akses ditolak' });
    if (!access) return res.status(404).json({ error: 'Siswa tidak ditemukan' });
  }
  const limit = Math.min(parseInt(req.query.limit, 10) || 30, 120);
  const rows = db.prepare(`
    SELECT l.*,s.nama AS siswa_nama,c.nama AS cabang_nama,r.nama AS rombel_nama,j.nama AS jenjang_nama,p.display_name AS guru_nama,
           ft.title AS focus_theme_title,ft.activity_summary AS focus_theme_activity_summary,
           ft.suggested_domains AS focus_theme_domains,ma.title AS modul_ajar_title
    FROM laporan_harian l
    JOIN siswa s ON s.id=l.siswa_id
    JOIN cabang c ON c.id=l.cabang_id
    JOIN rombel r ON r.id=l.rombel_id
    JOIN jenjang j ON j.id=l.jenjang_id
    LEFT JOIN pengguna p ON p.id=l.guru_id
    LEFT JOIN focus_theme ft ON ft.id=l.focus_theme_id
    LEFT JOIN modul_ajar ma ON ma.id=ft.modul_ajar_id
    WHERE l.siswa_id=? ${req.user.role === 'wali' ? "AND l.status='published'" : ''}
    ORDER BY l.tanggal DESC LIMIT ?
  `).all(req.params.siswa_id, limit);
  res.json(rows.map(l => withDetails(l, req.user)));
});

router.get('/:id', auth(), (req, res) => {
  const l = db.prepare(`
    SELECT l.*,s.nama AS siswa_nama,c.nama AS cabang_nama,r.nama AS rombel_nama,j.nama AS jenjang_nama,p.display_name AS guru_nama,
           ft.title AS focus_theme_title,ft.activity_summary AS focus_theme_activity_summary,
           ft.suggested_domains AS focus_theme_domains,ma.title AS modul_ajar_title
    FROM laporan_harian l
    JOIN siswa s ON s.id=l.siswa_id
    JOIN cabang c ON c.id=l.cabang_id
    JOIN rombel r ON r.id=l.rombel_id
    JOIN jenjang j ON j.id=l.jenjang_id
    LEFT JOIN pengguna p ON p.id=l.guru_id
    LEFT JOIN focus_theme ft ON ft.id=l.focus_theme_id
    LEFT JOIN modul_ajar ma ON ma.id=ft.modul_ajar_id
    WHERE l.id=?
  `).get(req.params.id);
  if (!l) return res.status(404).json({ error: 'Daily record tidak ditemukan' });
  if (req.user.role === 'wali') {
    if (l.status !== 'published') return res.status(404).json({ error: 'Daily record tidak ditemukan' });
    if (!canWaliAccessSiswa(req.user, l.siswa_id)) return res.status(403).json({ error: 'Akses ditolak' });
  } else {
    const access = canAccessSiswa(req.user, l.siswa_id, { tanggal: l.tanggal });
    if (access === false) return res.status(403).json({ error: 'Akses ditolak' });
    if (!access) return res.status(404).json({ error: 'Siswa tidak ditemukan' });
  }
  if (req.user.role === 'wali') {
    db.prepare(`INSERT INTO laporan_read(laporan_id,wali_pengguna_id,read_at) VALUES(?,?,?)
      ON CONFLICT(laporan_id,wali_pengguna_id) DO UPDATE SET read_at=excluded.read_at`)
      .run(l.id, req.user.id, nowUtc());
  }
  res.json(withDetails(l, req.user));
});

router.get('/:id/edits', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const l = db.prepare('SELECT * FROM laporan_harian WHERE id=?').get(req.params.id);
  if (!l) return res.status(404).json({ error: 'Daily record tidak ditemukan' });
  if (!requireCabang(req, res, l.cabang_id)) return;
  const edits = db.prepare(`
    SELECT el.*,p.display_name AS guru_nama FROM laporan_edit_log el
    LEFT JOIN pengguna p ON p.id=el.pengguna_id
    WHERE el.laporan_id=? ORDER BY el.id DESC
  `).all(req.params.id);
  res.json(edits);
});

router.post('/', auth(['guru', 'admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const d = req.body || {};
  if (!d.siswa_id) return res.status(400).json({ error: 'Siswa wajib' });
  const access = canAccessSiswa(req.user, d.siswa_id, { tanggal: d.tanggal || todayWIB() });
  if (access === false) return res.status(403).json({ error: 'Akses siswa ditolak' });
  if (!access) return res.status(404).json({ error: 'Siswa tidak ditemukan' });
  if (!requireActiveCabang(req, res, access.enrollment.cabang_id)) return;
  if (!['guru', 'admin'].includes(req.user.role) && req.user.role !== 'admin_cabang') return res.status(403).json({ error: 'Tidak boleh menulis daily record' });
  const tgl = d.tanggal || todayWIB();
  if (!isSchoolDay(tgl, access.enrollment.cabang_id)) return res.status(400).json({ error: 'Hari ini libur, tidak bisa mengisi daily record' });
  const e = access.enrollment;
  const existing = db.prepare('SELECT * FROM laporan_harian WHERE siswa_id=? AND tanggal=?').get(d.siswa_id, tgl);
  const akt = JSON.stringify(Array.isArray(d.aktivitas) ? d.aktivitas : []);
  const tidur = d.tidur === undefined ? null : (d.tidur ? 1 : 0);
  const has = key => Object.prototype.hasOwnProperty.call(d, key);
  const structured = has('structured_observation')
    ? JSON.stringify(d.structured_observation && typeof d.structured_observation === 'object' && !Array.isArray(d.structured_observation) ? d.structured_observation : {})
    : existing?.structured_observation_json || '{}';
  const focusThemeId = has('focus_theme_id') ? (d.focus_theme_id || null) : existing?.focus_theme_id || null;
  const observationDomain = has('observation_domain') ? (String(d.observation_domain || '').trim() || null) : existing?.observation_domain || null;
  const observationNote = has('observation_note') ? (String(d.observation_note || '').trim() || null) : existing?.observation_note || null;
  const parentNote = has('parent_note') ? (String(d.parent_note || '').trim() || null) : existing?.parent_note || null;
  if (focusThemeId) {
    const theme = db.prepare('SELECT id,rombel_id,tanggal FROM focus_theme WHERE id=?').get(focusThemeId);
    if (!theme || Number(theme.rombel_id) !== Number(e.rombel_id) || theme.tanggal !== tgl) {
      return res.status(400).json({ error: 'Focus Theme tidak sesuai rombel atau tanggal' });
    }
  }
  if (existing) {
    db.prepare(`UPDATE laporan_harian SET mood=?,makan=?,tidur=?,aktivitas=?,catatan=?,guru_id=?,updated_at=?,
      focus_theme_id=?,observation_domain=?,observation_note=?,parent_note=?,structured_observation_json=?,
      last_published_change_at=CASE WHEN status='published' THEN ? ELSE last_published_change_at END WHERE id=?`)
      .run(d.mood || null, d.makan || null, tidur, akt, d.catatan || null, req.user.id, nowUtc(),
        focusThemeId, observationDomain, observationNote, parentNote, structured, nowUtc(), existing.id);
    db.prepare('INSERT INTO laporan_edit_log(laporan_id,pengguna_id,perubahan,created_at) VALUES(?,?,?,?)')
      .run(existing.id, req.user.id, JSON.stringify({
        mood: d.mood,
        makan: d.makan,
        tidur: d.tidur,
        aktivitas: d.aktivitas,
        catatan: d.catatan,
        focus_theme_id: focusThemeId,
        observation_domain: observationDomain,
        observation_note: observationNote,
        parent_note: parentNote,
        structured_observation: parseJsonObject(structured)
      }), nowUtc());
    audit(req.user, 'update', 'laporan_harian', existing.id, { cabang_id: e.cabang_id, before: existing, after: d });
    return res.json({ id: existing.id, action: 'updated' });
  }
  const r = db.prepare(`INSERT INTO laporan_harian
    (siswa_id,cabang_id,jenjang_id,rombel_id,paket,tanggal,guru_id,status,mood,makan,tidur,aktivitas,catatan,
     focus_theme_id,observation_domain,observation_note,parent_note,structured_observation_json,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,'draft',?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(d.siswa_id, e.cabang_id, e.jenjang_id, e.rombel_id, e.paket, tgl, req.user.id,
      d.mood || null, d.makan || null, tidur, akt, d.catatan || null,
      focusThemeId, observationDomain, observationNote, parentNote, structured, nowUtc(), nowUtc());
  audit(req.user, 'create', 'laporan_harian', r.lastInsertRowid, { cabang_id: e.cabang_id, after: d });
  res.json({ id: r.lastInsertRowid, action: 'created' });
});

router.post('/:id/publish', auth(['guru', 'admin', 'admin_cabang']), (req, res) => {
  const l = db.prepare('SELECT * FROM laporan_harian WHERE id=?').get(req.params.id);
  if (!l) return res.status(404).json({ error: 'Daily record tidak ditemukan' });
  const access = canAccessSiswa(req.user, l.siswa_id, { tanggal: l.tanggal });
  if (access === false) return res.status(403).json({ error: 'Akses ditolak' });
  if (!requireActiveCabang(req, res, l.cabang_id)) return;
  if (!isSchoolDay(l.tanggal, l.cabang_id)) return res.status(400).json({ error: 'Hari libur, tidak bisa publish daily record' });
  const completionError = dailyCompletionError(l);
  if (completionError) return res.status(400).json({ error: completionError });
  const first = l.status !== 'published';
  db.prepare("UPDATE laporan_harian SET status='published',published_at=COALESCE(published_at,?),last_published_change_at=?,updated_at=? WHERE id=?")
    .run(nowUtc(), nowUtc(), nowUtc(), l.id);
  if (first) {
    const wali = db.prepare('SELECT wali_pengguna_id FROM wali_siswa WHERE siswa_id=? AND aktif=1').get(l.siswa_id);
    if (wali) notify(wali.wali_pengguna_id, 'daily_published', 'Daily record baru', 'Daily record anak sudah dikirim.', 'laporan_harian', l.id, l.cabang_id);
  }
  audit(req.user, 'publish', 'laporan_harian', l.id, { cabang_id: l.cabang_id });
  res.json({ success: true });
});

router.post('/:id/comment', auth(['wali', 'guru']), (req, res) => {
  const l = db.prepare('SELECT * FROM laporan_harian WHERE id=?').get(req.params.id);
  if (!l || l.status !== 'published') return res.status(404).json({ error: 'Daily record tidak ditemukan' });
  if (!canComment(req.user, l)) return res.status(403).json({ error: 'Thread ini read-only atau di luar akses Anda' });
  const body = String(req.body?.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Komentar wajib diisi' });
  const r = db.prepare('INSERT INTO laporan_comment(laporan_id,siswa_id,cabang_id,author_pengguna_id,body,created_at) VALUES(?,?,?,?,?,?)')
    .run(l.id, l.siswa_id, l.cabang_id, req.user.id, body, nowUtc());
  if (req.user.role === 'wali') {
    const gurus = db.prepare('SELECT pengguna_id FROM guru_rombel WHERE rombel_id=?').all(l.rombel_id);
    for (const g of gurus) notify(g.pengguna_id, 'wali_comment', 'Feedback wali baru', body, 'laporan_harian', l.id, l.cabang_id);
  } else {
    const wali = db.prepare('SELECT wali_pengguna_id FROM wali_siswa WHERE siswa_id=? AND aktif=1').get(l.siswa_id);
    if (wali) notify(wali.wali_pengguna_id, 'guru_reply', 'Balasan guru', body, 'laporan_harian', l.id, l.cabang_id);
  }
  audit(req.user, 'comment', 'laporan_comment', r.lastInsertRowid, { cabang_id: l.cabang_id });
  res.json({ id: r.lastInsertRowid });
});

router.post('/:id/attachments', auth(['guru', 'admin', 'admin_cabang']), uploadImage.single('foto'), async (req, res) => {
  const l = db.prepare('SELECT * FROM laporan_harian WHERE id=?').get(req.params.id);
  if (!l) return res.status(404).json({ error: 'Daily record tidak ditemukan' });
  const access = canAccessSiswa(req.user, l.siswa_id, { tanggal: l.tanggal });
  if (access === false) return res.status(403).json({ error: 'Akses ditolak' });
  if (!requireActiveCabang(req, res, l.cabang_id)) return;
  if (!isSchoolDay(l.tanggal, l.cabang_id)) return res.status(400).json({ error: 'Hari libur, tidak bisa mengubah daily record' });
  const count = db.prepare('SELECT COUNT(*) c FROM laporan_attachment WHERE laporan_id=?').get(l.id).c;
  if (count >= 5) return res.status(400).json({ error: 'Maksimal 5 foto' });
  if (!req.file) return res.status(400).json({ error: 'File foto wajib' });
  const filename = `${l.id}-${Date.now()}.jpg`;
  const outPath = path.join(UPLOAD_DIR, filename);
  await saveSquareJpeg(req.file.buffer, outPath);
  const stat = fs.statSync(outPath);
  const url = `/uploads/laporan/${filename}`;
  const r = db.prepare('INSERT INTO laporan_attachment(laporan_id,url,filename,size_bytes,sort_order,created_by,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(l.id, url, filename, stat.size, count, req.user.id, nowUtc());
  if (l.status === 'published') db.prepare('UPDATE laporan_harian SET last_published_change_at=?,updated_at=? WHERE id=?').run(nowUtc(), nowUtc(), l.id);
  audit(req.user, 'add_attachment', 'laporan_attachment', r.lastInsertRowid, { cabang_id: l.cabang_id });
  res.json({ id: r.lastInsertRowid, url });
});

router.delete('/:id/attachments/:attachmentId', auth(['guru', 'admin', 'admin_cabang']), (req, res) => {
  const l = db.prepare('SELECT * FROM laporan_harian WHERE id=?').get(req.params.id);
  if (!l) return res.status(404).json({ error: 'Daily record tidak ditemukan' });
  const access = canAccessSiswa(req.user, l.siswa_id, { tanggal: l.tanggal });
  if (access === false) return res.status(403).json({ error: 'Akses ditolak' });
  if (!requireActiveCabang(req, res, l.cabang_id)) return;
  const att = db.prepare('SELECT * FROM laporan_attachment WHERE id=? AND laporan_id=?').get(req.params.attachmentId, l.id);
  if (!att) return res.status(404).json({ error: 'Attachment tidak ditemukan' });
  try { fs.unlinkSync(path.join(UPLOAD_DIR, att.filename)); } catch {}
  db.prepare('DELETE FROM laporan_attachment WHERE id=?').run(att.id);
  if (l.status === 'published') db.prepare('UPDATE laporan_harian SET last_published_change_at=?,updated_at=? WHERE id=?').run(nowUtc(), nowUtc(), l.id);
  audit(req.user, 'delete_attachment', 'laporan_attachment', att.id, { cabang_id: l.cabang_id });
  res.json({ success: true });
});

router.get('/admin/history', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const cabangId = req.user.role === 'admin' ? req.query.cabang_id : req.user.cabang_id;
  const tanggal = req.query.tanggal || null;
  const rombelId = req.query.rombel_id || null;
  const siswaId = req.query.siswa_id || null;
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 300);
  const params = [];
  let where = 'WHERE 1=1';
  if (cabangId) { where += ' AND l.cabang_id=?'; params.push(cabangId); }
  if (tanggal) { where += ' AND l.tanggal=?'; params.push(tanggal); }
  if (rombelId) { where += ' AND l.rombel_id=?'; params.push(rombelId); }
  if (siswaId) { where += ' AND l.siswa_id=?'; params.push(siswaId); }
  params.push(limit);
  const rows = db.prepare(`
    SELECT l.*,s.nama AS siswa_nama,c.nama AS cabang_nama,r.nama AS rombel_nama,j.nama AS jenjang_nama,
           p.display_name AS guru_nama,
           ft.title AS focus_theme_title,ft.activity_summary AS focus_theme_activity_summary,
           ft.suggested_domains AS focus_theme_domains,ma.title AS modul_ajar_title
    FROM laporan_harian l
    JOIN siswa s ON s.id=l.siswa_id
    JOIN cabang c ON c.id=l.cabang_id
    JOIN rombel r ON r.id=l.rombel_id
    JOIN jenjang j ON j.id=l.jenjang_id
    LEFT JOIN pengguna p ON p.id=l.guru_id
    LEFT JOIN focus_theme ft ON ft.id=l.focus_theme_id
    LEFT JOIN modul_ajar ma ON ma.id=ft.modul_ajar_id
    ${where}
    ORDER BY l.tanggal DESC, l.updated_at DESC LIMIT ?
  `).all(...params);
  res.json(rows.map(l => withDetails(l, req.user)));
});

module.exports = router;
