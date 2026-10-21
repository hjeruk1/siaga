// Tes dialek open-wa multi-sesi (satu proses, banyak nomor).
//
// Yang dijaga:
//   - pesan cabang A keluar lewat sesi cabang A, B lewat sesi B — walaau
//     URL instance dan API key-nya SAMA
//   - session_id kosong -> dialek Easy API satu nomor (perilaku lama)
//   - status sesi diterjemahkan benar: connected -> ok, qr_ready/disconnected
//     -> down (alarm), layanan tak terjangkau -> down
//   - session_id hanya boleh untuk provider open-wa
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
// Berkas ini juga dijalankan langsung (node --test) tanpa harness.
process.env.JWT_SECRET ||= 'kunci-uji-wa-multi';
process.env.WA_DELAY_MS = '0';
const db = require('../backend/db');
const akunWa = require('../backend/utils/wa-akun');
const wa = require('../backend/utils/wa');
const monitor = require('../backend/utils/wa-monitor');

const NYAWA = Date.now();

// Stub open-wa: mencatat setiap permintaan; jawaban ditentukan handler.
function stub(handler) {
  const diterima = [];
  const server = http.createServer((req, res) => {
    let isi = '';
    req.on('data', (c) => (isi += c));
    req.on('end', () => {
      let body = null;
      try {
        body = isi ? JSON.parse(isi) : null;
      } catch {
        body = isi;
      }
      diterima.push({ method: req.method, url: req.url, body });
      const hasil = handler(req.url, body) || { status: 200, json: { success: true } };
      res.writeHead(hasil.status || 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(hasil.json === undefined ? { success: true } : hasil.json));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, diterima }));
  });
}

let dibuat = [];
let stMulti;
let stLama;

// Sesi per cabang di SATU instance multi-sesi (URL & key sama).
const SESI_A = '11111111-aaaa-4bbb-8ccc-000000000001';
const SESI_B = '22222222-aaaa-4bbb-8ccc-000000000002';
const SESI_PUSAT = '33333333-aaaa-4bbb-8ccc-000000000003';

// Keadaan sesi untuk stub status: default connected.
const keadaan = { [SESI_A]: 'connected', [SESI_B]: 'connected', [SESI_PUSAT]: 'connected' };

function handlerMulti(url) {
  const m = url.match(/^\/api\/sessions\/([0-9a-f-]+)(\/messages\/send-text)?$/);
  if (!m) return { status: 404, json: { error: 'tidak dikenal' } };
  const sid = m[1];
  if (m[2]) return { status: 200, json: { success: true, data: 'pesan-ok' } };
  return {
    status: 200,
    json: {
      id: sid,
      name: sid.slice(0, 8),
      status: keadaan[sid] || 'disconnected',
      phone: '6281234567890',
      pushName: 'Cabang',
      connectedAt: '2026-10-22T00:00:00.000Z',
      lastActive: '2026-10-22T00:00:00.000Z'
    }
  };
}

function bersihkan() {
  const ids = dibuat.join(',');
  if (ids) {
    db.prepare('DELETE FROM wa_monitor_akun WHERE akun_id IN (' + ids + ')').run();
    db.prepare('DELETE FROM wa_akun WHERE id IN (' + ids + ')').run();
  }
  db.prepare("DELETE FROM notifikasi WHERE tipe IN ('wa_terputus','wa_pulih')").run();
  dibuat = [];
}

