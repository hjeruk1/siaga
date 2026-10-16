const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

const BASE = process.env.TEST_URL || 'http://localhost:3001';
let token = '';
let student = null;

function req(method, path, body, authToken) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    const data = body === undefined ? undefined : JSON.stringify(body);
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request(url, { method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        let parsed = raw;
        try {
          parsed = JSON.parse(raw);
        } catch {}
        resolve({ status: res.statusCode, body: parsed, raw });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

describe('Input validation', () => {
  before(async () => {
    const loginRes = await req('POST', '/api/auth/login', {
      tipe: 'staff',
      username: 'admin',
      password: process.env.TEST_ADMIN_PASSWORD || 'admin123'
    });
    assert.equal(loginRes.status, 200, loginRes.raw);
    token = loginRes.body.token;

    const cabangRes = await req('GET', '/api/master/cabang', undefined, token);
    const jenjangRes = await req('GET', '/api/master/jenjang', undefined, token);
    const cabang = cabangRes.body.find((item) => item.aktif) || cabangRes.body[0];
    const jenjang = jenjangRes.body[0];
    const rombelRes = await req('GET', `/api/master/rombel?cabang_id=${cabang.id}`, undefined, token);
    const rombel = rombelRes.body.find((item) => Number(item.jenjang_id) === Number(jenjang.id)) || rombelRes.body[0];

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const createRes = await req(
      'POST',
      '/api/siswa',
      {
        nama: `Siswa Validasi ${suffix}`,
        nis: `VAL-${suffix}`,
        cabang_id: cabang.id,
        jenjang_id: rombel.jenjang_id,
        rombel_id: rombel.id,
        paket: 'reguler',
        tanggal_mulai: '2026-05-01'
      },
      token
    );
    assert.equal(createRes.status, 200, createRes.raw);
    student = { id: createRes.body.id, cabang_id: cabang.id };
  });

  it('menolak login dengan password bertipe salah', async () => {
    const res = await req('POST', '/api/auth/login', { tipe: 'staff', username: 'admin', password: {} });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
  });

  it('menolak login dengan tipe yang tidak dikenal', async () => {
    const res = await req('POST', '/api/auth/login', { tipe: 'penyusup', username: 'admin', password: 'admin123' });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
  });

  it('menolak check-in tanpa siswa_id', async () => {
    const res = await req('POST', '/api/absensi/checkin', { tanggal: '2026-05-04' }, token);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
  });

  it('menolak check-in dengan siswa_id bertipe salah', async () => {
    const res = await req('POST', '/api/absensi/checkin', { siswa_id: { jahat: true } }, token);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
  });

  it('menolak check-in dengan format tanggal salah', async () => {
    const res = await req('POST', '/api/absensi/checkin', { siswa_id: student.id, tanggal: '04-05-2026' }, token);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
  });

  it('menolak keterangan dengan status di luar Izin/Sakit/Absen', async () => {
    const res = await req('POST', '/api/absensi/keterangan', { siswa_id: student.id, status: 'Bolos' }, token);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
  });

  it('menolak pembayaran dengan nominal bukan angka', async () => {
    const res = await req(
      'POST',
      '/api/billing/pembayaran',
      { siswa_id: student.id, nominal: 'abc', metode: 'tunai' },
      token
    );
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
  });

  it('menolak pembayaran dengan nominal negatif', async () => {
    const res = await req(
      'POST',
      '/api/billing/pembayaran',
      { siswa_id: student.id, nominal: -5000, metode: 'tunai' },
      token
    );
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
  });

  it('menolak pembayaran tanpa metode', async () => {
    const res = await req('POST', '/api/billing/pembayaran', { siswa_id: student.id, nominal: 50000 }, token);
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
  });

  it('menolak alokasi dengan tagihan_id bertipe salah', async () => {
    const res = await req(
      'POST',
      '/api/billing/pembayaran',
      {
        siswa_id: student.id,
        nominal: 50000,
        metode: 'tunai',
        alokasi: [{ tagihan_id: 'bukan-angka' }]
      },
      token
    );
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
  });

  it('tetap menerima payload pembayaran yang valid', async () => {
    const res = await req(
      'POST',
      '/api/billing/pembayaran',
      {
        siswa_id: student.id,
        cabang_id: student.cabang_id,
        nominal: 50000,
        metode: 'tunai',
        tanggal_bayar: '2026-05-04',
        catatan: 'uji validasi'
      },
      token
    );
    assert.equal(res.status, 200, res.raw);
    assert.ok(res.body.id);
  });

  it('tetap menerima login yang valid', async () => {
    const res = await req('POST', '/api/auth/login', {
      tipe: 'staff',
      username: 'admin',
      password: process.env.TEST_ADMIN_PASSWORD || 'admin123'
    });
    assert.equal(res.status, 200, res.raw);
    assert.ok(res.body.token);
  });
});
