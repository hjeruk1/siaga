const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { nowUtc, todayWIB, schoolYearForDate, nextSequence, requireCabang, requireActiveCabang, audit, canAccessSiswa } = require('../utils/workflow');
const PDFDocument = require('pdfkit');

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
    SELECT p.*,s.nama AS siswa_nama,c.nama AS cabang_nama,u.display_name AS created_by_name
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

router.put('/pembayaran/:id/alokasi', auth(['admin', 'admin_cabang']), (req, res) => {
  const p = db.prepare('SELECT * FROM pembayaran WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Pembayaran tidak ditemukan' });
  if (!requireCabang(req, res, p.cabang_id)) return;
  if (!['confirmed','pending_verification'].includes(p.status)) return res.status(400).json({ error: 'Alokasi hanya bisa diubah untuk pembayaran confirmed atau pending' });
  const alokasi = Array.isArray(req.body?.alokasi) ? req.body.alokasi : [];
  const total = alokasi.reduce((s, a) => s + Number(a.nominal || 0), 0);
  if (total !== p.nominal) return res.status(400).json({ error: `Total alokasi (${total}) harus sama dengan nominal pembayaran (${p.nominal})` });
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
  res.json({ id: tx(), invoice_no: invoiceNo });
});

router.get('/invoice', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const cabangId = cabangParam(req);
  if (cabangId && !requireCabang(req, res, cabangId)) return;
  const params = [];
  let where = 'WHERE 1=1';
  if (cabangId) { where += ' AND i.cabang_id=?'; params.push(cabangId); }
  res.json(db.prepare(`
    SELECT i.*,s.nama AS siswa_nama,c.nama AS cabang_nama,
      (SELECT COALESCE(SUM(t.nominal_final),0) FROM invoice_item ii JOIN tagihan t ON t.id=ii.tagihan_id WHERE ii.invoice_id=i.id) AS total
    FROM invoice i JOIN siswa s ON s.id=i.siswa_id JOIN cabang c ON c.id=i.cabang_id
    ${where} ORDER BY i.created_at DESC
  `).all(...params));
});

router.get('/invoice/:id/pdf', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const inv = db.prepare(`
    SELECT i.*,s.nama AS siswa_nama,c.nama AS cabang_nama,c.kode AS cabang_kode,c.alamat AS cabang_alamat,o.nama AS organisasi_nama,o.rekening_bank,o.rekening_nomor,o.rekening_nama
    FROM invoice i
    JOIN siswa s ON s.id=i.siswa_id
    JOIN cabang c ON c.id=i.cabang_id
    JOIN organisasi o ON o.id=1
    WHERE i.id=?
  `).get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Invoice tidak ditemukan' });
  if (!requireCabang(req, res, inv.cabang_id)) return;
  const items = db.prepare(`
    SELECT t.*,COALESCE((SELECT SUM(pa.nominal) FROM pembayaran_alokasi pa JOIN pembayaran p ON p.id=pa.pembayaran_id WHERE pa.tagihan_id=t.id AND p.status='confirmed'),0) AS paid_amount
    FROM invoice_item ii JOIN tagihan t ON t.id=ii.tagihan_id
    WHERE ii.invoice_id=? ORDER BY t.periode,t.jenis,t.nama
  `).all(inv.id);
  renderPdf(res, `invoice-${inv.invoice_no}.pdf`, doc => {
    header(doc, inv.organisasi_nama, `Invoice ${inv.invoice_no}`, inv);
    doc.fontSize(11).text(`Siswa: ${inv.siswa_nama}`).text(`Tahun ajaran: ${inv.tahun_ajaran}`).moveDown();
    tableHeader(doc, ['Item', 'Periode', 'Tagihan', 'Terbayar', 'Sisa']);
    let total = 0, paid = 0;
    for (const item of items) {
      const sisa = Math.max(0, item.nominal_final - item.paid_amount);
      total += item.nominal_final; paid += item.paid_amount;
      tableRow(doc, [item.nama, item.periode || '-', money(item.nominal_final), money(item.paid_amount), money(sisa)]);
    }
    doc.moveDown().fontSize(12).font('Helvetica-Bold').text(`Total tagihan: ${money(total)}`).text(`Total terbayar: ${money(paid)}`).text(`Sisa: ${money(Math.max(0, total - paid))}`);
    paymentInfo(doc, inv);
  });
});

router.get('/pembayaran/:id/pdf', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const pay = db.prepare(`
    SELECT p.*,s.nama AS siswa_nama,c.nama AS cabang_nama,c.kode AS cabang_kode,c.alamat AS cabang_alamat,o.nama AS organisasi_nama
    FROM pembayaran p
    JOIN siswa s ON s.id=p.siswa_id
    JOIN cabang c ON c.id=p.cabang_id
    JOIN organisasi o ON o.id=1
    WHERE p.id=?
  `).get(req.params.id);
  if (!pay) return res.status(404).json({ error: 'Pembayaran tidak ditemukan' });
  if (!requireCabang(req, res, pay.cabang_id)) return;
  if (pay.status !== 'confirmed') return res.status(400).json({ error: 'Kuitansi hanya untuk pembayaran confirmed' });
  const alloc = db.prepare(`
    SELECT pa.nominal,t.nama,t.periode FROM pembayaran_alokasi pa JOIN tagihan t ON t.id=pa.tagihan_id WHERE pa.pembayaran_id=?
  `).all(pay.id);
  renderPdf(res, `kuitansi-${pay.receipt_no}.pdf`, doc => {
    header(doc, pay.organisasi_nama, `Kuitansi ${pay.receipt_no}`, pay);
    doc.fontSize(11).text(`Siswa: ${pay.siswa_nama}`).text(`Tanggal bayar: ${pay.tanggal_bayar}`).text(`Metode: ${pay.metode}`).text(`Nominal: ${money(pay.nominal)}`).moveDown();
    tableHeader(doc, ['Alokasi', 'Periode', 'Nominal']);
    for (const a of alloc) tableRow(doc, [a.nama, a.periode || '-', money(a.nominal)]);
  });
});

function renderPdf(res, filename, draw) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  const doc = new PDFDocument({ margin: 48, size: 'A4' });
  doc.pipe(res);
  draw(doc);
  doc.end();
}

function header(doc, orgName, title, data) {
  doc.font('Helvetica-Bold').fontSize(18).text(orgName || 'Yayasan Taruna Prima');
  doc.font('Helvetica').fontSize(10).text(`Cabang ${data.cabang_nama} (${data.cabang_kode})`);
  if (data.cabang_alamat) doc.text(data.cabang_alamat);
  doc.moveDown().font('Helvetica-Bold').fontSize(16).text(title).moveDown();
}

function tableHeader(doc, cols) {
  doc.font('Helvetica-Bold').fontSize(9);
  doc.text(cols.join(' | '));
  doc.moveTo(doc.x, doc.y + 3).lineTo(545, doc.y + 3).strokeColor('#cccccc').stroke();
  doc.moveDown(0.6).font('Helvetica');
}

function tableRow(doc, cols) {
  doc.fontSize(9).text(cols.join(' | '));
}

function paymentInfo(doc, inv) {
  if (!inv.rekening_nomor) return;
  doc.moveDown().font('Helvetica-Bold').fontSize(11).text('Instruksi pembayaran');
  doc.font('Helvetica').fontSize(10).text(`${inv.rekening_bank || ''} ${inv.rekening_nomor} a.n. ${inv.rekening_nama || inv.organisasi_nama || ''}`);
}

function money(v) {
  return 'Rp ' + Number(v || 0).toLocaleString('id-ID');
}

module.exports = router;
