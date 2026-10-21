// Verifikasi dua faktor (2FA) dengan TOTP untuk akun staff.
//
// Alur login staff menjadi dua langkah:
//   1. POST /api/auth/login      -> password benar  -> tantangan (challenge)
//   2. POST /api/auth/2fa/verify -> kode authenticator -> JWT sungguhan
//
// Kenapa token tantangan dan bukan langsung kirim JWT: kalau password satu-satunya
// gerbang, satu password yang bocor = akses penuh. Token tantangan (HMAC, 5 menit,
// tak pernah disimpan di server) memastikan pemegang HP authenticator juga hadir.
//
// Kenapa ganti/mati 2FA dilindungi password: sama seperti PIN wali — siapa pun
// yang memegang sesi yang sudah login tidak boleh bisa mematikan gerbang.
//
// Wali TIDAK memakai rute ini: gerbang tambahan mereka adalah PIN 6 angka
// (lihat routes/auth.js bagian PIN), karena wali masuk dengan nomor WA yang
// memang sudah menjadi faktor kedua.
const router = require('express').Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const auth = require('../middleware/auth');
const { SECRET, loadUser, MEDIA_COOKIE } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { duaFaktorSchema } = require('../schemas');
const totp = require('../utils/totp');
const { nowUtc, audit } = require('../utils/workflow');
const wa = require('../utils/wa');

const TANTANGAN_MS = 5 * 60 * 1000;
const MAX_COBA = 5;
const KUNCI_MS = 15 * 60 * 1000;
// Peran yang pengelolaannya paling berdampak: kalau akunnya jatuh, seluruh
// data sekolah ikut. Mereka dapat pengingat sampai 2FA aktif.
const ROLE_PENGINGAT = ['admin', 'admin_cabang', 'kepsek'];

function bukanStaff(res) {
  return res.status(403).json({ error: 'Verifikasi dua faktor hanya untuk akun staff' });
}

// ---------------------------------------------------------------------------
// Token tantangan — konsep sama dengan pinToken: HMAC, tanpa database.
//
// Bentuk: <userId>.<exp>.<sig>. userId TIDAK rahasia (klien yang mengirim
// balik tahu ia login sebagai siapa); tanda tangan yang membuktikan token
// benar-benar terbit dari server kita untuk akun itu. Kalau userId di token
// dimanipulasi, sig tidak cocok.
// ---------------------------------------------------------------------------

function buatChallenge(userId) {
  const exp = Math.floor((Date.now() + TANTANGAN_MS) / 1000);
  const sig = crypto.createHmac('sha256', SECRET).update(`2fa:${userId}:${exp}`).digest('hex');
  return `${userId}.${exp}.${sig}`;
}

// Kembalikan userId kalau tantangan asli dan belum kedaluwarsa, else null.
function userIdDariChallenge(token) {
  const [userIdRaw, expRaw, sig] = String(token || '').split('.');
  if (!/^\d+$/.test(userIdRaw || '') || !/^[a-f0-9]{64}$/.test(sig || '')) return null;
  const exp = Number(expRaw);
  if (!Number.isInteger(exp) || exp < Math.floor(Date.now() / 1000)) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(`2fa:${userIdRaw}:${exp}`).digest('hex');
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? Number(userIdRaw) : null;
}

// ---------------------------------------------------------------------------
// Sesi penuh (JWT) — dipakai setelah verifikasi 2FA berhasil. Bentuknya sama
// dengan /api/auth/login supaya frontend tidak perlu cabang khusus.
// ---------------------------------------------------------------------------

function publicUser(u) {
  return {
    id: u.id,
    tipe: u.tipe,
    role: u.role,
    display_name: u.display_name,
    username: u.username,
    no_wa: u.no_wa,
    status: u.status,
    must_change_password: !!u.must_change_password,
    cabang_id: u.cabang_id,
    cabang_nama: u.cabang_nama,
    cabang_kode: u.cabang_kode,
    foto: u.foto
  };
}

