// Status pemantauan sesi WhatsApp.
//
// Satu baris saja (id=1). Yang disimpan hanya keadaan terakhir, bukan riwayat
// panjang: tujuannya menjawab "sejak kapan putus" dan "sudah pernah diberi tahu
// belum", bukan menjadi arsip.
module.exports.up = (db) => {
  const ada = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='wa_monitor'").get();
  if (ada) return;
  db.exec(`
    CREATE TABLE wa_monitor (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      status TEXT NOT NULL DEFAULT 'belum-dicek',
      provider TEXT,
      pesan TEXT,
      terakhir_cek TEXT,
      terakhir_ok TEXT,
      gagal_beruntun INTEGER NOT NULL DEFAULT 0,
      terakhir_alert_at TEXT,
      terakhir_pulih_at TEXT
    )
  `);
  db.prepare('INSERT INTO wa_monitor(id,status) VALUES(1,?)').run('belum-dicek');
};

module.exports.down = (db) => {
  db.exec('DROP TABLE IF EXISTS wa_monitor');
};
