// Tarif per jenjang dan diskon per siswa.
//
// Keduanya master data yang menentukan nominal tagihan, jadi seluruh tulis di
// sini hanya untuk admin. Diskon punya aturan tambahan: kombinasi
// (siswa, jenis, tipe, nilai, tahun ajaran) tidak boleh kembar — lihat
// diskonKembar() di bawah.
const express = require('express');
const db = require('../../db');
const auth = require('../../middleware/auth');
const { nowUtc, requireCabang, requireActiveCabang, audit } = require('../../utils/workflow');
const { cabangParam, studentBelongsToCabang } = require('./helpers');

const router = express.Router();

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

module.exports = router;
