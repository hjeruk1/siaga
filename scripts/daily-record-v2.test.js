const { describe, it } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const db = require('../backend/db');

const BASE = process.env.TEST_URL || 'http://localhost:3001';

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const data = body ? JSON.stringify(body) : undefined;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request(url, { method, headers }, res => {
      let d = '';
      res.on('data', c => { d += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function login(username = 'admin', password = process.env.TEST_ADMIN_PASSWORD || 'admin123') {
  const response = await req('POST', '/api/auth/login', {
    tipe: 'staff',
    username,
    password
  });
  assert.equal(response.status, 200, `login ${username}: ${JSON.stringify(response.body)}`);
  return response.body.token;
}

async function master(token) {
  const cabangList = await req('GET', '/api/master/cabang', undefined, token);
  assert.equal(cabangList.status, 200);
  const cabang = cabangList.body.find(c => c.aktif) || cabangList.body[0];
  assert.ok(cabang?.id, 'active cabang is required');

  const jenjangList = await req('GET', '/api/master/jenjang', undefined, token);
  assert.equal(jenjangList.status, 200);
  const jenjang = jenjangList.body[0];
  assert.ok(jenjang?.id, 'jenjang is required');

  const rombelList = await req('GET', `/api/master/rombel?cabang_id=${cabang.id}`, undefined, token);
  assert.equal(rombelList.status, 200);
  const rombel = rombelList.body.find(r => Number(r.jenjang_id) === Number(jenjang.id)) || rombelList.body[0];
  assert.ok(rombel?.id, 'rombel is required');

  return { cabang, jenjang, rombel };
}

async function createSiswa(token, m, suffix) {
  const siswa = await req('POST', '/api/siswa', {
    nama: `Siswa Daily V2 ${suffix}`,
    nis: `DRV2${suffix}`,
    cabang_id: m.cabang.id,
    jenjang_id: m.jenjang.id,
    rombel_id: m.rombel.id,
    paket: 'reguler',
    tanggal_mulai: '2026-01-01'
  }, token);
  assert.equal(siswa.status, 200, JSON.stringify(siswa.body));
  return siswa.body;
}

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

describe('daily record v2 modul ajar api', () => {
  it('creates and lists modul ajar and focus theme', async () => {
    const token = await login();
    const { cabang, jenjang, rombel } = await master(token);

    const suffix = Date.now();
    const modulTitle = `Modul Ajar V2 ${suffix}`;
    const modul = await req('POST', '/api/modul-ajar', {
      cabang_id: cabang.id,
      jenjang_id: jenjang.id,
      title: modulTitle,
      week_start: '2026-05-18',
      week_end: '2026-05-22',
      goals: ['Mengenal pola pagi'],
      suggested_activities: ['Circle time', 'Kolase daun'],
      suggested_domains: ['motorik', 'bahasa']
    }, token);
    assert.equal(modul.status, 200);
    assert.ok(modul.body.id);

    const listed = await req('GET', `/api/modul-ajar?cabang_id=${cabang.id}&tanggal=2026-05-19`, undefined, token);
    assert.equal(listed.status, 200);
    const listedModul = listed.body.find(row => Number(row.id) === Number(modul.body.id));
    assert.equal(listedModul?.title, modulTitle);
    assert.deepEqual(listedModul.goals, ['Mengenal pola pagi']);
    assert.deepEqual(listedModul.suggested_activities, ['Circle time', 'Kolase daun']);
    assert.deepEqual(listedModul.suggested_domains, ['motorik', 'bahasa']);

    const updatedTitle = `${modulTitle} Updated`;
    const updated = await req('PUT', `/api/modul-ajar/${modul.body.id}`, {
      cabang_id: cabang.id,
      jenjang_id: jenjang.id,
      rombel_id: rombel.id,
      paket: 'reguler',
      title: updatedTitle,
      week_start: '2026-05-18',
      week_end: '2026-05-22',
      goals: ['Mengenal pola pagi', 'Mengurutkan kegiatan'],
      suggested_activities: ['Circle time'],
      suggested_domains: ['literasi']
    }, token);
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal(updated.body.action, 'updated');

    const listedAfterUpdate = await req('GET', `/api/modul-ajar?cabang_id=${cabang.id}&tanggal=2026-05-19`, undefined, token);
    assert.equal(listedAfterUpdate.status, 200);
    const updatedModul = listedAfterUpdate.body.find(row => Number(row.id) === Number(modul.body.id));
    assert.equal(updatedModul?.title, updatedTitle);
    assert.equal(Number(updatedModul.rombel_id), Number(rombel.id));
    assert.deepEqual(updatedModul.goals, ['Mengenal pola pagi', 'Mengurutkan kegiatan']);
    assert.deepEqual(updatedModul.suggested_domains, ['literasi']);

    const themeTitle = `Focus Theme V2 ${suffix}`;
    const theme = await req('POST', '/api/modul-ajar/focus-theme', {
      modul_ajar_id: modul.body.id,
      cabang_id: cabang.id,
      rombel_id: rombel.id,
      tanggal: '2026-05-19',
      title: themeTitle,
      activity_summary: 'Mengamati pola rutinitas pagi.',
      suggested_domains: ['sosial-emosional', 'bahasa'],
      teacher_prompt: 'Apa rutinitas yang paling anak ingat hari ini?'
    }, token);
    assert.equal(theme.status, 200);
    assert.ok(theme.body.id);
    assert.ok(['created', 'updated'].includes(theme.body.action));

    const foundTheme = await req('GET', `/api/modul-ajar/focus-theme?rombel_id=${rombel.id}&tanggal=2026-05-19`, undefined, token);
    assert.equal(foundTheme.status, 200);
    assert.equal(foundTheme.body.title, themeTitle);
    assert.equal(Number(foundTheme.body.modul_ajar_id), Number(modul.body.id));
    assert.equal(foundTheme.body.modul_ajar_title, updatedTitle);
    assert.deepEqual(foundTheme.body.suggested_domains, ['sosial-emosional', 'bahasa']);
  });

  it('rejects guru focus theme writes outside assigned rombel', async () => {
    const adminToken = await login();
    const { cabang } = await master(adminToken);

    const rombelList = await req('GET', `/api/master/rombel?cabang_id=${cabang.id}`, undefined, adminToken);
    assert.equal(rombelList.status, 200);
    assert.ok(rombelList.body.length >= 2, 'two rombel seed rows are required');
    const [assignedRombel, otherRombel] = rombelList.body;

    const suffix = Date.now();
    const guru = await req('POST', '/api/pengguna/staff', {
      display_name: `Guru Focus Scope ${suffix}`,
      username: `guru.focus.${suffix}`,
      role: 'guru',
      cabang_id: cabang.id
    }, adminToken);
    assert.equal(guru.status, 200);

    const assign = await req('POST', `/api/master/rombel/${assignedRombel.id}/guru`, {
      pengguna_id: guru.body.id,
      role: 'utama'
    }, adminToken);
    assert.equal(assign.status, 200);

    const guruLogin = await req('POST', '/api/auth/login', {
      tipe: 'staff',
      username: `guru.focus.${suffix}`,
      password: guru.body.temporary_password
    });
    assert.equal(guruLogin.status, 200);

    const blocked = await req('POST', '/api/modul-ajar/focus-theme', {
      cabang_id: cabang.id,
      rombel_id: otherRombel.id,
      tanggal: '2026-05-20',
      title: `Blocked Focus Theme ${suffix}`
    }, guruLogin.body.token);
    assert.equal(blocked.status, 403);
  });

  it('rejects focus theme module links for a different rombel', async () => {
    const token = await login();
    const { cabang } = await master(token);

    const rombelList = await req('GET', `/api/master/rombel?cabang_id=${cabang.id}`, undefined, token);
    assert.equal(rombelList.status, 200);
    assert.ok(rombelList.body.length >= 2, 'two rombel seed rows are required');
    const [modulRombel, themeRombel] = rombelList.body;

    const suffix = Date.now();
    const modul = await req('POST', '/api/modul-ajar', {
      cabang_id: cabang.id,
      rombel_id: modulRombel.id,
      title: `Scoped Modul Ajar ${suffix}`,
      week_start: '2026-05-18',
      week_end: '2026-05-22'
    }, token);
    assert.equal(modul.status, 200);

    const theme = await req('POST', '/api/modul-ajar/focus-theme', {
      modul_ajar_id: modul.body.id,
      cabang_id: cabang.id,
      rombel_id: themeRombel.id,
      tanggal: '2026-05-21',
      title: `Cross Rombel Theme ${suffix}`
    }, token);
    assert.equal(theme.status, 400);
  });

  it('saves v2 daily fields and requires focus theme plus observation before publishing', async () => {
    const token = await login();
    const m = await master(token);
    const suffix = unique('daily-v2').replace(/[^a-zA-Z0-9]/g, '');
    const tanggal = '2026-05-20';
    const siswa = await createSiswa(token, m, suffix);

    db.prepare(`INSERT INTO kalender_event(scope,cabang_id,tanggal,tipe,nama,created_at)
      VALUES('cabang',?,?, 'masuk', ?, ?)`)
      .run(m.cabang.id, tanggal, `Daily V2 Masuk ${suffix}`, new Date().toISOString());

    const incomplete = await req('POST', '/api/daily-record', {
      siswa_id: siswa.id,
      tanggal,
      mood: 'ceria',
      makan: 'habis',
      tidur: true,
      aktivitas: ['Menyusun balok'],
      catatan: 'Mulai record V2'
    }, token);
    assert.equal(incomplete.status, 200, JSON.stringify(incomplete.body));

    const missingTheme = await req('POST', `/api/daily-record/${incomplete.body.id}/publish`, {}, token);
    assert.equal(missingTheme.status, 400, JSON.stringify(missingTheme.body));
    assert.match(missingTheme.body.error, /Focus Theme wajib/);

    const modul = await req('POST', '/api/modul-ajar', {
      cabang_id: m.cabang.id,
      jenjang_id: m.jenjang.id,
      rombel_id: m.rombel.id,
      title: `Daily Record V2 Modul ${suffix}`,
      week_start: '2026-05-18',
      week_end: '2026-05-22',
      goals: ['Mengamati pola bermain'],
      suggested_activities: ['Eksplorasi balok'],
      suggested_domains: ['kognitif', 'bahasa']
    }, token);
    assert.equal(modul.status, 200, JSON.stringify(modul.body));

    const themeTitle = `Daily Record V2 Theme ${suffix}`;
    const theme = await req('POST', '/api/modul-ajar/focus-theme', {
      modul_ajar_id: modul.body.id,
      cabang_id: m.cabang.id,
      rombel_id: m.rombel.id,
      tanggal,
      title: themeTitle,
      activity_summary: 'Anak mengeksplorasi pola bangunan sederhana.',
      suggested_domains: ['kognitif', 'sosial-emosional'],
      teacher_prompt: 'Apa strategi anak saat bangunannya berubah?'
    }, token);
    assert.equal(theme.status, 200, JSON.stringify(theme.body));

    const withoutObservation = await req('POST', '/api/daily-record', {
      siswa_id: siswa.id,
      tanggal,
      focus_theme_id: theme.body.id,
      mood: 'ceria',
      makan: 'habis',
      tidur: true,
      aktivitas: ['Menyusun balok'],
      catatan: 'Tema sudah dipilih'
    }, token);
    assert.equal(withoutObservation.status, 200, JSON.stringify(withoutObservation.body));

    const missingObservation = await req('POST', `/api/daily-record/${incomplete.body.id}/publish`, {}, token);
    assert.equal(missingObservation.status, 400, JSON.stringify(missingObservation.body));
    assert.match(missingObservation.body.error, /Domain observasi wajib|Catatan observasi wajib/);

    const complete = await req('POST', '/api/daily-record', {
      siswa_id: siswa.id,
      tanggal,
      focus_theme_id: theme.body.id,
      mood: 'ceria',
      makan: 'habis',
      tidur: true,
      aktivitas: ['Menyusun balok'],
      catatan: 'Anak mencoba beberapa bentuk menara.',
      observation_domain: 'kognitif',
      observation_note: 'Anak menyusun balok dari besar ke kecil dengan percobaan mandiri.',
      parent_note: 'Ajak anak bercerita tentang bangunan yang dibuat.',
      structured_observation: { strategy: 'trial-error', support: 'minimal' }
    }, token);
    assert.equal(complete.status, 200, JSON.stringify(complete.body));

    const published = await req('POST', `/api/daily-record/${incomplete.body.id}/publish`, {}, token);
    assert.equal(published.status, 200, JSON.stringify(published.body));

    const detail = await req('GET', `/api/daily-record/${incomplete.body.id}`, undefined, token);
    assert.equal(detail.status, 200, JSON.stringify(detail.body));
    assert.equal(detail.body.focus_theme_title, themeTitle);
    assert.equal(detail.body.modul_ajar_title, `Daily Record V2 Modul ${suffix}`);
    assert.equal(detail.body.observation_domain, 'kognitif');
    assert.deepEqual(detail.body.focus_theme_domains, ['kognitif', 'sosial-emosional']);
    assert.deepEqual(detail.body.structured_observation, { strategy: 'trial-error', support: 'minimal' });

    const legacyPartial = await req('POST', '/api/daily-record', {
      siswa_id: siswa.id,
      tanggal,
      mood: 'biasa'
    }, token);
    assert.equal(legacyPartial.status, 200, JSON.stringify(legacyPartial.body));

    const afterPartial = await req('GET', `/api/daily-record/${incomplete.body.id}`, undefined, token);
    assert.equal(afterPartial.status, 200, JSON.stringify(afterPartial.body));
    assert.equal(afterPartial.body.focus_theme_title, themeTitle);
    assert.equal(afterPartial.body.observation_domain, 'kognitif');
    assert.equal(afterPartial.body.observation_note, 'Anak menyusun balok dari besar ke kecil dengan percobaan mandiri.');
    assert.equal(afterPartial.body.parent_note, 'Ajak anak bercerita tentang bangunan yang dibuat.');
    assert.deepEqual(afterPartial.body.structured_observation, { strategy: 'trial-error', support: 'minimal' });
  });
});
