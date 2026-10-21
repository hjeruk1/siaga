// Permintaan izin/sakit dari orang tua, menggantikan alur "kabari guru lewat
// WhatsApp lalu guru mengubah status manual".
//
// Tabel sendiri, bukan kolom di absensi: satu permintaan bisa mencakup beberapa
// hari, punya pengaju, punya keputusan (siapa, kapan, alasan penolakan), dan
// harus tetap ada sebagai riwayat walau absensinya kemudian berubah. Absensi
// hanya menyimpan HASIL akhirnya.
module.exports.up = (db) => {
  const ada = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='izin_request'").get();
  if (ada) return;
  db.exec(`
    CREATE TABLE izin_request (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      siswa_id INTEGER NOT NULL REFERENCES siswa(id) ON DELETE CASCADE,
      cabang_id INTEGER NOT NULL REFERENCES cabang(id),
      wali_pengguna_id INTEGER NOT NULL REFERENCES pengguna(id),
      jenis TEXT NOT NULL CHECK(jenis IN ('izin','sakit')),
      tanggal_mulai TEXT NOT NULL,
      tanggal_selesai TEXT NOT NULL,
      alasan TEXT NOT NULL,
      lampiran_url TEXT,
      status TEXT NOT NULL DEFAULT 'menunggu'
        CHECK(status IN ('menunggu','disetujui','ditolak','dibatalkan')),
      catatan_verifikator TEXT,
      verified_by INTEGER REFERENCES pengguna(id),
      verified_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  // Daftar per anak (portal wali) dan daftar per status (layar sekolah).
  db.exec('CREATE INDEX idx_izin_siswa ON izin_request(siswa_id, tanggal_mulai DESC)');
  db.exec('CREATE INDEX idx_izin_status ON izin_request(status, cabang_id)');
};

module.exports.down = (db) => {
  db.exec('DROP TABLE IF EXISTS izin_request');
};
