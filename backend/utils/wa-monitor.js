// Pemantau sesi WhatsApp.
//
// Masalah yang diselesaikan: kanal WA bisa berhenti bekerja tanpa suara.
// Easy API mati, sesi logout (perlu pindai QR ulang), atau token gateway
// kedaluwarsa — semuanya membuat notifikasi berhenti terkirim, tetapi aplikasi
// tetap tampak normal. Biasanya yang pertama tahu adalah orang tua yang
// bertanya "kenapa saya tidak menerima kabar?".
//
// Pemantau ini memeriksa berkala, menyimpan keadaan terakhir, dan memberi tahu
// admin SEKALI saat putus (lalu diingatkan tiap 6 jam), serta SEKALI saat
// pulih. Notifikasi berulang tiap 5 menit akan diabaikan orang, dan itu sama
// saja dengan tidak memberi tahu.
const db = require('../db');
const wa = require('./wa');
const { nowUtc, notify } = require('./workflow');

const INTERVAL_MS = Math.max(30_000, Number(process.env.WA_CHECK_MS) || 5 * 60 * 1000);
const ULANGI_ALERT_MS = 6 * 60 * 60 * 1000;

/**
 * Terjemahkan hasil cek menjadi tiga keadaan:
 *   'ok'   — kanal siap dipakai
 *   'down' — aktif tapi tidak bisa dipakai (perlu tindakan)
 *   'mati' — memang tidak dikonfigurasi (bukan gangguan)
 *
 * `ready` hanya diperiksa bila `connected` benar-benar diketahui. Kalau
 * health-check tidak melaporkan keduanya, `reachable` sudah cukup — lebih baik
 * tidak memberi alarm palsu daripada menuduh sesi rusak padahal baik-baik saja.
 */
function klasifikasi(hasil) {
  if (!hasil || !hasil.aktif) return 'mati';
  if (hasil.provider === 'log') return 'ok';
  if (!hasil.reachable) return 'down';
  if (hasil.provider === 'openwa') {
    if (hasil.connected === false) return 'down';
    if (hasil.connected === true && hasil.ready === false) return 'down';
  }
  return 'ok';
}

function baca() {
  return (
    db.prepare('SELECT * FROM wa_monitor WHERE id=1').get() || {
      id: 1,
      status: 'belum-dicek',
      provider: null,
      pesan: null,
      terakhir_cek: null,
      terakhir_ok: null,
      gagal_beruntun: 0,
      terakhir_alert_at: null,
      terakhir_pulih_at: null
    }
  );
}

function adminAktif() {
  return db
    .prepare("SELECT id FROM pengguna WHERE role='admin' AND status='aktif'")
    .all()
    .map((r) => r.id);
}

function pesanUntuk(status, hasil) {
  if (status !== 'down') return null;
  if (hasil.provider === 'openwa' && hasil.reachable === false) {
    return 'Easy API WhatsApp tidak dapat dihubungi. Periksa layanan siaga-wa di server.';
  }
  if (hasil.provider === 'openwa' && hasil.connected === false) {
    return 'Sesi WhatsApp terputus. Pindai ulang QR di Easy API agar notifikasi terkirim lagi.';
  }
  if (hasil.provider === 'openwa' && hasil.ready === false) {
    return 'Sesi WhatsApp terhubung tetapi belum siap. Tunggu beberapa saat atau pindai ulang QR.';
  }
  return `Kanal WhatsApp bermasalah (${hasil.provider || 'tidak diketahui'}).`;
}

/**
 * Jalankan satu pemeriksaan.
 *
 * `checker` bisa diganti saat pengujian supaya tidak perlu menyalakan Easy API
 * sungguhan. Mengembalikan ringkasan keadaan setelah pemeriksaan.
 */
async function cekSekarang({ checker = wa.cekStatus } = {}) {
  let hasil;
  try {
    hasil = await checker();
  } catch (e) {
    hasil = { aktif: true, provider: 'tidak-diketahui', reachable: false, error: e.message };
  }

  const status = klasifikasi(hasil);
  const lama = baca();
  const now = nowUtc();
  const nowMs = Date.now();

  const lewatCooldown =
    !lama.terakhir_alert_at || nowMs - new Date(lama.terakhir_alert_at).getTime() >= ULANGI_ALERT_MS;
  // 'mati' tidak pernah memicu alarm: kanal yang memang dimatikan bukan gangguan.
  const alertBaru = status === 'down' && (lama.status !== 'down' || lewatCooldown);
  const pulih = status === 'ok' && lama.status === 'down';
  const pesan = pesanUntuk(status, hasil);

  db.prepare(
    `UPDATE wa_monitor
     SET status=?, provider=?, pesan=?, terakhir_cek=?, terakhir_ok=?, gagal_beruntun=?,
         terakhir_alert_at=?, terakhir_pulih_at=?
     WHERE id=1`
  ).run(
    status,
    hasil.provider || null,
    pesan,
    now,
    status === 'ok' ? now : lama.terakhir_ok,
    status === 'down' ? (lama.gagal_beruntun || 0) + 1 : 0,
    alertBaru ? now : lama.terakhir_alert_at,
    pulih ? now : lama.terakhir_pulih_at
  );

  if (alertBaru || pulih) {
    const judul = alertBaru ? 'Notifikasi WhatsApp terputus' : 'Notifikasi WhatsApp pulih';
    const isi = alertBaru
      ? `${pesan} Pengumuman, izin, dan pembayaran tetap masuk ke aplikasi, tetapi orang tua tidak menerima WhatsApp sampai sesi diperbaiki.`
      : 'Sesi WhatsApp kembali terhubung. Notifikasi WhatsApp akan terkirim lagi.';
    for (const id of adminAktif()) {
      notify(id, alertBaru ? 'wa_terputus' : 'wa_pulih', judul, isi, 'wa_monitor', 1, null);
    }
  }

  return { ...hasil, status, alert: alertBaru, pulih, pesan };
}

let timer = null;
let timerAwal = null;

function mulaiMonitor() {
  if (timer) return timer;
  // Cek pertama ditunda: saat boot, prioritasnya melayani permintaan, bukan
  // menembak health-check ke proses yang mungkin baru ikut menyala.
  timerAwal = setTimeout(() => {
    cekSekarang().catch(() => {});
  }, 30_000);
  if (timerAwal.unref) timerAwal.unref();
  timer = setInterval(() => {
    cekSekarang().catch(() => {});
  }, INTERVAL_MS);
  if (timer.unref) timer.unref();
  return timer;
}

function hentikanMonitor() {
  if (timerAwal) clearTimeout(timerAwal);
  if (timer) clearInterval(timer);
  timer = null;
  timerAwal = null;
}

module.exports = {
  INTERVAL_MS,
  ULANGI_ALERT_MS,
  klasifikasi,
  baca,
  cekSekarang,
  mulaiMonitor,
  hentikanMonitor
};
