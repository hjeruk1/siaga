// Web Push: registrasi & pencabutan subscription browser.
//
// Endpoint bersifat per-perangkat: browser mengirim endpoint unik dari push
// service, server menyimpannya sebagai identitas perangkat. Cabut subscription
// hanya menghapus endpoint itu (mis. saat pengguna menolak notifikasi), bukan
// seluruh perangkat pengguna.
const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { nowUtc } = require('../utils/workflow');
const { publicKey, sendToUser } = require('../utils/push');

function validasi(body) {
  const endpoint = String(body?.endpoint || '');
  const p256dh = String(body?.keys?.p256dh || '');
  const authKey = String(body?.keys?.auth || '');
  if (!endpoint || !p256dh || !authKey) return 'Subscription tidak lengkap';
  if (endpoint.length > 2000) return 'Endpoint tidak valid';
  return null;
}

// Kunci publik VAPID untuk pushManager.subscribe(). Kalau server belum dikonfigurasi,
// 503 membuat frontend tahu tidak perlu menawarkan fitur ini.
router.get('/vapid-key', auth(), (req, res) => {
  const key = publicKey();
  if (!key) return res.status(503).json({ error: 'Push belum dikonfigurasi di server' });
  res.json({ publicKey: key });
});

router.post('/subscribe', auth(), (req, res) => {
  const err = validasi(req.body);
  if (err) return res.status(400).json({ error: err });
  // Upsert supaya resubscribe dari perangkat yang sama tidak membuat baris kembar.
  db.prepare(
    `INSERT INTO push_subscription(pengguna_id,endpoint,p256dh,auth,user_agent,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?)
     ON CONFLICT(endpoint) DO UPDATE SET
       pengguna_id=excluded.pengguna_id,
       p256dh=excluded.p256dh,
       auth=excluded.auth,
       user_agent=excluded.user_agent,
       updated_at=excluded.updated_at`
  ).run(
    req.user.id,
    String(req.body.endpoint),
    String(req.body.keys.p256dh),
    String(req.body.keys.auth),
    String(req.headers['user-agent'] || '').slice(0, 255),
    nowUtc(),
    nowUtc()
  );
  res.json({ success: true });
});

router.post('/unsubscribe', auth(), (req, res) => {
  const endpoint = String(req.body?.endpoint || '');
  if (!endpoint) return res.status(400).json({ error: 'Endpoint wajib' });
  // Hanya boleh mencabut milik sendiri.
  const r = db.prepare('DELETE FROM push_subscription WHERE endpoint=? AND pengguna_id=?').run(endpoint, req.user.id);
  res.json({ success: true, removed: r.changes });
});

// Uji kirim ke perangkat pengguna yang sedang login (dipakai tombol "Kirim uji"
// di portal, sekaligus memudahkan verifikasi konfigurasi VAPID).
router.post('/test', auth(), async (req, res) => {
  if (!publicKey()) return res.status(503).json({ error: 'Push belum dikonfigurasi di server' });
  const hasil = await sendToUser(req.user.id, {
    title: 'SIAGA - Notifikasi uji',
    body: 'Kalau notifikasi ini muncul, push SIAGA sudah aktif di perangkat Anda.',
    tag: 'push-test',
    url: '/'
  });
  if (hasil.reason) return res.status(503).json({ error: hasil.reason });
  res.json({
    success: true,
    dikirim: hasil.sent,
    dibuang: hasil.removed,
    perangkat: hasil.total
  });
});
module.exports = router;
