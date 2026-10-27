// Portal wali: konfirmasi pembayaran dengan bukti transfer, dan rincian
// tagihan per anak.
//
// Pencatatan uang tetap satu jalur: wali hanya membuat pembayaran berstatus
// pending_verification, sedangkan kuitansi, alokasi, dan saldo kredit lahir
// saat bendahara memverifikasi.
const path = require('path');
const express = require('express');
const db = require('../../db');
const auth = require('../../middleware/auth');
const requirePin = require('../../middleware/pin');
const {
  nowUtc,
  todayWIB,
  requireActiveCabang,
  audit,
  canWaliAccessSiswa,
  rejectFutureTanggal,
  notify
} = require('../../utils/workflow');
const { uploadImage, ensureDir } = require('../../utils/image-upload');
const sharp = require('sharp');
const { getInvoiceKey, getPaymentKey, paidAmount, creditBalance } = require('./helpers');

const router = express.Router();

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
const BUKTI_DIR = path.join(__dirname, '..', '..', 'uploads', 'bukti');

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

// Konfirmasi pembayaran menyentuh data uang: wajib PIN kalau wali sudah
// memasangnya (lihat middleware/pin.js).
router.post('/wali/konfirmasi', auth(['wali']), requirePin, uploadImage.single('bukti'), async (req, res) => {
  const d = req.body || {};
  const siswaId = Number(d.siswa_id);
  if (!siswaId || !canWaliAccessSiswa(req.user, siswaId)) return res.status(403).json({ error: 'Akses siswa ditolak' });

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
  if (nominal > sisaTotal) return res.status(400).json({ error: 'Nominal melebihi sisa tagihan yang dipilih' });

  ensureDir(BUKTI_DIR);
  // Struk sering berukuran A4: resize lebar 1400px (bukan crop kotak) supaya
  // tulisan di struk tetap terbaca saat bendahara memeriksa.
  const filename = `bukti-${siswaId}-${Date.now()}.jpg`;
  await sharp(req.file.buffer)
    .resize(1400, null, { withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toFile(path.join(BUKTI_DIR, filename));
  const buktiPath = `/uploads/bukti/${filename}`;

  const catatan =
    String(d.catatan || '')
      .trim()
      .slice(0, 500) || null;
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
        db.prepare('INSERT INTO pembayaran_alokasi(pembayaran_id,tagihan_id,nominal,created_at) VALUES(?,?,?,?)').run(
          r.lastInsertRowid,
          b.id,
          pakai,
          nowUtc()
        );
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

// Rincian tagihan + riwayat bayar: bagian paling sensitif di portal wali.
router.get('/wali/siswa/:siswaId', auth(['wali']), requirePin, (req, res) => {
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
