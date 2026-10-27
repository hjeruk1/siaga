// Route billing — berkas ini hanya memasang modul.
//
// Dulu satu berkas 2.389 baris memuat tarif sampai kuitansi PDF. Sekarang tiap
// kelompok punya berkas sendiri, dan yang tersisa di sini cuma urutan
// pemasangan. Alasannya bukan kerapian semata: seluruh route ini menyentuh
// uang, dan berkas 2.000 baris membuat satu perubahan kecil di alokasi
// pembayaran harus dibaca bersama tata letak PDF dan unggah bukti transfer.
//
//   tarif        tarif per jenjang + diskon per siswa
//   generate     pratinjau dan simpan tagihan bulanan/kegiatan
//   tagihan      daftar, saldo kredit, koreksi, void
//   pembayaran   pratinjau alokasi, catat, verifikasi, tolak, void, alokasi
//   laporan      ringkasan keuangan
//   invoice      penggabungan tagihan
//   pdf          invoice dan kuitansi (pdfkit)
//   wali         konfirmasi pembayaran wali + rincian tagihan anak
//   export       ekspor CSV untuk pembukuan
//
// Urutan mengikuti urutan asli route sewaktu masih satu berkas. Path-nya
// seluruhnya berbeda awalan, jadi urutan tidak memengaruhi pencocokan.
const express = require('express');

const router = express.Router();

router.use('/', require('./billing/tarif'));
router.use('/', require('./billing/generate'));
router.use('/', require('./billing/tagihan'));
router.use('/', require('./billing/pembayaran'));
router.use('/', require('./billing/laporan'));
router.use('/', require('./billing/invoice'));
router.use('/', require('./billing/pdf'));
router.use('/', require('./billing/wali'));
router.use('/', require('./billing/export'));

module.exports = router;