describe('open-wa multi-sesi', () => {
  let cabang;
  let idA;
  let idB;
  let idPusat;
  let idLama;

  before(async () => {
    bersihkan();
    cabang = db.prepare('SELECT id FROM cabang ORDER BY id LIMIT 2').all();
    stMulti = await stub(handlerMulti);
    stLama = await stub((url) =>
      url === '/api/messages/sendText' ? { status: 200, json: { success: true } } : { status: 404, json: {} }
    );

    idA = akunWa.simpan({
      cabang_id: cabang[0].id,
      label: 'Multi A ' + NYAWA,
      provider: 'openwa',
      api_url: 'http://127.0.0.1:' + stMulti.port,
      api_key: 'kunci-multi',
      session_id: SESI_A
    });
    idB = akunWa.simpan({
      cabang_id: cabang[1].id,
      label: 'Multi B ' + NYAWA,
      provider: 'openwa',
      api_url: 'http://127.0.0.1:' + stMulti.port,
      api_key: 'kunci-multi',
      session_id: SESI_B
    });
    idPusat = akunWa.simpan({
      label: 'Pusat ' + NYAWA,
      provider: 'openwa',
      api_url: 'http://127.0.0.1:' + stMulti.port,
      api_key: 'kunci-multi',
      session_id: SESI_PUSAT
    });
    idLama = akunWa.simpan({
      label: 'Lama ' + NYAWA,
      provider: 'openwa',
      api_url: 'http://127.0.0.1:' + stLama.port,
      api_key: 'kunci-lama'
    });
    dibuat.push(idA, idB, idPusat, idLama);
  });

  after(async () => {
    bersihkan();
    for (const s of [stMulti, stLama]) await new Promise((r) => s.server.close(r));
  });

  it('pesan cabang A keluar lewat sesi cabang A (bukan sesi lain)', async () => {
    const r = await wa.kirimWA({ no_wa: '081200000001', pesan: 'Halo A', cabangId: cabang[0].id });
    assert.equal(r.status, 'terkirim');
    const pakai = stMulti.diterima.filter((d) => d.url.includes('/messages/send-text'));
    const terakhir = pakai[pakai.length - 1];
    assert.equal(terakhir.method, 'POST');
    assert.equal(terakhir.url, '/api/sessions/' + SESI_A + '/messages/send-text');
    assert.deepEqual(terakhir.body, { chatId: '6281200000001@c.us', text: 'Halo A' });
  });

  it('cabang B lewat sesi B walau URL & API key-nya sama dengan A', async () => {
    const r = await wa.kirimWA({ no_wa: '081200000002', pesan: 'Halo B', cabangId: cabang[1].id });
    assert.equal(r.status, 'terkirim');
    const pakai = stMulti.diterima.filter((d) => d.url.includes('/messages/send-text'));
    const terakhir = pakai[pakai.length - 1];
    assert.equal(terakhir.url, '/api/sessions/' + SESI_B + '/messages/send-text');
    assert.deepEqual(terakhir.body, { chatId: '6281200000002@c.us', text: 'Halo B' });
  });

  it('cabang tanpa sesi memakai sesi pusat (cadangan)', async () => {
    const cabangLain = db.prepare('SELECT id FROM cabang ORDER BY id DESC LIMIT 1').get();
    const r = await wa.kirimWA({ no_wa: '081200000009', pesan: 'Halo pusat', cabangId: cabangLain.id });
    assert.equal(r.status, 'terkirim');
    const pakai = stMulti.diterima.filter((d) => d.url.includes('/messages/send-text'));
    const terakhir = pakai[pakai.length - 1];
    assert.equal(terakhir.url, '/api/sessions/' + SESI_PUSAT + '/messages/send-text');
  });

  it('tanpa session_id -> dialek Easy API satu nomor (perilaku lama)', async () => {
    // Langsung lewat provider akun lama: akun ini bukan milik cabang mana
    // pun, jadi jalur kirimWA (yang memilih per cabang) tidak dipakai di sini.
    const provider = wa.providerDariAkun(akunWa.ambil(idLama));
    await provider.kirim({ no_wa: '081200000003', pesan: 'Halo lama' });
    const pakai = stLama.diterima;
    const terakhir = pakai[pakai.length - 1];
    assert.equal(terakhir.url, '/api/messages/sendText');
    assert.deepEqual(terakhir.body, { to: '6281200000003@c.us', content: 'Halo lama', options: {} });
  });

  it('status sesi diterjemahkan: connected -> ok', async () => {
    const provider = wa.providerDariAkun(akunWa.ambil(idA));
    const hasil = await provider.status();
    assert.equal(hasil.multi, true);
    assert.equal(hasil.reachable, true);
    assert.equal(hasil.connected, true);
    assert.equal(monitor.klasifikasi({ aktif: true, ...hasil }), 'ok');
  });

  it('qr_ready & disconnected -> down (sesi belum bisa dipakai)', async () => {
    keadaan[SESI_B] = 'qr_ready';
    let provider = wa.providerDariAkun(akunWa.ambil(idB));
    let hasil = await provider.status();
    assert.equal(hasil.connected, false);
    assert.equal(monitor.klasifikasi({ aktif: true, ...hasil }), 'down');

    keadaan[SESI_B] = 'disconnected';
    provider = wa.providerDariAkun(akunWa.ambil(idB));
    hasil = await provider.status();
    assert.equal(hasil.connected, false);
    assert.equal(monitor.klasifikasi({ aktif: true, ...hasil }), 'down');
    keadaan[SESI_B] = 'connected';
  });

  it('layanan OpenWA mati -> down dengan pesan perbaikan multi-sesi', async () => {
    const portAsal = stMulti.port;
    await new Promise((r) => stMulti.server.close(r));
    try {
      const provider = wa.providerDariAkun(akunWa.ambil(idA));
      const hasil = await provider.status();
      assert.equal(hasil.reachable, false);
      assert.equal(monitor.klasifikasi({ aktif: true, ...hasil }), 'down');
      await monitor.cekAkun(akunWa.ambil(idA));
      const simpan = db.prepare('SELECT pesan FROM wa_monitor_akun WHERE akun_id=?').get(idA);
      assert.match(simpan.pesan, /dashboard OpenWA|layanan OpenWA/);
    } finally {
      // Kembalikan di port ASLI: akun-akun lain menunjuk ke port itu.
      await new Promise((r) => stMulti.server.listen(portAsal, '127.0.0.1', () => r()));
    }
  });

  it('simpan menolak session_id untuk provider gateway', () => {
    assert.throws(
      () =>
        akunWa.simpan({
          label: 'Gw ' + NYAWA,
          provider: 'gateway',
          gateway_url: 'https://api.contoh/send',
          session_id: SESI_A
        }),
      /Session ID hanya untuk provider open-wa/
    );
  });

  it('session_id tersimpan, terbaca dari ambil(), dan bisa dikosongkan', () => {
    const row = akunWa.ambil(idA);
    assert.equal(row.session_id, SESI_A);
    // Bentuk aman untuk klien memuat session_id (bukan rahasia).
    const publik = akunWa.daftar().find((a) => a.id === idA);
    assert.equal(publik.session_id, SESI_A);
    // Kosongkan -> kembali ke dialek satu nomor.
    akunWa.simpan({ ...row, session_id: '' }, idA);
    assert.equal(akunWa.ambil(idA).session_id, null);
    akunWa.simpan({ ...row, session_id: SESI_A }, idA);
    assert.equal(akunWa.ambil(idA).session_id, SESI_A);
  });

  it('pemantau menulis satu baris per akun dengan status masing-masing', async () => {
    keadaan[SESI_A] = 'connected';
    keadaan[SESI_B] = 'qr_ready';
    await monitor.cekAkun(akunWa.ambil(idA));
    await monitor.cekAkun(akunWa.ambil(idB));
    const a = db.prepare('SELECT status FROM wa_monitor_akun WHERE akun_id=?').get(idA);
    const b = db.prepare('SELECT status FROM wa_monitor_akun WHERE akun_id=?').get(idB);
    assert.equal(a.status, 'ok');
    assert.equal(b.status, 'down');
    keadaan[SESI_B] = 'connected';
    await monitor.cekAkun(akunWa.ambil(idB));
    const b2 = db.prepare('SELECT status FROM wa_monitor_akun WHERE akun_id=?').get(idB);
    assert.equal(b2.status, 'ok');
  });
});
