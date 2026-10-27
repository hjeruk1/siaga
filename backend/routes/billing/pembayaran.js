// Pembayaran: pratinjau alokasi, pencatatan, verifikasi, penolakan, void, dan
// penyuntingan alokasi.
//
// Ini jalur uang masuk, jadi paling ketat: alokasi FIFO dihitung di server
// (bukan diterima dari klien), verifikasi membuat kuitansi bernomor, dan sisa
// yang tidak bisa dialokasikan dicatat sebagai saldo kredit.
const express = require('express');
const db = require('../../db');
const auth = require('../../middleware/auth');
const { validateBody } = require('../../middleware/validate');
const { pembayaranSchema } = require('../../schemas');
const {
  nowUtc,
  todayWIB,
  schoolYearForDate,
  nextSequence,
  requireCabang,
  requireActiveCabang,
  audit,
  notify
} = require('../../utils/workflow');
const {
  cabangParam,
  studentBelongsToCabang,
  paidAmount,
  refreshBillStatus,
  creditBalance,
  recordCredit,
  reverseCredit
} = require('./helpers');

const router = express.Router();

router.get('/pembayaran/preview-alokasi', auth(['admin', 'admin_cabang']), (req, res) => {
  const cabangId = cabangParam(req);
  const siswaId = Number(req.query.siswa_id);
  const nominal = Number(req.query.nominal);
  if (!cabangId || !siswaId || !nominal)
    return res.status(400).json({ error: 'cabang_id, siswa_id, dan nominal wajib' });
  if (!requireCabang(req, res, cabangId)) return;
  const bills = db
    .prepare(
      "SELECT id,nama,periode,nominal_final,status FROM tagihan WHERE siswa_id=? AND cabang_id=? AND status IN ('open','sebagian') ORDER BY periode,created_at"
    )
    .all(siswaId, cabangId);
  const allocations = [];
  let remaining = nominal;
  for (const b of bills) {
    if (remaining <= 0) break;
    const paid = paidAmount(b.id);
    const unpaid = b.nominal_final - paid;
    const alloc = Math.min(remaining, unpaid);
    if (alloc > 0) {
      allocations.push({
        tagihan_id: b.id,
        nama: b.nama,
        periode: b.periode,
        nominal_final: b.nominal_final,
        paid,
        unpaid,
        allocated: alloc
      });
      remaining -= alloc;
    }
  }
  res.json({
    allocations,
    total_allocated: nominal - remaining,
    remaining_unallocated: remaining,
    siswa_id: siswaId,
    cabang_id: cabangId
  });
});

router.get('/pembayaran', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const cabangId = cabangParam(req);
  if (cabangId && !requireCabang(req, res, cabangId)) return;
  const params = [];
  let where = 'WHERE 1=1';
  if (cabangId) {
    where += ' AND p.cabang_id=?';
    params.push(cabangId);
  }
  if (req.query.status) {
    where += ' AND p.status=?';
    params.push(req.query.status);
  }
  res.json(
    db
      .prepare(
        `
    SELECT p.*,s.nama AS siswa_nama,c.nama AS cabang_nama,u.display_name AS created_by_name,
      COALESCE((SELECT SUM(pa.nominal) FROM pembayaran_alokasi pa WHERE pa.pembayaran_id=p.id), 0) AS allocated_amount,
      p.nominal - COALESCE((SELECT SUM(pa.nominal) FROM pembayaran_alokasi pa WHERE pa.pembayaran_id=p.id), 0) AS credit_amount
    FROM pembayaran p JOIN siswa s ON s.id=p.siswa_id JOIN cabang c ON c.id=p.cabang_id
    LEFT JOIN pengguna u ON u.id=p.created_by
    ${where} ORDER BY p.created_at DESC
  `
      )
      .all(...params)
  );
});

