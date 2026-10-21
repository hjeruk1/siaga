// Tes verifikasi dua faktor (TOTP) untuk akun staff.
//
// Yang dijaga:
//   - util: kode benar diterima, kode salah/tetangga-kedaluwarsa ditolak,
//     kode TIDAK bisa dipakai ulang (replay), kode pemulihan sekali pakai
//   - HTTP: password benar saja tidak lagi cukup; tantangan -> kode -> JWT;
//     kunci percobaan; kode pemulihan; wali tidak tersentuh; matikan 2FA
//     wajib password
//   - secret 2FA tersimpan TERENKRIPSI di DB (backup cloud tidak boleh bocor)
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
// Berkas ini juga dijalankan langsung (node --test) tanpa harness: pastikan
// kunci enkripsi ada supaya pengujian "secret terenkripsi" benar-benar menguji
// enkripsi, bukan jalan buntu plain:. Harness (npm test) sudah menyetel
// JWT_SECRET, jadi ||= tidak menimpa nilainya.
process.env.JWT_SECRET ||= 'kunci-uji-totp-lokal';
const db = require('../backend/db');
const bcrypt = require('../backend/node_modules/bcryptjs');
const totp = require('../backend/utils/totp');

const BASE = process.env.TEST_URL || 'http://127.0.0.1:3999';
const NYAWA = Date.now();
const PASSWORD = 'rahasia-2fa-uji';

