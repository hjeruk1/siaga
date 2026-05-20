# SIAGA UI Workflow Logic Repairs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the highest-risk SIAGA UI/UX, workflow, and logic gaps found in the 2026-05-17 audit.

**Architecture:** Fix the backend state machines and access helpers first, then align frontend actions to the same rules. Add focused regression tests for each workflow so future UI changes cannot reintroduce role/state mismatches.

**Tech Stack:** React 18, Vite, Express, better-sqlite3, Node test runner, SQLite.

---

## File Structure

- Modify: `backend/routes/penjemputan.js`
- Modify: `backend/routes/absensi.js`
- Modify: `backend/routes/billing.js`
- Modify: `backend/routes/dailyRecord.js`
- Modify: `backend/routes/siswa.js`
- Modify: `backend/utils/workflow.js`
- Modify: `backend/package.json`
- Modify: `package.json`
- Modify: `scripts/test.js`
- Create: `scripts/workflow-regression.test.js`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/api.js`
- Modify: `frontend/src/views/AdminView.jsx`
- Modify: `frontend/src/views/GuruView.jsx`
- Modify: `frontend/src/views/GerbangView.jsx`
- Modify: `frontend/src/views/WaliView.jsx`
- Create: `frontend/src/components/ConfirmAction.jsx`
- Update: `docs/implementation-tracker.md`

## Task 1: Stabilize Test Server Workflow

**Files:**

- Modify: `backend/package.json`
- Modify: `package.json`
- Modify: `scripts/test.js`

- [ ] **Step 1: Add a non-watch backend script**

Change `backend/package.json` scripts to:

```json
{
  "dev": "node --watch server.js",
  "dev:stable": "node server.js",
  "start": "node server.js"
}
```

- [ ] **Step 2: Add a root stable backend helper**

Change root `package.json` scripts to include:

```json
{
  "dev": "concurrently \"npm run dev --prefix backend\" \"npm run dev --prefix frontend\"",
  "dev:stable": "concurrently \"npm run dev:stable --prefix backend\" \"npm run dev --prefix frontend\"",
  "build": "npm run build --prefix frontend",
  "start": "node backend/server.js",
  "init": "node backend/init.js",
  "smoke": "node scripts/smoke.js",
  "test": "node --test scripts/test.js",
  "test:workflow": "node --test scripts/workflow-regression.test.js"
}
```

- [ ] **Step 3: Document test precondition in `scripts/test.js`**

Add this comment near the `BASE` constant:

```js
// Run against a non-watch backend. `node --watch` can restart when SQLite
// WAL/log files change, causing ECONNRESET in the middle of the suite.
```

- [ ] **Step 4: Verify stable command**

Run:

```powershell
npm run build
```

Expected: Vite build completes successfully.

Run with backend started by `npm run dev:stable` in another terminal:

```powershell
npm test
```

Expected: No `ECONNRESET` or `ECONNREFUSED`. Existing logical failures, if any, should be deterministic.

## Task 2: Fix Gerbang Handoff Role Mismatch

**Files:**

- Modify: `backend/routes/penjemputan.js`
- Modify: `frontend/src/views/GerbangView.jsx`
- Test: `scripts/workflow-regression.test.js`

- [ ] **Step 1: Write failing API regression test**

Create `scripts/workflow-regression.test.js` with this initial scaffold:

```js
const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

const BASE = process.env.TEST_URL || 'http://localhost:3001';
const adminPassword = process.env.TEST_ADMIN_PASSWORD || 'admin123';

