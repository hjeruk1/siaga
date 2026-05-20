const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { nowUtc, requireCabang, audit } = require('../utils/workflow');

function parseJson(v, fallback = []) {
  if (Array.isArray(v)) return v;
  try {
    const parsed = JSON.parse(v || '[]');
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function jsonArray(v) {
  return JSON.stringify(Array.isArray(v) ? v : []);
}

function moduleRow(row) {
  if (!row) return null;
  return {
    ...row,
    goals: parseJson(row.goals),
    suggested_activities: parseJson(row.suggested_activities),
    suggested_domains: parseJson(row.suggested_domains)
  };
}

function themeRow(row) {
  if (!row) return null;
  return { ...row, suggested_domains: parseJson(row.suggested_domains) };
}

function scopeCabang(req, explicitCabangId) {
  return req.user.role === 'admin' ? explicitCabangId : req.user.cabang_id;
}

function canUseRombel(req, res, rombelId, cabangId = null) {
  const rombel = db.prepare('SELECT * FROM rombel WHERE id=?').get(rombelId);
  if (!rombel) {
    res.status(404).json({ error: 'Rombel tidak ditemukan' });
    return null;
  }
  if (cabangId !== null && cabangId !== undefined && Number(rombel.cabang_id) !== Number(cabangId)) {
    res.status(400).json({ error: 'Rombel tidak sesuai cabang' });
    return null;
  }
  if (!requireCabang(req, res, rombel.cabang_id)) return null;
  if (req.user.role === 'guru') {
    const assigned = db.prepare('SELECT 1 FROM guru_rombel WHERE pengguna_id=? AND rombel_id=?')
      .get(req.user.id, rombel.id);
    if (!assigned) {
      res.status(403).json({ error: 'Guru tidak ditugaskan di rombel ini' });
      return null;
    }
  }
  return rombel;
}

function validateModulAjarLink(res, modulAjarId, cabangId, rombelId) {
  if (!modulAjarId) return true;
  const modul = db.prepare('SELECT id,cabang_id,rombel_id FROM modul_ajar WHERE id=?').get(modulAjarId);
  if (!modul || Number(modul.cabang_id) !== Number(cabangId)) {
    res.status(400).json({ error: 'Modul ajar tidak sesuai cabang' });
    return false;
  }
  if (modul.rombel_id && Number(modul.rombel_id) !== Number(rombelId)) {
    res.status(400).json({ error: 'Modul ajar tidak sesuai rombel' });
    return false;
  }
  return true;
}

router.get('/', auth(['admin', 'admin_cabang', 'kepsek', 'guru']), (req, res) => {
  const cabangId = scopeCabang(req, req.query.cabang_id);
  if (!cabangId) return res.status(400).json({ error: 'Cabang wajib' });
  if (!requireCabang(req, res, cabangId)) return;

  const params = [cabangId];
  let where = 'WHERE m.cabang_id=?';
  if (req.query.tanggal) {
    where += ' AND m.week_start<=? AND m.week_end>=?';
    params.push(req.query.tanggal, req.query.tanggal);
  }

  const rows = db.prepare(`
    SELECT m.*,c.nama AS cabang_nama,j.nama AS jenjang_nama,r.nama AS rombel_nama,
           p.display_name AS created_by_name
    FROM modul_ajar m
    JOIN cabang c ON c.id=m.cabang_id
    LEFT JOIN jenjang j ON j.id=m.jenjang_id
    LEFT JOIN rombel r ON r.id=m.rombel_id
    LEFT JOIN pengguna p ON p.id=m.created_by
    ${where}
    ORDER BY m.week_start DESC,m.id DESC
  `).all(...params);
  res.json(rows.map(moduleRow));
});

router.post('/', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const d = req.body || {};
  const cabangId = scopeCabang(req, d.cabang_id);
  if (!d.title || !d.week_start || !d.week_end) return res.status(400).json({ error: 'Judul, minggu mulai, dan minggu selesai wajib' });
  if (!cabangId) return res.status(400).json({ error: 'Cabang wajib' });
  if (!requireCabang(req, res, cabangId)) return;
  if (d.rombel_id && !canUseRombel(req, res, d.rombel_id, cabangId)) return;
  if (d.jenjang_id) {
    const jenjang = db.prepare('SELECT 1 FROM jenjang WHERE id=?').get(d.jenjang_id);
    if (!jenjang) return res.status(400).json({ error: 'Jenjang tidak ditemukan' });
  }

  const now = nowUtc();
  const r = db.prepare(`
    INSERT INTO modul_ajar
      (cabang_id,jenjang_id,rombel_id,paket,title,week_start,week_end,goals,suggested_activities,suggested_domains,attachment_url,created_by,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    cabangId,
    d.jenjang_id || null,
    d.rombel_id || null,
    d.paket || null,
    d.title,
    d.week_start,
    d.week_end,
    jsonArray(d.goals),
    jsonArray(d.suggested_activities),
    jsonArray(d.suggested_domains),
    d.attachment_url || null,
    req.user.id,
    now,
    now
  );
  audit(req.user, 'create', 'modul_ajar', r.lastInsertRowid, { cabang_id: cabangId, after: d });
  res.json({ id: r.lastInsertRowid });
});

router.put('/:id', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const before = db.prepare('SELECT * FROM modul_ajar WHERE id=?').get(req.params.id);
  if (!before) return res.status(404).json({ error: 'Modul ajar tidak ditemukan' });
  if (!requireCabang(req, res, before.cabang_id)) return;

  const d = req.body || {};
  const cabangId = scopeCabang(req, d.cabang_id || before.cabang_id);
  if (!d.title || !d.week_start || !d.week_end) return res.status(400).json({ error: 'Judul, minggu mulai, dan minggu selesai wajib' });
  if (!cabangId) return res.status(400).json({ error: 'Cabang wajib' });
  if (!requireCabang(req, res, cabangId)) return;
  if (d.rombel_id && !canUseRombel(req, res, d.rombel_id, cabangId)) return;
  if (d.jenjang_id) {
    const jenjang = db.prepare('SELECT 1 FROM jenjang WHERE id=?').get(d.jenjang_id);
    if (!jenjang) return res.status(400).json({ error: 'Jenjang tidak ditemukan' });
  }

  db.prepare(`
    UPDATE modul_ajar
    SET cabang_id=?,jenjang_id=?,rombel_id=?,paket=?,title=?,week_start=?,week_end=?,
        goals=?,suggested_activities=?,suggested_domains=?,attachment_url=?,updated_at=?
    WHERE id=?
  `).run(
    cabangId,
    d.jenjang_id || null,
    d.rombel_id || null,
    d.paket || null,
    d.title,
    d.week_start,
    d.week_end,
    jsonArray(d.goals),
    jsonArray(d.suggested_activities),
    jsonArray(d.suggested_domains),
    d.attachment_url || null,
    nowUtc(),
    before.id
  );
  audit(req.user, 'update', 'modul_ajar', before.id, { cabang_id: cabangId, before, after: d });
  res.json({ id: before.id, action: 'updated' });
});

router.get('/focus-theme', auth(['admin', 'admin_cabang', 'kepsek', 'guru']), (req, res) => {
  const { rombel_id, tanggal } = req.query;
  if (!rombel_id || !tanggal) return res.status(400).json({ error: 'Rombel dan tanggal wajib' });
  const rombel = canUseRombel(req, res, rombel_id);
  if (!rombel) return;

  const row = db.prepare(`
    SELECT ft.*,m.title AS modul_ajar_title
    FROM focus_theme ft
    LEFT JOIN modul_ajar m ON m.id=ft.modul_ajar_id
    WHERE ft.rombel_id=? AND ft.tanggal=?
  `).get(rombel_id, tanggal);
  if (!row) return res.json(null);
  if (Number(row.cabang_id) !== Number(rombel.cabang_id)) return res.status(400).json({ error: 'Tema tidak sesuai rombel' });
  res.json(themeRow(row));
});

router.post('/focus-theme', auth(['guru', 'admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const d = req.body || {};
  const cabangId = scopeCabang(req, d.cabang_id);
  if (!cabangId || !d.rombel_id || !d.tanggal || !d.title) return res.status(400).json({ error: 'Cabang, rombel, tanggal, dan judul wajib' });
  const rombel = canUseRombel(req, res, d.rombel_id, cabangId);
  if (!rombel) return;
  if (!validateModulAjarLink(res, d.modul_ajar_id, cabangId, d.rombel_id)) return;

  const before = db.prepare('SELECT * FROM focus_theme WHERE rombel_id=? AND tanggal=?').get(d.rombel_id, d.tanggal);
  const now = nowUtc();
  const values = [
    d.modul_ajar_id || null,
    cabangId,
    d.rombel_id,
    d.tanggal,
    d.title,
    d.activity_summary || null,
    jsonArray(d.suggested_domains),
    d.teacher_prompt || null,
    req.user.id,
    now
  ];

  if (before) {
    db.prepare(`
      UPDATE focus_theme
      SET modul_ajar_id=?,cabang_id=?,rombel_id=?,tanggal=?,title=?,activity_summary=?,
          suggested_domains=?,teacher_prompt=?,created_by=?,updated_at=?
      WHERE id=?
    `).run(...values, before.id);
    audit(req.user, 'update', 'focus_theme', before.id, { cabang_id: cabangId, before, after: d });
    return res.json({ id: before.id, action: 'updated' });
  }

  const r = db.prepare(`
    INSERT INTO focus_theme
      (modul_ajar_id,cabang_id,rombel_id,tanggal,title,activity_summary,suggested_domains,teacher_prompt,created_by,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)
  `).run(...values, now);
  audit(req.user, 'create', 'focus_theme', r.lastInsertRowid, { cabang_id: cabangId, after: d });
  res.json({ id: r.lastInsertRowid, action: 'created' });
});

module.exports = router;
