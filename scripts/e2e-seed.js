// Data contoh minimal untuk uji E2E.
//
// init.js hanya membuat master data (organisasi, cabang, jenjang, rombel) dan
// akun admin. Uji E2E butuh tiga peran yang benar-benar bisa bekerja — guru
// dengan kelas, wali dengan anak, dan tagihan yang bisa diekspor — jadi
// fixture-nya dibuat di sini, deterministik dan tanpa menyentuh database lain.
//
// Angka & nama sengaja tetap (bukan acak) supaya asersi uji bisa spesifik.
const path = require('path');

const root = path.resolve(__dirname, '..');
// bcryptjs tinggal di backend/node_modules (dependensi backend), bukan root.
const bcrypt = require(path.join(root, 'backend/node_modules/bcryptjs'));
const db = require(path.join(root, 'backend/db'));
const now = () => new Date().toISOString();
const PASSWORD = 'admin123';

function akunStaff(username, role, cabangId, nama) {
  const ada = db.prepare('SELECT id FROM pengguna WHERE username=?').get(username);
  if (ada) return ada.id;
  const id = db
    .prepare(
      `INSERT INTO pengguna(tipe,role,display_name,username,password_hash,status,must_change_password,created_at,updated_at)
       VALUES('staff',?,?,?,?,'aktif',0,?,?)`
    )
    .run(role, nama, username, bcrypt.hashSync(PASSWORD, 8), now(), now()).lastInsertRowid;
  if (cabangId) db.prepare('INSERT INTO staff_profile(pengguna_id,cabang_id) VALUES(?,?)').run(id, cabangId);
  return id;
}

const cabang = db.prepare("SELECT id FROM cabang WHERE kode='GDN'").get();
const jenjang = db.prepare("SELECT id FROM jenjang WHERE kode='KBA'").get();
const rombel = db
  .prepare('SELECT id FROM rombel WHERE cabang_id=? AND jenjang_id=? ORDER BY id LIMIT 1')
  .get(cabang.id, jenjang.id);

if (!cabang || !jenjang || !rombel) {
  console.error('[e2e-seed] master data tidak lengkap; jalankan init.js lebih dulu');
  process.exit(1);
}

// --- Guru dengan satu kelas ---
const guruId = akunStaff('guru1', 'guru', cabang.id, 'Ayu Lestari');
if (!db.prepare('SELECT 1 FROM guru_rombel WHERE pengguna_id=? AND rombel_id=?').get(guruId, rombel.id)) {
  db.prepare('INSERT INTO guru_rombel(pengguna_id,rombel_id,created_at) VALUES(?,?,?)').run(guruId, rombel.id, now());
}

// --- Wali + anak ---
const NO_WA = '081200000000';
let wali = db.prepare('SELECT id FROM pengguna WHERE no_wa=?').get(NO_WA);
if (!wali) {
  wali = {
    id: db
      .prepare(
        `INSERT INTO pengguna(tipe,role,display_name,username,no_wa,password_hash,status,must_change_password,created_at,updated_at)
         VALUES('wali','wali','Andi Pratama','wali-e2e',?,?,'aktif',0,?,?)`
      )
      .run(NO_WA, bcrypt.hashSync(PASSWORD, 8), now(), now()).lastInsertRowid
  };
}

function siswaBaru(nama, waliId) {
  const siswaId = db
    .prepare(`INSERT INTO siswa(nama,status,foto,catatan_khusus,created_at,updated_at) VALUES(?,'aktif',NULL,'',?,?)`)
    .run(nama, now(), now()).lastInsertRowid;
  db.prepare(
    `INSERT INTO siswa_enrollment(siswa_id,cabang_id,jenjang_id,rombel_id,paket,tanggal_mulai,status,created_at,created_by)
     VALUES(?,?,?,?,'reguler','2026-01-01','aktif',?,NULL)`
  ).run(siswaId, cabang.id, jenjang.id, rombel.id, now());
  if (waliId) {
    db.prepare("INSERT INTO wali_siswa(wali_pengguna_id,siswa_id,relasi,aktif,created_at) VALUES(?,?,'Ayah',1,?)").run(
      waliId,
      siswaId,
      now()
    );
  }
  return siswaId;
}

const sudahAda = db.prepare('SELECT COUNT(*) c FROM siswa').get().c;
if (sudahAda === 0) {
  // Tiga siswa: satu untuk wali uji, dua lain supaya daftar absensi tidak
  // kosong dan tombol check-in pasti ada.
  siswaBaru('Aisyah Putri', wali.id);
  siswaBaru('Zahra Kamila', null);
  siswaBaru('Anindya Kirana', null);
}

// --- Tagihan periode uji (untuk ekspor CSV) ---
const PERIODE = '2026-09';
const siswaPertama = db.prepare('SELECT id FROM siswa ORDER BY id LIMIT 1').get();
if (siswaPertama && !db.prepare('SELECT 1 FROM tagihan WHERE periode=?').get(PERIODE)) {
  db.prepare(
    `INSERT INTO tagihan(siswa_id,cabang_id,jenjang_id,rombel_id,paket,tahun_ajaran,periode,jenis,nama,
      nominal_awal,diskon_amount,nominal_final,jatuh_tempo,status,created_by,created_at,updated_at)
     VALUES(?,?,?,?,'reguler','2026/2027',?,'spp','SPP September 2026',650000,0,650000,'2026-09-10','open',NULL,?,?)`
  ).run(siswaPertama.id, cabang.id, jenjang.id, rombel.id, PERIODE, now(), now());
}

console.log('[e2e-seed] data uji siap (guru1, wali 081200000000, 3 siswa, 1 tagihan)');
