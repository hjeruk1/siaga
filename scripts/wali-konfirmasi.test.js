// Tes alur konfirmasi pembayaran dari wali: unggah bukti -> pending_verification
// -> diverifikasi/ditolak bendahara, plus guard kepemilikan siswa.
//
// Fixture dibuat langsung di DB karena server uji memakai database segar
// (tanpa seed demo).
const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const db = require('../backend/db');
const bcrypt = require('../backend/node_modules/bcryptjs');

const BASE = process.env.TEST_URL || 'http://127.0.0.1:3999';
const NYAWA = Date.now();
const buktiAsli = fs.readFileSync(path.join(__dirname, '..', 'backend', 'uploads', 'foto', 'siswa-demo-1.jpg'));
const nowIso = () => new Date().toISOString();
const today = () => nowIso().slice(0, 10);

function req(method, p, body, token) {
  return fetch(`${BASE}${p}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
}

async function konfirmasi(fields, token) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (k === 'bukti') fd.append('bukti', new Blob([buktiAsli], { type: 'image/jpeg' }), 'bukti.jpg');
    else fd.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  const r = await fetch(`${BASE}/api/billing/wali/konfirmasi`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

function buatWali(username, display, noWa) {
  const ada = db.prepare('SELECT id FROM pengguna WHERE username=?').get(username);
  if (ada) return ada.id;
  return db
    .prepare(
      `INSERT INTO pengguna(tipe,role,display_name,username,no_wa,password_hash,status,must_change_password,created_at,updated_at)
       VALUES('wali','wali',?,?,?,?,'aktif',0,?,?)`
    )
    .run(display, username, noWa, bcrypt.hashSync('admin123', 8), nowIso(), nowIso()).lastInsertRowid;
}

function buatSiswaDenganWali(nama, noWa) {
  const waliId = buatWali(`wali-${nama}-${NYAWA}`, `Wali ${nama}`, noWa);
  const cabang = db.prepare('SELECT id FROM cabang ORDER BY id LIMIT 1').get();
  const jenjang = db.prepare('SELECT id FROM jenjang ORDER BY urutan LIMIT 1').get();
  const rombel = db.prepare('SELECT id FROM rombel WHERE cabang_id=? ORDER BY id LIMIT 1').get(cabang.id);
  const s = db
    .prepare(
      `INSERT INTO siswa(nama,status,foto,catatan_khusus,created_at,updated_at)
       VALUES(?,'aktif',NULL,'fixture uji',?,?)`
    )
    .run(nama, nowIso(), nowIso());
  db.prepare("INSERT INTO wali_siswa(wali_pengguna_id,siswa_id,relasi,aktif,created_at) VALUES(?,?,'Ayah',1,?)").run(
    waliId,
    s.lastInsertRowid,
    nowIso()
  );
  db.prepare(
    `INSERT INTO siswa_enrollment(siswa_id,cabang_id,jenjang_id,rombel_id,paket,tanggal_mulai,status,created_at,created_by)
     VALUES(?,?,?,?,'reguler','2026-01-01','aktif',?,NULL)`
  ).run(s.lastInsertRowid, cabang.id, jenjang.id, rombel.id, nowIso());
  return { siswaId: s.lastInsertRowid, waliId, noWa, username: `wali-${nama}-${NYAWA}` };
}

function buatTagihan(siswaId, nominal) {
  const e = db.prepare("SELECT * FROM siswa_enrollment WHERE siswa_id=? AND status='aktif'").get(siswaId);
  return db
    .prepare(
      `INSERT INTO tagihan(siswa_id,cabang_id,jenjang_id,rombel_id,paket,tahun_ajaran,periode,jenis,nama,
        nominal_awal,prorata_amount,koreksi_amount,diskon_amount,nominal_final,status,created_at,updated_at)
       VALUES(?,?,?,?,'reguler','2026/2027','2026-10','spp','SPP Uji',?,0,0,0,?,'open',?,?)`
    )
    .run(siswaId, e.cabang_id, e.jenjang_id, e.rombel_id, nominal, nominal, nowIso(), nowIso()).lastInsertRowid;
}

describe('wali konfirmasi pembayaran', () => {
  let adminToken;
  let waliToken;
  let waliOrangToken;
  let siswaId;
  let tagihanId;

  before(async () => {
    const login = await req('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
    assert.equal(login.status, 200, 'login admin server uji');
    adminToken = login.body.token;

    // Dua keluarga: pemilik siswa + wali lain yang bukan orang tua siswa itu.
    const pemilik = buatSiswaDenganWali(`Pemilik${NYAWA}`, `0812${String(NYAWA).slice(-8)}`);
    const orang = buatSiswaDenganWali(`Orang${NYAWA}`, `0813${String(NYAWA).slice(-8)}`);
    siswaId = pemilik.siswaId;
    tagihanId = buatTagihan(siswaId, 200000);

    // Login wali memakai no_wa (bukan username), sesuai rute auth.
    const loginPemilik = await req('POST', '/api/auth/login', {
      tipe: 'wali',
      no_wa: pemilik.noWa,
      password: 'admin123'
    });
    if (loginPemilik.status === 200) waliToken = loginPemilik.body.token;
    const loginOrang = await req('POST', '/api/auth/login', {
      tipe: 'wali',
      no_wa: orang.noWa,
      password: 'admin123'
    });
    if (loginOrang.status === 200) waliOrangToken = loginOrang.body.token;
  });

  it('konfirmasi valid: pending_verification, bukti tersimpan, bendahara dinotifikasi', async () => {
    const r = await konfirmasi(
      {
        siswa_id: siswaId,
        tagihan_ids: [tagihanId],
        nominal: 150000,
        metode: 'transfer',
        tanggal_bayar: today(),
        catatan: 'Transfer uji',
        bukti: true
      },
      waliToken
    );
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.status, 'pending_verification');

    const row = db.prepare('SELECT * FROM pembayaran WHERE id=?').get(r.body.id);
    assert.equal(row.status, 'pending_verification');
    assert.equal(row.bukti_path ? 1 : 0, 1, 'bukti_path harus tersimpan');
    assert.match(row.bukti_path, /^\/uploads\/bukti\//);
    assert.equal(row.receipt_no, null, 'kuitansi baru dibuat saat verifikasi');
    const alokasi = db.prepare('SELECT SUM(nominal) n FROM pembayaran_alokasi WHERE pembayaran_id=?').get(r.body.id).n;
    assert.equal(alokasi, 150000);

    const notifBendahara = db
      .prepare("SELECT COUNT(*) c FROM notifikasi WHERE tipe='payment_claim' AND entity_id=?")
      .get(r.body.id).c;
    assert.ok(notifBendahara >= 1, 'bendahara harus dapat notifikasi');
    // WA hanya untuk wali: notifikasi ke staff tidak boleh ikut WhatsApp,
    // walau provider aktif di server uji.
    const waBendahara = db
      .prepare("SELECT wa_sent_at, wa_error FROM notifikasi WHERE tipe='payment_claim' AND entity_id=? LIMIT 1")
      .get(r.body.id);
    assert.equal(waBendahara.wa_sent_at, null, 'notifikasi staff tidak dikirim ke WA');
    assert.equal(waBendahara.wa_error, null);
  });

  it('wali lain tidak bisa mengonfirmasi pembayaran siswa orang lain', async () => {
    const r = await konfirmasi(
      { siswa_id: siswaId, tagihan_ids: [tagihanId], nominal: 50000, metode: 'transfer', bukti: true },
      waliOrangToken
    );
    assert.equal(r.status, 403);
  });

  it('tanpa foto bukti ditolak', async () => {
    const fd = new FormData();
    fd.append('siswa_id', String(siswaId));
    fd.append('tagihan_ids', JSON.stringify([tagihanId]));
    fd.append('nominal', '50000');
    fd.append('metode', 'transfer');
    const r = await fetch(`${BASE}/api/billing/wali/konfirmasi`, {
      method: 'POST',
      headers: waliToken ? { Authorization: `Bearer ${waliToken}` } : {},
      body: fd
    });
    assert.equal(r.status, 400);
  });

  it('nominal melebihi sisa tagihan ditolak', async () => {
    const r = await konfirmasi(
      { siswa_id: siswaId, tagihan_ids: [tagihanId], nominal: 999999999, metode: 'transfer', bukti: true },
      waliToken
    );
    assert.equal(r.status, 400);
    assert.match(r.body.error, /melebihi sisa/);
  });

  it('tanggal masa depan ditolak', async () => {
    const r = await konfirmasi(
      {
        siswa_id: siswaId,
        tagihan_ids: [tagihanId],
        nominal: 50000,
        metode: 'transfer',
        tanggal_bayar: '2099-01-01',
        bukti: true
      },
      waliToken
    );
    assert.equal(r.status, 400);
  });

  it('verifikasi bendahara: kuitansi terbit dan wali dinotifikasi', async () => {
    const dibuat = await konfirmasi(
      { siswa_id: siswaId, tagihan_ids: [tagihanId], nominal: 50000, metode: 'transfer', bukti: true },
      waliToken
    );
    assert.equal(dibuat.status, 200, JSON.stringify(dibuat.body));
    const ver = await req('POST', `/api/billing/pembayaran/${dibuat.body.id}/verify`, undefined, adminToken);
    assert.equal(ver.status, 200, JSON.stringify(ver.body));
    assert.match(ver.body.receipt_no || '', /^TP-/);
    const row = db.prepare('SELECT * FROM pembayaran WHERE id=?').get(dibuat.body.id);
    assert.equal(row.status, 'confirmed');
    assert.ok(row.receipt_no, 'kuitansi terbit saat verifikasi');
    const notifWali = db
      .prepare("SELECT COUNT(*) c FROM notifikasi WHERE tipe='payment_verified' AND entity_id=?")
      .get(dibuat.body.id).c;
    assert.ok(notifWali >= 1, 'wali harus dinotifikasi saat terverifikasi');
    // Kanal WA ikut jalan (provider 'log' di server uji): wa_sent_at tercatat.
    // Pengiriman asinkron (antrean), jadi tunggu sebentar, jangan asumsikan
    // sudah selesai saat respons verify kembali.
    const rowWa = db.prepare("SELECT wa_sent_at FROM notifikasi WHERE tipe='payment_verified' AND entity_id=? LIMIT 1").get(dibuat.body.id);
    if (!rowWa?.wa_sent_at) {
      await new Promise((r) => setTimeout(r, 1500));
      const ulang = db
        .prepare("SELECT wa_sent_at FROM notifikasi WHERE tipe='payment_verified' AND entity_id=? LIMIT 1")
        .get(dibuat.body.id);
      assert.ok(ulang?.wa_sent_at, 'wali dengan no_wa harus dapat notifikasi WhatsApp');
    }
  });

  it('penolakan memberitahu wali beserta alasannya', async () => {
    const dibuat = await konfirmasi(
      { siswa_id: siswaId, tagihan_ids: [tagihanId], nominal: 50000, metode: 'transfer', bukti: true },
      waliToken
    );
    assert.equal(dibuat.status, 200, JSON.stringify(dibuat.body));
    const rej = await req(
      'POST',
      `/api/billing/pembayaran/${dibuat.body.id}/reject`,
      { reason: 'Foto buram, nominal tidak terbaca jelas' },
      adminToken
    );
    assert.equal(rej.status, 200);
    const row = db.prepare('SELECT * FROM pembayaran WHERE id=?').get(dibuat.body.id);
    assert.equal(row.status, 'rejected');
    assert.equal(row.void_reason, 'Foto buram, nominal tidak terbaca jelas');
    const notifWali = db
      .prepare("SELECT COUNT(*) c FROM notifikasi WHERE tipe='payment_rejected' AND entity_id=?")
      .get(dibuat.body.id).c;
    assert.ok(notifWali >= 1, 'wali harus tahu alasannya');
  });
});
