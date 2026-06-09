const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { nowUtc, audit, requireCabang, requireActiveCabang } = require('../utils/workflow');

router.get('/cabang', auth(), (req, res) => {
  const rows = req.user.role === 'admin'
    ? db.prepare('SELECT * FROM cabang ORDER BY aktif DESC,id').all()
    : db.prepare('SELECT * FROM cabang WHERE id=?').all(req.user.cabang_id);
  const studentRows = db.prepare(`
    SELECT se.cabang_id,j.kode AS jenjang_kode,j.nama AS jenjang_nama,j.tipe AS jenjang_tipe,COUNT(*) AS count
    FROM siswa s
    JOIN siswa_enrollment se ON se.siswa_id=s.id AND se.status='aktif'
    JOIN jenjang j ON j.id=se.jenjang_id
    WHERE s.status='aktif'
    GROUP BY se.cabang_id,j.id
  `).all();
  const staffRows = db.prepare(`
    SELECT sp.cabang_id,p.role,COUNT(*) AS count
    FROM pengguna p
    JOIN staff_profile sp ON sp.pengguna_id=p.id
    WHERE p.tipe='staff' AND p.status='aktif' AND p.role IN ('admin_cabang','kepsek','guru','gerbang')
    GROUP BY sp.cabang_id,p.role
  `).all();
  const kepsekRows = db.prepare(`
    SELECT sp.cabang_id,p.display_name
    FROM pengguna p
    JOIN staff_profile sp ON sp.pengguna_id=p.id
    WHERE p.tipe='staff' AND p.status='aktif' AND p.role='kepsek'
    ORDER BY p.display_name
  `).all();

  function studentBucket(row) {
    const name = String(row.jenjang_nama || '').toLowerCase();
    const code = String(row.jenjang_kode || '').toLowerCase();
    if (row.jenjang_tipe === 'care' || name.includes('care') || name.includes('baby')) return 'care';
    if (code.startsWith('tk') || name.startsWith('tk')) return 'tk';
    return 'kb';
  }
  const statsByCabang = new Map();
  function ensure(cabangId) {
    if (!statsByCabang.has(Number(cabangId))) {
      statsByCabang.set(Number(cabangId), {
        siswa_aktif_count: 0,
        kb_count: 0,
        tk_count: 0,
        care_count: 0,
        staff_aktif_count: 0,
        admin_count: 0,
        kepsek_count: 0,
        guru_count: 0,
        gerbang_count: 0,
        kepsek_names: []
      });
    }
    return statsByCabang.get(Number(cabangId));
  }
  for (const row of studentRows) {
    const stats = ensure(row.cabang_id);
    const count = Number(row.count) || 0;
    const bucket = studentBucket(row);
    stats.siswa_aktif_count += count;
    if (bucket === 'tk') stats.tk_count += count;
    else if (bucket === 'care') stats.care_count += count;
    else stats.kb_count += count;
  }
  for (const row of staffRows) {
    const stats = ensure(row.cabang_id);
    const count = Number(row.count) || 0;
    stats.staff_aktif_count += count;
    if (row.role === 'admin_cabang') stats.admin_count += count;
    else if (row.role === 'kepsek') stats.kepsek_count += count;
    else if (row.role === 'guru') stats.guru_count += count;
    else if (row.role === 'gerbang') stats.gerbang_count += count;
  }
  for (const row of kepsekRows) ensure(row.cabang_id).kepsek_names.push(row.display_name);

  res.json(rows.map(row => {
    const stats = ensure(row.id);
    const [firstKepsek, ...others] = stats.kepsek_names;
    return {
      ...row,
      ...stats,
      kepsek_nama: firstKepsek ? `${firstKepsek}${others.length ? ` +${others.length} lainnya` : ''}` : 'Belum diatur'
    };
  }));
});

