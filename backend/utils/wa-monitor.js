// Pemantau sesi WhatsApp.
//
// Masalah yang diselesaikan: kanal WA bisa berhenti bekerja tanpa suara.
// Easy API mati, sesi logout (perlu pindai QR ulang), atau token gateway
// kedaluwarsa — semuanya membuat notifikasi berhenti terkirim, tetapi aplikasi
// tetap tampak normal. Biasanya yang pertama tahu adalah orang tua yang
// bertanya "kenapa saya tidak menerima kabar?".
//
// Ada dua mode:
//   - mode 'akun'  : sekolah memakai nomor per cabang (tabel wa_akun). Setiap
//                    akun diperiksa sendiri dan diberi alarm sendiri, karena
//                    satu cabang bisa putus sementara cabang lain sehat.
//   - mode 'env'   : satu nomor dari .env (perilaku lama, satu baris wa_monitor).
//
// Alarm dikirim SEKALI saat putus (diingatkan tiap 6 jam), dan SEKALI saat
// pulih. Notifikasi tiap 5 menit akan diabaikan orang — sama saja tidak
// memberi tahu.
const db = require('../db');
const wa = require('./wa');
const akunWa = require('./wa-akun');
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

const KOSONG = {
  status: 'belum-dicek',
  provider: null,
  pesan: null,
  terakhir_cek: null,
  terakhir_ok: null,
  gagal_beruntun: 0,
  terakhir_alert_at: null,
  terakhir_pulih_at: null
};

function adminAktif() {
  return db
    .prepare("SELECT id FROM pengguna WHERE role='admin' AND status='aktif'")
    .all()
    .map((r) => r.id);
}

function pesanUntuk(status, hasil, label) {
  if (status !== 'down') return null;
  const awalan = label ? `${label}: ` : '';
  if (hasil.provider === 'openwa' && hasil.reachable === false) {
    return `${awalan}Easy API WhatsApp tidak dapat dihubungi. Periksa layanan siaga-wa di server.`;
  }
  if (hasil.provider === 'openwa' && hasil.connected === false) {
    return `${awalan}sesi WhatsApp terputus. Pindai ulang QR di Easy API agar notifikasi terkirim lagi.`;
  }
  if (hasil.provider === 'openwa' && hasil.ready === false) {
    return `${awalan}sesi WhatsApp terhubung tetapi belum siap. Tunggu beberapa saat atau pindai ulang QR.`;
  }
  return `${awalan}kanal WhatsApp bermasalah (${hasil.provider || 'tidak diketahui'}).`;
}

function putuskan(lama, status, nowMs) {
  const lewatCooldown =
    !lama.terakhir_alert_at || nowMs - new Date(lama.terakhir_alert_at).getTime() >= ULANGI_ALERT_MS;
  return {
    // 'mati' tidak pernah memicu alarm: kanal yang memang dimatikan bukan gangguan.
    alertBaru: status === 'down' && (lama.status !== 'down' || lewatCooldown),
    pulih: status === 'ok' && lama.status === 'down'
  };
}

function kabarkan({ alertBaru, pulih, pesan }) {
  if (!alertBaru && !pulih) return;
  const judul = alertBaru ? 'Notifikasi WhatsApp terputus' : 'Notifikasi WhatsApp pulih';
  const isi = alertBaru
    ? `${pesan} Pengumuman, izin, dan pembayaran tetap masuk ke aplikasi, tetapi orang tua tidak menerima WhatsApp sampai sesi diperbaiki.`
    : 'Sesi WhatsApp kembali terhubung. Notifikasi WhatsApp akan terkirim lagi.';
  for (const id of adminAktif()) {
    notify(id, alertBaru ? 'wa_terputus' : 'wa_pulih', judul, isi, 'wa_monitor', 1, null);
  }
}

// ---------------------------------------------------------------------------
// Mode 'akun' — satu baris keadaan per nomor
// ---------------------------------------------------------------------------
function bacaAkun(akunId) {
  return db.prepare('SELECT * FROM wa_monitor_akun WHERE akun_id=?').get(akunId) || { akun_id: akunId, ...KOSONG };
}

