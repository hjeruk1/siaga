// Penanda idempotensi aksi absensi (lihat utils/idempotensi.js).
//
// Klien offline mengirim ulang aksi yang mungkin sudah diproses server. Tabel
// kecil ini menyimpan hasil pertama per client_id supaya pengiriman ulang tidak
// menimbulkan error palsu — dan tidak mengulang audit/notifikasi.
module.exports.up = (db) => {
  db.exec(`CREATE TABLE IF NOT EXISTS absensi_idempotensi (
    client_id TEXT PRIMARY KEY,
    aksi TEXT NOT NULL,
    hasil_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_idempotensi_created ON absensi_idempotensi(created_at)');
};

module.exports.down = (db) => {
  db.exec('DROP TABLE IF EXISTS absensi_idempotensi');
};
