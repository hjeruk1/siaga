// Rapor perkembangan bulanan (PDF) untuk orang tua.
//
// Satu endpoint, dua audiens:
//   wali   -> hanya anaknya (canWaliAccessSiswa)
//   staff  -> sesuai scope cabang/kelas (canAccessSiswa)
//
// Bulan tidak valid TIDAK ditolak: jatuh ke bulan berjalan. Orang tua yang
// menekan tautan lama tetap mendapat dokumen yang masuk akal, bukan error.
const path = require('path');
const router = require('express').Router();
const PDFDocument = require('pdfkit');
const db = require('../db');
const auth = require('../middleware/auth');
const { todayWIB, canAccessSiswa, canWaliAccessSiswa } = require('../utils/workflow');
const rapor = require('../utils/raporPdf');

const PERAN = ['wali', 'guru', 'admin', 'admin_cabang', 'kepsek'];

// auth.media: menerima cookie HttpOnly `siaga_media` selain header Bearer.
// Tanpa ini, tautan <a href> di portal wali dijawab 401 karena browser tidak
// bisa menambahkan header Authorization pada navigasi biasa.
router.get('/:siswaId/pdf', auth.media(PERAN), (req, res) => {
  const siswaId = Number(req.params.siswaId);
  if (!Number.isInteger(siswaId) || siswaId <= 0) return res.status(400).json({ error: 'Siswa tidak valid' });

  // Admin pusat tidak dibatasi cabang. Tanpa cabang khusus ini, siswa yang
  // belum punya enrollment (mis. baru didaftarkan) akan dijawab 403 padahal
  // masalahnya bukan izin — dan admin tidak bisa membedakan keduanya.
  const boleh =
    req.user.role === 'admin'
      ? true
      : req.user.role === 'wali'
        ? canWaliAccessSiswa(req.user, siswaId)
        : canAccessSiswa(req.user, siswaId);
  if (!boleh) return res.status(403).json({ error: 'Akses rapor ditolak' });

  const bulan = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(req.query.bulan || ''))
    ? String(req.query.bulan)
    : todayWIB().slice(0, 7);

  const data = rapor.dataRapor(siswaId, bulan);
  if (!data) return res.status(404).json({ error: 'Siswa belum punya enrollment aktif' });

  const org = db.prepare('SELECT nama FROM organisasi WHERE id=1').get();
  const logoPath = path.join(__dirname, '../../frontend/public/tp_logo.png');
  const doc = new PDFDocument({
    margin: 40,
    size: 'A4',
    info: { Title: `Rapor ${data.siswa.nama} ${bulan}`, Author: org?.nama || 'SIAGA' }
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${rapor.namaBerkasRapor(data.siswa.nama, bulan)}"`);
  res.setHeader('Cache-Control', 'no-store');
  doc.pipe(res);
  rapor.renderRaporBulanan(doc, data, { logoPath, yayasan: org?.nama || 'Yayasan Taruna Prima' });
  doc.end();
});

module.exports = router;