function terbitkanSesi(res, user) {
  const token = jwt.sign({ id: user.id, v: Number(user.auth_version || 0) }, SECRET, { expiresIn: '12h' });
  const secure = process.env.NODE_ENV === 'production';
  res.setHeader(
    'Set-Cookie',
    [
      `${MEDIA_COOKIE}=${encodeURIComponent(token)}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Strict',
      'Max-Age=43200',
      secure ? 'Secure' : null
    ]
      .filter(Boolean)
      .join('; ')
  );
  return token;
}

// ---------------------------------------------------------------------------
// Status & helper DB
// ---------------------------------------------------------------------------

function barisTotp(userId) {
  return db
    .prepare(
      `SELECT totp_secret, totp_aktif, totp_recovery, totp_failed_count, totp_locked_until, totp_last_step
       FROM pengguna WHERE id=?`
    )
    .get(userId);
}

function statusDuaFaktor(user) {
  const row = barisTotp(user.id);
  if (!row || !row.totp_secret) return { punya: false, aktif: false };
  const locked = row.totp_locked_until && new Date(row.totp_locked_until).getTime() > Date.now();
  return {
    punya: true,
    aktif: !!row.totp_aktif,
    terkunci: !!locked,
    sisaCoba: Math.max(0, MAX_COBA - (row.totp_failed_count || 0)),
    recoverySisa: totp.bacaHashPemulihan(row.totp_recovery).length,
    perluDiaktifkan: !row.totp_aktif && ROLE_PENGINGAT.includes(user.role)
  };
}

function catatGagal(userId) {
  const gagal = (db.prepare('SELECT totp_failed_count c FROM pengguna WHERE id=?').get(userId).c || 0) + 1;
  const kunciSampai = gagal >= MAX_COBA ? new Date(Date.now() + KUNCI_MS).toISOString() : null;
  db.prepare('UPDATE pengguna SET totp_failed_count=?, totp_locked_until=?, updated_at=? WHERE id=?').run(
    gagal,
    kunciSampai,
    nowUtc(),
    userId
  );
  return { gagal, kunciSampai };
}

function passwordBenar(userId, password) {
  const row = db.prepare('SELECT password_hash FROM pengguna WHERE id=?').get(userId);
  return !!row && bcrypt.compareSync(String(password || ''), row.password_hash);
}

// Notifikasi kejadian keamanan lewat WhatsApp — satu-satunya tanda yang
// mungkin dilihat pemilik akun kalau perubahannya bukan dia yang lakukan.
function beriTahu(user, judul, isi) {
  if (!user.no_wa) return;
  wa.kirimWA({
    no_wa: user.no_wa,
    cabangId: user.cabang_id,
    pesan: ['*SIAGA Taruna Prima*', '', judul, '', isi].join('\n')
  }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Rute untuk pengguna yang sudah login (mengelola 2FA milik sendiri)
// ---------------------------------------------------------------------------

router.get('/2fa/status', auth(), (req, res) => {
  // Wali tidak punya 2FA TOTP (gerbang mereka: PIN). Jawab jujur supaya UI
  // wali bisa menyembunyikan kartu ini.
  if (req.user.tipe !== 'staff') return res.json({ punya: false, aktif: false, wali: true });
  res.json(statusDuaFaktor(req.user));
});

// Langkah 1 pendaftaran: buat secret baru, kembalikan URI otpauth (untuk QR)
// dan secretnya (untuk ketik manual kalau kamera tidak bisa).
//
// Kalau 2FA SUDAH aktif, secret baru hanya boleh dibuat setelah password:
// sama seperti ganti PIN, siapa pun yang memegang sesi login tidak boleh
// bisa memindahkan gerbang kedua ke HP-nya sendiri.
router.post('/2fa/setup', auth(), validateBody(duaFaktorSchema), (req, res) => {
  if (req.user.tipe !== 'staff') return bukanStaff(res);
  const row = barisTotp(req.user.id);
  if (!row) return res.status(404).json({ error: 'Akun tidak ditemukan' });

  const sudahAktif = !!row.totp_aktif && !!row.totp_secret;
  if (sudahAktif && !passwordBenar(req.user.id, req.body?.password))
    return res.status(400).json({ error: 'Password salah' });

  const secret = totp.buatSecret();
  db.prepare(
    'UPDATE pengguna SET totp_secret=?, totp_aktif=0, totp_recovery=NULL, totp_failed_count=0, totp_locked_until=NULL, totp_last_step=NULL, totp_updated_at=?, updated_at=? WHERE id=?'
  ).run(totp.enkripsiSecret(secret), nowUtc(), nowUtc(), req.user.id);

  audit(req.user, '2fa_setup', 'pengguna', req.user.id);
  res.json({
    secret,
    uri: totp.otpauthUri({ secret, akun: req.user.username || req.user.display_name }),
    langkah_detik: totp.LANGKAH_DETIK
  });
});

// Langkah 2 pendaftaran: buktikan pemilik HP authenticator (kode benar dari
// secret yang baru), lalu terbitkan kode pemulihan. Kode pemulihan HANYA
// ditampilkan di sini — server menyimpan hash-nya.
router.post('/2fa/enable', auth(), validateBody(duaFaktorSchema), (req, res) => {
  if (req.user.tipe !== 'staff') return bukanStaff(res);
  const { kode } = req.body || {};
  const row = barisTotp(req.user.id);
  if (!row || !row.totp_secret) return res.status(400).json({ error: 'Mulai dari Langkah 1 (siapkan kode)' });
  if (row.totp_aktif) return res.status(400).json({ error: 'Verifikasi dua faktor sudah aktif' });
  if (statusDuaFaktor(req.user).terkunci)
    return res.status(429).json({ error: 'Terlalu banyak kode salah. Coba lagi beberapa menit.' });

  const secret = totp.dekripsiSecret(row.totp_secret);
  if (!secret) return res.status(400).json({ error: 'Rahasia 2FA tidak terbaca. Ulangi Langkah 1.' });

  const hasil = totp.verifikasiKode(secret, kode, row.totp_last_step);
  if (!hasil.ok) {
    const { gagal } = catatGagal(req.user.id);
    return res.status(400).json({
      error:
        gagal >= MAX_COBA ? 'Kode salah 5 kali. Dikunci 15 menit.' : `Kode salah. Sisa ${MAX_COBA - gagal} percobaan.`,
      code: gagal >= MAX_COBA ? 'TERKUNCI' : 'KODE_SALAH'
    });
  }

  const kodePemulihan = totp.buatKodePemulihan();
  const hashPemulihan = JSON.stringify(kodePemulihan.map((k) => totp.hashKodePemulihan(k)));
  db.prepare(
    'UPDATE pengguna SET totp_aktif=1, totp_recovery=?, totp_failed_count=0, totp_locked_until=NULL, totp_last_step=?, totp_updated_at=?, updated_at=? WHERE id=?'
  ).run(hashPemulihan, hasil.step, nowUtc(), nowUtc(), req.user.id);

  audit(req.user, '2fa_diaktifkan', 'pengguna', req.user.id);
  beriTahu(
    req.user,
    'Verifikasi dua faktor AKTIF',
    'Mulai sekarang, masuk ke SIAGA dari akun Anda membutuhkan kode 6 angka dari aplikasi authenticator.'
  );
  res.json({
    recovery: kodePemulihan,
    recovery_sisa: kodePemulihan.length,
    pesan: 'Simpan kode pemulihan sekarang. Kode hanya ditampilkan sekali.'
  });
});

// Ulang kode pemulihan (ponsel baru/dompet kertas hilang). Wajib password;
// kode lama langsung tidak berlaku.
router.post('/2fa/recovery/regenerate', auth(), validateBody(duaFaktorSchema), (req, res) => {
  if (req.user.tipe !== 'staff') return bukanStaff(res);
  const row = barisTotp(req.user.id);
  if (!row || !row.totp_aktif) return res.status(400).json({ error: 'Verifikasi dua faktor belum aktif' });
  if (!passwordBenar(req.user.id, req.body?.password)) return res.status(400).json({ error: 'Password salah' });

  const kodePemulihan = totp.buatKodePemulihan();
  const hashPemulihan = JSON.stringify(kodePemulihan.map((k) => totp.hashKodePemulihan(k)));
  db.prepare('UPDATE pengguna SET totp_recovery=?, totp_updated_at=?, updated_at=? WHERE id=?').run(
    hashPemulihan,
    nowUtc(),
    nowUtc(),
    req.user.id
  );
  audit(req.user, '2fa_recovery_dibuat', 'pengguna', req.user.id);
  res.json({ recovery: kodePemulihan, recovery_sisa: kodePemulihan.length });
});

// Matikan 2FA. Wajib password: kalau hanya butuh sesi yang sudah login,
// pencopetan HP staff yang sedang membuka SIAGA bisa mematikan gerbang.
router.delete('/2fa', auth(), validateBody(duaFaktorSchema), (req, res) => {
  if (req.user.tipe !== 'staff') return bukanStaff(res);
  const row = barisTotp(req.user.id);
  if (!row || !row.totp_aktif) return res.status(400).json({ error: 'Verifikasi dua faktor belum aktif' });
  if (!passwordBenar(req.user.id, req.body?.password)) return res.status(400).json({ error: 'Password salah' });

  db.prepare(
    'UPDATE pengguna SET totp_aktif=0, totp_secret=NULL, totp_recovery=NULL, totp_failed_count=0, totp_locked_until=NULL, totp_last_step=NULL, totp_updated_at=?, updated_at=? WHERE id=?'
  ).run(nowUtc(), nowUtc(), req.user.id);
  audit(req.user, '2fa_dimatikan', 'pengguna', req.user.id);
  beriTahu(
    req.user,
    'Verifikasi dua faktor DIMATIKAN',
    'Akun SIAGA Anda sekarang hanya dilindungi password. Kalau ini bukan Anda, segera hubungi admin sekolah.'
  );
  res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Rute publik (tanpa login): langkah kedua proses masuk
// ---------------------------------------------------------------------------

// Verifikasi kode authenticator -> terbitkan sesi penuh.
router.post('/2fa/verify', validateBody(duaFaktorSchema), (req, res) => {
  const userId = userIdDariChallenge(req.body?.challenge_token);
  if (!userId) return res.status(401).json({ error: 'Sesi verifikasi tidak berlaku. Masuk lagi dari awal.' });

  const user = loadUser(userId);
  const row = user && barisTotp(userId);
  if (!user || user.status === 'nonaktif' || !row || !row.totp_aktif)
    return res.status(401).json({ error: 'Sesi verifikasi tidak berlaku. Masuk lagi dari awal.' });

  if (row.totp_locked_until && new Date(row.totp_locked_until).getTime() > Date.now())
    return res.status(429).json({ error: 'Terlalu banyak kode salah. Coba lagi beberapa menit.', code: 'TERKUNCI' });

  const secret = totp.dekripsiSecret(row.totp_secret);
  if (!secret) return res.status(400).json({ error: 'Rahasia 2FA tidak terbaca. Hubungi admin sekolah.' });

  const hasil = totp.verifikasiKode(secret, req.body?.kode, row.totp_last_step);
  if (!hasil.ok) {
    const { gagal } = catatGagal(userId);
    return res.status(400).json({
      error:
        gagal >= MAX_COBA
          ? 'Kode salah 5 kali. Dikunci 15 menit.'
          : hasil.alasan === 'kode-sudah-dipakai'
            ? 'Kode ini sudah dipakai. Tunggu kode berikutnya.'
            : `Kode salah. Sisa ${MAX_COBA - gagal} percobaan.`,
      code: gagal >= MAX_COBA ? 'TERKUNCI' : 'KODE_SALAH',
      sisa_coba: Math.max(0, MAX_COBA - gagal)
    });
  }

  db.prepare(
    'UPDATE pengguna SET totp_failed_count=0, totp_locked_until=NULL, totp_last_step=?, updated_at=? WHERE id=?'
  ).run(hasil.step, nowUtc(), userId);
  audit(user, '2fa_verify', 'pengguna', userId);
  const token = terbitkanSesi(res, user);
  res.json({ token, user: publicUser(user) });
});

// Verifikasi kode pemulihan (sekali pakai) -> terbitkan sesi penuh.
router.post('/2fa/recovery', validateBody(duaFaktorSchema), (req, res) => {
  const userId = userIdDariChallenge(req.body?.challenge_token);
  if (!userId) return res.status(401).json({ error: 'Sesi verifikasi tidak berlaku. Masuk lagi dari awal.' });

  const user = loadUser(userId);
  const row = user && barisTotp(userId);
  if (!user || user.status === 'nonaktif' || !row || !row.totp_aktif)
    return res.status(401).json({ error: 'Sesi verifikasi tidak berlaku. Masuk lagi dari awal.' });

  if (row.totp_locked_until && new Date(row.totp_locked_until).getTime() > Date.now())
    return res.status(429).json({ error: 'Terlalu banyak kode salah. Coba lagi beberapa menit.', code: 'TERKUNCI' });

  const idx = totp.cariKodePemulihan(row.totp_recovery, req.body?.kode);
  if (idx < 0) {
    const { gagal } = catatGagal(userId);
    return res.status(400).json({
      error: gagal >= MAX_COBA ? 'Kode salah 5 kali. Dikunci 15 menit.' : 'Kode pemulihan tidak dikenal.',
      code: gagal >= MAX_COBA ? 'TERKUNCI' : 'KODE_SALAH'
    });
  }

  // Kode pemakaian -> hapus dari daftar (sekali pakai, tidak bisa dipakai ulang).
  const sisa = totp.bacaHashPemulihan(row.totp_recovery).filter((_, i) => i !== idx);
  db.prepare(
    'UPDATE pengguna SET totp_recovery=?, totp_failed_count=0, totp_locked_until=NULL, totp_updated_at=?, updated_at=? WHERE id=?'
  ).run(JSON.stringify(sisa), nowUtc(), nowUtc(), userId);

  audit(user, '2fa_recovery_dipakai', 'pengguna', userId, { reason: 'login pakai kode pemulihan' });
  beriTahu(
    user,
    'Kode pemulihan dipakai untuk masuk',
    'Seseorang baru saja masuk ke akun SIAGA Anda memakai kode pemulihan. Kalau ini bukan Anda, segera hubungi admin sekolah.'
  );
  const token = terbitkanSesi(res, user);
  res.json({ token, user: publicUser(user), recovery_sisa: sisa.length });
});

module.exports = router;
// Dipakai routes/auth.js untuk menerbitkan tantangan saat login. Sengaja
// diekspor: logika token tantangan harus hidup di SATU tempat — kalau
// diduplikasi, perubahan kebijakan (mis. umur token) gampang hanya diterapkan
// di salah satu berkas.
module.exports.buatChallenge = buatChallenge;
module.exports.TANTANGAN_MS = TANTANGAN_MS;