router.post('/cabang', auth(['admin']), (req, res) => {
  const { nama, kode, alamat, kontak } = req.body || {};
  if (!nama || !kode) return res.status(400).json({ error: 'Nama dan kode cabang wajib' });
  const tx = db.transaction(() => {
    const r = db.prepare('INSERT INTO cabang(nama,kode,alamat,kontak,created_at,updated_at) VALUES(?,?,?,?,?,?)')
      .run(nama, String(kode).toUpperCase(), alamat || null, kontak || null, nowUtc(), nowUtc());
    const jenjang = db.prepare('SELECT * FROM jenjang WHERE aktif=1 ORDER BY urutan').all();
    const insertRombel = db.prepare('INSERT INTO rombel(cabang_id,jenjang_id,nama,created_at,updated_at) VALUES(?,?,?,?,?)');
    const insertCfg = db.prepare(`INSERT INTO operasional_config(cabang_id,jenjang_id,paket,jam_masuk,jam_pulang,hitung_terlambat,pakai_kalender,daily_record_wajib,daily_record_due_time,pickup_fleksibel)
      VALUES(?,?,?,?,?,?,?,?,?,?)`);
    for (const j of jenjang) {
      insertRombel.run(r.lastInsertRowid, j.id, j.nama, nowUtc(), nowUtc());
      if (j.tipe === 'care') insertCfg.run(r.lastInsertRowid, j.id, 'care', '08:00', '16:00', 0, 0, 1, '18:00', 1);
      else {
        insertCfg.run(r.lastInsertRowid, j.id, 'reguler', '08:00', '11:00', 1, 1, 1, '18:00', 0);
        insertCfg.run(r.lastInsertRowid, j.id, 'full_day', '08:00', '16:00', 1, 1, 1, '18:00', 0);
      }
    }
    audit(req.user, 'create', 'cabang', r.lastInsertRowid, { after: req.body });
    return r.lastInsertRowid;
  });
  try { res.json({ id: tx() }); } catch (e) { res.status(400).json({ error: 'Kode cabang sudah dipakai' }); }
});

router.put('/cabang/:id', auth(['admin']), (req, res) => {
  const before = db.prepare('SELECT * FROM cabang WHERE id=?').get(req.params.id);
  if (!before) return res.status(404).json({ error: 'Cabang tidak ditemukan' });
  const { nama, kode, alamat, kontak, aktif = 1 } = req.body || {};
  const newKode = String(kode).toUpperCase();
  if (newKode !== before.kode) {
    const tables = ['siswa_enrollment','absensi','laporan_harian','tagihan','pembayaran','guru_rombel','operasional_config','kalender_event','penjemputan_log','nfc_scan_log','notifikasi','audit_log'];
    for (const t of tables) {
      const row = db.prepare(`SELECT 1 FROM ${t} WHERE cabang_id=? LIMIT 1`).get(req.params.id);
      if (row) return res.status(400).json({ error: 'Kode cabang tidak bisa diubah karena sudah ada transaksi' });
    }
  }
  db.prepare('UPDATE cabang SET nama=?,kode=?,alamat=?,kontak=?,aktif=?,updated_at=? WHERE id=?')
    .run(nama, newKode, alamat || null, kontak || null, aktif ? 1 : 0, nowUtc(), req.params.id);
  audit(req.user, 'update', 'cabang', req.params.id, { before, after: req.body, cabang_id: req.params.id });
  res.json({ success: true });
});

router.get('/jenjang', auth(), (_req, res) => {
  res.json(db.prepare('SELECT * FROM jenjang WHERE aktif=1 ORDER BY urutan').all());
});

router.get('/rombel', auth(), (req, res) => {
  const cabangId = req.user.role === 'admin' ? (req.query.cabang_id || null) : req.user.cabang_id;
  const params = [];
  let where = 'WHERE 1=1';
  if (cabangId) { where += ' AND r.cabang_id=?'; params.push(cabangId); }
  const rows = db.prepare(`
    SELECT r.*,c.nama AS cabang_nama,j.nama AS jenjang_nama,j.tipe AS jenjang_tipe
    FROM rombel r JOIN cabang c ON c.id=r.cabang_id JOIN jenjang j ON j.id=r.jenjang_id
    ${where} ORDER BY c.nama,j.urutan,r.nama
  `).all(...params);
  const guruStmt = db.prepare(`
    SELECT p.id,p.display_name,gr.role
    FROM guru_rombel gr JOIN pengguna p ON p.id=gr.pengguna_id
    WHERE gr.rombel_id=? ORDER BY gr.role DESC,p.display_name
  `);
  res.json(rows.map(r => ({ ...r, gurus: guruStmt.all(r.id) })));
});

