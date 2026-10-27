// Laporan keuangan ringkas per cabang dan periode.
const express = require('express');
const db = require('../../db');
const auth = require('../../middleware/auth');
const { requireCabang } = require('../../utils/workflow');
const { cabangParam } = require('./helpers');

const router = express.Router();

router.get('/laporan', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const cabangId = cabangParam(req);
  if (req.user.role !== 'admin' && !cabangId) {
    return res.status(400).json({ error: 'Cabang wajib' });
  }
  if (cabangId && !requireCabang(req, res, cabangId)) return;

  // Catatan penting soal angka di laporan ini:
  //
  // total_outstanding adalah SISA yang benar-benar belum dibayar, bukan
  // nominal_final seluruh tagihan. Sebelumnya tagihan berstatus 'sebagian'
  // dihitung penuh, sehingga utang tampak lebih besar dari kenyataan —
  // tagihan 1.000.000 yang sudah dibayar 500.000 ikut dihitung 1.000.000.
  //
  // total_paid hanya menghitung alokasi ke tagihan yang tidak void. Alokasi ke
  // tagihan yang sudah dibatalkan tidak lagi mewakili uang yang berlaku.
  let summaryQuery = `
    SELECT
      COUNT(*) AS total_tagihan,
      COALESCE(SUM(CASE WHEN status!='void' THEN nominal_final ELSE 0 END),0) AS total_nominal,
      COALESCE(SUM(CASE WHEN status='lunas' THEN nominal_final ELSE 0 END),0) AS total_lunas,
      COALESCE(SUM(CASE WHEN status IN ('open','sebagian')
        THEN nominal_final - COALESCE((
          SELECT SUM(pa.nominal) FROM pembayaran_alokasi pa
          JOIN pembayaran p ON p.id=pa.pembayaran_id
          WHERE pa.tagihan_id=tagihan.id AND p.status='confirmed'
        ),0)
        ELSE 0 END),0) AS total_outstanding,
      COUNT(CASE WHEN status='lunas' THEN 1 END) AS count_lunas,
      COUNT(CASE WHEN status IN ('open','sebagian') THEN 1 END) AS count_outstanding,
      COUNT(CASE WHEN status='void' THEN 1 END) AS count_void
    FROM tagihan
  `;
  let paidQuery = `
    SELECT COALESCE(SUM(pa.nominal),0) AS total_paid
    FROM pembayaran_alokasi pa
    JOIN pembayaran p ON p.id=pa.pembayaran_id
    JOIN tagihan t ON t.id=pa.tagihan_id
    WHERE p.status='confirmed' AND t.status!='void'
  `;
  let byJenisQuery = `
    SELECT jenis,
      COUNT(*) AS count,
      COALESCE(SUM(CASE WHEN status!='void' THEN nominal_final ELSE 0 END),0) AS total,
      COALESCE(SUM(CASE WHEN status='lunas' THEN nominal_final ELSE 0 END),0) AS lunas,
      COALESCE(SUM(CASE WHEN status IN ('open','sebagian')
        THEN nominal_final - COALESCE((
          SELECT SUM(pa.nominal) FROM pembayaran_alokasi pa
          JOIN pembayaran p ON p.id=pa.pembayaran_id
          WHERE pa.tagihan_id=tagihan.id AND p.status='confirmed'
        ),0)
        ELSE 0 END),0) AS outstanding
    FROM tagihan
  `;
  let byPeriodeQuery = `
    SELECT periode,
      COUNT(*) AS count,
      COALESCE(SUM(CASE WHEN status!='void' THEN nominal_final ELSE 0 END),0) AS total,
      COALESCE(SUM(CASE WHEN status='lunas' THEN nominal_final ELSE 0 END),0) AS lunas,
      COALESCE(SUM(CASE WHEN status IN ('open','sebagian')
        THEN nominal_final - COALESCE((
          SELECT SUM(pa.nominal) FROM pembayaran_alokasi pa
          JOIN pembayaran p ON p.id=pa.pembayaran_id
          WHERE pa.tagihan_id=tagihan.id AND p.status='confirmed'
        ),0)
        ELSE 0 END),0) AS outstanding
    FROM tagihan WHERE periode IS NOT NULL
  `;

  const params = [];
  if (cabangId) {
    summaryQuery += ' WHERE cabang_id=?';
    paidQuery += ' AND t.cabang_id=?';
    byJenisQuery += ' WHERE cabang_id=?';
    byPeriodeQuery += ' AND cabang_id=?';
    params.push(cabangId);
  }

  byJenisQuery += ' GROUP BY jenis ORDER BY jenis';
  byPeriodeQuery += ' GROUP BY periode ORDER BY periode DESC LIMIT 12';

  const summary = db.prepare(summaryQuery).get(...params);
  const paid = db.prepare(paidQuery).get(...params);
  const byJenis = db.prepare(byJenisQuery).all(...params);
  const byPeriode = db.prepare(byPeriodeQuery).all(...params);

  res.json({
    summary: { ...summary, total_paid: paid.total_paid },
    by_jenis: byJenis,
    by_periode: byPeriode,
    cabang_id: cabangId || null
  });
});

module.exports = router;
