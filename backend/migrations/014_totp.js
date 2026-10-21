// Verifikasi dua faktor (TOTP) untuk akun staff.
//
// Kenapa di pengguna, bukan tabel terpisah: satu akun satu rahasia. Kolom
// terpisah akan menambah JOIN di jalur login — jalur paling panas dan paling
// sering disentuh penyerang.
//
// Semua kolom aditif; akun lama langsung jalan tanpa 2FA sampai pemiliknya
// mengaktifkannya sendiri.
//
// totp_last_step: langkah waktu (30 detik) dari kode TERAKHIR yang diterima.
// Ini replay protection — tanpanya, kode yang terlihat orang lain bisa dipakai
// ulang sampai 30 detik habis.
module.exports.up = (db) => {
  const kolom = db
    .prepare('PRAGMA table_info(pengguna)')
    .all()
    .map((c) => c.name);
  if (!kolom.includes('totp_secret')) db.exec('ALTER TABLE pengguna ADD COLUMN totp_secret TEXT');
  if (!kolom.includes('totp_aktif')) db.exec('ALTER TABLE pengguna ADD COLUMN totp_aktif INTEGER NOT NULL DEFAULT 0');
  // Daftar hash SHA-256 kode pemulihan (JSON array). Kosong = belum dibuat.
  if (!kolom.includes('totp_recovery')) db.exec('ALTER TABLE pengguna ADD COLUMN totp_recovery TEXT');
  if (!kolom.includes('totp_failed_count'))
    db.exec('ALTER TABLE pengguna ADD COLUMN totp_failed_count INTEGER NOT NULL DEFAULT 0');
  if (!kolom.includes('totp_locked_until')) db.exec('ALTER TABLE pengguna ADD COLUMN totp_locked_until TEXT');
  if (!kolom.includes('totp_last_step')) db.exec('ALTER TABLE pengguna ADD COLUMN totp_last_step INTEGER');
  if (!kolom.includes('totp_updated_at')) db.exec('ALTER TABLE pengguna ADD COLUMN totp_updated_at TEXT');
};

module.exports.down = (db) => {
  // SQLite < 3.35 tak bisa DROP COLUMN; matikan saja (2FA nonaktif).
  db.exec(
    'UPDATE pengguna SET totp_secret=NULL, totp_aktif=0, totp_recovery=NULL, totp_failed_count=0, totp_locked_until=NULL, totp_last_step=NULL, totp_updated_at=NULL'
  );
};