function req(method, path, body, token) {
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

async function loginStaff(username, password = adminPassword) {
  const response = await req('POST', '/api/auth/login', { tipe: 'staff', username, password });
  assert.equal(response.status, 200, `login ${username}`);
  return response.body.token;
}

describe('workflow regressions', () => {
  let adminToken;

  before(async () => {
    adminToken = await loginStaff('admin');
  });

  it('documents test harness availability', async () => {
    const response = await req('GET', '/api/master/cabang', undefined, adminToken);
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(response.body));
  });
});
```

- [ ] **Step 2: Add gerbang handoff test data helper**

Append these helpers to `scripts/workflow-regression.test.js` before `describe`:

```js
function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function pickMaster(adminToken) {
  const cabang = await req('GET', '/api/master/cabang', undefined, adminToken);
  const jenjang = await req('GET', '/api/master/jenjang', undefined, adminToken);
  assert.equal(cabang.status, 200);
  assert.equal(jenjang.status, 200);
  const activeCabang = cabang.body.find(c => c.aktif);
  const kb = jenjang.body.find(j => j.nama === 'KB A') || jenjang.body[0];
  const rombel = await req('GET', `/api/master/rombel?cabang_id=${activeCabang.id}`, undefined, adminToken);
  assert.equal(rombel.status, 200);
  const targetRombel = rombel.body.find(r => r.jenjang_id === kb.id) || rombel.body[0];
  return { cabang: activeCabang, jenjang: kb, rombel: targetRombel };
}
```

- [ ] **Step 3: Add the failing test**

Append inside the `describe` block:

```js
it('allows a gerbang user to finalize a waiting pickup when UI exposes Pulang', async () => {
  const master = await pickMaster(adminToken);
  const suffix = unique('gate');

  const gerbang = await req('POST', '/api/pengguna/staff', {
    display_name: `Gerbang ${suffix}`,
    username: `gerbang.${suffix}`,
    role: 'gerbang',
    cabang_id: master.cabang.id
  }, adminToken);
  assert.equal(gerbang.status, 200);

  const siswa = await req('POST', '/api/siswa', {
    nama: `Siswa ${suffix}`,
    nis: suffix,
    cabang_id: master.cabang.id,
    jenjang_id: master.jenjang.id,
    rombel_id: master.rombel.id,
    paket: 'reguler',
    tanggal_mulai: '2026-01-01'
  }, adminToken);
  assert.equal(siswa.status, 200);

  const pickup = await req('POST', `/api/siswa/${siswa.body.id}/penjemput`, {
    nama: `Penjemput ${suffix}`,
    relasi: 'Wali'
  }, adminToken);
  assert.equal(pickup.status, 200);

  const checkin = await req('POST', '/api/absensi/checkin', {
    siswa_id: siswa.body.id,
    tanggal: '2026-05-18'
  }, adminToken);
  assert.equal(checkin.status, 200);

  const scan = await req('POST', '/api/penjemputan/scan', {
    qr_code: pickup.body.qr_code,
    tanggal: '2026-05-18'
  }, adminToken);
  assert.equal(scan.status, 200);

  const gerbangToken = await loginStaff(`gerbang.${suffix}`, gerbang.body.temporary_password);
  const change = await req('POST', '/api/auth/change-password', {
    new_password: `Gerbang${suffix}123`
  }, gerbangToken);
  assert.equal(change.status, 200);
  const activeGerbangToken = await loginStaff(`gerbang.${suffix}`, `Gerbang${suffix}123`);

  const pulang = await req('POST', '/api/penjemputan/pulang', {
    siswa_ids: [siswa.body.id],
    tanggal: '2026-05-18'
  }, activeGerbangToken);
  assert.equal(pulang.status, 200);
  assert.equal(pulang.body.count, 1);
});
```

Run:

```powershell
npm run test:workflow
```

Expected before implementation: FAIL with 403 from `/api/penjemputan/pulang`.

- [ ] **Step 4: Implement backend role fix**

Change the `pulang` route auth list in `backend/routes/penjemputan.js`:

```js
router.post('/pulang', auth(['gerbang','guru','admin','admin_cabang']), (req, res) => {
```

- [ ] **Step 5: Clarify UI copy**

Change the paragraph in `frontend/src/views/GerbangView.jsx` from:

```jsx
<p className="text-sm text-slate-500">Guru bisa finalkan dari dashboard guru; gerbang tetap bisa membantu jika perlu.</p>
```

to:

```jsx
<p className="text-sm text-slate-500">Finalkan serah terima setelah guru atau petugas memastikan siswa bertemu penjemput yang valid.</p>
```

- [ ] **Step 6: Verify**

Run:

```powershell
npm run test:workflow
npm run build
```

Expected: workflow test passes; build passes.

## Task 3: Make Tutup Hari Close Implicit Belum Students

**Files:**

- Modify: `backend/routes/absensi.js`
- Test: `scripts/workflow-regression.test.js`

- [ ] **Step 1: Add failing regression test**

Append inside `describe('workflow regressions')`:

```js
it('tutup hari creates Absen rows for students that were only implicitly Belum', async () => {
  const master = await pickMaster(adminToken);
  const suffix = unique('close-day');
  const siswa = await req('POST', '/api/siswa', {
    nama: `Belum ${suffix}`,
    nis: suffix,
    cabang_id: master.cabang.id,
    jenjang_id: master.jenjang.id,
    rombel_id: master.rombel.id,
    paket: 'reguler',
    tanggal_mulai: '2026-01-01'
  }, adminToken);
  assert.equal(siswa.status, 200);

  const close = await req('POST', '/api/absensi/tutup-hari', {
    cabang_id: master.cabang.id,
    tanggal: '2026-05-19'
  }, adminToken);
  assert.equal(close.status, 200);

  const today = await req('GET', `/api/absensi/today?cabang_id=${master.cabang.id}&tanggal=2026-05-19`, undefined, adminToken);
  assert.equal(today.status, 200);
  const row = today.body.rows.find(r => r.siswa_id === siswa.body.id);
  assert.ok(row);
  assert.equal(row.status, 'Absen');
});
```

Run:

```powershell
npm run test:workflow
```

Expected before implementation: FAIL because row remains `Belum`.

- [ ] **Step 2: Implement row materialization**

In `backend/routes/absensi.js`, replace the `remaining` query in `/tutup-hari` with:

```js
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
```

Then replace the transaction body with:

```js
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
      set_absen: details.filter(r => r.status === 'Belum').length,
      masih_menunggu: details.filter(r => r.status === 'Menunggu').length,
      masih_hadir: details.filter(r => ['Hadir','Terlambat'].includes(r.status)).length
    });
    db.prepare('INSERT INTO tutup_hari(cabang_id,tanggal,closed_by,closed_at,summary) VALUES(?,?,?,?,?)')
      .run(cabangId, tanggal, req.user.id, nowUtc(), summary);
    audit(req.user, 'tutup_hari', 'tutup_hari', null, { cabang_id: cabangId, after: { tanggal, summary } });
    return details;
  });
  try {
    const details = tx();
    res.json({ success: true, tanggal, cabang_id: cabangId, remaining_count: details.length, details });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
```

- [ ] **Step 3: Verify**

Run:

```powershell
npm run test:workflow
```

Expected: gerbang and tutup-hari tests pass.

## Task 4: Repair Billing Branch Scope and Payment State Machine

**Files:**

- Modify: `backend/routes/billing.js`
- Test: `scripts/workflow-regression.test.js`
- Modify: `frontend/src/views/AdminView.jsx`

- [ ] **Step 1: Add backend access helper imports**

Change the import in `backend/routes/billing.js` from:

```js
const { nowUtc, todayWIB, schoolYearForDate, nextSequence, requireCabang, requireActiveCabang, audit } = require('../utils/workflow');
```

to:

```js
const { nowUtc, todayWIB, schoolYearForDate, nextSequence, requireCabang, requireActiveCabang, audit, canAccessSiswa } = require('../utils/workflow');
```

- [ ] **Step 2: Add billing scope guard**

Add this function near `cabangParam`:

```js
function canReadStudentBilling(req, siswaId) {
  if (req.user.role === 'admin') return true;
  const access = canAccessSiswa(req.user, siswaId);
  if (access) return true;
  if (req.user.role === 'admin_cabang' || req.user.role === 'kepsek') {
    return !!db.prepare('SELECT 1 FROM tagihan WHERE siswa_id=? AND cabang_id=? LIMIT 1').get(siswaId, req.user.cabang_id);
  }
  return false;
}
```

- [ ] **Step 3: Apply scope guard to tagihan query**

At the start of `router.get('/tagihan'...)`, replace:

```js
  const cabangId = req.query.siswa_id ? null : cabangParam(req);
  if (cabangId && !requireCabang(req, res, cabangId)) return;
```

with:

```js
  const siswaId = req.query.siswa_id ? Number(req.query.siswa_id) : null;
  if (siswaId && !canReadStudentBilling(req, siswaId)) return res.status(403).json({ error: 'Akses tagihan siswa ditolak' });
  const cabangId = siswaId ? (req.user.role === 'admin' ? null : req.user.cabang_id) : cabangParam(req);
  if (cabangId && !requireCabang(req, res, cabangId)) return;
```

Then replace:

```js
  if (req.query.siswa_id) { where += ' AND t.siswa_id=?'; params.push(req.query.siswa_id); }
```

with:

```js
  if (siswaId) { where += ' AND t.siswa_id=?'; params.push(siswaId); }
```

- [ ] **Step 4: Constrain reject transition**

In `router.post('/pembayaran/:id/reject'...)`, after the not-found check, add:

```js
  if (p.status !== 'pending_verification') return res.status(400).json({ error: 'Pembayaran bukan pending' });
```

- [ ] **Step 5: Validate student-cabang ownership during payment creation**

In `router.post('/pembayaran'...)`, after `requireActiveCabang`, add:

```js
  const owned = db.prepare(`
    SELECT 1 FROM siswa_enrollment
    WHERE siswa_id=? AND cabang_id=? AND status='aktif'
    LIMIT 1
  `).get(d.siswa_id, cabangId);
  if (!owned) return res.status(403).json({ error: 'Siswa tidak terdaftar aktif di cabang pembayaran' });
```

Keep the existing bill lookup by `tagihan_id` and `cabang_id`; this ownership guard prevents creating a payment shell for a cross-branch student before allocations are checked.

- [ ] **Step 6: Constrain allocation edit status**

In `router.put('/pembayaran/:id/alokasi'...)`, replace:

```js
  if (p.status === 'void') return res.status(400).json({ error: 'Pembayaran sudah void' });
```

with:

```js
  if (!['confirmed','pending_verification'].includes(p.status)) return res.status(400).json({ error: 'Alokasi hanya bisa diubah untuk pembayaran confirmed atau pending' });
```

- [ ] **Step 7: Align payment action visibility in UI**

In `frontend/src/views/AdminView.jsx`, update the payment actions table logic so allocation only appears for `confirmed` or `pending_verification`:

```jsx
{['confirmed','pending_verification'].includes(p.status)&&<button onClick={()=>editAlokasi(p)} className="link">Alokasi</button>}
```

Keep void available only for states the backend allows after the backend decision is finalized. If void remains allowed for rejected, keep:

```jsx
{p.status!=='void'&&<button onClick={()=>voidPay(p)} className="link text-red-600">Void</button>}
```

- [ ] **Step 8: Verify**

Run:

```powershell
npm run test:workflow
npm test
npm run build
```

Expected: deterministic API tests, workflow regressions pass, build passes.

## Task 5: Repair Student and Enrollment Status Vocabulary

**Files:**

- Modify: `backend/routes/siswa.js`
- Modify: `frontend/src/views/AdminView.jsx`
- Test: `scripts/workflow-regression.test.js`

- [ ] **Step 1: Add status vocabulary regression tests**

Add tests that assert:

- Updating siswa to `keluar` succeeds.
- Updating siswa to `nonaktif` returns `400`.
- Running kenaikan does not violate the `siswa_enrollment.status` check constraint.

Use existing admin-created siswa/master helpers from `scripts/workflow-regression.test.js`.

- [ ] **Step 2: Validate siswa status in backend create/update**

In `backend/routes/siswa.js`, add near helper functions:

```js
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
```

Use it in create:

```js
const status = normalizeSiswaStatus(d.status, 'aktif');
```

Then pass `status` into the `INSERT INTO siswa` call instead of `d.status || 'aktif'`.

Use it in update before the `UPDATE siswa` statement:

```js
const status = normalizeSiswaStatus(d.status, before.status);
```

Then pass `status` instead of `d.status || before.status`.

- [ ] **Step 3: Return explicit validation errors**

Wrap the update body in `try/catch`, mirroring create behavior, and return:

```js
res.status(e.statusCode || 400).json({ error: e.message || 'Gagal menyimpan siswa' });
```

- [ ] **Step 4: Fix kenaikan enrollment status writes**

In `backend/routes/siswa.js`, replace both kenaikan writes:

```js
UPDATE siswa_enrollment SET status='nonaktif',tanggal_selesai=?
```

with:

```js
UPDATE siswa_enrollment SET status='selesai',tanggal_selesai=?
```

- [ ] **Step 5: Align frontend siswa status options**

In `frontend/src/views/AdminView.jsx`, replace the siswa status select options:

```jsx
<option value="aktif">Aktif</option>
<option value="keluar">Keluar</option>
<option value="lulus">Lulus</option>
```

Do not use `nonaktif` for siswa. Keep `nonaktif` for staff/wali because `pengguna.status` supports it.

- [ ] **Step 6: Verify**

Run:

```powershell
npm run test:workflow
npm run build
```

Expected: status vocabulary tests pass; build passes.

## Task 6: Preserve Wali Published History After Move/Exit/Lulus

**Files:**

- Modify: `backend/utils/workflow.js`
- Modify: `backend/routes/siswa.js`
- Modify: `backend/routes/dailyRecord.js`
- Modify: `frontend/src/views/WaliView.jsx`
- Test: `scripts/workflow-regression.test.js`

- [ ] **Step 1: Add wali access helper**

In `backend/utils/workflow.js`, add:

```js
function canWaliAccessSiswa(user, siswaId) {
  if (user?.role !== 'wali') return false;
  return !!db.prepare('SELECT 1 FROM wali_siswa WHERE wali_pengguna_id=? AND siswa_id=? AND aktif=1').get(user.id, siswaId);
}
```

Export it:

```js
  canWaliAccessSiswa,
```

- [ ] **Step 2: Update daily history access**

In `backend/routes/dailyRecord.js`, import `canWaliAccessSiswa` and change `/history/:siswa_id` access:

```js
  if (req.user.role === 'wali') {
    if (!canWaliAccessSiswa(req.user, req.params.siswa_id)) return res.status(403).json({ error: 'Akses ditolak' });
  } else {
    const access = canAccessSiswa(req.user, req.params.siswa_id);
    if (access === false) return res.status(403).json({ error: 'Akses ditolak' });
    if (!access) return res.status(404).json({ error: 'Siswa tidak ditemukan' });
  }
```

- [ ] **Step 3: Update daily detail read access for wali**

In `backend/routes/dailyRecord.js`, replace the detail access block with:

```js
  if (req.user.role === 'wali') {
    if (l.status !== 'published') return res.status(404).json({ error: 'Daily record tidak ditemukan' });
    if (!canWaliAccessSiswa(req.user, l.siswa_id)) return res.status(403).json({ error: 'Akses ditolak' });
  } else {
    const access = canAccessSiswa(req.user, l.siswa_id, { tanggal: l.tanggal });
    if (access === false) return res.status(403).json({ error: 'Akses ditolak' });
    if (!access) return res.status(404).json({ error: 'Siswa tidak ditemukan' });
  }
```

- [ ] **Step 4: Add wali-specific children endpoint**

In `backend/routes/siswa.js`, add a route before `router.get('/:id'...)`. Route order matters because `/wali/children` would otherwise be captured by `/:id`.

```js
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
```

- [ ] **Step 5: Add frontend API method and use it**

In `frontend/src/api.js`, add:

```js
  waliChildren:()=>req('GET','/api/siswa/wali/children'),
```

In `frontend/src/views/WaliView.jsx`, change:

```js
async function load(){const s=await api.siswa({status:'semua'});setSiswa(s);if(!selected&&s[0])setSelected(s[0]);}
```

to:

```js
async function load(){const s=await api.waliChildren();setSiswa(s);if(!selected&&s[0])setSelected(s[0]);}
```

- [ ] **Step 6: Verify**

Run:

```powershell
npm run test:workflow
npm run build
```

Expected: wali can load linked children even when active enrollment is absent; published history remains readable; comment endpoint remains read-only for old branch/rombel via existing `canComment`.

## Task 7: Add Safe Confirmation Modal for Risky UI Actions

**Files:**

- Create: `frontend/src/components/ConfirmAction.jsx`
- Modify: `frontend/src/views/AdminView.jsx`
- Modify: `frontend/src/views/GuruView.jsx`

- [ ] **Step 1: Create reusable modal**

Create `frontend/src/components/ConfirmAction.jsx`:

```jsx
export default function ConfirmAction({
  title,
  body,
  confirmLabel='Konfirmasi',
  cancelLabel='Batal',
  danger=false,
  reason,
  setReason,
  reasonLabel='Alasan',
  requireReason=false,
  onConfirm,
  onCancel
}) {
  const disabled = requireReason && !String(reason || '').trim();
  return <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onCancel}>
    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md p-5 space-y-4" onClick={e=>e.stopPropagation()}>
      <div>
        <h2 className="text-lg font-black text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-600 whitespace-pre-wrap">{body}</p>
      </div>
      {setReason&&<label className="block">
        <span className="text-xs font-bold text-slate-500">{reasonLabel}</span>
        <textarea value={reason || ''} onChange={e=>setReason(e.target.value)} className="input w-full min-h-24 mt-1" />
      </label>}
      <div className="flex gap-2">
        <button disabled={disabled} onClick={onConfirm} className={`flex-1 py-2.5 rounded-xl text-sm font-black disabled:opacity-50 ${danger?'bg-red-600 text-white':'bg-slate-900 text-white'}`}>{confirmLabel}</button>
        <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-black">{cancelLabel}</button>
      </div>
    </div>
  </div>;
}
```

- [ ] **Step 2: Replace native `confirm` in Kalender**

In `AdminView.jsx`, replace the native confirm in `remove` with the existing modal/action system or `ConfirmAction`.

Required behavior:

```jsx
title="Hapus event kalender?"
body={`Event ini akan hilang dari kalender operasional. Tindakan tercatat di audit log.`}
confirmLabel="Hapus Event"
danger
```

- [ ] **Step 3: Replace `prompt` in Guru attendance**

In `GuruView.jsx`, replace `prompt('Catatan (opsional)')` with a small modal that shows selected student/status and optional note.

Required behavior:

```jsx
title={`Set status ${pendingStatus.status}`}
body={`Siswa: ${pendingStatus.nama}\nTanggal: ${tanggal}`}
confirmLabel="Simpan Status"
```

- [ ] **Step 4: Add impact copy to existing billing confirmation modal**

In `AdminView.jsx`, extend `confirmAction` objects for correction, void, reject, and void payment with body text:

```js
body: 'Tindakan ini mengubah catatan keuangan dan akan masuk audit log. Pastikan nominal/alasan sudah benar.'
```

Render `confirmAction.body` above fields.

- [ ] **Step 5: Verify**

Run:

```powershell
npm run build
```

Manual browser checks:

- Admin > Kalender > remove event shows in-app modal, not native browser confirm.
- Guru > Absensi > Izin/Sakit/Absen shows in-app modal, not native prompt.
- Billing correction/reject/void modal includes consequence text.

## Task 8: Fix Duplicate Header Keys and Mobile Table Pressure

**Files:**

- Modify: `frontend/src/views/AdminView.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Fix table header keys**

