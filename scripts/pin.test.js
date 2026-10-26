// Tes PIN 6 angka untuk wali (gerbang aksi finansial).
//
// Fixture dibuat sendiri karena server uji memakai database segar.
// Yang dijaga: PIN opsional (tanpa PIN tetap boleh), penyaringan PIN lemah,
// kunci percobaan, dan bahwa staff TIDAK pernah terhalang PIN.
const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const db = require('../backend/db');
const bcrypt = require('../backend/node_modules/bcryptjs');

const BASE = process.env.TEST_URL || 'http://127.0.0.1:3999';
const NYAWA = Date.now();

function req(method, p, body, token) {
  return fetch(`${BASE}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
}

async function buatKeluarga(nama) {
  const waliId = db
    .prepare(
      `INSERT INTO pengguna(tipe,role,display_name,username,no_wa,password_hash,status,must_change_password,created_at,updated_at)
       VALUES('wali','wali',?,?,?,?,'aktif',0,?,?)`
    )
    .run(
      `Wali ${nama}`,
      `wali-${nama}-${NYAWA}`,
      `0812${String(NYAWA).slice(-8)}`,
      bcrypt.hashSync('admin123', 8),
      new Date().toISOString(),
      new Date().toISOString()
    ).lastInsertRowid;
  const cabang = db.prepare('SELECT id FROM cabang ORDER BY id LIMIT 1').get();
  const jenjang = db.prepare('SELECT id FROM jenjang ORDER BY urutan LIMIT 1').get();
  const rombel = db.prepare('SELECT id FROM rombel WHERE cabang_id=? ORDER BY id LIMIT 1').get(cabang.id);
  const s = db
    .prepare(
      `INSERT INTO siswa(nama,status,foto,catatan_khusus,created_at,updated_at) VALUES(?,'aktif',NULL,'fixture',?,?)`
    )
    .run(nama, new Date().toISOString(), new Date().toISOString());
  db.prepare("INSERT INTO wali_siswa(wali_pengguna_id,siswa_id,relasi,aktif,created_at) VALUES(?,?,'Ayah',1,?)").run(
    waliId,
    s.lastInsertRowid,
    new Date().toISOString()
  );
  db.prepare(
    `INSERT INTO siswa_enrollment(siswa_id,cabang_id,jenjang_id,rombel_id,paket,tanggal_mulai,status,created_at,created_by)
     VALUES(?,?,?,?,'reguler','2026-01-01','aktif',?,NULL)`
  ).run(s.lastInsertRowid, cabang.id, jenjang.id, rombel.id, new Date().toISOString());
  const login = await req('POST', '/api/auth/login', {
    tipe: 'wali',
    no_wa: `0812${String(NYAWA).slice(-8)}`,
    password: 'admin123'
  });
  return { token: login.body?.token, siswaId: s.lastInsertRowid };
}

function buatTagihan(siswaId, nominal) {
  const e = db.prepare("SELECT * FROM siswa_enrollment WHERE siswa_id=? AND status='aktif'").get(siswaId);
  return db
    .prepare(
      `INSERT INTO tagihan(siswa_id,cabang_id,jenjang_id,rombel_id,paket,tahun_ajaran,periode,jenis,nama,
        nominal_awal,prorata_amount,koreksi_amount,diskon_amount,nominal_final,status,created_at,updated_at)
       VALUES(?,?,?,?,'reguler','2026/2027','2026-10','spp','SPP Uji',?,0,0,0,?,'open',?,?)`
    )
    .run(
      siswaId,
      e.cabang_id,
      e.jenjang_id,
      e.rombel_id,
      nominal,
      nominal,
      new Date().toISOString(),
      new Date().toISOString()
    ).lastInsertRowid;
}

describe('PIN keuangan wali', () => {
  let wali;
  let adminToken;

  before(async () => {
    const admin = await req('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
    adminToken = admin.body?.token;
    wali = await buatKeluarga(`Pin${NYAWA}`);
    buatTagihan(wali.siswaId, 200000);
  });

  it('tanpa PIN, data keuangan tetap bisa dibuka (PIN itu opsional)', async () => {
    const r = await req('GET', `/api/billing/wali/siswa/${wali.siswaId}`, null, wali.token);
    assert.equal(r.status, 200, JSON.stringify(r.body));
  });

  it('memasang PIN butuh password yang benar', async () => {
    const salah = await req('POST', '/api/auth/pin', { pin: '135790', password: 'bukan-password' }, wali.token);
    assert.equal(salah.status, 400);
    const benar = await req('POST', '/api/auth/pin', { pin: '135790', password: 'admin123' }, wali.token);
    assert.equal(benar.status, 200, JSON.stringify(benar.body));
    assert.equal(benar.body.status.punyaPin, true);
  });

  it('PIN lemah atau format salah ditolak', async () => {
    for (const lemah of ['123456', '111111', '654321', '12345', 'abcdef']) {
      const r = await req('POST', '/api/auth/pin', { pin: lemah, password: 'admin123' }, wali.token);
      assert.equal(r.status, 400, `PIN ${lemah} seharusnya ditolak`);
    }
  });

  it('setelah PIN dipasang, data keuangan butuh token PIN', async () => {
    const r = await req('GET', `/api/billing/wali/siswa/${wali.siswaId}`, null, wali.token);
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'PIN_REQUIRED');
  });

  it('PIN salah ditolak dan percobaan dibatasi', async () => {
    let terakhir = null;
    for (let i = 0; i < 5; i++) terakhir = await req('POST', '/api/auth/pin/verify', { pin: '999999' }, wali.token);
    assert.equal(terakhir.status, 429);
    assert.equal(terakhir.body.code, 'PIN_LOCKED');
    // Saat terkunci, PIN benar pun tidak bisa dipakai.
    const benarSaatKunci = await req('POST', '/api/auth/pin/verify', { pin: '135790' }, wali.token);
    assert.equal(benarSaatKunci.status, 429);
    // Buka kembali (uji, tanpa menunggu 15 menit): hapus kunci langsung.
    db.prepare(
      'UPDATE pengguna SET pin_failed_count=0, pin_locked_until=NULL WHERE id=(SELECT wali_pengguna_id FROM wali_siswa WHERE siswa_id=?)'
    ).run(wali.siswaId);
  });

  it('PIN benar menghasilkan token yang membuka data keuangan', async () => {
    const v = await req('POST', '/api/auth/pin/verify', { pin: '135790' }, wali.token);
    assert.equal(v.status, 200, JSON.stringify(v.body));
    assert.ok(v.body.pin_token, 'token PIN harus ada');
    const r = await fetch(`${BASE}/api/billing/wali/siswa/${wali.siswaId}`, {
      headers: { Authorization: `Bearer ${wali.token}`, 'X-Pin-Token': v.body.pin_token }
    });
    assert.equal(r.status, 200);
  });

  it('token palsu tetap ditolak', async () => {
    const r = await fetch(`${BASE}/api/billing/wali/siswa/${wali.siswaId}`, {
      headers: { Authorization: `Bearer ${wali.token}`, 'X-Pin-Token': '9999999999.tidakvalid' }
    });
    assert.equal(r.status, 403);
  });

  it('staff tidak pernah terhalang PIN', async () => {
    const r = await req('GET', '/api/billing/pembayaran', null, adminToken);
    assert.equal(r.status, 200, 'admin tidak boleh tersandung gerbang PIN');
  });

  it('mematikan PIN butuh password; setelah itu data kembali terbuka', async () => {
    const salah = await req('DELETE', '/api/auth/pin', { password: 'keliru' }, wali.token);
    assert.equal(salah.status, 400);
    const benar = await req('DELETE', '/api/auth/pin', { password: 'admin123' }, wali.token);
    assert.equal(benar.status, 200);
    const setelah = await req('GET', `/api/billing/wali/siswa/${wali.siswaId}`, null, wali.token);
    assert.equal(setelah.status, 200);
  });
});
