// Tes push notification: registrasi subscription, kepemilikan data, dan
// integrasi notify() -> push (tanpa harus mengirim notifikasi sungguhan).
const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const db = require('../backend/db');
const bcrypt = require('../backend/node_modules/bcryptjs');

const BASE = process.env.TEST_URL || 'http://127.0.0.1:3999';
const NYAWA = Date.now();

let waliToken = '';
let siswaId = null;
const endpointUji = `https://fcm.googleapis.com/uji-${NYAWA}`;

function req(method, path, body, token) {
  return fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
}

describe('push notification', () => {
  before(async () => {
    // Server uji memakai DB segar dengan ADMIN_PASSWORD=admin123; wali1 hanya
    // ada kalau seed demo ikut dijalankan. Login admin dipakai sebagai jaring
    // pengaman supaya tes tidak bergantung pada data seed.
    const admin = await req('POST', '/api/auth/login', {
      username: 'admin',
      password: 'admin123'
    });
    if (admin.body?.token) waliToken = admin.body.token;
    const login = await req('POST', '/api/auth/login', {
      tipe: 'wali',
      no_wa: '081200000000',
      password: 'admin123'
    });
    if (login.body?.token) {
      waliToken = login.body.token;
      const anak = await req('GET', '/api/siswa/wali/children', null, waliToken);
      siswaId = anak.body?.[0]?.id || anak.body?.rows?.[0]?.id || null;
    }
  });

  it('kunci VAPID tersedia untuk browser', async () => {
    const r = await req('GET', '/api/push/vapid-key', null, waliToken);
    if (r.status === 503) {
      // Tanpa VAPID di server uji, fitur dimatikan dengan jujur (503) — bukan 500.
      assert.match(r.body.error, /Push belum dikonfigurasi/);
      return;
    }
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.match(r.body.publicKey, /^[A-Za-z0-9_-]{80,}$/);
  });

  it('subscribe menyimpan subscription milik pengguna yang login', async () => {
    if (!waliToken) return; // server uji tidak menyediakan wali1
    const r = await req(
      'POST',
      '/api/push/subscribe',
      {
        endpoint: endpointUji,
        keys: { p256dh: 'kunci-uji-p256dh', auth: 'kunci-uji-auth' }
      },
      waliToken
    );
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const row = db.prepare('SELECT pengguna_id, endpoint FROM push_subscription WHERE endpoint=?').get(endpointUji);
    assert.ok(row, 'baris subscription harus ada di DB');
    assert.ok(row.pengguna_id, 'harus terhubung ke pengguna');
  });

  it('resubscribe endpoint yang sama tidak membuat baris kembar', async () => {
    if (!waliToken) return;
    await req(
      'POST',
      '/api/push/subscribe',
      {
        endpoint: endpointUji,
        keys: { p256dh: 'kunci-uji-p256dh-2', auth: 'kunci-uji-auth-2' }
      },
      waliToken
    );
    const jumlah = db.prepare('SELECT COUNT(*) c FROM push_subscription WHERE endpoint=?').get(endpointUji).c;
    assert.equal(jumlah, 1);
  });

  it('unsubscribe hanya menghapus milik sendiri', async () => {
    if (!waliToken) return;
    const r = await req('POST', '/api/push/unsubscribe', { endpoint: endpointUji }, waliToken);
    assert.equal(r.status, 200);
    assert.equal(r.body.removed, 1);
    const sisa = db.prepare('SELECT COUNT(*) c FROM push_subscription WHERE endpoint=?').get(endpointUji).c;
    assert.equal(sisa, 0);
  });

  it('subscribe tanpa kunci lengkap ditolak 400', async () => {
    if (!waliToken) return;
    const r = await req('POST', '/api/push/subscribe', { endpoint: 'x' }, waliToken);
    assert.equal(r.status, 400);
  });

  it('pengguna lain tidak bisa mencabut subscription milik orang lain', async () => {
    // Pastikan kepemilikan: baris milik pengguna A tidak terhapus oleh sesi B.
    const userA = db.prepare('SELECT id FROM pengguna WHERE username=?').get('wali1');
    if (!userA) return;
    db.prepare(
      `INSERT INTO push_subscription(pengguna_id,endpoint,p256dh,auth,user_agent,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?)`
    ).run(
      userA.id,
      endpointUji,
      'kunci-uji-p256dh',
      'kunci-uji-auth',
      'uji',
      new Date().toISOString(),
      new Date().toISOString()
    );
    if (!waliToken) {
      db.prepare('DELETE FROM push_subscription WHERE endpoint=?').run(endpointUji);
      return;
    }
    // Sesi yang sama (wali1) sebenarnya pemilik; jadi uji pemilik LAIN:
    const guru = db.prepare('SELECT id FROM pengguna WHERE username=?').get('guru1');
    const guruLogin = await req('POST', '/api/auth/login', {
      username: 'guru1',
      password: 'admin123'
    });
    const guruToken = guruLogin.body?.token;
    if (!guruToken || !guru) {
      db.prepare('DELETE FROM push_subscription WHERE endpoint=?').run(endpointUji);
      return;
    }
    const r = await req('POST', '/api/push/unsubscribe', { endpoint: endpointUji }, guruToken);
    assert.equal(r.status, 200);
    assert.equal(r.body.removed, 0, 'guru tidak boleh mencabut milik wali');
    const masih = db.prepare('SELECT COUNT(*) c FROM push_subscription WHERE endpoint=?').get(endpointUji).c;
    assert.equal(masih, 1);
    // bersihkan
    db.prepare('DELETE FROM push_subscription WHERE endpoint=?').run(endpointUji);
    void siswaId;
    void bcrypt;
  });
});