Change `Table` in `AdminView.jsx` from:

```jsx
function Table({headers,children}){return <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{headers.map(h=><th key={h} className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{children}</tbody></table></div>;}
```

to:

```jsx
function Table({headers,children}){return <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{headers.map((h,i)=><th key={`${i}-${h||'empty'}`} className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{children}</tbody></table></div>;}
```

- [ ] **Step 2: Improve mobile header wrapping**

In `App.jsx`, change the header layout from:

```jsx
<div className="px-4 py-3 flex items-center gap-3">
```

to:

```jsx
<div className="px-4 py-3 flex flex-wrap sm:flex-nowrap items-center gap-3">
```

Change nav from:

```jsx
<nav className="flex gap-1 overflow-x-auto flex-1 ml-2">
```

to:

```jsx
<nav className="flex gap-1 overflow-x-auto flex-1 min-w-full sm:min-w-0 sm:ml-2 order-last sm:order-none">
```

- [ ] **Step 3: Verify**

Run:

```powershell
npm run build
```

Manual browser checks:

- Load Admin > Siswa and confirm browser console has no duplicate key warnings.
- Set viewport to mobile width and confirm header nav wraps below brand instead of crushing Notifikasi/Keluar.

## Task 9: Update Documentation Tracker

**Files:**

- Modify: `docs/implementation-tracker.md`
- Modify: `docs/ui-ux-workflow-logic-audit-report.md`

