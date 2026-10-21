// Tes pengumuman sekolah: satu pesan untuk semua orang tua di satu cabang.
//
// Yang dijaga:
//   - hanya admin/admin_cabang/kepsek yang boleh mengirim; guru tidak
//   - validasi judul & isi
//   - pratinjau jumlah penerima dihitung server, bukan diperkirakan klien
//   - penerima TERBATAS pada cabang tujuan (kebocoran ke cabang lain = orang
//     tua menerima informasi yang bukan untuknya)
//   - pengumuman tanpa penerima ditolak, bukan "terkirim" palsu
//   - portal wali hanya menampilkan pengumuman cabang anaknya + yang global
const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const db = require('../backend/db');
const bcrypt = require('../backend/node_modules/bcryptjs');

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

function buatCabangKelas(cabangId) {
  const jenjang = db.prepare('SELECT id FROM jenjang ORDER BY urutan LIMIT 1').get();
  const rombel = db.prepare('SELECT id FROM rombel WHERE cabang_id=? ORDER BY id LIMIT 1').get(cabangId);
  return { jenjang, rombel };
}

function buatWali(nama, noWa, cabangId) {
  const waliId = db
    .prepare(
      `INSERT INTO pengguna(tipe,role,display_name,username,no_wa,password_hash,status,must_change_password,created_at,updated_at)
       VALUES('wali','wali',?,?,?,?,'aktif',0,?,?)`
    )
    .run(
      `Wali ${nama}`,
      `wali-peng-${nama}-${NYAWA}`,
      noWa,
      bcrypt.hashSync('admin123', 8),
      nowIso(),
      nowIso()
    ).lastInsertRowid;
  const { jenjang, rombel } = buatCabangKelas(cabangId);
  const siswaId = db
    .prepare(
      `INSERT INTO siswa(nama,status,foto,catatan_khusus,created_at,updated_at)
       VALUES(?,'aktif',NULL,'fixture pengumuman',?,?)`
    )
    .run(`Anak ${nama}`, nowIso(), nowIso()).lastInsertRowid;
  db.prepare("INSERT INTO wali_siswa(wali_pengguna_id,siswa_id,relasi,aktif,created_at) VALUES(?,?,'Ibu',1,?)").run(
    waliId,
    siswaId,
    nowIso()
  );
  db.prepare(
    `INSERT INTO siswa_enrollment(siswa_id,cabang_id,jenjang_id,rombel_id,paket,tanggal_mulai,status,created_at,created_by)
     VALUES(?,?,?,?,'reguler','2026-01-01','aktif',?,NULL)`
  ).run(siswaId, cabangId, jenjang.id, rombel.id, nowIso());
  return { waliId, siswaId, noWa };
}

function buatStaff(role, username, cabangId) {
  const id = db
    .prepare(
      `INSERT INTO pengguna(tipe,role,display_name,username,password_hash,status,must_change_password,created_at,updated_at)
       VALUES('staff',?,?,?,?,'aktif',0,?,?)`
    )
    .run(role, `Staf ${username}`, username, bcrypt.hashSync('admin123', 8), nowIso(), nowIso()).lastInsertRowid;
  db.prepare('INSERT INTO staff_profile(pengguna_id,cabang_id,no_wa_kontak) VALUES(?,?,?)').run(
    id,
    cabangId,
    `0813${String(NYAWA).slice(-7)}`
  );
  return id;
}

