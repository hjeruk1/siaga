// Tes regresi: guru yang ditugaskan ke rombel di cabang LAIN harus bisa
// menyimpan daily record.
//
// Bug yang dijaga: canAccessSiswa mengizinkan guru membuka siswa berdasarkan
// penugasan rombel (lintas cabang), tetapi requireActiveCabang menolak karena
// cabang profil guru berbeda. Akibatnya guru bisa membuka editor, mengisi
// formulir, lalu DITOLAK setiap kali menyimpan — data yang diketik hilang.
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

describe('guru lintas cabang', () => {
  let token;
  let siswaId;
  let cabangA;
  let cabangB;

  before(async () => {
    const cabangs = db.prepare('SELECT id FROM cabang ORDER BY id LIMIT 2').all();
    cabangA = cabangs[0].id;
    cabangB = cabangs[1].id;
    const jenjang = db.prepare('SELECT id FROM jenjang ORDER BY urutan LIMIT 1').get();
    const rombelA = db.prepare('SELECT id FROM rombel WHERE cabang_id=? ORDER BY id LIMIT 1').get(cabangA);

    // Guru berprofil di cabang B, tetapi ditugaskan mengajar rombel di cabang A.
    const username = `guru-lintas-${NYAWA}`;
    const guruId = db
      .prepare(
        `INSERT INTO pengguna(tipe,role,display_name,username,password_hash,status,must_change_password,created_at,updated_at)
         VALUES('staff','guru',?,?,?,'aktif',0,?,?)`
      )
      .run(`Guru Lintas ${NYAWA}`, username, bcrypt.hashSync('admin123', 8), nowIso(), nowIso()).lastInsertRowid;
    db.prepare('INSERT INTO staff_profile(pengguna_id,cabang_id) VALUES(?,?)').run(guruId, cabangB);
    // guru_rombel.created_at wajib (NOT NULL) — lupa kolom ini membuat hook gagal.
    db.prepare('INSERT INTO guru_rombel(pengguna_id,rombel_id,created_at) VALUES(?,?,?)').run(
      guruId,
      rombelA.id,
      nowIso()
    );

    const s = db
      .prepare(
        `INSERT INTO siswa(nama,status,foto,catatan_khusus,created_at,updated_at) VALUES(?,'aktif',NULL,'fixture',?,?)`
      )
      .run(`Siswa Lintas ${NYAWA}`, nowIso(), nowIso());
    siswaId = s.lastInsertRowid;
    db.prepare(
      `INSERT INTO siswa_enrollment(siswa_id,cabang_id,jenjang_id,rombel_id,paket,tanggal_mulai,status,created_at,created_by)
       VALUES(?,?,?,?,'reguler','2026-01-01','aktif',?,NULL)`
    ).run(siswaId, cabangA, jenjang.id, rombelA.id, nowIso());

    const login = await req('POST', '/api/auth/login', { username, password: 'admin123' });
    token = login.body?.token;
  });

  it('guru terlihat di daftar siswa rombel yang dia ampu (lintas cabang)', async () => {
    const r = await req('GET', '/api/daily-record/today?tanggal=2026-10-15', null, token);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const rows = r.body.rows || r.body || [];
    assert.ok(
      rows.some((x) => Number(x.siswa_id) === Number(siswaId)),
      'siswa rombel yang diampu harus muncul di daftar guru'
    );
  });

  it('menyimpan daily record untuk siswa lintas cabang TIDAK ditolak', async () => {
    const r = await req(
      'POST',
      '/api/daily-record',
      { siswa_id: siswaId, tanggal: '2026-10-15', mood: 'ceria', makan: 'habis', tidur: true, aktivitas: [] },
      token
    );
    assert.equal(r.status, 200, `seharusnya boleh menyimpan, dapat: ${JSON.stringify(r.body)}`);
    assert.ok(r.body.id, 'record harus tersimpan dan mengembalikan id');
  });

  it('guru tetap ditolak untuk cabang yang tidak dia ampu', async () => {
    // Siswa di cabang B, rombel yang TIDAK diampu guru ini.
    const jenjang = db.prepare('SELECT id FROM jenjang ORDER BY urutan LIMIT 1').get();
    const rombelLain = db.prepare('SELECT id FROM rombel WHERE cabang_id=? ORDER BY id DESC LIMIT 1').get(cabangB);
    const s2 = db
      .prepare(
        `INSERT INTO siswa(nama,status,foto,catatan_khusus,created_at,updated_at) VALUES(?,'aktif',NULL,'fixture',?,?)`
      )
      .run(`Siswa Lain ${NYAWA}`, nowIso(), nowIso()).lastInsertRowid;
    db.prepare(
      `INSERT INTO siswa_enrollment(siswa_id,cabang_id,jenjang_id,rombel_id,paket,tanggal_mulai,status,created_at,created_by)
       VALUES(?,?,?,?,'reguler','2026-01-01','aktif',?,NULL)`
    ).run(s2, cabangB, jenjang.id, rombelLain.id, nowIso());
    const r = await req(
      'POST',
      '/api/daily-record',
      { siswa_id: s2, tanggal: '2026-10-15', mood: 'ceria', aktivitas: [] },
      token
    );
    assert.ok([403, 404].includes(r.status), `harus ditolak, dapat ${r.status}`);
  });
});
