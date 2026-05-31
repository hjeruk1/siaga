const fs = require('fs');
const path = require('path');
const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { nowUtc, todayWIB, schoolYearForDate, nextSequence, requireCabang, requireActiveCabang, audit, canAccessSiswa, notify } = require('../utils/workflow');
const PDFDocument = require('pdfkit');
const crypto = require('crypto');
const SECRET = process.env.JWT_SECRET || 'siaga-dev';

function getInvoiceKey(invoiceId) {
  return crypto.createHmac('sha256', SECRET).update(String(invoiceId)).digest('hex').slice(0, 16);
}

function getPaymentKey(paymentId) {
  return crypto.createHmac('sha256', SECRET).update(String(paymentId)).digest('hex').slice(0, 16);
}

function monthStart(period) {
  return `${period}-01`;
}

function cabangParam(req) {
  return req.user.role === 'admin' ? (req.query.cabang_id || req.body?.cabang_id) : req.user.cabang_id;
}

function canReadStudentBilling(req, siswaId) {
  if (req.user.role === 'admin') return true;
  const access = canAccessSiswa(req.user, siswaId);
  if (access) return true;
  if (req.user.role === 'admin_cabang' || req.user.role === 'kepsek') {
    return !!db.prepare('SELECT 1 FROM tagihan WHERE siswa_id=? AND cabang_id=? LIMIT 1').get(siswaId, req.user.cabang_id);
  }
  return false;
}

function studentBelongsToCabang(siswaId, cabangId) {
  return !!db.prepare(`
    SELECT 1 FROM siswa_enrollment
    WHERE siswa_id=? AND cabang_id=? AND status='aktif'
    LIMIT 1
  `).get(siswaId, cabangId);
}

function enrollmentAt(siswaId, tanggal) {
  return db.prepare(`
    SELECT e.*,j.tipe AS jenjang_tipe,j.nama AS jenjang_nama,r.nama AS rombel_nama,c.kode AS cabang_kode
    FROM siswa_enrollment e
    JOIN jenjang j ON j.id=e.jenjang_id
    JOIN rombel r ON r.id=e.rombel_id
    JOIN cabang c ON c.id=e.cabang_id
    WHERE e.siswa_id=? AND e.tanggal_mulai<=? AND (e.tanggal_selesai IS NULL OR e.tanggal_selesai>=?)
    ORDER BY e.tanggal_mulai DESC,e.id DESC LIMIT 1
  `).get(siswaId, tanggal, tanggal);
}

function enrollmentOverlap(siswaId, start, end) {
  return db.prepare(`
    SELECT e.*,j.tipe AS jenjang_tipe,j.nama AS jenjang_nama,r.nama AS rombel_nama,c.kode AS cabang_kode
    FROM siswa_enrollment e
    JOIN jenjang j ON j.id=e.jenjang_id
    JOIN rombel r ON r.id=e.rombel_id
    JOIN cabang c ON c.id=e.cabang_id
    WHERE e.siswa_id=? AND e.tanggal_mulai<=? AND (e.tanggal_selesai IS NULL OR e.tanggal_selesai>=?)
    ORDER BY e.tanggal_mulai DESC,e.id DESC LIMIT 1
  `).get(siswaId, end, start);
}

function monthEnd(period) {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function discounts(siswaId, cabangId, tahunAjaran, jenis, amount) {
  const rows = db.prepare(`SELECT * FROM diskon_siswa WHERE siswa_id=? AND cabang_id=? AND tahun_ajaran=? AND jenis=? AND aktif=1`)
    .all(siswaId, cabangId, tahunAjaran, jenis);
  let total = 0;
  for (const d of rows) total += d.tipe === 'persen' ? Math.round(amount * d.nilai / 100) : d.nilai;
  return Math.min(amount, total);
}

function paidAmount(tagihanId) {
  return db.prepare(`SELECT COALESCE(SUM(pa.nominal),0) total
    FROM pembayaran_alokasi pa JOIN pembayaran p ON p.id=pa.pembayaran_id
    WHERE pa.tagihan_id=? AND p.status='confirmed'`).get(tagihanId).total;
}

function refreshBillStatus(tagihanId) {
  const bill = db.prepare('SELECT * FROM tagihan WHERE id=?').get(tagihanId);
  if (!bill || bill.status === 'void') return;
  const paid = paidAmount(tagihanId);
  const status = paid <= 0 ? 'open' : paid < bill.nominal_final ? 'sebagian' : 'lunas';
  db.prepare('UPDATE tagihan SET status=?,updated_at=? WHERE id=?').run(status, nowUtc(), tagihanId);
}

router.get('/tarif', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const cabangId = cabangParam(req);
  if (cabangId && !requireCabang(req, res, cabangId)) return;
  const params = [];
  let where = 'WHERE 1=1';
  if (cabangId) { where += ' AND bt.cabang_id=?'; params.push(cabangId); }
  if (req.query.tahun_ajaran) { where += ' AND bt.tahun_ajaran=?'; params.push(req.query.tahun_ajaran); }
  res.json(db.prepare(`
    SELECT bt.*,c.nama AS cabang_nama,j.nama AS jenjang_nama
    FROM biaya_tarif bt JOIN cabang c ON c.id=bt.cabang_id JOIN jenjang j ON j.id=bt.jenjang_id
    ${where} ORDER BY c.nama,j.urutan,bt.jenis,bt.nama
  `).all(...params));
});

router.post('/tarif', auth(['admin']), (req, res) => {
  const d = req.body || {};
  if (!d.cabang_id || !d.tahun_ajaran || !d.jenjang_id || !d.jenis || !d.nama || d.nominal === undefined) {
    return res.status(400).json({ error: 'Tarif belum lengkap' });
  }
  try {
    const r = db.prepare(`INSERT INTO biaya_tarif(cabang_id,tahun_ajaran,jenjang_id,jenis,nama,nominal,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?)`)
      .run(d.cabang_id, d.tahun_ajaran, d.jenjang_id, d.jenis, d.nama, d.nominal, nowUtc(), nowUtc());
    audit(req.user, 'create', 'biaya_tarif', r.lastInsertRowid, { cabang_id: d.cabang_id, after: d });
    res.json({ id: r.lastInsertRowid });
  } catch {
    res.status(400).json({ error: 'Tarif duplikat untuk kombinasi ini' });
  }
});

router.put('/tarif/:id', auth(['admin']), (req, res) => {
  const before = db.prepare('SELECT * FROM biaya_tarif WHERE id=?').get(req.params.id);
  if (!before) return res.status(404).json({ error: 'Tarif tidak ditemukan' });
  db.prepare('UPDATE biaya_tarif SET nama=?,nominal=?,aktif=?,updated_at=? WHERE id=?')
    .run(req.body.nama || before.nama, req.body.nominal ?? before.nominal, req.body.aktif === 0 ? 0 : 1, nowUtc(), req.params.id);
  audit(req.user, 'update', 'biaya_tarif', req.params.id, { cabang_id: before.cabang_id, before, after: req.body });
  res.json({ success: true });
});

router.get('/diskon', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const cabangId = cabangParam(req);
  if (cabangId && !requireCabang(req, res, cabangId)) return;
  const params = [];
  let where = 'WHERE 1=1';
  if (cabangId) { where += ' AND d.cabang_id=?'; params.push(cabangId); }
  if (req.query.siswa_id) { where += ' AND d.siswa_id=?'; params.push(req.query.siswa_id); }
  res.json(db.prepare(`
    SELECT d.*,s.nama AS siswa_nama,c.nama AS cabang_nama
    FROM diskon_siswa d JOIN siswa s ON s.id=d.siswa_id JOIN cabang c ON c.id=d.cabang_id
    ${where} ORDER BY d.created_at DESC
  `).all(...params));
});

router.post('/diskon', auth(['admin', 'admin_cabang']), (req, res) => {
  const d = req.body || {};
  const cabangId = req.user.role === 'admin' ? d.cabang_id : req.user.cabang_id;
  if (!requireActiveCabang(req, res, cabangId)) return;
  if (!d.siswa_id || !d.tahun_ajaran || !d.jenis || !d.tipe || d.nilai === undefined) return res.status(400).json({ error: 'Data diskon belum lengkap' });
  const r = db.prepare(`INSERT INTO diskon_siswa(siswa_id,cabang_id,tahun_ajaran,jenis,tipe,nilai,catatan,created_by,created_at)
    VALUES(?,?,?,?,?,?,?,?,?)`)
    .run(d.siswa_id, cabangId, d.tahun_ajaran, d.jenis, d.tipe, d.nilai, d.catatan || null, req.user.id, nowUtc());
  audit(req.user, 'create', 'diskon_siswa', r.lastInsertRowid, { cabang_id: cabangId, after: d });
  res.json({ id: r.lastInsertRowid });
});

