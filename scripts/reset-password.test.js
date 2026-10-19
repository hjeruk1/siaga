// Tes pemulihan password mandiri lewat OTP WhatsApp.
//
// Server uji memakai WA_PROVIDER=log (tidak ada pesan sungguhan) dan menulis
// kode ke OTP_DEBUG_FILE supaya alur bisa diselesaikan tanpa membuka celah di
// produksi. Yang dijaga di sini:
//   - balasan permintaan SELALU sama (anti-enumerasi nomor terdaftar)
//   - kode salah dibatasi 5 percobaan, kode sekali pakai, kedaluwarsa 5 menit
//   - password lama mati, semua sesi lama ikut mati (auth_version)
//   - pembatasan laju permintaan kode
//   - akun nonaktif tidak bisa dihidupkan lewat pemulihan mandiri
const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const db = require('../backend/db');
const bcrypt = require('../backend/node_modules/bcryptjs');

const BASE = process.env.TEST_URL || 'http://127.0.0.1:3999';
const NYAWA = Date.now();
const OTP_FILE = process.env.OTP_DEBUG_FILE;

function req(method, p, body) {
  return fetch(`${BASE}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
}

function nomorBaru(i) {
  return `0812${String(NYAWA).slice(-7)}${i}`;
}

function buatWali(label, noWa, status = 'aktif') {
  return db
    .prepare(
      `INSERT INTO pengguna(tipe,role,display_name,username,no_wa,password_hash,status,must_change_password,created_at,updated_at)
       VALUES('wali','wali',?,?,?,?,?,0,?,?)`
    )
    .run(
      `Wali ${label}`,
      `wali-otp-${label}-${NYAWA}`,
      noWa,
      bcrypt.hashSync('PasswordLama123', 8),
      status,
      new Date().toISOString(),
      new Date().toISOString()
    ).lastInsertRowid;
}

function buatStaff(label, username, noWaKontak) {
  const cabang = db.prepare('SELECT id FROM cabang ORDER BY id LIMIT 1').get();
  const id = db
    .prepare(
      `INSERT INTO pengguna(tipe,role,display_name,username,password_hash,status,must_change_password,created_at,updated_at)
       VALUES('staff','guru',?,?,?,'aktif',0,?,?)`
    )
    .run(
      `Guru ${label}`,
      username,
      bcrypt.hashSync('PasswordLama123', 8),
      new Date().toISOString(),
      new Date().toISOString()
    ).lastInsertRowid;
  db.prepare('INSERT INTO staff_profile(pengguna_id,cabang_id,no_wa_kontak) VALUES(?,?,?)').run(
    id,
    cabang.id,
    noWaKontak
  );
  return id;
}

// Kode terakhir yang ditulis server untuk akun ini.
function kodeTerakhir(penggunaId) {
  if (!OTP_FILE || !fs.existsSync(OTP_FILE)) return null;
  const baris = fs
    .readFileSync(OTP_FILE, 'utf8')
    .split('\n')
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => b.split('|'))
    .filter(([id]) => Number(id) === Number(penggunaId));
  return baris.length ? baris[baris.length - 1][1] : null;
}

const KODE_SALAH = '000000';

describe('pemulihan password lewat OTP WhatsApp', () => {
  before(() => {
    assert.ok(OTP_FILE, 'OTP_DEBUG_FILE harus diset oleh harness tes');
  });

  it('permintaan kode untuk wali terdaftar membuat baris OTP dan mengirim pesan', async () => {
    const noWa = nomorBaru(1);
    const waliId = buatWali('satu', noWa);

    const r = await req('POST', '/api/auth/lupa-password', { tipe: 'wali', no_wa: noWa });
    assert.equal(r.status, 200);
    assert.match(r.body.pesan, /jika nomor\/akun itu terdaftar/i);

    const baris = db.prepare('SELECT * FROM reset_otp WHERE pengguna_id=?').all(waliId);
    assert.equal(baris.length, 1);
    // Kode TIDAK boleh tersimpan sebagai plaintext.
    assert.ok(baris[0].kode_hash.startsWith('$2'), 'kode harus di-hash bcrypt');
    assert.ok(!baris[0].kode_hash.includes(kodeTerakhir(waliId)), 'plaintext tidak boleh ada di hash');
    assert.ok(new Date(baris[0].expires_at).getTime() > Date.now(), 'masa berlaku harus di masa depan');
    assert.equal(baris[0].percobaan, 0);
  });

  it('nomor tidak terdaftar mendapat balasan yang SAMA (anti-enumerasi)', async () => {
    const tidakAda = nomorBaru(99);
    const sebelum = db.prepare('SELECT COUNT(*) c FROM reset_otp').get().c;
    const r = await req('POST', '/api/auth/lupa-password', { tipe: 'wali', no_wa: tidakAda });
    assert.equal(r.status, 200);
    assert.match(r.body.pesan, /jika nomor\/akun itu terdaftar/i);
    // Tidak ada kode yang dibuat — tapi balasannya identik dengan nomor terdaftar.
    assert.equal(db.prepare('SELECT COUNT(*) c FROM reset_otp').get().c, sebelum);
  });

  it('kode salah dibatasi 5 percobaan lalu kode mati', async () => {
    const noWa = nomorBaru(2);
    const waliId = buatWali('dua', noWa);
    await req('POST', '/api/auth/lupa-password', { tipe: 'wali', no_wa: noWa });
    const kode = kodeTerakhir(waliId);
    assert.match(kode, /^\d{6}$/);

    const pesan = [];
    for (let i = 0; i < 5; i++) {
      const r = await req('POST', '/api/auth/reset-password', {
        tipe: 'wali',
        no_wa: noWa,
        kode: KODE_SALAH,
        password_baru: 'PasswordBaru123'
      });
      assert.equal(r.status, 400);
      pesan.push(r.body.error);
    }
    assert.match(pesan[0], /sisa 4 percobaan/i);
    assert.match(pesan[4], /5 kali/i);

    // Kode yang BENAR pun sudah tidak berlaku setelah 5 kali salah.
    const setelah = await req('POST', '/api/auth/reset-password', {
      tipe: 'wali',
      no_wa: noWa,
      kode,
      password_baru: 'PasswordBaru123'
    });
    assert.equal(setelah.status, 400);
    assert.match(setelah.body.error, /tidak berlaku|kedaluwarsa/i);

    // Password lama masih berlaku: tidak ada yang berubah.
    const login = await req('POST', '/api/auth/login', { tipe: 'wali', no_wa: noWa, password: 'PasswordLama123' });
    assert.equal(login.status, 200);
  });

  it('kode benar mengganti password, mematikan sesi lama, dan sekali pakai', async () => {
    const noWa = nomorBaru(3);
    const waliId = buatWali('tiga', noWa);

    // Sesi lama sebelum reset.
    const loginLama = await req('POST', '/api/auth/login', { tipe: 'wali', no_wa: noWa, password: 'PasswordLama123' });
    assert.equal(loginLama.status, 200);
    const sebelum = db.prepare('SELECT auth_version FROM pengguna WHERE id=?').get(waliId).auth_version;

    await req('POST', '/api/auth/lupa-password', { tipe: 'wali', no_wa: noWa });
    const kode = kodeTerakhir(waliId);

    const reset = await req('POST', '/api/auth/reset-password', {
      tipe: 'wali',
      no_wa: noWa,
      kode,
      password_baru: 'PasswordBaru123'
    });
    assert.equal(reset.status, 200);
    assert.equal(reset.body.success, true);

    // auth_version naik -> token lama tidak berlaku lagi.
    const sesudah = db.prepare('SELECT auth_version FROM pengguna WHERE id=?').get(waliId).auth_version;
    assert.equal(sesudah, sebelum + 1);
    const meLama = await fetch(`${BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${loginLama.body.token}` } });
    assert.equal(meLama.status, 401, 'token lama harus ditolak');

    // Password lama mati, password baru hidup.
    const loginLama2 = await req('POST', '/api/auth/login', { tipe: 'wali', no_wa: noWa, password: 'PasswordLama123' });
    assert.equal(loginLama2.status, 401);
    const loginBaru = await req('POST', '/api/auth/login', { tipe: 'wali', no_wa: noWa, password: 'PasswordBaru123' });
    assert.equal(loginBaru.status, 200);

    // Kode yang sama tidak bisa dipakai dua kali.
    const ulang = await req('POST', '/api/auth/reset-password', {
      tipe: 'wali',
      no_wa: noWa,
      kode,
      password_baru: 'PasswordLain123'
    });
    assert.equal(ulang.status, 400);

    // Jejak audit tercatat.
    const audit = db
      .prepare("SELECT COUNT(*) c FROM audit_log WHERE action='password_reset_otp' AND entity_id=?")
      .get(waliId).c;
    assert.ok(audit >= 1, 'reset harus tercatat di audit_log');
  });

  it('password lemah ditolak sebelum kode dipakai', async () => {
    const noWa = nomorBaru(4);
    const waliId = buatWali('empat', noWa);
    await req('POST', '/api/auth/lupa-password', { tipe: 'wali', no_wa: noWa });
    const kode = kodeTerakhir(waliId);

    for (const lemah of ['pendek', 'tanpaangka', '1234567890']) {
      const r = await req('POST', '/api/auth/reset-password', {
        tipe: 'wali',
        no_wa: noWa,
        kode,
        password_baru: lemah
      });
      assert.equal(r.status, 400);
      assert.match(r.body.error, /minimal 10 karakter/i);
    }

    // Kode masih hidup karena penolakan terjadi sebelum verifikasi.
    const ok = await req('POST', '/api/auth/reset-password', {
      tipe: 'wali',
      no_wa: noWa,
      kode,
      password_baru: 'PasswordBaru123'
    });
    assert.equal(ok.status, 200);
  });

  it('kode kedaluwarsa ditolak', async () => {
    const noWa = nomorBaru(5);
    const waliId = buatWali('lima', noWa);
    await req('POST', '/api/auth/lupa-password', { tipe: 'wali', no_wa: noWa });
    const kode = kodeTerakhir(waliId);

    // Mundurkan masa berlaku seperti 6 menit lalu.
    db.prepare('UPDATE reset_otp SET expires_at=? WHERE pengguna_id=?').run(
      new Date(Date.now() - 60 * 1000).toISOString(),
      waliId
    );
    const r = await req('POST', '/api/auth/reset-password', {
      tipe: 'wali',
      no_wa: noWa,
      kode,
      password_baru: 'PasswordBaru123'
    });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /kedaluwarsa/i);
  });

  it('pembatasan laju: permintaan keempat dalam 15 menit ditolak', async () => {
    const noWa = nomorBaru(6);
    buatWali('enam', noWa);
    for (let i = 0; i < 3; i++) {
      const r = await req('POST', '/api/auth/lupa-password', { tipe: 'wali', no_wa: noWa });
      assert.equal(r.status, 200, `permintaan ke-${i + 1} harus lolos`);
    }
    const keempat = await req('POST', '/api/auth/lupa-password', { tipe: 'wali', no_wa: noWa });
    assert.equal(keempat.status, 429);
    assert.equal(keempat.body.code, 'TERLALU_SERING');
  });

  it('staff memakai username, kode dikirim ke no_wa_kontak', async () => {
    const username = `guru-otp-${NYAWA}`;
    const noWa = nomorBaru(7);
    const staffId = buatStaff('otp', username, noWa);

    const minta = await req('POST', '/api/auth/lupa-password', { tipe: 'staff', username });
    assert.equal(minta.status, 200);
    const baris = db.prepare('SELECT * FROM reset_otp WHERE pengguna_id=?').get(staffId);
    assert.ok(baris, 'baris OTP staff harus dibuat');
    // Nomor tujuan disamarkan, bukan disimpan penuh.
    assert.ok(baris.tujuan.includes('•'), 'nomor harus disamarkan');

    const kode = kodeTerakhir(staffId);
    const reset = await req('POST', '/api/auth/reset-password', {
      tipe: 'staff',
      username,
      kode,
      password_baru: 'PasswordBaru123'
    });
    assert.equal(reset.status, 200);

    const login = await req('POST', '/api/auth/login', { username, password: 'PasswordBaru123' });
    assert.equal(login.status, 200);
  });

  it('akun nonaktif tidak dikirimi kode dan tidak bisa dihidupkan', async () => {
    const noWa = nomorBaru(8);
    const waliId = buatWali('nonaktif', noWa, 'nonaktif');

    const r = await req('POST', '/api/auth/lupa-password', { tipe: 'wali', no_wa: noWa });
    // Balasan tetap umum (tidak membocorkan status akun)...
    assert.equal(r.status, 200);
    // ...tapi tidak ada kode yang dibuat, jadi tidak ada yang bisa dipakai.
    assert.equal(db.prepare('SELECT COUNT(*) c FROM reset_otp WHERE pengguna_id=?').get(waliId).c, 0);

    const reset = await req('POST', '/api/auth/reset-password', {
      tipe: 'wali',
      no_wa: noWa,
      kode: '123456',
      password_baru: 'PasswordBaru123'
    });
    assert.equal(reset.status, 400);
    const status = db.prepare('SELECT status FROM pengguna WHERE id=?').get(waliId).status;
    assert.equal(status, 'nonaktif');
  });
});
