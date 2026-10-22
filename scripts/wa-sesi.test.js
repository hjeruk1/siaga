// Tes alur "hubungkan nomor mandiri" (sesi open-wa multi-sesi).
//
// Dua lapis:
//   - util (wa-sesi.js): diuji langsung dengan instance OpenWA tiruan —
//     create+start, QR (passthrough + cache), kode pairing (normalisasi nomor
//     + jeda), simpan sesi ready sebagai akun (kredensial terenkripsi).
//   - rute: hak akses — admin pusat semua cabang, admin_cabang hanya
//     cabangnya sendiri, hapus sesi hanya admin pusat.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
// Berkas ini juga dijalankan langsung (node --test) tanpa harness.
process.env.JWT_SECRET ||= 'kunci-uji-wa-sesi';
const db = require('../backend/db');
const bcrypt = require('../backend/node_modules/bcryptjs');

const BASE = process.env.TEST_URL || 'http://127.0.0.1:3999';
const NYAWA = Date.now();
const PASSWORD = 'rahasia-sesi-uji';

// Instance tiruan: mencatat permintaan, menjawab sesuai path.
let stub;
const diterima = [];
const SESI = 'aaaaaaaa-bbbb-4ccc-8ddd-000000000001';
const keadaan = { [SESI]: 'qr_ready' };

function handler(url, body, method) {
  const m = url.match(/^\/api\/sessions(\/([0-9a-f-]+))?(\/(start|qr|pairing-code))?$/);
  if (!m) return { status: 404, json: { message: 'tidak dikenal' } };
  if (!m[1]) {
    // POST = buat sesi (balas objek sesi); GET = daftar (balas array).
    if (method === 'POST') return { status: 201, json: { id: SESI, name: body?.name || 'wa', status: 'created' } };
    return { status: 200, json: [{ id: SESI, name: 'wa-godean', status: keadaan[SESI], phone: null }] };
  }
  const sid = m[2];
  const aksi = m[4];
  if (aksi === 'start') return { status: 200, json: { id: sid, name: 'wa-godean', status: 'initializing' } };
  if (aksi === 'qr') {
    if (keadaan[sid] !== 'qr_ready') return { status: 400, json: { message: 'Session is not started' } };
    return { status: 200, json: { qrCode: 'data:image/png;base64,UERSSw==', status: 'qr_ready' } };
  }
  if (aksi === 'pairing-code') return { status: 200, json: { pairingCode: 'ABCD-EFGH' } };
  const terhubung = keadaan[sid] === 'ready' || keadaan[sid] === 'connected';
  return {
    status: 200,
    json: {
      id: sid,
      name: 'wa-godean',
      status: keadaan[sid],
      phone: terhubung ? '6285172124543' : null,
      pushName: terhubung ? 'Syifa' : null
    }
  };
}

