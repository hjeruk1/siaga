// Ekspor keuangan untuk pembukuan: CSV yang bisa langsung dibuka Excel.
//
// Berkas sendiri, bukan menumpang di billing.js: isinya bukan route biasa
// (tidak ada tulis ke database) melainkan penyusunan baris CSV dari dua
// dataset — tagihan dan pembayaran — plus aturan mana yang boleh diekspor.
const express = require('express');
const db = require('../../db');
const auth = require('../../middleware/auth');
const { requireCabang } = require('../../utils/workflow');
const { cabangParam } = require('./helpers');

const router = express.Router();

// Ekspor keuangan untuk pembukuan (CSV, bisa dibuka Excel).
//
// Kenapa CSV dan bukan PDF: bendahara butuh data yang bisa dijumlah, disaring,
// dan digabung dengan catatan lain — bukan dokumen untuk dibaca. Formatnya
// mengikuti ekspor rekap absensi (BOM + baris `sep=,`) supaya Excel di Windows
// langsung memisahkan kolom tanpa wizard impor.
//
// Dua dataset karena pertanyaannya berbeda:
//   jenis=tagihan    -> apa yang seharusnya masuk (per periode)
//   jenis=pembayaran -> apa yang benar-benar masuk (per tanggal bayar)
//
// Tagihan void dan pembayaran void TIDAK diekspor: keduanya bukan angka yang
// berlaku, dan mencampurnya membuat total di Excel berbeda dari layar.
const LABEL_STATUS_TAGIHAN = { open: 'Belum dibayar', sebagian: 'Sebagian', lunas: 'Lunas' };
const LABEL_STATUS_BAYAR = {
  confirmed: 'Terkonfirmasi',
  pending_verification: 'Menunggu verifikasi',
  rejected: 'Ditolak'
};
const LABEL_METODE = { tunai: 'Tunai', transfer: 'Transfer', qris: 'QRIS', lainnya: 'Lainnya' };

function csvSel(teks) {
  return `"${String(teks ?? '').replace(/"/g, '""')}"`;
}

function kirimCsv(res, namaBerkas, baris) {
  const isi = ['\uFEFFsep=,', ...baris.map((r) => r.map(csvSel).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${namaBerkas}"`);
  res.setHeader('Cache-Control', 'no-store');
  return res.send(isi);
}

router.get('/export', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const jenis = req.query.jenis === 'pembayaran' ? 'pembayaran' : 'tagihan';
  const cabangId = cabangParam(req);
  if (req.user.role !== 'admin' && !cabangId) return res.status(400).json({ error: 'Cabang wajib' });
  if (cabangId && !requireCabang(req, res, cabangId)) return;

  const periode = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(req.query.periode || '')) ? String(req.query.periode) : null;
  const namaCabang = cabangId ? db.prepare('SELECT nama FROM cabang WHERE id=?').get(cabangId)?.nama : 'Semua';
  const akhiran = `${periode || 'semua'}_${namaCabang || 'semua'}`.replace(/[^a-zA-Z0-9_-]+/g, '-');

  if (jenis === 'pembayaran') {
    const params = [];
    let where = "WHERE p.status<>'void'";
    if (cabangId) {
      where += ' AND p.cabang_id=?';
      params.push(cabangId);
    }
    if (periode) {
      where += ' AND p.tanggal_bayar LIKE ?';
      params.push(`${periode}-%`);
    }
    const rows = db
      .prepare(
        `SELECT p.tanggal_bayar, c.nama AS cabang_nama, s.nama AS siswa_nama, p.receipt_no, p.metode, p.nominal,
                p.status, p.reference, p.catatan, u.display_name AS verifikator
         FROM pembayaran p
         JOIN siswa s ON s.id=p.siswa_id
         JOIN cabang c ON c.id=p.cabang_id
         LEFT JOIN pengguna u ON u.id=p.verified_by
         ${where}
         ORDER BY p.tanggal_bayar, p.id`
      )
      .all(...params);

    const baris = [
      [
        'No',
        'Tanggal Bayar',
        'Cabang',
        'Siswa',
        'No Kuitansi',
        'Metode',
        'Nominal',
        'Status',
        'Referensi',
        'Catatan',
        'Diverifikasi oleh'
      ]
    ];
    rows.forEach((r, i) => {
      baris.push([
        i + 1,
        r.tanggal_bayar,
        r.cabang_nama,
        r.siswa_nama,
        r.receipt_no || '',
        LABEL_METODE[r.metode] || r.metode,
        r.nominal,
        LABEL_STATUS_BAYAR[r.status] || r.status,
        r.reference || '',
        r.catatan || '',
        r.verifikator || ''
      ]);
    });
    return kirimCsv(res, `Keuangan_Pembayaran_${akhiran}.csv`, baris);
  }

  const params = [];
  let where = "WHERE t.status<>'void'";
  if (cabangId) {
    where += ' AND t.cabang_id=?';
    params.push(cabangId);
  }
  if (periode) {
    where += ' AND t.periode=?';
    params.push(periode);
  }
  const rows = db
    .prepare(
      `SELECT c.nama AS cabang_nama, s.nama AS siswa_nama, r.nama AS rombel_nama, t.periode, t.jenis, t.nama,
              t.nominal_awal, t.diskon_amount, t.koreksi_amount, t.nominal_final, t.status, t.jatuh_tempo, t.created_at,
              COALESCE((SELECT SUM(pa.nominal) FROM pembayaran_alokasi pa
                        JOIN pembayaran p ON p.id=pa.pembayaran_id
                        WHERE pa.tagihan_id=t.id AND p.status='confirmed'),0) AS paid
       FROM tagihan t
       JOIN siswa s ON s.id=t.siswa_id
       JOIN cabang c ON c.id=t.cabang_id
       JOIN rombel r ON r.id=t.rombel_id
       ${where}
       ORDER BY t.periode, c.nama, s.nama, t.nama`
    )
    .all(...params);

  const baris = [
    [
      'No',
      'Cabang',
      'Siswa',
      'Rombel',
      'Periode',
      'Jenis',
      'Nama Tagihan',
      'Nominal Awal',
      'Diskon',
      'Koreksi',
      'Nominal Final',
      'Terbayar',
      'Sisa',
      'Status',
      'Jatuh Tempo',
      'Dibuat'
    ]
  ];
  rows.forEach((r, i) => {
    baris.push([
      i + 1,
      r.cabang_nama,
      r.siswa_nama,
      r.rombel_nama,
      r.periode || '',
      r.jenis,
      r.nama,
      r.nominal_awal,
      r.diskon_amount,
      r.koreksi_amount,
      r.nominal_final,
      r.paid,
      Math.max(0, Number(r.nominal_final) - Number(r.paid || 0)),
      LABEL_STATUS_TAGIHAN[r.status] || r.status,
      r.jatuh_tempo || '',
      r.created_at
    ]);
  });
  return kirimCsv(res, `Keuangan_Tagihan_${akhiran}.csv`, baris);
});

module.exports = router;
