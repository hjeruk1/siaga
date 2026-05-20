# Daily Record V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Daily Record V2 so teachers use weekly Modul Ajar, daily Focus Theme, and required child-specific observation notes in daily records.

**Architecture:** Add first-class backend tables and routes for `modul_ajar` and `focus_theme`, then extend `laporan_harian` with Focus Theme linkage and observation fields. Keep existing daily record draft/publish/comment/attachment behavior, while adding publish validation and parent-facing rendering for Focus Theme and child observation.

**Tech Stack:** Node.js, Express, better-sqlite3, React/Vite, plain CSS/Tailwind classes, `node:test` regression tests.

---

## File Structure

- Modify `backend/db.js`: schema for `modul_ajar`, `focus_theme`, and new `laporan_harian` columns.
- Create `backend/routes/modulAjar.js`: Modul Ajar and Focus Theme CRUD API.
- Modify `backend/server.js`: mount `/api/modul-ajar`.
- Modify `backend/routes/dailyRecord.js`: include Focus Theme data, save observation fields, validate publish completion.
- Modify `frontend/src/api.js`: add Modul Ajar and Focus Theme API methods.
- Modify `frontend/src/views/GuruView.jsx`: add Focus Theme setup banner/modal and V2 child observation fields.
- Modify `frontend/src/views/WaliView.jsx`: show Focus Theme and child observation in parent view.
- Modify `scripts/workflow-regression.test.js`: add backend regression coverage.
- Create `scripts/daily-record-v2.test.js`: focused API tests for Modul Ajar, Focus Theme, and Daily Record V2 validation.
- Optionally modify `docs/siaga-documentation.md`: summarize the V2 workflow after implementation passes.

## Task 1: Database Schema

**Files:**
- Modify: `backend/db.js`
- Test: `scripts/daily-record-v2.test.js`

- [ ] **Step 1: Add schema assertions to a new focused test file**

Create `scripts/daily-record-v2.test.js`:

```js
const { describe, it } = require('node:test');
const assert = require('node:assert');
const db = require('../backend/db');

function tableColumns(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
}

describe('daily record v2 schema', () => {
  it('creates modul_ajar and focus_theme tables', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
    assert.ok(tables.includes('modul_ajar'));
    assert.ok(tables.includes('focus_theme'));
  });

  it('adds v2 columns to laporan_harian', () => {
    const columns = tableColumns('laporan_harian');
    assert.ok(columns.includes('focus_theme_id'));
    assert.ok(columns.includes('observation_domain'));
    assert.ok(columns.includes('observation_note'));
    assert.ok(columns.includes('parent_note'));
    assert.ok(columns.includes('structured_observation_json'));
  });
});
```

- [ ] **Step 2: Run the schema test and verify it fails**

Run:

```bash
npm test -- --test-name-pattern "daily record v2 schema"
```

Expected: FAIL because `modul_ajar` and `focus_theme` do not exist yet.

- [ ] **Step 3: Add V2 schema to `backend/db.js`**

Insert this block before `CREATE TABLE IF NOT EXISTS laporan_harian`:

```js
CREATE TABLE IF NOT EXISTS modul_ajar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cabang_id INTEGER NOT NULL REFERENCES cabang(id),
  jenjang_id INTEGER REFERENCES jenjang(id),
  rombel_id INTEGER REFERENCES rombel(id),
  paket TEXT CHECK(paket IN ('reguler','full_day','care')),
  title TEXT NOT NULL,
  week_start TEXT NOT NULL,
  week_end TEXT NOT NULL,
  goals TEXT NOT NULL DEFAULT '[]',
  suggested_activities TEXT NOT NULL DEFAULT '[]',
  suggested_domains TEXT NOT NULL DEFAULT '[]',
  attachment_url TEXT,
  created_by INTEGER REFERENCES pengguna(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_modul_ajar_scope ON modul_ajar(cabang_id,jenjang_id,rombel_id,week_start,week_end);

CREATE TABLE IF NOT EXISTS focus_theme (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modul_ajar_id INTEGER REFERENCES modul_ajar(id),
  cabang_id INTEGER NOT NULL REFERENCES cabang(id),
  rombel_id INTEGER NOT NULL REFERENCES rombel(id),
  tanggal TEXT NOT NULL,
  title TEXT NOT NULL,
  activity_summary TEXT,
  suggested_domains TEXT NOT NULL DEFAULT '[]',
  teacher_prompt TEXT,
  created_by INTEGER REFERENCES pengguna(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(rombel_id,tanggal)
);

CREATE INDEX IF NOT EXISTS idx_focus_theme_date ON focus_theme(cabang_id,rombel_id,tanggal);
```

Add these migration guards after the existing `ALTER TABLE` guards:

