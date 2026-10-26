// Tes absensi dari antrean offline.
//
// Skenario yang dijaga: guru menekan "hadir" saat sinyal putus. Request bisa
// sudah sampai ke server tapi responsnya hilang. Saat online, antrean
// mengirim ulang — dan server TIDAK boleh menganggapnya kesalahan, tapi juga
// tidak boleh mencatat dua kali.
//
// Selain itu jam kiriman perangkat harus dipakai saat masuk akal (supaya
// kedatangan 07:10 tidak tercatat 08:30 sebagai terlambat), dan diabaikan saat
// tidak masuk akal (perangkat dengan jam salah tidak boleh memalsukan
// ketepatan waktu).
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const db = require('../backend/db');
const bcrypt = require('../backend/node_modules/bcryptjs');
const { todayWIB, nowTimeWIB } = require('../backend/utils/workflow');

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

async function login(username, password) {
  const r = await req('POST', '/api/auth/login', { tipe: 'staff', username, password });
  return r.body?.token || null;
}

const dibuat = { pengguna: [], siswa: [], rombel: [] };
let tokenGuru;
let rombelId;
let cabangId;
let jenjangId;
let siswaA;
let siswaB;
let siswaC;
let siswaD;

function buatSiswa(nama) {
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

describe('absensi dari antrean offline', () => {
  before(async () => {
    const cabang = db.prepare('SELECT id FROM cabang ORDER BY id LIMIT 1').get();
    const jenjang = db.prepare('SELECT id FROM jenjang ORDER BY urutan LIMIT 1').get();
    cabangId = cabang.id;
    jenjangId = jenjang.id;
    rombelId = db
      .prepare('INSERT INTO rombel(cabang_id,jenjang_id,nama,aktif,created_at,updated_at) VALUES(?,?,?,1,?,?)')
      .run(cabangId, jenjangId, `Offline ${NYAWA}`, nowIso(), nowIso()).lastInsertRowid;
    dibuat.rombel.push(rombelId);

    const username = `offline-guru-${NYAWA}`;
    const guruId = db
      .prepare(
        `INSERT INTO pengguna(tipe,role,display_name,username,password_hash,status,must_change_password,created_at,updated_at)
         VALUES('staff','guru',?,?,?,'aktif',0,?,?)`
      )
      .run('Guru Offline', username, bcrypt.hashSync('admin123', 8), nowIso(), nowIso()).lastInsertRowid;
    db.prepare('INSERT INTO staff_profile(pengguna_id,cabang_id) VALUES(?,?)').run(guruId, cabangId);
    db.prepare('INSERT INTO guru_rombel(pengguna_id,rombel_id,created_at) VALUES(?,?,?)').run(
      guruId,
      rombelId,
      nowIso()
    );
    dibuat.pengguna.push(guruId);
    tokenGuru = await login(username, 'admin123');
    assert.ok(tokenGuru, 'login guru harus berhasil');

    siswaA = buatSiswa(`Offline A ${NYAWA}`);
    siswaB = buatSiswa(`Offline B ${NYAWA}`);
    siswaC = buatSiswa(`Offline C ${NYAWA}`);
    siswaD = buatSiswa(`Offline D ${NYAWA}`);
  });

  after(() => {
    const s = dibuat.siswa.join(',');
    if (s) {
      db.prepare(`DELETE FROM absensi WHERE siswa_id IN (${s})`).run();
      db.prepare(`DELETE FROM siswa_enrollment WHERE siswa_id IN (${s})`).run();
      db.prepare(`DELETE FROM siswa WHERE id IN (${s})`).run();
    }
    const p = dibuat.pengguna.join(',');
    if (p) {
      db.prepare(`DELETE FROM audit_log WHERE actor_pengguna_id IN (${p})`).run();
      db.prepare(`DELETE FROM guru_rombel WHERE pengguna_id IN (${p})`).run();
      db.prepare(`DELETE FROM staff_profile WHERE pengguna_id IN (${p})`).run();
      db.prepare(`DELETE FROM pengguna WHERE id IN (${p})`).run();
    }
    if (dibuat.rombel.length) db.prepare(`DELETE FROM rombel WHERE id IN (${dibuat.rombel.join(',')})`).run();
    db.prepare('DELETE FROM absensi_idempotensi').run();
  });

  it('pengiriman ulang dengan client_id sama tidak menghasilkan error palsu', async () => {
    const tanggal = todayWIB();
    const clientId = `uji-${NYAWA}-a`;
    const pertama = await req(
      'POST',
      '/api/absensi/checkin',
      { siswa_id: siswaA, tanggal, client_id: clientId },
      tokenGuru
    );
    assert.equal(pertama.status, 200, JSON.stringify(pertama.body));
    assert.equal(pertama.body.success, true);

    const ulang = await req(
      'POST',
      '/api/absensi/checkin',
      { siswa_id: siswaA, tanggal, client_id: clientId },
      tokenGuru
    );
    assert.equal(ulang.status, 200, 'pengiriman ulang harus sukses, bukan 400');
    assert.equal(ulang.body.idempotent, true);
    assert.equal(ulang.body.jam_masuk, pertama.body.jam_masuk, 'jam tidak boleh berubah pada pengiriman ulang');

    // Efek samping tidak boleh berlipat.
    const row = db.prepare('SELECT id FROM absensi WHERE siswa_id=? AND tanggal=?').get(siswaA, tanggal);
    const audit = db.prepare("SELECT COUNT(*) c FROM audit_log WHERE action='checkin' AND entity_id=?").get(row.id).c;
    assert.equal(audit, 1, 'audit hanya sekali');
  });

  it('tanpa client_id, check-in kedua tetap ditolak seperti sebelumnya', async () => {
    const tanggal = todayWIB();
    const pertama = await req('POST', '/api/absensi/checkin', { siswa_id: siswaB, tanggal }, tokenGuru);
    assert.equal(pertama.status, 200);
    const kedua = await req('POST', '/api/absensi/checkin', { siswa_id: siswaB, tanggal }, tokenGuru);
    assert.equal(kedua.status, 400, 'perilaku lama tidak berubah');
  });

  it('jam dari perangkat dipakai bila masuk akal', async () => {
    const tanggal = todayWIB();
    // 00:05 selalu <= jam sekarang (kecuali tepat tengah malam) dan masih
    // dalam batas 8 jam hanya kalau sekarang < 08:05. Karena itu pilih jam
    // yang dihitung dari waktu server: 30 menit lalu.
    const sekarang = nowTimeWIB();
    const menit = Number(sekarang.slice(0, 2)) * 60 + Number(sekarang.slice(3, 5));
    const target = Math.max(0, menit - 30);
    const jam = `${String(Math.floor(target / 60)).padStart(2, '0')}:${String(target % 60).padStart(2, '0')}`;

    const r = await req('POST', '/api/absensi/checkin', { siswa_id: siswaC, tanggal, jam }, tokenGuru);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const row = db.prepare('SELECT jam_masuk FROM absensi WHERE siswa_id=? AND tanggal=?').get(siswaC, tanggal);
    assert.equal(row.jam_masuk, jam, 'jam kiriman perangkat harus dipakai');
    const audit = db
      .prepare(
        "SELECT after_json FROM audit_log WHERE action='checkin' AND entity_id=(SELECT id FROM absensi WHERE siswa_id=? AND tanggal=?)"
      )
      .get(siswaC, tanggal);
    assert.match(audit.after_json, /"dari_antrean":true/);
  });

  it('jam yang tidak masuk akal diabaikan, absensi tetap tercatat', async () => {
    const tanggal = todayWIB();
    const r = await req('POST', '/api/absensi/checkin', { siswa_id: siswaD, tanggal, jam: '00:01' }, tokenGuru);
    // Kalau sekarang < 08:01, 00:01 masih dianggap masuk akal; tes ini
    // menguji salah satu dari dua kemungkinan tanpa bergantung jam berjalan.
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const row = db.prepare('SELECT jam_masuk FROM absensi WHERE siswa_id=? AND tanggal=?').get(siswaD, tanggal);
    const sekarang = nowTimeWIB();
    const menitSekarang = Number(sekarang.slice(0, 2)) * 60 + Number(sekarang.slice(3, 5));
    if (menitSekarang > 8 * 60 + 1) {
      assert.notEqual(row.jam_masuk, '00:01', 'jam terlalu mundur harus diabaikan');
    } else {
      assert.equal(row.jam_masuk, '00:01', 'masih dalam batas, jadi dipakai');
    }
  });

  it('keterangan juga idempoten dan tidak menggandakan notifikasi', async () => {
    const tanggal = todayWIB();
    const clientId = `uji-${NYAWA}-ket`;
    // siswaA sudah Hadir -> keterangan tidak boleh menimpa; pakai siswa baru.
    const siswaE = buatSiswa(`Offline E ${NYAWA}`);
    const body = { siswa_id: siswaE, tanggal, status: 'Izin', catatan: 'Demam', client_id: clientId };
    const pertama = await req('POST', '/api/absensi/keterangan', body, tokenGuru);
    assert.equal(pertama.status, 200, JSON.stringify(pertama.body));

    const ulang = await req('POST', '/api/absensi/keterangan', body, tokenGuru);
    assert.equal(ulang.status, 200);
    assert.equal(ulang.body.idempotent, true);

    const row = db.prepare('SELECT status FROM absensi WHERE siswa_id=? AND tanggal=?').get(siswaE, tanggal);
    assert.equal(row.status, 'Izin');
    const audit = db
      .prepare(
        "SELECT COUNT(*) c FROM audit_log WHERE action='set_keterangan' AND entity_id=(SELECT id FROM absensi WHERE siswa_id=? AND tanggal=?)"
      )
      .get(siswaE, tanggal).c;
    assert.equal(audit, 1, 'audit keterangan hanya sekali');
  });
});