- [ ] **Step 1: Add repair status section**

Append to `docs/implementation-tracker.md`:

```markdown
## Audit Repair Follow-up 2026-05-17

- [ ] Gerbang handoff authorization aligned with UI.
- [ ] Tutup hari materializes implicit `Belum` absensi rows.
- [ ] Billing `siswa_id` reads scoped to authorized users.
- [ ] Payment state transitions constrained and reflected in UI.
- [ ] Siswa/enrollment status vocabulary aligned with schema.
- [ ] Wali published history available after move/exit/lulus.
- [ ] Stable non-watch test workflow documented and passing.
- [ ] Risky admin actions use impact-focused confirmation.
- [ ] Duplicate table header key warning removed.
- [ ] Mobile header/table pressure improved.
```

- [ ] **Step 2: Verify docs render as plain markdown**

Run:

```powershell
Get-Content docs/implementation-tracker.md -Tail 20
Get-Content docs/ui-ux-workflow-logic-audit-report.md -Head 20
```

Expected: new section is readable; no mojibake introduced.

## Final Verification

Run:

```powershell
npm run build
npm test
npm run test:workflow
```

Manual browser checks:

- Staff admin login works.
- Admin > Siswa, Billing, Kalender load without console warnings.
- Guru > Absensi can set status through modal and close day.
- Gerbang role can scan and finalize `Pulang` if product decision is to allow it.
- Wali can open published historical daily records after student move/exit/lulus.

## Execution Notes

- Execute Tasks 1-6 before UI polish tasks. These are correctness/security repairs.
- Use a non-watch backend for tests.
- Avoid broad refactors in `AdminView.jsx` until the P1 logic gaps are repaired.
- Commit after each task if using git.
