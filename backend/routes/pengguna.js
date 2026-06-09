const router = require('express').Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const auth = require('../middleware/auth');
const { uploadImage, saveSquareJpeg, ensureDir } = require('../utils/image-upload');
const asyncRoute = require('../utils/async-route');
const { nowUtc, audit, requireCabang, requireActiveCabang } = require('../utils/workflow');

const FOTO_DIR = path.join(__dirname, '../uploads/foto');
ensureDir(FOTO_DIR);

function canManageRole(actor, role, cabangId) {
  if (actor.role === 'admin') return true;
  if (actor.role === 'admin_cabang') {
    return ['guru', 'gerbang', 'wali'].includes(role) && Number(actor.cabang_id) === Number(cabangId);
  }
  return false;
}

function tempPassword() {
  return crypto.randomBytes(5).toString('base64url');
}

function canAccessWali(actor, waliId) {
  if (actor.role === 'admin') return true;
  if (actor.role !== 'admin_cabang') return false;
  return !!db.prepare(`
    SELECT 1
    FROM wali_siswa ws
    JOIN siswa_enrollment e ON e.siswa_id=ws.siswa_id AND e.status='aktif'
    WHERE ws.wali_pengguna_id=? AND e.cabang_id=?
    LIMIT 1
  `).get(waliId, actor.cabang_id);
}

function staffDeleteBlockers(id) {
  const checks = [
    ['tutup_hari', 'closed_by', 'tutup hari'],
    ['penjemputan_log', 'guru_id', 'log penjemputan'],
    ['qr_reissue_log', 'admin_id', 'riwayat reissue QR'],
    ['nfc_scan_log', 'pengguna_id', 'log scan NFC'],
    ['modul_ajar', 'created_by', 'modul ajar'],
    ['focus_theme', 'created_by', 'focus theme'],
    ['laporan_harian', 'guru_id', 'daily record'],
    ['laporan_edit_log', 'pengguna_id', 'riwayat edit daily record'],
    ['laporan_attachment', 'created_by', 'lampiran daily record'],
    ['laporan_comment', 'author_pengguna_id', 'komentar daily record'],
    ['audit_log', 'actor_pengguna_id', 'audit tindakan'],
    ['early_release', 'created_by', 'early release'],
    ['siswa_enrollment', 'created_by', 'enrollment siswa'],
    ['diskon_siswa', 'created_by', 'diskon siswa'],
    ['tagihan', 'created_by', 'tagihan'],
    ['pembayaran', 'created_by', 'pembayaran'],
    ['pembayaran', 'verified_by', 'verifikasi pembayaran'],
    ['invoice', 'created_by', 'invoice'],
    ['kenaikan_batch', 'created_by', 'kenaikan tahun ajar']
  ];
  return checks.map(([table, column, label]) => {
    const count = db.prepare(`SELECT COUNT(*) AS cnt FROM ${table} WHERE ${column}=?`).get(id).cnt;
    return { table, column, label, count };
  }).filter(x => x.count > 0);
}

router.get('/', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const cabangId = req.user.role === 'admin' ? req.query.cabang_id : req.user.cabang_id;
  const params = [];
  let where = "WHERE p.tipe='staff'";
  if (cabangId) { where += ' AND sp.cabang_id=?'; params.push(cabangId); }
  if (req.user.role !== 'admin') {
    where += " AND p.role IN ('admin_cabang','kepsek','guru','gerbang')";
  }
  const rows = db.prepare(`
    SELECT p.id,p.tipe,p.role,p.display_name,p.username,p.no_wa,p.status,p.must_change_password,
           sp.cabang_id,c.nama AS cabang_nama,sp.foto,sp.jabatan,sp.no_wa_kontak
    FROM pengguna p
    LEFT JOIN staff_profile sp ON sp.pengguna_id=p.id
    LEFT JOIN cabang c ON c.id=sp.cabang_id
    ${where}
    ORDER BY c.nama,p.role,p.display_name
  `).all(...params);
  res.json(rows);
});

