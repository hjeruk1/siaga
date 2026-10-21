// Pengumuman sekolah: satu pesan untuk semua orang tua, bukan satu per satu.
//
// Sebelumnya pengumuman dikirim lewat grup WhatsApp atau selebaran. Di aplikasi
// tidak ada jejaknya, dan orang tua yang tidak sempat membaca grup kehilangan
// informasi (mis. perubahan jam pulang atau hari libur mendadak).
//
// Tabel sendiri, bukan notifikasi biasa: pengumuman punya pengirim, isi panjang,
// dan jumlah penerima yang perlu bisa diaudit. Notifikasi adalah SALURAN
// pengirimannya (satu baris per orang tua).
module.exports.up = (db) => {
  const ada = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='pengumuman'").get();
  if (ada) return;
  db.exec(`
    CREATE TABLE pengumuman (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cabang_id INTEGER REFERENCES cabang(id),
      lingkup TEXT NOT NULL CHECK(lingkup IN ('cabang','semua')),
      judul TEXT NOT NULL,
      isi TEXT NOT NULL,
      penting INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'mengirim' CHECK(status IN ('mengirim','terkirim')),
      jumlah_penerima INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES pengguna(id),
      created_at TEXT NOT NULL,
      sent_at TEXT
    )
  `);
  db.exec('CREATE INDEX idx_pengumuman_cabang ON pengumuman(cabang_id, created_at DESC)');
  db.exec('CREATE INDEX idx_pengumuman_waktu ON pengumuman(created_at DESC)');
};

module.exports.down = (db) => {
  db.exec('DROP TABLE IF EXISTS pengumuman');
};