router.post('/rombel', auth(['admin','admin_cabang']), (req, res) => {
  const cabangId = req.user.role === 'admin' ? req.body.cabang_id : req.user.cabang_id;
  if (!requireActiveCabang(req, res, cabangId)) return;
  const { jenjang_id, nama } = req.body || {};
  if (!jenjang_id || !nama) return res.status(400).json({ error: 'Jenjang dan nama rombel wajib' });
  try {
    const r = db.prepare('INSERT INTO rombel(cabang_id,jenjang_id,nama,created_at,updated_at) VALUES(?,?,?,?,?)')
      .run(cabangId, jenjang_id, nama, nowUtc(), nowUtc());
    audit(req.user, 'create', 'rombel', r.lastInsertRowid, { cabang_id: cabangId, after: req.body });
    res.json({ id: r.lastInsertRowid });
  } catch {
    res.status(400).json({ error: 'Nama rombel sudah dipakai di cabang ini' });
  }
});

router.put('/rombel/:id', auth(['admin','admin_cabang']), (req, res) => {
  const rombel = db.prepare('SELECT * FROM rombel WHERE id=?').get(req.params.id);
  if (!rombel) return res.status(404).json({ error: 'Rombel tidak ditemukan' });
  if (!requireActiveCabang(req, res, rombel.cabang_id)) return;

  const { jenjang_id, nama, aktif } = req.body || {};
  if (!jenjang_id || !nama) return res.status(400).json({ error: 'Jenjang dan nama rombel wajib' });

  try {
    db.prepare('UPDATE rombel SET jenjang_id=?, nama=?, aktif=?, updated_at=? WHERE id=?')
      .run(Number(jenjang_id), nama, aktif ? 1 : 0, nowUtc(), rombel.id);
    audit(req.user, 'update', 'rombel', rombel.id, { cabang_id: rombel.cabang_id, before: rombel, after: req.body });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: 'Nama rombel sudah dipakai di cabang ini' });
  }
});

router.delete('/rombel/:id', auth(['admin','admin_cabang']), (req, res) => {
  const rombel = db.prepare('SELECT * FROM rombel WHERE id=?').get(req.params.id);
  if (!rombel) return res.status(404).json({ error: 'Rombel tidak ditemukan' });
  if (!requireActiveCabang(req, res, rombel.cabang_id)) return;

  // Check if there are active enrollments in this Rombel
  const activeSiswa = db.prepare('SELECT COUNT(*) as count FROM siswa_enrollment WHERE rombel_id=? AND status=\'aktif\'').get(rombel.id);
  if (activeSiswa && activeSiswa.count > 0) {
    return res.status(400).json({ error: 'Rombel tidak bisa dihapus karena masih memiliki siswa terdaftar. Pindahkan siswa terlebih dahulu.' });
  }

  // Delete matching guru assignments in guru_rombel
  db.prepare('DELETE FROM guru_rombel WHERE rombel_id=?').run(rombel.id);

  // Delete the rombel itself
  db.prepare('DELETE FROM rombel WHERE id=?').run(rombel.id);

  audit(req.user, 'delete', 'rombel', rombel.id, { cabang_id: rombel.cabang_id, before: rombel });
  res.json({ success: true });
});

router.post('/rombel/:id/guru', auth(['admin', 'admin_cabang']), (req, res) => {
  const rombel = db.prepare('SELECT * FROM rombel WHERE id=?').get(req.params.id);
  if (!rombel) return res.status(404).json({ error: 'Rombel tidak ditemukan' });
  if (!requireActiveCabang(req, res, rombel.cabang_id)) return;
  const guruId = Number(req.body?.pengguna_id);
  const role = req.body?.role === 'utama' ? 'utama' : 'bantu';
  if (!guruId) return res.status(400).json({ error: 'Guru wajib dipilih' });
  const guru = db.prepare(`
    SELECT p.id,p.role,sp.cabang_id FROM pengguna p JOIN staff_profile sp ON sp.pengguna_id=p.id
    WHERE p.id=? AND p.tipe='staff' AND p.role='guru' AND p.status!='nonaktif'
  `).get(guruId);
  if (!guru || Number(guru.cabang_id) !== Number(rombel.cabang_id)) return res.status(400).json({ error: 'Guru tidak valid untuk cabang ini' });
  if (role === 'utama') db.prepare("UPDATE guru_rombel SET role='bantu' WHERE rombel_id=? AND role='utama'").run(rombel.id);
  db.prepare(`INSERT INTO guru_rombel(pengguna_id,rombel_id,role,created_at)
    VALUES(?,?,?,?)
    ON CONFLICT(pengguna_id,rombel_id) DO UPDATE SET role=excluded.role`)
    .run(guruId, rombel.id, role, nowUtc());
  audit(req.user, 'assign_guru_rombel', 'rombel', rombel.id, { cabang_id: rombel.cabang_id, after: { guruId, role } });
  res.json({ success: true });
});