router.post('/staff', auth(['admin', 'admin_cabang']), (req, res) => {
  const { display_name, username, role = 'guru', cabang_id, no_wa_kontak } = req.body || {};
  const targetCabang = role === 'admin' ? null : (req.user.role === 'admin' ? cabang_id : req.user.cabang_id);
  if (!display_name || !username) return res.status(400).json({ error: 'Nama dan username wajib' });
  if (!canManageRole(req.user, role, targetCabang)) return res.status(403).json({ error: 'Tidak boleh membuat role ini' });
  if (role !== 'admin' && !targetCabang) return res.status(400).json({ error: 'Cabang wajib untuk staff cabang' });
  if (role !== 'admin' && !requireActiveCabang(req, res, targetCabang)) return;
  const pass = tempPassword();
  try {
    const tx = db.transaction(() => {
      const r = db.prepare(`INSERT INTO pengguna(tipe,role,display_name,username,password_hash,status,must_change_password,created_at,updated_at)
        VALUES('staff',?,?,?,?, 'undangan',1,?,?)`)
        .run(role, display_name, username, bcrypt.hashSync(pass, 10), nowUtc(), nowUtc());
      db.prepare('INSERT INTO staff_profile(pengguna_id,cabang_id,no_wa_kontak) VALUES(?,?,?)')
        .run(r.lastInsertRowid, targetCabang || null, no_wa_kontak || null);
      audit(req.user, 'create', 'pengguna', r.lastInsertRowid, { cabang_id: targetCabang, after: { role, display_name, username } });
      return r.lastInsertRowid;
    });
    res.json({ id: tx(), temporary_password: pass });
  } catch {
    res.status(400).json({ error: 'Username sudah dipakai' });
  }
});

router.put('/staff/:id', auth(['admin', 'admin_cabang']), (req, res) => {
  const before = db.prepare(`SELECT p.*,sp.cabang_id FROM pengguna p LEFT JOIN staff_profile sp ON sp.pengguna_id=p.id WHERE p.id=? AND p.tipe='staff'`).get(req.params.id);
  if (!before) return res.status(404).json({ error: 'Staff tidak ditemukan' });
  const role = req.body.role || before.role;
  const targetCabang = role === 'admin' ? null : (req.user.role === 'admin' ? (req.body.cabang_id || before.cabang_id) : req.user.cabang_id);
  if (!canManageRole(req.user, role, targetCabang)) return res.status(403).json({ error: 'Tidak boleh mengubah staff ini' });
  if (role !== 'admin' && !requireActiveCabang(req, res, targetCabang)) return;
  const newStatus = req.body.status || before.status;
  const wouldLoseAdmin = before.role === 'admin' && before.status === 'aktif' && (newStatus !== 'aktif' || role !== 'admin');
  if (wouldLoseAdmin) {
    const activeAdmins = db.prepare("SELECT COUNT(*) AS cnt FROM pengguna WHERE role='admin' AND status='aktif' AND id!=?").get(req.params.id);
    if (activeAdmins.cnt === 0) return res.status(400).json({ error: 'Harus ada minimal satu admin aktif' });
  }
  const tx = db.transaction(() => {
    db.prepare('UPDATE pengguna SET display_name=?,role=?,status=?,updated_at=? WHERE id=?')
      .run(req.body.display_name || before.display_name, role, newStatus, nowUtc(), req.params.id);
    db.prepare('UPDATE staff_profile SET cabang_id=?,no_wa_kontak=? WHERE pengguna_id=?')
      .run(targetCabang, req.body.no_wa_kontak || null, req.params.id);
    if (before.role === 'guru' && Number(before.cabang_id || 0) !== Number(targetCabang || 0)) {
      db.prepare('DELETE FROM guru_rombel WHERE pengguna_id=?').run(req.params.id);
    }
  });
  tx();
  audit(req.user, 'update', 'pengguna', req.params.id, { cabang_id: targetCabang, before, after: req.body });
  res.json({ success: true });
});

