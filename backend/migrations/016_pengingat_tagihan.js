// Pengingat tagihan otomatis.
//
// Sebelum ini tabel tagihan tidak punya tanggal jatuh tempo sama sekali:
// tagihan hanya tahu "periode" (YYYY-MM), jadi tidak ada dasar untuk mengingatkan
// orang tua. Migrasi ini menambahkan tiga hal:
//
//   1. tagihan.jatuh_tempo  — tanggal jatuh tempo per tagihan (YYYY-MM-DD).
//   2. setelan              — penyimpanan kunci/nilai sederhana untuk kebijakan
//                             pengingat (aktif, tanggal, H-berapa, jam kirim).
//                             Tabel baru, bukan operasional_config: tabel itu
//                             berkunci (cabang, jenjang, paket) — bentuk yang
//                             salah untuk kebijakan tingkat sekolah.
//   3. tagihan_pengingat    — catatan pengingat yang SUDAH terkirim.
//                             UNIQUE(tagihan_id, jenis_ingat) inilah yang
//                             mencegah orang tua menerima pesan yang sama
//                             berkali-kali setiap hari.
//
// Baris lama diisi jatuh tempo dari periodenya (tanggal 10) supaya tagihan yang
// sudah berjalan ikut terlindungi. Tagihan tanpa periode dibiarkan NULL —
// pengingat melewatinya daripada menebak tanggal.
const { addColumnIfMissing, hasTable } = require('./helpers');

const TANGGAL_DEFAULT = 10;

module.exports.up = (db) => {
  addColumnIfMissing(db, 'tagihan', 'jatuh_tempo', 'TEXT');

  if (!hasTable(db, 'setelan')) {
    db.exec(`CREATE TABLE setelan (
      kunci TEXT PRIMARY KEY,
      nilai TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
  }

  if (!hasTable(db, 'tagihan_pengingat')) {
    db.exec(`CREATE TABLE tagihan_pengingat (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tagihan_id INTEGER NOT NULL REFERENCES tagihan(id) ON DELETE CASCADE,
      jenis_ingat TEXT NOT NULL CHECK(jenis_ingat IN ('h_sebelum','jatuh_tempo','terlambat')),
      pengguna_id INTEGER REFERENCES pengguna(id),
      status TEXT NOT NULL CHECK(status IN ('terkirim','gagal')),
      pesan_error TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(tagihan_id, jenis_ingat)
    )`);
    db.exec('CREATE INDEX idx_pengingat_created ON tagihan_pengingat(created_at)');
  }

  // Backfill: periode 'YYYY-MM' + tanggal default, dibatasi akhir bulan
  // (tanggal 31 di bulan 30 hari harus jadi 30, bukan tanggal invalid).
  const rows = db.prepare('SELECT id, periode FROM tagihan WHERE jatuh_tempo IS NULL AND periode IS NOT NULL').all();
  const update = db.prepare('UPDATE tagihan SET jatuh_tempo=? WHERE id=?');
  for (const r of rows) {
    const [tahun, bulan] = String(r.periode).split('-').map(Number);
    if (!tahun || !bulan) continue;
    const akhirBulan = new Date(Date.UTC(tahun, bulan, 0)).getUTCDate();
    const hari = Math.min(TANGGAL_DEFAULT, akhirBulan);
    update.run(`${r.periode}-${String(hari).padStart(2, '0')}`, r.id);
  }
};

module.exports.down = (db) => {
  db.exec('DROP TABLE IF EXISTS tagihan_pengingat');
  db.exec('DROP TABLE IF EXISTS setelan');
  // Kolom jatuh_tempo dibiarkan: SQLite < 3.35 tidak bisa DROP COLUMN, dan
  // menghapusnya tidak diperlukan untuk rollback fungsional.
};
