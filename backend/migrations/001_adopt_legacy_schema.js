const { addColumnIfMissing, hasColumn } = require('./helpers');

// Migrasi adopsi.
//
// Sebelum ini, penyesuaian skema dilakukan lewat ~45 blok `try { ALTER TABLE }
// catch {}` di akhir db.js. Pola itu menelan SEMUA error (termasuk yang nyata
// seperti database terkunci), dijalankan ulang setiap kali server boot, dan
// tidak meninggalkan catatan apa pun tentang versi skema.
//
// Migrasi ini memindahkan seluruh penyesuaian tersebut ke sistem migrasi resmi.
// Sifatnya idempoten: pada database yang sudah memilikinya, tidak ada yang
// berubah; pada database lama, kolom yang hilang ditambahkan.
module.exports = {
  name: '001_adopt_legacy_schema',

  up(db) {
    // siswa & pengguna
    addColumnIfMissing(db, 'siswa', 'catatan_sekolah_luar', 'TEXT');
    addColumnIfMissing(db, 'pengguna', 'auth_version', 'INTEGER NOT NULL DEFAULT 0');

    // penjemputan_log
    addColumnIfMissing(db, 'penjemputan_log', 'absensi_id', 'INTEGER REFERENCES absensi(id) ON DELETE CASCADE');
    addColumnIfMissing(db, 'penjemputan_log', 'siswa_id', 'INTEGER REFERENCES siswa(id)');
    addColumnIfMissing(db, 'penjemputan_log', 'penjemput_id', 'INTEGER REFERENCES penjemput(id)');
    addColumnIfMissing(db, 'penjemputan_log', 'guru_id', 'INTEGER REFERENCES pengguna(id)');
    addColumnIfMissing(db, 'penjemputan_log', 'cabang_id', 'INTEGER REFERENCES cabang(id)');
    addColumnIfMissing(db, 'penjemputan_log', 'tanggal', 'TEXT');
    addColumnIfMissing(db, 'penjemputan_log', 'jam_scan', 'TEXT');
    addColumnIfMissing(db, 'penjemputan_log', 'jam_pulang', 'TEXT');
    addColumnIfMissing(db, 'penjemputan_log', 'durasi_menit', 'INTEGER');
    addColumnIfMissing(db, 'penjemputan_log', 'sumber', "TEXT NOT NULL DEFAULT 'manual'");
    addColumnIfMissing(db, 'penjemputan_log', 'catatan', 'TEXT');
    addColumnIfMissing(db, 'penjemputan_log', 'created_at', 'TEXT');

    // qr_reissue_log
    addColumnIfMissing(db, 'qr_reissue_log', 'siswa_id', 'INTEGER REFERENCES siswa(id)');
    addColumnIfMissing(db, 'qr_reissue_log', 'penjemput_id', 'INTEGER REFERENCES penjemput(id)');
    addColumnIfMissing(db, 'qr_reissue_log', 'admin_id', 'INTEGER REFERENCES pengguna(id)');
    addColumnIfMissing(db, 'qr_reissue_log', 'cabang_id', 'INTEGER REFERENCES cabang(id)');
    addColumnIfMissing(db, 'qr_reissue_log', 'old_qr_code', 'TEXT');
    addColumnIfMissing(db, 'qr_reissue_log', 'new_qr_code', 'TEXT');
    addColumnIfMissing(db, 'qr_reissue_log', 'reason', 'TEXT');
    addColumnIfMissing(db, 'qr_reissue_log', 'created_at', 'TEXT');

    // nfc_scan_log
    addColumnIfMissing(db, 'nfc_scan_log', 'pengguna_id', 'INTEGER REFERENCES pengguna(id)');
    addColumnIfMissing(db, 'nfc_scan_log', 'cabang_id', 'INTEGER REFERENCES cabang(id)');
    addColumnIfMissing(db, 'nfc_scan_log', 'siswa_id', 'INTEGER REFERENCES siswa(id)');
    addColumnIfMissing(db, 'nfc_scan_log', 'action', 'TEXT');
    addColumnIfMissing(db, 'nfc_scan_log', 'status', 'TEXT');
    addColumnIfMissing(db, 'nfc_scan_log', 'reason', 'TEXT');
    addColumnIfMissing(db, 'nfc_scan_log', 'token_masked', 'TEXT');
    addColumnIfMissing(db, 'nfc_scan_log', 'tab', 'TEXT');
    addColumnIfMissing(db, 'nfc_scan_log', 'tanggal', 'TEXT');
    addColumnIfMissing(db, 'nfc_scan_log', 'jam', 'TEXT');
    addColumnIfMissing(db, 'nfc_scan_log', 'created_at', 'TEXT');

    // laporan_harian
    addColumnIfMissing(db, 'laporan_harian', 'focus_theme_id', 'INTEGER REFERENCES focus_theme(id)');
    addColumnIfMissing(db, 'laporan_harian', 'observation_domain', 'TEXT');
    addColumnIfMissing(db, 'laporan_harian', 'observation_note', 'TEXT');
    addColumnIfMissing(db, 'laporan_harian', 'parent_note', 'TEXT');
    addColumnIfMissing(db, 'laporan_harian', 'structured_observation_json', "TEXT NOT NULL DEFAULT '{}'");

    // focus_theme
    addColumnIfMissing(db, 'focus_theme', 'menu_makanan', 'TEXT');

    // Index yang menyertai kolom di atas.
    db.exec('CREATE INDEX IF NOT EXISTS idx_penjemputan_log_tanggal ON penjemputan_log(tanggal,cabang_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_nfc_scan_log_tanggal ON nfc_scan_log(tanggal,cabang_id,status)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_laporan_focus_theme ON laporan_harian(focus_theme_id)');

    // Backfill data yang dulu dijalankan ulang setiap boot. Sebagai migrasi,
    // ini berjalan tepat sekali.
    //
    // Kolom guru_id hanya ada di database lama (kini digantikan pengguna_id).
    // Pada database baru kolom itu tidak pernah dibuat. Versi lama di db.js
    // menelan error "no such column: guru_id" ini diam-diam di setiap boot —
    // persis jenis kegagalan yang membuat blok try/catch itu berbahaya.
    if (hasColumn(db, 'nfc_scan_log', 'guru_id')) {
      db.prepare('UPDATE nfc_scan_log SET pengguna_id=COALESCE(pengguna_id,guru_id) WHERE guru_id IS NOT NULL').run();
    }
  }
};