async function cekAkun(akun, { checker } = {}) {
  let hasil;
  try {
    hasil = checker ? await checker(akun) : { aktif: true, ...(await wa.providerDariAkun(akun).status()) };
  } catch (e) {
    hasil = { aktif: true, provider: akun.provider, reachable: false, error: e.message };
  }

  const status = klasifikasi(hasil);
  const lama = bacaAkun(akun.id);
  const now = nowUtc();
  const { alertBaru, pulih } = putuskan(lama, status, Date.now());
  const pesan = pesanUntuk(status, hasil, akun.label);

  db.prepare(
    `INSERT INTO wa_monitor_akun(akun_id,status,provider,pesan,terakhir_cek,terakhir_ok,gagal_beruntun,terakhir_alert_at,terakhir_pulih_at)
     VALUES(?,?,?,?,?,?,?,?,?)
     ON CONFLICT(akun_id) DO UPDATE SET
       status=excluded.status, provider=excluded.provider, pesan=excluded.pesan,
       terakhir_cek=excluded.terakhir_cek, terakhir_ok=excluded.terakhir_ok,
       gagal_beruntun=excluded.gagal_beruntun, terakhir_alert_at=excluded.terakhir_alert_at,
       terakhir_pulih_at=excluded.terakhir_pulih_at`
  ).run(
    akun.id,
    status,
    hasil.provider || akun.provider,
    pesan,
    now,
    status === 'ok' ? now : lama.terakhir_ok,
    status === 'down' ? (lama.gagal_beruntun || 0) + 1 : 0,
    alertBaru ? now : lama.terakhir_alert_at,
    pulih ? now : lama.terakhir_pulih_at
  );

  kabarkan({ alertBaru, pulih, pesan });
  return { akun_id: akun.id, label: akun.label, status, alert: alertBaru, pulih, pesan };
}

async function cekSemuaAkun({ checker } = {}) {
  const akun = akunWa.daftarMentah().filter((a) => a.aktif);
  const hasil = [];
  // Berurutan, bukan paralel: 5 health-check serentak ke Easy API yang sedang
  // kepayahan justru memperburuk keadaannya.
  for (const a of akun) hasil.push(await cekAkun(a, { checker }));
  const down = hasil.filter((h) => h.status === 'down');
  return {
    mode: 'akun',
    status: down.length ? 'down' : hasil.length ? 'ok' : 'belum-dicek',
    akun: hasil,
    alert: hasil.some((h) => h.alert),
    pulih: hasil.some((h) => h.pulih)
  };
}

// ---------------------------------------------------------------------------
// Mode 'env' — satu nomor dari konfigurasi .env
// ---------------------------------------------------------------------------
function baca() {
  return db.prepare('SELECT * FROM wa_monitor WHERE id=1').get() || { id: 1, ...KOSONG };
}

async function cekEnv({ checker } = {}) {
  let hasil;
  try {
    hasil = await (checker || wa.cekStatus)();
  } catch (e) {
    hasil = { aktif: true, provider: 'tidak-diketahui', reachable: false, error: e.message };
  }

  const status = klasifikasi(hasil);
  const lama = baca();
  const now = nowUtc();
  const { alertBaru, pulih } = putuskan(lama, status, Date.now());
  const pesan = pesanUntuk(status, hasil, null);

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

  kabarkan({ alertBaru, pulih, pesan });
  return { ...hasil, mode: 'env', status, alert: alertBaru, pulih, pesan };
}

/**
 * Jalankan satu pemeriksaan. `checker` bisa diganti saat pengujian supaya tidak
 * perlu menyalakan Easy API sungguhan. Pada mode akun, checker menerima akun.
 */
async function cekSekarang({ checker } = {}) {
  if (akunWa.adaAkunAktif()) return cekSemuaAkun({ checker });
  return cekEnv({ checker });
}

/**
 * Ringkasan untuk layar admin. Pada mode akun, satu cabang bisa 'down' sementara
 * cabang lain 'ok' — karena itu yang ditampilkan adalah daftar, bukan satu chip.
 */
function ringkasan() {
  if (!akunWa.adaAkunAktif()) return { mode: 'env', ...baca() };
  const rows = db
    .prepare(
      `SELECT m.*, a.label, a.cabang_id, a.provider AS provider_akun, a.nomor, c.nama AS cabang_nama
       FROM wa_monitor_akun m
       JOIN wa_akun a ON a.id=m.akun_id
       LEFT JOIN cabang c ON c.id=a.cabang_id
       ORDER BY (a.cabang_id IS NULL), c.nama`
    )
    .all();
  const terakhir =
    rows
      .map((r) => r.terakhir_cek)
      .filter(Boolean)
      .sort()
      .pop() || null;
  const status = rows.some((r) => r.status === 'down') ? 'down' : rows.length ? 'ok' : 'belum-dicek';
  return {
    mode: 'akun',
    status,
    akun: rows,
    terakhir_cek: terakhir,
    gagal_beruntun: rows.reduce((n, r) => n + (r.status === 'down' ? 1 : 0), 0)
  };
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
  bacaAkun,
  cekAkun,
  cekSekarang,
  ringkasan,
  mulaiMonitor,
  hentikanMonitor
};
