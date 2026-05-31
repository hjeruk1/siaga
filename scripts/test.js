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

function reqBuffer(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const data = body ? JSON.stringify(body) : undefined;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request(url, { method, headers }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks)
        });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function assertBrandedPdf(pdf, label) {
  assert.equal(pdf.status, 200, `${label} PDF should be returned`);
  assert.match(pdf.headers['content-type'] || '', /application\/pdf/);
  assert.ok(pdf.body.length > 1000, `${label} PDF should not be empty`);
  assert.ok(
    pdf.body.includes(Buffer.from('/Subtype /Image')),
    `${label} PDF should embed the Taruna Prima logo image`
  );
  assert.ok(
    pdf.body.includes(Buffer.from(`SIAGA ${label}`)),
    `${label} PDF should include official SIAGA document metadata`
  );
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

    it('hard deletes a newly-created staff without operational history', async () => {
      const suffix = Date.now();
      const username = `delete.staff.${suffix}`;
      const created = await req('POST', '/api/pengguna/staff', {
        display_name: `Delete Staff ${suffix}`,
        username,
        role: 'guru',
        cabang_id: 1
      });
      assert.equal(created.status, 200);
      assert.ok(created.body.id);

      const deleted = await req('DELETE', `/api/pengguna/staff/${created.body.id}`);
      assert.equal(deleted.status, 200);
      assert.equal(deleted.body.success, true);

      const list = await req('GET', '/api/pengguna?cabang_id=1');
      assert.equal(list.status, 200);
      assert.equal(list.body.some(s => s.username === username), false);
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

    it('manages penjemput and reissues QR code', async () => {
      if (!siswaId) return;
      const suffix = Date.now();
      const created = await req('POST', `/api/siswa/${siswaId}/penjemput`, {
        nama: `Penjemput Test ${suffix}`,
        no_wa: `628${suffix}`,
        relasi: 'Wali'
      });
      assert.equal(created.status, 200);
      assert.ok(created.body.qr_code);

      const reissued = await req('POST', `/api/siswa/penjemput/${created.body.id}/qr/reissue`, { reason: 'test' });
      assert.equal(reissued.status, 200);
      assert.ok(reissued.body.qr_code);
      assert.notEqual(reissued.body.qr_code, created.body.qr_code);

      const updated = await req('PUT', `/api/siswa/penjemput/${created.body.id}`, {
        nama: `Penjemput Edit ${suffix}`,
        relasi: 'Wali',
        aktif: 0
      });
      assert.equal(updated.status, 200);
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

  describe('Rekap', () => {
    it('GET /api/rekap/dashboard counts Belum students without absensi rows', async () => {
      const daily = await req('GET', '/api/daily-record/today?cabang_id=1');
      assert.equal(daily.status, 200);
      const rows = daily.body.rows || daily.body;

      const dashboard = await req('GET', '/api/rekap/dashboard?cabang_id=1');
      assert.equal(dashboard.status, 200);
      assert.ok(dashboard.body.statusCounts);
      assert.ok(Array.isArray(dashboard.body.statusRows));
      assert.ok(Array.isArray(dashboard.body.earlyReleases));
      assert.ok(dashboard.body.dayCloseStatus);

      if (!dashboard.body.libur && rows.length > 0) {
        const counts = dashboard.body.statusCounts;
        const total = ['hadir', 'terlambat', 'menunggu', 'pulang', 'izin', 'sakit', 'absen', 'belum']
          .reduce((sum, key) => sum + Number(counts[key] || 0), 0);
        assert.equal(total, rows.length);
        assert.equal(dashboard.body.statusRows.length, rows.length);
      }
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

    it('tracks payment credit and returns editable allocations', async () => {
      const students = await req('GET', '/api/siswa?cabang_id=1');
      assert.equal(students.status, 200);
      if (!students.body.length) return;
      const siswaId = students.body[0].id;
      const nominal = 999999999;

      const created = await req('POST', '/api/billing/pembayaran', {
        cabang_id: 1,
        siswa_id: siswaId,
        nominal,
        metode: 'tunai',
        tanggal_bayar: '2026-07-01',
        catatan: 'test saldo kredit'
      });
      assert.equal(created.status, 200);
      assert.ok(created.body.id);

      const detail = await req('GET', `/api/billing/pembayaran/${created.body.id}/alokasi`);
      assert.equal(detail.status, 200);
      assert.ok(Array.isArray(detail.body.allocations));
      assert.ok(Array.isArray(detail.body.bills));
      assert.equal(
        Number(detail.body.payment.credit_amount),
        nominal - Number(detail.body.payment.allocated_amount || 0)
      );

      const updated = await req('PUT', `/api/billing/pembayaran/${created.body.id}/alokasi`, { alokasi: [] });
      assert.equal(updated.status, 200);

      const after = await req('GET', `/api/billing/pembayaran/${created.body.id}/alokasi`);
      assert.equal(after.status, 200);
      assert.equal(Number(after.body.payment.allocated_amount), 0);
      assert.equal(Number(after.body.payment.credit_amount), nominal);

      const list = await req('GET', '/api/billing/pembayaran?cabang_id=1');
      assert.equal(list.status, 200);
      const row = list.body.find(p => p.id === created.body.id);
      assert.ok(row);
      assert.ok('allocated_amount' in row);
      assert.ok('credit_amount' in row);
    });

    it('updates discount active state and value', async () => {
      const students = await req('GET', '/api/siswa?cabang_id=1');
      assert.equal(students.status, 200);
      if (!students.body.length) return;

      const created = await req('POST', '/api/billing/diskon', {
        cabang_id: 1,
        siswa_id: students.body[0].id,
        tahun_ajaran: '2026/2027',
        jenis: 'spp',
        tipe: 'nominal',
        nilai: 12345,
        catatan: 'test diskon'
      });
      assert.equal(created.status, 200);

      const updated = await req('PUT', `/api/billing/diskon/${created.body.id}`, {
        tipe: 'persen',
        nilai: 10,
        aktif: 0,
        catatan: 'test diskon updated'
      });
      assert.equal(updated.status, 200);

      const list = await req('GET', '/api/billing/diskon?cabang_id=1&tahun_ajaran=2026%2F2027');
      assert.equal(list.status, 200);
      const row = list.body.find(d => d.id === created.body.id);
      assert.ok(row);
      assert.equal(row.tipe, 'persen');
      assert.equal(Number(row.nilai), 10);
      assert.equal(Number(row.aktif), 0);
    });

    it('renders branded logo headers in invoice and receipt PDFs', async () => {
      const students = await req('GET', '/api/siswa?cabang_id=1');
      assert.equal(students.status, 200);
      if (!students.body.length) return;
      const siswaId = students.body[0].id;

      const payment = await req('POST', '/api/billing/pembayaran', {
        cabang_id: 1,
        siswa_id: siswaId,
        nominal: 75000,
        metode: 'tunai',
        tanggal_bayar: '2026-07-02',
        catatan: 'test branded pdf'
      });
      assert.equal(payment.status, 200);
      assert.ok(payment.body.id);
      assert.ok(payment.body.receipt_no);

      const receiptPdf = await reqBuffer('GET', `/api/billing/pembayaran/${payment.body.id}/pdf`);
      assertBrandedPdf(receiptPdf, 'Receipt');

      const bills = await req('GET', `/api/billing/tagihan?cabang_id=1&siswa_id=${siswaId}`);
      assert.equal(bills.status, 200);
      if (!bills.body.length) return;

      const invoice = await req('POST', '/api/billing/invoice', { tagihan_ids: [bills.body[0].id] });
      assert.equal(invoice.status, 200);
      assert.ok(invoice.body.id);

      const invoicePdf = await reqBuffer('GET', `/api/billing/invoice/${invoice.body.id}/pdf`);
      assertBrandedPdf(invoicePdf, 'Invoice');
    });
  });

  after(() => {
    console.log('\n✅ All tests completed');
  });
});
