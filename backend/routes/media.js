const path = require('path');
const fs = require('fs');
const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { canAccessSiswa, canWaliAccessSiswa } = require('../utils/workflow');

const UPLOAD_ROOT = path.resolve(__dirname, '../uploads');

function canAccessStaffPhoto(user, staff) {
  if (user.role === 'admin') return true;
  if (user.role !== 'wali') return Number(user.cabang_id) === Number(staff.cabang_id);
  return !!db.prepare(`
    SELECT 1
    FROM wali_siswa ws
    JOIN siswa_enrollment se ON se.siswa_id=ws.siswa_id AND se.status='aktif'
    JOIN guru_rombel gr ON gr.rombel_id=se.rombel_id
    WHERE ws.wali_pengguna_id=? AND ws.aktif=1 AND gr.pengguna_id=?
    LIMIT 1
  `).get(user.id, staff.id);
}

function canAccessReport(user, report) {
  if (user.role === 'wali') {
    return report.status === 'published' && canWaliAccessSiswa(user, report.siswa_id);
  }
  return !!canAccessSiswa(user, report.siswa_id, { tanggal: report.tanggal });
}

router.get('/:folder/:filename', auth.media(), (req, res) => {
  const folder = String(req.params.folder || '');
  const filename = path.basename(String(req.params.filename || ''));
  if (!/^[a-zA-Z0-9_-]+$/.test(folder) || !filename) {
    return res.status(400).json({ error: 'Path media tidak valid' });
  }

  const url = `/uploads/${folder}/${filename}`;
  const student = db.prepare('SELECT id FROM siswa WHERE foto=?').get(url);
  if (student) {
    const access = req.user.role === 'wali'
      ? canWaliAccessSiswa(req.user, student.id)
      : canAccessSiswa(req.user, student.id);
    if (!access) return res.status(403).json({ error: 'Akses media ditolak' });
  } else {
    const staff = db.prepare(`
      SELECT p.id,sp.cabang_id FROM staff_profile sp
      JOIN pengguna p ON p.id=sp.pengguna_id
      WHERE sp.foto=?
    `).get(url);
    if (staff) {
      if (!canAccessStaffPhoto(req.user, staff)) return res.status(403).json({ error: 'Akses media ditolak' });
    } else {
      const report = db.prepare(`
        SELECT l.siswa_id,l.tanggal,l.status
        FROM laporan_attachment a
        JOIN laporan_harian l ON l.id=a.laporan_id
        WHERE a.url=?
      `).get(url);
      if (!report || !canAccessReport(req.user, report)) {
        return res.status(403).json({ error: 'Akses media ditolak' });
      }
    }
  }

  const filePath = path.resolve(UPLOAD_ROOT, folder, filename);
  if (!filePath.startsWith(`${UPLOAD_ROOT}${path.sep}`) || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Media tidak ditemukan' });
  }
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(filePath);
});

module.exports = router;
