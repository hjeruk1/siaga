// Longgarkan pilihan mood pada laporan_harian: CHECK lama hanya
// ceria/biasa/rewel, terasa terbatas untuk catatan harian PAUD.
//
// SQLite tidak bisa mengubah CHECK tanpa membangun ulang tabel, dan
// laporan_harian dirujuk 4 tabel anak dengan ON DELETE CASCADE
// (laporan_edit_log, laporan_attachment, laporan_read, laporan_comment).
// Maka urutannya dibuat supaya tidak ada tabel induk yang dihapus selagi
// masih dirujuk anak — dengan begitu aman dijalankan di dalam transaksi
// bawaan runner migrasi (PRAGMA foreign_keys tetap ON):
//   1. buat laporan_harian_new dengan CHECK mood baru, salin data (kolom
//      disebut eksplisit karena urutan kolom DB lama vs baru berbeda),
//   2. ganti nama lama -> _old (SQLite otomatis memindahkan REFERENCES
//      anak ke _old, tanpa hapus data),
//   3. ganti nama new -> laporan_harian,
//   4. bangun ulang 4 tabel anak agar REFERENCES menunjuk laporan_harian
//      yang baru (data anak tetap utuh),
//   5. hapus laporan_harian_old (tidak dirujuk siapa pun lagi).
module.exports.up = (db) => {
  const KOLOM_PARENT = `id,siswa_id,cabang_id,jenjang_id,rombel_id,paket,tanggal,guru_id,status,mood,makan,tidur,aktivitas,catatan,published_at,last_published_change_at,created_at,updated_at,focus_theme_id,observation_domain,observation_note,parent_note,structured_observation_json`;

  // 1-2. Tabel pengganti + salin data.
  db.exec(`
    CREATE TABLE laporan_harian_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      siswa_id INTEGER NOT NULL REFERENCES siswa(id),
      cabang_id INTEGER NOT NULL REFERENCES cabang(id),
      jenjang_id INTEGER NOT NULL REFERENCES jenjang(id),
      rombel_id INTEGER NOT NULL REFERENCES rombel(id),
      paket TEXT NOT NULL,
      tanggal TEXT NOT NULL,
      guru_id INTEGER REFERENCES pengguna(id),
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
      mood TEXT CHECK(mood IN ('ceria','tenang','biasa','mengantuk','manja','rewel')),
      makan TEXT CHECK(makan IN ('habis','setengah','tidak')),
      tidur INTEGER,
      aktivitas TEXT NOT NULL DEFAULT '[]',
      catatan TEXT,
      published_at TEXT,
      last_published_change_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      focus_theme_id INTEGER REFERENCES focus_theme(id),
      observation_domain TEXT,
      observation_note TEXT,
      parent_note TEXT,
      structured_observation_json TEXT NOT NULL DEFAULT '{}',
      UNIQUE(siswa_id,tanggal)
    );
    INSERT INTO laporan_harian_new (${KOLOM_PARENT})
      SELECT ${KOLOM_PARENT} FROM laporan_harian;
  `);

  // 3-4. Tukar nama; anak otomatis menunjuk _old, lalu dibangun ulang.
  db.exec(`ALTER TABLE laporan_harian RENAME TO laporan_harian_old;`);
  db.exec(`ALTER TABLE laporan_harian_new RENAME TO laporan_harian;`);

  db.exec(`
    CREATE TABLE laporan_edit_log_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      laporan_id INTEGER NOT NULL REFERENCES laporan_harian(id) ON DELETE CASCADE,
      pengguna_id INTEGER REFERENCES pengguna(id),
      perubahan TEXT NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL
    );
    INSERT INTO laporan_edit_log_new (id,laporan_id,pengguna_id,perubahan,reason,created_at)
      SELECT id,laporan_id,pengguna_id,perubahan,reason,created_at FROM laporan_edit_log;
    DROP TABLE laporan_edit_log;
    ALTER TABLE laporan_edit_log_new RENAME TO laporan_edit_log;

    CREATE TABLE laporan_attachment_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      laporan_id INTEGER NOT NULL REFERENCES laporan_harian(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      filename TEXT NOT NULL,
      size_bytes INTEGER,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES pengguna(id),
      created_at TEXT NOT NULL
    );
    INSERT INTO laporan_attachment_new (id,laporan_id,url,filename,size_bytes,sort_order,created_by,created_at)
      SELECT id,laporan_id,url,filename,size_bytes,sort_order,created_by,created_at FROM laporan_attachment;
    DROP TABLE laporan_attachment;
    ALTER TABLE laporan_attachment_new RENAME TO laporan_attachment;

    CREATE TABLE laporan_read_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      laporan_id INTEGER NOT NULL REFERENCES laporan_harian(id) ON DELETE CASCADE,
      wali_pengguna_id INTEGER NOT NULL REFERENCES pengguna(id) ON DELETE CASCADE,
      read_at TEXT NOT NULL,
      UNIQUE(laporan_id,wali_pengguna_id)
    );
    INSERT INTO laporan_read_new (id,laporan_id,wali_pengguna_id,read_at)
      SELECT id,laporan_id,wali_pengguna_id,read_at FROM laporan_read;
    DROP TABLE laporan_read;
    ALTER TABLE laporan_read_new RENAME TO laporan_read;

    CREATE TABLE laporan_comment_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      laporan_id INTEGER NOT NULL REFERENCES laporan_harian(id) ON DELETE CASCADE,
      siswa_id INTEGER NOT NULL REFERENCES siswa(id),
      cabang_id INTEGER NOT NULL REFERENCES cabang(id),
      author_pengguna_id INTEGER NOT NULL REFERENCES pengguna(id),
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    INSERT INTO laporan_comment_new (id,laporan_id,siswa_id,cabang_id,author_pengguna_id,body,created_at)
      SELECT id,laporan_id,siswa_id,cabang_id,author_pengguna_id,body,created_at FROM laporan_comment;
    DROP TABLE laporan_comment;
    ALTER TABLE laporan_comment_new RENAME TO laporan_comment;
  `);

  // 5. Tabel lama sudah tidak dirujuk siapa pun — aman dihapus.
  db.exec(`DROP TABLE laporan_harian_old;`);

  // Index lama ikut terhapus bersama tabel lamanya; dibuat ulang.
  db.exec(`CREATE INDEX IF NOT EXISTS idx_laporan_focus_theme ON laporan_harian(focus_theme_id);`);
};