router.put('/diskon/:id', auth(['admin', 'admin_cabang']), (req, res) => {
  const before = db.prepare('SELECT * FROM diskon_siswa WHERE id=?').get(req.params.id);
  if (!before) return res.status(404).json({ error: 'Diskon tidak ditemukan' });
  if (!requireCabang(req, res, before.cabang_id)) return;
  const d = req.body || {};
  db.prepare(`UPDATE diskon_siswa 
    SET tipe=?, nilai=?, aktif=?, catatan=? 
    WHERE id=?`)
    .run(
      d.tipe || before.tipe,
      d.nilai !== undefined ? d.nilai : before.nilai,
      d.aktif !== undefined ? d.aktif : before.aktif,
      d.catatan !== undefined ? d.catatan : before.catatan,
      req.params.id
    );
  audit(req.user, 'update', 'diskon_siswa', req.params.id, { cabang_id: before.cabang_id, before, after: req.body });
  res.json({ success: true });
});

router.post('/generate-bulanan/preview', auth(['admin', 'admin_cabang']), (req, res) => {
  const period = req.body?.periode || todayWIB().slice(0, 7);
  const tgl = monthStart(period);
  const tahunAjaran = schoolYearForDate(tgl);
  const cabangId = cabangParam(req);
  if (!cabangId) return res.status(400).json({ error: 'Cabang wajib' });
  if (!requireActiveCabang(req, res, cabangId)) return;
  const siswa = db.prepare("SELECT * FROM siswa WHERE status='aktif' ORDER BY nama").all();
  const preview = [];
  const errors = [];
  for (const s of siswa) {
    const e = enrollmentOverlap(s.id, tgl, monthEnd(period));
    if (!e || Number(e.cabang_id) !== Number(cabangId)) continue;
    const items = [];
    if (e.jenjang_tipe === 'care') items.push('care');
    else {
      items.push('spp');
      if (e.paket === 'full_day') items.push('full_day');
    }
    for (const jenis of items) {
      const tarif = db.prepare('SELECT * FROM biaya_tarif WHERE cabang_id=? AND tahun_ajaran=? AND jenjang_id=? AND jenis=? AND aktif=1 ORDER BY id LIMIT 1')
        .get(cabangId, tahunAjaran, e.jenjang_id, jenis);
      if (!tarif) { errors.push(`${s.nama}: tarif ${jenis} belum ada`); continue; }
      const existing = db.prepare('SELECT id FROM tagihan WHERE siswa_id=? AND cabang_id=? AND tahun_ajaran=? AND periode=? AND jenis=? AND nama=?')
        .get(s.id, cabangId, tahunAjaran, period, jenis, tarif.nama);
      const diskon = discounts(s.id, cabangId, tahunAjaran, jenis, tarif.nominal);
      const final = Math.max(0, tarif.nominal - diskon);
      preview.push({
        siswa_id: s.id, siswa_nama: s.nama, jenis, nama: tarif.nama,
        nominal_awal: tarif.nominal, diskon_amount: diskon, nominal_final: final,
        jenjang_nama: e.jenjang_nama, rombel_nama: e.rombel_nama, paket: e.paket,
        already_exists: !!existing
      });
    }
  }
  res.json({ preview, errors, period, tahun_ajaran: tahunAjaran, cabang_id: cabangId });
});

