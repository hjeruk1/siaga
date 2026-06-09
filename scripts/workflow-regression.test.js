const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const db = require('../backend/db');

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

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function uniqueDate() {
  const day = Math.floor(Date.now() / 1000) % 8000;
  return new Date(Date.UTC(2099, 0, 1 + day)).toISOString().slice(0, 10);
}

async function loginStaff(username, password = adminPassword) {
  const response = await req('POST', '/api/auth/login', { tipe: 'staff', username, password });
  assert.equal(response.status, 200, `login ${username}: ${JSON.stringify(response.body)}`);
  return response.body.token;
}

async function pickMaster(adminToken, cabangId = null) {
  const cabang = await req('GET', '/api/master/cabang', undefined, adminToken);
  const jenjang = await req('GET', '/api/master/jenjang', undefined, adminToken);
  assert.equal(cabang.status, 200);
  assert.equal(jenjang.status, 200);
  const activeCabang = (cabangId ? cabang.body.find(c => Number(c.id) === Number(cabangId)) : null) || cabang.body.find(c => c.aktif) || cabang.body[0];
  const kb = jenjang.body.find(j => j.nama === 'KB A') || jenjang.body[0];
  assert.ok(activeCabang, 'active cabang seed data is required');
  assert.ok(kb, 'jenjang seed data is required');
  const rombel = await req('GET', `/api/master/rombel?cabang_id=${activeCabang.id}`, undefined, adminToken);
  assert.equal(rombel.status, 200);
  const targetRombel = rombel.body.find(r => r.jenjang_id === kb.id) || rombel.body[0];
  assert.ok(targetRombel, 'rombel seed data is required');
  return { cabang: activeCabang, jenjang: kb, rombel: targetRombel };
}

async function pickBranchSchoolMasters(adminToken, cabangId = null) {
  const cabang = await req('GET', '/api/master/cabang', undefined, adminToken);
  const jenjang = await req('GET', '/api/master/jenjang', undefined, adminToken);
  assert.equal(cabang.status, 200);
  assert.equal(jenjang.status, 200);
  const activeCabang = (cabangId ? cabang.body.find(c => Number(c.id) === Number(cabangId)) : null) || cabang.body.find(c => c.aktif) || cabang.body[0];
  const masters = {
    cabang: activeCabang,
    kbA: jenjang.body.find(j => j.nama === 'KB A'),
    kbB: jenjang.body.find(j => j.nama === 'KB B'),
    tkA: jenjang.body.find(j => j.nama === 'TK A'),
    tkB: jenjang.body.find(j => j.nama === 'TK B')
  };
  assert.ok(masters.cabang);
  assert.ok(masters.kbA);
  assert.ok(masters.kbB);
  assert.ok(masters.tkA);
  assert.ok(masters.tkB);
  const rombel = await req('GET', `/api/master/rombel?cabang_id=${masters.cabang.id}`, undefined, adminToken);
  assert.equal(rombel.status, 200);
  for (const key of ['kbA', 'kbB', 'tkA', 'tkB']) {
    masters[`${key}Rombel`] = rombel.body.find(r => Number(r.jenjang_id) === Number(masters[key].id));
    assert.ok(masters[`${key}Rombel`], `rombel ${key} is required`);
  }
  return masters;
}

async function loginWali(noWa, password) {
  const response = await req('POST', '/api/auth/login', { tipe: 'wali', no_wa: noWa, password });
  assert.equal(response.status, 200, `login wali ${noWa}: ${JSON.stringify(response.body)}`);
  return response.body.token;
}

async function createStaffAndLogin(adminToken, role, cabangId, prefix) {
  const suffix = unique(prefix);
  const staff = await req('POST', '/api/pengguna/staff', {
    display_name: `${role} ${suffix}`,
    username: `${role}.${suffix}`,
    role,
    cabang_id: cabangId
  }, adminToken);
  assert.equal(staff.status, 200, JSON.stringify(staff.body));
  const temporaryPassword = staff.body.temporary_password;
  assert.ok(temporaryPassword);
  const token = await loginStaff(`${role}.${suffix}`, temporaryPassword);
  const newPassword = `${role}${suffix.replace(/[^a-zA-Z0-9]/g, '')}123`;
  const changed = await req('POST', '/api/auth/change-password', { new_password: newPassword }, token);
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  return loginStaff(`${role}.${suffix}`, newPassword);
}