router.post('/pembayaran', auth(['admin', 'admin_cabang']), validateBody(pembayaranSchema), (req, res) => {
  const d = req.body || {};
  const cabangId = req.user.role === 'admin' ? d.cabang_id : req.user.cabang_id;
  if (!requireActiveCabang(req, res, cabangId)) return;
  const paymentAmount = Number(d.nominal);
  if (!d.siswa_id || !Number.isFinite(paymentAmount) || paymentAmount <= 0 || !d.metode)
    return res.status(400).json({ error: 'Data pembayaran belum lengkap atau nominal tidak valid' });
  if (!studentBelongsToCabang(d.siswa_id, cabangId))
    return res.status(403).json({ error: 'Siswa tidak terdaftar aktif di cabang pembayaran' });
  const status = req.user.role === 'admin' || d.metode === 'tunai' ? 'confirmed' : 'pending_verification';
  const receiptNo =
    status === 'confirmed'
      ? `TP-${db.prepare('SELECT kode FROM cabang WHERE id=?').get(cabangId).kode}-${schoolYearForDate(d.tanggal_bayar || todayWIB()).slice(0, 4)}-${String(nextSequence(`receipt:${cabangId}:${schoolYearForDate(d.tanggal_bayar || todayWIB())}`)).padStart(6, '0')}`
      : null;
  const tx = db.transaction(() => {
    const r = db
      .prepare(
        `INSERT INTO pembayaran(cabang_id,siswa_id,receipt_no,tanggal_bayar,nominal,metode,status,reference,catatan,created_by,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        cabangId,
        d.siswa_id,
        receiptNo,
        d.tanggal_bayar || todayWIB(),
        paymentAmount,
        d.metode,
        status,
        d.reference || null,
        d.catatan || null,
        req.user.id,
        nowUtc(),
        nowUtc()
      );
    // ---- Pakai saldo kredit (opt-in) ----
    // Kelebihan pembayaran sebelumnya dipakai menutup tagihan terbuka sebelum
    // uang yang baru disalurkan. Tanpa langkah ini saldo kredit hanya tercatat
    // tetapi tidak pernah bisa dipakai, sehingga janji di UI ("sisa dana
    // disimpan sebagai saldo kredit") tetap menyesatkan.
    //
    // SENGAJA opt-in lewat pakai_kredit: true. Memakainya secara otomatis
    // mengubah arti setiap pembayaran: tagihan bisa lunas tanpa uang baru masuk,
    // dan pembayaran yang ada akan berperilaku berbeda tanpa diminta. Pergerakan
    // uang sebaiknya selalu diminta eksplisit.
    //
    // Pencatatannya memakai satu baris pembayaran ber-metode 'lainnya' supaya
    // alokasi menempel lewat jalur yang sama dengan pembayaran biasa. Tidak ada
    // struk karena tidak ada uang yang berpindah tangan.
    if (d.pakai_kredit === true) {
      const kreditTersedia = creditBalance(d.siswa_id);
      if (kreditTersedia > 0) {
        const tagihanTerbuka = db
          .prepare(
            "SELECT id,nominal_final FROM tagihan WHERE siswa_id=? AND cabang_id=? AND status IN ('open','sebagian') ORDER BY periode,created_at"
          )
          .all(d.siswa_id, cabangId);
        const penyerap = [];
        let kreditDipakai = 0;
        for (const t of tagihanTerbuka) {
          if (kreditDipakai >= kreditTersedia) break;
          const unpaid = t.nominal_final - paidAmount(t.id);
          if (unpaid <= 0) continue;
          const ambil = Math.min(unpaid, kreditTersedia - kreditDipakai);
          penyerap.push({ id: t.id, nominal: ambil });
          kreditDipakai += ambil;
        }
        if (kreditDipakai > 0) {
          const kreditPaymentId = db
            .prepare(
              `INSERT INTO pembayaran(cabang_id,siswa_id,receipt_no,tanggal_bayar,nominal,metode,status,catatan,created_by,created_at,updated_at)
               VALUES(?,?,NULL,?,?,'lainnya','confirmed','Penggunaan saldo kredit',?,?,?)`
            )
            .run(
              cabangId,
              d.siswa_id,
              d.tanggal_bayar || todayWIB(),
              kreditDipakai,
              req.user.id,
              nowUtc(),
              nowUtc()
            ).lastInsertRowid;
          for (const t of penyerap) {
            db.prepare(
              'INSERT INTO pembayaran_alokasi(pembayaran_id,tagihan_id,nominal,created_at) VALUES(?,?,?,?)'
            ).run(kreditPaymentId, t.id, t.nominal, nowUtc());
            db.prepare(
              "INSERT INTO saldo_kredit(siswa_id,cabang_id,pembayaran_id,nominal,tipe,catatan,created_at) VALUES(?,?,?,?,'used',?,?)"
            ).run(d.siswa_id, cabangId, kreditPaymentId, t.nominal, `Dipakai untuk tagihan #${t.id}`, nowUtc());
            refreshBillStatus(t.id);
          }
        }
      }
    }

    let remaining = paymentAmount;
    const bills =
      Array.isArray(d.alokasi) && d.alokasi.length
        ? d.alokasi.map((a) => ({ id: a.tagihan_id, amount: a.nominal }))
        : db
            .prepare(
              "SELECT id,nominal_final FROM tagihan WHERE siswa_id=? AND cabang_id=? AND status IN ('open','sebagian') ORDER BY periode,created_at"
            )
            .all(d.siswa_id, cabangId);
    for (const b of bills) {
      if (remaining <= 0) break;
      const requestedAmount = b.amount === undefined ? null : Number(b.amount);
      if (requestedAmount !== null && (!Number.isFinite(requestedAmount) || requestedAmount <= 0)) {
        throw new Error(`Nominal alokasi tagihan #${b.id} tidak valid`);
      }
      const bill = db
        .prepare('SELECT * FROM tagihan WHERE id=? AND cabang_id=? AND siswa_id=?')
        .get(b.id, cabangId, d.siswa_id);
      if (!bill) {
        if (Array.isArray(d.alokasi) && d.alokasi.length)
          throw new Error(`Tagihan #${b.id} bukan milik siswa pembayaran`);
        continue;
      }
      const unpaid = bill.nominal_final - paidAmount(bill.id);
      const nominal = Math.min(remaining, requestedAmount || unpaid, unpaid);
      if (nominal > 0) {
        db.prepare('INSERT INTO pembayaran_alokasi(pembayaran_id,tagihan_id,nominal,created_at) VALUES(?,?,?,?)').run(
          r.lastInsertRowid,
          bill.id,
          nominal,
          nowUtc()
        );
        remaining -= nominal;
        if (status === 'confirmed') refreshBillStatus(bill.id);
      }
    }
    // Kelebihan yang tidak tertampung tagihan menjadi saldo kredit siswa.
    // Tanpa baris ini, uang yang sudah diterima sekolah tidak menempel pada
    // tagihan mana pun dan tidak terlacak.
    if (remaining > 0) {
      recordCredit(
        r.lastInsertRowid,
        d.siswa_id,
        cabangId,
        remaining,
        `Kelebihan pembayaran${receiptNo ? ' ' + receiptNo : ''}`
      );
    }
    audit(req.user, 'create', 'pembayaran', r.lastInsertRowid, { cabang_id: cabangId, after: { ...d, status } });
    return { id: r.lastInsertRowid, receipt_no: receiptNo, status };
  });
  try {
    res.json(tx());
  } catch (error) {
    res.status(400).json({ error: error.message || 'Alokasi pembayaran tidak valid' });
  }
});