router.post('/generate-bulanan', auth(['admin', 'admin_cabang']), (req, res) => {
  const period = req.body?.periode || todayWIB().slice(0, 7);
  const tgl = monthStart(period);
  const tahunAjaran = schoolYearForDate(tgl);
  const cabangId = cabangParam(req);
  if (!cabangId) return res.status(400).json({ error: 'Cabang wajib' });
  if (!requireActiveCabang(req, res, cabangId)) return;
  const siswa = db.prepare("SELECT * FROM siswa WHERE status='aktif' ORDER BY nama").all();
  const created = [];
  const errors = [];
  const tx = db.transaction(() => {
    for (const s of siswa) {
      const e = enrollmentOverlap(s.id, tgl, monthEnd(period));
      if (!e || Number(e.cabang_id) !== Number(cabangId)) continue;
      const items = [];
      if (e.jenjang_tipe === 'care') items.push('care');
      else {
        items.push('spp');
        if (e.paket === 'full_day') items.push('full_day');
      }
      for (const jenis of items) {
        const tarif = db.prepare('SELECT * FROM biaya_tarif WHERE cabang_id=? AND tahun_ajaran=? AND jenjang_id=? AND jenis=? AND aktif=1 ORDER BY id LIMIT 1')
          .get(cabangId, tahunAjaran, e.jenjang_id, jenis);
        if (!tarif) { errors.push(`${s.nama}: tarif ${jenis} belum ada`); continue; }
        const diskon = discounts(s.id, cabangId, tahunAjaran, jenis, tarif.nominal);
        const final = Math.max(0, tarif.nominal - diskon);
        const r = db.prepare(`INSERT OR IGNORE INTO tagihan
          (siswa_id,cabang_id,jenjang_id,rombel_id,paket,tahun_ajaran,periode,jenis,nama,nominal_awal,diskon_amount,nominal_final,created_by,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(s.id, cabangId, e.jenjang_id, e.rombel_id, e.paket, tahunAjaran, period, jenis, tarif.nama, tarif.nominal, diskon, final, req.user.id, nowUtc(), nowUtc());
        if (r.changes) created.push({ siswa: s.nama, jenis, nominal: final });
      }
    }
    audit(req.user, 'generate_bulanan', 'tagihan', null, { cabang_id: cabangId, after: { period, created: created.length, errors } });
  });
  tx();
  res.json({ success: true, created_count: created.length, created, errors });
});

router.post('/generate-kegiatan/preview', auth(['admin', 'admin_cabang']), (req, res) => {
  const tahunAjaran = req.body?.tahun_ajaran || schoolYearForDate();
  const cabangId = cabangParam(req);
  if (!cabangId) return res.status(400).json({ error: 'Cabang wajib' });
  if (!requireActiveCabang(req, res, cabangId)) return;
  const siswa = db.prepare("SELECT * FROM siswa WHERE status='aktif' ORDER BY nama").all();
  const preview = [], errors = [];
  const [startYear] = tahunAjaran.split('/').map(Number);
  for (const s of siswa) {
    const e = enrollmentOverlap(s.id, `${startYear}-07-01`, `${startYear + 1}-06-30`) || enrollmentAt(s.id, todayWIB());
    if (!e || Number(e.cabang_id) !== Number(cabangId) || e.jenjang_tipe === 'care') continue;
    const tarif = db.prepare("SELECT * FROM biaya_tarif WHERE cabang_id=? AND tahun_ajaran=? AND jenjang_id=? AND jenis='kegiatan' AND aktif=1 ORDER BY id LIMIT 1")
      .get(cabangId, tahunAjaran, e.jenjang_id);
    if (!tarif) { errors.push(`${s.nama}: tarif kegiatan belum ada`); continue; }
    const existing = db.prepare('SELECT id FROM tagihan WHERE siswa_id=? AND cabang_id=? AND tahun_ajaran=? AND jenis=? AND nama=?')
      .get(s.id, cabangId, tahunAjaran, 'kegiatan', tarif.nama);
    const mulai = e.tanggal_mulai > `${startYear}-07-01` ? e.tanggal_mulai : `${startYear}-07-01`;
    const month = Number(mulai.slice(5, 7));
    const monthsLeft = month >= 7 ? 13 - month : 7 - month;
    const prorated = Math.round(tarif.nominal * monthsLeft / 12);
    const diskon = discounts(s.id, cabangId, tahunAjaran, 'kegiatan', prorated);
    const final = Math.max(0, prorated - diskon);
    preview.push({
      siswa_id: s.id, siswa_nama: s.nama, jenis: 'kegiatan', nama: tarif.nama,
      nominal_awal: tarif.nominal, prorata_amount: prorated - tarif.nominal,
      diskon_amount: diskon, nominal_final: final,
      jenjang_nama: e.jenjang_nama, rombel_nama: e.rombel_nama, paket: e.paket,
      months_left: monthsLeft, already_exists: !!existing
    });
  }
  res.json({ preview, errors, tahun_ajaran: tahunAjaran, cabang_id: cabangId });
});

router.post('/generate-kegiatan', auth(['admin', 'admin_cabang']), (req, res) => {
  const tahunAjaran = req.body?.tahun_ajaran || schoolYearForDate();
  const cabangId = cabangParam(req);
  if (!cabangId) return res.status(400).json({ error: 'Cabang wajib' });
  if (!requireActiveCabang(req, res, cabangId)) return;
  const siswa = db.prepare("SELECT * FROM siswa WHERE status='aktif' ORDER BY nama").all();
  const created = [], errors = [];
  const [startYear] = tahunAjaran.split('/').map(Number);
  const tx = db.transaction(() => {
    for (const s of siswa) {
      const e = enrollmentOverlap(s.id, `${startYear}-07-01`, `${startYear + 1}-06-30`) || enrollmentAt(s.id, todayWIB());
      if (!e || Number(e.cabang_id) !== Number(cabangId) || e.jenjang_tipe === 'care') continue;
      const tarif = db.prepare("SELECT * FROM biaya_tarif WHERE cabang_id=? AND tahun_ajaran=? AND jenjang_id=? AND jenis='kegiatan' AND aktif=1 ORDER BY id LIMIT 1")
        .get(cabangId, tahunAjaran, e.jenjang_id);
      if (!tarif) { errors.push(`${s.nama}: tarif kegiatan belum ada`); continue; }
      const mulai = e.tanggal_mulai > `${startYear}-07-01` ? e.tanggal_mulai : `${startYear}-07-01`;
      const month = Number(mulai.slice(5, 7));
      const monthsLeft = month >= 7 ? 13 - month : 7 - month;
      const prorated = Math.round(tarif.nominal * monthsLeft / 12);
      const diskon = discounts(s.id, cabangId, tahunAjaran, 'kegiatan', prorated);
      const final = Math.max(0, prorated - diskon);
      const r = db.prepare(`INSERT OR IGNORE INTO tagihan
        (siswa_id,cabang_id,jenjang_id,rombel_id,paket,tahun_ajaran,periode,jenis,nama,nominal_awal,prorata_amount,diskon_amount,nominal_final,created_by,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(s.id, cabangId, e.jenjang_id, e.rombel_id, e.paket, tahunAjaran, tahunAjaran, 'kegiatan', tarif.nama, tarif.nominal, prorated - tarif.nominal, diskon, final, req.user.id, nowUtc(), nowUtc());
      if (r.changes) created.push({ siswa: s.nama, nominal: final });
    }
    audit(req.user, 'generate_kegiatan', 'tagihan', null, { cabang_id: cabangId, after: { tahunAjaran, created: created.length, errors } });
  });
  tx();
  res.json({ success: true, created_count: created.length, created, errors });
});

router.get('/tagihan', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const siswaId = req.query.siswa_id ? Number(req.query.siswa_id) : null;
  if (siswaId && !canReadStudentBilling(req, siswaId)) return res.status(403).json({ error: 'Akses tagihan siswa ditolak' });
  const cabangId = siswaId ? (req.user.role === 'admin' ? null : req.user.cabang_id) : cabangParam(req);
  if (cabangId && !requireCabang(req, res, cabangId)) return;
  const params = [];
  let where = 'WHERE 1=1';
  if (cabangId) { where += ' AND t.cabang_id=?'; params.push(cabangId); }
  if (siswaId) { where += ' AND t.siswa_id=?'; params.push(siswaId); }
  const rows = db.prepare(`
    SELECT t.*,s.nama AS siswa_nama,c.nama AS cabang_nama,j.nama AS jenjang_nama,r.nama AS rombel_nama,
           COALESCE((SELECT SUM(pa.nominal) FROM pembayaran_alokasi pa JOIN pembayaran p ON p.id=pa.pembayaran_id WHERE pa.tagihan_id=t.id AND p.status='confirmed'),0) AS paid_amount
    FROM tagihan t JOIN siswa s ON s.id=t.siswa_id JOIN cabang c ON c.id=t.cabang_id JOIN jenjang j ON j.id=t.jenjang_id JOIN rombel r ON r.id=t.rombel_id
    ${where} ORDER BY t.created_at DESC
  `).all(...params);
  res.json(rows);
});

router.put('/tagihan/:id/koreksi', auth(['admin', 'admin_cabang']), (req, res) => {
  const bill = db.prepare('SELECT * FROM tagihan WHERE id=?').get(req.params.id);
  if (!bill) return res.status(404).json({ error: 'Tagihan tidak ditemukan' });
  if (!requireCabang(req, res, bill.cabang_id)) return;
  if (bill.status === 'void') return res.status(400).json({ error: 'Tagihan sudah void' });
  const final = Number(req.body?.nominal_final);
  const reason = String(req.body?.reason || '').trim();
  if (!Number.isFinite(final) || final < 0 || !reason) return res.status(400).json({ error: 'Nominal final dan alasan wajib' });
  const koreksi = final - (bill.nominal_awal + bill.prorata_amount - bill.diskon_amount);
  db.prepare('UPDATE tagihan SET nominal_final=?,koreksi_amount=?,koreksi_reason=?,updated_at=? WHERE id=?')
    .run(final, koreksi, reason, nowUtc(), bill.id);
  refreshBillStatus(bill.id);
  audit(req.user, 'correct_bill', 'tagihan', bill.id, { cabang_id: bill.cabang_id, before: bill, after: { nominal_final: final }, reason });
  res.json({ success: true });
});

router.post('/tagihan/:id/void', auth(['admin', 'admin_cabang']), (req, res) => {
  const bill = db.prepare('SELECT * FROM tagihan WHERE id=?').get(req.params.id);
  if (!bill) return res.status(404).json({ error: 'Tagihan tidak ditemukan' });
  if (!requireCabang(req, res, bill.cabang_id)) return;
  const reason = String(req.body?.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'Alasan wajib' });
  db.prepare("UPDATE tagihan SET status='void',koreksi_reason=?,updated_at=? WHERE id=?").run(reason, nowUtc(), bill.id);
  audit(req.user, 'void_bill', 'tagihan', bill.id, { cabang_id: bill.cabang_id, before: bill, reason });
  res.json({ success: true });
});

router.get('/pembayaran/preview-alokasi', auth(['admin', 'admin_cabang']), (req, res) => {
  const cabangId = cabangParam(req);
  const siswaId = Number(req.query.siswa_id);
  const nominal = Number(req.query.nominal);
  if (!cabangId || !siswaId || !nominal) return res.status(400).json({ error: 'cabang_id, siswa_id, dan nominal wajib' });
  if (!requireCabang(req, res, cabangId)) return;
  const bills = db.prepare("SELECT id,nama,periode,nominal_final,status FROM tagihan WHERE siswa_id=? AND cabang_id=? AND status IN ('open','sebagian') ORDER BY periode,created_at")
    .all(siswaId, cabangId);
  const allocations = [];
  let remaining = nominal;
  for (const b of bills) {
    if (remaining <= 0) break;
    const paid = paidAmount(b.id);
    const unpaid = b.nominal_final - paid;
    const alloc = Math.min(remaining, unpaid);
    if (alloc > 0) {
      allocations.push({ tagihan_id: b.id, nama: b.nama, periode: b.periode, nominal_final: b.nominal_final, paid, unpaid, allocated: alloc });
      remaining -= alloc;
    }
  }
  res.json({ allocations, total_allocated: nominal - remaining, remaining_unallocated: remaining, siswa_id: siswaId, cabang_id: cabangId });
});

router.get('/pembayaran', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const cabangId = cabangParam(req);
  if (cabangId && !requireCabang(req, res, cabangId)) return;
  const params = [];
  let where = 'WHERE 1=1';
  if (cabangId) { where += ' AND p.cabang_id=?'; params.push(cabangId); }
  if (req.query.status) { where += ' AND p.status=?'; params.push(req.query.status); }
  res.json(db.prepare(`
    SELECT p.*,s.nama AS siswa_nama,c.nama AS cabang_nama,u.display_name AS created_by_name,
      COALESCE((SELECT SUM(pa.nominal) FROM pembayaran_alokasi pa WHERE pa.pembayaran_id=p.id), 0) AS allocated_amount,
      p.nominal - COALESCE((SELECT SUM(pa.nominal) FROM pembayaran_alokasi pa WHERE pa.pembayaran_id=p.id), 0) AS credit_amount
    FROM pembayaran p JOIN siswa s ON s.id=p.siswa_id JOIN cabang c ON c.id=p.cabang_id
    LEFT JOIN pengguna u ON u.id=p.created_by
    ${where} ORDER BY p.created_at DESC
  `).all(...params));
});

