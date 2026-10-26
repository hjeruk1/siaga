// Galeri foto kegiatan per rombel.
//
// Kenapa per rombel, bukan per siswa: foto kegiatan selalu tentang kelas
// (menari, kunjungan, makan bersama), dan menyimpan satu baris per anak akan
// menggandakan berkas yang sama 15 kali. Rombel juga satu-satunya kunci yang
// membuat pembatasan akses masuk akal: wali melihat kelas anaknya, bukan
// seluruh sekolah.
//
// Kolom `judul` berfungsi sebagai nama album. Foto yang diunggah bersamaan
// dengan judul + tanggal yang sama otomatis tampil sebagai satu album — tidak
// perlu tabel album terpisah untuk kebutuhan sekecil ini.
//
// `thumb_url` disimpan terpisah karena grid galeri memuat puluhan foto
// sekaligus; mengirim versi 1280px untuk setiap kotak 200px membuat halaman
// wali berat di jaringan seluler.
module.exports.up = (db) => {
  db.exec(`CREATE TABLE IF NOT EXISTS kegiatan_foto (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cabang_id INTEGER NOT NULL REFERENCES cabang(id),
    rombel_id INTEGER NOT NULL REFERENCES rombel(id),
    tanggal TEXT NOT NULL,
    judul TEXT NOT NULL,
    keterangan TEXT,
    url TEXT NOT NULL,
    thumb_url TEXT NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES pengguna(id),
    created_at TEXT NOT NULL
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_kegiatan_rombel ON kegiatan_foto(rombel_id, tanggal DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_kegiatan_cabang ON kegiatan_foto(cabang_id, tanggal DESC)');
};

module.exports.down = (db) => {
  db.exec('DROP TABLE IF EXISTS kegiatan_foto');
};
