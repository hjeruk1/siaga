const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

// Run against a non-watch backend. `node --watch` can restart when SQLite
// WAL/log files change, causing ECONNRESET in the middle of the suite.
const BASE = process.env.TEST_URL || 'http://localhost:3001';
let token = '';
let adminToken = '';

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const data = body ? JSON.stringify(body) : undefined;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request(url, { method, headers }, res => {
      let d = '';
      res.on('data', c => d += c);
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

describe('SIAGA API Tests', () => {
  before(async () => {
    const r = await req('POST', '/api/auth/login', { username: 'admin', password: process.env.TEST_ADMIN_PASSWORD || 'admin123' });
    assert.equal(r.status, 200, 'Login should succeed');
    token = r.body.token;
    adminToken = token;
  });

  describe('Auth', () => {
    it('GET /api/auth/me returns user', async () => {
      const r = await req('GET', '/api/auth/me');
      assert.equal(r.status, 200);
      assert.ok(r.body.display_name);
      assert.ok(r.body.role);
    });

    it('POST /api/auth/change-password rejects empty', async () => {
      const r = await req('POST', '/api/auth/change-password', {});
      assert.equal(r.status, 400);
    });
  });

  describe('Master Data', () => {
    let cabangId;

    it('GET /api/master/cabang returns list', async () => {
      const r = await req('GET', '/api/master/cabang');
      assert.equal(r.status, 200);
      assert.ok(Array.isArray(r.body));
      if (r.body.length) {
        assert.ok('siswa_aktif_count' in r.body[0]);
        assert.ok('kb_count' in r.body[0]);
        assert.ok('tk_count' in r.body[0]);
        assert.ok('care_count' in r.body[0]);
        assert.ok('staff_aktif_count' in r.body[0]);
        assert.ok('admin_count' in r.body[0]);
        assert.ok('kepsek_count' in r.body[0]);
        assert.ok('guru_count' in r.body[0]);
        assert.ok('gerbang_count' in r.body[0]);
        assert.ok('kepsek_nama' in r.body[0]);
      }
      if (r.body.length) cabangId = r.body[0].id;
    });

    it('GET /api/master/jenjang returns list', async () => {
      const r = await req('GET', '/api/master/jenjang');
      assert.equal(r.status, 200);
      assert.ok(Array.isArray(r.body));
    });

    it('GET /api/master/rombel returns list', async () => {
      const r = await req('GET', '/api/master/rombel?cabang_id=' + (cabangId || 1));
      assert.equal(r.status, 200);
      assert.ok(Array.isArray(r.body));
    });

    it('GET /api/master/operasional-config returns config', async () => {
      const r = await req('GET', '/api/master/operasional-config?cabang_id=' + (cabangId || 1));
      assert.equal(r.status, 200);
      assert.ok(Array.isArray(r.body));
    });

    it('GET /api/master/organisasi returns org data', async () => {
      const r = await req('GET', '/api/master/organisasi');
      assert.equal(r.status, 200);
      assert.ok(r.body.nama);
    });

    it('GET /api/master/kalender returns events', async () => {
      const r = await req('GET', '/api/master/kalender?cabang_id=' + (cabangId || 1));
      assert.equal(r.status, 200);
      assert.ok(Array.isArray(r.body));
    });

    it('GET /api/master/audit-log returns logs', async () => {
      const r = await req('GET', '/api/master/audit-log?limit=5');
      assert.equal(r.status, 200);
      assert.ok(Array.isArray(r.body));
    });
  });

  describe('Pengguna', () => {
    it('GET /api/pengguna returns staff list', async () => {
      const r = await req('GET', '/api/pengguna');
      assert.equal(r.status, 200);
      assert.ok(Array.isArray(r.body));
    });

    it('GET /api/pengguna/wali returns wali list', async () => {
      const r = await req('GET', '/api/pengguna/wali');
      assert.equal(r.status, 200);
      assert.ok(Array.isArray(r.body));
    });
  });

  describe('Siswa', () => {
    let siswaId;

    it('GET /api/siswa returns list', async () => {
      const r = await req('GET', '/api/siswa');
      assert.equal(r.status, 200);
      assert.ok(Array.isArray(r.body));
      if (r.body.length) siswaId = r.body[0].id;
    });

    it('GET /api/siswa/:id returns detail', async () => {
      if (!siswaId) return;
      const r = await req('GET', '/api/siswa/' + siswaId);
      assert.equal(r.status, 200);
      assert.ok(r.body.nama);
    });

    it('POST /api/siswa/kenaikan/preview returns preview', async () => {
      const r = await req('POST', '/api/siswa/kenaikan/preview', { cabang_id: 1 });
      assert.equal(r.status, 200);
      assert.ok(r.body.preview);
    });
  });

  describe('Absensi', () => {
    it('GET /api/absensi/today returns rows', async () => {
      const r = await req('GET', '/api/absensi/today?cabang_id=1');
      assert.equal(r.status, 200);
      assert.ok(r.body.rows || Array.isArray(r.body));
    });

    it('GET /api/absensi/early-release returns list', async () => {
      const r = await req('GET', '/api/absensi/early-release?cabang_id=1');
      assert.equal(r.status, 200);
      assert.ok(Array.isArray(r.body));
    });
  });

  describe('Daily Record', () => {
    it('GET /api/daily-record/today returns rows', async () => {
      const r = await req('GET', '/api/daily-record/today?cabang_id=1');
      assert.equal(r.status, 200);
      assert.ok(r.body.rows || Array.isArray(r.body));
    });
  });

  describe('Notifikasi', () => {
    it('GET /api/notifikasi returns list', async () => {
      const r = await req('GET', '/api/notifikasi');
      assert.equal(r.status, 200);
      assert.ok(Array.isArray(r.body));
    });
  });

  describe('Billing', () => {
    it('GET /api/billing/tarif returns list', async () => {
      const r = await req('GET', '/api/billing/tarif?cabang_id=1');
      assert.equal(r.status, 200);
      assert.ok(Array.isArray(r.body));
    });

    it('GET /api/billing/tagihan returns list', async () => {
      const r = await req('GET', '/api/billing/tagihan?cabang_id=1');
      assert.equal(r.status, 200);
      assert.ok(Array.isArray(r.body));
    });

    it('GET /api/billing/pembayaran returns list', async () => {
      const r = await req('GET', '/api/billing/pembayaran?cabang_id=1');
      assert.equal(r.status, 200);
      assert.ok(Array.isArray(r.body));
    });

    it('GET /api/billing/invoice returns list', async () => {
      const r = await req('GET', '/api/billing/invoice?cabang_id=1');
      assert.equal(r.status, 200);
      assert.ok(Array.isArray(r.body));
    });

    it('GET /api/billing/laporan returns summary', async () => {
      const r = await req('GET', '/api/billing/laporan?cabang_id=1');
      assert.equal(r.status, 200);
      assert.ok(r.body.summary);
    });

    it('POST /api/billing/generate-bulanan/preview returns preview', async () => {
      const r = await req('POST', '/api/billing/generate-bulanan/preview', { cabang_id: 1, periode: '2026-07' });
      assert.equal(r.status, 200);
      assert.ok(r.body.preview);
    });

    it('POST /api/billing/generate-kegiatan/preview returns preview', async () => {
      const r = await req('POST', '/api/billing/generate-kegiatan/preview', { cabang_id: 1, tahun_ajaran: '2026/2027' });
      assert.equal(r.status, 200);
      assert.ok(r.body.preview);
    });

    it('GET /api/billing/pembayaran/preview-alokasi validates params', async () => {
      const r = await req('GET', '/api/billing/pembayaran/preview-alokasi');
      assert.equal(r.status, 400);
    });
  });

  after(() => {
    console.log('\n✅ All tests completed');
  });
});
