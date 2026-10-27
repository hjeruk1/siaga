// Kepemilikan sesi open-wa yang belum disimpan sebagai akun.
//
// Sebelum ini, sesi baru hanya hidup di instance OpenWA: rute POST /api/wa/sesi
// memeriksa cabang_id, tetapi tidak mencatat sesi itu milik cabang mana.
// Akibatnya rute lanjutan (detail, start, QR, pairing) tidak punya dasar untuk
// memeriksa hak akses, dan admin cabang bisa membuka QR sesi cabang lain.
// QR adalah kredensial hidup, jadi kepemilikan harus tercatat sejak sesi
// dibuat, bukan baru saat sesi disimpan sebagai akun.
//
// Baris pending dihapus saat sesi disimpan (simpanSebagaiAkun) atau dihapus
// dari instance. Sesi lama tanpa baris pending hanya bisa dikelola admin
// pusat sampai ia menyimpannya sebagai akun.
const { hasTable } = require('./helpers');

module.exports.up = (db) => {
  if (!hasTable(db, 'wa_sesi_pending')) {
    db.exec(`CREATE TABLE wa_sesi_pending (
      session_id TEXT PRIMARY KEY,
      cabang_id INTEGER REFERENCES cabang(id),
      dibuat_oleh INTEGER REFERENCES pengguna(id),
      created_at TEXT NOT NULL
    )`);
    db.exec('CREATE INDEX idx_wa_sesi_pending_cabang ON wa_sesi_pending(cabang_id)');
  }
};

module.exports.down = (db) => {
  db.exec('DROP TABLE IF EXISTS wa_sesi_pending');
};
