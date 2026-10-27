// Generate tagihan: pratinjau lalu simpan, untuk periode bulanan maupun
// kegiatan.
//
// Pratinjau dan simpan sengaja dipisah: bendahara melihat angka dan jumlah
// siswa lebih dulu, baru menekan simpan. Keduanya memakai perhitungan yang
// sama (enrollmentsInWindow + discountRowsBySiswa yang dimuat sekali), supaya
// angka di layar tidak mungkin berbeda dari yang tersimpan.
const express = require('express');
const db = require('../../db');
const auth = require('../../middleware/auth');
const pengingat = require('../../utils/pengingat');
const { nowUtc, todayWIB, schoolYearForDate, requireActiveCabang, audit } = require('../../utils/workflow');
const {
  monthStart,
  monthEnd,
  cabangParam,
  enrollmentsInWindow,
  discountRowsBySiswa,
  discountTotal
} = require('./helpers');

const router = express.Router();

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
          (siswa_id,cabang_id,jenjang_id,rombel_id,paket,tahun_ajaran,periode,jenis,nama,nominal_awal,diskon_amount,nominal_final,jatuh_tempo,created_by,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  // Jatuh tempo ikut ditulis saat tagihan lahir, bukan dibiarkan kosong lalu
  // ditebak pengingat: satu sumber kebenaran, dan admin bisa mengubahnya per
  // tagihan nanti tanpa mengubah perilaku pengingat.
  const jatuhTempo = pengingat.tanggalJatuhTempo(period, pengingat.ambilSetelan().tanggal);
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
          jatuhTempo,
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

module.exports = router;