router.delete('/staff/:id', auth(['admin', 'admin_cabang']), (req, res) => {
  const before = db.prepare(`
    SELECT p.*,sp.cabang_id,sp.foto,c.nama AS cabang_nama
    FROM pengguna p
    LEFT JOIN staff_profile sp ON sp.pengguna_id=p.id
    LEFT JOIN cabang c ON c.id=sp.cabang_id
    WHERE p.id=? AND p.tipe='staff'
  `).get(req.params.id);
  if (!before) return res.status(404).json({ error: 'Staff tidak ditemukan' });
  if (Number(before.id) === Number(req.user.id)) return res.status(400).json({ error: 'Tidak bisa menghapus akun sendiri' });
  if (!canManageRole(req.user, before.role, before.cabang_id)) return res.status(403).json({ error: 'Tidak boleh menghapus staff ini' });
  if (before.role === 'admin' && before.status === 'aktif') {
    const activeAdmins = db.prepare("SELECT COUNT(*) AS cnt FROM pengguna WHERE role='admin' AND status='aktif' AND id!=?").get(before.id);
    if (activeAdmins.cnt === 0) return res.status(400).json({ error: 'Harus ada minimal satu admin aktif' });
  }
  const blockers = staffDeleteBlockers(before.id);
  if (blockers.length) {
    return res.status(409).json({
      error: 'Staff sudah punya histori operasional. Gunakan nonaktifkan agar riwayat tetap utuh.',
      blockers
    });
  }
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM guru_rombel WHERE pengguna_id=?').run(before.id);
    db.prepare('DELETE FROM notifikasi WHERE recipient_pengguna_id=?').run(before.id);
    db.prepare('DELETE FROM staff_profile WHERE pengguna_id=?').run(before.id);
    db.prepare('DELETE FROM pengguna WHERE id=?').run(before.id);
  });
  tx();
  if (before.foto) {
    try { fs.unlinkSync(path.join(FOTO_DIR, path.basename(before.foto))); } catch {}
  }
  audit(req.user, 'delete', 'pengguna', before.id, { cabang_id: before.cabang_id || null, before });
  res.json({ success: true });
});

router.post('/:id/reset-password', auth(['admin', 'admin_cabang']), (req, res) => {
  const user = db.prepare('SELECT p.*,sp.cabang_id FROM pengguna p LEFT JOIN staff_profile sp ON sp.pengguna_id=p.id WHERE p.id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
  if (user.tipe === 'staff' && !canManageRole(req.user, user.role, user.cabang_id)) return res.status(403).json({ error: 'Akses ditolak' });
  if (user.tipe === 'wali' && !canAccessWali(req.user, user.id)) return res.status(403).json({ error: 'Akses wali ditolak' });
  const pass = tempPassword();
  db.prepare("UPDATE pengguna SET password_hash=?,must_change_password=1,status='undangan',auth_version=auth_version+1,updated_at=? WHERE id=?")
    .run(bcrypt.hashSync(pass, 10), nowUtc(), user.id);
  audit(req.user, 'password_reset', 'pengguna', user.id, { cabang_id: user.cabang_id || null });
  res.json({ success: true, temporary_password: pass });
});

router.get('/wali', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const cabangId = req.user.role === 'admin' ? req.query.cabang_id : req.user.cabang_id;
  const params = [];
  let where = "WHERE p.tipe='wali'";
  if (cabangId) {
    where += " AND EXISTS (SELECT 1 FROM wali_siswa ws2 JOIN siswa_enrollment e2 ON e2.siswa_id=ws2.siswa_id AND e2.status='aktif' WHERE ws2.wali_pengguna_id=p.id AND e2.cabang_id=?)";
    params.push(cabangId);
  }

  const walis = db.prepare(`
    SELECT p.id, p.display_name, p.no_wa, p.status, p.must_change_password
    FROM pengguna p
    JOIN wali_profile wp ON wp.pengguna_id=p.id
    ${where}
    ORDER BY p.display_name
  `).all(...params);

  const result = walis.map(w => {
    const children = db.prepare(`
      SELECT s.id, s.nama, s.foto, r.nama AS rombel_nama, c.nama AS cabang_nama, r.id AS rombel_id
      FROM wali_siswa ws
      JOIN siswa s ON s.id=ws.siswa_id
      LEFT JOIN siswa_enrollment e ON e.siswa_id=s.id AND e.status='aktif'
      LEFT JOIN rombel r ON r.id=e.rombel_id
      LEFT JOIN cabang c ON c.id=e.cabang_id
      WHERE ws.wali_pengguna_id=? AND ws.aktif=1
    `).all(w.id);

    const childrenWithGurus = children.map(ch => {
      let gurus = [];
      if (ch.rombel_id) {
        gurus = db.prepare(`
          SELECT p.id, p.display_name, sp.foto, gr.role
          FROM guru_rombel gr
          JOIN pengguna p ON p.id=gr.pengguna_id
          LEFT JOIN staff_profile sp ON sp.pengguna_id=p.id
          WHERE gr.rombel_id=? AND p.status='aktif'
        `).all(ch.rombel_id);
      }
      return {
        id: ch.id,
        nama: ch.nama,
        foto: ch.foto,
        rombel_nama: ch.rombel_nama,
        cabang_nama: ch.cabang_nama,
        gurus
      };
    });

    const siswa_nama = children.map(ch => ch.nama).join(', ');
    const cabang_nama = [...new Set(children.map(ch => ch.cabang_nama).filter(Boolean))].join(', ');

    return {
      ...w,
      siswa_nama: siswa_nama || '-',
      cabang_nama: cabang_nama || '-',
      children: childrenWithGurus
    };
  });

  res.json(result);
});