router.post('/pembayaran', auth(['admin', 'admin_cabang']), (req, res) => {
  const d = req.body || {};
  const cabangId = req.user.role === 'admin' ? d.cabang_id : req.user.cabang_id;
  if (!requireActiveCabang(req, res, cabangId)) return;
  if (!d.siswa_id || !d.nominal || !d.metode) return res.status(400).json({ error: 'Data pembayaran belum lengkap' });
  if (!studentBelongsToCabang(d.siswa_id, cabangId)) return res.status(403).json({ error: 'Siswa tidak terdaftar aktif di cabang pembayaran' });
  const status = req.user.role === 'admin' || d.metode === 'tunai' ? 'confirmed' : 'pending_verification';
  const receiptNo = status === 'confirmed' ? `TP-${db.prepare('SELECT kode FROM cabang WHERE id=?').get(cabangId).kode}-${schoolYearForDate(d.tanggal_bayar || todayWIB()).slice(0,4)}-${String(nextSequence(`receipt:${cabangId}:${schoolYearForDate(d.tanggal_bayar || todayWIB())}`)).padStart(6, '0')}` : null;
  const tx = db.transaction(() => {
    const r = db.prepare(`INSERT INTO pembayaran(cabang_id,siswa_id,receipt_no,tanggal_bayar,nominal,metode,status,reference,catatan,created_by,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(cabangId, d.siswa_id, receiptNo, d.tanggal_bayar || todayWIB(), d.nominal, d.metode, status, d.reference || null, d.catatan || null, req.user.id, nowUtc(), nowUtc());
    let remaining = Number(d.nominal);
    const bills = Array.isArray(d.alokasi) && d.alokasi.length
      ? d.alokasi.map(a => ({ id: a.tagihan_id, amount: a.nominal }))
      : db.prepare("SELECT id,nominal_final FROM tagihan WHERE siswa_id=? AND cabang_id=? AND status IN ('open','sebagian') ORDER BY periode,created_at").all(d.siswa_id, cabangId);
    for (const b of bills) {
      if (remaining <= 0) break;
      const bill = db.prepare('SELECT * FROM tagihan WHERE id=? AND cabang_id=?').get(b.id, cabangId);
      if (!bill) continue;
      const unpaid = bill.nominal_final - paidAmount(bill.id);
      const nominal = Math.min(remaining, b.amount || unpaid, unpaid);
      if (nominal > 0) {
        db.prepare('INSERT INTO pembayaran_alokasi(pembayaran_id,tagihan_id,nominal,created_at) VALUES(?,?,?,?)').run(r.lastInsertRowid, bill.id, nominal, nowUtc());
        remaining -= nominal;
        if (status === 'confirmed') refreshBillStatus(bill.id);
      }
    }
    audit(req.user, 'create', 'pembayaran', r.lastInsertRowid, { cabang_id: cabangId, after: { ...d, status } });
    return { id: r.lastInsertRowid, receipt_no: receiptNo, status };
  });
  res.json(tx());
});

router.post('/pembayaran/:id/verify', auth(['admin']), (req, res) => {
  const p = db.prepare('SELECT * FROM pembayaran WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Pembayaran tidak ditemukan' });
  if (p.status !== 'pending_verification') return res.status(400).json({ error: 'Pembayaran bukan pending' });
  const cabang = db.prepare('SELECT kode FROM cabang WHERE id=?').get(p.cabang_id);
  const receiptNo = `TP-${cabang.kode}-${schoolYearForDate(p.tanggal_bayar).slice(0,4)}-${String(nextSequence(`receipt:${p.cabang_id}:${schoolYearForDate(p.tanggal_bayar)}`)).padStart(6, '0')}`;
  db.prepare("UPDATE pembayaran SET status='confirmed',receipt_no=?,verified_by=?,verified_at=?,updated_at=? WHERE id=?")
    .run(receiptNo, req.user.id, nowUtc(), nowUtc(), p.id);
  const allocations = db.prepare('SELECT tagihan_id FROM pembayaran_alokasi WHERE pembayaran_id=?').all(p.id);
  for (const a of allocations) refreshBillStatus(a.tagihan_id);
  audit(req.user, 'verify_payment', 'pembayaran', p.id, { cabang_id: p.cabang_id, before: p, after: { status: 'confirmed', receiptNo } });

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

router.post('/pembayaran/:id/reject', auth(['admin']), (req, res) => {
  const p = db.prepare('SELECT * FROM pembayaran WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Pembayaran tidak ditemukan' });
  if (p.status !== 'pending_verification') return res.status(400).json({ error: 'Pembayaran bukan pending' });
  const reason = String(req.body?.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'Alasan wajib' });
  db.prepare("UPDATE pembayaran SET status='rejected',void_reason=?,verified_by=?,verified_at=?,updated_at=? WHERE id=?")
    .run(reason, req.user.id, nowUtc(), nowUtc(), p.id);
  const allocations = db.prepare('SELECT tagihan_id FROM pembayaran_alokasi WHERE pembayaran_id=?').all(p.id);
  for (const a of allocations) refreshBillStatus(a.tagihan_id);
  audit(req.user, 'reject_payment', 'pembayaran', p.id, { cabang_id: p.cabang_id, before: p, reason });
  res.json({ success: true });
});

router.post('/pembayaran/:id/void', auth(['admin', 'admin_cabang']), (req, res) => {
  const p = db.prepare('SELECT * FROM pembayaran WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Pembayaran tidak ditemukan' });
  if (!requireCabang(req, res, p.cabang_id)) return;
  if (['rejected','void'].includes(p.status)) return res.status(400).json({ error: 'Pembayaran sudah final' });
  const reason = String(req.body?.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'Alasan wajib' });
  db.prepare("UPDATE pembayaran SET status='void',void_reason=?,updated_at=? WHERE id=?").run(reason, nowUtc(), p.id);
  const allocations = db.prepare('SELECT tagihan_id FROM pembayaran_alokasi WHERE pembayaran_id=?').all(p.id);
  for (const a of allocations) refreshBillStatus(a.tagihan_id);
  audit(req.user, 'void_payment', 'pembayaran', p.id, { cabang_id: p.cabang_id, before: p, reason });
  res.json({ success: true });
});

router.get('/pembayaran/:id/alokasi', auth(['admin', 'admin_cabang']), (req, res) => {
  const p = db.prepare('SELECT * FROM pembayaran WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Pembayaran tidak ditemukan' });
  if (!requireCabang(req, res, p.cabang_id)) return;
  const payment = db.prepare(`
    SELECT p.*,
      COALESCE((SELECT SUM(pa.nominal) FROM pembayaran_alokasi pa WHERE pa.pembayaran_id=p.id), 0) AS allocated_amount
    FROM pembayaran p WHERE p.id=?
  `).get(req.params.id);
  payment.credit_amount = payment.nominal - payment.allocated_amount;
  const allocations = db.prepare('SELECT * FROM pembayaran_alokasi WHERE pembayaran_id=?').all(req.params.id);
  const bills = db.prepare(`
    SELECT t.*,
      COALESCE((SELECT pa.nominal FROM pembayaran_alokasi pa WHERE pa.tagihan_id=t.id AND pa.pembayaran_id=?), 0) AS allocated_amount
    FROM tagihan t
    WHERE t.siswa_id=? AND t.cabang_id=?
      AND (t.status IN ('open', 'sebagian') OR t.id IN (SELECT tagihan_id FROM pembayaran_alokasi WHERE pembayaran_id=?))
    ORDER BY t.periode, t.created_at
  `).all(req.params.id, payment.siswa_id, payment.cabang_id, req.params.id);
  res.json({ payment, allocations, bills });
});

router.put('/pembayaran/:id/alokasi', auth(['admin', 'admin_cabang']), (req, res) => {
  const p = db.prepare('SELECT * FROM pembayaran WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Pembayaran tidak ditemukan' });
  if (!requireCabang(req, res, p.cabang_id)) return;
  if (!['confirmed','pending_verification'].includes(p.status)) return res.status(400).json({ error: 'Alokasi hanya bisa diubah untuk pembayaran confirmed atau pending' });
  const alokasi = Array.isArray(req.body?.alokasi) ? req.body.alokasi : [];
  const total = alokasi.reduce((s, a) => s + Number(a.nominal || 0), 0);
  if (total > p.nominal) return res.status(400).json({ error: `Total alokasi (${total}) melebihi nominal pembayaran (${p.nominal})` });
  const tx = db.transaction(() => {
    const oldAllocs = db.prepare('SELECT * FROM pembayaran_alokasi WHERE pembayaran_id=?').all(p.id);
    db.prepare('DELETE FROM pembayaran_alokasi WHERE pembayaran_id=?').run(p.id);
    for (const a of alokasi) {
      const bill = db.prepare('SELECT * FROM tagihan WHERE id=? AND cabang_id=?').get(a.tagihan_id, p.cabang_id);
      if (!bill) throw new Error(`Tagihan #${a.tagihan_id} tidak ditemukan`);
      db.prepare('INSERT INTO pembayaran_alokasi(pembayaran_id,tagihan_id,nominal,created_at) VALUES(?,?,?,?)')
        .run(p.id, a.tagihan_id, a.nominal, nowUtc());
    }
    for (const old of oldAllocs) refreshBillStatus(old.tagihan_id);
    for (const a of alokasi) refreshBillStatus(a.tagihan_id);
    audit(req.user, 'edit_payment_allocation', 'pembayaran', p.id, { cabang_id: p.cabang_id, before: oldAllocs, after: alokasi });
  });
  try { tx(); res.json({ success: true }); } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/laporan', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const cabangId = cabangParam(req);
  if (!cabangId) return res.status(400).json({ error: 'Cabang wajib' });
  if (!requireCabang(req, res, cabangId)) return;
  const summary = db.prepare(`
    SELECT
      COUNT(*) AS total_tagihan,
      COALESCE(SUM(CASE WHEN status!='void' THEN nominal_final ELSE 0 END),0) AS total_nominal,
      COALESCE(SUM(CASE WHEN status='lunas' THEN nominal_final ELSE 0 END),0) AS total_lunas,
      COALESCE(SUM(CASE WHEN status IN ('open','sebagian') THEN nominal_final ELSE 0 END),0) AS total_outstanding,
      COUNT(CASE WHEN status='lunas' THEN 1 END) AS count_lunas,
      COUNT(CASE WHEN status IN ('open','sebagian') THEN 1 END) AS count_outstanding,
      COUNT(CASE WHEN status='void' THEN 1 END) AS count_void
    FROM tagihan WHERE cabang_id=?
  `).get(cabangId);
  const paid = db.prepare(`
    SELECT COALESCE(SUM(pa.nominal),0) AS total_paid
    FROM pembayaran_alokasi pa
    JOIN pembayaran p ON p.id=pa.pembayaran_id
    JOIN tagihan t ON t.id=pa.tagihan_id
    WHERE t.cabang_id=? AND p.status='confirmed'
  `).get(cabangId);
  const byJenis = db.prepare(`
    SELECT jenis,
      COUNT(*) AS count,
      COALESCE(SUM(CASE WHEN status!='void' THEN nominal_final ELSE 0 END),0) AS total,
      COALESCE(SUM(CASE WHEN status='lunas' THEN nominal_final ELSE 0 END),0) AS lunas,
      COALESCE(SUM(CASE WHEN status IN ('open','sebagian') THEN nominal_final ELSE 0 END),0) AS outstanding
    FROM tagihan WHERE cabang_id=? GROUP BY jenis ORDER BY jenis
  `).all(cabangId);
  const byPeriode = db.prepare(`
    SELECT periode,
      COUNT(*) AS count,
      COALESCE(SUM(CASE WHEN status!='void' THEN nominal_final ELSE 0 END),0) AS total,
      COALESCE(SUM(CASE WHEN status='lunas' THEN nominal_final ELSE 0 END),0) AS lunas,
      COALESCE(SUM(CASE WHEN status IN ('open','sebagian') THEN nominal_final ELSE 0 END),0) AS outstanding
    FROM tagihan WHERE cabang_id=? AND periode IS NOT NULL GROUP BY periode ORDER BY periode DESC LIMIT 12
  `).all(cabangId);
  res.json({ summary: { ...summary, total_paid: paid.total_paid }, by_jenis: byJenis, by_periode: byPeriode, cabang_id: cabangId });
});

