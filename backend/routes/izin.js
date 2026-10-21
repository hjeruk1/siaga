// Izin/sakit online: orang tua mengajukan dari portal, sekolah memutuskan,
// dan keputusan itu langsung menjadi status absensi.
//
// Kenapa ini perlu: alurnya sekarang lewat WhatsApp — orang tua mengabari guru,
// guru mengubah status satu per satu di layar absensi. Tidak ada jejak siapa
// mengajukan apa, kapan, dan dengan alasan apa; dan kalau gurunya sedang tidak
// membuka aplikasi, statusnya tertinggal.
const path = require('path');
const router = require('express').Router();
const sharp = require('sharp');
const db = require('../db');
const auth = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { izinVerifikasiSchema } = require('../schemas');
const { uploadImage, ensureDir } = require('../utils/image-upload');
const { broadcastAbsensi } = require('../utils/absensi-stream');
const {
  nowUtc,
  todayWIB,
  activeEnrollment,
  canAccessSiswa,
  canWaliAccessSiswa,
  siswaScopeSql,
  requireActiveCabang,
  audit,
  notify,
  isSchoolDay,
  isDayClosed
} = require('../utils/workflow');

const IZIN_DIR = path.resolve(__dirname, '../uploads/izin');
const STATUS_ABSEN = { izin: 'Izin', sakit: 'Sakit' };
const MAKS_HARI = 30;
const MAKS_MUNDUR_HARI = 30;
const MAKS_MAJU_HARI = 60;

function tanggalValid(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// Daftar tanggal inklusif. Dihitung dalam UTC supaya perbedaan zona waktu
// server tidak pernah menambah atau menghilangkan satu hari.
function daftarTanggal(mulai, selesai) {
  const out = [];
  const [y1, m1, d1] = mulai.split('-').map(Number);
  const [y2, m2, d2] = selesai.split('-').map(Number);
  let t = Date.UTC(y1, m1 - 1, d1);
  const akhir = Date.UTC(y2, m2 - 1, d2);
  while (t <= akhir && out.length <= 400) {
    out.push(new Date(t).toISOString().slice(0, 10));
    t += 24 * 60 * 60 * 1000;
  }
  return out;
}

function geserTanggal(tanggal, hari) {
  const [y, m, d] = tanggal.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + hari * 86400000).toISOString().slice(0, 10);
}

// Penerima notifikasi saat pengajuan masuk: kepala sekolah, admin cabang, dan
// guru yang mengampu rombel anak tersebut. Guru kelas adalah yang paling sering
// mengambil keputusan, jadi tidak boleh ketinggalan.
function penerimaPengajuan(cabangId, rombelId) {
  const ids = new Set();
  const staff = db
    .prepare(
      `SELECT p.id FROM pengguna p
       JOIN staff_profile sp ON sp.pengguna_id=p.id
       WHERE p.status='aktif' AND p.role IN ('kepsek','admin_cabang') AND sp.cabang_id=?`
    )
    .all(cabangId);
  for (const s of staff) ids.add(s.id);
  if (rombelId) {
    const guru = db.prepare('SELECT pengguna_id AS id FROM guru_rombel WHERE rombel_id=?').all(rombelId);
    for (const g of guru) ids.add(g.id);
  }
  return [...ids];
}

function ambilIzin(id) {
  return db
    .prepare(
      `SELECT i.*, s.nama AS siswa_nama, s.status AS siswa_status, c.nama AS cabang_nama
       FROM izin_request i
       JOIN siswa s ON s.id=i.siswa_id
       JOIN cabang c ON c.id=i.cabang_id
       WHERE i.id=?`
    )
    .get(id);
}

