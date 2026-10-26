// Galeri foto kegiatan per rombel.
//
// Batas akses adalah inti berkas ini, bukan pelengkapnya: ini foto anak-anak.
// Aturannya satu kalimat — "yang boleh melihat adalah yang memang mengurus
// kelas itu":
//
//   admin        : semua cabang
//   admin_cabang : cabangnya
//   kepsek       : cabangnya (baca saja)
//   guru         : rombel yang diampu (guru_rombel), baca + unggah + hapus
//   wali         : rombel tempat anaknya terdaftar aktif, baca saja
//
// Aturan yang sama dipakai ulang di routes/media.js saat berkas disajikan —
// kalau berbeda, foto bisa bocor lewat URL langsung meski daftarnya tertutup.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { uploadImage, saveFotoKegiatan, ensureDir } = require('../utils/image-upload');
const { nowUtc, todayWIB, audit, isFutureTanggal } = require('../utils/workflow');

const DIR = path.join(__dirname, '../uploads/kegiatan');
const MAKS_PER_ALBUM = 30;
const MAKS_SEKALI_UNGGAH = 10;

const UNGGAH = ['guru', 'admin', 'admin_cabang'];
const LIHAT = ['guru', 'admin', 'admin_cabang', 'kepsek', 'wali'];

function guruMengampu(penggunaId, rombelId) {
  return !!db.prepare('SELECT 1 FROM guru_rombel WHERE pengguna_id=? AND rombel_id=?').get(penggunaId, rombelId);
}

function batasAkses(user) {
  if (user.role === 'admin') return { sql: '1=1', params: [] };
  if (user.role === 'admin_cabang' || user.role === 'kepsek') return { sql: 'k.cabang_id=?', params: [user.cabang_id] };
  if (user.role === 'guru')
    return {
      sql: 'k.rombel_id IN (SELECT rombel_id FROM guru_rombel WHERE pengguna_id=?)',
      params: [user.id]
    };
  if (user.role === 'wali')
    return {
      sql: `k.rombel_id IN (
        SELECT se.rombel_id FROM wali_siswa ws
        JOIN siswa_enrollment se ON se.siswa_id=ws.siswa_id AND se.status='aktif'
        WHERE ws.wali_pengguna_id=? AND ws.aktif=1
      )`,
      params: [user.id]
    };
  return { sql: '1=0', params: [] };
}

function bolehUnggah(user, rombel) {
  if (user.role === 'admin') return true;
  if (user.role === 'admin_cabang') return Number(rombel.cabang_id) === Number(user.cabang_id);
  if (user.role === 'guru') return guruMengampu(user.id, rombel.id);
  return false;
}

function bolehHapus(user, row) {
  if (user.role === 'admin') return true;
  if (user.role === 'admin_cabang') return Number(row.cabang_id) === Number(user.cabang_id);
  if (user.role === 'guru') return guruMengampu(user.id, row.rombel_id);
  return false;
}

function hapusBerkas(url) {
  const nama = path.basename(String(url || ''));
  if (!nama) return;
  const berkas = path.join(DIR, nama);
  try {
    if (fs.existsSync(berkas)) fs.unlinkSync(berkas);
  } catch {
    // Berkas yang gagal dihapus tidak boleh menggagalkan penghapusan baris:
    // baris tanpa berkas lebih aman daripada berkas tanpa baris (yatim).
  }
}

// Daftar rombel yang boleh dipakai untuk mengunggah — dipakai form guru.
router.get('/rombel', auth(UNGGAH), (req, res) => {
  if (req.user.role === 'admin')
    return res.json(
      db
        .prepare(
          'SELECT r.id,r.nama,c.nama AS cabang_nama FROM rombel r JOIN cabang c ON c.id=r.cabang_id ORDER BY c.nama,r.nama'
        )
        .all()
    );
  if (req.user.role === 'admin_cabang')
    return res.json(
      db
        .prepare(
          'SELECT r.id,r.nama,c.nama AS cabang_nama FROM rombel r JOIN cabang c ON c.id=r.cabang_id WHERE r.cabang_id=? ORDER BY r.nama'
        )
        .all(req.user.cabang_id)
    );
  res.json(
    db
      .prepare(
        `SELECT r.id,r.nama,c.nama AS cabang_nama FROM guru_rombel gr
         JOIN rombel r ON r.id=gr.rombel_id JOIN cabang c ON c.id=r.cabang_id
         WHERE gr.pengguna_id=? ORDER BY r.nama`
      )
      .all(req.user.id)
  );
});

