// Kode OTP untuk pemulihan password mandiri lewat WhatsApp.
//
// Tabel terpisah (bukan kolom di pengguna) karena setiap permintaan adalah
// peristiwa yang perlu diaudit: berapa kali orang tua minta kode, dari IP mana,
// dan apakah kodenya pernah dipakai. Kalau hanya satu kolom, riwayat itu hilang
// dan keluhan "saya tidak pernah minta kode" tak bisa dijawab.
//
// kode_hash disimpan bcrypt, BUKAN plaintext: kalau database bocor, kode yang
// masih berlaku tidak bisa dipakai untuk mengambil alih akun.
const { hasTable } = require('./helpers');

module.exports.up = (db) => {
  if (hasTable(db, 'reset_otp')) return;
  db.exec(`
    CREATE TABLE reset_otp (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pengguna_id INTEGER NOT NULL REFERENCES pengguna(id) ON DELETE CASCADE,
      kode_hash TEXT NOT NULL,
      tujuan TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      percobaan INTEGER NOT NULL DEFAULT 0,
      terpakai_at TEXT,
      dibuat_at TEXT NOT NULL,
      ip TEXT
    )
  `);
  // Pencarian utama: kode terbaru yang masih berlaku milik satu akun.
  db.exec('CREATE INDEX idx_reset_otp_pengguna ON reset_otp(pengguna_id, dibuat_at DESC)');
  // Pembersihan berkala baris lama.
  db.exec('CREATE INDEX idx_reset_otp_dibuat ON reset_otp(dibuat_at)');
};

module.exports.down = (db) => {
  db.exec('DROP TABLE IF EXISTS reset_otp');
};
