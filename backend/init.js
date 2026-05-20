require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db');

const now = () => new Date().toISOString();

if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_PASSWORD) {
  console.error('ADMIN_PASSWORD wajib diset untuk init production.');
  process.exit(1);
}

const tables = [
  'invoice_item','invoice','pembayaran_alokasi','pembayaran','tagihan','diskon_siswa','biaya_tarif',
  'audit_log','notifikasi','laporan_comment','laporan_read','laporan_attachment','laporan_edit_log',
  'laporan_harian','absensi','kalender_event','operasional_config','penjemput','guru_rombel',
  'wali_siswa','siswa_enrollment','siswa','wali_profile','staff_profile','pengguna','rombel',
  'jenjang','cabang','sequence_counter'
];

db.exec('PRAGMA foreign_keys = OFF');
for (const table of tables) db.exec(`DROP TABLE IF EXISTS ${table}`);
db.exec('PRAGMA foreign_keys = ON');
delete require.cache[require.resolve('./db')];
const freshDb = require('./db');

const cabangSeed = [
  ['Godean', 'GDN'],
  ['Kentungan', 'KTG'],
  ['Nitikan', 'NTK'],
  ['Balong', 'BLG'],
  ['Solo', 'SLO']
];
const jenjangSeed = [
  ['KBA', 'KB A', 'sekolah', 1],
  ['KBB', 'KB B', 'sekolah', 2],
  ['TKA', 'TK A', 'sekolah', 3],
  ['TKB', 'TK B', 'sekolah', 4],
  ['CARE', 'Child and Baby Care', 'care', 5]
];

const insertCabang = freshDb.prepare('INSERT INTO cabang(nama,kode,created_at,updated_at) VALUES(?,?,?,?)');
for (const c of cabangSeed) insertCabang.run(c[0], c[1], now(), now());

const insertJenjang = freshDb.prepare('INSERT INTO jenjang(kode,nama,tipe,urutan) VALUES(?,?,?,?)');
for (const j of jenjangSeed) insertJenjang.run(j[0], j[1], j[2], j[3]);

const cabang = freshDb.prepare('SELECT * FROM cabang').all();
const jenjang = freshDb.prepare('SELECT * FROM jenjang ORDER BY urutan').all();
const insertRombel = freshDb.prepare('INSERT INTO rombel(cabang_id,jenjang_id,nama,created_at,updated_at) VALUES(?,?,?,?,?)');
const insertCfg = freshDb.prepare(`INSERT INTO operasional_config
  (cabang_id,jenjang_id,paket,jam_masuk,jam_pulang,hitung_terlambat,pakai_kalender,daily_record_wajib,daily_record_due_time,pickup_fleksibel)
  VALUES(?,?,?,?,?,?,?,?,?,?)`);
for (const cb of cabang) {
  for (const j of jenjang) {
    insertRombel.run(cb.id, j.id, j.nama, now(), now());
    if (j.tipe === 'care') {
      insertCfg.run(cb.id, j.id, 'care', '08:00', '16:00', 0, 0, 1, '18:00', 1);
    } else {
      insertCfg.run(cb.id, j.id, 'reguler', '08:00', '11:00', 1, 1, 1, '18:00', 0);
      insertCfg.run(cb.id, j.id, 'full_day', '08:00', '16:00', 1, 1, 1, '18:00', 0);
    }
  }
}

const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
const r = freshDb.prepare(`INSERT INTO pengguna
  (tipe,role,display_name,username,password_hash,status,must_change_password,created_at,updated_at)
  VALUES('staff','admin','Admin Pusat','admin',?,'undangan',1,?,?)`)
  .run(bcrypt.hashSync(adminPassword, 10), now(), now());
freshDb.prepare('INSERT INTO staff_profile(pengguna_id,cabang_id,jabatan) VALUES(?,?,?)')
  .run(r.lastInsertRowid, null, 'Admin Pusat');

console.log('\nSIAGA database initialized.');
console.log('Cabang: ' + cabangSeed.map(x => x[0]).join(', '));
console.log('Admin pusat: admin / ' + adminPassword);
if (!process.env.ADMIN_PASSWORD) console.log('DEV WARNING: using fallback admin password. Set ADMIN_PASSWORD for production.');