router.post('/invoice', auth(['admin', 'admin_cabang']), (req, res) => {
  const ids = Array.isArray(req.body?.tagihan_ids) ? req.body.tagihan_ids.map(Number).filter(Boolean) : [];
  if (!ids.length) return res.status(400).json({ error: 'Pilih tagihan' });
  const bills = db.prepare(`SELECT * FROM tagihan WHERE id IN (${ids.map(() => '?').join(',')}) AND status!='void'`).all(...ids);
  if (bills.length !== ids.length) return res.status(400).json({ error: 'Ada tagihan tidak valid' });
  const first = bills[0];
  if (!bills.every(b => b.siswa_id === first.siswa_id && b.cabang_id === first.cabang_id)) return res.status(400).json({ error: 'Invoice tidak boleh lintas siswa/cabang' });
  if (!requireCabang(req, res, first.cabang_id)) return;
  const cabang = db.prepare('SELECT kode FROM cabang WHERE id=?').get(first.cabang_id);
  const invoiceNo = `INV-${cabang.kode}-${first.tahun_ajaran.slice(0,4)}-${String(nextSequence(`invoice:${first.cabang_id}:${first.tahun_ajaran}`)).padStart(6, '0')}`;
  const tx = db.transaction(() => {
    const r = db.prepare('INSERT INTO invoice(cabang_id,siswa_id,invoice_no,tahun_ajaran,created_by,created_at) VALUES(?,?,?,?,?,?)')
      .run(first.cabang_id, first.siswa_id, invoiceNo, first.tahun_ajaran, req.user.id, nowUtc());
    const stmt = db.prepare('INSERT INTO invoice_item(invoice_id,tagihan_id) VALUES(?,?)');
    for (const id of ids) stmt.run(r.lastInsertRowid, id);
    audit(req.user, 'create_invoice', 'invoice', r.lastInsertRowid, { cabang_id: first.cabang_id, after: { invoiceNo, ids } });
    return r.lastInsertRowid;
  });
  const invoiceId = tx();

  try {
    const walis = db.prepare('SELECT wali_pengguna_id FROM wali_siswa WHERE siswa_id=? AND aktif=1').all(first.siswa_id);
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
  if (cabangId) { where += ' AND i.cabang_id=?'; params.push(cabangId); }
  const rows = db.prepare(`
    SELECT i.*,s.nama AS siswa_nama,c.nama AS cabang_nama,
      (SELECT COALESCE(SUM(t.nominal_final),0) FROM invoice_item ii JOIN tagihan t ON t.id=ii.tagihan_id WHERE ii.invoice_id=i.id) AS total,
      (SELECT p.no_wa FROM wali_siswa ws JOIN pengguna p ON p.id=ws.wali_pengguna_id WHERE ws.siswa_id=i.siswa_id AND ws.aktif=1 LIMIT 1) AS wali_no_wa,
      (SELECT p.display_name FROM wali_siswa ws JOIN pengguna p ON p.id=ws.wali_pengguna_id WHERE ws.siswa_id=i.siswa_id AND ws.aktif=1 LIMIT 1) AS wali_nama
    FROM invoice i JOIN siswa s ON s.id=i.siswa_id JOIN cabang c ON c.id=i.cabang_id
    ${where} ORDER BY i.created_at DESC
  `).all(...params);

  const results = rows.map(r => ({
    ...r,
    public_key: getInvoiceKey(r.id)
  }));
  res.json(results);
});

// --- PDF & PUBLIC DOWNLOAD ENDPOINTS ---

function formatDate(isoStr) {
  if (!isoStr) return '-';
  try {
    const d = new Date(isoStr);
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return isoStr.slice(0, 10);
  }
}

function renderPdf(res, filename, title, draw) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  const doc = new PDFDocument({ margin: 48, size: 'A4', info: { Title: title } });
  doc.pipe(res);
  draw(doc);
  doc.end();
}

