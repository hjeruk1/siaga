// Akun WhatsApp per cabang.
//
// Satu nomor pusat untuk lima cabang membuat orang tua Solo menerima pesan dari
// nomor Godean, dan balasan mereka menumpuk di satu tempat. Tabel ini memetakan
// cabang -> akun pengirim.
//
// `provider` disimpan PER AKUN, bukan global: satu cabang boleh memakai open-wa
// sementara cabang lain pindah ke gateway resmi tanpa mengubah kode. Itu penting
// karena open-wa berisiko diblokir — kalau nanti salah satu nomor kena, pindah
// provider cukup satu baris di sini.
//
// cabang_id NULL = akun pusat/cadangan: dipakai bila cabang belum punya nomor.
// Tanpa cadangan, pesan ke cabang yang belum dikonfigurasi tidak dikirim sama
// sekali (lebih baik diam daripada mengirim dari nomor yang salah).
//
// Kredensial disimpan TERENKRIPSI (lihat utils/wa-akun.js): backup database
// ikut diunggah ke cloud, jadi token plaintext di DB = token bocor.
module.exports.up = (db) => {
  const ada = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='wa_akun'").get();
  if (!ada) {
    db.exec(`
      CREATE TABLE wa_akun (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cabang_id INTEGER REFERENCES cabang(id),
        label TEXT NOT NULL,
        provider TEXT NOT NULL CHECK(provider IN ('openwa','gateway')),
        nomor TEXT,
        api_url TEXT,
        api_key TEXT,
        gateway_url TEXT,
        gateway_token TEXT,
        aktif INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    // Satu akun per cabang. Baris cabang_id NULL (cadangan) tidak dibatasi,
    // tetapi aplikasi hanya memakai yang pertama aktif.
    db.exec('CREATE UNIQUE INDEX idx_wa_akun_cabang ON wa_akun(cabang_id) WHERE cabang_id IS NOT NULL');
  }

  const adaMonitor = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='wa_monitor_akun'").get();
  if (!adaMonitor) {
    // Keadaan pemantauan per akun. Tabel wa_monitor yang lama tetap dipakai
    // untuk mode satu-nomor (belum ada akun terdaftar).
    db.exec(`
      CREATE TABLE wa_monitor_akun (
        akun_id INTEGER PRIMARY KEY REFERENCES wa_akun(id) ON DELETE CASCADE,
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
  }
};

module.exports.down = (db) => {
  db.exec('DROP TABLE IF EXISTS wa_monitor_akun');
  db.exec('DROP TABLE IF EXISTS wa_akun');
};