```js
try { db.prepare('ALTER TABLE laporan_harian ADD COLUMN focus_theme_id INTEGER REFERENCES focus_theme(id)').run(); } catch {}
try { db.prepare('ALTER TABLE laporan_harian ADD COLUMN observation_domain TEXT').run(); } catch {}
try { db.prepare('ALTER TABLE laporan_harian ADD COLUMN observation_note TEXT').run(); } catch {}
try { db.prepare('ALTER TABLE laporan_harian ADD COLUMN parent_note TEXT').run(); } catch {}
try { db.prepare("ALTER TABLE laporan_harian ADD COLUMN structured_observation_json TEXT NOT NULL DEFAULT '{}'").run(); } catch {}
try { db.prepare('CREATE INDEX IF NOT EXISTS idx_laporan_focus_theme ON laporan_harian(focus_theme_id)').run(); } catch {}
```

- [ ] **Step 4: Run the schema test and verify it passes**

Run:

```bash
npm test -- --test-name-pattern "daily record v2 schema"
```

Expected: PASS for both schema tests.

- [ ] **Step 5: Commit if the workspace is a git repository**

Run:

```bash
git status --short
git add backend/db.js scripts/daily-record-v2.test.js
git commit -m "feat: add daily record v2 schema"
```

Expected in this current workspace: `git status` may fail because this folder is not a git repository. If it fails with `fatal: not a git repository`, skip the commit and continue.

## Task 2: Modul Ajar and Focus Theme API

**Files:**
- Create: `backend/routes/modulAjar.js`
- Modify: `backend/server.js`
- Test: `scripts/daily-record-v2.test.js`

- [ ] **Step 1: Add API tests for Modul Ajar and Focus Theme**

Append this code to `scripts/daily-record-v2.test.js`:

```js
const http = require('node:http');

const BASE = process.env.TEST_URL || 'http://localhost:3001';
let adminToken = '';

function req(method, path, body, token = adminToken) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const data = body === undefined ? undefined : JSON.stringify(body);
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const request = http.request(url, { method, headers }, response => {
      let raw = '';
      response.on('data', chunk => raw += chunk);
      response.on('end', () => {
        let parsed = {};
        try { parsed = JSON.parse(raw); } catch { parsed = raw; }
        resolve({ status: response.statusCode, body: parsed });
      });
    });
    request.on('error', reject);
    if (data) request.write(data);
    request.end();
  });
}

async function loginAdmin() {
  const response = await req('POST', '/api/auth/login', {
    tipe: 'staff',
    username: 'admin',
    password: process.env.TEST_ADMIN_PASSWORD || 'admin123'
  }, undefined, '');
  assert.equal(response.status, 200, JSON.stringify(response.body));
  adminToken = response.body.token;
}

async function firstMaster() {
  const cabang = await req('GET', '/api/master/cabang');
  const jenjang = await req('GET', '/api/master/jenjang');
  assert.equal(cabang.status, 200);
  assert.equal(jenjang.status, 200);
  const activeCabang = cabang.body.find(c => c.aktif) || cabang.body[0];
  const activeJenjang = jenjang.body[0];
  const rombel = await req('GET', `/api/master/rombel?cabang_id=${activeCabang.id}`);
  assert.equal(rombel.status, 200);
  assert.ok(rombel.body[0]);
  return { cabang: activeCabang, jenjang: activeJenjang, rombel: rombel.body[0] };
}

describe('daily record v2 API', () => {
  it('creates a Modul Ajar and Focus Theme', async () => {
    await loginAdmin();
    const master = await firstMaster();
    const title = `Modul Bermedsos ${Date.now()}`;

    const createModule = await req('POST', '/api/modul-ajar', {
      cabang_id: master.cabang.id,
      jenjang_id: master.jenjang.id,
      title,
      week_start: '2026-05-18',
      week_end: '2026-05-22',
      goals: ['Anak mengenal penggunaan media sosial secara aman'],
      suggested_activities: ['Diskusi gambar konten kreator', 'Membuat poster sederhana'],
      suggested_domains: ['Akhlak / agama', 'Bahasa / literasi']
    });
    assert.equal(createModule.status, 200, JSON.stringify(createModule.body));
    assert.ok(createModule.body.id);

    const listModules = await req('GET', `/api/modul-ajar?cabang_id=${master.cabang.id}&tanggal=2026-05-19`);
    assert.equal(listModules.status, 200);
    assert.ok(listModules.body.some(m => m.id === createModule.body.id));

    const theme = await req('POST', '/api/modul-ajar/focus-theme', {
      modul_ajar_id: createModule.body.id,
      cabang_id: master.cabang.id,
      rombel_id: master.rombel.id,
      tanggal: '2026-05-19',
      title: 'Konten baik untuk teman',
      activity_summary: 'Anak berdiskusi tentang contoh konten yang sopan.',
      suggested_domains: ['Akhlak / agama', 'Bahasa / literasi'],
      teacher_prompt: 'Amati bagaimana anak memilih kata yang baik.'
    });
    assert.equal(theme.status, 200, JSON.stringify(theme.body));
    assert.ok(theme.body.id);

    const todayTheme = await req('GET', `/api/modul-ajar/focus-theme?rombel_id=${master.rombel.id}&tanggal=2026-05-19`);
    assert.equal(todayTheme.status, 200);
    assert.equal(todayTheme.body.title, 'Konten baik untuk teman');
  });
});
```

