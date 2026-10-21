// Tes registry nomor WhatsApp per cabang.
//
// Yang dijaga:
//   - kredensial tersimpan TERENKRIPSI dan tidak pernah dikirim balik ke klien
//   - pesan cabang A keluar lewat nomor cabang A, bukan nomor cabang lain
//   - cabang tanpa nomor memakai nomor pusat (cadangan)
//   - kalau tidak ada cadangan, pesan TIDAK dikirim (bukan dikirim dari nomor
//     yang salah) dan tercatat sebagai 'tanpa-akun'
//   - akun nonaktif dilewati
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const db = require('../backend/db');
const akunWa = require('../backend/utils/wa-akun');
const wa = require('../backend/utils/wa');

const NYAWA = Date.now();

function stub() {
  const diterima = [];
  const server = http.createServer((req, res) => {
    let isi = '';
    req.on('data', (c) => (isi += c));
    req.on('end', () => {
      diterima.push({ url: req.url, body: isi });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, diterima }));
  });
}

function bersihkan() {
  db.prepare('DELETE FROM wa_monitor_akun').run();
  db.prepare('DELETE FROM wa_akun').run();
  db.prepare("DELETE FROM notifikasi WHERE tipe IN ('wa_terputus','wa_pulih')").run();
}

describe('nomor WhatsApp per cabang', () => {
  let cabang;
  let stA;
  let stB;
  let stPusat;
  let idA;
  let idPusat;

  before(async () => {
    bersihkan();
    cabang = db.prepare('SELECT id FROM cabang ORDER BY id LIMIT 3').all();
    stA = await stub();
    stB = await stub();
    stPusat = await stub();
  });

  after(async () => {
    bersihkan();
    for (const s of [stA, stB, stPusat]) await new Promise((r) => s.server.close(r));
  });

  it('kredensial disimpan terenkripsi dan tidak bocor ke daftar akun', () => {
    idA = akunWa.simpan({
      cabang_id: cabang[0].id,
      label: `WA ${NYAWA}`,
      provider: 'openwa',
      nomor: '081200000001',
      api_url: `http://127.0.0.1:${stA.port}`,
      api_key: 'kunci-rahasia-sekali'
    });

    const mentah = akunWa.ambil(idA);
    assert.match(mentah.api_key, /^enc:v1:/, 'API key harus tersimpan terenkripsi');
    assert.ok(!mentah.api_key.includes('kunci-rahasia-sekali'), 'plaintext tidak boleh ada di DB');
    assert.equal(akunWa.dekripsi(mentah.api_key), 'kunci-rahasia-sekali');

    const daftar = akunWa.daftar();
    const publik = daftar.find((a) => a.id === idA);
    assert.ok(publik, 'akun harus muncul di daftar');
    assert.equal(publik.api_key, undefined, 'kredensial tidak boleh ikut ke klien');
    assert.equal(publik.punya_api_key, true);
    assert.equal(publik.kredensial_terbaca, true);
  });

  it('menolak akun tanpa URL atau tanpa label', () => {
    assert.throws(
      () => akunWa.simpan({ cabang_id: cabang[1].id, label: 'Tanpa URL', provider: 'openwa' }),
      /URL Easy API/i
    );
    assert.throws(
      () => akunWa.simpan({ cabang_id: cabang[1].id, label: '', provider: 'openwa', api_url: 'http://x' }),
      /Label/i
    );
  });

  it('pesan cabang A keluar lewat nomor cabang A', async () => {
    akunWa.simpan({
      cabang_id: cabang[1].id,
      label: `WA B ${NYAWA}`,
      provider: 'openwa',
      api_url: `http://127.0.0.1:${stB.port}`,
      api_key: 'kunci-b'
    });

    const sebelumA = stA.diterima.length;
    const sebelumB = stB.diterima.length;
    const hasil = await wa.kirimWA({ no_wa: '081234567890', pesan: 'Halo cabang A', cabangId: cabang[0].id });
    assert.equal(hasil.status, 'terkirim');
    assert.equal(stA.diterima.length, sebelumA + 1, 'harus lewat nomor cabang A');
    assert.equal(stB.diterima.length, sebelumB, 'nomor cabang B tidak boleh dipakai');

    const body = JSON.parse(stA.diterima[stA.diterima.length - 1].body);
    assert.equal(body.to, '6281234567890@c.us');
    assert.equal(body.content, 'Halo cabang A');
  });

  it('cabang tanpa nomor memakai nomor pusat (cadangan)', async () => {
    idPusat = akunWa.simpan({
      cabang_id: null,
      label: `WA Pusat ${NYAWA}`,
      provider: 'openwa',
      api_url: `http://127.0.0.1:${stPusat.port}`,
      api_key: 'kunci-pusat'
    });

    const sebelum = stPusat.diterima.length;
    const hasil = await wa.kirimWA({ no_wa: '081234567891', pesan: 'Halo cabang C', cabangId: cabang[2].id });
    assert.equal(hasil.status, 'terkirim');
    assert.equal(stPusat.diterima.length, sebelum + 1, 'harus lewat nomor pusat');
  });

  it('tanpa cadangan, cabang yang belum punya nomor TIDAK dikirimi', async () => {
    akunWa.hapus(idPusat);
    const sebelum = [stA, stB, stPusat].map((s) => s.diterima.length);
    const hasil = await wa.kirimWA({ no_wa: '081234567892', pesan: 'Halo cabang C', cabangId: cabang[2].id });
    assert.equal(hasil.status, 'tanpa-akun');
    assert.deepEqual(
      [stA, stB, stPusat].map((s) => s.diterima.length),
      sebelum,
      'tidak ada nomor yang boleh dipakai sebagai pengganti'
    );
  });

  it('akun nonaktif dilewati, memakai cadangan bila ada', async () => {
    const idPusat2 = akunWa.simpan({
      cabang_id: null,
      label: `WA Pusat 2 ${NYAWA}`,
      provider: 'openwa',
      api_url: `http://127.0.0.1:${stPusat.port}`,
      api_key: 'kunci-pusat-2'
    });
    // Nonaktifkan nomor cabang A.
    akunWa.simpan({ ...akunWa.ambil(idA), api_key: '', aktif: false }, idA);

    const sebelumA = stA.diterima.length;
    const sebelumPusat = stPusat.diterima.length;
    const hasil = await wa.kirimWA({ no_wa: '081234567893', pesan: 'Halo', cabangId: cabang[0].id });
    assert.equal(hasil.status, 'terkirim');
    assert.equal(stA.diterima.length, sebelumA, 'akun nonaktif tidak boleh dipakai');
    assert.equal(stPusat.diterima.length, sebelumPusat + 1, 'harus jatuh ke cadangan');
    akunWa.hapus(idPusat2);
  });

  it('statusWA melaporkan mode per-cabang saat ada akun', () => {
    const s = wa.statusWA();
    assert.equal(s.mode, 'akun');
    assert.equal(s.akunAktif, true);
  });
});
