// Index untuk query yang terbukti lambat.
//
// Setiap index di bawah ini ditambahkan setelah menelusuri pola query yang
// sebenarnya di routes/ — bukan dugaan. Yang sengaja TIDAK ditambahkan:
//
// - absensi(siswa_id, tanggal): sudah ada lewat UNIQUE(siswa_id,tanggal) di
//   db.js, dan itu justru query terpanas (check-in, tap pulang, scan penjemput).
// - absensi(tanggal, cabang_id): tidak ada satu pun query yang memfilter absensi
//   hanya dengan cabang_id. Index ini akan memakan waktu tulis tanpa dipakai.
// - tagihan(siswa_id, cabang_id, status): UNIQUE(siswa_id,cabang_id,...) sudah
//   menutupi prefix siswa_id+cabang_id; sisa barisnya sedikit.
// - guru_rombel / wali_siswa: tabelnya kecil dan UNIQUE-nya sudah menutupi
//   kolom yang dipakai join.
module.exports = {
  name: '002_add_hot_query_indexes',

  up(db) {
    // audit_log — GET /api/master/audit-log melakukan ORDER BY created_at DESC
    // tanpa index apa pun, sehingga SQLite memindai lalu mengurutkan SELURUH
    // tabel setiap kali tab Audit dibuka. Tabel ini bertambah pada setiap mutasi.
    db.exec('CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_audit_log_cabang_created ON audit_log(cabang_id, created_at)');

    // pembayaran_alokasi — tabel ini sebelumnya HANYA punya primary key, padahal
    // kedua kolomnya dipakai sebagai subquery korelatif yang dijalankan PER BARIS
    // hasil di daftar tagihan dan daftar pembayaran:
    //   (SELECT SUM(pa.nominal) FROM pembayaran_alokasi pa WHERE pa.tagihan_id=t.id ...)
    //   (SELECT SUM(pa.nominal) FROM pembayaran_alokasi pa WHERE pa.pembayaran_id=p.id)
    // Tanpa index, menampilkan 1000 baris berarti 1000 pemindaian penuh.
    db.exec('CREATE INDEX IF NOT EXISTS idx_alokasi_pembayaran ON pembayaran_alokasi(pembayaran_id)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_alokasi_tagihan ON pembayaran_alokasi(tagihan_id)');

    // tagihan & pembayaran — daftar difilter per cabang dan diurutkan created_at.
    // UNIQUE tagihan diawali siswa_id, jadi filter cabang saja tidak bisa memakainya.
    db.exec('CREATE INDEX IF NOT EXISTS idx_tagihan_cabang_created ON tagihan(cabang_id, created_at)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_pembayaran_cabang_created ON pembayaran(cabang_id, created_at)');

    // absensi — rekap/ekspor per kelas memakai rentang tanggal per rombel:
    //   SELECT * FROM absensi WHERE rombel_id=? AND tanggal>=? AND tanggal<=?
    // UNIQUE(siswa_id,tanggal) tidak membantu karena kolom depannya siswa_id.
    db.exec('CREATE INDEX IF NOT EXISTS idx_absensi_rombel_tanggal ON absensi(rombel_id, tanggal)');
  }
};