function generateInvoicePdfResponse(inv, res) {
  const items = db.prepare(`
    SELECT t.*,COALESCE((SELECT SUM(pa.nominal) FROM pembayaran_alokasi pa JOIN pembayaran p ON p.id=pa.pembayaran_id WHERE pa.tagihan_id=t.id AND p.status='confirmed'),0) AS paid_amount
    FROM invoice_item ii JOIN tagihan t ON t.id=ii.tagihan_id
    WHERE ii.invoice_id=? ORDER BY t.periode,t.jenis,t.nama
  `).all(inv.id);

  const enrollment = db.prepare(`
    SELECT j.nama AS jenjang_nama, r.nama AS rombel_nama, e.paket
    FROM siswa_enrollment e
    LEFT JOIN jenjang j ON j.id=e.jenjang_id
    LEFT JOIN rombel r ON r.id=e.rombel_id
    WHERE e.siswa_id=? AND e.status='aktif'
    LIMIT 1
  `).get(inv.siswa_id) || {};

  const wali = db.prepare(`
    SELECT p.display_name AS wali_nama, p.no_wa AS wali_no_wa
    FROM wali_siswa ws
    JOIN pengguna p ON p.id=ws.wali_pengguna_id
    WHERE ws.siswa_id=? AND ws.aktif=1
    LIMIT 1
  `).get(inv.siswa_id) || {};

  renderPdf(res, `invoice-${inv.invoice_no}.pdf`, `SIAGA Invoice ${inv.invoice_no}`, doc => {
    // Draw Top Accent Bar (Blue)
    doc.rect(48, 25, 500, 6).fillColor('#1e3a8a').fill();

    // Check for logo
    const logoPath = path.join(__dirname, '../../frontend/public/tp_logo.png');
    const hasLogo = fs.existsSync(logoPath);
    let textX = 48;
    if (hasLogo) {
      try {
        doc.image(logoPath, 48, 42, { width: 140 }); // landscape logo size matching UAT specs
        textX = 200;
      } catch (e) {
        console.error('Failed to render PDF logo:', e);
      }
    }

    // Organization Header (Left)
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#1e3a8a').text(inv.organisasi_nama || 'Yayasan Taruna Prima', textX, 42);
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#334155').text(`Cabang ${inv.cabang_nama || ''} (${inv.cabang_kode || ''})`, textX, 58);
    
    let branchContactStr = '';
    if (inv.cabang_alamat) branchContactStr += inv.cabang_alamat;
    if (inv.cabang_kontak) branchContactStr += (branchContactStr ? ' | Telp/WA: ' : 'Telp/WA: ') + inv.cabang_kontak;
    if (!branchContactStr) branchContactStr = 'Alamat & Kontak hubungi admin sekolah.';
    doc.font('Helvetica').fontSize(7.5).fillColor('#64748b').text(branchContactStr, textX, 70, { width: 280 });

    // Invoice Title and Metadata (Right Aligned)
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#0f172a').text('INVOICE', 328, 42, { align: 'right', width: 220 });
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#475569').text(inv.invoice_no, 328, 58, { align: 'right', width: 220 });
    doc.font('Helvetica').fontSize(8).fillColor('#64748b');
    doc.text(`Tanggal Terbit: ${formatDate(inv.created_at)}`, 328, 72, { align: 'right', width: 220 });
    doc.text(`Tahun Ajaran: ${inv.tahun_ajaran}`, 328, 84, { align: 'right', width: 220 });

    // Divider
    doc.moveTo(48, 122).lineTo(548, 122).strokeColor('#e2e8f0').stroke();

    // Student & Wali Info Block (Double-Column Card)
    doc.roundedRect(48, 134, 500, 48, 6).fillColor('#f8fafc').fill().strokeColor('#e2e8f0').stroke();
    
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#475569').text('SISWA TERHUBUNG', 60, 142);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text(inv.siswa_nama, 60, 154);
    
    let infoLeft = '';
    if (enrollment.jenjang_nama) infoLeft += enrollment.jenjang_nama;
    if (enrollment.rombel_nama) infoLeft += (infoLeft ? ' / ' : '') + enrollment.rombel_nama;
    if (enrollment.paket) infoLeft += (infoLeft ? ' / ' : '') + (enrollment.paket === 'full_day' ? 'Full Day' : 'Half Day');
    doc.font('Helvetica').fontSize(8).fillColor('#475569').text(infoLeft, 60, 168);

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#475569').text('WALI / PENERIMA', 260, 142);
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a').text(wali.wali_nama || '-', 260, 154);
    if (wali.wali_no_wa) {
      doc.font('Helvetica').fontSize(8).fillColor('#475569').text(`Telp/WA: ${wali.wali_no_wa}`, 260, 168);
    }

    let total = 0, paid = 0;
    for (const item of items) {
      total += item.nominal_final;
      paid += item.paid_amount;
    }
    const outstanding = Math.max(0, total - paid);
    const statusText = outstanding === 0 ? 'LUNAS' : (paid > 0 ? 'DIBAYAR SEBAGIAN' : 'BELUM DIBAYAR');
    const statusColor = outstanding === 0 ? '#10b981' : (paid > 0 ? '#3b82f6' : '#ef4444');

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#475569').text('STATUS TAGIHAN', 440, 142);
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(statusColor).text(statusText, 440, 154);

    // Table Header
    const tableTop = 196;
    doc.rect(48, tableTop, 500, 22).fillColor('#1e3a8a').fill();
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff');
    doc.text('Item Tagihan', 58, tableTop + 6, { width: 170 });
    doc.text('Periode', 238, tableTop + 6, { width: 70, align: 'center' });
    doc.text('Tagihan', 308, tableTop + 6, { width: 80, align: 'right' });
    doc.text('Terbayar', 388, tableTop + 6, { width: 80, align: 'right' });
    doc.text('Sisa', 468, tableTop + 6, { width: 70, align: 'right' });

    // Table Rows
    let currentY = tableTop + 22;
    items.forEach((item, index) => {
      const sisa = Math.max(0, item.nominal_final - item.paid_amount);
      
      // Zebra Striping
      if (index % 2 === 1) {
        doc.rect(48, currentY, 500, 22).fillColor('#f8fafc').fill();
      }
      
      doc.font('Helvetica').fontSize(9).fillColor('#334155');
      doc.text(item.nama, 58, currentY + 6, { width: 170, height: 12, ellipsis: true });
      doc.text(item.periode || '-', 238, currentY + 6, { width: 70, align: 'center' });
      doc.text(money(item.nominal_final), 308, currentY + 6, { width: 80, align: 'right' });
      doc.text(money(item.paid_amount), 388, currentY + 6, { width: 80, align: 'right' });
      
      if (sisa > 0) {
        doc.font('Helvetica-Bold').fillColor('#b91c1c').text(money(sisa), 468, currentY + 6, { width: 70, align: 'right' });
      } else {
        doc.font('Helvetica-Bold').fillColor('#047857').text('Lunas', 468, currentY + 6, { width: 70, align: 'right' });
      }

      // Border line
      doc.moveTo(48, currentY + 22).lineTo(548, currentY + 22).strokeColor('#f1f5f9').stroke();
      currentY += 22;
    });

    // Space below table
    currentY += 12;

    // Draw Payment Instructions & Totals Box
    if (inv.rekening_nomor) {
      doc.roundedRect(48, currentY, 260, 68, 6).fillColor('#eff6ff').fill().strokeColor('#cbd5e1').stroke();
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#1e40af').text('INSTRUKSI PEMBAYARAN', 58, currentY + 8);
      doc.font('Helvetica').fontSize(8.5).fillColor('#334155');
      doc.text(`Pembayaran dapat ditransfer ke rekening:`, 58, currentY + 20, { width: 240 });
      doc.font('Helvetica-Bold').text(`${inv.rekening_bank || ''} - ${inv.rekening_nomor}`, 58, currentY + 34);
      doc.font('Helvetica').text(`a.n. ${inv.rekening_nama || inv.organisasi_nama || ''}`, 58, currentY + 46);
    } else {
      // Fallback cash warning
      doc.roundedRect(48, currentY, 260, 68, 6).fillColor('#fffbeb').fill().strokeColor('#fef3c7').stroke();
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#b45309').text('INSTRUKSI PEMBAYARAN', 58, currentY + 8);
      doc.font('Helvetica').fontSize(8.5).fillColor('#334155');
      doc.text(`Informasi rekening belum diatur. Silakan lakukan pembayaran tunai ke petugas kasir sekolah di cabang Anda.`, 58, currentY + 20, { width: 240 });
    }

    // Totals Summary Box (Right)
    doc.rect(328, currentY, 220, 68).fillColor('#f8fafc').fill().strokeColor('#cbd5e1').stroke();
    doc.font('Helvetica').fontSize(9).fillColor('#475569');
    
    doc.text('Total Tagihan:', 338, currentY + 10, { width: 90 });
    doc.font('Helvetica-Bold').fillColor('#0f172a').text(money(total), 438, currentY + 10, { width: 100, align: 'right' });
    
    doc.font('Helvetica').fillColor('#475569').text('Total Terbayar:', 338, currentY + 26, { width: 90 });
    doc.font('Helvetica-Bold').fillColor('#047857').text(money(paid), 438, currentY + 26, { width: 100, align: 'right' });

    doc.moveTo(338, currentY + 42).lineTo(538, currentY + 42).strokeColor('#cbd5e1').stroke();

    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0f172a').text('Sisa Tagihan:', 338, currentY + 48, { width: 90 });
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(outstanding > 0 ? '#b91c1c' : '#047857').text(money(outstanding), 438, currentY + 48, { width: 100, align: 'right' });

    // Signature Block
    currentY += 80;
    if (currentY > 700) {
      doc.addPage();
      currentY = 48;
    }
    
    const sigY = currentY;
    doc.font('Helvetica').fontSize(9).fillColor('#334155');
    doc.text(`${inv.cabang_nama || 'Yogyakarta'}, ${formatDate(inv.created_at)}`, 360, sigY, { width: 188, align: 'center' });
    doc.text('Petugas Administrasi', 360, sigY + 12, { width: 188, align: 'center' });
    
    // Centered stamp box placeholder
    const stampBoxX = 360 + (188 - 50) / 2; // = 429
    doc.roundedRect(stampBoxX, sigY + 28, 50, 30, 3).dash(3, { space: 3 }).strokeColor('#cbd5e1').stroke();
    doc.font('Helvetica').fontSize(6).fillColor('#94a3b8').text('STAMP', stampBoxX, sigY + 40, { width: 50, align: 'center' });
    doc.undash();

    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0f172a');
    doc.text(inv.created_by_name || 'Petugas Sekolah', 360, sigY + 68, { width: 188, align: 'center' });
    doc.moveTo(380, sigY + 79).lineTo(528, sigY + 79).strokeColor('#cbd5e1').stroke();

    // Footer Note
    doc.font('Helvetica').fontSize(7.5).fillColor('#94a3b8');
    doc.text('Dokumen ini diterbitkan secara resmi oleh sistem sekolah dan merupakan bukti tagihan yang sah.', 48, 755, { align: 'center', width: 500 });
    doc.text('Terima kasih atas kerja sama Bapak/Ibu Wali Murid.', 48, 765, { align: 'center', width: 500 });
  });
}