function req(method, p, body, token) {
  return fetch(`${BASE}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
}

let dibuat = [];
function catatId(id) {
  dibuat.push(id);
}

function bersihkanDb() {
  if (dibuat.length) {
    const ids = dibuat.join(',');
    db.prepare(`DELETE FROM audit_log WHERE actor_pengguna_id IN (${ids})`).run();
    db.prepare(`DELETE FROM staff_profile WHERE pengguna_id IN (${ids})`).run();
    db.prepare(`DELETE FROM pengguna WHERE id IN (${ids})`).run();
    dibuat = [];
  }
  db.prepare("DELETE FROM wa_akun WHERE label LIKE 'Uji Sesi%'").run();
  db.prepare("DELETE FROM audit_log WHERE action LIKE 'wa_sesi%'").run();
}

async function buatStaff(nama, role, cabangId) {
  const id = db
    .prepare(
      `INSERT INTO pengguna(tipe,role,display_name,username,password_hash,status,must_change_password,created_at,updated_at)
       VALUES('staff',?,?,?,?,'aktif',0,?,?)`
    )
    .run(
      role,
      `Uji ${nama}`,
      `sesi-${nama}-${NYAWA}`,
      bcrypt.hashSync(PASSWORD, 8),
      new Date().toISOString(),
      new Date().toISOString()
    ).lastInsertRowid;
  db.prepare('INSERT INTO staff_profile(pengguna_id,cabang_id) VALUES(?,?)').run(id, cabangId);
  catatId(id);
  const r = await req('POST', '/api/auth/login', {
    tipe: 'staff',
    username: `sesi-${nama}-${NYAWA}`,
    password: PASSWORD
  });
  assert.equal(r.status, 200, `login ${nama} harus berhasil`);
  return r.body.token;
}

describe('util manajemen sesi open-wa', () => {
  // Util membaca env saat dipanggil — arahkan ke instance tiruan.
  before(async () => {
    bersihkanDb();
    stub = http.createServer((req2, res) => {
      let isi = '';
      req2.on('data', (c) => (isi += c));
      req2.on('end', () => {
        let body = null;
        try {
          body = isi ? JSON.parse(isi) : null;
        } catch {
          body = isi;
        }
        diterima.push({ method: req2.method, url: req2.url, body });
        const hasil = handler(req2.url, body, req2.method) || { status: 200, json: { success: true } };
        res.writeHead(hasil.status || 200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(hasil.json === undefined ? { success: true } : hasil.json));
      });
    });
    await new Promise((r) => stub.listen(0, '127.0.0.1', r));
    process.env.WA_API_URL = `http://127.0.0.1:${stub.address().port}`;
    process.env.WA_API_KEY = 'kunci-uji-sesi';
  });

  after(async () => {
    delete process.env.WA_API_URL;
    delete process.env.WA_API_KEY;
    bersihkanDb();
    await new Promise((r) => stub.close(r));
  });

  it('nomorPairing menormalkan nomor Indonesia', () => {
    const sesi = require('../backend/utils/wa-sesi');
    assert.equal(sesi.nomorPairing('081234567890'), '6281234567890');
    assert.equal(sesi.nomorPairing('+62 812-3456-7890'), '6281234567890');
    assert.equal(sesi.nomorPairing('6281234567890'), '6281234567890');
    assert.equal(sesi.nomorPairing('12345'), null);
    assert.equal(sesi.nomorPairing('08123'), null);
    assert.equal(sesi.nomorPairing(''), null);
    assert.equal(sesi.nomorTampilan('6285172124543'), '085172124543');
    assert.equal(sesi.nomorTampilan(null), null);
  });

  it('buatSesi membuat lalu menyalakan sesi (QR butuh start)', async () => {
    const sesi = require('../backend/utils/wa-sesi');
    const sebelum = diterima.length;
    const s = await sesi.buatSesi('wa-godean');
    assert.equal(s.id, SESI);
    const baru = diterima.slice(sebelum);
    assert.equal(baru[0].method, 'POST');
    assert.equal(baru[0].url, '/api/sessions');
    assert.deepEqual(baru[0].body, { name: 'wa-godean' });
    assert.equal(baru[1].method, 'POST');
    assert.equal(baru[1].url, `/api/sessions/${SESI}/start`);
  });

  it('qrSesi meneruskan data-URL dan mem-cache 3 detik', async () => {
    const sesi = require('../backend/utils/wa-sesi');
    const sebelum = diterima.filter((d) => d.url.includes('/qr')).length;
    const q1 = await sesi.qrSesi(SESI);
    assert.equal(q1.qrCode, 'data:image/png;base64,UERSSw==');
    assert.equal(diterima.filter((d) => d.url.includes('/qr')).length, sebelum + 1);
    await sesi.qrSesi(SESI); // dalam 3 detik: cache, tidak pukul instance
    assert.equal(diterima.filter((d) => d.url.includes('/qr')).length, sebelum + 1, 'qr kedua harus dari cache');
  });

  it('kodePairing mengirim nomor ternormalkan dan dibatasi jeda', async () => {
    const sesi = require('../backend/utils/wa-sesi');
    const r = await sesi.kodePairing(SESI, '0812 3456 7890');
    assert.equal(r.pairingCode, 'ABCD-EFGH');
    assert.equal(r.nomor, '6281234567890');
    const terakhir = diterima[diterima.length - 1];
    assert.equal(terakhir.url, `/api/sessions/${SESI}/pairing-code`);
    assert.deepEqual(terakhir.body, { phoneNumber: '6281234567890' });
    // Permintaan kedua dalam 60 detik ditolak (pemicu blokir nomor).
    await assert.rejects(
      () => sesi.kodePairing(SESI, '081234567890'),
      (e) => e.code === 'TERLALU_SERING'
    );
    // Nomor tak valid ditolak sebelum menyentuh instance.
    await assert.rejects(
      () => sesi.kodePairing('sesi-lain', '12345'),
      (e) => e.code === 'NOMOR_TIDAK_VALID'
    );
  });

  it('simpanSebagaiAkun: sesi ready -> akun tersimpan dengan kredensial terenkripsi', async () => {
    const sesi = require('../backend/utils/wa-sesi');
    keadaan[SESI] = 'ready';
    const cabang = db.prepare('SELECT id FROM cabang ORDER BY id LIMIT 1').get();
    const hasil = await sesi.simpanSebagaiAkun(SESI, { cabang_id: cabang.id, label: 'Uji Sesi Godean' }, { id: null });
    assert.ok(hasil.id);
    assert.equal(hasil.nomor, '085172124543');

    const row = db.prepare('SELECT * FROM wa_akun WHERE id=?').get(hasil.id);
    assert.equal(row.session_id, SESI);
    assert.equal(row.provider, 'openwa');
    assert.equal(row.nomor, '085172124543');
    assert.match(row.api_key, /^enc:v1:/, 'API key instance harus terenkripsi');
    assert.ok(!row.api_key.includes('kunci-uji-sesi'), 'kunci polos tidak boleh ada di DB');
    assert.ok(
      db.prepare("SELECT 1 FROM audit_log WHERE action='wa_sesi_disimpan' AND entity_id=?").get(hasil.id),
      'audit harus tercatat'
    );

    // Sesi yang sama tidak bisa didaftarkan dua kali.
    await assert.rejects(
      () => sesi.simpanSebagaiAkun(SESI, { cabang_id: cabang.id, label: 'Uji Sesi Godean' }, { id: null }),
      /sudah terdaftar/
    );
    db.prepare('DELETE FROM wa_akun WHERE id=?').run(hasil.id);

    // Sesi belum ready -> ditolak.
    keadaan[SESI] = 'qr_ready';
    await assert.rejects(
      () => sesi.simpanSebagaiAkun(SESI, { cabang_id: cabang.id, label: 'Uji Sesi Godean' }, { id: null }),
      /belum terhubung/
    );

    // Build lain memakai state 'connected' — sesi terhubung tetap boleh disimpan.
    assert.equal(sesi.sudahTerhubung('ready'), true);
    assert.equal(sesi.sudahTerhubung('connected'), true);
    assert.equal(sesi.sudahTerhubung('qr_ready'), false);
    keadaan[SESI] = 'connected';
    const hasil2 = await sesi.simpanSebagaiAkun(SESI, { cabang_id: cabang.id, label: 'Uji Sesi Conn' }, { id: null });
    assert.ok(hasil2.id, "state 'connected' harus diterima");
    db.prepare('DELETE FROM wa_akun WHERE id=?').run(hasil2.id);
    keadaan[SESI] = 'qr_ready';
  });
});

