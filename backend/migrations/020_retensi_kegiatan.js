// Retensi galeri: foto lama berhenti memakan disk tanpa menghilang dari wali.
//
// Masalahnya bukan "disk penuh" saja, tetapi bahwa satu-satunya jalan keluar
// sebelumnya adalah menghapus foto satu per satu. Padahal foto kegiatan dua
// tahun lalu hampir tidak pernah dibuka, sementara berkas 1280px-nya tetap
// memakan ~250 KB per foto. Migrasi ini memberi dua tingkat umur:
//
//   1. ARSIP  — berkas penuh dihapus, thumbnail 480px dipertahankan. Galeri
//               wali tetap menampilkan albumnya (dan masih bisa dilihat),
//               tetapi ~85% ruang kembali. Ini yang paling sering dipakai.
//   2. HAPUS  — baris + kedua berkas dibuang. Untuk sekolah yang memang tidak
//               menyimpan arsip jangka panjang.
//
// Kolom yang ditambahkan:
//   diarsipkan     penanda tingkat (0 = penuh, 1 = hanya thumbnail)
//   diarsipkan_at  kapan diarsipkan — supaya admin bisa menelusuri
//   ukuran_asli    ukuran berkas penuh SEBELUM diarsipkan. Tanpa ini, angka
//                  "sudah dihemat berapa" hilang setelah size_bytes dinolkan.
//   ukuran_thumb   ukuran thumbnail, agar penyimpanan terhitung jujur
//                  (size_bytes hanya menghitung berkas penuh yang tersisa)
//
// retensi_log menyimpan riwayat setiap kali kebijakan dijalankan. Job otomatis
// berjalan malam hari; tanpa catatan, admin hanya melihat "disk tiba-tiba lega"
// tanpa tahu apa yang dihapus.
const { addColumnIfMissing, hasTable } = require('./helpers');

module.exports.up = (db) => {
  addColumnIfMissing(db, 'kegiatan_foto', 'diarsipkan', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'kegiatan_foto', 'diarsipkan_at', 'TEXT');
  addColumnIfMissing(db, 'kegiatan_foto', 'ukuran_asli', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'kegiatan_foto', 'ukuran_thumb', 'INTEGER NOT NULL DEFAULT 0');

  if (!hasTable(db, 'retensi_log')) {
    db.exec(`CREATE TABLE retensi_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dijalankan_at TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('otomatis','manual')),
      foto_diarsip INTEGER NOT NULL DEFAULT 0,
      byte_diarsip INTEGER NOT NULL DEFAULT 0,
      foto_dihapus INTEGER NOT NULL DEFAULT 0,
      byte_dihapus INTEGER NOT NULL DEFAULT 0,
      berkas_yatim INTEGER NOT NULL DEFAULT 0,
      byte_yatim INTEGER NOT NULL DEFAULT 0,
      sisa INTEGER NOT NULL DEFAULT 0,
      oleh_pengguna_id INTEGER REFERENCES pengguna(id)
    )`);
    db.exec('CREATE INDEX idx_retensi_log_waktu ON retensi_log(dijalankan_at DESC)');
  }

  // Indeks untuk pencarian kandidat arsip/hapus: WHERE diarsipkan=? AND tanggal<?
  db.exec('CREATE INDEX IF NOT EXISTS idx_kegiatan_retensi ON kegiatan_foto(diarsipkan, tanggal)');
};

module.exports.down = (db) => {
  db.exec('DROP TABLE IF EXISTS retensi_log');
  db.exec('DROP INDEX IF EXISTS idx_kegiatan_retensi');
  // Kolom kegiatan_foto dibiarkan: SQLite < 3.35 tidak bisa DROP COLUMN, dan
  // kolom bertanda default 0 tidak mengubah perilaku aplikasi versi lama.
};