- [ ] **Step 2: Run the API test and verify it fails**

Run with the backend already running:

```bash
npm test -- --test-name-pattern "daily record v2 API"
```

Expected: FAIL with 404 for `/api/modul-ajar`.

- [ ] **Step 3: Create `backend/routes/modulAjar.js`**

Create the route file with this implementation:

```js
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
  return {
    ...row,
    suggested_domains: parseJson(row.suggested_domains)
  };
}

function scopeCabang(req, explicitCabangId) {
  return req.user.role === 'admin' ? explicitCabangId : req.user.cabang_id;
}

router.get('/', auth(['admin', 'admin_cabang', 'kepsek', 'guru']), (req, res) => {
  const cabangId = scopeCabang(req, req.query.cabang_id);
  if (!cabangId) return res.status(400).json({ error: 'Cabang wajib' });
  if (!requireCabang(req, res, cabangId)) return;
  const tanggal = req.query.tanggal || null;
  const params = [cabangId];
  let where = 'WHERE ma.cabang_id=?';
  if (tanggal) {
    where += ' AND ma.week_start<=? AND ma.week_end>=?';
    params.push(tanggal, tanggal);
  }
  const rows = db.prepare(`
    SELECT ma.*,c.nama AS cabang_nama,j.nama AS jenjang_nama,r.nama AS rombel_nama,p.display_name AS created_by_name
    FROM modul_ajar ma
    JOIN cabang c ON c.id=ma.cabang_id
    LEFT JOIN jenjang j ON j.id=ma.jenjang_id
    LEFT JOIN rombel r ON r.id=ma.rombel_id
    LEFT JOIN pengguna p ON p.id=ma.created_by
    ${where}
    ORDER BY ma.week_start DESC, ma.id DESC
  `).all(...params);
  res.json(rows.map(moduleRow));
});

router.post('/', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const d = req.body || {};
  const cabangId = scopeCabang(req, d.cabang_id);
  if (!cabangId) return res.status(400).json({ error: 'Cabang wajib' });
  if (!requireCabang(req, res, cabangId)) return;
  if (!d.title || !d.week_start || !d.week_end) return res.status(400).json({ error: 'Judul dan periode wajib' });
  const now = nowUtc();
  const result = db.prepare(`INSERT INTO modul_ajar
    (cabang_id,jenjang_id,rombel_id,paket,title,week_start,week_end,goals,suggested_activities,suggested_domains,attachment_url,created_by,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(
      cabangId,
      d.jenjang_id || null,
      d.rombel_id || null,
      d.paket || null,
      d.title,
      d.week_start,
      d.week_end,
      JSON.stringify(Array.isArray(d.goals) ? d.goals : []),
      JSON.stringify(Array.isArray(d.suggested_activities) ? d.suggested_activities : []),
      JSON.stringify(Array.isArray(d.suggested_domains) ? d.suggested_domains : []),
      d.attachment_url || null,
      req.user.id,
      now,
      now
    );
  audit(req.user, 'create', 'modul_ajar', result.lastInsertRowid, { cabang_id: cabangId, after: d });
  res.json({ id: result.lastInsertRowid });
});

router.get('/focus-theme', auth(['admin', 'admin_cabang', 'kepsek', 'guru']), (req, res) => {
  const rombelId = req.query.rombel_id;
  const tanggal = req.query.tanggal;
  if (!rombelId || !tanggal) return res.status(400).json({ error: 'Rombel dan tanggal wajib' });
  const row = db.prepare(`
    SELECT ft.*,ma.title AS modul_ajar_title
    FROM focus_theme ft
    LEFT JOIN modul_ajar ma ON ma.id=ft.modul_ajar_id
    WHERE ft.rombel_id=? AND ft.tanggal=?
  `).get(rombelId, tanggal);
  if (!row) return res.json(null);
  if (!requireCabang(req, res, row.cabang_id)) return;
  res.json(themeRow(row));
});