describe('rute sesi — hak akses', () => {
  let tokenPusat;
  let tokenCabang;
  let cabangA;
  let cabangB;

  before(async () => {
    bersihkanDb();
    const cabang = db.prepare('SELECT id FROM cabang ORDER BY id LIMIT 2').all();
    cabangA = cabang[0].id;
    cabangB = cabang[1].id;
    tokenPusat = await buatStaff('Pusat', 'admin', cabangA);
    tokenCabang = await buatStaff('Cabang', 'admin_cabang', cabangA);
  });

  after(bersihkanDb);

  it('tanpa instance terkonfigurasi, daftar sesi menjelaskan penyebabnya', async () => {
    // Harness tidak menyetel WA_API_URL/WA_API_KEY.
    const r = await req('GET', '/api/wa/sesi', null, tokenPusat);
    assert.equal(r.status, 400);
    assert.match(r.body.error, /WA_API_URL|WA_API_KEY/);
  });

  it('admin cabang tidak boleh menyiapkan sesi untuk cabang lain', async () => {
    const r = await req('POST', '/api/wa/sesi', { nama: 'wa-x', cabang_id: cabangB }, tokenCabang);
    assert.equal(r.status, 403);
    // Cabang sendiri: lolos auth, gagal di instance (belum dikonfigurasi) —
    // bukti pembatasan cabang bekerja, bukan menolak semua.
    const r2 = await req('POST', '/api/wa/sesi', { nama: 'wa-x', cabang_id: cabangA }, tokenCabang);
    assert.equal(r2.status, 400);
    assert.match(r2.body.error, /WA_API_KEY|OpenWA/);
  });

  it('admin pusat boleh menyiapkan sesi untuk cabang mana pun', async () => {
    const r = await req('POST', '/api/wa/sesi', { nama: 'wa-x', cabang_id: cabangB }, tokenPusat);
    assert.equal(r.status, 400); // auth lolos; instance belum dikonfigurasi
    assert.match(r.body.error, /WA_API_KEY|OpenWA/);
  });

  it('admin cabang tidak boleh menyimpan sesi untuk cabang lain', async () => {
    const r = await req('POST', `/api/wa/sesi/${SESI}/simpan`, { cabang_id: cabangB, label: 'X' }, tokenCabang);
    assert.equal(r.status, 403);
  });

  it('hapus sesi hanya untuk admin pusat', async () => {
    const r = await req('DELETE', `/api/wa/sesi/${SESI}`, null, tokenCabang);
    assert.equal(r.status, 403);
  });

  it('daftar akun: admin pusat lihat semua, admin cabang hanya cabangnya', async () => {
    const idA = db
      .prepare(
        `INSERT INTO wa_akun(cabang_id,label,provider,nomor,api_url,session_id,aktif,created_at,updated_at)
         VALUES(?,'Uji Sesi A','openwa','08111',?,?,1,?,?)`
      )
      .run(cabangA, `http://127.0.0.1:1`, SESI, new Date().toISOString(), new Date().toISOString()).lastInsertRowid;
    const idB = db
      .prepare(
        `INSERT INTO wa_akun(cabang_id,label,provider,nomor,api_url,session_id,aktif,created_at,updated_at)
         VALUES(?,'Uji Sesi B','openwa','08222',?,?,1,?,?)`
      )
      .run(
        cabangB,
        `http://127.0.0.1:1`,
        'bbbbbbbb-bbbb-4ccc-8ddd-000000000002',
        new Date().toISOString(),
        new Date().toISOString()
      ).lastInsertRowid;

    const rPusat = await req('GET', '/api/wa/akun', null, tokenPusat);
    assert.equal(rPusat.status, 200);
    const idPusat = new Set(rPusat.body.rows.map((a) => a.id));
    assert.ok(idPusat.has(idA) && idPusat.has(idB), 'admin pusat melihat semua akun');

    const rCabang = await req('GET', '/api/wa/akun', null, tokenCabang);
    assert.equal(rCabang.status, 200);
    const idCabang = rCabang.body.rows.map((a) => a.id);
    assert.ok(idCabang.includes(idA), 'akun cabang sendiri terlihat');
    assert.ok(!idCabang.includes(idB), 'akun cabang lain tidak boleh terlihat');

    db.prepare('DELETE FROM wa_akun WHERE id IN (?,?)').run(idA, idB);
  });
});
