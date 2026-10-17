// Web Push (VAPID). Dipisah dari workflow.js supaya jalur notifikasi in-app
// tidak pernah gagal karena push: pengiriman push bersifat fire-and-forget dan
// menelan seluruh errornya sendiri.
//
// Kunci dibaca lazy (bukan saat require) supaya server tetap bisa jalan tanpa
// konfigurasi VAPID — notifikasi in-app saja, tanpa push.
const db = require('../db');

let configured = null;
let webpush = null;

function vapid() {
  if (configured !== null) return configured;
  configured = false;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (pub && priv) {
    try {
      webpush = require('web-push');
      webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@localhost', pub, priv);
      configured = true;
    } catch (e) {
      console.error('[push] web-push tidak tersedia:', e.message);
    }
  }
  return configured;
}

// Kunci publik untuk dikirim ke browser (dipakai pushManager.subscribe).
function publicKey() {
  return vapid() ? process.env.VAPID_PUBLIC_KEY : null;
}

// Kirim ke semua perangkat milik satu pengguna.
// Mengembalikan jumlah yang berhasil + yang dibuang (endpoint mati) + total.
async function sendToUser(penggunaId, payload) {
  if (!vapid()) return { sent: 0, removed: 0, total: 0, reason: 'vapid-belum-diset' };
  const subs = db
    .prepare('SELECT id,endpoint,p256dh,auth FROM push_subscription WHERE pengguna_id=?')
    .all(penggunaId);
  let sent = 0;
  let removed = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload)
      );
      sent++;
    } catch (e) {
      // 404/410 = endpoint tidak berlaku lagi (uninstall, clear data) -> buang.
      if (e.statusCode === 404 || e.statusCode === 410) {
        db.prepare('DELETE FROM push_subscription WHERE id=?').run(s.id);
        removed++;
      } else {
        console.error('[push] gagal kirim:', e.statusCode || e.message);
      }
    }
  }
  return { sent, removed, total: subs.length };
}

// Sisipkan panggilan ini (tanpa await) setelah menulis notifikasi in-app.
function pushAsync(penggunaId, payload) {
  sendToUser(penggunaId, payload).catch((e) => console.error('[push] error tak terduga:', e.message));
}

module.exports = { publicKey, sendToUser, pushAsync };
