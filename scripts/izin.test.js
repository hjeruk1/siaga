// Tes izin/sakit online: pengajuan wali -> keputusan sekolah -> absensi.
//
// Fixture dibuat sendiri karena server uji memakai database segar. Yang dijaga:
//   - hanya wali pemilik anak yang boleh mengajukan/membatalkan
//   - validasi tanggal, jenis, alasan, dan batas 30 hari
//   - rentang bertumpuk ditolak (kalau tidak, status absensi saling menimpa)
//   - persetujuan HANYA mengubah hari sekolah dan TIDAK menimpa kehadiran nyata
//   - penolakan wajib beralasan, dan tidak menyentuh absensi
//   - guru yang tidak mengampu rombel tidak bisa memutuskan
const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const db = require('../backend/db');
const bcrypt = require('../backend/node_modules/bcryptjs');

const BASE = process.env.TEST_URL || 'http://127.0.0.1:3999';
const NYAWA = Date.now();

// Senin & Selasa di masa depan yang pasti hari sekolah (bukan Sabtu/Minggu).
const SENIN = '2026-11-02';
const SELASA = '2026-11-03';
const RABU = '2026-11-04';

function req(method, p, body, token) {
  return fetch(`${BASE}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
}

const nowIso = () => new Date().toISOString();

function refKelas() {
  const cabang = db.prepare('SELECT id FROM cabang ORDER BY id LIMIT 1').get();
  const jenjang = db.prepare('SELECT id FROM jenjang ORDER BY urutan LIMIT 1').get();
  const rombel = db.prepare('SELECT id FROM rombel WHERE cabang_id=? ORDER BY id LIMIT 1').get(cabang.id);
  return { cabang, jenjang, rombel };
}

function buatWali(nama, noWa) {
  return db
    .prepare(
      `INSERT INTO pengguna(tipe,role,display_name,username,no_wa,password_hash,status,must_change_password,created_at,updated_at)
       VALUES('wali','wali',?,?,?,?,'aktif',0,?,?)`
    )
    .run(`Wali ${nama}`, `wali-${nama}-${NYAWA}`, noWa, bcrypt.hashSync('admin123', 8), nowIso(), nowIso())
    .lastInsertRowid;
}

function buatSiswa(nama, waliId) {
  const { cabang, jenjang, rombel } = refKelas();
  const siswaId = db
    .prepare(
      `INSERT INTO siswa(nama,status,foto,catatan_khusus,created_at,updated_at)
       VALUES(?,'aktif',NULL,'fixture izin',?,?)`
    )
    .run(nama, nowIso(), nowIso()).lastInsertRowid;
  db.prepare("INSERT INTO wali_siswa(wali_pengguna_id,siswa_id,relasi,aktif,created_at) VALUES(?,?,'Ayah',1,?)").run(
    waliId,
    siswaId,
    nowIso()
  );
  db.prepare(
    `INSERT INTO siswa_enrollment(siswa_id,cabang_id,jenjang_id,rombel_id,paket,tanggal_mulai,status,created_at,created_by)
     VALUES(?,?,?,?,'reguler','2026-01-01','aktif',?,NULL)`
  ).run(siswaId, cabang.id, jenjang.id, rombel.id, nowIso());
  return { siswaId, cabangId: cabang.id, rombelId: rombel.id };
}

function buatGuru(nama, denganRombel) {
  const { cabang, rombel } = refKelas();
  const username = `guru-${nama}-${NYAWA}`;
  const id = db
    .prepare(
      `INSERT INTO pengguna(tipe,role,display_name,username,password_hash,status,must_change_password,created_at,updated_at)
       VALUES('staff','guru',?,?,?,'aktif',0,?,?)`
    )
    .run(`Guru ${nama}`, username, bcrypt.hashSync('admin123', 8), nowIso(), nowIso()).lastInsertRowid;
  db.prepare('INSERT INTO staff_profile(pengguna_id,cabang_id,no_wa_kontak) VALUES(?,?,?)').run(
    id,
    cabang.id,
    `0813${String(NYAWA).slice(-7)}`
  );
  if (denganRombel) {
    db.prepare('INSERT INTO guru_rombel(pengguna_id,rombel_id,created_at) VALUES(?,?,?)').run(id, rombel.id, nowIso());
  }
  return { id, username };
}

describe('izin/sakit online', () => {
  let tokenWaliA;
  let tokenWaliB;
  let tokenGuru;
  let tokenGuruLain;
  let tokenAdmin;
  let siswaA;
  let siswaB;

  before(async () => {
    const waliA = buatWali(`a${NYAWA}`, `0812${String(NYAWA).slice(-7)}1`);
    const waliB = buatWali(`b${NYAWA}`, `0812${String(NYAWA).slice(-7)}2`);
    siswaA = buatSiswa(`Anak A ${NYAWA}`, waliA);
    siswaB = buatSiswa(`Anak B ${NYAWA}`, waliB);
    const guru = buatGuru(`utama${NYAWA}`, true);
    const guruLain = buatGuru(`lain${NYAWA}`, false);

    tokenWaliA = (
      await req('POST', '/api/auth/login', {
        tipe: 'wali',
        no_wa: `0812${String(NYAWA).slice(-7)}1`,
        password: 'admin123'
      })
    ).body?.token;
    tokenWaliB = (
      await req('POST', '/api/auth/login', {
        tipe: 'wali',
        no_wa: `0812${String(NYAWA).slice(-7)}2`,
        password: 'admin123'
      })
    ).body?.token;
    tokenGuru = (await req('POST', '/api/auth/login', { username: guru.username, password: 'admin123' })).body?.token;
    tokenGuruLain = (await req('POST', '/api/auth/login', { username: guruLain.username, password: 'admin123' })).body
      ?.token;
    tokenAdmin = (await req('POST', '/api/auth/login', { username: 'admin', password: 'admin123' })).body?.token;

    assert.ok(
      tokenWaliA && tokenWaliB && tokenGuru && tokenGuruLain && tokenAdmin,
      'semua login fixture harus berhasil'
    );
    assert.ok(guru.id && guruLain.id);
  });

  it('wali lain tidak boleh mengajukan untuk anak orang', async () => {
    const r = await req(
      'POST',
      '/api/izin',
      {
        siswa_id: siswaA.siswaId,
        jenis: 'izin',
        tanggal_mulai: SENIN,
        tanggal_selesai: SELASA,
        alasan: 'Acara keluarga'
      },
      tokenWaliB
    );
    assert.equal(r.status, 403);
  });

  it('validasi tanggal, jenis, dan alasan', async () => {
    const dasar = {
      siswa_id: siswaA.siswaId,
      jenis: 'izin',
      tanggal_mulai: SENIN,
      tanggal_selesai: SELASA,
      alasan: 'Acara keluarga'
    };
    assert.equal((await req('POST', '/api/izin', { ...dasar, alasan: 'x' }, tokenWaliA)).status, 400);
    assert.equal(
      (await req('POST', '/api/izin', { ...dasar, tanggal_mulai: SELASA, tanggal_selesai: SENIN }, tokenWaliA)).status,
      400
    );
    assert.equal((await req('POST', '/api/izin', { ...dasar, jenis: 'libur' }, tokenWaliA)).status, 400);
    assert.equal((await req('POST', '/api/izin', { ...dasar, tanggal_mulai: '2026-11-31' }, tokenWaliA)).status, 400);
    // 60 hari > batas 30 hari
    assert.equal((await req('POST', '/api/izin', { ...dasar, tanggal_selesai: '2027-01-05' }, tokenWaliA)).status, 400);
  });

  it('pengajuan sah tersimpan dan guru pengampu menerima notifikasi', async () => {
    const r = await req(
      'POST',
      '/api/izin',
      {
        siswa_id: siswaA.siswaId,
        jenis: 'sakit',
        tanggal_mulai: SENIN,
        tanggal_selesai: SELASA,
        alasan: 'Demam tinggi'
      },
      tokenWaliA
    );
    assert.equal(r.status, 201);
    assert.equal(r.body.status, 'menunggu');

    const row = db.prepare('SELECT * FROM izin_request WHERE id=?').get(r.body.id);
    assert.equal(row.status, 'menunggu');
    assert.equal(row.jenis, 'sakit');
    assert.equal(row.cabang_id, siswaA.cabangId);

    const notif = db
      .prepare("SELECT COUNT(*) c FROM notifikasi WHERE tipe='izin_baru' AND entity_id=?")
      .get(r.body.id).c;
    assert.ok(notif >= 1, 'guru/kepsek harus menerima notifikasi pengajuan');
  });

  it('rentang bertumpuk ditolak', async () => {
    const r = await req(
      'POST',
      '/api/izin',
      {
        siswa_id: siswaA.siswaId,
        jenis: 'izin',
        tanggal_mulai: SELASA,
        tanggal_selesai: RABU,
        alasan: 'Acara keluarga'
      },
      tokenWaliA
    );
    assert.equal(r.status, 400);
    assert.match(r.body.error, /sudah ada izin/i);
  });

  it('persetujuan hanya mengisi hari sekolah dan tidak menimpa kehadiran', async () => {
    // Hari pertama dibuat "Hadir" lebih dulu: kehadiran nyata harus menang.
    db.prepare(
      `INSERT INTO absensi(siswa_id,cabang_id,jenjang_id,rombel_id,paket,tanggal,status,created_at,updated_at)
       VALUES(?,?,?,?,?,'2026-11-02','Hadir',?,?)`
    ).run(siswaA.siswaId, siswaA.cabangId, refKelas().jenjang.id, siswaA.rombelId, 'reguler', nowIso(), nowIso());

    const izin = db
      .prepare("SELECT id FROM izin_request WHERE siswa_id=? AND status='menunggu' ORDER BY id DESC LIMIT 1")
      .get(siswaA.siswaId);

    const r = await req('POST', `/api/izin/${izin.id}/setujui`, { catatan: 'Lekas sembuh' }, tokenGuru);
    assert.equal(r.status, 200);
    assert.equal(r.body.sudahHadir, 1, 'hari yang sudah Hadir tidak boleh ditimpa');
    assert.equal(r.body.diterapkan, 1, 'hanya hari sekolah yang belum terisi');

    const senin = db.prepare('SELECT status FROM absensi WHERE siswa_id=? AND tanggal=?').get(siswaA.siswaId, SENIN);
    const selasa = db.prepare('SELECT status FROM absensi WHERE siswa_id=? AND tanggal=?').get(siswaA.siswaId, SELASA);
    assert.equal(senin.status, 'Hadir');
    assert.equal(selasa.status, 'Sakit');

    assert.equal(db.prepare('SELECT status FROM izin_request WHERE id=?').get(izin.id).status, 'disetujui');
    // keputusan kedua ditolak
    assert.equal((await req('POST', `/api/izin/${izin.id}/setujui`, {}, tokenGuru)).status, 400);
  });

  it('penolakan wajib beralasan dan tidak menyentuh absensi', async () => {
    const buat = await req(
      'POST',
      '/api/izin',
      {
        siswa_id: siswaA.siswaId,
        jenis: 'izin',
        tanggal_mulai: '2026-11-09',
        tanggal_selesai: '2026-11-10',
        alasan: 'Pulang kampung'
      },
      tokenWaliA
    );
    assert.equal(buat.status, 201);

    assert.equal((await req('POST', `/api/izin/${buat.body.id}/tolak`, {}, tokenAdmin)).status, 400);
    const tolak = await req('POST', `/api/izin/${buat.body.id}/tolak`, { alasan: 'Bertepatan penilaian' }, tokenAdmin);
    assert.equal(tolak.status, 200);
    assert.equal(db.prepare('SELECT status FROM izin_request WHERE id=?').get(buat.body.id).status, 'ditolak');
    assert.equal(
      db.prepare('SELECT COUNT(*) c FROM absensi WHERE siswa_id=? AND tanggal=?').get(siswaA.siswaId, '2026-11-09').c,
      0
    );
  });

  it('guru yang tidak mengampu rombel tidak bisa memutuskan', async () => {
    const buat = await req(
      'POST',
      '/api/izin',
      {
        siswa_id: siswaA.siswaId,
        jenis: 'izin',
        tanggal_mulai: '2026-11-16',
        tanggal_selesai: '2026-11-16',
        alasan: 'Acara keluarga'
      },
      tokenWaliA
    );
    assert.equal(buat.status, 201);
    const r = await req('POST', `/api/izin/${buat.body.id}/setujui`, {}, tokenGuruLain);
    assert.equal(r.status, 403);
  });

  it('wali hanya bisa membatalkan pengajuannya sendiri', async () => {
    const buat = await req(
      'POST',
      '/api/izin',
      {
        siswa_id: siswaA.siswaId,
        jenis: 'izin',
        tanggal_mulai: '2026-11-23',
        tanggal_selesai: '2026-11-23',
        alasan: 'Acara keluarga'
      },
      tokenWaliA
    );
    assert.equal(buat.status, 201);
    assert.equal((await req('POST', `/api/izin/${buat.body.id}/batal`, {}, tokenWaliB)).status, 403);
    assert.equal((await req('POST', `/api/izin/${buat.body.id}/batal`, {}, tokenWaliA)).status, 200);
    assert.equal(db.prepare('SELECT status FROM izin_request WHERE id=?').get(buat.body.id).status, 'dibatalkan');
  });

  it('daftar sekolah dibatasi peran, daftar wali hanya anaknya', async () => {
    const sekolah = await req('GET', '/api/izin?status=disetujui', null, tokenAdmin);
    assert.equal(sekolah.status, 200);
    assert.ok(sekolah.body.rows.some((r) => r.siswa_id === siswaA.siswaId));

    const waliA = await req('GET', `/api/izin/wali/${siswaA.siswaId}`, null, tokenWaliA);
    assert.equal(waliA.status, 200);
    assert.ok(waliA.body.rows.length >= 3);

    // wali B tidak boleh membaca riwayat anak A
    assert.equal((await req('GET', `/api/izin/wali/${siswaA.siswaId}`, null, tokenWaliB)).status, 403);
    // siswa B belum punya izin
    const waliB = await req('GET', `/api/izin/wali/${siswaB.siswaId}`, null, tokenWaliB);
    assert.equal(waliB.body.rows.length, 0);
  });
});