router.post('/pembayaran/:id/verify', auth(['admin', 'admin_cabang']), (req, res) => {
  const p = db.prepare('SELECT * FROM pembayaran WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Pembayaran tidak ditemukan' });
  // Klaim datang dari wali, yang mengetahuinya di tingkat cabang: admin_cabang
  // adalah "bendahara cabang" — dia menerima notifikasi, jadi harus bisa
  // menindaklanjuti, tetapi hanya untuk cabangnya sendiri.
  if (req.user.role === 'admin_cabang' && Number(req.user.cabang_id) !== Number(p.cabang_id))
    return res.status(403).json({ error: 'Akses cabang ditolak' });
  if (p.status !== 'pending_verification') return res.status(400).json({ error: 'Pembayaran bukan pending' });
  const cabang = db.prepare('SELECT kode FROM cabang WHERE id=?').get(p.cabang_id);
  const receiptNo = `TP-${cabang.kode}-${schoolYearForDate(p.tanggal_bayar).slice(0, 4)}-${String(nextSequence(`receipt:${p.cabang_id}:${schoolYearForDate(p.tanggal_bayar)}`)).padStart(6, '0')}`;
  db.prepare(
    "UPDATE pembayaran SET status='confirmed',receipt_no=?,verified_by=?,verified_at=?,updated_at=? WHERE id=?"
  ).run(receiptNo, req.user.id, nowUtc(), nowUtc(), p.id);
  const allocations = db.prepare('SELECT tagihan_id FROM pembayaran_alokasi WHERE pembayaran_id=?').all(p.id);
  for (const a of allocations) refreshBillStatus(a.tagihan_id);
  audit(req.user, 'verify_payment', 'pembayaran', p.id, {
    cabang_id: p.cabang_id,
    before: p,
    after: { status: 'confirmed', receiptNo }
  });

  try {
    const walis = db.prepare('SELECT wali_pengguna_id FROM wali_siswa WHERE siswa_id=? AND aktif=1').all(p.siswa_id);
    const student = db.prepare('SELECT nama FROM siswa WHERE id=?').get(p.siswa_id);
    const formattedNominal = 'Rp ' + Number(p.nominal).toLocaleString('id-ID');
    for (const w of walis) {
      notify(
        w.wali_pengguna_id,
        'payment_verified',
        'Pembayaran Dikonfirmasi',
        `Pembayaran kuitansi ${receiptNo} sebesar ${formattedNominal} untuk ${student.nama} telah diverifikasi.`,
        'pembayaran',
        p.id,
        p.cabang_id
      );
    }
  } catch (err) {
    console.error('Gagal mengirim notifikasi verifikasi pembayaran:', err);
  }

  res.json({ success: true, receipt_no: receiptNo });
});

