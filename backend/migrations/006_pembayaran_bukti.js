// Bukti pembayaran yang diunggah wali (foto struk/transfer).
//
// Kolom aditif: pembayaran sudah punya status pending_verification + verified_by,
// jadi cukup satu kolom path berkas untuk melengkapi alur "wali kirim bukti ->
// bendahara verifikasi". ALTER TABLE aditif aman tanpa rebuild (tidak ada
// tabel anak yang mereferensikan kolom ini).
module.exports.up = (db) => {
  const kolom = db
    .prepare('PRAGMA table_info(pembayaran)')
    .all()
    .map((c) => c.name);
  if (!kolom.includes('bukti_path')) {
    db.exec('ALTER TABLE pembayaran ADD COLUMN bukti_path TEXT');
  }
};

module.exports.down = (db) => {
  // SQLite < 3.35 tidak bisa DROP COLUMN; biarkan kolom kosong (aman).
  const kolom = db
    .prepare('PRAGMA table_info(pembayaran)')
    .all()
    .map((c) => c.name);
  if (kolom.includes('bukti_path')) {
    db.exec('UPDATE pembayaran SET bukti_path=NULL');
  }
};
