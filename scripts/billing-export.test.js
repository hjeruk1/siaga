// Tes ekspor keuangan (CSV).
//
// Yang dijaga:
//   - isi CSV sama dengan aturan di layar: tagihan/pembayaran void TIDAK ikut,
//     karena mencampurnya membuat total di Excel berbeda dari aplikasi
//   - status & metode ditulis dalam bahasa manusia, bukan kode database
//   - nama yang mengandung koma/tanda kutip tetap utuh (CSV escaping)
//   - admin cabang hanya mendapat cabangnya sendiri
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const db = require('../backend/db');
const bcrypt = require('../backend/node_modules/bcryptjs');

process.env.JWT_SECRET ||= 'siaga-test-secret-change-me';

const BASE = process.env.TEST_URL || 'http://127.0.0.1:3999';
const NYAWA = Date.now();
const PERIODE = '2026-11';
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

// Catatan: Response.text() MEMBUANG BOM sesuai spesifikasi, jadi BOM harus
// diperiksa dari byte mentah — kalau tidak, tes akan mengira BOM tidak ada
// padahal server mengirimnya.
async function ambilCsv(path, token) {
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const buf = Buffer.from(await r.arrayBuffer());
  const adaBom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  const teks = new TextDecoder('utf-8', { ignoreBOM: true }).decode(buf);
  return { status: r.status, tipe: r.headers.get('content-type') || '', teks, adaBom, baris: teks.split('\n') };
}

const dibuat = { pengguna: [], siswa: [], rombel: [], tagihan: [], pembayaran: [] };
let cabangA;
let cabangB;
let tokenAdmin;
let tokenAdminA;
let tokenAdminB;
let tokenGuru;

function buatSiswa(nama, cabangId, jenjangId, rombelId) {
  const id = db
    .prepare(`INSERT INTO siswa(nama,status,foto,catatan_khusus,created_at,updated_at) VALUES(?,'aktif',NULL,'x',?,?)`)
    .run(nama, nowIso(), nowIso()).lastInsertRowid;
  db.prepare(
    `INSERT INTO siswa_enrollment(siswa_id,cabang_id,jenjang_id,rombel_id,paket,tanggal_mulai,status,created_at,created_by)
     VALUES(?,?,?,?,'reguler','2026-01-01','aktif',?,NULL)`
  ).run(id, cabangId, jenjangId, rombelId, nowIso());
  dibuat.siswa.push(id);
  return id;
}

function buatTagihan(
  siswaId,
  cabangId,
  jenjangId,
  rombelId,
  { nama, status = 'open', nominal = 100000, periode = PERIODE }
) {
  const id = db
    .prepare(
      `INSERT INTO tagihan(siswa_id,cabang_id,jenjang_id,rombel_id,paket,tahun_ajaran,periode,jenis,nama,
        nominal_awal,diskon_amount,nominal_final,jatuh_tempo,status,created_by,created_at,updated_at)
       VALUES(?,?,?,?,'reguler','2026/2027',?,'spp',?,?,0,?,?,?,NULL,?,?)`
    )
    .run(
      siswaId,
      cabangId,
      jenjangId,
      rombelId,
      periode,
      nama,
      nominal,
      nominal,
      `${periode}-10`,
      status,
      nowIso(),
      nowIso()
    ).lastInsertRowid;
  dibuat.tagihan.push(id);
  return id;
}

function buatPembayaran(
  siswaId,
  cabangId,
  { nominal, status = 'confirmed', tanggal = `${PERIODE}-05`, metode = 'tunai' }
) {
  const id = db
    .prepare(
      `INSERT INTO pembayaran(cabang_id,siswa_id,receipt_no,tanggal_bayar,nominal,metode,status,reference,catatan,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,'UJI','fixture',?,?)`
    )
    .run(
      cabangId,
      siswaId,
      `TP-UJI-${NYAWA}-${dibuat.pembayaran.length + 1}`,
      tanggal,
      nominal,
      metode,
      status,
      nowIso(),
      nowIso()
    ).lastInsertRowid;
  dibuat.pembayaran.push(id);
  return id;
}

