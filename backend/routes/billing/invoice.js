// Invoice: penggabungan beberapa tagihan menjadi satu dokumen tagihan.
//
// Invoice tidak mengubah tagihan; ia hanya mengelompokkannya agar wali
// menerima satu tautan, bukan lima.
const express = require('express');
const db = require('../../db');
const auth = require('../../middleware/auth');
const { nowUtc, nextSequence, requireCabang, audit, notify } = require('../../utils/workflow');
const { getInvoiceKey, cabangParam } = require('./helpers');

const router = express.Router();

router.post('/invoice', auth(['admin', 'admin_cabang']), (req, res) => {
  const ids = Array.isArray(req.body?.tagihan_ids) ? req.body.tagihan_ids.map(Number).filter(Boolean) : [];
  if (!ids.length) return res.status(400).json({ error: 'Pilih tagihan' });
  const bills = db
    .prepare(`SELECT * FROM tagihan WHERE id IN (${ids.map(() => '?').join(',')}) AND status!='void'`)
    .all(...ids);
  if (bills.length !== ids.length) return res.status(400).json({ error: 'Ada tagihan tidak valid' });
  const first = bills[0];
  if (!bills.every((b) => b.siswa_id === first.siswa_id && b.cabang_id === first.cabang_id))
    return res.status(400).json({ error: 'Invoice tidak boleh lintas siswa/cabang' });
  if (!requireCabang(req, res, first.cabang_id)) return;
  const cabang = db.prepare('SELECT kode FROM cabang WHERE id=?').get(first.cabang_id);
  const invoiceNo = `INV-${cabang.kode}-${first.tahun_ajaran.slice(0, 4)}-${String(nextSequence(`invoice:${first.cabang_id}:${first.tahun_ajaran}`)).padStart(6, '0')}`;
  const tx = db.transaction(() => {
    const r = db
      .prepare(
        'INSERT INTO invoice(cabang_id,siswa_id,invoice_no,tahun_ajaran,created_by,created_at) VALUES(?,?,?,?,?,?)'
      )
      .run(first.cabang_id, first.siswa_id, invoiceNo, first.tahun_ajaran, req.user.id, nowUtc());
    const stmt = db.prepare('INSERT INTO invoice_item(invoice_id,tagihan_id) VALUES(?,?)');
    for (const id of ids) stmt.run(r.lastInsertRowid, id);
    audit(req.user, 'create_invoice', 'invoice', r.lastInsertRowid, {
      cabang_id: first.cabang_id,
      after: { invoiceNo, ids }
    });
    return r.lastInsertRowid;
  });
  const invoiceId = tx();

  try {
    const walis = db
      .prepare('SELECT wali_pengguna_id FROM wali_siswa WHERE siswa_id=? AND aktif=1')
      .all(first.siswa_id);
    const student = db.prepare('SELECT nama FROM siswa WHERE id=?').get(first.siswa_id);
    const totalAmount = bills.reduce((sum, b) => sum + b.nominal_final, 0);
    const formattedTotal = 'Rp ' + Number(totalAmount).toLocaleString('id-ID');
    for (const w of walis) {
      notify(
        w.wali_pengguna_id,
        'invoice_issued',
        'Tagihan Invoice Baru',
        `Invoice ${invoiceNo} sebesar ${formattedTotal} untuk ${student.nama} telah diterbitkan.`,
        'invoice',
        invoiceId,
        first.cabang_id
      );
    }
  } catch (err) {
    console.error('Gagal mengirim notifikasi invoice:', err);
  }

  res.json({ id: invoiceId, invoice_no: invoiceNo });
});

router.get('/invoice', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const cabangId = cabangParam(req);
  if (cabangId && !requireCabang(req, res, cabangId)) return;
  const params = [];
  let where = 'WHERE 1=1';
  if (cabangId) {
    where += ' AND i.cabang_id=?';
    params.push(cabangId);
  }
  const rows = db
    .prepare(
      `
    SELECT i.*,s.nama AS siswa_nama,c.nama AS cabang_nama,
      (SELECT COALESCE(SUM(t.nominal_final),0) FROM invoice_item ii JOIN tagihan t ON t.id=ii.tagihan_id WHERE ii.invoice_id=i.id) AS total,
      (SELECT p.no_wa FROM wali_siswa ws JOIN pengguna p ON p.id=ws.wali_pengguna_id WHERE ws.siswa_id=i.siswa_id AND ws.aktif=1 LIMIT 1) AS wali_no_wa,
      (SELECT p.display_name FROM wali_siswa ws JOIN pengguna p ON p.id=ws.wali_pengguna_id WHERE ws.siswa_id=i.siswa_id AND ws.aktif=1 LIMIT 1) AS wali_nama
    FROM invoice i JOIN siswa s ON s.id=i.siswa_id JOIN cabang c ON c.id=i.cabang_id
    ${where} ORDER BY i.created_at DESC
  `
    )
    .all(...params);

  const results = rows.map((r) => ({
    ...r,
    public_key: getInvoiceKey(r.id)
  }));
  res.json(results);
});

// Urutan pemasangan mengikuti urutan asli route: PDF, wali, lalu ekspor.

module.exports = router;