router.post('/focus-theme', auth(['guru', 'admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const d = req.body || {};
  if (!d.cabang_id || !d.rombel_id || !d.tanggal || !d.title) return res.status(400).json({ error: 'Cabang, rombel, tanggal, dan tema wajib' });
  if (!requireCabang(req, res, d.cabang_id)) return;
  const now = nowUtc();
  const existing = db.prepare('SELECT * FROM focus_theme WHERE rombel_id=? AND tanggal=?').get(d.rombel_id, d.tanggal);
  const domains = JSON.stringify(Array.isArray(d.suggested_domains) ? d.suggested_domains : []);
  if (existing) {
    db.prepare(`UPDATE focus_theme SET modul_ajar_id=?,title=?,activity_summary=?,suggested_domains=?,teacher_prompt=?,created_by=?,updated_at=? WHERE id=?`)
      .run(d.modul_ajar_id || null, d.title, d.activity_summary || null, domains, d.teacher_prompt || null, req.user.id, now, existing.id);
    audit(req.user, 'update', 'focus_theme', existing.id, { cabang_id: existing.cabang_id, before: existing, after: d });
    return res.json({ id: existing.id, action: 'updated' });
  }
  const result = db.prepare(`INSERT INTO focus_theme
    (modul_ajar_id,cabang_id,rombel_id,tanggal,title,activity_summary,suggested_domains,teacher_prompt,created_by,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .run(d.modul_ajar_id || null, d.cabang_id, d.rombel_id, d.tanggal, d.title, d.activity_summary || null, domains, d.teacher_prompt || null, req.user.id, now, now);
  audit(req.user, 'create', 'focus_theme', result.lastInsertRowid, { cabang_id: d.cabang_id, after: d });
  res.json({ id: result.lastInsertRowid, action: 'created' });
});

module.exports = router;
```

- [ ] **Step 4: Mount the route in `backend/server.js`**

Add this line after the master route:

```js
app.use('/api/modul-ajar', require('./routes/modulAjar'));
```

- [ ] **Step 5: Restart backend and run the focused API test**

Run:

```bash
npm start
npm test -- --test-name-pattern "daily record v2 API"
```

Expected: PASS for the Modul Ajar and Focus Theme API test.

## Task 3: Daily Record V2 Backend Integration

**Files:**
- Modify: `backend/routes/dailyRecord.js`
- Test: `scripts/daily-record-v2.test.js`

- [ ] **Step 1: Add tests for Daily Record V2 save and publish validation**

Append this test inside `describe('daily record v2 API', ...)` in `scripts/daily-record-v2.test.js`:

```js
it('requires focus theme and observation fields before publishing daily record', async () => {
  if (!adminToken) await loginAdmin();
  const master = await firstMaster();
  const suffix = Date.now();
  const siswa = await req('POST', '/api/siswa', {
    nama: `Daily V2 ${suffix}`,
    nis: `daily-v2-${suffix}`,
    cabang_id: master.cabang.id,
    jenjang_id: master.jenjang.id,
    rombel_id: master.rombel.id,
    paket: 'reguler',
    tanggal_mulai: '2026-01-01'
  });
  assert.equal(siswa.status, 200, JSON.stringify(siswa.body));

  const draft = await req('POST', '/api/daily-record', {
    siswa_id: siswa.body.id,
    tanggal: '2026-05-20',
    mood: 'ceria',
    makan: 'habis',
    tidur: 1
  });
  assert.equal(draft.status, 200, JSON.stringify(draft.body));

  const publishWithoutTheme = await req('POST', `/api/daily-record/${draft.body.id}/publish`, {});
  assert.equal(publishWithoutTheme.status, 400);
  assert.match(publishWithoutTheme.body.error, /Focus Theme/i);

  const module = await req('POST', '/api/modul-ajar', {
    cabang_id: master.cabang.id,
    jenjang_id: master.jenjang.id,
    title: `Module for publish ${suffix}`,
    week_start: '2026-05-18',
    week_end: '2026-05-22',
    goals: ['Mengenal konten baik'],
    suggested_activities: ['Diskusi'],
    suggested_domains: ['Akhlak / agama']
  });
  assert.equal(module.status, 200);
  const theme = await req('POST', '/api/modul-ajar/focus-theme', {
    modul_ajar_id: module.body.id,
    cabang_id: master.cabang.id,
    rombel_id: master.rombel.id,
    tanggal: '2026-05-20',
    title: 'Konten baik untuk teman',
    activity_summary: 'Diskusi contoh konten baik.',
    suggested_domains: ['Akhlak / agama']
  });
  assert.equal(theme.status, 200);

  const incomplete = await req('POST', `/api/daily-record/${draft.body.id}/publish`, {});
  assert.equal(incomplete.status, 400);
  assert.match(incomplete.body.error, /observasi/i);

  const complete = await req('POST', '/api/daily-record', {
    siswa_id: siswa.body.id,
    tanggal: '2026-05-20',
    mood: 'ceria',
    makan: 'habis',
    tidur: 1,
    focus_theme_id: theme.body.id,
    observation_domain: 'Akhlak / agama',
    observation_note: 'A mau memilih kata yang sopan saat berdiskusi tentang konten baik.',
    parent_note: 'A antusias saat bercerita di kelas.'
  });
  assert.equal(complete.status, 200, JSON.stringify(complete.body));

  const published = await req('POST', `/api/daily-record/${draft.body.id}/publish`, {});
  assert.equal(published.status, 200, JSON.stringify(published.body));

  const detail = await req('GET', `/api/daily-record/${draft.body.id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.focus_theme_title, 'Konten baik untuk teman');
  assert.equal(detail.body.observation_domain, 'Akhlak / agama');
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npm test -- --test-name-pattern "requires focus theme"
```

Expected: FAIL because daily record does not save V2 fields or validate publish yet.

- [ ] **Step 3: Add parse and completion helpers to `backend/routes/dailyRecord.js`**

After `parseActivities`, add:

```js
function parseJsonArray(v) {
  if (Array.isArray(v)) return v;
  try {
    const parsed = JSON.parse(v || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(v) {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  try {
    const parsed = JSON.parse(v || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
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
```

- [ ] **Step 4: Extend `withDetails` to include parsed V2 objects**

Change the return object in `withDetails` to:

```js
  return {
    ...l,
    aktivitas: parseActivities(l.aktivitas),
    focus_theme_domains: parseJsonArray(l.focus_theme_domains),
    structured_observation: parseJsonObject(l.structured_observation_json),
    attachments,
    comments,
    read
  };
```

- [ ] **Step 5: Join Focus Theme in daily detail/history/admin queries**

In each `SELECT l.*, ... FROM laporan_harian l` query for detail/history/admin history, add these selected columns:

```sql
ft.title AS focus_theme_title,
ft.activity_summary AS focus_theme_activity_summary,
ft.suggested_domains AS focus_theme_domains,
ma.title AS modul_ajar_title
```

Add these joins after existing `JOIN jenjang j...`:

```sql
LEFT JOIN focus_theme ft ON ft.id=l.focus_theme_id
LEFT JOIN modul_ajar ma ON ma.id=ft.modul_ajar_id
```

- [ ] **Step 6: Include Focus Theme status in `/today`**

In `/today`, extend the select list with:

```sql
ft.id AS focus_theme_id,
ft.title AS focus_theme_title,
ft.activity_summary AS focus_theme_activity_summary,
ft.suggested_domains AS focus_theme_domains,
l.mood,l.makan,l.tidur,l.aktivitas,l.catatan,l.observation_domain,l.observation_note,l.parent_note
```

Add:

```sql
LEFT JOIN focus_theme ft ON ft.rombel_id=se_scope.rombel_id AND ft.tanggal=?
```

Because `/today` already binds `tanggal` once for `laporan_harian`, update `.all(...)` to pass the date twice:

```js
  `).all(tanggal, tanggal, ...scope.params);
```

- [ ] **Step 7: Save V2 fields in `POST /api/daily-record`**

Before insert/update, derive:

```js
  const structured = JSON.stringify(d.structured_observation && typeof d.structured_observation === 'object' ? d.structured_observation : {});
  const focusThemeId = d.focus_theme_id || null;
  const observationDomain = String(d.observation_domain || '').trim() || null;
  const observationNote = String(d.observation_note || '').trim() || null;
  const parentNote = String(d.parent_note || '').trim() || null;
```

Update the existing update SQL to:

```js
    db.prepare(`UPDATE laporan_harian SET mood=?,makan=?,tidur=?,aktivitas=?,catatan=?,focus_theme_id=?,observation_domain=?,observation_note=?,parent_note=?,structured_observation_json=?,guru_id=?,updated_at=?,
      last_published_change_at=CASE WHEN status='published' THEN ? ELSE last_published_change_at END WHERE id=?`)
      .run(d.mood || null, d.makan || null, tidur, akt, d.catatan || null, focusThemeId, observationDomain, observationNote, parentNote, structured, req.user.id, nowUtc(), nowUtc(), existing.id);
```

Update the insert SQL to include the new columns:

```js
  const r = db.prepare(`INSERT INTO laporan_harian
    (siswa_id,cabang_id,jenjang_id,rombel_id,paket,tanggal,guru_id,status,mood,makan,tidur,aktivitas,catatan,focus_theme_id,observation_domain,observation_note,parent_note,structured_observation_json,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,'draft',?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(d.siswa_id, e.cabang_id, e.jenjang_id, e.rombel_id, e.paket, tgl, req.user.id, d.mood || null, d.makan || null, tidur, akt, d.catatan || null, focusThemeId, observationDomain, observationNote, parentNote, structured, nowUtc(), nowUtc());
```

- [ ] **Step 8: Validate Focus Theme belongs to the same rombel/date**

Before saving when `focusThemeId` is present, add:

```js
  if (focusThemeId) {
    const theme = db.prepare('SELECT * FROM focus_theme WHERE id=?').get(focusThemeId);
    if (!theme) return res.status(400).json({ error: 'Focus Theme tidak ditemukan' });
    if (Number(theme.rombel_id) !== Number(e.rombel_id) || theme.tanggal !== tgl) {
      return res.status(400).json({ error: 'Focus Theme tidak sesuai rombel atau tanggal siswa' });
    }
  }
```

- [ ] **Step 9: Validate completion in publish**

In `POST /:id/publish`, before setting status to published, add:

```js
  const completionError = dailyCompletionError(l);
  if (completionError) return res.status(400).json({ error: completionError });
```

- [ ] **Step 10: Run focused tests**

Run:

```bash
npm test -- --test-name-pattern "requires focus theme"
```

Expected: PASS.

## Task 4: Frontend API Methods

**Files:**
- Modify: `frontend/src/api.js`

- [ ] **Step 1: Add API wrapper methods**

Add these methods after `operasionalConfig` methods:

```js
  modulAjar:(params={})=>req('GET','/api/modul-ajar'+qs(params)),
  createModulAjar:d=>req('POST','/api/modul-ajar',d),
  focusTheme:(params={})=>req('GET','/api/modul-ajar/focus-theme'+qs(params)),
  saveFocusTheme:d=>req('POST','/api/modul-ajar/focus-theme',d),
```

- [ ] **Step 2: Build frontend**

Run:

```bash
npm run build
```

Expected: frontend build completes without syntax errors.

## Task 5: Guru Daily Record UI

**Files:**
- Modify: `frontend/src/views/GuruView.jsx`

- [ ] **Step 1: Add observation domain constants**

Near existing `AKTIVITAS` constants, add:

```js
const OBS_DOMAINS=['Akhlak / agama','Mandiri / jati diri','Sosial-emosional','Bahasa / literasi','Kognitif / STEAM','Motorik','Seni / kreativitas'];
```

- [ ] **Step 2: Load Focus Theme and Modul Ajar in `GuruView`**

Add state:

```js
  const[focusTheme,setFocusTheme]=useState(null);
  const[focusThemeOpen,setFocusThemeOpen]=useState(false);
```

Add loader:

```js
  async function loadFocusTheme(){
    const first=list[0];
    if(!first?.rombel_id)return;
    const d=await api.focusTheme({rombel_id:first.rombel_id,tanggal});
    setFocusTheme(d);
  }
```

Add effect:

```js
  useEffect(()=>{if(tab==='daily'&&list.length)loadFocusTheme().catch(()=>setFocusTheme(null));},[tab,tanggal,list.length]);
```

- [ ] **Step 3: Show Focus Theme banner above the daily list**

Inside `tab==='daily'` before the two-column section, add:

```jsx
      <section className={`rounded-2xl border p-4 ${focusTheme?'bg-emerald-50 border-emerald-200':'bg-amber-50 border-amber-300'}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className={`text-xs font-black ${focusTheme?'text-emerald-700':'text-amber-700'}`}>FOCUS THEME HARI INI</p>
            <h2 className="font-black text-slate-900">{focusTheme?.title||'Belum ada focus theme'}</h2>
            <p className="text-sm text-slate-600">{focusTheme?.activity_summary||'Buat focus theme dari Modul Ajar sebelum publish daily record.'}</p>
          </div>
          <button onClick={()=>setFocusThemeOpen(true)} className={focusTheme?'btn-secondary':'btn'}>{focusTheme?'Edit Focus Theme':'Buat Focus Theme'}</button>
        </div>
      </section>
```

- [ ] **Step 4: Add `FocusThemeModal` component**

Add this component below `HistoryModal`:

```jsx
function FocusThemeModal({tanggal,row,focusTheme,onSaved,onClose,toast}){
  const[modules,setModules]=useState([]);
  const[form,setForm]=useState(()=>({
    modul_ajar_id:focusTheme?.modul_ajar_id||'',
    cabang_id:row?.cabang_id||focusTheme?.cabang_id||'',
    rombel_id:row?.rombel_id||focusTheme?.rombel_id||'',
    tanggal,
    title:focusTheme?.title||'',
    activity_summary:focusTheme?.activity_summary||'',
    suggested_domains:focusTheme?.suggested_domains||[],
    teacher_prompt:focusTheme?.teacher_prompt||''
  }));
  useEffect(()=>{if(row?.cabang_id)api.modulAjar({cabang_id:row.cabang_id,tanggal}).then(setModules).catch(()=>setModules([]));},[row?.cabang_id,tanggal]);
  function toggleDomain(d){setForm(f=>({...f,suggested_domains:f.suggested_domains.includes(d)?f.suggested_domains.filter(x=>x!==d):[...f.suggested_domains,d]}));}
  async function save(){
    try{
      await api.saveFocusTheme(form);
      toast('ok','Focus Theme tersimpan');
      onSaved();
    }catch(e){toast('err',e.message);}
  }
  return <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center p-3" onClick={onClose}>
    <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-2xl p-4 space-y-4" onClick={e=>e.stopPropagation()}>
      <div className="flex justify-between gap-3"><div><h2 className="font-black text-slate-900">Focus Theme</h2><p className="text-sm text-slate-500">{tanggal} - {row?.rombel_nama}</p></div><button onClick={onClose} className="link">Tutup</button></div>
      <select value={form.modul_ajar_id} onChange={e=>setForm(f=>({...f,modul_ajar_id:e.target.value}))} className="input w-full">
        <option value="">Pilih Modul Ajar</option>{modules.map(m=><option key={m.id} value={m.id}>{m.title} ({m.week_start} - {m.week_end})</option>)}
      </select>
      <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} className="input w-full" placeholder="Tema inti hari ini"/>
      <textarea value={form.activity_summary} onChange={e=>setForm(f=>({...f,activity_summary:e.target.value}))} className="input w-full min-h-24" placeholder="Ringkasan aktivitas utama"/>
      <div><p className="label mb-2">Domain fokus</p><div className="flex flex-wrap gap-2">{OBS_DOMAINS.map(d=><button key={d} type="button" onClick={()=>toggleDomain(d)} className={`px-3 py-1.5 rounded-xl text-xs font-black border ${form.suggested_domains.includes(d)?'bg-amber-500 text-white border-amber-500':'bg-white text-slate-600 border-slate-200'}`}>{d}</button>)}</div></div>
      <textarea value={form.teacher_prompt} onChange={e=>setForm(f=>({...f,teacher_prompt:e.target.value}))} className="input w-full min-h-20" placeholder="Prompt observasi untuk guru"/>
      <button onClick={save} className="btn w-full">Simpan Focus Theme</button>
    </div>
  </div>;
}
```

- [ ] **Step 5: Render `FocusThemeModal`**

Near the existing modal renders at the bottom of `GuruView`, add:

```jsx
    {focusThemeOpen&&<FocusThemeModal tanggal={tanggal} row={list[0]} focusTheme={focusTheme} toast={toast} onSaved={()=>{setFocusThemeOpen(false);loadFocusTheme();load();}} onClose={()=>setFocusThemeOpen(false)}/>}
```

- [ ] **Step 6: Initialize new daily fields in `open(row)`**

Change the empty detail object to include:

```js
focus_theme_id:focusTheme?.id||row.focus_theme_id||null,
focus_theme_title:focusTheme?.title||row.focus_theme_title||null,
observation_domain:null,
observation_note:'',
parent_note:''
```

- [ ] **Step 7: Add V2 fields in `Editor`**

After the aktivitas block, add:

```jsx
      <div>
        <p className="text-xs font-black text-slate-500 mb-2">TEMA INTI</p>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <div className="font-black text-emerald-900">{detail.focus_theme_title||'Focus Theme belum dibuat'}</div>
          {detail.focus_theme_activity_summary&&<div className="text-sm text-emerald-800 mt-1">{detail.focus_theme_activity_summary}</div>}
        </div>
      </div>
      <div>
        <p className="text-xs font-black text-slate-500 mb-2">DOMAIN OBSERVASI</p>
        <div className="flex flex-wrap gap-2">{OBS_DOMAINS.map(d=><button key={d} onClick={()=>tap('observation_domain',d)} className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 ${detail.observation_domain===d?'bg-emerald-600 text-white border-emerald-600':'border-slate-200 text-slate-600 hover:border-emerald-300'}`}>{d}</button>)}</div>
      </div>
      <div>
        <p className="text-xs font-black text-slate-500 mb-2">CATATAN OBSERVASI ANAK</p>
        <textarea value={detail.observation_note||''} onChange={e=>update('observation_note',e.target.value)} rows={3} placeholder="Contoh: Saat kegiatan meronce, A mencoba memilih warna sendiri dan menyelesaikan pola sederhana." className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"/>
        <button onClick={()=>tap('observation_note',detail.observation_note||'')} className="mt-2 w-full py-2.5 bg-emerald-600 text-white font-black rounded-xl text-sm hover:bg-emerald-700">Simpan Observasi</button>
      </div>
      <div>
        <p className="text-xs font-black text-slate-500 mb-2">CATATAN TAMBAHAN UNTUK WALI</p>
        <textarea value={detail.parent_note||''} onChange={e=>update('parent_note',e.target.value)} rows={2} placeholder="Opsional: pesan tambahan untuk wali..." className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"/>
        <button onClick={()=>tap('parent_note',detail.parent_note||'')} className="mt-2 w-full py-2.5 bg-slate-700 text-white font-black rounded-xl text-sm hover:bg-slate-800">Simpan Catatan Wali</button>
      </div>
```

- [ ] **Step 8: Include focus theme id in `tap` payload**

In `tap`, ensure payload includes:

```js
focus_theme_id:detail.focus_theme_id||row.focus_theme_id||null
```

- [ ] **Step 9: Build frontend**

Run:

```bash
npm run build
```

Expected: PASS.

## Task 6: Parent View Rendering

**Files:**
- Modify: `frontend/src/views/WaliView.jsx`

- [ ] **Step 1: Show Focus Theme and observation in `Record`**

After the care info grid, add:

```jsx
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
      <div className="label text-emerald-700">Tema Inti Hari Ini</div>
      <div className="font-black text-emerald-900">{detail.focus_theme_title||'-'}</div>
      {detail.focus_theme_activity_summary&&<div className="text-sm text-emerald-800 mt-1">{detail.focus_theme_activity_summary}</div>}
    </div>
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="label">Observasi Anak</div>
      <div className="text-xs font-black text-slate-500 mb-1">{detail.observation_domain||'-'}</div>
      <div className="text-sm text-slate-800 whitespace-pre-wrap">{detail.observation_note||detail.catatan||'-'}</div>
    </div>
    {detail.parent_note&&<div><div className="label">Catatan Guru</div><div className="text-sm text-slate-800 whitespace-pre-wrap">{detail.parent_note}</div></div>}
```

- [ ] **Step 2: Update comment input placeholder**

Change the feedback input placeholder to:

```jsx
placeholder="Bagikan info dari rumah atau respons anak"
```

- [ ] **Step 3: Build frontend**

Run:

```bash
npm run build
```

Expected: PASS.

## Task 7: Regression Verification

**Files:**
- Test: `scripts/daily-record-v2.test.js`
- Test: `scripts/workflow-regression.test.js`

- [ ] **Step 1: Run focused V2 tests**

Run:

```bash
node --test scripts/daily-record-v2.test.js
```

Expected: all V2 schema/API tests pass.

- [ ] **Step 2: Run existing API smoke tests**

Run:

```bash
npm test
```

Expected: existing API tests pass.

- [ ] **Step 3: Run workflow regression tests**

Run:

```bash
npm run test:workflow
```

Expected: workflow regression tests pass, especially daily record history/comment scenarios.

- [ ] **Step 4: Run frontend build**

Run:

```bash
npm run build
```

Expected: build completes and writes frontend dist assets.

## Task 8: Documentation Update

**Files:**
- Modify: `docs/siaga-documentation.md`
- Reference: `docs/superpowers/specs/2026-05-19-daily-record-v2-design.md`

- [ ] **Step 1: Add V2 summary under Daily Record section**

In `docs/siaga-documentation.md`, add this paragraph near the existing daily record rules:

```md
Daily Record V2 links parent-facing daily records to academic planning. Akademik/admin/kepsek can create weekly Modul Ajar. Guru creates a daily Focus Theme per rombel from the Modul Ajar. Each child daily record inherits the Focus Theme and requires care update fields plus one observation domain and one short objective child-specific observation note before publish.
```

- [ ] **Step 2: Add publish requirement note**

Add this bullet under daily record publish requirements:

```md
- V2 publish requires a Focus Theme for the rombel/date, an observation domain, and a short child-specific observation note.
```

- [ ] **Step 3: Verify docs search**

Run:

```bash
rg -n "Daily Record V2|Focus Theme|Modul Ajar|observation domain" docs/siaga-documentation.md docs/superpowers/specs/2026-05-19-daily-record-v2-design.md
```

Expected: results include both the implementation documentation and the design spec.

## Self-Review

Spec coverage:

- Modul Ajar: Task 1 schema, Task 2 API, Task 5 UI linkage.
- Focus Theme: Task 1 schema, Task 2 API, Task 5 banner/modal.
- Daily record care fields: preserved in Task 3 and Task 5.
- Domain tag + short note: Task 3 backend fields/validation, Task 5 UI, Task 6 parent view.
- Publish requires Focus Theme and completion: Task 3.
- Parent output: Task 6.
- Existing comments/read/attachments: preserved by modifying existing route without replacing those flows.
- Tests: Tasks 1, 2, 3, 7.

No placeholder language remains as implementation instruction. UI snippets include React `placeholder` attributes as literal UI copy, not plan placeholders.

Type consistency:

- Backend fields: `focus_theme_id`, `observation_domain`, `observation_note`, `parent_note`, `structured_observation_json`.
- Frontend detail fields use the same names.
- API methods: `modulAjar`, `createModulAjar`, `focusTheme`, `saveFocusTheme`.