router.delete('/rombel/:id/guru/:guru_id', auth(['admin', 'admin_cabang']), (req, res) => {
  const rombel = db.prepare('SELECT * FROM rombel WHERE id=?').get(req.params.id);
  if (!rombel) return res.status(404).json({ error: 'Rombel tidak ditemukan' });
  if (!requireCabang(req, res, rombel.cabang_id)) return;
  const before = db.prepare('SELECT * FROM guru_rombel WHERE rombel_id=? AND pengguna_id=?').get(req.params.id, req.params.guru_id);
  db.prepare('DELETE FROM guru_rombel WHERE rombel_id=? AND pengguna_id=?').run(req.params.id, req.params.guru_id);
  audit(req.user, 'remove_guru_rombel', 'rombel', rombel.id, { cabang_id: rombel.cabang_id, before });
  res.json({ success: true });
});

router.get('/operasional-config', auth(), (req, res) => {
  const cabangId = req.user.role === 'admin' ? req.query.cabang_id : req.user.cabang_id;
  if (!cabangId) return res.json([]);
  if (!requireCabang(req, res, cabangId)) return;
  res.json(db.prepare(`
    SELECT oc.*,j.nama AS jenjang_nama,j.tipe AS jenjang_tipe
    FROM operasional_config oc JOIN jenjang j ON j.id=oc.jenjang_id
    WHERE oc.cabang_id=? ORDER BY j.urutan,oc.paket
  `).all(cabangId));
});

router.put('/operasional-config/:id', auth(['admin','admin_cabang']), (req, res) => {
  const row = db.prepare('SELECT * FROM operasional_config WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Konfigurasi tidak ditemukan' });
  if (!requireCabang(req, res, row.cabang_id)) return;
  const d = req.body || {};
  db.prepare(`UPDATE operasional_config SET jam_masuk=?,jam_pulang=?,hitung_terlambat=?,pakai_kalender=?,daily_record_wajib=?,daily_record_due_time=?,pickup_fleksibel=? WHERE id=?`)
    .run(d.jam_masuk || row.jam_masuk, d.jam_pulang || row.jam_pulang, d.hitung_terlambat ? 1 : 0, d.pakai_kalender ? 1 : 0, d.daily_record_wajib ? 1 : 0, d.daily_record_due_time || row.daily_record_due_time, d.pickup_fleksibel ? 1 : 0, req.params.id);
  audit(req.user, 'update', 'operasional_config', req.params.id, { cabang_id: row.cabang_id, before: row, after: d });
  res.json({ success: true });
});

router.get('/audit-log', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 300);
  const params = [];
  let where = 'WHERE 1=1';
  if (req.user.role !== 'admin') {
    where += ' AND a.cabang_id=?';
    params.push(req.user.cabang_id);
  } else if (req.query.cabang_id) {
    where += ' AND a.cabang_id=?';
    params.push(req.query.cabang_id);
  }
  params.push(limit);
  res.json(db.prepare(`
    SELECT a.*,p.display_name AS actor_name,c.nama AS cabang_nama
    FROM audit_log a
    LEFT JOIN pengguna p ON p.id=a.actor_pengguna_id
    LEFT JOIN cabang c ON c.id=a.cabang_id
    ${where}
    ORDER BY a.created_at DESC LIMIT ?
  `).all(...params));
});

router.get('/organisasi', auth(['admin']), (_req, res) => {
  const org = db.prepare('SELECT * FROM organisasi WHERE id=1').get();
  if (!org) return res.status(404).json({ error: 'Organisasi belum diinisialisasi' });
  res.json(org);
});

