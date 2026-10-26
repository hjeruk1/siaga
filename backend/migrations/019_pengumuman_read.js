// Catatan pengumuman yang sudah dibaca wali.
//
// Kenapa perlu: pengumuman terkirim bukan berarti terbaca. Untuk pesan penting
// ("besok libur", "besok bawa seragam olahraga") pertanyaan admin selalu sama —
// siapa yang belum tahu. Sebelum ini jawabannya tidak ada.
//
// Tabel terpisah, bukan kolom di `pengumuman`: satu pengumuman dibaca banyak
// wali, jadi relasinya banyak-ke-banyak. Pola yang sama dipakai `laporan_read`.
module.exports.up = (db) => {
  db.exec(`CREATE TABLE IF NOT EXISTS pengumuman_read (
    pengumuman_id INTEGER NOT NULL REFERENCES pengumuman(id) ON DELETE CASCADE,
    pengguna_id INTEGER NOT NULL REFERENCES pengguna(id) ON DELETE CASCADE,
    read_at TEXT NOT NULL,
    PRIMARY KEY (pengumuman_id, pengguna_id)
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_pengumuman_read_pengguna ON pengumuman_read(pengguna_id)');
};

module.exports.down = (db) => {
  db.exec('DROP TABLE IF EXISTS pengumuman_read');
};