describe('pengumuman sekolah', () => {
  let cabangA;
  let cabangB;
  let cabangKosong;
  let tokenAdmin;
  let tokenGuru;
  let tokenKepsek;
  let tokenWaliA;
  let tokenWaliB;

  before(async () => {
    const semua = db.prepare('SELECT id FROM cabang ORDER BY id').all();
    cabangA = semua[0].id;
    cabangB = semua[1].id;
    cabangKosong = semua[2].id; // sengaja tidak diberi wali

    const waliA = buatWali(`a${NYAWA}`, `0812${String(NYAWA).slice(-7)}1`, cabangA);
    const waliB = buatWali(`b${NYAWA}`, `0812${String(NYAWA).slice(-7)}2`, cabangB);
    buatStaff('guru', `guru-peng-${NYAWA}`, cabangA);
    buatStaff('kepsek', `kepsek-peng-${NYAWA}`, cabangA);

    tokenAdmin = (await req('POST', '/api/auth/login', { username: 'admin', password: 'admin123' })).body?.token;
    tokenGuru = (await req('POST', '/api/auth/login', { username: `guru-peng-${NYAWA}`, password: 'admin123' })).body
      ?.token;
    tokenKepsek = (await req('POST', '/api/auth/login', { username: `kepsek-peng-${NYAWA}`, password: 'admin123' }))
      .body?.token;
    tokenWaliA = (await req('POST', '/api/auth/login', { tipe: 'wali', no_wa: waliA.noWa, password: 'admin123' })).body
      ?.token;
    tokenWaliB = (await req('POST', '/api/auth/login', { tipe: 'wali', no_wa: waliB.noWa, password: 'admin123' })).body
      ?.token;

    assert.ok(tokenAdmin && tokenGuru && tokenKepsek && tokenWaliA && tokenWaliB, 'login fixture harus berhasil');
  });

  it('guru tidak boleh mengirim pengumuman', async () => {
    const r = await req(
      'POST',
      '/api/pengumuman',
      { judul: 'Uji guru', isi: 'Isi yang cukup panjang', cabang_id: cabangA },
      tokenGuru
    );
    assert.equal(r.status, 403);
  });

  it('validasi judul dan isi', async () => {
    const dasar = { judul: 'Judul benar', isi: 'Isi pengumuman yang cukup panjang', cabang_id: cabangA };
    assert.equal((await req('POST', '/api/pengumuman', { ...dasar, judul: 'a' }, tokenAdmin)).status, 400);
    assert.equal((await req('POST', '/api/pengumuman', { ...dasar, isi: 'pendek' }, tokenAdmin)).status, 400);
    assert.equal((await req('POST', '/api/pengumuman', { ...dasar, judul: 'x'.repeat(121) }, tokenAdmin)).status, 400);
  });

  it('pratinjau menghitung penerima di cabang tujuan', async () => {
    const r = await req('GET', `/api/pengumuman/preview?cabang_id=${cabangA}`, null, tokenAdmin);
    assert.equal(r.status, 200);
    assert.ok(r.body.jumlah >= 1, 'harus ada minimal satu wali di cabang A');

    const kosong = await req('GET', `/api/pengumuman/preview?cabang_id=${cabangKosong}`, null, tokenAdmin);
    assert.equal(kosong.status, 200);
    assert.equal(kosong.body.jumlah, 0);
  });

  it('kepsek tidak boleh mengirim ke cabang lain', async () => {
    const r = await req(
      'POST',
      '/api/pengumuman',
      { judul: 'Lintas cabang', isi: 'Isi yang cukup panjang', cabang_id: cabangB },
      tokenKepsek
    );
    assert.equal(r.status, 403);
  });

  it('pengumuman tanpa penerima ditolak, bukan "terkirim" palsu', async () => {
    const r = await req(
      'POST',
      '/api/pengumuman',
      { judul: 'Kelas kosong', isi: 'Isi yang cukup panjang', cabang_id: cabangKosong },
      tokenAdmin
    );
    assert.equal(r.status, 400);
    assert.match(r.body.error, /tidak ada orang tua/i);
  });

  it('kirim ke satu cabang hanya menjangkau orang tua cabang itu', async () => {
    const r = await req(
      'POST',
      '/api/pengumuman',
      { judul: `Perubahan jam ${NYAWA}`, isi: 'Mulai Senin jam pulang menjadi 12.00 WIB.', cabang_id: cabangA },
      tokenAdmin
    );
    assert.equal(r.status, 201);
    assert.ok(r.body.penerima >= 1);

    const notif = db
      .prepare("SELECT COUNT(*) c FROM notifikasi WHERE tipe='pengumuman' AND entity_id=?")
      .get(r.body.id).c;
    assert.equal(notif, r.body.penerima, 'satu notifikasi per penerima');

    // Wali A melihat, wali B tidak.
    const lihatA = await req('GET', '/api/pengumuman/wali', null, tokenWaliA);
    assert.ok(lihatA.body.rows.some((x) => x.id === r.body.id));
    const lihatB = await req('GET', '/api/pengumuman/wali', null, tokenWaliB);
    assert.ok(!lihatB.body.rows.some((x) => x.id === r.body.id), 'cabang lain tidak boleh menerima');
  });

  it('lingkup "semua" menjangkau kedua cabang', async () => {
    const r = await req(
      'POST',
      '/api/pengumuman',
      { judul: `Libur bersama ${NYAWA}`, isi: 'Sekolah libur tanggal 25 Desember.', lingkup: 'semua' },
      tokenAdmin
    );
    assert.equal(r.status, 201);

    const a = await req('GET', '/api/pengumuman/wali', null, tokenWaliA);
    const b = await req('GET', '/api/pengumuman/wali', null, tokenWaliB);
    assert.ok(a.body.rows.some((x) => x.id === r.body.id));
    assert.ok(b.body.rows.some((x) => x.id === r.body.id));
  });

  it('hanya admin pusat yang boleh memakai lingkup semua', async () => {
    const r = await req(
      'POST',
      '/api/pengumuman',
      { judul: 'Semua oleh kepsek', isi: 'Isi yang cukup panjang', lingkup: 'semua' },
      tokenKepsek
    );
    assert.equal(r.status, 403);
  });

  it('riwayat pengumuman hanya memuat cabang sendiri (kecuali lingkup semua)', async () => {
    const r = await req('GET', '/api/pengumuman?limit=50', null, tokenKepsek);
    assert.equal(r.status, 200);
    assert.ok(r.body.rows.length >= 1);
    for (const row of r.body.rows) {
      assert.ok(row.lingkup === 'semua' || Number(row.cabang_id) === Number(cabangA), 'tidak boleh bocor antar cabang');
    }
  });
});
