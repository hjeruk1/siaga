// Pengingat tagihan: setelan kebijakan, pratinjau, dan kirim manual.
//
// Setelan bersifat tingkat sekolah (satu kebijakan untuk semua cabang) karena
// tanggal jatuh tempo SPP di sekolah ini seragam. Nomor PENGIRIM tetap per
// cabang: pengiriman memakai cabang_id tagihan, jadi wali Solo menerima pesan
// dari nomor Solo — itu sudah diurus notify() dan utils/wa.js.
//
// Pratinjau sengaja memakai fungsi yang sama dengan pengirim sungguhan
// (daftarKandidat), jadi angka di layar admin tidak bisa berbeda dari yang
// benar-benar dikirim.
const router = require('express').Router();
const auth = require('../middleware/auth');
const pengingat = require('../utils/pengingat');

const ADMIN = ['admin'];
const LIHAT = ['admin', 'admin_cabang', 'kepsek'];

function cabangParam(req) {
  return req.user.role === 'admin' ? req.query.cabang_id || req.body?.cabang_id || null : req.user.cabang_id;
}

router.get('/setelan', auth(LIHAT), (req, res) => {
  res.json(pengingat.ringkasan(cabangParam(req)));
});

// Hanya admin pusat yang boleh mengubah kebijakan: ini menentukan kapan
// ratusan orang tua dihubungi, bukan keputusan operasional satu cabang.
router.put('/setelan', auth(ADMIN), (req, res) => {
  try {
    const setelan = pengingat.simpanSetelan(req.body || {}, req.user);
    res.json({ success: true, setelan, template: pengingat.ambilTemplate() });
  } catch (e) {
    // Kesalahan template (placeholder asing, terlalu panjang) adalah input
    // admin, bukan kegagalan server — 400 dengan pesan yang bisa dibaca.
    res.status(400).json({ error: e.message });
  }
});

// Apa yang AKAN dikirim hari ini (tanpa mengirim). `mode=manual` menampilkan
// seluruh tunggakan, termasuk yang jatuh tempo sebelum tanggal mulai.
router.get('/pratinjau', auth(LIHAT), (req, res) => {
  const cabangId = cabangParam(req);
  const manual = req.query.mode === 'manual';
  const { setelan, kandidat } = pengingat.daftarKandidat({ cabangId, abaikanMulai: manual });
  const contoh = kandidat[0] ? { ...kandidat[0], ...pengingat.susunPesan(kandidat[0]) } : null;
  const perTahap = { h_sebelum: 0, jatuh_tempo: 0, terlambat: 0 };
  for (const k of kandidat) perTahap[k.tahap] += 1;
  res.json({
    aktif: setelan.aktif,
    mulai: setelan.mulai,
    tanggal_jatuh_tempo: setelan.tanggal,
    hari_sebelum: setelan.hariSebelum,
    jam: setelan.jam,
    mode: manual ? 'manual' : 'otomatis',
    total: kandidat.length,
    ...perTahap,
    tanpa_wali: kandidat.filter((k) => !k.wali_id).length,
    total_nilai: kandidat.reduce((n, k) => n + k.sisa, 0),
    contoh,
    // Daftar penuh dipakai admin untuk memeriksa satu per satu sebelum menekan
    // "kirim sekarang"; dibatasi agar respons tidak membengkak.
    baris: kandidat.slice(0, 200)
  });
});

// Kirim sekarang, tanpa menunggu jam job harian. Anti-spam tetap berlaku:
// tahap yang sudah pernah terkirim tidak dikirim ulang.
// body.mode='semua' menyertakan tunggakan sebelum tanggal mulai — hanya lewat
// jalur manual ini, karena admin sudah melihat jumlahnya di pratinjau.
router.post('/kirim', auth(ADMIN), (req, res) => {
  const cabangId = cabangParam(req);
  const abaikanMulai = req.body?.mode === 'semua';
  const hasil = pengingat.kirimPengingat({ cabangId, aktor: req.user, abaikanMulai });
  res.json({ success: true, mode: abaikanMulai ? 'semua' : 'otomatis', ...hasil });
});

module.exports = router;