function req(method, p, body, token) {
  return fetch(`${BASE}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
}

// Kode valid untuk "sekarang" menurut server. Server menerima ±1 langkah,
// jadi kode ini tetap berlaku walau tes melewati batas 30 detik.
function kodeSekarang(secret) {
  return totp.hitungKode(secret, totp.langkahSekarang());
}

function kodeSalahDari(secret) {
  const k = kodeSekarang(secret);
  const salah = String((Number(k[k.length - 1]) + 1) % 10);
  return k.slice(0, -1) + salah;
}

// Kode segar untuk satu akun. Server menolak kode dari langkah yang sudah
// pernah diterima (replay protection), dan hanya menerima langkah dalam
// jendela ±1 dari waktu NYATA. Jadi: kalau langkah ini sudah terpakai untuk
// akun ini, tunggu rollover 30 detik berikutnya dan pakai langkah baru.
// Deterministik — dan setiap kode yang dipakai tetap kode yang benar-benar
// diterima server, bukan jalan pintas yang melemahkan proteksi.
const stepTerpakai = new Map(); // username -> langkah terakhir yang diterima server
async function kodeSegar(username, secret) {
  const terpakai = stepTerpakai.get(username) || 0;
  if (terpakai >= totp.langkahSekarang()) {
    await new Promise((r) => setTimeout(r, (totp.sisaDetikKode() + 1) * 1000));
  }
  const step = totp.langkahSekarang();
  stepTerpakai.set(username, step);
  return totp.hitungKode(secret, step);
}

let dibuat = [];

async function buatStaff(nama, role = 'admin') {
  const id = db
    .prepare(
      `INSERT INTO pengguna(tipe,role,display_name,username,password_hash,status,must_change_password,created_at,updated_at)
       VALUES('staff',?,?,?,?,'aktif',0,?,?)`
    )
    .run(
      role,
      `Uji ${nama}`,
      `totp-${nama}-${NYAWA}`,
      bcrypt.hashSync(PASSWORD, 8),
      new Date().toISOString(),
      new Date().toISOString()
    ).lastInsertRowid;
  dibuat.push(id);
  return { id, username: `totp-${nama}-${NYAWA}` };
}

async function login(username) {
  return req('POST', '/api/auth/login', { tipe: 'staff', username, password: PASSWORD });
}

function bersihkan() {
  if (!dibuat.length) return;
  const ids = dibuat.join(',');
  db.prepare(`DELETE FROM audit_log WHERE actor_pengguna_id IN (${ids})`).run();
  db.prepare(`DELETE FROM pengguna WHERE id IN (${ids})`).run();
  dibuat = [];
}

// ---------------------------------------------------------------------------
// Util TOTP
// ---------------------------------------------------------------------------

describe('util TOTP', () => {
  it('menerima kode langkah berjalan, menolak kode salah', () => {
    const secret = totp.buatSecret();
    const sekarang = 1_700_000_123_000; // waktu tetap: tes deterministik
    const kode = totp.hitungKode(secret, totp.langkahSekarang(sekarang));
    assert.match(kode, /^\d{6}$/);
    assert.equal(totp.verifikasiKode(secret, kode, null, { sekarang }).ok, true);
    // Kode dari 100 langkah lalu = jauh di luar jendela.
    const lama = totp.hitungKode(secret, totp.langkahSekarang(sekarang) - 100);
    assert.equal(totp.verifikasiKode(secret, lama, null, { sekarang }).ok, false);
    // Kode acak: mutasi digit terakhir dari kode valid hampir pasti salah.
    const salah = String((Number(kode[5]) + 1) % 10);
    assert.equal(totp.verifikasiKode(secret, kode.slice(0, 5) + salah, null, { sekarang }).ok, false);
    // Format bukan 6 angka langsung ditolak.
    assert.equal(totp.verifikasiKode(secret, '12345', null, { sekarang }).ok, false);
    assert.equal(totp.verifikasiKode(secret, '', null, { sekarang }).ok, false);
  });

  it('menerima kode dari langkah tetangga (jam ponsel meleset <=30 detik)', () => {
    const secret = totp.buatSecret();
    const sekarang = 1_700_000_450_000;
    const c = totp.langkahSekarang(sekarang);
    for (const step of [c - 1, c + 1]) {
      const kode = totp.hitungKode(secret, step);
      const hasil = totp.verifikasiKode(secret, kode, null, { sekarang });
      assert.equal(hasil.ok, true, `kode langkah ${step} harus diterima`);
    }
    // Dua langkah menjauh tetap ditolak.
    const jauh = totp.hitungKode(secret, c - 2);
    assert.equal(totp.verifikasiKode(secret, jauh, null, { sekarang }).ok, false);
  });

  it('kode tidak bisa dipakai ulang (replay protection)', () => {
    const secret = totp.buatSecret();
    const sekarang = 1_700_000_800_000;
    const kode = totp.hitungKode(secret, totp.langkahSekarang(sekarang));
    const pertama = totp.verifikasiKode(secret, kode, null, { sekarang });
    assert.equal(pertama.ok, true);
    // Server menyimpan langkah terakhir; kode dari langkah itu atau lebih tua
    // harus ditolak — inilah yang mencegah shoulder-surfing dipakai ulang.
    const ulang = totp.verifikasiKode(secret, kode, pertama.step, { sekarang });
    assert.equal(ulang.ok, false);
    assert.equal(ulang.alasan, 'kode-sudah-dipakai');
  });

  it('secret tersimpan terenkripsi dan terbaca kembali', () => {
    const secret = totp.buatSecret();
    const simpanan = totp.enkripsiSecret(secret);
    assert.match(simpanan, /^enc:v1:/, 'secret harus terenkripsi, bukan polos');
    assert.ok(!simpanan.includes(secret.slice(0, 8)), 'potongan secret tidak boleh terbaca di simpanan');
    assert.equal(totp.dekripsiSecret(simpanan), secret);
    // Simpanan rusak/kunci hilang -> null, bukan plaintext salah.
    assert.equal(totp.dekripsiSecret('enc:v1:bogus:bogus:bogus'), null);
    assert.equal(totp.dekripsiSecret(null), null);
  });

  it('kode pemulihan: 8 kode unik, sekali pakai, kode asing ditolak', () => {
    const daftar = totp.buatKodePemulihan();
    assert.equal(daftar.length, 8);
    assert.equal(new Set(daftar).size, 8, 'kode tidak boleh berulang');
    const simpanan = JSON.stringify(daftar.map((k) => totp.hashKodePemulihan(k)));
    assert.equal(totp.cariKodePemulihan(simpanan, daftar[0]), 0);
    // Huruf kecil/spasi dinormalkan: kode diketik manusia, bukan mesin.
    assert.equal(totp.cariKodePemulihan(simpanan, ` ${daftar[3].toLowerCase()} `), 3);
    assert.equal(totp.cariKodePemulihan(simpanan, 'TIDAKADA-01'), -1);
    assert.equal(totp.cariKodePemulihan(null, daftar[0]), -1);
    // Sekali pakai: hapus dari daftar -> tidak ditemukan lagi.
    const sisa = totp.bacaHashPemulihan(simpanan).filter((_, i) => i !== 0);
    assert.equal(totp.cariKodePemulihan(JSON.stringify(sisa), daftar[0]), -1);
  });
});

// ---------------------------------------------------------------------------
// Alur HTTP: login -> tantangan -> kode -> sesi
// ---------------------------------------------------------------------------

describe('2FA staff — alur HTTP', () => {
  let utama; // akun utama: dipasang penuh, diuji login & ganti secret
  let terkunci; // akun untuk uji kunci percobaan
  let pulih; // akun untuk uji kode pemulihan
  let mati; // akun untuk uji mematikan 2FA
  let secretUtama; // secret aktif terkini untuk akun utama

  before(async () => {
    utama = await buatStaff('utama');
    terkunci = await buatStaff('terkunci');
    pulih = await buatStaff('pulih');
    mati = await buatStaff('mati');
  });

  after(bersihkan);

  // Login penuh: kalau akun punya 2FA, selesaikan langkah kedua dengan kode
  // segar dari secret yang diketahui tes.
  async function loginLengkap(username, secret) {
    const tantangan = await login(username);
    if (!tantangan.body.perlu_2fa) return tantangan.body.token;
    const r = await req('POST', '/api/auth/2fa/verify', {
      challenge_token: tantangan.body.challenge_token,
      kode: await kodeSegar(username, secret)
    });
    assert.equal(r.status, 200, 'verifikasi 2FA dalam tes harus berhasil');
    return r.body.token;
  }

  it('wali tidak tersentuh 2FA: rute 2FA menolak, login wali biasa', async () => {
    const noWa = `0812${String(NYAWA).slice(-8)}`;
    const waliId = db
      .prepare(
        `INSERT INTO pengguna(tipe,role,display_name,username,no_wa,password_hash,status,must_change_password,created_at,updated_at)
         VALUES('wali','wali',?,?,?,?,'aktif',0,?,?)`
      )
      .run(
        `Uji Wali ${NYAWA}`,
        `totp-wali-${NYAWA}`,
        noWa,
        bcrypt.hashSync(PASSWORD, 8),
        new Date().toISOString(),
        new Date().toISOString()
      ).lastInsertRowid;
    dibuat.push(waliId);

    const rWali = await req('POST', '/api/auth/login', { tipe: 'wali', no_wa: noWa, password: PASSWORD });
    assert.equal(rWali.status, 200);
    assert.ok(!rWali.body.perlu_2fa, 'login wali tidak boleh meminta 2FA');
    assert.ok(rWali.body.token, 'wali langsung dapat token');

    // Wali (walau punya token) tidak boleh mengelola 2FA.
    const rStatus = await req('GET', '/api/auth/2fa/status', null, rWali.body.token);
    assert.equal(rStatus.status, 200);
    assert.equal(rStatus.body.wali, true, 'status 2FA untuk wali dilaporkan jujur');
    const rSetup = await req('POST', '/api/auth/2fa/setup', {}, rWali.body.token);
    assert.equal(rSetup.status, 403);
  });

  it('setup mengembalikan secret + URI otpauth; belum aktif', async () => {
    const token = (await login(utama.username)).body.token;
    const r = await req('POST', '/api/auth/2fa/setup', {}, token);
    assert.equal(r.status, 200);
    assert.match(r.body.secret, /^[A-Z2-7]{32}$/, 'secret base32 160-bit');
    assert.ok(r.body.uri.startsWith('otpauth://totp/'), 'URI otpauth untuk aplikasi authenticator');
    const s = await req('GET', '/api/auth/2fa/status', null, token);
    assert.equal(s.body.aktif, false, 'setup saja belum mengaktifkan');
    assert.equal(s.body.perluDiaktifkan, true, 'admin dapat pengingat');
  });

  it('kode benar mengaktifkan 2FA dan menerbitkan 8 kode pemulihan', async () => {
    const token = (await login(utama.username)).body.token;
    const siap = await req('POST', '/api/auth/2fa/setup', {}, token);
    secretUtama = siap.body.secret;
    const r = await req('POST', '/api/auth/2fa/enable', { kode: await kodeSegar('utama', secretUtama) }, token);
    assert.equal(r.status, 200);
    assert.equal(r.body.recovery.length, 8);
    const s = await req('GET', '/api/auth/2fa/status', null, token);
    assert.equal(s.body.aktif, true);
    assert.equal(s.body.recoverySisa, 8);
    // Secret di DB terenkripsi, bukan polos.
    const row = db.prepare('SELECT totp_secret, totp_recovery FROM pengguna WHERE id=?').get(utama.id);
    assert.match(row.totp_secret, /^enc:v1:/);
    assert.ok(!row.totp_secret.includes(secretUtama), 'secret polos tidak boleh ada di DB');
    // Hash pemulihan: kode asli tidak boleh ada di simpanan.
    assert.ok(!row.totp_recovery.includes(r.body.recovery[0]), 'kode pemulihan polos tidak boleh ada di DB');
  });

  it('login password saja TIDAK lagi cukup: perlu_2fa + tantangan', async () => {
    const r = await login(utama.username);
    assert.equal(r.status, 200);
    assert.equal(r.body.perlu_2fa, true);
    assert.ok(r.body.challenge_token, 'tantangan harus diterbitkan');
    assert.equal(r.body.token, undefined, 'JWT belum boleh dikirim sebelum 2FA');
    // Tanpa tantangan yang benar, rute verify menolak.
    const salahTantangan = await req('POST', '/api/auth/2fa/verify', {
      challenge_token: '1.9999999999.bogus',
      kode: '123456'
    });
    assert.equal(salahTantangan.status, 401);
    // Tantangan kedaluwarsa juga ditolak.
    const usang = await req('POST', '/api/auth/2fa/verify', {
      challenge_token: `${utama.id}.1.${'a'.repeat(64)}`,
      kode: '123456'
    });
    assert.equal(usang.status, 401);
  });

  it('kode authenticator benar menukar tantangan menjadi sesi penuh', async () => {
    const tantangan = await login(utama.username);
    const r = await req('POST', '/api/auth/2fa/verify', {
      challenge_token: tantangan.body.challenge_token,
      kode: await kodeSegar('utama', secretUtama)
    });
    assert.equal(r.status, 200);
    assert.ok(r.body.token, 'sesi penuh diterbitkan');
    assert.equal(r.body.user.username, utama.username);
    const me = await req('GET', '/api/auth/me', null, r.body.token);
    assert.equal(me.status, 200);
    assert.equal(me.body.username, utama.username);
  });

  it('ganti secret saat 2FA aktif wajib password, lalu aktif ulang', async () => {
    // Akun terpisah: alur ini butuh beberapa verifikasi berurutan, dan
    // setiap verifikasi membutuhkan langkah 30 detik yang baru.
    const akun = await buatStaff('ganti');
    const t0 = (await login(akun.username)).body.token;
    const siap = await req('POST', '/api/auth/2fa/setup', {}, t0);
    await req('POST', '/api/auth/2fa/enable', { kode: await kodeSegar(akun.username, siap.body.secret) }, t0);

    // Tanpa password -> ditolak (siapa pun yang memegang sesi tidak boleh
    // memindahkan gerbang kedua ke HP-nya sendiri).
    const t = await loginLengkap(akun.username, siap.body.secret);
    const tanpa = await req('POST', '/api/auth/2fa/setup', {}, t);
    assert.equal(tanpa.status, 400);
    const salah = await req('POST', '/api/auth/2fa/setup', { password: 'bukan-password-ini' }, t);
    assert.equal(salah.status, 400);

    const ganti = await req('POST', '/api/auth/2fa/setup', { password: PASSWORD }, t);
    assert.equal(ganti.status, 200);
    const s = await req('GET', '/api/auth/2fa/status', null, t);
    assert.equal(s.body.aktif, false, 'secret baru harus di-enable ulang (buktikan HP baru bekerja)');

    // aktif=0: login biasa lagi, lalu enable dengan secret baru. Enable yang
    // berhasil sudah membuktikan secret baru benar (butuh kode valid dari
    // secret itu) — tidak perlu menambah verifikasi penuh lagi di sini.
    const token = (await login(akun.username)).body.token;
    const enable = await req(
      'POST',
      '/api/auth/2fa/enable',
      { kode: await kodeSegar(akun.username, ganti.body.secret) },
      token
    );
    assert.equal(enable.status, 200);
    const sAkhir = await req('GET', '/api/auth/2fa/status', null, token);
    assert.equal(sAkhir.body.aktif, true, '2FA aktif lagi dengan secret baru');
  });

  it('kode salah dihitung; 5x salah -> akun terkunci 15 menit', async () => {
    const t = (await login(terkunci.username)).body.token;
    const siap = await req('POST', '/api/auth/2fa/setup', {}, t);
    await req('POST', '/api/auth/2fa/enable', { kode: await kodeSegar('terkunci', siap.body.secret) }, t);

    for (let i = 1; i <= 5; i++) {
      const tantangan = await login(terkunci.username);
      assert.equal(tantangan.body.perlu_2fa, true, `percobaan ${i}: masih di langkah 2FA`);
      const r = await req('POST', '/api/auth/2fa/verify', {
        challenge_token: tantangan.body.challenge_token,
        kode: kodeSalahDari(siap.body.secret)
      });
      assert.equal(r.status, 400, `percobaan ${i} harus gagal`);
      if (i < 5) assert.equal(r.body.code, 'KODE_SALAH');
    }
    const tantangan = await login(terkunci.username);
    const r = await req('POST', '/api/auth/2fa/verify', {
      challenge_token: tantangan.body.challenge_token,
      kode: kodeSalahDari(siap.body.secret)
    });
    assert.equal(r.status, 429, 'kelima percobaan gagal -> terkunci');
    assert.equal(r.body.code, 'TERKUNCI');
    const s = await req('GET', '/api/auth/2fa/status', null, t);
    assert.equal(s.body.terkunci, true);
  });

  it('kode pemulihan masuk sekali; pemakaian kode yang sama ditolak', async () => {
    const t = (await login(pulih.username)).body.token;
    const siap = await req('POST', '/api/auth/2fa/setup', {}, t);
    const enable = await req('POST', '/api/auth/2fa/enable', { kode: await kodeSegar('pulih', siap.body.secret) }, t);
    const kode = enable.body.recovery[0];

    const tantangan = await login(pulih.username);
    const r = await req('POST', '/api/auth/2fa/recovery', {
      challenge_token: tantangan.body.challenge_token,
      kode
    });
    assert.equal(r.status, 200);
    assert.ok(r.body.token);
    assert.equal(r.body.recovery_sisa, 7, 'kode terpakai harus hangus');

    const tantangan2 = await login(pulih.username);
    const r2 = await req('POST', '/api/auth/2fa/recovery', {
      challenge_token: tantangan2.body.challenge_token,
      kode
    });
    assert.equal(r2.status, 400, 'kode sekali pakai: pemakaian kedua ditolak');
    const s = await req('GET', '/api/auth/2fa/status', null, t);
    assert.equal(s.body.recoverySisa, 7);
  });

  it('mematikan 2FA wajib password; setelah mati login kembali biasa', async () => {
    const t = (await login(mati.username)).body.token;
    const siap = await req('POST', '/api/auth/2fa/setup', {}, t);
    await req('POST', '/api/auth/2fa/enable', { kode: await kodeSegar('mati', siap.body.secret) }, t);

    const salah = await req('DELETE', '/api/auth/2fa', { password: 'bukan-password-ini' }, t);
    assert.equal(salah.status, 400, 'password salah tidak boleh mematikan 2FA');

    const ok = await req('DELETE', '/api/auth/2fa', { password: PASSWORD }, t);
    assert.equal(ok.status, 200);

    const sesudah = await login(mati.username);
    assert.equal(sesudah.body.perlu_2fa, undefined, 'tanpa 2FA, login langsung memberikan token');
    assert.ok(sesudah.body.token);
  });
});
