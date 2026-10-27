// Tagihan: daftar, saldo kredit per siswa, koreksi, dan void.
//
// Koreksi mengubah nominal_final lalu menghitung ulang status; void tidak
// menghapus baris, hanya menandai — riwayat uang tidak boleh hilang.
const express = require('express');
const db = require('../../db');
const auth = require('../../middleware/auth');
const { nowUtc, requireCabang, audit } = require('../../utils/workflow');
const {
  cabangParam,
  canReadStudentBilling,
  paidAmount,
  refreshBillStatus,
  creditBalance,
  recordCredit
} = require('./helpers');

const router = express.Router();

router.get('/tagihan', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const siswaId = req.query.siswa_id ? Number(req.query.siswa_id) : null;
  if (siswaId && !canReadStudentBilling(req, siswaId))
    return res.status(403).json({ error: 'Akses tagihan siswa ditolak' });
  const cabangId = siswaId ? (req.user.role === 'admin' ? null : req.user.cabang_id) : cabangParam(req);
  if (cabangId && !requireCabang(req, res, cabangId)) return;
  const params = [];
  let where = 'WHERE 1=1';
  if (cabangId) {
    where += ' AND t.cabang_id=?';
    params.push(cabangId);
  }
  if (siswaId) {
    where += ' AND t.siswa_id=?';
    params.push(siswaId);
  }
  const rows = db
    .prepare(
      `
    SELECT t.*,s.nama AS siswa_nama,c.nama AS cabang_nama,j.nama AS jenjang_nama,r.nama AS rombel_nama,
           COALESCE((SELECT SUM(pa.nominal) FROM pembayaran_alokasi pa JOIN pembayaran p ON p.id=pa.pembayaran_id WHERE pa.tagihan_id=t.id AND p.status='confirmed'),0) AS paid_amount
    FROM tagihan t JOIN siswa s ON s.id=t.siswa_id JOIN cabang c ON c.id=t.cabang_id JOIN jenjang j ON j.id=t.jenjang_id JOIN rombel r ON r.id=t.rombel_id
    ${where} ORDER BY t.created_at DESC
  `
    )
    .all(...params);
  res.json(rows);
});

// Saldo kredit seorang siswa: kelebihan pembayaran yang belum dipakai.
// Berguna saat orang tua membayar lebih dari tagihan berjalan — uangnya tidak
// hilang, melainkan menunggu dipakai untuk tagihan berikutnya.
router.get('/siswa/:siswaId/saldo', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const siswaId = Number(req.params.siswaId);
  if (!canReadStudentBilling(req, siswaId)) return res.status(403).json({ error: 'Akses ditolak' });
  const riwayat = db
    .prepare(
      `SELECT sk.*, p.receipt_no
       FROM saldo_kredit sk
       LEFT JOIN pembayaran p ON p.id=sk.pembayaran_id
       WHERE sk.siswa_id=?
       ORDER BY sk.created_at DESC
       LIMIT 50`
    )
    .all(siswaId);
  res.json({ siswa_id: siswaId, saldo: creditBalance(siswaId), riwayat });
});

router.put('/tagihan/:id/koreksi', auth(['admin', 'admin_cabang']), (req, res) => {
  const bill = db.prepare('SELECT * FROM tagihan WHERE id=?').get(req.params.id);
  if (!bill) return res.status(404).json({ error: 'Tagihan tidak ditemukan' });
  if (!requireCabang(req, res, bill.cabang_id)) return;
  if (bill.status === 'void') return res.status(400).json({ error: 'Tagihan sudah void' });
  const final = Number(req.body?.nominal_final);
  const reason = String(req.body?.reason || '').trim();
  if (!Number.isFinite(final) || final < 0 || !reason)
    return res.status(400).json({ error: 'Nominal final dan alasan wajib' });
  const koreksi = final - (bill.nominal_awal + bill.prorata_amount - bill.diskon_amount);
  db.prepare('UPDATE tagihan SET nominal_final=?,koreksi_amount=?,koreksi_reason=?,updated_at=? WHERE id=?').run(
    final,
    koreksi,
    reason,
    nowUtc(),
    bill.id
  );
  refreshBillStatus(bill.id);
  audit(req.user, 'correct_bill', 'tagihan', bill.id, {
    cabang_id: bill.cabang_id,
    before: bill,
    after: { nominal_final: final },
    reason
  });
  res.json({ success: true });
});

router.post('/tagihan/:id/void', auth(['admin', 'admin_cabang']), (req, res) => {
  const bill = db.prepare('SELECT * FROM tagihan WHERE id=?').get(req.params.id);
  if (!bill) return res.status(404).json({ error: 'Tagihan tidak ditemukan' });
  if (!requireCabang(req, res, bill.cabang_id)) return;
  // Tanpa penjaga ini, tagihan yang sudah void bisa di-void berulang dan setiap
  // pemanggilan akan mencatat kredit baru untuk uang yang sama.
  if (bill.status === 'void') return res.status(400).json({ error: 'Tagihan sudah void' });
  const reason = String(req.body?.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'Alasan wajib' });

  // Uang yang sudah dibayar untuk tagihan ini tidak boleh ikut hangus bersama
  // kewajibannya. Karena layanannya dibatalkan, uangnya menjadi saldo kredit
  // siswa untuk tagihan berikutnya. Sebelumnya alokasinya tetap menempel pada
  // tagihan yang sudah batal dan uangnya tidak terlacak.
  const paid = paidAmount(bill.id);
  db.prepare("UPDATE tagihan SET status='void',koreksi_reason=?,updated_at=? WHERE id=?").run(
    reason,
    nowUtc(),
    bill.id
  );
  if (paid > 0) {
    recordCredit(
      null,
      bill.siswa_id,
      bill.cabang_id,
      paid,
      `Pengembalian tagihan #${bill.id} (${bill.periode} ${bill.nama}) yang di-void`
    );
  }
  audit(req.user, 'void_bill', 'tagihan', bill.id, { cabang_id: bill.cabang_id, before: bill, reason, credit: paid });
  res.json({ success: true, credit: paid });
});

module.exports = router;
