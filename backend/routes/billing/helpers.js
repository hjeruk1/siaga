// Helper bersama untuk seluruh modul billing: tanda tangan tautan publik,
// jendela periode, akses siswa, dan pembukuan tagihan/kredit.
//
// Semuanya murni query atau aritmetika — tidak ada yang menyentuh req/res —
// sehingga aman dipakai lintas berkas tanpa saling menyalin.
const crypto = require('crypto');
const db = require('../../db');
const { nowUtc, canAccessSiswa } = require('../../utils/workflow');

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

module.exports = {
  publicKey,
  validPublicKey,
  getInvoiceKey,
  getPaymentKey,
  monthStart,
  monthEnd,
  cabangParam,
  canReadStudentBilling,
  studentBelongsToCabang,
  enrollmentsInWindow,
  discountRowsBySiswa,
  discountTotal,
  paidAmount,
  refreshBillStatus,
  creditBalance,
  recordCredit,
  reverseCredit
};
