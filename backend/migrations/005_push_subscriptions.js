// Web Push: simpan subscription browser per pengguna (orang tua) supaya server
// bisa mengirim notifikasi walau aplikasi tidak sedang dibuka — inilah nilai
// utama PWA yang dipasang ke homescreen.
//
// Satu pengguna boleh punya banyak subscription (HP + tablet + browser laptop),
// jadi endpoint di-UNIQUE saja: resubscribe dari perangkat yang sama akan
// memperbarui kunci lama, bukan membuat baris kembar.
module.exports.up = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS push_subscription (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pengguna_id INTEGER NOT NULL REFERENCES pengguna(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      user_agent TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_push_sub_pengguna
      ON push_subscription(pengguna_id)
  `);
};

module.exports.down = (db) => {
  db.exec('DROP INDEX IF EXISTS idx_push_sub_pengguna');
  db.exec('DROP TABLE IF EXISTS push_subscription');
};
