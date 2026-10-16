// Diskon siswa kembar: bersihkan, lalu kunci supaya tidak terulang.
//
// Latar: scripts/seed-demo.js memasukkan baris diskon DI DALAM loop periode
// (['2026-08','2026-09']). Karena diskon_siswa tidak punya kolom periode, tiap
// siswa yang memenuhi syarat mendapat DUA baris identik. Akibatnya:
//   - layar Billing menampilkan dua kartu kembar untuk satu diskon yang sama;
//   - discountTotal() MENJUMLAHKAN seluruh baris siswa+jenis, sehingga
//     generate tagihan berikutnya memberi potongan dobel (10% menjadi 20%).
//     Tagihan yang sudah ada selamat karena seed memakai variabel lokal per
//     periode, jadi kerusakannya baru muncul saat tagihan dibuat ulang.
//
// Index unique sengaja diletakkan di sini dan BUKAN di db.js: bootstrap db.js
// berjalan sebelum migrasi, jadi CREATE UNIQUE INDEX di sana akan gagal (dan
// menghentikan server) pada database yang masih mengandung baris kembar.
module.exports = {
  name: '003_dedupe_diskon_siswa',

  up(db) {
    // Baris dianggap kembar bila seluruh kolom identitasnya sama, TERMASUK
    // catatan. COALESCE dipakai karena SQLite menganggap NULL selalu berbeda di
    // unique index — tanpa itu, dua baris tanpa catatan justru lolos.
    // `nilai` tetap bagian dari identitas, jadi penumpukan yang sah seperti
    // "SPP 10% + SPP Rp 50.000" tidak ikut terhapus.
    db.exec(`
      DELETE FROM diskon_siswa
      WHERE aktif=1 AND id NOT IN (
        SELECT MIN(id) FROM diskon_siswa WHERE aktif=1
        GROUP BY siswa_id,cabang_id,tahun_ajaran,jenis,tipe,nilai,COALESCE(catatan,'')
      )
    `);

    // Pengaman: maksimal satu baris aktif per kombinasi identitas di atas.
    // Sifatnya partial (WHERE aktif=1) supaya baris yang sudah dinonaktifkan
    // tidak menghalangi pembuatan diskon baru dengan nilai yang sama.
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_diskon_siswa_kembar
      ON diskon_siswa(siswa_id,cabang_id,tahun_ajaran,jenis,tipe,nilai,COALESCE(catatan,''))
      WHERE aktif=1
    `);
  }
};
