// Mencatat apakah sebuah notifikasi juga dikirim lewat WhatsApp, dan kenapa
// tidak. Tanpa kolom ini, notifikasi WA tidak bisa diaudit: orang tua bisa
// berkata "tidak pernah dapat kabar" dan kita tak punya cara memastikan.
//
// Kolom aditif + indeks parsial untuk audit gagal (baris wa_error IS NOT NULL
// hanya sedikit, sehingga indeks kecil dan murah).
module.exports.up = (db) => {
  const kolom = db
    .prepare('PRAGMA table_info(notifikasi)')
    .all()
    .map((c) => c.name);
  if (!kolom.includes('wa_sent_at')) db.exec('ALTER TABLE notifikasi ADD COLUMN wa_sent_at TEXT');
  if (!kolom.includes('wa_error')) db.exec('ALTER TABLE notifikasi ADD COLUMN wa_error TEXT');
};

module.exports.down = (db) => {
  // SQLite < 3.35 tidak bisa DROP COLUMN; kosongkan saja (aman).
  const kolom = db
    .prepare('PRAGMA table_info(notifikasi)')
    .all()
    .map((c) => c.name);
  if (kolom.includes('wa_error')) db.exec('UPDATE notifikasi SET wa_error=NULL');
  if (kolom.includes('wa_sent_at')) db.exec('UPDATE notifikasi SET wa_sent_at=NULL');
};
