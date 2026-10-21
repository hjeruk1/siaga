// PIN 6 angka untuk wali: gerbang tambahan sebelum aksi finansial
// (konfirmasi pembayaran, membaca rincian tagihan & riwayat bayar).
//
// Kenapa kolom terpisah di pengguna dan bukan di wali_profile: seluruh
// mekanisme auth (bcrypt, auth_version, throttling) sudah hidup di tabel
// pengguna, dan PIN memang milik akun, bukan milik "profil wali".
//
// Semua kolom aditif: tidak ada tabel anak yang mereferensikannya.
module.exports.up = (db) => {
  const kolom = db
    .prepare('PRAGMA table_info(pengguna)')
    .all()
    .map((c) => c.name);
  if (!kolom.includes('pin_hash')) db.exec('ALTER TABLE pengguna ADD COLUMN pin_hash TEXT');
  if (!kolom.includes('pin_failed_count'))
    db.exec('ALTER TABLE pengguna ADD COLUMN pin_failed_count INTEGER NOT NULL DEFAULT 0');
  if (!kolom.includes('pin_locked_until')) db.exec('ALTER TABLE pengguna ADD COLUMN pin_locked_until TEXT');
  if (!kolom.includes('pin_updated_at')) db.exec('ALTER TABLE pengguna ADD COLUMN pin_updated_at TEXT');
};

module.exports.down = (db) => {
  // SQLite < 3.35 tak bisa DROP COLUMN; kosongkan saja (aman, PIN mati).
  db.exec('UPDATE pengguna SET pin_hash=NULL, pin_failed_count=0, pin_locked_until=NULL, pin_updated_at=NULL');
};