router.post('/wali', auth(['admin', 'admin_cabang']), (req, res) => {
  const { display_name, no_wa, siswa_id, relasi } = req.body || {};
  if (!display_name || !no_wa || !siswa_id) return res.status(400).json({ error: 'Nama, nomor WA, dan siswa wajib' });
  const enrollment = db.prepare("SELECT * FROM siswa_enrollment WHERE siswa_id=? AND status='aktif'").get(siswa_id);
  if (!enrollment) return res.status(400).json({ error: 'Siswa belum punya enrollment aktif' });
  if (!requireActiveCabang(req, res, enrollment.cabang_id)) return;
  const pass = tempPassword();
  try {
    const tx = db.transaction(() => {
      const activeLink = db.prepare('SELECT * FROM wali_siswa WHERE siswa_id=? AND aktif=1').get(siswa_id);
      const existing = db.prepare("SELECT * FROM pengguna WHERE tipe='wali' AND no_wa=?").get(no_wa);
      if (activeLink && (!existing || Number(activeLink.wali_pengguna_id) !== Number(existing.id))) {
        throw Object.assign(new Error('Siswa sudah punya wali aktif'), { code: 'ACTIVE_WALI_EXISTS' });
      }
      if (existing) {
        db.prepare('UPDATE pengguna SET display_name=?,updated_at=? WHERE id=?').run(display_name, nowUtc(), existing.id);
        db.prepare('UPDATE wali_profile SET no_wa=? WHERE pengguna_id=?').run(no_wa, existing.id);
        if (activeLink) {
          db.prepare('UPDATE wali_siswa SET relasi=? WHERE id=?').run(relasi || null, activeLink.id);
        } else {
          db.prepare('INSERT INTO wali_siswa(wali_pengguna_id,siswa_id,relasi,created_at) VALUES(?,?,?,?)')
            .run(existing.id, siswa_id, relasi || null, nowUtc());
        }
        audit(req.user, 'link_wali_siswa', 'wali', existing.id, { cabang_id: enrollment.cabang_id, after: { display_name, no_wa, siswa_id } });
        return { id: existing.id, linked_existing: true };
      }
      const r = db.prepare(`INSERT INTO pengguna(tipe,role,display_name,no_wa,password_hash,status,must_change_password,created_at,updated_at)
        VALUES('wali','wali',?,?,?,'undangan',1,?,?)`)
        .run(display_name, no_wa, bcrypt.hashSync(pass, 10), nowUtc(), nowUtc());
      db.prepare('INSERT INTO wali_profile(pengguna_id,no_wa) VALUES(?,?)').run(r.lastInsertRowid, no_wa);
      db.prepare('INSERT INTO wali_siswa(wali_pengguna_id,siswa_id,relasi,created_at) VALUES(?,?,?,?)')
        .run(r.lastInsertRowid, siswa_id, relasi || null, nowUtc());
      audit(req.user, 'create', 'wali', r.lastInsertRowid, { cabang_id: enrollment.cabang_id, after: { display_name, no_wa, siswa_id } });
      return { id: r.lastInsertRowid, temporary_password: pass };
    });
    res.json(tx());
  } catch (e) {
    res.status(400).json({ error: e.code === 'ACTIVE_WALI_EXISTS' ? e.message : 'Nomor WA wali sudah dipakai atau siswa sudah punya wali aktif' });
  }
});