router.post('/pembayaran/:id/reject', auth(['admin', 'admin_cabang']), (req, res) => {
  const p = db.prepare('SELECT * FROM pembayaran WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Pembayaran tidak ditemukan' });
  if (req.user.role === 'admin_cabang' && Number(req.user.cabang_id) !== Number(p.cabang_id))
    return res.status(403).json({ error: 'Akses cabang ditolak' });
  if (p.status !== 'pending_verification') return res.status(400).json({ error: 'Pembayaran bukan pending' });
  const reason = String(req.body?.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'Alasan wajib' });
  db.prepare(
    "UPDATE pembayaran SET status='rejected',void_reason=?,verified_by=?,verified_at=?,updated_at=? WHERE id=?"
  ).run(reason, req.user.id, nowUtc(), nowUtc(), p.id);
  const allocations = db.prepare('SELECT tagihan_id FROM pembayaran_alokasi WHERE pembayaran_id=?').all(p.id);
  for (const a of allocations) refreshBillStatus(a.tagihan_id);
  reverseCredit(p.id);
  audit(req.user, 'reject_payment', 'pembayaran', p.id, { cabang_id: p.cabang_id, before: p, reason });

  // Wali harus tahu alasannya: tanpa notifikasi, status di aplikasi berubah
  // tanpa penjelasan dan orang tua mengirim bukti yang sama berulang kali.
  try {
    const walis = db.prepare('SELECT wali_pengguna_id FROM wali_siswa WHERE siswa_id=? AND aktif=1').all(p.siswa_id);
    const student = db.prepare('SELECT nama FROM siswa WHERE id=?').get(p.siswa_id);
    for (const w of walis) {
      notify(
        w.wali_pengguna_id,
        'payment_rejected',
        'Pembayaran perlu diperbaiki',
        `Konfirmasi pembayaran untuk ${student.nama} ditolak: ${reason}`,
        'pembayaran',
        p.id,
        p.cabang_id
      );
    }
  } catch (err) {
    console.error('Gagal mengirim notifikasi penolakan pembayaran:', err);
  }

  res.json({ success: true });
});

router.post('/pembayaran/:id/void', auth(['admin', 'admin_cabang']), (req, res) => {
  const p = db.prepare('SELECT * FROM pembayaran WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Pembayaran tidak ditemukan' });
  if (!requireCabang(req, res, p.cabang_id)) return;
  if (['rejected', 'void'].includes(p.status)) return res.status(400).json({ error: 'Pembayaran sudah final' });
  const reason = String(req.body?.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'Alasan wajib' });
  db.prepare("UPDATE pembayaran SET status='void',void_reason=?,updated_at=? WHERE id=?").run(reason, nowUtc(), p.id);
  const allocations = db.prepare('SELECT tagihan_id FROM pembayaran_alokasi WHERE pembayaran_id=?').all(p.id);
  for (const a of allocations) refreshBillStatus(a.tagihan_id);
  reverseCredit(p.id);
  audit(req.user, 'void_payment', 'pembayaran', p.id, { cabang_id: p.cabang_id, before: p, reason });
  res.json({ success: true });
});

