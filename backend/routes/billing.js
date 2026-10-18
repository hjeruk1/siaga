const fs = require('fs');
const path = require('path');
const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { pembayaranSchema } = require('../schemas');
const {
  nowUtc,
  todayWIB,
  schoolYearForDate,
  nextSequence,
  requireCabang,
  requireActiveCabang,
  audit,
  canAccessSiswa,
  canWaliAccessSiswa,
  rejectFutureTanggal,
  notify
} = require('../utils/workflow');
const { uploadImage, ensureDir } = require('../utils/image-upload');
const sharp = require('sharp');
const PDFDocument = require('pdfkit');
const crypto = require('crypto');
const SECRET = process.env.JWT_SECRET || 'siaga-dev';

function publicKey(type, id) {
  const expires = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  const signature = crypto.createHmac('sha256', SECRET).update(`${type}:${id}:${expires}`).digest('hex');
  return `${expires}.${signature}`;
}

function validPublicKey(type, id, key) {
  const [expiresRaw, signature] = String(key || '').split('.');
  const expires = Number(expiresRaw);
  if (!Number.isInteger(expires) || expires < Math.floor(Date.now() / 1000) || !/^[a-f0-9]{64}$/.test(signature || ''))
    return false;
  const expected = crypto.createHmac('sha256', SECRET).update(`${type}:${id}:${expires}`).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function getInvoiceKey(invoiceId) {
  return publicKey('invoice', invoiceId);
}

function getPaymentKey(paymentId) {
  return publicKey('payment', paymentId);
}

function monthStart(period) {
  return `${period}-01`;
}

function cabangParam(req) {
  return req.user.role === 'admin' ? req.query.cabang_id || req.body?.cabang_id : req.user.cabang_id;
}

function canReadStudentBilling(req, siswaId) {
  if (req.user.role === 'admin') return true;
  const access = canAccessSiswa(req.user, siswaId);
  if (access) return true;
  if (req.user.role === 'admin_cabang' || req.user.role === 'kepsek') {
    return !!db
      .prepare('SELECT 1 FROM tagihan WHERE siswa_id=? AND cabang_id=? LIMIT 1')
      .get(siswaId, req.user.cabang_id);
  }
  return false;
}

function studentBelongsToCabang(siswaId, cabangId) {
  return !!db
    .prepare(
      `
    SELECT 1 FROM siswa_enrollment
    WHERE siswa_id=? AND cabang_id=? AND status='aktif'
    LIMIT 1
  `
    )
    .get(siswaId, cabangId);
}

// Memuat enrollment terbaru per siswa untuk satu jendela tanggal dalam SATU query.
//
// Menggantikan pemanggilan enrollmentOverlap()/enrollmentAt() per siswa — yang
// berarti satu query per siswa, dan setiap query memblokir event loop karena
// better-sqlite3 bersifat sinkron. Semantiknya identik: pada urutan
// (tanggal_mulai DESC, id DESC), baris PERTAMA per siswa adalah hasil yang sama
// persis dengan ORDER BY ... LIMIT 1 pada versi per-siswa.
function enrollmentsInWindow(start, end) {
  const rows = db
    .prepare(
      `
    SELECT e.*,j.tipe AS jenjang_tipe,j.nama AS jenjang_nama,r.nama AS rombel_nama,c.kode AS cabang_kode
    FROM siswa_enrollment e
    JOIN jenjang j ON j.id=e.jenjang_id
    JOIN rombel r ON r.id=e.rombel_id
    JOIN cabang c ON c.id=e.cabang_id
    WHERE e.tanggal_mulai<=? AND (e.tanggal_selesai IS NULL OR e.tanggal_selesai>=?)
    ORDER BY e.tanggal_mulai DESC,e.id DESC
  `
    )
    .all(end, start);
  const bySiswa = new Map();
  for (const row of rows) if (!bySiswa.has(row.siswa_id)) bySiswa.set(row.siswa_id, row);
  return bySiswa;
}

function monthEnd(period) {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

// Baris diskon dimuat sekali untuk seluruh cabang+tahun ajaran, dikelompokkan
// per siswa+jenis. Menggantikan satu query per (siswa, jenis) di dalam loop.
function discountRowsBySiswa(cabangId, tahunAjaran, jenisList) {
  const placeholders = jenisList.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT siswa_id,jenis,tipe,nilai FROM diskon_siswa
       WHERE cabang_id=? AND tahun_ajaran=? AND aktif=1 AND jenis IN (${placeholders})`
    )
    .all(cabangId, tahunAjaran, ...jenisList);
  const map = new Map();
  for (const row of rows) {
    const key = `${row.siswa_id}:${row.jenis}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

// Total diskon dari baris yang sudah dimuat. Hasilnya identik dengan discounts():
// penjumlahannya bilangan bulat, jadi urutan baris tidak berpengaruh.
// Menerima rows kosong/kosong (siswa tanpa diskon) dan mengembalikan 0.
function discountTotal(rows, amount) {
  let total = 0;
  for (const d of rows || []) total += d.tipe === 'persen' ? Math.round((amount * d.nilai) / 100) : d.nilai;
  return Math.min(amount, total);
}

function paidAmount(tagihanId) {
  return db
    .prepare(
      `SELECT COALESCE(SUM(pa.nominal),0) total
    FROM pembayaran_alokasi pa JOIN pembayaran p ON p.id=pa.pembayaran_id
    WHERE pa.tagihan_id=? AND p.status='confirmed'`
    )
    .get(tagihanId).total;
}

function refreshBillStatus(tagihanId) {
  const bill = db.prepare('SELECT * FROM tagihan WHERE id=?').get(tagihanId);
  if (!bill || bill.status === 'void') return;
  const paid = paidAmount(tagihanId);
  const status = paid <= 0 ? 'open' : paid < bill.nominal_final ? 'sebagian' : 'lunas';
  db.prepare('UPDATE tagihan SET status=?,updated_at=? WHERE id=?').run(status, nowUtc(), tagihanId);
}

// ---- Saldo kredit ----
// Kelebihan pembayaran (mis. bayar 1.200.000 untuk tagihan 1.000.000) tidak bisa
// dialokasikan ke tagihan mana pun. Sebelumnya selisihnya tidak dicatat ke mana
// pun, sehingga uang yang sudah diterima sekolah tidak menempel pada tagihan
// mana pun dan hilang dari catatan.
//
// tipe pada saldo_kredit:
//   credit -> kredit diberikan oleh sebuah pembayaran
//   used   -> kredit dipakai untuk melunasi tagihan
//   void   -> kredit dibatalkan karena pembayaran di-void atau ditolak
//
// Aturan saldo:
//   credit -> menambah saldo (bila pembayaran induknya sudah confirmed, atau
//             kredit lahir dari tagihan yang di-void sehingga tidak menunggu siapa pun)
//   used   -> mengurangi saldo (kredit sudah dipakai melunasi tagihan)
//   void   -> TIDAK berpengaruh dua arah. Baris ini adalah kredit yang dibatalkan,
//             jadi tidak boleh menambah saldo, tapi juga tidak boleh menguranginya
//             karena memang tidak pernah dihitung.
function creditBalance(siswaId) {
  return db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE
           WHEN sk.tipe='credit' AND (sk.pembayaran_id IS NULL OR p.status='confirmed') THEN sk.nominal
           ELSE 0 END),0)
         - COALESCE(SUM(CASE WHEN sk.tipe='used' THEN sk.nominal ELSE 0 END),0) AS saldo
       FROM saldo_kredit sk
       LEFT JOIN pembayaran p ON p.id=sk.pembayaran_id
       WHERE sk.siswa_id=?`
    )
    .get(siswaId).saldo;
}

function recordCredit(paymentId, siswaId, cabangId, nominal, catatan) {
  if (!(nominal > 0)) return null;
  return db
    .prepare(
      `INSERT INTO saldo_kredit(siswa_id,cabang_id,pembayaran_id,nominal,tipe,catatan,created_at)
       VALUES(?,?,?,?,'credit',?,?)`
    )
    .run(siswaId, cabangId, paymentId, nominal, catatan, nowUtc()).lastInsertRowid;
}

// Membatalkan kredit yang diberikan sebuah pembayaran. Dipanggil saat pembayaran
// ditolak atau di-void: uangnya tidak lagi menjadi hak siswa.
function reverseCredit(paymentId) {
  db.prepare("UPDATE saldo_kredit SET tipe='void' WHERE pembayaran_id=? AND tipe='credit'").run(paymentId);
}

router.get('/tarif', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const cabangId = cabangParam(req);
  if (cabangId && !requireCabang(req, res, cabangId)) return;
  const params = [];
  let where = 'WHERE 1=1';
  if (cabangId) {
    where += ' AND bt.cabang_id=?';
    params.push(cabangId);
  }
  if (req.query.tahun_ajaran) {
    where += ' AND bt.tahun_ajaran=?';
    params.push(req.query.tahun_ajaran);
  }
  res.json(
    db
      .prepare(
        `
    SELECT bt.*,c.nama AS cabang_nama,j.nama AS jenjang_nama
    FROM biaya_tarif bt JOIN cabang c ON c.id=bt.cabang_id JOIN jenjang j ON j.id=bt.jenjang_id
    ${where} ORDER BY c.nama,j.urutan,bt.jenis,bt.nama
  `
      )
      .all(...params)
  );
});

router.post('/tarif', auth(['admin']), (req, res) => {
  const d = req.body || {};
  if (!d.cabang_id || !d.tahun_ajaran || !d.jenjang_id || !d.jenis || !d.nama || d.nominal === undefined) {
    return res.status(400).json({ error: 'Tarif belum lengkap' });
  }
  try {
    const r = db
      .prepare(
        `INSERT INTO biaya_tarif(cabang_id,tahun_ajaran,jenjang_id,jenis,nama,nominal,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?)`
      )
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
  db.prepare('UPDATE biaya_tarif SET nama=?,nominal=?,aktif=?,updated_at=? WHERE id=?').run(
    req.body.nama || before.nama,
    req.body.nominal ?? before.nominal,
    req.body.aktif === 0 ? 0 : 1,
    nowUtc(),
    req.params.id
  );
  audit(req.user, 'update', 'biaya_tarif', req.params.id, { cabang_id: before.cabang_id, before, after: req.body });
  res.json({ success: true });
});

router.get('/diskon', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const cabangId = cabangParam(req);
  if (cabangId && !requireCabang(req, res, cabangId)) return;
  const params = [];
  let where = 'WHERE 1=1';
  if (cabangId) {
    where += ' AND d.cabang_id=?';
    params.push(cabangId);
  }
  if (req.query.siswa_id) {
    where += ' AND d.siswa_id=?';
    params.push(req.query.siswa_id);
  }
  res.json(
    db
      .prepare(
        `
    SELECT d.*,s.nama AS siswa_nama,c.nama AS cabang_nama
    FROM diskon_siswa d JOIN siswa s ON s.id=d.siswa_id JOIN cabang c ON c.id=d.cabang_id
    ${where} ORDER BY d.created_at DESC
  `
      )
      .all(...params)
  );
});

// Cari baris diskon aktif dengan identitas yang sama persis (termasuk catatan,
// NULL disamakan dengan string kosong). Dipakai untuk menolak duplikat dengan
// pesan yang jelas, sebelum unique index ux_diskon_siswa_kembar (migrasi 003)
// melempar error mentah. `exceptId` dipakai saat update supaya baris yang
// sedang diedit tidak dianggap bentrok dengan dirinya sendiri.
function diskonKembar({ siswaId, cabangId, tahunAjaran, jenis, tipe, nilai, catatan, exceptId }) {
  return db
    .prepare(
      `SELECT id FROM diskon_siswa
       WHERE aktif=1 AND siswa_id=? AND cabang_id=? AND tahun_ajaran=? AND jenis=? AND tipe=? AND nilai=?
         AND COALESCE(catatan,'')=COALESCE(?,'') AND id<>?`
    )
    .get(siswaId, cabangId, tahunAjaran, jenis, tipe, nilai, catatan ?? null, exceptId || 0);
}

function pesanDiskonKembar({ jenis, tipe, nilai, tahunAjaran }) {
  const potongan = tipe === 'persen' ? `${nilai}%` : `Rp ${nilai}`;
  return `Diskon ${String(jenis).toUpperCase()} ${potongan} sudah ada untuk siswa ini pada tahun ajaran ${tahunAjaran}. Edit diskon yang ada, atau ubah nilai/catatannya kalau memang diskon berbeda.`;
}

router.post('/diskon', auth(['admin', 'admin_cabang']), (req, res) => {
  const d = req.body || {};
  const cabangId = req.user.role === 'admin' ? d.cabang_id : req.user.cabang_id;
  if (!requireActiveCabang(req, res, cabangId)) return;
  if (!d.siswa_id || !d.tahun_ajaran || !d.jenis || !d.tipe || d.nilai === undefined)
    return res.status(400).json({ error: 'Data diskon belum lengkap' });
  if (!studentBelongsToCabang(d.siswa_id, cabangId))
    return res.status(403).json({ error: 'Siswa tidak terdaftar aktif di cabang diskon' });
  const nilai = Number(d.nilai);
  if (!Number.isFinite(nilai) || nilai < 0 || (d.tipe === 'persen' && nilai > 100))
    return res.status(400).json({ error: 'Nilai diskon tidak valid' });
  const catatan = d.catatan || null;
  const kembar = diskonKembar({
    siswaId: d.siswa_id,
    cabangId,
    tahunAjaran: d.tahun_ajaran,
    jenis: d.jenis,
    tipe: d.tipe,
    nilai,
    catatan
  });
  if (kembar)
    return res
      .status(409)
      .json({ error: pesanDiskonKembar({ jenis: d.jenis, tipe: d.tipe, nilai, tahunAjaran: d.tahun_ajaran }) });
  const r = db
    .prepare(
      `INSERT INTO diskon_siswa(siswa_id,cabang_id,tahun_ajaran,jenis,tipe,nilai,catatan,created_by,created_at)
    VALUES(?,?,?,?,?,?,?,?,?)`
    )
    .run(d.siswa_id, cabangId, d.tahun_ajaran, d.jenis, d.tipe, nilai, catatan, req.user.id, nowUtc());
  audit(req.user, 'create', 'diskon_siswa', r.lastInsertRowid, { cabang_id: cabangId, after: d });
  res.json({ id: r.lastInsertRowid });
});

router.put('/diskon/:id', auth(['admin', 'admin_cabang']), (req, res) => {
  const before = db.prepare('SELECT * FROM diskon_siswa WHERE id=?').get(req.params.id);
  if (!before) return res.status(404).json({ error: 'Diskon tidak ditemukan' });
  if (!requireCabang(req, res, before.cabang_id)) return;
  const d = req.body || {};
  const tipe = d.tipe || before.tipe;
  const nilai = d.nilai !== undefined ? d.nilai : before.nilai;
  const aktif = d.aktif !== undefined ? d.aktif : before.aktif;
  const catatan = d.catatan !== undefined ? d.catatan : before.catatan;
  // Mengaktifkan kembali baris bisa membuatnya bentrok dengan baris aktif lain
  // yang identitasnya sama. Dicek di sini supaya dijawab 409, bukan 500 dari
  // unique index.
  if (Number(aktif) === 1) {
    const kembar = diskonKembar({
      siswaId: before.siswa_id,
      cabangId: before.cabang_id,
      tahunAjaran: before.tahun_ajaran,
      jenis: before.jenis,
      tipe,
      nilai: Number(nilai),
      catatan,
      exceptId: req.params.id
    });
    if (kembar)
      return res.status(409).json({
        error: pesanDiskonKembar({
          jenis: before.jenis,
          tipe,
          nilai: Number(nilai),
          tahunAjaran: before.tahun_ajaran
        })
      });
  }
  db.prepare(
    `UPDATE diskon_siswa 
    SET tipe=?, nilai=?, aktif=?, catatan=? 
    WHERE id=?`
  ).run(tipe, nilai, aktif, catatan, req.params.id);
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
  // Satu query untuk semua enrollment, dan statement disiapkan sekali di luar
  // loop. Sebelumnya: satu query enrollment per siswa, ditambah db.prepare()
  // yang dikompilasi ulang di setiap iterasi.
  const siswa = db.prepare("SELECT id,nama FROM siswa WHERE status='aktif' ORDER BY nama").all();
  const enrollmentBySiswa = enrollmentsInWindow(tgl, monthEnd(period));
  const tarifStmt = db.prepare(
    'SELECT * FROM biaya_tarif WHERE cabang_id=? AND tahun_ajaran=? AND jenjang_id=? AND jenis=? AND aktif=1 ORDER BY id LIMIT 1'
  );
  const existingStmt = db.prepare(
    'SELECT id FROM tagihan WHERE siswa_id=? AND cabang_id=? AND tahun_ajaran=? AND periode=? AND jenis=? AND nama=?'
  );
  const diskonMap = discountRowsBySiswa(cabangId, tahunAjaran, ['care', 'spp', 'full_day']);
  const preview = [];
  const errors = [];
  for (const s of siswa) {
    const e = enrollmentBySiswa.get(s.id);
    if (!e || Number(e.cabang_id) !== Number(cabangId)) continue;
    const items = [];
    if (e.jenjang_tipe === 'care') items.push('care');
    else {
      items.push('spp');
      if (e.paket === 'full_day') items.push('full_day');
    }
    for (const jenis of items) {
      const tarif = tarifStmt.get(cabangId, tahunAjaran, e.jenjang_id, jenis);
      if (!tarif) {
        errors.push(`${s.nama}: tarif ${jenis} belum ada`);
        continue;
      }
      const existing = existingStmt.get(s.id, cabangId, tahunAjaran, period, jenis, tarif.nama);
      const diskon = discountTotal(diskonMap.get(`${s.id}:${jenis}`), tarif.nominal);
      const final = Math.max(0, tarif.nominal - diskon);
      preview.push({
        siswa_id: s.id,
        siswa_nama: s.nama,
        jenis,
        nama: tarif.nama,
        nominal_awal: tarif.nominal,
        diskon_amount: diskon,
        nominal_final: final,
        jenjang_nama: e.jenjang_nama,
        rombel_nama: e.rombel_nama,
        paket: e.paket,
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
  // Sama seperti /generate-bulanan/preview: satu query enrollment untuk semua
  // siswa, dan statement disiapkan sekali di luar loop.
  const siswa = db.prepare("SELECT id,nama FROM siswa WHERE status='aktif' ORDER BY nama").all();
  const enrollmentBySiswa = enrollmentsInWindow(tgl, monthEnd(period));
  const tarifStmt = db.prepare(
    'SELECT * FROM biaya_tarif WHERE cabang_id=? AND tahun_ajaran=? AND jenjang_id=? AND jenis=? AND aktif=1 ORDER BY id LIMIT 1'
  );
  const insertStmt = db.prepare(
    `INSERT OR IGNORE INTO tagihan
          (siswa_id,cabang_id,jenjang_id,rombel_id,paket,tahun_ajaran,periode,jenis,nama,nominal_awal,diskon_amount,nominal_final,created_by,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  const diskonMap = discountRowsBySiswa(cabangId, tahunAjaran, ['care', 'spp', 'full_day']);
  const created = [];
  const errors = [];
  const tx = db.transaction(() => {
    for (const s of siswa) {
      const e = enrollmentBySiswa.get(s.id);
      if (!e || Number(e.cabang_id) !== Number(cabangId)) continue;
      const items = [];
      if (e.jenjang_tipe === 'care') items.push('care');
      else {
        items.push('spp');
        if (e.paket === 'full_day') items.push('full_day');
      }
      for (const jenis of items) {
        const tarif = tarifStmt.get(cabangId, tahunAjaran, e.jenjang_id, jenis);
        if (!tarif) {
          errors.push(`${s.nama}: tarif ${jenis} belum ada`);
          continue;
        }
        const diskon = discountTotal(diskonMap.get(`${s.id}:${jenis}`), tarif.nominal);
        const final = Math.max(0, tarif.nominal - diskon);
        const r = insertStmt.run(
          s.id,
          cabangId,
          e.jenjang_id,
          e.rombel_id,
          e.paket,
          tahunAjaran,
          period,
          jenis,
          tarif.nama,
          tarif.nominal,
          diskon,
          final,
          req.user.id,
          nowUtc(),
          nowUtc()
        );
        if (r.changes) created.push({ siswa: s.nama, jenis, nominal: final });
      }
    }
    audit(req.user, 'generate_bulanan', 'tagihan', null, {
      cabang_id: cabangId,
      after: { period, created: created.length, errors }
    });
  });
  tx();
  res.json({ success: true, created_count: created.length, created, errors });
});

router.post('/generate-kegiatan/preview', auth(['admin', 'admin_cabang']), (req, res) => {
  const tahunAjaran = req.body?.tahun_ajaran || schoolYearForDate();
  const cabangId = cabangParam(req);
  if (!cabangId) return res.status(400).json({ error: 'Cabang wajib' });
  if (!requireActiveCabang(req, res, cabangId)) return;
  const siswa = db.prepare("SELECT id,nama FROM siswa WHERE status='aktif' ORDER BY nama").all();
  const preview = [],
    errors = [];
  const [startYear] = tahunAjaran.split('/').map(Number);
  // Dua query batch menggantikan dua query per siswa. enrollmentAt(s.id, hari ini)
  // dipakai sebagai fallback, jadi keduanya disiapkan sekali.
  const enrollmentTahunAjaran = enrollmentsInWindow(`${startYear}-07-01`, `${startYear + 1}-06-30`);
  const enrollmentHariIni = enrollmentsInWindow(todayWIB(), todayWIB());
  const tarifStmt = db.prepare(
    "SELECT * FROM biaya_tarif WHERE cabang_id=? AND tahun_ajaran=? AND jenjang_id=? AND jenis='kegiatan' AND aktif=1 ORDER BY id LIMIT 1"
  );
  const existingStmt = db.prepare(
    'SELECT id FROM tagihan WHERE siswa_id=? AND cabang_id=? AND tahun_ajaran=? AND jenis=? AND nama=?'
  );
  const diskonMap = discountRowsBySiswa(cabangId, tahunAjaran, ['kegiatan']);
  for (const s of siswa) {
    const e = enrollmentTahunAjaran.get(s.id) || enrollmentHariIni.get(s.id);
    if (!e || Number(e.cabang_id) !== Number(cabangId) || e.jenjang_tipe === 'care') continue;
    const tarif = tarifStmt.get(cabangId, tahunAjaran, e.jenjang_id);
    if (!tarif) {
      errors.push(`${s.nama}: tarif kegiatan belum ada`);
      continue;
    }
    const existing = existingStmt.get(s.id, cabangId, tahunAjaran, 'kegiatan', tarif.nama);
    const mulai = e.tanggal_mulai > `${startYear}-07-01` ? e.tanggal_mulai : `${startYear}-07-01`;
    const month = Number(mulai.slice(5, 7));
    const monthsLeft = month >= 7 ? 13 - month : 7 - month;
    const prorated = Math.round((tarif.nominal * monthsLeft) / 12);
    const diskon = discountTotal(diskonMap.get(`${s.id}:kegiatan`), prorated);
    const final = Math.max(0, prorated - diskon);
    preview.push({
      siswa_id: s.id,
      siswa_nama: s.nama,
      jenis: 'kegiatan',
      nama: tarif.nama,
      nominal_awal: tarif.nominal,
      prorata_amount: prorated - tarif.nominal,
      diskon_amount: diskon,
      nominal_final: final,
      jenjang_nama: e.jenjang_nama,
      rombel_nama: e.rombel_nama,
      paket: e.paket,
      months_left: monthsLeft,
      already_exists: !!existing
    });
  }
  res.json({ preview, errors, tahun_ajaran: tahunAjaran, cabang_id: cabangId });
});

router.post('/generate-kegiatan', auth(['admin', 'admin_cabang']), (req, res) => {
  const tahunAjaran = req.body?.tahun_ajaran || schoolYearForDate();
  const cabangId = cabangParam(req);
  if (!cabangId) return res.status(400).json({ error: 'Cabang wajib' });
  if (!requireActiveCabang(req, res, cabangId)) return;
  const siswa = db.prepare("SELECT id,nama FROM siswa WHERE status='aktif' ORDER BY nama").all();
  const created = [],
    errors = [];
  const [startYear] = tahunAjaran.split('/').map(Number);
  const enrollmentTahunAjaran = enrollmentsInWindow(`${startYear}-07-01`, `${startYear + 1}-06-30`);
  const enrollmentHariIni = enrollmentsInWindow(todayWIB(), todayWIB());
  const tarifStmt = db.prepare(
    "SELECT * FROM biaya_tarif WHERE cabang_id=? AND tahun_ajaran=? AND jenjang_id=? AND jenis='kegiatan' AND aktif=1 ORDER BY id LIMIT 1"
  );
  const insertStmt = db.prepare(
    `INSERT OR IGNORE INTO tagihan
        (siswa_id,cabang_id,jenjang_id,rombel_id,paket,tahun_ajaran,periode,jenis,nama,nominal_awal,prorata_amount,diskon_amount,nominal_final,created_by,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  const diskonMap = discountRowsBySiswa(cabangId, tahunAjaran, ['kegiatan']);
  const tx = db.transaction(() => {
    for (const s of siswa) {
      const e = enrollmentTahunAjaran.get(s.id) || enrollmentHariIni.get(s.id);
      if (!e || Number(e.cabang_id) !== Number(cabangId) || e.jenjang_tipe === 'care') continue;
      const tarif = tarifStmt.get(cabangId, tahunAjaran, e.jenjang_id);
      if (!tarif) {
        errors.push(`${s.nama}: tarif kegiatan belum ada`);
        continue;
      }
      const mulai = e.tanggal_mulai > `${startYear}-07-01` ? e.tanggal_mulai : `${startYear}-07-01`;
      const month = Number(mulai.slice(5, 7));
      const monthsLeft = month >= 7 ? 13 - month : 7 - month;
      const prorated = Math.round((tarif.nominal * monthsLeft) / 12);
      const diskon = discountTotal(diskonMap.get(`${s.id}:kegiatan`), prorated);
      const final = Math.max(0, prorated - diskon);
      const r = insertStmt.run(
        s.id,
        cabangId,
        e.jenjang_id,
        e.rombel_id,
        e.paket,
        tahunAjaran,
        tahunAjaran,
        'kegiatan',
        tarif.nama,
        tarif.nominal,
        prorated - tarif.nominal,
        diskon,
        final,
        req.user.id,
        nowUtc(),
        nowUtc()
      );
      if (r.changes) created.push({ siswa: s.nama, nominal: final });
    }
    audit(req.user, 'generate_kegiatan', 'tagihan', null, {
      cabang_id: cabangId,
      after: { tahunAjaran, created: created.length, errors }
    });
  });
  tx();
  res.json({ success: true, created_count: created.length, created, errors });
});

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

// --- PDF & PUBLIC DOWNLOAD ENDPOINTS ---

function formatDate(isoStr) {
  if (!isoStr) return '-';
  try {
    const d = new Date(isoStr);
    const months = [
      'Januari',
      'Februari',
      'Maret',
      'April',
      'Mei',
      'Juni',
      'Juli',
      'Agustus',
      'September',
      'Oktober',
      'November',
      'Desember'
    ];
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
  const items = db
    .prepare(
      `
    SELECT t.*,COALESCE((SELECT SUM(pa.nominal) FROM pembayaran_alokasi pa JOIN pembayaran p ON p.id=pa.pembayaran_id WHERE pa.tagihan_id=t.id AND p.status='confirmed'),0) AS paid_amount
    FROM invoice_item ii JOIN tagihan t ON t.id=ii.tagihan_id
    WHERE ii.invoice_id=? ORDER BY t.periode,t.jenis,t.nama
  `
    )
    .all(inv.id);

  const enrollment =
    db
      .prepare(
        `
    SELECT j.nama AS jenjang_nama, r.nama AS rombel_nama, e.paket
    FROM siswa_enrollment e
    LEFT JOIN jenjang j ON j.id=e.jenjang_id
    LEFT JOIN rombel r ON r.id=e.rombel_id
    WHERE e.siswa_id=? AND e.status='aktif'
    LIMIT 1
  `
      )
      .get(inv.siswa_id) || {};

  const wali =
    db
      .prepare(
        `
    SELECT p.display_name AS wali_nama, p.no_wa AS wali_no_wa
    FROM wali_siswa ws
    JOIN pengguna p ON p.id=ws.wali_pengguna_id
    WHERE ws.siswa_id=? AND ws.aktif=1
    LIMIT 1
  `
      )
      .get(inv.siswa_id) || {};

  renderPdf(res, `invoice-${inv.invoice_no}.pdf`, `SIAGA Invoice ${inv.invoice_no}`, (doc) => {
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
    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor('#1e3a8a')
      .text(inv.organisasi_nama || 'Yayasan Taruna Prima', textX, 42);
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#334155')
      .text(`Cabang ${inv.cabang_nama || ''} (${inv.cabang_kode || ''})`, textX, 58);

    let branchContactStr = '';
    if (inv.cabang_alamat) branchContactStr += inv.cabang_alamat;
    if (inv.cabang_kontak) branchContactStr += (branchContactStr ? ' | Telp/WA: ' : 'Telp/WA: ') + inv.cabang_kontak;
    if (!branchContactStr) branchContactStr = 'Alamat & Kontak hubungi admin sekolah.';
    doc.font('Helvetica').fontSize(7.5).fillColor('#64748b').text(branchContactStr, textX, 70, { width: 280 });

    // Invoice Title and Metadata (Right Aligned)
    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .fillColor('#0f172a')
      .text('INVOICE', 328, 42, { align: 'right', width: 220 });
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#475569')
      .text(inv.invoice_no, 328, 58, { align: 'right', width: 220 });
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
    if (enrollment.paket)
      infoLeft += (infoLeft ? ' / ' : '') + (enrollment.paket === 'full_day' ? 'Full Day' : 'Half Day');
    doc.font('Helvetica').fontSize(8).fillColor('#475569').text(infoLeft, 60, 168);

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#475569').text('WALI / PENERIMA', 260, 142);
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#0f172a')
      .text(wali.wali_nama || '-', 260, 154);
    if (wali.wali_no_wa) {
      doc.font('Helvetica').fontSize(8).fillColor('#475569').text(`Telp/WA: ${wali.wali_no_wa}`, 260, 168);
    }

    let total = 0,
      paid = 0;
    for (const item of items) {
      total += item.nominal_final;
      paid += item.paid_amount;
    }
    const outstanding = Math.max(0, total - paid);
    const statusText = outstanding === 0 ? 'LUNAS' : paid > 0 ? 'DIBAYAR SEBAGIAN' : 'BELUM DIBAYAR';
    const statusColor = outstanding === 0 ? '#10b981' : paid > 0 ? '#3b82f6' : '#ef4444';

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
        doc
          .font('Helvetica-Bold')
          .fillColor('#b91c1c')
          .text(money(sisa), 468, currentY + 6, { width: 70, align: 'right' });
      } else {
        doc
          .font('Helvetica-Bold')
          .fillColor('#047857')
          .text('Lunas', 468, currentY + 6, { width: 70, align: 'right' });
      }

      // Border line
      doc
        .moveTo(48, currentY + 22)
        .lineTo(548, currentY + 22)
        .strokeColor('#f1f5f9')
        .stroke();
      currentY += 22;
    });

    // Space below table
    currentY += 12;

    // Draw Payment Instructions & Totals Box
    if (inv.rekening_nomor) {
      doc.roundedRect(48, currentY, 260, 68, 6).fillColor('#eff6ff').fill().strokeColor('#cbd5e1').stroke();
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor('#1e40af')
        .text('INSTRUKSI PEMBAYARAN', 58, currentY + 8);
      doc.font('Helvetica').fontSize(8.5).fillColor('#334155');
      doc.text(`Pembayaran dapat ditransfer ke rekening:`, 58, currentY + 20, { width: 240 });
      doc.font('Helvetica-Bold').text(`${inv.rekening_bank || ''} - ${inv.rekening_nomor}`, 58, currentY + 34);
      doc.font('Helvetica').text(`a.n. ${inv.rekening_nama || inv.organisasi_nama || ''}`, 58, currentY + 46);
    } else {
      // Fallback cash warning
      doc.roundedRect(48, currentY, 260, 68, 6).fillColor('#fffbeb').fill().strokeColor('#fef3c7').stroke();
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor('#b45309')
        .text('INSTRUKSI PEMBAYARAN', 58, currentY + 8);
      doc.font('Helvetica').fontSize(8.5).fillColor('#334155');
      doc.text(
        `Informasi rekening belum diatur. Silakan lakukan pembayaran tunai ke petugas kasir sekolah di cabang Anda.`,
        58,
        currentY + 20,
        { width: 240 }
      );
    }

    // Totals Summary Box (Right)
    doc.rect(328, currentY, 220, 68).fillColor('#f8fafc').fill().strokeColor('#cbd5e1').stroke();
    doc.font('Helvetica').fontSize(9).fillColor('#475569');

    doc.text('Total Tagihan:', 338, currentY + 10, { width: 90 });
    doc
      .font('Helvetica-Bold')
      .fillColor('#0f172a')
      .text(money(total), 438, currentY + 10, { width: 100, align: 'right' });

    doc
      .font('Helvetica')
      .fillColor('#475569')
      .text('Total Terbayar:', 338, currentY + 26, { width: 90 });
    doc
      .font('Helvetica-Bold')
      .fillColor('#047857')
      .text(money(paid), 438, currentY + 26, { width: 100, align: 'right' });

    doc
      .moveTo(338, currentY + 42)
      .lineTo(538, currentY + 42)
      .strokeColor('#cbd5e1')
      .stroke();

    doc
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .fillColor('#0f172a')
      .text('Sisa Tagihan:', 338, currentY + 48, { width: 90 });
    doc
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .fillColor(outstanding > 0 ? '#b91c1c' : '#047857')
      .text(money(outstanding), 438, currentY + 48, { width: 100, align: 'right' });

    // Signature Block
    currentY += 80;
    if (currentY > 700) {
      doc.addPage();
      currentY = 48;
    }

    const sigY = currentY;
    doc.font('Helvetica').fontSize(9).fillColor('#334155');
    doc.text(`${inv.cabang_nama || 'Yogyakarta'}, ${formatDate(inv.created_at)}`, 360, sigY, {
      width: 188,
      align: 'center'
    });
    doc.text('Petugas Administrasi', 360, sigY + 12, { width: 188, align: 'center' });

    // Centered stamp box placeholder
    const stampBoxX = 360 + (188 - 50) / 2; // = 429
    doc
      .roundedRect(stampBoxX, sigY + 28, 50, 30, 3)
      .dash(3, { space: 3 })
      .strokeColor('#cbd5e1')
      .stroke();
    doc
      .font('Helvetica')
      .fontSize(6)
      .fillColor('#94a3b8')
      .text('STAMP', stampBoxX, sigY + 40, { width: 50, align: 'center' });
    doc.undash();

    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0f172a');
    doc.text(inv.created_by_name || 'Petugas Sekolah', 360, sigY + 68, { width: 188, align: 'center' });
    doc
      .moveTo(380, sigY + 79)
      .lineTo(528, sigY + 79)
      .strokeColor('#cbd5e1')
      .stroke();

    // Footer Note
    doc.font('Helvetica').fontSize(7.5).fillColor('#94a3b8');
    doc.text(
      'Dokumen ini diterbitkan secara resmi oleh sistem sekolah dan merupakan bukti tagihan yang sah.',
      48,
      755,
      { align: 'center', width: 500 }
    );
    doc.text('Terima kasih atas kerja sama Bapak/Ibu Wali Murid.', 48, 765, { align: 'center', width: 500 });
  });
}

function generatePaymentPdfResponse(pay, res) {
  const alloc = db
    .prepare(
      `
    SELECT pa.nominal,t.nama,t.periode FROM pembayaran_alokasi pa JOIN tagihan t ON t.id=pa.tagihan_id WHERE pa.pembayaran_id=?
  `
    )
    .all(pay.id);

  const enrollment =
    db
      .prepare(
        `
    SELECT j.nama AS jenjang_nama, r.nama AS rombel_nama, e.paket
    FROM siswa_enrollment e
    LEFT JOIN jenjang j ON j.id=e.jenjang_id
    LEFT JOIN rombel r ON r.id=e.rombel_id
    WHERE e.siswa_id=? AND e.status='aktif'
    LIMIT 1
  `
      )
      .get(pay.siswa_id) || {};

  const wali =
    db
      .prepare(
        `
    SELECT p.display_name AS wali_nama, p.no_wa AS wali_no_wa
    FROM wali_siswa ws
    JOIN pengguna p ON p.id=ws.wali_pengguna_id
    WHERE ws.siswa_id=? AND ws.aktif=1
    LIMIT 1
  `
      )
      .get(pay.siswa_id) || {};

  renderPdf(res, `kuitansi-${pay.receipt_no}.pdf`, `SIAGA Receipt ${pay.receipt_no}`, (doc) => {
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
    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor('#059669')
      .text(pay.organisasi_nama || 'Yayasan Taruna Prima', textX, 42);
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#334155')
      .text(`Cabang ${pay.cabang_nama || ''} (${pay.cabang_kode || ''})`, textX, 58);

    let branchContactStr = '';
    if (pay.cabang_alamat) branchContactStr += pay.cabang_alamat;
    if (pay.cabang_kontak) branchContactStr += (branchContactStr ? ' | Telp/WA: ' : 'Telp/WA: ') + pay.cabang_kontak;
    if (!branchContactStr) branchContactStr = 'Alamat & Kontak hubungi admin sekolah.';
    doc.font('Helvetica').fontSize(7.5).fillColor('#64748b').text(branchContactStr, textX, 70, { width: 280 });

    // Title and Metadata (Right Aligned)
    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .fillColor('#0f172a')
      .text('KUITANSI PEMBAYARAN', 328, 42, { align: 'right', width: 220 });
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#475569')
      .text(pay.receipt_no, 328, 58, { align: 'right', width: 220 });
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
    if (enrollment.paket)
      infoLeft += (infoLeft ? ' / ' : '') + (enrollment.paket === 'full_day' ? 'Full Day' : 'Half Day');
    doc.font('Helvetica').fontSize(8).fillColor('#475569').text(infoLeft, 60, 168);

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#047857').text('WALI / PENERIMA', 260, 142);
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#0f172a')
      .text(wali.wali_nama || '-', 260, 154);
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
      doc
        .font('Helvetica-Bold')
        .fillColor('#047857')
        .text(money(a.nominal), 458, currentY + 6, { width: 80, align: 'right' });

      doc
        .moveTo(48, currentY + 22)
        .lineTo(548, currentY + 22)
        .strokeColor('#e2e8f0')
        .stroke();
      currentY += 22;
    });

    // Space below table
    currentY += 12;

    // Catatan Pembayaran
    if (pay.catatan) {
      doc.roundedRect(48, currentY, 260, 56, 6).fillColor('#f9fafb').fill().strokeColor('#e5e7eb').stroke();
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor('#475569')
        .text('CATATAN', 58, currentY + 8);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#64748b')
        .text(pay.catatan, 58, currentY + 20, { width: 240 });
    }

    // Totals Summary Box (Right)
    doc.rect(328, currentY, 220, 56).fillColor('#f9fafb').fill().strokeColor('#e5e7eb').stroke();
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#475569')
      .text('TOTAL BAYAR:', 338, currentY + 22, { width: 90 });
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#047857')
      .text(money(pay.nominal), 438, currentY + 20, { width: 100, align: 'right' });

    // Signature and Stamp Block
    currentY += 80;
    if (currentY > 700) {
      doc.addPage();
      currentY = 48;
    }

    const sigY = currentY;
    doc.font('Helvetica').fontSize(9).fillColor('#334155');
    doc.text(`${pay.cabang_nama || 'Yogyakarta'}, ${formatDate(pay.tanggal_bayar)}`, 360, sigY, {
      width: 188,
      align: 'center'
    });
    doc.text('Penerima / Petugas Kasir', 360, sigY + 12, { width: 188, align: 'center' });

    // Stamp Box centered
    const stampBoxX = 360 + (188 - 50) / 2; // = 429
    doc
      .roundedRect(stampBoxX, sigY + 28, 50, 30, 3)
      .dash(3, { space: 3 })
      .strokeColor('#cbd5e1')
      .stroke();
    doc
      .font('Helvetica')
      .fontSize(6)
      .fillColor('#94a3b8')
      .text('LUNAS', stampBoxX, sigY + 40, { width: 50, align: 'center' });
    doc.undash();

    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0f172a');
    doc.text(pay.created_by_name || 'Petugas Sekolah', 360, sigY + 68, { width: 188, align: 'center' });
    doc
      .moveTo(380, sigY + 79)
      .lineTo(528, sigY + 79)
      .strokeColor('#cbd5e1')
      .stroke();

    // Footer Note
    doc.font('Helvetica').fontSize(7.5).fillColor('#94a3b8');
    doc.text(
      'Dokumen ini diterbitkan secara resmi oleh sistem sekolah dan merupakan bukti pembayaran yang sah.',
      48,
      755,
      { align: 'center', width: 500 }
    );
    doc.text('Terima kasih atas pembayaran Bapak/Ibu Wali Murid.', 48, 765, { align: 'center', width: 500 });
  });
}

function money(v) {
  return 'Rp ' + Number(v || 0).toLocaleString('id-ID');
}

// --- AUTHENTICATED PDF GENERATION ENDPOINTS ---

router.get('/invoice/:id/pdf', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const inv = db
    .prepare(
      `
    SELECT i.*,s.nama AS siswa_nama,c.nama AS cabang_nama,c.kode AS cabang_kode,c.alamat AS cabang_alamat,c.kontak AS cabang_kontak,o.nama AS organisasi_nama,o.rekening_bank,o.rekening_nomor,o.rekening_nama,u.display_name AS created_by_name
    FROM invoice i
    JOIN siswa s ON s.id=i.siswa_id
    JOIN cabang c ON c.id=i.cabang_id
    JOIN organisasi o ON o.id=1
    LEFT JOIN pengguna u ON u.id=i.created_by
    WHERE i.id=?
  `
    )
    .get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Invoice tidak ditemukan' });
  if (!requireCabang(req, res, inv.cabang_id)) return;
  generateInvoicePdfResponse(inv, res);
});

router.get('/pembayaran/:id/pdf', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const pay = db
    .prepare(
      `
    SELECT p.*,s.nama AS siswa_nama,c.nama AS cabang_nama,c.kode AS cabang_kode,c.alamat AS cabang_alamat,c.kontak AS cabang_kontak,o.nama AS organisasi_nama,u.display_name AS created_by_name
    FROM pembayaran p
    JOIN siswa s ON s.id=p.siswa_id
    JOIN cabang c ON c.id=p.cabang_id
    JOIN organisasi o ON o.id=1
    LEFT JOIN pengguna u ON u.id=p.created_by
    WHERE p.id=?
  `
    )
    .get(req.params.id);
  if (!pay) return res.status(404).json({ error: 'Pembayaran tidak ditemukan' });
  if (!requireCabang(req, res, pay.cabang_id)) return;
  if (pay.status !== 'confirmed') return res.status(400).json({ error: 'Kuitansi hanya untuk pembayaran confirmed' });
  generatePaymentPdfResponse(pay, res);
});

// --- PUBLIC DOWNLOAD ENDPOINTS ---

router.get('/public/invoice/:id/pdf', (req, res) => {
  const id = Number(req.params.id);
  const key = req.query.key;
  if (!validPublicKey('invoice', id, key)) {
    return res.status(403).json({ error: 'Akses ditolak' });
  }
  const inv = db
    .prepare(
      `
    SELECT i.*,s.nama AS siswa_nama,c.nama AS cabang_nama,c.kode AS cabang_kode,c.alamat AS cabang_alamat,c.kontak AS cabang_kontak,o.nama AS organisasi_nama,o.rekening_bank,o.rekening_nomor,o.rekening_nama,u.display_name AS created_by_name
    FROM invoice i
    JOIN siswa s ON s.id=i.siswa_id
    JOIN cabang c ON c.id=i.cabang_id
    JOIN organisasi o ON o.id=1
    LEFT JOIN pengguna u ON u.id=i.created_by
    WHERE i.id=?
  `
    )
    .get(id);
  if (!inv) return res.status(404).json({ error: 'Invoice tidak ditemukan' });
  generateInvoicePdfResponse(inv, res);
});

router.get('/public/pembayaran/:id/pdf', (req, res) => {
  const id = Number(req.params.id);
  const key = req.query.key;
  if (!validPublicKey('payment', id, key)) {
    return res.status(403).json({ error: 'Akses ditolak' });
  }
  const pay = db
    .prepare(
      `
    SELECT p.*,s.nama AS siswa_nama,c.nama AS cabang_nama,c.kode AS cabang_kode,c.alamat AS cabang_alamat,c.kontak AS cabang_kontak,o.nama AS organisasi_nama,u.display_name AS created_by_name
    FROM pembayaran p
    JOIN siswa s ON s.id=p.siswa_id
    JOIN cabang c ON c.id=p.cabang_id
    JOIN organisasi o ON o.id=1
    LEFT JOIN pengguna u ON u.id=p.created_by
    WHERE p.id=?
  `
    )
    .get(id);
  if (!pay) return res.status(404).json({ error: 'Pembayaran tidak ditemukan' });
  if (pay.status !== 'confirmed') return res.status(400).json({ error: 'Kuitansi hanya untuk pembayaran confirmed' });
  generatePaymentPdfResponse(pay, res);
});

// --- WALI BILLING VIEWS ENDPOINT ---

// ---------------------------------------------------------------------------
// Wali: konfirmasi pembayaran + unggah bukti transfer.
//
// Alur: wali memilih tagihan, mengisi nominal, mengunggah foto bukti transfer,
// lalu pembayaran tercatat dengan status pending_verification. Struk/kuitansi
// baru dibuat oleh bendahara saat memverifikasi (rute verify yang sudah ada),
// jadi pencatatan uang — kuitansi, alokasi, saldo kredit — tetap terjadi di
// satu jalur saja dan tidak bisa dilewati.
// ---------------------------------------------------------------------------
const BUKTI_DIR = path.join(__dirname, '..', 'uploads', 'bukti');

function parseTagihanIds(raw) {
  // multipart mengirim array sebagai JSON string; dukung juga array asli.
  let v = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(v)) return [];
  return v.map(Number).filter((n) => Number.isInteger(n) && n > 0);
}

router.post('/wali/konfirmasi', auth(['wali']), uploadImage.single('bukti'), async (req, res) => {
  const d = req.body || {};
  const siswaId = Number(d.siswa_id);
  if (!siswaId || !canWaliAccessSiswa(req.user, siswaId))
    return res.status(403).json({ error: 'Akses siswa ditolak' });

  const siswa = db.prepare('SELECT id,nama,status FROM siswa WHERE id=?').get(siswaId);
  if (!siswa || siswa.status !== 'aktif')
    return res.status(400).json({ error: 'Siswa nonaktif tidak bisa dikonfirmasi' });

  const enrollment = db
    .prepare("SELECT * FROM siswa_enrollment WHERE siswa_id=? AND status='aktif' LIMIT 1")
    .get(siswaId);
  if (!enrollment) return res.status(404).json({ error: 'Enrollment siswa tidak ditemukan' });
  if (!requireActiveCabang(req, res, enrollment.cabang_id)) return;

  const tanggalBayar = d.tanggal_bayar || todayWIB();
  if (!rejectFutureTanggal(req, res, tanggalBayar)) return;

  const metode = ['transfer', 'qris', 'lainnya'].includes(d.metode) ? d.metode : null;
  if (!metode) return res.status(400).json({ error: 'Metode pembayaran tidak valid' });

  const nominal = Number(d.nominal);
  if (!Number.isFinite(nominal) || nominal <= 0)
    return res.status(400).json({ error: 'Nominal pembayaran tidak valid' });

  const tagihanIds = parseTagihanIds(d.tagihan_ids);
  if (!tagihanIds.length) return res.status(400).json({ error: 'Pilih minimal satu tagihan' });

  // Bukti wajib: tanpa foto, bendahara tidak bisa memverifikasi dan
  // pembayaran nyaris pasti ditolak. Pesannya jelas agar wali tidak bingung.
  if (!req.file) return res.status(400).json({ error: 'Foto bukti pembayaran wajib diunggah' });

  // Tagihan harus milik siswa ini dan masih punya sisa. Nilai mengikuti
  // parameter terikat (?), jadi tidak ada risiko injeksi dari daftar id.
  const bills = db
    .prepare(
      `SELECT id,nominal_final FROM tagihan
       WHERE siswa_id=? AND status IN ('open','sebagian')
         AND id IN (${tagihanIds.map(() => '?').join(',')})`
    )
    .all(siswaId, ...tagihanIds);
  if (bills.length !== tagihanIds.length)
    return res.status(400).json({ error: 'Ada tagihan yang tidak valid atau sudah lunas' });

  // total sisa tagihan terpilih (pakai paidAmount yang sudah ada di modul)
  const sisaTotal = bills.reduce((sum, b) => sum + (b.nominal_final - paidAmount(b.id)), 0);
  if (nominal > sisaTotal)
    return res.status(400).json({ error: 'Nominal melebihi sisa tagihan yang dipilih' });

  ensureDir(BUKTI_DIR);
  // Struk sering berukuran A4: resize lebar 1400px (bukan crop kotak) supaya
  // tulisan di struk tetap terbaca saat bendahara memeriksa.
  const filename = `bukti-${siswaId}-${Date.now()}.jpg`;
  await sharp(req.file.buffer)
    .resize(1400, null, { withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toFile(path.join(BUKTI_DIR, filename));
  const buktiPath = `/uploads/bukti/${filename}`;

  const catatan = String(d.catatan || '').trim().slice(0, 500) || null;
  const tx = db.transaction(() => {
    const r = db
      .prepare(
        `INSERT INTO pembayaran(cabang_id,siswa_id,receipt_no,tanggal_bayar,nominal,metode,status,reference,catatan,bukti_path,created_by,created_at,updated_at)
      VALUES(?,?,?,?,?,?,'pending_verification',?,?,?,?,?,?)`
      )
      .run(
        enrollment.cabang_id,
        siswaId,
        null, // struk dibuat saat diverifikasi
        tanggalBayar,
        nominal,
        metode,
        'Konfirmasi pembayaran via aplikasi wali',
        catatan,
        buktiPath,
        req.user.id,
        nowUtc(),
        nowUtc()
      );

    // Alokasi ke tagihan terpilih (terlama dulu, seperti pembayaran biasa).
    let remaining = nominal;
    for (const b of bills.sort((x, y) => x.id - y.id)) {
      if (remaining <= 0) break;
      const unpaid = b.nominal_final - paidAmount(b.id);
      const pakai = Math.min(remaining, unpaid);
      if (pakai > 0) {
        db.prepare(
          'INSERT INTO pembayaran_alokasi(pembayaran_id,tagihan_id,nominal,created_at) VALUES(?,?,?,?)'
        ).run(r.lastInsertRowid, b.id, pakai, nowUtc());
        remaining -= pakai;
      }
    }
    // Kelebihan (kalau ada) jadi saldo kredit, tercatat saat verifikasi —
    // tidak dicatat di sini karena uangnya belum diterima bendahara.

    audit(req.user, 'create', 'pembayaran', r.lastInsertRowid, {
      cabang_id: enrollment.cabang_id,
      after: { siswa_id: siswaId, nominal, metode, status: 'pending_verification', via: 'wali' }
    });

    // Beri tahu bendahara/kepala sekolah: ada bukti yang perlu diverifikasi.
    const penerima = db
      .prepare(
        `SELECT p.id FROM pengguna p
       LEFT JOIN staff_profile sp ON sp.pengguna_id=p.id
       WHERE p.status='aktif'
         AND (p.role='admin'
              OR (p.role IN ('admin_cabang','kepsek') AND sp.cabang_id=?))`
      )
      .all(enrollment.cabang_id);
    const nominalText = 'Rp ' + Number(nominal).toLocaleString('id-ID');
    for (const t of penerima) {
      notify(
        t.id,
        'payment_claim',
        'Konfirmasi pembayaran baru',
        `${siswa.nama}: ${nominalText} (${metode}) menunggu verifikasi.`,
        'pembayaran',
        r.lastInsertRowid,
        enrollment.cabang_id
      );
    }
    return r.lastInsertRowid;
  });

  try {
    const id = tx();
    res.json({ success: true, id, status: 'pending_verification' });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Konfirmasi pembayaran gagal' });
  }
});

router.get('/wali/siswa/:siswaId', auth(['wali']), (req, res) => {
  const siswaId = Number(req.params.siswaId);
  const linked = db
    .prepare('SELECT 1 FROM wali_siswa WHERE wali_pengguna_id=? AND siswa_id=? AND aktif=1')
    .get(req.user.id, siswaId);
  if (!linked) return res.status(403).json({ error: 'Akses ditolak' });

  const enrollment = db
    .prepare(
      `
    SELECT e.*, c.nama AS cabang_nama, j.nama AS jenjang_nama, r.nama AS rombel_nama
    FROM siswa_enrollment e
    JOIN cabang c ON c.id=e.cabang_id
    JOIN jenjang j ON j.id=e.jenjang_id
    JOIN rombel r ON r.id=e.rombel_id
    WHERE e.siswa_id=? AND e.status='aktif'
    LIMIT 1
  `
    )
    .get(siswaId);

  const tagihan = db
    .prepare(
      `
    SELECT t.*,
           COALESCE((SELECT SUM(pa.nominal) FROM pembayaran_alokasi pa JOIN pembayaran p ON p.id=pa.pembayaran_id WHERE pa.tagihan_id=t.id AND p.status='confirmed'),0) AS paid_amount
    FROM tagihan t
    WHERE t.siswa_id=? AND t.status IN ('open', 'sebagian')
    ORDER BY t.periode DESC, t.created_at DESC
  `
    )
    .all(siswaId);

  const invoices = db
    .prepare(
      `
    SELECT i.*,
      (SELECT COALESCE(SUM(t.nominal_final),0) FROM invoice_item ii JOIN tagihan t ON t.id=ii.tagihan_id WHERE ii.invoice_id=i.id) AS total
    FROM invoice i
    WHERE i.siswa_id=? AND i.status='issued'
    ORDER BY i.created_at DESC
  `
    )
    .all(siswaId);
  const invoicesWithKeys = invoices.map((i) => ({
    ...i,
    public_key: getInvoiceKey(i.id)
  }));

  const pembayaran = db
    .prepare(
      `
    SELECT p.*,
      COALESCE((SELECT SUM(pa.nominal) FROM pembayaran_alokasi pa WHERE pa.pembayaran_id=p.id),0) AS allocated_amount
    FROM pembayaran p
    WHERE p.siswa_id=? AND p.status IN ('confirmed', 'pending_verification')
    ORDER BY p.created_at DESC
  `
    )
    .all(siswaId);
  const pembayaranWithKeys = pembayaran.map((p) => ({
    ...p,
    public_key: getPaymentKey(p.id)
  }));

  // Saldo kredit ditampilkan agar orang tua tahu uang kelebihannya tidak hilang
  // dan bisa dipakai untuk tagihan berikutnya.
  res.json({
    enrollment,
    tagihan,
    invoices: invoicesWithKeys,
    pembayaran: pembayaranWithKeys,
    saldo_kredit: creditBalance(siswaId)
  });
});

module.exports = router;