router.put('/wali/:id', auth(['admin', 'admin_cabang']), (req, res) => {
  const before = db.prepare("SELECT id,display_name,no_wa,status FROM pengguna WHERE id=? AND tipe='wali'").get(req.params.id);
  if (!before) return res.status(404).json({ error: 'Wali tidak ditemukan' });
  if (!canAccessWali(req.user, before.id)) return res.status(403).json({ error: 'Akses wali ditolak' });
  const status = req.body?.status || before.status;
  if (!['undangan', 'aktif', 'nonaktif'].includes(status)) return res.status(400).json({ error: 'Status wali tidak valid' });
  const displayName = String(req.body?.display_name || before.display_name).trim();
  const noWa = String(req.body?.no_wa || before.no_wa || '').trim();
  if (!displayName) return res.status(400).json({ error: 'Nama wali wajib' });
  if (!noWa) return res.status(400).json({ error: 'Nomor WA wali wajib' });
  try {
    const tx = db.transaction(() => {
      db.prepare('UPDATE pengguna SET display_name=?,no_wa=?,status=?,updated_at=? WHERE id=?')
        .run(displayName, noWa, status, nowUtc(), before.id);
      db.prepare('UPDATE wali_profile SET no_wa=? WHERE pengguna_id=?').run(noWa, before.id);
    });
    tx();
    audit(req.user, 'update_wali', 'pengguna', before.id, { before, after: { display_name: displayName, no_wa: noWa, status } });
    res.json({ success: true });
  } catch {
    res.status(400).json({ error: 'Nomor WA wali sudah dipakai' });
  }
});

router.post('/staff/:id/foto', auth(['admin', 'admin_cabang']), uploadImage.single('foto'), asyncRoute(async (req, res) => {
  const user = db.prepare("SELECT p.*,sp.cabang_id,sp.foto FROM pengguna p JOIN staff_profile sp ON sp.pengguna_id=p.id WHERE p.id=? AND p.tipe='staff'").get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Staff tidak ditemukan' });
  if (!canManageRole(req.user, user.role, user.cabang_id)) return res.status(403).json({ error: 'Akses ditolak' });
  if (!req.file) return res.status(400).json({ error: 'File foto wajib' });
  if (user.foto) {
    try { fs.unlinkSync(path.join(FOTO_DIR, path.basename(user.foto))); } catch {}
  }
  const filename = `staff-${user.id}-${Date.now()}.jpg`;
  const outPath = path.join(FOTO_DIR, filename);
  await saveSquareJpeg(req.file.buffer, outPath);
  const url = `/uploads/foto/${filename}`;
  db.prepare('UPDATE staff_profile SET foto=? WHERE pengguna_id=?').run(url, user.id);
  audit(req.user, 'upload_foto', 'pengguna', user.id, { cabang_id: user.cabang_id });
  res.json({ url });
}));

router.delete('/staff/:id/foto', auth(['admin', 'admin_cabang']), (req, res) => {
  const user = db.prepare("SELECT p.*,sp.cabang_id,sp.foto FROM pengguna p JOIN staff_profile sp ON sp.pengguna_id=p.id WHERE p.id=? AND p.tipe='staff'").get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Staff tidak ditemukan' });
  if (!canManageRole(req.user, user.role, user.cabang_id)) return res.status(403).json({ error: 'Akses ditolak' });
  if (user.foto) {
    try { fs.unlinkSync(path.join(FOTO_DIR, path.basename(user.foto))); } catch {}
  }
  db.prepare('UPDATE staff_profile SET foto=NULL WHERE pengguna_id=?').run(user.id);
  audit(req.user, 'delete_foto', 'pengguna', user.id, { cabang_id: user.cabang_id });
  res.json({ success: true });
});

module.exports = router;