function generatePaymentPdfResponse(pay, res) {
  const alloc = db.prepare(`
    SELECT pa.nominal,t.nama,t.periode FROM pembayaran_alokasi pa JOIN tagihan t ON t.id=pa.tagihan_id WHERE pa.pembayaran_id=?
  `).all(pay.id);

  const enrollment = db.prepare(`
    SELECT j.nama AS jenjang_nama, r.nama AS rombel_nama, e.paket
    FROM siswa_enrollment e
    LEFT JOIN jenjang j ON j.id=e.jenjang_id
    LEFT JOIN rombel r ON r.id=e.rombel_id
    WHERE e.siswa_id=? AND e.status='aktif'
    LIMIT 1
  `).get(pay.siswa_id) || {};

  const wali = db.prepare(`
    SELECT p.display_name AS wali_nama, p.no_wa AS wali_no_wa
    FROM wali_siswa ws
    JOIN pengguna p ON p.id=ws.wali_pengguna_id
    WHERE ws.siswa_id=? AND ws.aktif=1
    LIMIT 1
  `).get(pay.siswa_id) || {};

  renderPdf(res, `kuitansi-${pay.receipt_no}.pdf`, `SIAGA Receipt ${pay.receipt_no}`, doc => {
    // Draw Top Accent Bar (Green)
    doc.rect(48, 25, 500, 6).fillColor('#059669').fill();

    // Check for logo
    const logoPath = path.join(__dirname, '../../frontend/public/tp_logo.png');
    const hasLogo = fs.existsSync(logoPath);
    let textX = 48;
    if (hasLogo) {
      try {
        doc.image(logoPath, 48, 42, { width: 140 }); // landscape logo size matching UAT specs
        textX = 200;
      } catch (e) {
        console.error('Failed to render PDF logo:', e);
      }
    }

    // Organization Header (Left)
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#059669').text(pay.organisasi_nama || 'Yayasan Taruna Prima', textX, 42);
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#334155').text(`Cabang ${pay.cabang_nama || ''} (${pay.cabang_kode || ''})`, textX, 58);
    
    let branchContactStr = '';
    if (pay.cabang_alamat) branchContactStr += pay.cabang_alamat;
    if (pay.cabang_kontak) branchContactStr += (branchContactStr ? ' | Telp/WA: ' : 'Telp/WA: ') + pay.cabang_kontak;
    if (!branchContactStr) branchContactStr = 'Alamat & Kontak hubungi admin sekolah.';
    doc.font('Helvetica').fontSize(7.5).fillColor('#64748b').text(branchContactStr, textX, 70, { width: 280 });

    // Title and Metadata (Right Aligned)
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#0f172a').text('KUITANSI PEMBAYARAN', 328, 42, { align: 'right', width: 220 });
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#475569').text(pay.receipt_no, 328, 58, { align: 'right', width: 220 });
    doc.font('Helvetica').fontSize(8).fillColor('#64748b');
    doc.text(`Tanggal Bayar: ${formatDate(pay.tanggal_bayar)}`, 328, 72, { align: 'right', width: 220 });
    doc.text(`Metode: ${String(pay.metode || '').toUpperCase()}`, 328, 84, { align: 'right', width: 220 });

    // Divider
    doc.moveTo(48, 122).lineTo(548, 122).strokeColor('#e2e8f0').stroke();

    // Student Info Block (Emerald theme)
    doc.roundedRect(48, 134, 500, 48, 6).fillColor('#f0fdf4').fill().strokeColor('#bcf0da').stroke();
    
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#047857').text('SISWA', 60, 142);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text(pay.siswa_nama, 60, 154);
    
    let infoLeft = '';
    if (enrollment.jenjang_nama) infoLeft += enrollment.jenjang_nama;
    if (enrollment.rombel_nama) infoLeft += (infoLeft ? ' / ' : '') + enrollment.rombel_nama;
    if (enrollment.paket) infoLeft += (infoLeft ? ' / ' : '') + (enrollment.paket === 'full_day' ? 'Full Day' : 'Half Day');
    doc.font('Helvetica').fontSize(8).fillColor('#475569').text(infoLeft, 60, 168);

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#047857').text('WALI / PENERIMA', 260, 142);
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a').text(wali.wali_nama || '-', 260, 154);
    if (wali.wali_no_wa) {
      doc.font('Helvetica').fontSize(8).fillColor('#475569').text(`Telp/WA: ${wali.wali_no_wa}`, 260, 168);
    }

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#047857').text('STATUS', 440, 142);
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#047857').text('LUNAS / SELESAI', 440, 154);

    // Table Header
    const tableTop = 196;
    doc.rect(48, tableTop, 500, 22).fillColor('#059669').fill();
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff');
    doc.text('Alokasi Pembayaran', 58, tableTop + 6, { width: 300 });
    doc.text('Periode', 358, tableTop + 6, { width: 90, align: 'center' });
    doc.text('Nominal', 458, tableTop + 6, { width: 80, align: 'right' });

    // Table Rows
    let currentY = tableTop + 22;
    alloc.forEach((a, index) => {
      if (index % 2 === 1) {
        doc.rect(48, currentY, 500, 22).fillColor('#f0fdf4').fill();
      }
      
      doc.font('Helvetica').fontSize(9).fillColor('#334155');
      doc.text(a.nama, 58, currentY + 6, { width: 300, height: 12, ellipsis: true });
      doc.text(a.periode || '-', 358, currentY + 6, { width: 90, align: 'center' });
      doc.font('Helvetica-Bold').fillColor('#047857').text(money(a.nominal), 458, currentY + 6, { width: 80, align: 'right' });

      doc.moveTo(48, currentY + 22).lineTo(548, currentY + 22).strokeColor('#e2e8f0').stroke();
      currentY += 22;
    });

    // Space below table
    currentY += 12;

    // Catatan Pembayaran
    if (pay.catatan) {
      doc.roundedRect(48, currentY, 260, 56, 6).fillColor('#f9fafb').fill().strokeColor('#e5e7eb').stroke();
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#475569').text('CATATAN', 58, currentY + 8);
      doc.font('Helvetica').fontSize(8).fillColor('#64748b').text(pay.catatan, 58, currentY + 20, { width: 240 });
    }

    // Totals Summary Box (Right)
    doc.rect(328, currentY, 220, 56).fillColor('#f9fafb').fill().strokeColor('#e5e7eb').stroke();
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#475569').text('TOTAL BAYAR:', 338, currentY + 22, { width: 90 });
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#047857').text(money(pay.nominal), 438, currentY + 20, { width: 100, align: 'right' });

    // Signature and Stamp Block
    currentY += 80;
    if (currentY > 700) {
      doc.addPage();
      currentY = 48;
    }
    
    const sigY = currentY;
    doc.font('Helvetica').fontSize(9).fillColor('#334155');
    doc.text(`${pay.cabang_nama || 'Yogyakarta'}, ${formatDate(pay.tanggal_bayar)}`, 360, sigY, { width: 188, align: 'center' });
    doc.text('Penerima / Petugas Kasir', 360, sigY + 12, { width: 188, align: 'center' });
    
    // Stamp Box centered
    const stampBoxX = 360 + (188 - 50) / 2; // = 429
    doc.roundedRect(stampBoxX, sigY + 28, 50, 30, 3).dash(3, { space: 3 }).strokeColor('#cbd5e1').stroke();
    doc.font('Helvetica').fontSize(6).fillColor('#94a3b8').text('LUNAS', stampBoxX, sigY + 40, { width: 50, align: 'center' });
    doc.undash();

    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0f172a');
    doc.text(pay.created_by_name || 'Petugas Sekolah', 360, sigY + 68, { width: 188, align: 'center' });
    doc.moveTo(380, sigY + 79).lineTo(528, sigY + 79).strokeColor('#cbd5e1').stroke();

    // Footer Note
    doc.font('Helvetica').fontSize(7.5).fillColor('#94a3b8');
    doc.text('Dokumen ini diterbitkan secara resmi oleh sistem sekolah dan merupakan bukti pembayaran yang sah.', 48, 755, { align: 'center', width: 500 });
    doc.text('Terima kasih atas pembayaran Bapak/Ibu Wali Murid.', 48, 765, { align: 'center', width: 500 });
  });
}

