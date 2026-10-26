// Tes rapor perkembangan bulanan (PDF).
//
// Dua lapis yang dijaga:
//   1. Akses — rapor berisi catatan pribadi anak; hanya wali pemilik dan staf
//      yang mengurus kelasnya.
//   2. Isi — angka kehadiran, hanya catatan yang SUDAH dipublikasikan, izin
//      pada rentang bulan itu, dan tagihan periode tersebut.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const PDFDocument = require('../backend/node_modules/pdfkit');
const db = require('../backend/db');
const bcrypt = require('../backend/node_modules/bcryptjs');

process.env.JWT_SECRET ||= 'siaga-test-secret-change-me';

const BASE = process.env.TEST_URL || 'http://127.0.0.1:3999';
const NYAWA = Date.now();
const BULAN = '2026-10';
const nowIso = () => new Date().toISOString();

const rapor = require('../backend/utils/raporPdf');

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

const dibuat = { pengguna: [], siswa: [], rombel: [] };
let cabangId;
let jenjangId;
let rombelId;
let siswaId;
let siswaTanpaEnrollment;
let tokenWali;
let tokenWaliLain;
let tokenGuru;
let tokenAdmin;

function buatSiswa(nama, { enrollment = true } = {}) {
  const id = db
    .prepare(`INSERT INTO siswa(nama,status,foto,catatan_khusus,created_at,updated_at) VALUES(?,'aktif',NULL,'x',?,?)`)
    .run(nama, nowIso(), nowIso()).lastInsertRowid;
  dibuat.siswa.push(id);
  if (enrollment) {
    db.prepare(
      `INSERT INTO siswa_enrollment(siswa_id,cabang_id,jenjang_id,rombel_id,paket,tanggal_mulai,status,created_at,created_by)
       VALUES(?,?,?,?,'full_day','2026-01-01','aktif',?,NULL)`
    ).run(id, cabangId, jenjangId, rombelId, nowIso());
  }
  return id;
}

function buatWali(nama, noWa, siswa) {
  const id = db
    .prepare(
      `INSERT INTO pengguna(tipe,role,display_name,username,no_wa,password_hash,status,must_change_password,created_at,updated_at)
       VALUES('wali','wali',?,?,?,?,'aktif',0,?,?)`
    )
    .run(
      `Wali ${nama}`,
      `wali-rapor-${nama}-${NYAWA}`,
      noWa,
      bcrypt.hashSync('admin123', 8),
      nowIso(),
      nowIso()
    ).lastInsertRowid;
  dibuat.pengguna.push(id);
  if (siswa) {
    db.prepare("INSERT INTO wali_siswa(wali_pengguna_id,siswa_id,relasi,aktif,created_at) VALUES(?,?,'Ibu',1,?)").run(
      id,
      siswa,
      nowIso()
    );
  }
  return id;
}

function absensi(tanggal, status) {
  db.prepare(
    `INSERT INTO absensi(siswa_id,cabang_id,jenjang_id,rombel_id,paket,tanggal,status,jam_masuk,created_at,updated_at)
     VALUES(?,?,?,?,'full_day',?,?,?,?,?)`
  ).run(
    siswaId,
    cabangId,
    jenjangId,
    rombelId,
    tanggal,
    status,
    status === 'Hadir' ? '07:30' : null,
    nowIso(),
    nowIso()
  );
}