describe('ekspor keuangan', () => {
  before(async () => {
    const cabangRows = db.prepare('SELECT id FROM cabang ORDER BY id LIMIT 2').all();
    cabangA = cabangRows[0].id;
    cabangB = cabangRows[1].id;
    const jenjang = db.prepare('SELECT id FROM jenjang ORDER BY urutan LIMIT 1').get();
    const rombelA = db
      .prepare('INSERT INTO rombel(cabang_id,jenjang_id,nama,aktif,created_at,updated_at) VALUES(?,?,?,1,?,?)')
      .run(cabangA, jenjang.id, `Ekspor A ${NYAWA}`, nowIso(), nowIso()).lastInsertRowid;
    const rombelB = db
      .prepare('INSERT INTO rombel(cabang_id,jenjang_id,nama,aktif,created_at,updated_at) VALUES(?,?,?,1,?,?)')
      .run(cabangB, jenjang.id, `Ekspor B ${NYAWA}`, nowIso(), nowIso()).lastInsertRowid;
    dibuat.rombel.push(rombelA, rombelB);

    // Nama dengan koma dan tanda kutip: menguji escaping CSV.
    const siswaA = buatSiswa(`Uji, "Koma" ${NYAWA}`, cabangA, jenjang.id, rombelA);
    const siswaB = buatSiswa(`Uji B ${NYAWA}`, cabangB, jenjang.id, rombelB);

    buatTagihan(siswaA, cabangA, jenjang.id, rombelA, { nama: 'SPP Uji Normal' });
    buatTagihan(siswaA, cabangA, jenjang.id, rombelA, { nama: 'SPP Uji Void', status: 'void' });
    buatTagihan(siswaB, cabangB, jenjang.id, rombelB, { nama: 'SPP Uji Cabang B' });

    buatPembayaran(siswaA, cabangA, { nominal: 150000 });
    buatPembayaran(siswaA, cabangA, { nominal: 250000, status: 'pending_verification', metode: 'qris' });
    buatPembayaran(siswaA, cabangA, { nominal: 999000, status: 'void' });

    const usernameA = `ekspor-admin-a-${NYAWA}`;
    const usernameB = `ekspor-admin-b-${NYAWA}`;
    for (const [username, cabangId] of [
      [usernameA, cabangA],
      [usernameB, cabangB]
    ]) {
      const id = db
        .prepare(
          `INSERT INTO pengguna(tipe,role,display_name,username,password_hash,status,must_change_password,created_at,updated_at)
           VALUES('staff','admin_cabang',?,?,?,'aktif',0,?,?)`
        )
        .run('Admin Ekspor', username, bcrypt.hashSync('admin123', 8), nowIso(), nowIso()).lastInsertRowid;
      db.prepare('INSERT INTO staff_profile(pengguna_id,cabang_id) VALUES(?,?)').run(id, cabangId);
      dibuat.pengguna.push(id);
    }
    const guruUsername = `ekspor-guru-${NYAWA}`;
    const guruId = db
      .prepare(
        `INSERT INTO pengguna(tipe,role,display_name,username,password_hash,status,must_change_password,created_at,updated_at)
         VALUES('staff','guru',?,?,?,'aktif',0,?,?)`
      )
      .run('Guru Ekspor', guruUsername, bcrypt.hashSync('admin123', 8), nowIso(), nowIso()).lastInsertRowid;
    db.prepare('INSERT INTO staff_profile(pengguna_id,cabang_id) VALUES(?,?)').run(guruId, cabangA);
    dibuat.pengguna.push(guruId);

    tokenAdmin = await loginStaff('admin');
    tokenAdminA = await loginStaff(usernameA);
    tokenAdminB = await loginStaff(usernameB);
    tokenGuru = await loginStaff(guruUsername);
    for (const [n, t] of Object.entries({ tokenAdmin, tokenAdminA, tokenAdminB, tokenGuru })) {
      assert.ok(t, `login ${n} harus berhasil`);
    }
  });

  after(() => {
    const p = dibuat.pembayaran.join(',');
    if (p) db.prepare(`DELETE FROM pembayaran WHERE id IN (${p})`).run();
    const t = dibuat.tagihan.join(',');
    if (t) db.prepare(`DELETE FROM tagihan WHERE id IN (${t})`).run();
    const s = dibuat.siswa.join(',');
    if (s) {
      db.prepare(`DELETE FROM siswa_enrollment WHERE siswa_id IN (${s})`).run();
      db.prepare(`DELETE FROM siswa WHERE id IN (${s})`).run();
    }
    const u = dibuat.pengguna.join(',');
    if (u) {
      db.prepare(`DELETE FROM audit_log WHERE actor_pengguna_id IN (${u})`).run();
      db.prepare(`DELETE FROM staff_profile WHERE pengguna_id IN (${u})`).run();
      db.prepare(`DELETE FROM pengguna WHERE id IN (${u})`).run();
    }
    if (dibuat.rombel.length) db.prepare(`DELETE FROM rombel WHERE id IN (${dibuat.rombel.join(',')})`).run();
  });

  it('mengekspor tagihan: header, BOM, dan void dikecualikan', async () => {
    const r = await ambilCsv(`/api/billing/export?jenis=tagihan&periode=${PERIODE}&cabang_id=${cabangA}`, tokenAdmin);
    assert.equal(r.status, 200);
    assert.match(r.tipe, /text\/csv/);
    assert.ok(r.adaBom, 'harus diawali BOM UTF-8 agar Excel membaca aksen dengan benar');
    assert.match(r.teks, /^\uFEFFsep=,/, 'baris sep=, membuat Excel memisahkan kolom otomatis');
    assert.match(r.baris[1], /"Cabang","Siswa","Rombel"/);
    assert.match(r.teks, /SPP Uji Normal/);
    assert.ok(!/SPP Uji Void/.test(r.teks), 'tagihan void tidak boleh ikut');
    assert.match(r.teks, /Belum dibayar/, 'status ditulis dalam bahasa manusia');
  });

  it('nama dengan koma dan tanda kutip tetap utuh', async () => {
    const r = await ambilCsv(`/api/billing/export?jenis=tagihan&periode=${PERIODE}&cabang_id=${cabangA}`, tokenAdmin);
    assert.match(r.teks, /"Uji, ""Koma"" \d+"/, 'koma dan kutip harus di-escape, bukan memecah kolom');
  });

  it('mengekspor pembayaran: pending ikut, void tidak', async () => {
    const r = await ambilCsv(
      `/api/billing/export?jenis=pembayaran&periode=${PERIODE}&cabang_id=${cabangA}`,
      tokenAdmin
    );
    assert.equal(r.status, 200);
    assert.match(r.baris[1], /"Tanggal Bayar".*"Metode".*"Nominal"/);
    assert.match(r.teks, /Terkonfirmasi/);
    assert.match(r.teks, /Menunggu verifikasi/);
    assert.ok(!/999000/.test(r.teks), 'pembayaran void tidak boleh ikut');
    assert.match(r.teks, /QRIS/, 'metode ditulis dalam bahasa manusia');
  });

  it('filter periode bekerja', async () => {
    const lain = await ambilCsv('/api/billing/export?jenis=tagihan&periode=2026-01&cabang_id=' + cabangA, tokenAdmin);
    assert.equal(lain.status, 200);
    assert.ok(!/SPP Uji Normal/.test(lain.teks), 'periode lain tidak boleh membawa tagihan November');
    assert.equal(lain.baris.length, 2, 'hanya header + sep');
  });

  it('admin cabang hanya mendapat cabangnya', async () => {
    const a = await ambilCsv(`/api/billing/export?jenis=tagihan&periode=${PERIODE}`, tokenAdminA);
    assert.equal(a.status, 200);
    assert.match(a.teks, /SPP Uji Normal/);
    assert.ok(!/SPP Uji Cabang B/.test(a.teks), 'cabang lain tidak boleh ikut');

    // Meminta cabang lain lewat query tidak membuka data cabang itu.
    const coba = await ambilCsv(
      `/api/billing/export?jenis=tagihan&periode=${PERIODE}&cabang_id=${cabangB}`,
      tokenAdminA
    );
    assert.ok(!/SPP Uji Cabang B/.test(coba.teks), 'scope admin cabang tidak bisa ditembus parameter');
  });

  it('peran yang tidak berhak ditolak', async () => {
    const guru = await ambilCsv(`/api/billing/export?jenis=tagihan&periode=${PERIODE}`, tokenGuru);
    assert.equal(guru.status, 403);
  });
});