router.put('/organisasi', auth(['admin']), (req, res) => {
  const before = db.prepare('SELECT * FROM organisasi WHERE id=1').get();
  if (!before) return res.status(404).json({ error: 'Organisasi belum diinisialisasi' });
  const d = req.body || {};
  db.prepare(`UPDATE organisasi SET nama=?,alamat=?,kontak=?,rekening_nama=?,rekening_bank=?,rekening_nomor=?,updated_at=? WHERE id=1`)
    .run(d.nama || before.nama, d.alamat || before.alamat, d.kontak || before.kontak,
      d.rekening_nama || before.rekening_nama, d.rekening_bank || before.rekening_bank,
      d.rekening_nomor || before.rekening_nomor, nowUtc());
  audit(req.user, 'update', 'organisasi', 1, { before, after: d });
  res.json({ success: true });
});

router.get('/kalender', auth(), (req, res) => {
  const cabangId = req.user.role === 'admin' ? req.query.cabang_id : req.user.cabang_id;
  const tahun = req.query.tahun || new Date().getFullYear().toString();
  const params = [];
  let where = "WHERE (ke.scope='yayasan'";
  if (cabangId) { where += ' OR (ke.scope=\'cabang\' AND ke.cabang_id=?)'; params.push(cabangId); }
  where += ') AND ke.tanggal BETWEEN ? AND ?';
  params.push(`${tahun}-01-01`, `${tahun}-12-31`);
  res.json(db.prepare(`
    SELECT ke.*,c.nama AS cabang_nama FROM kalender_event ke LEFT JOIN cabang c ON c.id=ke.cabang_id
    ${where} ORDER BY ke.tanggal
  `).all(...params));
});

router.post('/kalender', auth(['admin', 'admin_cabang']), (req, res) => {
  const d = req.body || {};
  if (!d.tanggal || !d.tipe || !d.nama) return res.status(400).json({ error: 'Tanggal, tipe, dan nama wajib' });
  const scope = req.user.role === 'admin' ? (d.scope || 'yayasan') : 'cabang';
  const cabangId = scope === 'cabang' ? (req.user.role === 'admin' ? d.cabang_id : req.user.cabang_id) : null;
  if (scope === 'cabang' && !cabangId) return res.status(400).json({ error: 'Cabang wajib untuk event cabang' });
  if (scope === 'cabang' && !requireActiveCabang(req, res, cabangId)) return;
  const r = db.prepare('INSERT INTO kalender_event(scope,cabang_id,tanggal,tipe,nama,created_at) VALUES(?,?,?,?,?,?)')
    .run(scope, cabangId, d.tanggal, d.tipe, d.nama, nowUtc());
  audit(req.user, 'create', 'kalender_event', r.lastInsertRowid, { cabang_id: cabangId, after: d });
  res.json({ id: r.lastInsertRowid });
});

router.put('/kalender/:id', auth(['admin', 'admin_cabang']), (req, res) => {
  const ev = db.prepare('SELECT * FROM kalender_event WHERE id=?').get(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Event tidak ditemukan' });
  if (ev.scope === 'cabang' && !requireCabang(req, res, ev.cabang_id)) return;
  if (ev.scope === 'yayasan' && req.user.role !== 'admin') return res.status(403).json({ error: 'Hanya admin yang bisa edit event Taruna Prima' });
  const d = req.body || {};
  db.prepare('UPDATE kalender_event SET tanggal=?,tipe=?,nama=? WHERE id=?')
    .run(d.tanggal || ev.tanggal, d.tipe || ev.tipe, d.nama || ev.nama, req.params.id);
  audit(req.user, 'update', 'kalender_event', req.params.id, { cabang_id: ev.cabang_id, before: ev, after: d });
  res.json({ success: true });
});

router.delete('/kalender/:id', auth(['admin', 'admin_cabang']), (req, res) => {
  const ev = db.prepare('SELECT * FROM kalender_event WHERE id=?').get(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Event tidak ditemukan' });
  if (ev.scope === 'cabang' && !requireCabang(req, res, ev.cabang_id)) return;
  if (ev.scope === 'yayasan' && req.user.role !== 'admin') return res.status(403).json({ error: 'Hanya admin yang bisa hapus event Taruna Prima' });
  db.prepare('DELETE FROM kalender_event WHERE id=?').run(req.params.id);
  audit(req.user, 'delete', 'kalender_event', req.params.id, { cabang_id: ev.cabang_id, before: ev });
  res.json({ success: true });
});

module.exports = router;
