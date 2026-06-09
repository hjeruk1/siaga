const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

const BASE = process.env.TEST_URL || 'http://localhost:3001';
let token = '';
let student = null;

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const data = body ? JSON.stringify(body) : undefined;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request(url, { method, headers }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const bodyBuffer = Buffer.concat(chunks);
        let parsed = '';
        try { parsed = JSON.parse(bodyBuffer.toString()); } catch { parsed = bodyBuffer.toString(); }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed, rawBody: bodyBuffer });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

describe('Absensi Export Tests', () => {
  before(async () => {
    // 1. Get token
    const loginRes = await req('POST', '/api/auth/login', {
      tipe: 'staff',
      username: 'admin',
      password: process.env.TEST_ADMIN_PASSWORD || 'admin123'
    });
    assert.equal(loginRes.status, 200);
    token = loginRes.body.token;

    // 2. Create an isolated student through the public API.
    const cabangRes = await req('GET', '/api/master/cabang', null, token);
    const jenjangRes = await req('GET', '/api/master/jenjang', null, token);
    assert.equal(cabangRes.status, 200);
    assert.equal(jenjangRes.status, 200);
    const cabang = cabangRes.body.find(item => item.aktif) || cabangRes.body[0];
    const jenjang = jenjangRes.body[0];
    const rombelRes = await req('GET', `/api/master/rombel?cabang_id=${cabang.id}`, null, token);
    assert.equal(rombelRes.status, 200);
    const rombel = rombelRes.body.find(item => Number(item.jenjang_id) === Number(jenjang.id)) || rombelRes.body[0];
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const nama = `Siswa Export ${suffix}`;
    const createRes = await req('POST', '/api/siswa', {
      nama,
      nis: `EXP-${suffix}`,
      cabang_id: cabang.id,
      jenjang_id: rombel.jenjang_id,
      rombel_id: rombel.id,
      paket: 'reguler',
      tanggal_mulai: '2026-05-01'
    }, token);
    assert.equal(createRes.status, 200, JSON.stringify(createRes.body));
    student = {
      siswa_id: createRes.body.id,
      nama,
      rombel_id: rombel.id,
      cabang_id: cabang.id
    };
  });

  it('rejects unauthenticated requests', async () => {
    const res = await req('GET', `/api/rekap/export?format=pdf&rombel_id=${student.rombel_id}`);
    assert.equal(res.status, 401);
  });

  it('rejects missing parameters', async () => {
    const res = await req('GET', '/api/rekap/export?format=pdf', null, token);
    assert.equal(res.status, 400);
    assert.match(res.body.error, /Rombel atau Siswa wajib ditentukan/);
  });

  it('exports class recap in CSV format', async () => {
    const res = await req('GET', `/api/rekap/export?format=excel&rombel_id=${student.rombel_id}&start_date=2026-05-01&end_date=2026-05-31`, null, token);
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/csv/);
    assert.ok(res.rawBody.length > 50);
    const text = res.rawBody.toString('utf8');
    assert.ok(text.includes('sep=,'));
    assert.ok(text.includes('Laporan Kehadiran Kelas'));
  });

  it('exports class recap in PDF format', async () => {
    const res = await req('GET', `/api/rekap/export?format=pdf&rombel_id=${student.rombel_id}&start_date=2026-05-01&end_date=2026-05-31`, null, token);
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /application\/pdf/);
    assert.ok(res.rawBody.length > 500);
  });

  it('exports individual student recap in CSV format', async () => {
    const res = await req('GET', `/api/rekap/export?format=excel&siswa_id=${student.siswa_id}&start_date=2026-05-01&end_date=2026-05-31`, null, token);
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/csv/);
    assert.ok(res.rawBody.length > 50);
    const text = res.rawBody.toString('utf8');
    assert.ok(text.includes('sep=,'));
    assert.ok(text.includes('Laporan Kehadiran Perorangan'));
    assert.ok(text.includes(student.nama));
  });

  it('exports individual student recap in PDF format', async () => {
    const res = await req('GET', `/api/rekap/export?format=pdf&siswa_id=${student.siswa_id}&start_date=2026-05-01&end_date=2026-05-31`, null, token);
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /application\/pdf/);
    assert.ok(res.rawBody.length > 500);
  });
});