describe('rapor bulanan', () => {
  before(async () => {
    const cabang = db.prepare('SELECT id FROM cabang ORDER BY id LIMIT 1').get();
    const jenjang = db.prepare('SELECT id FROM jenjang ORDER BY urutan LIMIT 1').get();
    cabangId = cabang.id;
    jenjangId = jenjang.id;
    rombelId = db
      .prepare('INSERT INTO rombel(cabang_id,jenjang_id,nama,aktif,created_at,updated_at) VALUES(?,?,?,1,?,?)')
      .run(cabangId, jenjangId, `Rapor ${NYAWA}`, nowIso(), nowIso()).lastInsertRowid;
    dibuat.rombel.push(rombelId);

    siswaId = buatSiswa(`Rapor Anak ${NYAWA}`);
    siswaTanpaEnrollment = buatSiswa(`Rapor Tanpa Kelas ${NYAWA}`, { enrollment: false });

    buatWali('utama', `0815${String(NYAWA).slice(-7)}1`, siswaId);
    buatWali('lain', `0815${String(NYAWA).slice(-7)}2`, null);

    const guruUsername = `rapor-guru-${NYAWA}`;
    const guruId = db
      .prepare(
        `INSERT INTO pengguna(tipe,role,display_name,username,password_hash,status,must_change_password,created_at,updated_at)
         VALUES('staff','guru',?,?,?,'aktif',0,?,?)`
      )
      .run('Guru Rapor', guruUsername, bcrypt.hashSync('admin123', 8), nowIso(), nowIso()).lastInsertRowid;
    db.prepare('INSERT INTO staff_profile(pengguna_id,cabang_id) VALUES(?,?)').run(guruId, cabangId);
    db.prepare('INSERT INTO guru_rombel(pengguna_id,rombel_id,created_at) VALUES(?,?,?)').run(
      guruId,
      rombelId,
      nowIso()
    );
    dibuat.pengguna.push(guruId);

    tokenWali = await loginWali(`0815${String(NYAWA).slice(-7)}1`);
    tokenWaliLain = await loginWali(`0815${String(NYAWA).slice(-7)}2`);
    tokenGuru = await loginStaff(guruUsername);
    tokenAdmin = await loginStaff('admin');
    for (const [nama, t] of Object.entries({ tokenWali, tokenWaliLain, tokenGuru, tokenAdmin })) {
      assert.ok(t, `login ${nama} harus berhasil`);
    }

    // Data bulan Oktober 2026
    absensi('2026-10-05', 'Hadir');
    absensi('2026-10-06', 'Hadir');
    absensi('2026-10-07', 'Terlambat');
    absensi('2026-10-08', 'Izin');
    absensi('2026-10-09', 'Sakit');
    // Di luar bulan: tidak boleh ikut dihitung.
    absensi('2026-09-30', 'Absen');

    db.prepare(
      `INSERT INTO laporan_harian(siswa_id,cabang_id,jenjang_id,rombel_id,paket,tanggal,guru_id,status,aktivitas,catatan,created_at,updated_at)
       VALUES(?,?,?,?,'full_day','2026-10-06',?,'published','[]','Anak aktif bertanya saat kegiatan',?,?)`
    ).run(siswaId, cabangId, jenjangId, rombelId, guruId, nowIso(), nowIso());
    // Draft tidak boleh muncul di rapor orang tua.
    db.prepare(
      `INSERT INTO laporan_harian(siswa_id,cabang_id,jenjang_id,rombel_id,paket,tanggal,guru_id,status,aktivitas,catatan,created_at,updated_at)
       VALUES(?,?,?,?,'full_day','2026-10-07',?,'draft','[]','CATATAN DRAFT RAHASIA',?,?)`
    ).run(siswaId, cabangId, jenjangId, rombelId, guruId, nowIso(), nowIso());

    db.prepare(
      `INSERT INTO izin_request(siswa_id,cabang_id,wali_pengguna_id,jenis,tanggal_mulai,tanggal_selesai,alasan,status,created_at,updated_at)
       VALUES(?,?,?,'sakit','2026-10-09','2026-10-09','Demam tinggi','disetujui',?,?)`
    ).run(siswaId, cabangId, dibuat.pengguna[0], nowIso(), nowIso());

    db.prepare(
      `INSERT INTO tagihan(siswa_id,cabang_id,jenjang_id,rombel_id,paket,tahun_ajaran,periode,jenis,nama,
        nominal_awal,diskon_amount,nominal_final,jatuh_tempo,status,created_by,created_at,updated_at)
       VALUES(?,?,?,?,'full_day','2026/2027','2026-10','spp','SPP Oktober',350000,0,350000,'2026-10-10','open',NULL,?,?)`
    ).run(siswaId, cabangId, jenjangId, rombelId, nowIso(), nowIso());
  });

  after(() => {
    const s = dibuat.siswa.join(',');
    if (s) {
      db.prepare(`DELETE FROM absensi WHERE siswa_id IN (${s})`).run();
      db.prepare(`DELETE FROM laporan_harian WHERE siswa_id IN (${s})`).run();
      db.prepare(`DELETE FROM izin_request WHERE siswa_id IN (${s})`).run();
      db.prepare(`DELETE FROM tagihan WHERE siswa_id IN (${s})`).run();
      db.prepare(`DELETE FROM wali_siswa WHERE siswa_id IN (${s})`).run();
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
  });

  it('menghitung kehadiran hanya dari bulan yang diminta', () => {
    const d = rapor.dataRapor(siswaId, BULAN);
    assert.ok(d, 'data rapor harus ada');
    assert.equal(d.hariEfektif, 5, 'hanya 5 hari pada Oktober');
    assert.equal(d.hitung.Hadir, 2);
    assert.equal(d.hitung.Terlambat, 1);
    assert.equal(d.hitung.Izin, 1);
    assert.equal(d.hitung.Sakit, 1);
    assert.equal(d.persen, 60, 'hadir+terlambat 3 dari 5 hari');
  });

  it('hanya catatan yang sudah dipublikasikan yang masuk', () => {
    const d = rapor.dataRapor(siswaId, BULAN);
    assert.equal(d.catatan.length, 1, 'draft tidak boleh ikut');
    assert.match(d.catatan[0].catatan, /aktif bertanya/);
  });

  it('izin dan tagihan bulan itu ikut terbawa', () => {
    const d = rapor.dataRapor(siswaId, BULAN);
    assert.equal(d.izin.length, 1);
    assert.equal(d.izin[0].jenis, 'sakit');
    assert.equal(d.tagihan.length, 1);
    assert.equal(d.tagihan[0].nama, 'SPP Oktober');
  });

  it('renderer menghasilkan dokumen PDF yang utuh', async () => {
    const d = rapor.dataRapor(siswaId, BULAN);
    // Catatan: isi teks TIDAK bisa diperiksa dengan grep — PDFKit menyandikan
    // teks ke dalam objek terkompresi. Isi (termasuk draft yang tidak boleh
    // ikut) sudah diverifikasi di lapisan data di atas; di sini yang dipastikan
    // adalah dokumennya benar-benar terbentuk.
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const potongan = [];
    doc.on('data', (c) => potongan.push(c));
    const selesai = new Promise((r) => doc.on('end', r));
    rapor.renderRaporBulanan(doc, d, { yayasan: 'Yayasan Uji' });
    doc.end();
    await selesai;
    const buf = Buffer.concat(potongan);
    assert.equal(buf.slice(0, 4).toString(), '%PDF');
    // Ukuran bergantung isi (logo, jumlah catatan). Yang penting halaman benar
    // terbentuk, bukan angka byte tertentu.
    assert.match(buf.toString('latin1'), /\/Type \/Page\b/);
    assert.ok(buf.length > 1500, `dokumen terlalu kecil: ${buf.length} byte`);
  });

  it('wali bisa mengunduh rapor anaknya (PDF)', async () => {
    const r = await fetch(`${BASE}/api/rapor/${siswaId}/pdf?bulan=${BULAN}`, {
      headers: { Authorization: `Bearer ${tokenWali}` }
    });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type') || '', /application\/pdf/);
    const buf = Buffer.from(await r.arrayBuffer());
    assert.equal(buf.slice(0, 4).toString(), '%PDF');
    assert.ok(buf.length > 3000, 'dokumen tidak boleh kosong');
  });

  it('wali lain ditolak', async () => {
    const r = await fetch(`${BASE}/api/rapor/${siswaId}/pdf?bulan=${BULAN}`, {
      headers: { Authorization: `Bearer ${tokenWaliLain}` }
    });
    assert.equal(r.status, 403);
  });

  it('guru pengampu dan admin boleh, tanpa token ditolak', async () => {
    const guru = await fetch(`${BASE}/api/rapor/${siswaId}/pdf?bulan=${BULAN}`, {
      headers: { Authorization: `Bearer ${tokenGuru}` }
    });
    assert.equal(guru.status, 200);
    const admin = await fetch(`${BASE}/api/rapor/${siswaId}/pdf?bulan=${BULAN}`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` }
    });
    assert.equal(admin.status, 200);
    const tanpa = await fetch(`${BASE}/api/rapor/${siswaId}/pdf?bulan=${BULAN}`);
    assert.equal(tanpa.status, 401);
  });

  it('bulan tidak valid jatuh ke bulan berjalan, bukan error', async () => {
    const r = await fetch(`${BASE}/api/rapor/${siswaId}/pdf?bulan=bukan-bulan`, {
      headers: { Authorization: `Bearer ${tokenWali}` }
    });
    assert.equal(r.status, 200);
  });

  it('siswa tanpa enrollment aktif dijawab 404', async () => {
    const r = await fetch(`${BASE}/api/rapor/${siswaTanpaEnrollment}/pdf?bulan=${BULAN}`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` }
    });
    assert.equal(r.status, 404);
  });
});
