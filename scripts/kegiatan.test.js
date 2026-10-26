// Tes galeri foto kegiatan.
//
// Yang dijaga (ini foto anak-anak, jadi batas aksesnya yang paling penting):
//   - guru hanya bisa mengunggah ke rombel yang diampu
//   - wali hanya melihat kelas anaknya, bukan kelas lain
//   - berkasnya sendiri tidak bisa diambil lewat URL langsung oleh yang
//     tidak berhak (daftar tertutup tidak berguna kalau gambarnya terbuka)
//   - validasi: judul, tanggal masa depan, tanpa berkas
//   - unggahan benar-benar dikompresi + dibuat thumbnail
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const db = require('../backend/db');
const bcrypt = require('../backend/node_modules/bcryptjs');
const sharp = require('../backend/node_modules/sharp');

process.env.JWT_SECRET ||= 'siaga-test-secret-change-me';

const BASE = process.env.TEST_URL || 'http://127.0.0.1:3999';
const NYAWA = Date.now();
const nowIso = () => new Date().toISOString();
const UPLOAD_DIR = path.resolve(__dirname, '../backend/uploads/kegiatan');

function req(method, p, body, token) {
  return fetch(`${BASE}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
}

async function login(username, password) {
  const r = await req('POST', '/api/auth/login', { tipe: 'staff', username, password });
  return r.body?.token || null;
}

// Wali login dengan nomor WhatsApp, bukan username — jalur yang berbeda di
// routes/auth.js, jadi helper-nya juga harus berbeda.
async function loginWali(noWa) {
  const r = await req('POST', '/api/auth/login', { tipe: 'wali', no_wa: noWa, password: 'admin123' });
  return r.body?.token || null;
}

function refMaster() {
  const cabang = db.prepare('SELECT id FROM cabang ORDER BY id LIMIT 1').get();
  const cabangLain = db.prepare('SELECT id FROM cabang WHERE id<>? ORDER BY id LIMIT 1').get(cabang.id);
  const jenjang = db.prepare('SELECT id FROM jenjang ORDER BY urutan LIMIT 1').get();
  return { cabang, cabangLain, jenjang };
}

function buatRombel(cabangId, jenjangId, nama) {
  return db
    .prepare('INSERT INTO rombel(cabang_id,jenjang_id,nama,aktif,created_at,updated_at) VALUES(?,?,?,1,?,?)')
    .run(cabangId, jenjangId, nama, nowIso(), nowIso()).lastInsertRowid;
}

function buatStaff(role, cabangId, nama) {
  const username = `foto-${role}-${nama}-${NYAWA}`;
  const id = db
    .prepare(
      `INSERT INTO pengguna(tipe,role,display_name,username,password_hash,status,must_change_password,created_at,updated_at)
       VALUES('staff',?,?,?,?,'aktif',0,?,?)`
    )
    .run(role, `Uji ${role} ${nama}`, username, bcrypt.hashSync('admin123', 8), nowIso(), nowIso()).lastInsertRowid;
  db.prepare('INSERT INTO staff_profile(pengguna_id,cabang_id) VALUES(?,?)').run(id, cabangId);
  return { id, username };
}

function buatWaliSiswa(rombelId, cabangId, jenjangId, nama, digit) {
  const noWa = `0813${String(NYAWA).slice(-7)}${digit}`;
  const waliId = db
    .prepare(
      `INSERT INTO pengguna(tipe,role,display_name,username,no_wa,password_hash,status,must_change_password,created_at,updated_at)
       VALUES('wali','wali',?,?,?,?,'aktif',0,?,?)`
    )
    .run(
      `Wali ${nama}`,
      `wali-foto-${nama}-${NYAWA}`,
      noWa,
      bcrypt.hashSync('admin123', 8),
      nowIso(),
      nowIso()
    ).lastInsertRowid;
  const siswaId = db
    .prepare(`INSERT INTO siswa(nama,status,foto,catatan_khusus,created_at,updated_at) VALUES(?,'aktif',NULL,'x',?,?)`)
    .run(`Siswa ${nama}`, nowIso(), nowIso()).lastInsertRowid;
  db.prepare("INSERT INTO wali_siswa(wali_pengguna_id,siswa_id,relasi,aktif,created_at) VALUES(?,?,'Ibu',1,?)").run(
    waliId,
    siswaId,
    nowIso()
  );
  db.prepare(
    `INSERT INTO siswa_enrollment(siswa_id,cabang_id,jenjang_id,rombel_id,paket,tanggal_mulai,status,created_at,created_by)
     VALUES(?,?,?,?,'reguler','2026-01-01','aktif',?,NULL)`
  ).run(siswaId, cabangId, jenjangId, rombelId, nowIso());
  return { waliId, siswaId, noWa: `0813${String(NYAWA).slice(-7)}${digit}` };
}

async function fotoUji(w = 1600, h = 1200) {
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: 210, g: 130, b: 90 } } })
    .jpeg({ quality: 95 })
    .toBuffer();
}

async function unggah(token, { rombelId, tanggal, judul, buffer }) {
  const fd = new FormData();
  fd.append('rombel_id', String(rombelId));
  fd.append('tanggal', tanggal);
  fd.append('judul', judul);
  if (buffer) fd.append('foto', new Blob([buffer], { type: 'image/jpeg' }), 'foto.jpg');
  const r = await fetch(`${BASE}/api/kegiatan`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

const dibuat = { pengguna: [], rombel: [], siswa: [], foto: [] };
let rombelA;
let rombelB;
let rombelCabangLain;
let tokenGuruA;
let tokenGuruB;
let tokenWaliA;
let tokenWaliB;
let tokenAdminCabangLain;
let tokenAdmin;
let tokenKepsek;

before(async () => {
  const { cabang, cabangLain, jenjang } = refMaster();
  rombelA = buatRombel(cabang.id, jenjang.id, `Foto A ${NYAWA}`);
  rombelB = buatRombel(cabang.id, jenjang.id, `Foto B ${NYAWA}`);
  rombelCabangLain = buatRombel(cabangLain.id, jenjang.id, `Foto C ${NYAWA}`);
  dibuat.rombel.push(rombelA, rombelB, rombelCabangLain);

  const guruA = buatStaff('guru', cabang.id, 'a');
  const guruB = buatStaff('guru', cabang.id, 'b');
  const adminCabangLain = buatStaff('admin_cabang', cabangLain.id, 'lain');
  const kepsek = buatStaff('kepsek', cabang.id, 'kepsek');
  dibuat.pengguna.push(guruA.id, guruB.id, adminCabangLain.id, kepsek.id);
  db.prepare('INSERT INTO guru_rombel(pengguna_id,rombel_id,created_at) VALUES(?,?,?)').run(
    guruA.id,
    rombelA,
    nowIso()
  );
  db.prepare('INSERT INTO guru_rombel(pengguna_id,rombel_id,created_at) VALUES(?,?,?)').run(
    guruB.id,
    rombelB,
    nowIso()
  );

  const waliA = buatWaliSiswa(rombelA, cabang.id, jenjang.id, 'a', '1');
  const waliB = buatWaliSiswa(rombelB, cabang.id, jenjang.id, 'b', '2');
  dibuat.pengguna.push(waliA.waliId, waliB.waliId);
  dibuat.siswa.push(waliA.siswaId, waliB.siswaId);

  tokenGuruA = await login(guruA.username, 'admin123');
  tokenGuruB = await login(guruB.username, 'admin123');
  tokenWaliA = await loginWali(waliA.noWa);
  tokenWaliB = await loginWali(waliB.noWa);
  tokenAdminCabangLain = await login(adminCabangLain.username, 'admin123');
  tokenKepsek = await login(kepsek.username, 'admin123');
  tokenAdmin = await login('admin', 'admin123');
  for (const [nama, t] of Object.entries({
    tokenGuruA,
    tokenGuruB,
    tokenWaliA,
    tokenWaliB,
    tokenAdminCabangLain,
    tokenKepsek,
    tokenAdmin
  })) {
    assert.ok(t, `login ${nama} harus berhasil`);
  }
});

after(() => {
  // Hapus berkas uji lebih dulu (nama berkas hanya diketahui dari DB).
  const rows = dibuat.foto.length
    ? db.prepare(`SELECT url, thumb_url FROM kegiatan_foto WHERE id IN (${dibuat.foto.join(',')})`).all()
    : [];
  for (const r of rows) {
    for (const u of [r.url, r.thumb_url]) {
      const f = path.join(UPLOAD_DIR, path.basename(u));
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {
        /* diabaikan */
      }
    }
  }
  if (dibuat.foto.length) db.prepare(`DELETE FROM kegiatan_foto WHERE id IN (${dibuat.foto.join(',')})`).run();
  const p = dibuat.pengguna.join(',');
  if (p) {
    db.prepare(`DELETE FROM notifikasi WHERE recipient_pengguna_id IN (${p})`).run();
    db.prepare(`DELETE FROM audit_log WHERE actor_pengguna_id IN (${p})`).run();
    db.prepare(`DELETE FROM guru_rombel WHERE pengguna_id IN (${p})`).run();
    db.prepare(`DELETE FROM wali_siswa WHERE wali_pengguna_id IN (${p})`).run();
    db.prepare(`DELETE FROM staff_profile WHERE pengguna_id IN (${p})`).run();
  }
  const s = dibuat.siswa.join(',');
  if (s) {
    db.prepare(`DELETE FROM siswa_enrollment WHERE siswa_id IN (${s})`).run();
    db.prepare(`DELETE FROM siswa WHERE id IN (${s})`).run();
  }
  if (p) db.prepare(`DELETE FROM pengguna WHERE id IN (${p})`).run();
  const r = dibuat.rombel.join(',');
  if (r) db.prepare(`DELETE FROM rombel WHERE id IN (${r})`).run();
});

describe('galeri foto kegiatan', () => {
  it('guru mengunggah ke rombel sendiri: tersimpan, dikompresi, ada thumbnail', async () => {
    const buffer = await fotoUji(1600, 1200);
    const r = await unggah(tokenGuruA, { rombelId: rombelA, tanggal: '2026-10-20', judul: 'Menari bersama', buffer });
    assert.equal(r.status, 201);
    assert.equal(r.body.dibuat.length, 1);
    dibuat.foto.push(r.body.dibuat[0].id);

    const row = db.prepare('SELECT * FROM kegiatan_foto WHERE id=?').get(r.body.dibuat[0].id);
    assert.ok(row.url.startsWith('/uploads/kegiatan/'));
    assert.ok(row.thumb_url.includes('-thumb.jpg'));
    assert.ok(row.size_bytes > 0 && row.size_bytes < buffer.length, 'berkas tersimpan harus lebih kecil dari aslinya');

    const penuh = path.join(UPLOAD_DIR, path.basename(row.url));
    const thumb = path.join(UPLOAD_DIR, path.basename(row.thumb_url));
    assert.ok(fs.existsSync(penuh) && fs.existsSync(thumb), 'berkas penuh & thumbnail harus ada');
    const meta = await sharp(penuh).metadata();
    assert.ok(meta.width <= 1280, `lebar maksimal 1280, dapat ${meta.width}`);
    const metaThumb = await sharp(thumb).metadata();
    assert.ok(metaThumb.width <= 480, `thumbnail maksimal 480, dapat ${metaThumb.width}`);
  });

  it('guru tidak bisa mengunggah ke rombel yang bukan miliknya', async () => {
    const buffer = await fotoUji(800, 600);
    const r = await unggah(tokenGuruB, { rombelId: rombelA, tanggal: '2026-10-20', judul: 'Nyasar', buffer });
    assert.equal(r.status, 403);
  });

  it('kepsek tidak bisa mengunggah (hanya membaca)', async () => {
    const buffer = await fotoUji(800, 600);
    const r = await unggah(tokenKepsek, { rombelId: rombelA, tanggal: '2026-10-20', judul: 'Kepsek', buffer });
    assert.equal(r.status, 403);
  });

  it('validasi judul, tanggal masa depan, dan berkas kosong', async () => {
    const buffer = await fotoUji(800, 600);
    const judulPendek = await unggah(tokenGuruA, { rombelId: rombelA, tanggal: '2026-10-20', judul: 'ab', buffer });
    assert.equal(judulPendek.status, 400);

    const masaDepan = await unggah(tokenGuruA, {
      rombelId: rombelA,
      tanggal: '2099-01-01',
      judul: 'Masa depan',
      buffer
    });
    assert.equal(masaDepan.status, 400);
    assert.match(masaDepan.body.error, /masa depan/i);

    const tanpaBerkas = await unggah(tokenGuruA, { rombelId: rombelA, tanggal: '2026-10-20', judul: 'Tanpa foto' });
    assert.equal(tanpaBerkas.status, 400);
  });

  it('wali melihat kelas anaknya, tidak melihat kelas lain', async () => {
    const punya = await req('GET', '/api/kegiatan', null, tokenWaliA);
    assert.equal(punya.status, 200);
    assert.ok(
      punya.body.some((r) => r.rombel_id === rombelA),
      'wali A harus melihat foto kelas A'
    );
    assert.ok(!punya.body.some((r) => r.rombel_id === rombelB), 'wali A tidak boleh melihat kelas B');

    const lain = await req('GET', '/api/kegiatan', null, tokenWaliB);
    assert.equal(lain.status, 200);
    assert.equal(lain.body.length, 0, 'kelas B belum punya foto');
  });

  it('admin cabang lain tidak melihat foto cabang ini', async () => {
    const r = await req('GET', '/api/kegiatan', null, tokenAdminCabangLain);
    assert.equal(r.status, 200);
    assert.ok(!r.body.some((x) => x.rombel_id === rombelA));
  });

  it('berkas tidak bisa diambil lewat URL langsung oleh yang tidak berhak', async () => {
    const row = db.prepare('SELECT url, thumb_url FROM kegiatan_foto WHERE id=?').get(dibuat.foto[0]);

    const ambil = (token, url) =>
      fetch(`${BASE}${url}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }).then((r) => r.status);

    assert.equal(await ambil(tokenWaliA, row.url), 200, 'wali pemilik kelas boleh');
    assert.equal(await ambil(tokenWaliA, row.thumb_url), 200, 'thumbnail juga boleh');
    assert.equal(await ambil(tokenWaliB, row.url), 403, 'wali kelas lain ditolak');
    assert.equal(await ambil(tokenGuruA, row.url), 200, 'guru pengampu boleh');
    assert.equal(await ambil(tokenAdminCabangLain, row.url), 403, 'admin cabang lain ditolak');
    assert.equal(await ambil(null, row.url), 401, 'tanpa token ditolak');
  });

  it('guru rombel lain tidak bisa menghapus; guru pengampu bisa', async () => {
    const id = dibuat.foto[0];
    const tolak = await req('DELETE', `/api/kegiatan/${id}`, null, tokenGuruB);
    assert.equal(tolak.status, 403);

    const row = db.prepare('SELECT url, thumb_url FROM kegiatan_foto WHERE id=?').get(id);
    const ok = await req('DELETE', `/api/kegiatan/${id}`, null, tokenGuruA);
    assert.equal(ok.status, 200);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM kegiatan_foto WHERE id=?').get(id).c, 0);
    assert.ok(!fs.existsSync(path.join(UPLOAD_DIR, path.basename(row.url))), 'berkas ikut terhapus');
    assert.ok(!fs.existsSync(path.join(UPLOAD_DIR, path.basename(row.thumb_url))), 'thumbnail ikut terhapus');
  });

  it('admin melihat semua cabang dan boleh menghapus', async () => {
    const buffer = await fotoUji(900, 700);
    const r = await unggah(tokenAdmin, {
      rombelId: rombelCabangLain,
      tanggal: '2026-10-19',
      judul: 'Lintas cabang',
      buffer
    });
    assert.equal(r.status, 201, 'admin boleh mengunggah ke cabang mana pun');
    dibuat.foto.push(r.body.dibuat[0].id);

    const daftar = await req('GET', '/api/kegiatan', null, tokenAdmin);
    assert.ok(daftar.body.some((x) => x.rombel_id === rombelCabangLain));
    const baris = daftar.body.find((x) => x.rombel_id === rombelCabangLain);
    assert.equal(baris.boleh_hapus, true);
  });
});