// ---------------------------------------------------------------------------
// Pengajuan dari portal wali
// ---------------------------------------------------------------------------
router.post('/', auth(['wali']), uploadImage.single('lampiran'), async (req, res) => {
  const d = req.body || {};
  const siswaId = Number(d.siswa_id);
  if (!siswaId || !canWaliAccessSiswa(req.user, siswaId)) return res.status(403).json({ error: 'Akses siswa ditolak' });

  const siswa = db.prepare('SELECT id,nama,status FROM siswa WHERE id=?').get(siswaId);
  if (!siswa || siswa.status !== 'aktif')
    return res.status(400).json({ error: 'Siswa nonaktif tidak bisa mengajukan izin' });

  const jenis = String(d.jenis || '').toLowerCase();
  if (!STATUS_ABSEN[jenis]) return res.status(400).json({ error: 'Jenis izin harus "izin" atau "sakit"' });

  const mulai = String(d.tanggal_mulai || '').trim();
  const selesai = String(d.tanggal_selesai || mulai).trim();
  if (!tanggalValid(mulai) || !tanggalValid(selesai)) return res.status(400).json({ error: 'Tanggal tidak valid' });
  if (selesai < mulai) return res.status(400).json({ error: 'Tanggal selesai tidak boleh sebelum tanggal mulai' });

  const daftar = daftarTanggal(mulai, selesai);
  if (daftar.length > MAKS_HARI)
    return res.status(400).json({ error: `Izin maksimal ${MAKS_HARI} hari dalam satu pengajuan` });

  const hariIni = todayWIB();
  if (selesai < geserTanggal(hariIni, -MAKS_MUNDUR_HARI))
    return res
      .status(400)
      .json({ error: `Izin untuk tanggal lebih dari ${MAKS_MUNDUR_HARI} hari lalu tidak bisa diajukan` });
  if (mulai > geserTanggal(hariIni, MAKS_MAJU_HARI))
    return res.status(400).json({ error: `Izin paling jauh ${MAKS_MAJU_HARI} hari ke depan` });

  const alasan = String(d.alasan || '').trim();
  if (alasan.length < 5) return res.status(400).json({ error: 'Tuliskan alasan izin (minimal 5 karakter)' });
  if (alasan.length > 500) return res.status(400).json({ error: 'Alasan terlalu panjang (maksimal 500 karakter)' });

  const enrollment = activeEnrollment(siswaId, mulai);
  if (!enrollment) return res.status(404).json({ error: 'Data kelas siswa tidak ditemukan' });
  if (!requireActiveCabang(req, res, enrollment.cabang_id)) return;

  // Rentang yang bertumpuk membuat status absensi saling menimpa dan orang tua
  // bingung mana yang berlaku. Tolak dengan menyebut rentang yang sudah ada.
  const bentrok = db
    .prepare(
      `SELECT tanggal_mulai,tanggal_selesai,status FROM izin_request
       WHERE siswa_id=? AND status IN ('menunggu','disetujui')
         AND NOT (tanggal_selesai < ? OR tanggal_mulai > ?)
       LIMIT 1`
    )
    .get(siswaId, mulai, selesai);
  if (bentrok) {
    return res.status(400).json({
      error: `Sudah ada izin ${bentrok.status} pada ${bentrok.tanggal_mulai} s/d ${bentrok.tanggal_selesai}`
    });
  }

  let lampiranUrl = null;
  if (req.file) {
    ensureDir(IZIN_DIR);
    // Surat dokter sering difoto miring dan berukuran besar; lebar 1400px
    // cukup untuk membaca nomor surat tanpa membebani kuota orang tua.
    const filename = `izin-${siswaId}-${Date.now()}.jpg`;
    await sharp(req.file.buffer)
      .resize(1400, null, { withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toFile(path.join(IZIN_DIR, filename));
    lampiranUrl = `/uploads/izin/${filename}`;
  }

  const now = nowUtc();
  const r = db
    .prepare(
      `INSERT INTO izin_request(siswa_id,cabang_id,wali_pengguna_id,jenis,tanggal_mulai,tanggal_selesai,alasan,lampiran_url,status,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,'menunggu',?,?)`
    )
    .run(siswaId, enrollment.cabang_id, req.user.id, jenis, mulai, selesai, alasan, lampiranUrl, now, now);

  const izinId = r.lastInsertRowid;
  audit(req.user, 'izin_ajukan', 'izin_request', izinId, {
    cabang_id: enrollment.cabang_id,
    after: { jenis, mulai, selesai }
  });

  const label = jenis === 'sakit' ? 'Sakit' : 'Izin';
  for (const penerima of penerimaPengajuan(enrollment.cabang_id, enrollment.rombel_id)) {
    notify(
      penerima,
      'izin_baru',
      `Pengajuan ${label}: ${siswa.nama}`,
      `${mulai === selesai ? mulai : `${mulai} s/d ${selesai}`} — ${alasan}`,
      'izin_request',
      izinId,
      enrollment.cabang_id
    );
  }

  res.status(201).json({ success: true, id: izinId, status: 'menunggu' });
});

// Riwayat izin satu anak (portal wali).
router.get('/wali/:siswaId', auth(['wali']), (req, res) => {
  const siswaId = Number(req.params.siswaId);
  if (!siswaId || !canWaliAccessSiswa(req.user, siswaId)) return res.status(403).json({ error: 'Akses siswa ditolak' });
  const rows = db
    .prepare(
      `SELECT i.id,i.jenis,i.tanggal_mulai,i.tanggal_selesai,i.alasan,i.lampiran_url,i.status,
              i.catatan_verifikator,i.verified_at,i.created_at,
              (julianday(i.tanggal_selesai)-julianday(i.tanggal_mulai)+1) AS jumlah_hari
       FROM izin_request i
       WHERE i.siswa_id=?
       ORDER BY i.tanggal_mulai DESC, i.id DESC
       LIMIT 50`
    )
    .all(siswaId);
  res.json({ rows });
});

// Daftar untuk layar sekolah (guru/admin/kepsek), dibatasi peran lewat scope.
router.get('/', auth(['guru', 'admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const status = ['menunggu', 'disetujui', 'ditolak', 'dibatalkan'].includes(req.query.status)
    ? req.query.status
    : 'menunggu';
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
  const scope = siswaScopeSql(req.user, 's', req.query.cabang_id);
  const rows = db
    .prepare(
      `SELECT DISTINCT i.id,i.siswa_id,i.jenis,i.tanggal_mulai,i.tanggal_selesai,i.alasan,
              i.lampiran_url,i.status,i.catatan_verifikator,i.verified_at,i.created_at,
              s.nama AS siswa_nama,s.foto AS siswa_foto,
              c.nama AS cabang_nama,
              r.nama AS rombel_nama,
              w.display_name AS wali_nama,
              (julianday(i.tanggal_selesai)-julianday(i.tanggal_mulai)+1) AS jumlah_hari
       FROM izin_request i
       JOIN siswa s ON s.id=i.siswa_id
       ${scope.join}
       JOIN cabang c ON c.id=i.cabang_id
       LEFT JOIN rombel r ON r.id=se_scope.rombel_id
       LEFT JOIN pengguna w ON w.id=i.wali_pengguna_id
       WHERE i.status=? AND ${scope.where}
       ORDER BY i.created_at DESC
       LIMIT ?`
    )
    .all(status, ...scope.params, limit);
  res.json({ rows });
});

// ---------------------------------------------------------------------------
// Keputusan sekolah
// ---------------------------------------------------------------------------
function muatUntukKeputusan(req, res) {
  const izin = ambilIzin(Number(req.params.id));
  if (!izin) {
    res.status(404).json({ error: 'Pengajuan izin tidak ditemukan' });
    return null;
  }
  if (izin.status !== 'menunggu') {
    res.status(400).json({ error: `Pengajuan ini sudah ${izin.status}` });
    return null;
  }
  const akses = canAccessSiswa(req.user, izin.siswa_id, { tanggal: izin.tanggal_mulai });
  if (!akses) {
    res.status(403).json({ error: 'Akses siswa ditolak' });
    return null;
  }
  if (!requireActiveCabang(req, res, izin.cabang_id)) return null;
  return izin;
}

router.post('/:id/setujui', auth(['guru', 'admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const izin = muatUntukKeputusan(req, res);
  if (!izin) return;

  const catatan =
    String(req.body?.catatan || '')
      .trim()
      .slice(0, 500) || null;
  const statusAbsen = STATUS_ABSEN[izin.jenis];
  const tanggalList = daftarTanggal(izin.tanggal_mulai, izin.tanggal_selesai);
  const hasil = { diterapkan: 0, hariLibur: 0, hariDitutup: 0, sudahHadir: 0, tanpaKelas: 0 };

  const terapkan = db.transaction(() => {
    for (const tanggal of tanggalList) {
      // Hari libur tidak perlu dicatat sebagai izin — tidak ada sekolah.
      if (!isSchoolDay(tanggal, izin.cabang_id)) {
        hasil.hariLibur += 1;
        continue;
      }
      // Hari yang sudah ditutup terkunci: mengubahnya akan membuat rekap
      // harian yang sudah dilaporkan berbeda dari datanya.
      if (isDayClosed(tanggal, izin.cabang_id)) {
        hasil.hariDitutup += 1;
        continue;
      }
      const enrollment = activeEnrollment(izin.siswa_id, tanggal);
      if (!enrollment) {
        hasil.tanpaKelas += 1;
        continue;
      }
      const ada = db
        .prepare('SELECT id,status FROM absensi WHERE siswa_id=? AND tanggal=?')
        .get(izin.siswa_id, tanggal);
      if (ada) {
        // Kehadiran nyata tidak boleh ditimpa oleh izin: kalau anak ternyata
        // masuk, kehadirannya yang benar, bukan surat izinnya.
        if (['Hadir', 'Terlambat', 'Menunggu', 'Pulang'].includes(ada.status)) {
          hasil.sudahHadir += 1;
          continue;
        }
        db.prepare('UPDATE absensi SET status=?,catatan=?,manual=1,updated_at=? WHERE id=?').run(
          statusAbsen,
          `Izin online disetujui${catatan ? `: ${catatan}` : ''}`,
          nowUtc(),
          ada.id
        );
      } else {
        db.prepare(
          `INSERT INTO absensi(siswa_id,cabang_id,jenjang_id,rombel_id,paket,tanggal,status,catatan,manual,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?,?,1,?,?)`
        ).run(
          izin.siswa_id,
          enrollment.cabang_id,
          enrollment.jenjang_id,
          enrollment.rombel_id,
          enrollment.paket,
          tanggal,
          statusAbsen,
          `Izin online disetujui${catatan ? `: ${catatan}` : ''}`,
          nowUtc(),
          nowUtc()
        );
      }
      hasil.diterapkan += 1;
    }

    db.prepare(
      `UPDATE izin_request SET status='disetujui',catatan_verifikator=?,verified_by=?,verified_at=?,updated_at=? WHERE id=?`
    ).run(catatan, req.user.id, nowUtc(), nowUtc(), izin.id);
  });
  terapkan();

  audit(req.user, 'izin_setujui', 'izin_request', izin.id, {
    cabang_id: izin.cabang_id,
    after: { ...hasil, catatan }
  });

  const rentang =
    izin.tanggal_mulai === izin.tanggal_selesai
      ? izin.tanggal_mulai
      : `${izin.tanggal_mulai} s/d ${izin.tanggal_selesai}`;
  notify(
    izin.wali_pengguna_id,
    'izin_disetujui',
    `Izin disetujui: ${izin.siswa_nama}`,
    `Pengajuan ${izin.jenis} untuk ${rentang} disetujui.${catatan ? ` Catatan: ${catatan}` : ''}`,
    'izin_request',
    izin.id,
    izin.cabang_id
  );
  broadcastAbsensi(izin.cabang_id);

  res.json({ success: true, ...hasil });
});

router.post(
  '/:id/tolak',
  auth(['guru', 'admin', 'admin_cabang', 'kepsek']),
  validateBody(izinVerifikasiSchema),
  (req, res) => {
    const izin = muatUntukKeputusan(req, res);
    if (!izin) return;

    // Alasan penolakan wajib: tanpa itu orang tua hanya melihat "ditolak" dan
    // akan mengirim pengajuan yang sama berulang kali.
    const alasan = String(req.body?.alasan || '').trim();
    if (alasan.length < 3) return res.status(400).json({ error: 'Tuliskan alasan penolakan' });

    db.prepare(
      `UPDATE izin_request SET status='ditolak',catatan_verifikator=?,verified_by=?,verified_at=?,updated_at=? WHERE id=?`
    ).run(alasan.slice(0, 500), req.user.id, nowUtc(), nowUtc(), izin.id);

    audit(req.user, 'izin_tolak', 'izin_request', izin.id, {
      cabang_id: izin.cabang_id,
      reason: alasan.slice(0, 500)
    });

    const rentang =
      izin.tanggal_mulai === izin.tanggal_selesai
        ? izin.tanggal_mulai
        : `${izin.tanggal_mulai} s/d ${izin.tanggal_selesai}`;
    notify(
      izin.wali_pengguna_id,
      'izin_ditolak',
      `Izin ditolak: ${izin.siswa_nama}`,
      `Pengajuan ${izin.jenis} untuk ${rentang} ditolak. Alasan: ${alasan}`,
      'izin_request',
      izin.id,
      izin.cabang_id
    );

    res.json({ success: true });
  }
);

// Wali membatalkan pengajuannya sendiri selama belum diputuskan.
router.post('/:id/batal', auth(['wali']), (req, res) => {
  const izin = ambilIzin(Number(req.params.id));
  if (!izin) return res.status(404).json({ error: 'Pengajuan izin tidak ditemukan' });
  if (Number(izin.wali_pengguna_id) !== Number(req.user.id))
    return res.status(403).json({ error: 'Pengajuan ini bukan milik Anda' });
  if (izin.status !== 'menunggu') return res.status(400).json({ error: `Pengajuan ini sudah ${izin.status}` });

  db.prepare("UPDATE izin_request SET status='dibatalkan',updated_at=? WHERE id=?").run(nowUtc(), izin.id);
  audit(req.user, 'izin_batal', 'izin_request', izin.id, { cabang_id: izin.cabang_id });
  res.json({ success: true });
});

module.exports = router;
