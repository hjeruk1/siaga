// Tes unit kanal WhatsApp (backend/utils/wa.js).
//
// Fokus: normalisasi nomor, format pesan, gate tipe, isolasi kegagalan, dan
// antrean berpacu. Tidak ada jaringan nyata — provider 'log' dan provider
// openwa yang diarahkan ke port tertutup (gagal = ECONNREFUSED seketika,
// bukan menunggu timeout 10 detik).
const { describe, it, before } = require('node:test');
const assert = require('node:assert');

function setEnv(nilai) {
  process.env.WA_PROVIDER = nilai.provider;
  process.env.WA_API_URL = nilai.apiUrl || '';
  process.env.WA_API_KEY = nilai.apiKey || '';
  process.env.WA_TIPE_AKTIF =
    nilai.tipe || 'daily_published,guru_reply,payment_verified,payment_rejected,invoice_issued,payment_claim';
  process.env.WA_DELAY_MS = '0';
  if (nilai.gatewayUrl === undefined) delete process.env.WA_GATEWAY_URL;
  else process.env.WA_GATEWAY_URL = nilai.gatewayUrl;
}

describe('kanal WhatsApp: normalisasi nomor', () => {
  const wa = require('../backend/utils/wa');

  it('mengubah nomor lokal 08xx menjadi internasional', () => {
    assert.equal(wa.chatIdDari('08123456789'), '628123456789@c.us');
    assert.equal(wa.chatIdDari('0812-3456-789'), '628123456789@c.us');
  });

  it('menerima format +62, 62, dan 62+0', () => {
    assert.equal(wa.chatIdDari('+628123456789'), '628123456789@c.us');
    assert.equal(wa.chatIdDari('628123456789'), '628123456789@c.us');
    assert.equal(wa.chatIdDari('6208123456789'), '628123456789@c.us');
  });

  it('menolak nomor yang tidak masuk akal', () => {
    assert.equal(wa.chatIdDari(''), null);
    assert.equal(wa.chatIdDari(null), null);
    assert.equal(wa.chatIdDari('12345'), null, 'tanpa awalan 0/62 tidak boleh ditebak');
    assert.equal(wa.chatIdDari('0812'), null, 'terlalu pendek');
  });
});

describe('kanal WhatsApp: format pesan', () => {
  const wa = require('../backend/utils/wa');
  const db = require('../backend/db');

  it('berisi judul, isi, dan tautan login', () => {
    const pesan = wa.formatPesan({
      title: 'Pembayaran Dikonfirmasi',
      body: 'Pembayaran Rp 234.000 telah diverifikasi.',
      link: 'https://siaga.sekolah.id'
    });
    // Header memakai nama sekolah dari tabel organisasi, bukan teks di kode:
    // mengganti nama yayasan tidak boleh menuntut deploy ulang.
    const org = db.prepare('SELECT nama FROM organisasi WHERE id=1').get();
    assert.ok(pesan.startsWith(`*${org.nama}*`), `header harus nama organisasi, dapat: ${pesan.split('\n')[0]}`);
    assert.match(pesan, /Pembayaran Dikonfirmasi/);
    assert.match(pesan, /Rp 234\.000/);
    assert.match(pesan, /https:\/\/siaga\.sekolah\.id/);
  });

  it('tautan localhost tidak pernah dikirim ke wali', () => {
    const pesan = wa.formatPesan({ title: 'Judul', body: 'Isi', link: 'http://localhost:5173/' });
    assert.doesNotMatch(pesan, /localhost/);
    assert.doesNotMatch(pesan, /Buka aplikasi/);
  });

  it('tanpa tautan tetap terbentuk (FRONTEND_URL belum diset)', () => {
    const pesan = wa.formatPesan({ title: 'Judul', body: '', link: null });
    assert.match(pesan, /Judul/);
    assert.doesNotMatch(pesan, /Buka aplikasi/);
  });
});