function createTagihanFor(siswa, namePrefix = 'REG') {
  const now = new Date().toISOString();
  const nama = `${namePrefix}-${unique('bill')}`;
  const row = db.prepare(`INSERT INTO tagihan
    (siswa_id,cabang_id,jenjang_id,rombel_id,paket,tahun_ajaran,periode,jenis,nama,nominal_awal,nominal_final,created_by,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(siswa.id, siswa.master.cabang.id, siswa.master.jenjang.id, siswa.master.rombel.id, 'reguler', '2099/2100', '2099-01', 'spp', nama, 100000, 100000, 1, now, now);
  return row.lastInsertRowid;
}

async function createSiswa(adminToken, prefix, overrides = {}) {
  const master = overrides.master || await pickMaster(adminToken);
  const suffix = unique(prefix);
  const siswa = await req('POST', '/api/siswa', {
    nama: `Siswa ${suffix}`,
    nis: suffix,
    cabang_id: master.cabang.id,
    jenjang_id: master.jenjang.id,
    rombel_id: master.rombel.id,
    paket: 'reguler',
    tanggal_mulai: '2026-01-01',
    ...overrides
  }, adminToken);
  assert.equal(siswa.status, 200, JSON.stringify(siswa.body));
  return { id: siswa.body.id, suffix, master };
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

  it('allows a gerbang user to finalize a waiting pickup when UI exposes Pulang', async () => {
    const master = await pickMaster(adminToken);
    const suffix = unique('gate');

    const gerbang = await req('POST', '/api/pengguna/staff', {
      display_name: `Gerbang ${suffix}`,
      username: `gerbang.${suffix}`,
      role: 'gerbang',
      cabang_id: master.cabang.id
    }, adminToken);
    assert.equal(gerbang.status, 200, JSON.stringify(gerbang.body));

    const siswa = await createSiswa(adminToken, suffix, { master });

    const pickup = await req('POST', `/api/siswa/${siswa.id}/penjemput`, {
      nama: `Penjemput ${suffix}`,
      relasi: 'Wali'
    }, adminToken);
    assert.equal(pickup.status, 200, JSON.stringify(pickup.body));

    const checkin = await req('POST', '/api/absensi/checkin', {
      siswa_id: siswa.id,
      tanggal: '2026-05-18'
    }, adminToken);
    assert.equal(checkin.status, 200, JSON.stringify(checkin.body));

    const earlyRelease = await req('POST', '/api/absensi/early-release', {
      siswa_id: siswa.id,
      tanggal: '2026-05-18',
      alasan: 'Regression test pickup handoff'
    }, adminToken);
    assert.equal(earlyRelease.status, 200, JSON.stringify(earlyRelease.body));

    const scan = await req('POST', '/api/penjemputan/scan', {
      qr_code: pickup.body.qr_code,
      tanggal: '2026-05-18'
    }, adminToken);
    assert.equal(scan.status, 200, JSON.stringify(scan.body));

    const temporaryPassword = gerbang.body.temporary_password || gerbang.body.password;
    assert.ok(temporaryPassword, 'new staff response should include a temporary password');
    const gerbangToken = await loginStaff(`gerbang.${suffix}`, temporaryPassword);
    const newPassword = `Gerbang${suffix.replace(/[^a-zA-Z0-9]/g, '')}123`;
    const change = await req('POST', '/api/auth/change-password', {
      new_password: newPassword
    }, gerbangToken);
    assert.equal(change.status, 200, JSON.stringify(change.body));
    const activeGerbangToken = await loginStaff(`gerbang.${suffix}`, newPassword);

    const pulang = await req('POST', '/api/penjemputan/pulang', {
      siswa_ids: [siswa.id],
      tanggal: '2026-05-18'
    }, activeGerbangToken);
    assert.equal(pulang.status, 200, JSON.stringify(pulang.body));
    assert.equal(pulang.body.count, 1);
  });

  it('tutup hari creates Absen rows for students that were only implicitly Belum', async () => {
    const siswa = await createSiswa(adminToken, 'close-day');
    const tanggal = uniqueDate();
    const close = await req('POST', '/api/absensi/tutup-hari', {
      cabang_id: siswa.master.cabang.id,
      tanggal
    }, adminToken);
    assert.equal(close.status, 200, JSON.stringify(close.body));

    const today = await req('GET', `/api/absensi/today?cabang_id=${siswa.master.cabang.id}&tanggal=${tanggal}`, undefined, adminToken);
    assert.equal(today.status, 200);
    const row = today.body.rows.find(r => r.siswa_id === siswa.id);
    assert.ok(row);
    assert.equal(row.status, 'Absen');
  });

  it('rejects unsupported siswa status values and accepts schema-supported status values', async () => {
    const siswa = await createSiswa(adminToken, 'status');
    const detail = await req('GET', `/api/siswa/${siswa.id}`, undefined, adminToken);
    assert.equal(detail.status, 200);

    const invalid = await req('PUT', `/api/siswa/${siswa.id}`, {
      ...detail.body,
      status: 'nonaktif'
    }, adminToken);
    assert.equal(invalid.status, 400);

    const valid = await req('PUT', `/api/siswa/${siswa.id}`, {
      ...detail.body,
      status: 'keluar'
    }, adminToken);
    assert.equal(valid.status, 200, JSON.stringify(valid.body));
  });

  it('blocks branch users from reading another branch student bills by siswa_id', async () => {
    const cabangA = await pickMaster(adminToken, 1);
    const cabangB = await pickMaster(adminToken, 2);
    const adminCabangToken = await createStaffAndLogin(adminToken, 'admin_cabang', cabangA.cabang.id, 'scope');
    const siswaB = await createSiswa(adminToken, 'bill-scope', { master: cabangB });
    createTagihanFor(siswaB, 'SCOPE');

    const response = await req('GET', `/api/billing/tagihan?siswa_id=${siswaB.id}`, undefined, adminCabangToken);
    assert.equal(response.status, 403, JSON.stringify(response.body));
  });

  it('blocks cross-branch payment creation and terminal payment allocation edits', async () => {
    const cabangA = await pickMaster(adminToken, 1);
    const cabangB = await pickMaster(adminToken, 2);
    const adminCabangToken = await createStaffAndLogin(adminToken, 'admin_cabang', cabangA.cabang.id, 'pay');
    const siswaA = await createSiswa(adminToken, 'pay-a', { master: cabangA });
    const siswaB = await createSiswa(adminToken, 'pay-b', { master: cabangB });

    const crossBranchPay = await req('POST', '/api/billing/pembayaran', {
      siswa_id: siswaB.id,
      cabang_id: cabangA.cabang.id,
      nominal: 50000,
      metode: 'transfer'
    }, adminCabangToken);
    assert.equal(crossBranchPay.status, 403, JSON.stringify(crossBranchPay.body));

    const pending = await req('POST', '/api/billing/pembayaran', {
      siswa_id: siswaA.id,
      cabang_id: cabangA.cabang.id,
      nominal: 50000,
      metode: 'transfer'
    }, adminCabangToken);
    assert.equal(pending.status, 200, JSON.stringify(pending.body));
    assert.equal(pending.body.status, 'pending_verification');

    const rejected = await req('POST', `/api/billing/pembayaran/${pending.body.id}/reject`, { reason: 'Bukti tidak valid' }, adminToken);
    assert.equal(rejected.status, 200, JSON.stringify(rejected.body));

    const editRejected = await req('PUT', `/api/billing/pembayaran/${pending.body.id}/alokasi`, { alokasi: [] }, adminCabangToken);
    assert.equal(editRejected.status, 400, JSON.stringify(editRejected.body));
  });

  it('blocks same-branch allocations to another student and non-positive amounts', async () => {
    const master = await pickMaster(adminToken, 1);
    const siswaA = await createSiswa(adminToken, 'alloc-owner', { master });
    const siswaB = await createSiswa(adminToken, 'alloc-other', { master });
    const billA = createTagihanFor(siswaA, 'ALLOC-A');
    const billB = createTagihanFor(siswaB, 'ALLOC-B');

    const crossStudent = await req('POST', '/api/billing/pembayaran', {
      siswa_id: siswaA.id,
      cabang_id: master.cabang.id,
      nominal: 50000,
      metode: 'tunai',
      alokasi: [{ tagihan_id: billB, nominal: 50000 }]
    }, adminToken);
    assert.equal(crossStudent.status, 400, JSON.stringify(crossStudent.body));

    const negative = await req('POST', '/api/billing/pembayaran', {
      siswa_id: siswaA.id,
      cabang_id: master.cabang.id,
      nominal: -50000,
      metode: 'tunai',
      alokasi: [{ tagihan_id: billA, nominal: -50000 }]
    }, adminToken);
    assert.equal(negative.status, 400, JSON.stringify(negative.body));
  });

  it('blocks a guru from reading sensitive details outside assigned rombel', async () => {
    const master = await pickMaster(adminToken, 1);
    const rombels = await req('GET', `/api/master/rombel?cabang_id=${master.cabang.id}`, undefined, adminToken);
    const otherRombel = rombels.body.find(r => Number(r.id) !== Number(master.rombel.id));
    assert.ok(otherRombel, 'second rombel is required');

    const guruSuffix = unique('detail-scope');
    const guru = await req('POST', '/api/pengguna/staff', {
      display_name: `Guru ${guruSuffix}`,
      username: `guru.${guruSuffix}`,
      role: 'guru',
      cabang_id: master.cabang.id
    }, adminToken);
    assert.equal(guru.status, 200, JSON.stringify(guru.body));
    const assigned = await req('POST', `/api/master/rombel/${master.rombel.id}/guru`, {
      pengguna_id: guru.body.id,
      role: 'utama'
    }, adminToken);
    assert.equal(assigned.status, 200, JSON.stringify(assigned.body));

    const otherMaster = { ...master, jenjang: { id: otherRombel.jenjang_id }, rombel: otherRombel };
    const otherStudent = await createSiswa(adminToken, 'detail-other', { master: otherMaster });
    const temporaryToken = await loginStaff(`guru.${guruSuffix}`, guru.body.temporary_password);
    const newPassword = `Guru${guruSuffix.replace(/[^a-zA-Z0-9]/g, '')}123`;
    const changed = await req('POST', '/api/auth/change-password', { new_password: newPassword }, temporaryToken);
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    const guruToken = await loginStaff(`guru.${guruSuffix}`, newPassword);
    const response = await req('GET', `/api/siswa/${otherStudent.id}`, undefined, guruToken);
    assert.equal(response.status, 403, JSON.stringify(response.body));
  });

  it('lets wali read published history after the student is no longer active', async () => {
    const siswa = await createSiswa(adminToken, 'wali-history');
    const noWa = `08${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const wali = await req('POST', '/api/pengguna/wali', {
      display_name: `Wali ${siswa.suffix}`,
      no_wa: noWa,
      siswa_id: siswa.id,
      relasi: 'Ibu'
    }, adminToken);
    assert.equal(wali.status, 200, JSON.stringify(wali.body));

    const tanggal = '2026-05-18';
    const modul = await req('POST', '/api/modul-ajar', {
      cabang_id: siswa.master.cabang.id,
      jenjang_id: siswa.master.jenjang.id,
      rombel_id: siswa.master.rombel.id,
      title: `Workflow Modul ${siswa.suffix}`,
      week_start: '2026-05-18',
      week_end: '2026-05-22',
      goals: ['Menjaga histori daily record wali'],
      suggested_activities: ['Membaca cerita'],
      suggested_domains: ['Literasi']
    }, adminToken);
    assert.equal(modul.status, 200, JSON.stringify(modul.body));
    const theme = await req('POST', '/api/modul-ajar/focus-theme', {
      modul_ajar_id: modul.body.id,
      cabang_id: siswa.master.cabang.id,
      rombel_id: siswa.master.rombel.id,
      tanggal,
      title: `Workflow Theme ${siswa.suffix}`,
      activity_summary: 'Anak membaca cerita dan menceritakan kembali bagian favorit.',
      suggested_domains: ['Literasi']
    }, adminToken);
    assert.equal(theme.status, 200, JSON.stringify(theme.body));

    const daily = await req('POST', '/api/daily-record', {
      siswa_id: siswa.id,
      tanggal,
      focus_theme_id: theme.body.id,
      mood: 'ceria',
      makan: 'habis',
      tidur: true,
      aktivitas: ['membaca'],
      catatan: 'Anak aktif.',
      observation_domain: 'Literasi',
      observation_note: 'Anak mendengarkan cerita dan menyebutkan kembali tokoh utama dengan jelas.'
    }, adminToken);
    assert.equal(daily.status, 200, JSON.stringify(daily.body));
    const published = await req('POST', `/api/daily-record/${daily.body.id}/publish`, {}, adminToken);
    assert.equal(published.status, 200, JSON.stringify(published.body));

    db.prepare("UPDATE siswa SET status='lulus',updated_at=? WHERE id=?").run(new Date().toISOString(), siswa.id);
    db.prepare("UPDATE siswa_enrollment SET status='selesai',tanggal_selesai=? WHERE siswa_id=?").run('2026-05-19', siswa.id);

    const waliToken = await loginWali(noWa, wali.body.temporary_password);
    const newPassword = `Wali${siswa.suffix.replace(/[^a-zA-Z0-9]/g, '')}123`;
    const changed = await req('POST', '/api/auth/change-password', { new_password: newPassword }, waliToken);
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    const activeWaliToken = await loginWali(noWa, newPassword);

    const children = await req('GET', '/api/siswa/wali/children', undefined, activeWaliToken);
    assert.equal(children.status, 200, JSON.stringify(children.body));
    assert.ok(children.body.some(s => s.id === siswa.id));

    const history = await req('GET', `/api/daily-record/history/${siswa.id}`, undefined, activeWaliToken);
    assert.equal(history.status, 200, JSON.stringify(history.body));
    assert.ok(history.body.some(r => r.id === daily.body.id));

    const detail = await req('GET', `/api/daily-record/${daily.body.id}`, undefined, activeWaliToken);
    assert.equal(detail.status, 200, JSON.stringify(detail.body));
    assert.equal(detail.body.status, 'published');
  });

  it('processes tinggal kelas as a new same-jenjang enrollment and blocks duplicate tahun ajaran batches', async () => {
    const master = await pickBranchSchoolMasters(adminToken);
    const siswa = await createSiswa(adminToken, 'repeat-grade', {
      master: { cabang: master.cabang, jenjang: master.tkA, rombel: master.tkARombel },
      jenjang_id: master.tkA.id,
      rombel_id: master.tkARombel.id,
      tanggal_mulai: '2097-07-01'
    });
    const tahunAjaran = `2097/${Date.now()}`;
    const tanggalEfektif = '2098-07-01';

    const processed = await req('POST', '/api/siswa/kenaikan', {
      cabang_id: master.cabang.id,
      tahun_ajaran: tahunAjaran,
      tanggal_efektif: tanggalEfektif,
      items: [{
        siswa_id: siswa.id,
        action: 'tinggal',
        target_jenjang_id: master.tkA.id,
        target_rombel_id: master.tkARombel.id,
        paket: 'reguler'
      }]
    }, adminToken);
    assert.equal(processed.status, 200, JSON.stringify(processed.body));
    assert.equal(processed.body.results[0].action, 'tinggal');

    const active = db.prepare("SELECT * FROM siswa_enrollment WHERE siswa_id=? AND status='aktif' ORDER BY id DESC LIMIT 1").get(siswa.id);
    assert.equal(Number(active.jenjang_id), Number(master.tkA.id));
    assert.equal(Number(active.rombel_id), Number(master.tkARombel.id));
    assert.equal(active.tanggal_mulai, tanggalEfektif);
    const oldEnrollment = db.prepare("SELECT * FROM siswa_enrollment WHERE siswa_id=? AND status='selesai' ORDER BY id DESC LIMIT 1").get(siswa.id);
    assert.equal(oldEnrollment.tanggal_selesai, tanggalEfektif);

    const duplicate = await req('POST', '/api/siswa/kenaikan', {
      cabang_id: master.cabang.id,
      tahun_ajaran: tahunAjaran,
      tanggal_efektif: tanggalEfektif,
      items: [{ siswa_id: siswa.id, action: 'skip' }]
    }, adminToken);
    assert.equal(duplicate.status, 409, JSON.stringify(duplicate.body));
  });

  it('marks kenaikan preview rows as error when the target rombel for the next jenjang is missing', async () => {
    const suffix = unique('no-target');
    const branch = await req('POST', '/api/master/cabang', {
      nama: `Cabang ${suffix}`,
      kode: `NT${suffix.slice(-4)}`,
      alamat: 'Testing kenaikan target',
      kontak: '000'
    }, adminToken);
    assert.equal(branch.status, 200, JSON.stringify(branch.body));
    const master = await pickBranchSchoolMasters(adminToken, branch.body.id);
    db.prepare('UPDATE rombel SET aktif=0 WHERE cabang_id=? AND jenjang_id=?').run(master.cabang.id, master.kbB.id);
    const siswa = await createSiswa(adminToken, 'missing-target', {
      master: { cabang: master.cabang, jenjang: master.kbA, rombel: master.kbARombel },
      jenjang_id: master.kbA.id,
      rombel_id: master.kbARombel.id,
      tanggal_mulai: '2097-07-01'
    });

    const preview = await req('POST', '/api/siswa/kenaikan/preview', {
      cabang_id: master.cabang.id,
      tahun_ajaran: `2098/${suffix}`,
      tanggal_efektif: '2098-07-01'
    }, adminToken);
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    const row = preview.body.preview.find(r => r.id === siswa.id);
    assert.ok(row, 'preview row for test student is required');
    assert.equal(row.action, 'error', JSON.stringify(row));
    assert.match(row.error, /Rombel tujuan/i);
  });
});