router.get('/', auth(LIHAT), (req, res) => {
  const b = batasAkses(req.user);
  const params = [...b.params];
  let where = `WHERE ${b.sql}`;
  if (req.query.rombel_id) {
    where += ' AND k.rombel_id=?';
    params.push(Number(req.query.rombel_id));
  }
  if (req.query.dari) {
    where += ' AND k.tanggal>=?';
    params.push(String(req.query.dari));
  }
  if (req.query.sampai) {
    where += ' AND k.tanggal<=?';
    params.push(String(req.query.sampai));
  }
  // LIMIT diinterpolasi setelah dibatasi: nilai dari query string tidak boleh
  // masuk SQL apa adanya.
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 60));
  const rows = db
    .prepare(
      `SELECT k.*, r.nama AS rombel_nama, c.nama AS cabang_nama, p.display_name AS pengunggah
       FROM kegiatan_foto k
       JOIN rombel r ON r.id=k.rombel_id
       JOIN cabang c ON c.id=k.cabang_id
       LEFT JOIN pengguna p ON p.id=k.created_by
       ${where}
       ORDER BY k.tanggal DESC, k.id DESC
       LIMIT ${limit}`
    )
    .all(...params);
  res.json(
    rows.map((r) => ({
      ...r,
      // Foto yang sudah diarsipkan tidak punya berkas penuh lagi. Mengirim url
      // aslinya akan menghasilkan 404 di modal pratinjau, jadi url diarahkan ke
      // thumbnail: yang dilihat wali tetap fotonya, hanya beresolusi kecil.
      url: r.diarsipkan ? r.thumb_url : r.url,
      diarsipkan: !!r.diarsipkan,
      boleh_hapus: bolehHapus(req.user, r)
    }))
  );
});

router.post('/', auth(UNGGAH), uploadImage.array('foto', MAKS_SEKALI_UNGGAH), async (req, res) => {
  const rombelId = Number(req.body.rombel_id);
  const rombel = db.prepare('SELECT id,nama,cabang_id FROM rombel WHERE id=?').get(rombelId);
  if (!rombel) return res.status(400).json({ error: 'Rombel tidak ditemukan' });
  if (!bolehUnggah(req.user, rombel)) return res.status(403).json({ error: 'Anda tidak mengelola rombel ini' });

  const tanggal = String(req.body.tanggal || todayWIB());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return res.status(400).json({ error: 'Tanggal tidak valid' });
  if (isFutureTanggal(tanggal)) return res.status(400).json({ error: 'Tanggal tidak boleh di masa depan' });

  const judul = String(req.body.judul || '').trim();
  if (judul.length < 3 || judul.length > 80) return res.status(400).json({ error: 'Judul harus 3-80 karakter' });
  const keterangan =
    String(req.body.keterangan || '')
      .trim()
      .slice(0, 300) || null;

  const berkas = req.files || [];
  if (!berkas.length) return res.status(400).json({ error: 'Pilih minimal satu foto' });

  const sudah = db
    .prepare('SELECT COUNT(*) c FROM kegiatan_foto WHERE rombel_id=? AND tanggal=? AND judul=?')
    .get(rombelId, tanggal, judul).c;
  if (sudah + berkas.length > MAKS_PER_ALBUM)
    return res.status(400).json({ error: `Maksimal ${MAKS_PER_ALBUM} foto per album` });

  ensureDir(DIR);
  const dibuat = [];
  const gagal = [];
  for (const f of berkas) {
    const nama = `${rombelId}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.jpg`;
    const namaThumb = nama.replace(/\.jpg$/, '-thumb.jpg');
    try {
      await saveFotoKegiatan(f.buffer, path.join(DIR, nama));
      await saveFotoKegiatan(f.buffer, path.join(DIR, namaThumb), { width: 480, quality: 78 });
      const size = fs.statSync(path.join(DIR, nama)).size;
      const r = db
        .prepare(
          `INSERT INTO kegiatan_foto(cabang_id,rombel_id,tanggal,judul,keterangan,url,thumb_url,size_bytes,created_by,created_at)
           VALUES(?,?,?,?,?,?,?,?,?,?)`
        )
        .run(
          rombel.cabang_id,
          rombelId,
          tanggal,
          judul,
          keterangan,
          `/uploads/kegiatan/${nama}`,
          `/uploads/kegiatan/${namaThumb}`,
          size,
          req.user.id,
          nowUtc()
        );
      dibuat.push({
        id: r.lastInsertRowid,
        url: `/uploads/kegiatan/${nama}`,
        thumb_url: `/uploads/kegiatan/${namaThumb}`
      });
    } catch (e) {
      // Satu foto rusak tidak boleh membatalkan yang lain, tetapi kegagalannya
      // harus terlihat — jangan diam-diam kehilangan berkas guru.
      gagal.push({ nama: f.originalname || nama, error: e.message });
    }
  }

  if (!dibuat.length) return res.status(400).json({ error: 'Semua foto gagal diproses', gagal });

  audit(req.user, 'unggah_kegiatan', 'kegiatan_foto', null, {
    cabang_id: rombel.cabang_id,
    after: { rombel_id: rombelId, tanggal, judul, jumlah: dibuat.length }
  });
  res.status(201).json({ success: true, dibuat, gagal });
});

router.delete('/:id', auth(UNGGAH), (req, res) => {
  const row = db.prepare('SELECT * FROM kegiatan_foto WHERE id=?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Foto tidak ditemukan' });
  if (!bolehHapus(req.user, row)) return res.status(403).json({ error: 'Akses ditolak' });

  db.prepare('DELETE FROM kegiatan_foto WHERE id=?').run(row.id);
  hapusBerkas(row.url);
  hapusBerkas(row.thumb_url);
  audit(req.user, 'hapus_kegiatan', 'kegiatan_foto', row.id, { cabang_id: row.cabang_id });
  res.json({ success: true });
});

module.exports = router;
module.exports.bolehUnggah = bolehUnggah;
module.exports.bolehHapus = bolehHapus;
module.exports.batasAkses = batasAkses;