router.get('/pembayaran/:id/alokasi', auth(['admin', 'admin_cabang']), (req, res) => {
  const p = db.prepare('SELECT * FROM pembayaran WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Pembayaran tidak ditemukan' });
  if (!requireCabang(req, res, p.cabang_id)) return;
  const payment = db
    .prepare(
      `
    SELECT p.*,
      COALESCE((SELECT SUM(pa.nominal) FROM pembayaran_alokasi pa WHERE pa.pembayaran_id=p.id), 0) AS allocated_amount
    FROM pembayaran p WHERE p.id=?
  `
    )
    .get(req.params.id);
  // Selisih nominal dan alokasi hanya berarti "kredit" untuk pembayaran yang
  // masih hidup. Untuk pembayaran yang sudah void atau ditolak, menyebut
  // selisihnya kredit akan menyesatkan — uangnya sudah tidak berlaku.
  payment.credit_amount = ['confirmed', 'pending_verification'].includes(payment.status)
    ? payment.nominal - payment.allocated_amount
    : 0;
  const allocations = db.prepare('SELECT * FROM pembayaran_alokasi WHERE pembayaran_id=?').all(req.params.id);
  const bills = db
    .prepare(
      `
    SELECT t.*,
      COALESCE((SELECT pa.nominal FROM pembayaran_alokasi pa WHERE pa.tagihan_id=t.id AND pa.pembayaran_id=?), 0) AS allocated_amount
    FROM tagihan t
    WHERE t.siswa_id=? AND t.cabang_id=?
      AND (t.status IN ('open', 'sebagian') OR t.id IN (SELECT tagihan_id FROM pembayaran_alokasi WHERE pembayaran_id=?))
    ORDER BY t.periode, t.created_at
  `
    )
    .all(req.params.id, payment.siswa_id, payment.cabang_id, req.params.id);
  res.json({ payment, allocations, bills });
});

router.put('/pembayaran/:id/alokasi', auth(['admin', 'admin_cabang']), (req, res) => {
  const p = db.prepare('SELECT * FROM pembayaran WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Pembayaran tidak ditemukan' });
  if (!requireCabang(req, res, p.cabang_id)) return;
  if (!['confirmed', 'pending_verification'].includes(p.status))
    return res.status(400).json({ error: 'Alokasi hanya bisa diubah untuk pembayaran confirmed atau pending' });
  const alokasi = Array.isArray(req.body?.alokasi) ? req.body.alokasi : [];
  if (alokasi.some((a) => !Number.isFinite(Number(a.nominal)) || Number(a.nominal) <= 0)) {
    return res.status(400).json({ error: 'Semua nominal alokasi harus lebih dari nol' });
  }
  const total = alokasi.reduce((s, a) => s + Number(a.nominal), 0);
  if (total > p.nominal)
    return res.status(400).json({ error: `Total alokasi (${total}) melebihi nominal pembayaran (${p.nominal})` });
  const tx = db.transaction(() => {
    const oldAllocs = db.prepare('SELECT * FROM pembayaran_alokasi WHERE pembayaran_id=?').all(p.id);
    db.prepare('DELETE FROM pembayaran_alokasi WHERE pembayaran_id=?').run(p.id);
    for (const a of alokasi) {
      const bill = db
        .prepare('SELECT * FROM tagihan WHERE id=? AND cabang_id=? AND siswa_id=?')
        .get(a.tagihan_id, p.cabang_id, p.siswa_id);
      if (!bill) throw new Error(`Tagihan #${a.tagihan_id} tidak ditemukan`);
      const otherPaid = paidAmount(bill.id);
      if (Number(a.nominal) > bill.nominal_final - otherPaid)
        throw new Error(`Alokasi tagihan #${a.tagihan_id} melebihi sisa tagihan`);
      db.prepare('INSERT INTO pembayaran_alokasi(pembayaran_id,tagihan_id,nominal,created_at) VALUES(?,?,?,?)').run(
        p.id,
        a.tagihan_id,
        Number(a.nominal),
        nowUtc()
      );
    }
    for (const old of oldAllocs) refreshBillStatus(old.tagihan_id);
    for (const a of alokasi) refreshBillStatus(a.tagihan_id);
    audit(req.user, 'edit_payment_allocation', 'pembayaran', p.id, {
      cabang_id: p.cabang_id,
      before: oldAllocs,
      after: alokasi
    });
  });
  try {
    tx();
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
