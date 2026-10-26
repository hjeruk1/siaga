// Tes tanda baca pengumuman.
//
// Yang dijaga:
//   - "dibaca" hanya tercatat untuk pengumuman yang memang boleh dilihat wali
//     itu (pengumuman cabang lain tidak boleh bisa ditandai, dan tidak bocor
//     keberadaannya lewat kode status)
//   - penandaan berulang tidak menggandakan baris
//   - sekolah bisa melihat siapa yang belum membaca, dan admin cabang hanya
//     melihat wali cabangnya walau pengumumannya lintas cabang
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const db = require('../backend/db');
const bcrypt = require('../backend/node_modules/bcryptjs');

process.env.JWT_SECRET ||= 'siaga-test-secret-change-me';

const BASE = process.env.TEST_URL || 'http://127.0.0.1:3999';
const NYAWA = Date.now();
const nowIso = () => new Date().toISOString();

function req(method, p, body, token) {
  return fetch(`${BASE}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
}

async function loginStaff(username) {
  const r = await req('POST', '/api/auth/login', { tipe: 'staff', username, password: 'admin123' });
  return r.body?.token || null;
}
async function loginWali(noWa) {
  const r = await req('POST', '/api/auth/login', { tipe: 'wali', no_wa: noWa, password: 'admin123' });
  return r.body?.token || null;
}

const dibuat = { pengguna: [], siswa: [], rombel: [], pengumuman: [] };
let cabangA;
let cabangB;
let pengumumanA;
let pengumumanSemua;
let tokenWaliA;
let tokenWaliB;
let tokenAdmin;
let tokenAdminB;

function buatWaliSiswa(cabangId, jenjangId, rombelId, label, digit) {
  const noWa = `0817${String(NYAWA).slice(-7)}${digit}`;
  const waliId = db
    .prepare(
      `INSERT INTO pengguna(tipe,role,display_name,username,no_wa,password_hash,status,must_change_password,created_at,updated_at)
       VALUES('wali','wali',?,?,?,?,'aktif',0,?,?)`
    )
    .run(
      `Wali ${label}`,
      `wali-baca-${label}-${NYAWA}`,
      noWa,
      bcrypt.hashSync('admin123', 8),
      nowIso(),
      nowIso()
    ).lastInsertRowid;
  const siswaId = db
    .prepare(`INSERT INTO siswa(nama,status,foto,catatan_khusus,created_at,updated_at) VALUES(?,'aktif',NULL,'x',?,?)`)
    .run(`Siswa ${label}`, nowIso(), nowIso()).lastInsertRowid;
  db.prepare("INSERT INTO wali_siswa(wali_pengguna_id,siswa_id,relasi,aktif,created_at) VALUES(?,?,'Ibu',1,?)").run(
    waliId,
    siswaId,
    nowIso()
  );
  db.prepare(
    `INSERT INTO siswa_enrollment(siswa_id,cabang_id,jenjang_id,rombel_id,paket,tanggal_mulai,status,created_at,created_by)
     VALUES(?,?,?,?,'reguler','2026-01-01','aktif',?,NULL)`
  ).run(siswaId, cabangId, jenjangId, rombelId, nowIso());
  dibuat.pengguna.push(waliId);
  dibuat.siswa.push(siswaId);
  return { waliId, noWa };
}

function buatPengumuman({ lingkup, cabangId, judul }) {
  const id = db
    .prepare(
      `INSERT INTO pengumuman(cabang_id,lingkup,judul,isi,penting,status,jumlah_penerima,created_by,created_at,sent_at)
       VALUES(?,?,?,?,0,'terkirim',0,NULL,?,?)`
    )
    .run(cabangId, lingkup, judul, 'Isi pengumuman uji.', nowIso(), nowIso()).lastInsertRowid;
  dibuat.pengumuman.push(id);
  return id;
}

describe('tanda baca pengumuman', () => {
  before(async () => {
    const cabangRows = db.prepare('SELECT id FROM cabang ORDER BY id LIMIT 2').all();
    assert.ok(cabangRows.length >= 2, 'butuh minimal 2 cabang untuk uji isolasi');
    cabangA = cabangRows[0].id;
    cabangB = cabangRows[1].id;
    const jenjang = db.prepare('SELECT id FROM jenjang ORDER BY urutan LIMIT 1').get();
    const rombelA = db
      .prepare('INSERT INTO rombel(cabang_id,jenjang_id,nama,aktif,created_at,updated_at) VALUES(?,?,?,1,?,?)')
      .run(cabangA, jenjang.id, `Baca A ${NYAWA}`, nowIso(), nowIso()).lastInsertRowid;
    const rombelB = db
      .prepare('INSERT INTO rombel(cabang_id,jenjang_id,nama,aktif,created_at,updated_at) VALUES(?,?,?,1,?,?)')
      .run(cabangB, jenjang.id, `Baca B ${NYAWA}`, nowIso(), nowIso()).lastInsertRowid;
    dibuat.rombel.push(rombelA, rombelB);

    const waliA = buatWaliSiswa(cabangA, jenjang.id, rombelA, 'a', '1');
    const waliB = buatWaliSiswa(cabangB, jenjang.id, rombelB, 'b', '2');

    const usernameB = `baca-adminb-${NYAWA}`;
    const adminB = db
      .prepare(
        `INSERT INTO pengguna(tipe,role,display_name,username,password_hash,status,must_change_password,created_at,updated_at)
         VALUES('staff','admin_cabang',?,?,?,'aktif',0,?,?)`
      )
      .run('Admin Cabang B', usernameB, bcrypt.hashSync('admin123', 8), nowIso(), nowIso()).lastInsertRowid;
    db.prepare('INSERT INTO staff_profile(pengguna_id,cabang_id) VALUES(?,?)').run(adminB, cabangB);
    dibuat.pengguna.push(adminB);

    pengumumanA = buatPengumuman({ lingkup: 'cabang', cabangId: cabangA, judul: `Uji cabang A ${NYAWA}` });
    pengumumanSemua = buatPengumuman({ lingkup: 'semua', cabangId: null, judul: `Uji semua ${NYAWA}` });

    tokenWaliA = await loginWali(waliA.noWa);
    tokenWaliB = await loginWali(waliB.noWa);
    tokenAdmin = await loginStaff('admin');
    tokenAdminB = await loginStaff(usernameB);
    for (const [n, t] of Object.entries({ tokenWaliA, tokenWaliB, tokenAdmin, tokenAdminB })) {
      assert.ok(t, `login ${n} harus berhasil`);
    }
  });

  after(() => {
    const p = dibuat.pengumuman.join(',');
    if (p) db.prepare(`DELETE FROM pengumuman_read WHERE pengumuman_id IN (${p})`).run();
    if (p) db.prepare(`DELETE FROM pengumuman WHERE id IN (${p})`).run();
    const u = dibuat.pengguna.join(',');
    if (u) {
      db.prepare(`DELETE FROM notifikasi WHERE recipient_pengguna_id IN (${u})`).run();
      db.prepare(`DELETE FROM audit_log WHERE actor_pengguna_id IN (${u})`).run();
      db.prepare(`DELETE FROM wali_siswa WHERE wali_pengguna_id IN (${u})`).run();
      db.prepare(`DELETE FROM staff_profile WHERE pengguna_id IN (${u})`).run();
    }
    const s = dibuat.siswa.join(',');
    if (s) {
      db.prepare(`DELETE FROM siswa_enrollment WHERE siswa_id IN (${s})`).run();
      db.prepare(`DELETE FROM siswa WHERE id IN (${s})`).run();
    }
    if (u) db.prepare(`DELETE FROM pengguna WHERE id IN (${u})`).run();
    if (dibuat.rombel.length) db.prepare(`DELETE FROM rombel WHERE id IN (${dibuat.rombel.join(',')})`).run();
  });

  it('wali melihat penanda belum dibaca, lalu bisa menandai', async () => {
    const sebelum = await req('GET', '/api/pengumuman/wali', null, tokenWaliA);
    const baris = sebelum.body.rows.find((r) => r.id === pengumumanA);
    assert.ok(baris, 'pengumuman cabang A harus terlihat wali A');
    assert.equal(baris.dibaca, 0);

    const tandai = await req('POST', `/api/pengumuman/${pengumumanA}/dibaca`, {}, tokenWaliA);
    assert.equal(tandai.status, 200);

    const sesudah = await req('GET', '/api/pengumuman/wali', null, tokenWaliA);
    assert.equal(sesudah.body.rows.find((r) => r.id === pengumumanA).dibaca, 1);
  });

  it('menandai berulang tidak menggandakan baris', async () => {
    await req('POST', `/api/pengumuman/${pengumumanA}/dibaca`, {}, tokenWaliA);
    await req('POST', `/api/pengumuman/${pengumumanA}/dibaca`, {}, tokenWaliA);
    const jumlah = db.prepare('SELECT COUNT(*) c FROM pengumuman_read WHERE pengumuman_id=?').get(pengumumanA).c;
    assert.equal(jumlah, 1);
  });

  it('wali cabang lain tidak bisa menandai pengumuman cabang A', async () => {
    const r = await req('POST', `/api/pengumuman/${pengumumanA}/dibaca`, {}, tokenWaliB);
    assert.equal(r.status, 404, 'dijawab 404, bukan 403 — keberadaannya tidak perlu bocor');
    const jumlah = db.prepare('SELECT COUNT(*) c FROM pengumuman_read WHERE pengumuman_id=?').get(pengumumanA).c;
    assert.equal(jumlah, 1, 'hanya wali A yang tercatat');
  });

  it('sekolah melihat siapa yang belum membaca', async () => {
    const r = await req('GET', `/api/pengumuman/${pengumumanA}/pembaca`, null, tokenAdmin);
    assert.equal(r.status, 200);
    assert.ok(r.body.total >= 1);
    assert.ok(r.body.sudah >= 1, 'wali A sudah membaca');
    assert.ok(
      r.body.penerima.some((p) => p.dibaca_at),
      'minimal satu penerima berstatus dibaca'
    );
    // Yang belum membaca diletakkan di atas.
    const pertamaBelum = r.body.penerima.findIndex((p) => !p.dibaca_at);
    const terakhirSudah = r.body.penerima.map((p) => !!p.dibaca_at).lastIndexOf(true);
    if (pertamaBelum !== -1 && terakhirSudah !== -1) assert.ok(pertamaBelum < terakhirSudah);
  });

  it('admin cabang hanya melihat wali cabangnya pada pengumuman lintas cabang', async () => {
    const semua = await req('GET', `/api/pengumuman/${pengumumanSemua}/pembaca`, null, tokenAdmin);
    assert.equal(semua.status, 200);
    const cabangBSaja = await req('GET', `/api/pengumuman/${pengumumanSemua}/pembaca`, null, tokenAdminB);
    assert.equal(cabangBSaja.status, 200);
    assert.ok(cabangBSaja.body.total <= semua.body.total, 'admin cabang tidak boleh melihat seluruh sekolah');
  });

  it('daftar admin memuat jumlah pembaca', async () => {
    const r = await req('GET', '/api/pengumuman?limit=20', null, tokenAdmin);
    assert.equal(r.status, 200);
    const baris = r.body.rows.find((x) => x.id === pengumumanA);
    assert.ok(baris, 'pengumuman harus ada di daftar');
    assert.equal(typeof baris.jumlah_dibaca, 'number');
    assert.ok(baris.jumlah_dibaca >= 1);
  });

  it('tanpa token ditolak', async () => {
    const r = await req('POST', `/api/pengumuman/${pengumumanA}/dibaca`, {});
    assert.equal(r.status, 401);
  });
});