function money(v) {
  return 'Rp ' + Number(v || 0).toLocaleString('id-ID');
}

// --- AUTHENTICATED PDF GENERATION ENDPOINTS ---

router.get('/invoice/:id/pdf', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const inv = db.prepare(`
    SELECT i.*,s.nama AS siswa_nama,c.nama AS cabang_nama,c.kode AS cabang_kode,c.alamat AS cabang_alamat,c.kontak AS cabang_kontak,o.nama AS organisasi_nama,o.rekening_bank,o.rekening_nomor,o.rekening_nama,u.display_name AS created_by_name
    FROM invoice i
    JOIN siswa s ON s.id=i.siswa_id
    JOIN cabang c ON c.id=i.cabang_id
    JOIN organisasi o ON o.id=1
    LEFT JOIN pengguna u ON u.id=i.created_by
    WHERE i.id=?
  `).get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Invoice tidak ditemukan' });
  if (!requireCabang(req, res, inv.cabang_id)) return;
  generateInvoicePdfResponse(inv, res);
});

router.get('/pembayaran/:id/pdf', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const pay = db.prepare(`
    SELECT p.*,s.nama AS siswa_nama,c.nama AS cabang_nama,c.kode AS cabang_kode,c.alamat AS cabang_alamat,c.kontak AS cabang_kontak,o.nama AS organisasi_nama,u.display_name AS created_by_name
    FROM pembayaran p
    JOIN siswa s ON s.id=p.siswa_id
    JOIN cabang c ON c.id=p.cabang_id
    JOIN organisasi o ON o.id=1
    LEFT JOIN pengguna u ON u.id=p.created_by
    WHERE p.id=?
  `).get(req.params.id);
  if (!pay) return res.status(404).json({ error: 'Pembayaran tidak ditemukan' });
  if (!requireCabang(req, res, pay.cabang_id)) return;
  if (pay.status !== 'confirmed') return res.status(400).json({ error: 'Kuitansi hanya untuk pembayaran confirmed' });
  generatePaymentPdfResponse(pay, res);
});

// --- PUBLIC DOWNLOAD ENDPOINTS ---

router.get('/public/invoice/:id/pdf', (req, res) => {
  const id = Number(req.params.id);
  const key = req.query.key;
  if (!key || key !== getInvoiceKey(id)) {
    return res.status(403).json({ error: 'Akses ditolak' });
  }
  const inv = db.prepare(`
    SELECT i.*,s.nama AS siswa_nama,c.nama AS cabang_nama,c.kode AS cabang_kode,c.alamat AS cabang_alamat,c.kontak AS cabang_kontak,o.nama AS organisasi_nama,o.rekening_bank,o.rekening_nomor,o.rekening_nama,u.display_name AS created_by_name
    FROM invoice i
    JOIN siswa s ON s.id=i.siswa_id
    JOIN cabang c ON c.id=i.cabang_id
    JOIN organisasi o ON o.id=1
    LEFT JOIN pengguna u ON u.id=i.created_by
    WHERE i.id=?
  `).get(id);
  if (!inv) return res.status(404).json({ error: 'Invoice tidak ditemukan' });
  generateInvoicePdfResponse(inv, res);
});

router.get('/public/pembayaran/:id/pdf', (req, res) => {
  const id = Number(req.params.id);
  const key = req.query.key;
  if (!key || key !== getPaymentKey(id)) {
    return res.status(403).json({ error: 'Akses ditolak' });
  }
  const pay = db.prepare(`
    SELECT p.*,s.nama AS siswa_nama,c.nama AS cabang_nama,c.kode AS cabang_kode,c.alamat AS cabang_alamat,c.kontak AS cabang_kontak,o.nama AS organisasi_nama,u.display_name AS created_by_name
    FROM pembayaran p
    JOIN siswa s ON s.id=p.siswa_id
    JOIN cabang c ON c.id=p.cabang_id
    JOIN organisasi o ON o.id=1
    LEFT JOIN pengguna u ON u.id=p.created_by
    WHERE p.id=?
  `).get(id);
  if (!pay) return res.status(404).json({ error: 'Pembayaran tidak ditemukan' });
  if (pay.status !== 'confirmed') return res.status(400).json({ error: 'Kuitansi hanya untuk pembayaran confirmed' });
  generatePaymentPdfResponse(pay, res);
});

// --- WALI BILLING VIEWS ENDPOINT ---

router.get('/wali/siswa/:siswaId', auth(['wali']), (req, res) => {
  const siswaId = Number(req.params.siswaId);
  const linked = db.prepare('SELECT 1 FROM wali_siswa WHERE wali_pengguna_id=? AND siswa_id=? AND aktif=1').get(req.user.id, siswaId);
  if (!linked) return res.status(403).json({ error: 'Akses ditolak' });

  const enrollment = db.prepare(`
    SELECT e.*, c.nama AS cabang_nama, j.nama AS jenjang_nama, r.nama AS rombel_nama
    FROM siswa_enrollment e
    JOIN cabang c ON c.id=e.cabang_id
    JOIN jenjang j ON j.id=e.jenjang_id
    JOIN rombel r ON r.id=e.rombel_id
    WHERE e.siswa_id=? AND e.status='aktif'
    LIMIT 1
  `).get(siswaId);

  const tagihan = db.prepare(`
    SELECT t.*,
           COALESCE((SELECT SUM(pa.nominal) FROM pembayaran_alokasi pa JOIN pembayaran p ON p.id=pa.pembayaran_id WHERE pa.tagihan_id=t.id AND p.status='confirmed'),0) AS paid_amount
    FROM tagihan t
    WHERE t.siswa_id=? AND t.status IN ('open', 'sebagian')
    ORDER BY t.periode DESC, t.created_at DESC
  `).all(siswaId);

  const invoices = db.prepare(`
    SELECT i.*,
      (SELECT COALESCE(SUM(t.nominal_final),0) FROM invoice_item ii JOIN tagihan t ON t.id=ii.tagihan_id WHERE ii.invoice_id=i.id) AS total
    FROM invoice i
    WHERE i.siswa_id=? AND i.status='issued'
    ORDER BY i.created_at DESC
  `).all(siswaId);
  const invoicesWithKeys = invoices.map(i => ({
    ...i,
    public_key: getInvoiceKey(i.id)
  }));

  const pembayaran = db.prepare(`
    SELECT p.*,
      COALESCE((SELECT SUM(pa.nominal) FROM pembayaran_alokasi pa WHERE pa.pembayaran_id=p.id),0) AS allocated_amount
    FROM pembayaran p
    WHERE p.siswa_id=? AND p.status IN ('confirmed', 'pending_verification')
    ORDER BY p.created_at DESC
  `).all(siswaId);
  const pembayaranWithKeys = pembayaran.map(p => ({
    ...p,
    public_key: getPaymentKey(p.id)
  }));

  res.json({
    enrollment,
    tagihan,
    invoices: invoicesWithKeys,
    pembayaran: pembayaranWithKeys
  });
});

module.exports = router;