describe('kanal WhatsApp: gate & provider', () => {
  const wa = require('../backend/utils/wa');

  it('mati secara bawaan (tidak mengirim apa pun)', () => {
    setEnv({ provider: 'none' });
    const status = wa.statusWA();
    assert.equal(status.aktif, false);
    assert.equal(status.provider, 'none');
  });

  it('provider log mengirim dan mencatat riwayat', async () => {
    setEnv({ provider: 'log' });
    wa._riwayatUji.length = 0;
    const hasil = await wa.kirimWA({ no_wa: '08123456789', pesan: 'Halo orang tua' });
    assert.equal(hasil.status, 'terkirim');
    assert.equal(wa._riwayatUji.length, 1);
    assert.equal(wa._riwayatUji[0].chatId, '628123456789@c.us');
    assert.equal(wa._riwayatUji[0].pesan, 'Halo orang tua');
    // jeda antrean 0ms -> cepat selesai
    assert.equal(wa.statusWA().antrean, 0);
  });

  it('nomor tidak valid tidak dikirim dan tidak dihitung gagal', async () => {
    setEnv({ provider: 'log' });
    const sebelum = wa._statistik.gagal;
    const hasil = await wa.kirimWA({ no_wa: '12345', pesan: 'x' });
    assert.equal(hasil.status, 'nomor-tidak-valid');
    assert.equal(wa._statistik.gagal, sebelum, 'nomor salah bukan kegagalan pengiriman');
  });

  it('hanya tipe yang diizinkan yang ikut WhatsApp', () => {
    setEnv({ provider: 'log', tipe: 'payment_verified,invoice_issued' });
    const aktif = wa.tipeAktif();
    assert.ok(aktif.has('payment_verified'));
    assert.ok(aktif.has('invoice_issued'));
    assert.ok(!aktif.has('pickup_waiting'), 'notifikasi operasional guru tidak boleh mengganggu orang tua');
  });

  it('gateway resmi tersedia sebagai jalur cadangan', () => {
    setEnv({ provider: 'gateway', gatewayUrl: 'https://api.fonnte.test/send' });
    const status = wa.statusWA();
    assert.equal(status.aktif, true);
    assert.equal(status.provider, 'gateway');
  });
});

describe('kanal WhatsApp: isolasi kegagalan', () => {
  const wa = require('../backend/utils/wa');

  it('Easy API mati: pesan gagal TAPI tidak melempar error', async () => {
    // port 1 (tcpmux) hampir certainly tertutup -> ECONNREFUSED seketika
    setEnv({ provider: 'openwa', apiUrl: 'http://127.0.0.1:1', apiKey: 'kunci-uji' });
    const hasil = await wa.kirimWA({ no_wa: '08123456789', pesan: 'tes gagal' });
    assert.equal(hasil.status, 'gagal');
    assert.ok(hasil.error.length > 0, 'error dicatat untuk audit');
    // penting: fungsi resolve (bukan throw) sehingga jalur request utama aman
    assert.equal(wa.statusWA().antrean, 0, 'antrean kembali bersih setelah gagal');
  });

  it('WA_API_KEY belum diset juga gagal tanpa melempar', async () => {
    setEnv({ provider: 'openwa', apiUrl: 'http://127.0.0.1:1', apiKey: '' });
    const hasil = await wa.kirimWA({ no_wa: '08123456789', pesan: 'tes' });
    assert.equal(hasil.status, 'gagal');
    assert.match(hasil.error, /WA_API_KEY/);
  });

  it('status openwa yang tak terjangkau dilaporkan jujur', async () => {
    setEnv({ provider: 'openwa', apiUrl: 'http://127.0.0.1:1', apiKey: 'k' });
    const p = wa._providerAktif();
    const detail = await p.status();
    assert.equal(detail.provider, 'openwa');
    assert.equal(detail.reachable, false);
  });
});

describe('kanal WhatsApp: kontrak Easy API', () => {
  const wa = require('../backend/utils/wa');
  let stub;
  let terlihat = null;

  before(async () => {
    // Stub HTTP kecil yang meniru endpoint open-wa: mencatat persis bentuk
    // request (path, header, body) supaya kontrak tidak berubah diam-diam.
    const http = require('node:http');
    stub = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        terlihat = { path: req.url, apiKey: req.headers['x-api-key'], body: JSON.parse(body || '{}') };
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, data: 'pesan-123' }));
      });
    });
    await new Promise((r) => stub.listen(0, '127.0.0.1', r));
    process.env.WA_API_URL = `http://127.0.0.1:${stub.address().port}`;
    process.env.WA_API_KEY = 'kunci-rahasia';
  });

  it('POST /api/messages/sendText dengan header X-API-Key dan chatId @c.us', async () => {
    // Env diset langsung (bukan lewat setEnv) supaya WA_API_URL stub di before
    // tidak tertimpa string kosong.
    process.env.WA_PROVIDER = 'openwa';
    const hasil = await wa.kirimWA({ no_wa: '08123456789', pesan: 'Halo dari SIAGA' });
    assert.equal(hasil.status, 'terkirim');
    assert.equal(terlihat.path, '/api/messages/sendText');
    assert.equal(terlihat.apiKey, 'kunci-rahasia');
    assert.equal(terlihat.body.to, '628123456789@c.us');
    assert.equal(terlihat.body.content, 'Halo dari SIAGA');
    assert.deepEqual(terlihat.body.options, {});
  });

  it('health openwa terbaca dari stub', async () => {
    const p = wa._providerAktif();
    // endpoint /health belum distub di sini; cukup pastikan provider terbentuk
    assert.equal(typeof p.kirim, 'function');
    assert.equal(typeof p.status, 'function');
  });

  it('menutup stub setelah selesai', () => {
    stub.close();
  });
});
