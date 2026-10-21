/**
 * Kanal notifikasi WhatsApp.
 *
 * ============================================================
 * BACA INI DULU — RISIKO YANG HARUS DISADARI SEBELUM DIPAKAI
 * ============================================================
 * WhatsApp hanya mengizinkan pengiriman otomatis melalui API resmi
 * (WhatsApp Business Platform) atau reseller berlisensi. open-wa bekerja
 * dengan mengotomasi WhatsApp Web, yang melanggar Ketentuan Layanan Meta.
 * Risikonya, secara jujur:
 *
 *   1. NOMOR BISA DIBANNED. Pakai nomor khusus yang BUKAN nomor utama
 *      sekolah, dan siapkan nomor cadangan.
 *   2. SESI HARUS HIDUP. Satu HP harus terhubung (Linked Devices) dan
 *      server Easy API menyimpan berkas sesi (*.data.json) yang BERISI
 *      KREDENSIAL. Perlakukan seperti password: jangan di-commit, jangan
 *      di-backup sembarangan.
 *   3. MULAI CHAT BARUMUNGKIN DIBATASI. Dokumentasi open-wa menyatakan
 *      mengirim ke nomor yang belum pernah mengirim pesan lebih dulu
 *      membutuhkan lisensi restricted/premium. Untuk sekolah, artinya
 *      notifikasi ke orang tua yang belum pernah menghubungi nomor sekolah
 *      bisa gagal. Ini batasan produk open-wa, bukan sesuatu yang bisa
 *      kami akali di sini.
 *
 * Karena itu jalur ini dibuat sebagai PROVIDER yang bisa ditukar: cukup
 * mengubah WA_PROVIDER saat pindah ke gateway resmi (Fonnte/Wablas) atau
 * Cloud API resmi, tanpa mengubah kode pemanggil.
 *
 * Desain:
 * - Pengiriman ASYNCHRON lewat antrean berpacu (langkah default 1,5 detik +
 *   jitter). Kirim deras adalah salah satu pemicu pemblokiran nomor.
 * - GAGAL TIDAK BOLEH MERUSAK ALUR UTAMA. Semua error ditelan, dicatat ke
 *   log dan ke kolom notifikasi.wa_error.
 * - Migrasi 007 menambah kolom pelacakan itu.
 */

// Keputusan izin ikut dikirim ke WhatsApp: orang tua perlu tahu cepat apakah
// izinnya diterima, terutama kalau anak tidak masuk hari itu juga.
const WA_TIPE_DEFAULT =
  'daily_published,guru_reply,payment_verified,payment_rejected,invoice_issued,payment_claim,izin_disetujui,izin_ditolak,pengumuman';

const akunWa = require('./wa-akun');

function env(nama, bawaan = '') {
  return String(process.env[nama] || bawaan).trim();
}

// ---------------------------------------------------------------------------
// Normalisasi nomor -> chatId WhatsApp
// ---------------------------------------------------------------------------
/**
 * Ubah nomor lokal Indonesia menjadi format internasional untuk chatId.
 *   08123456789  -> 628123456789
 *   +62812...    -> 62812...
 *   62812...     -> 62812...
 * Mengembalikan null kalau nomor jelas tidak masuk akal (terlalu pendek),
 * supaya tidak ada pesan terkirim ke nomor sampah.
 */
function chatIdDari(noWa) {
  const digits = String(noWa || '').replace(/\D/g, '');
  if (!digits) return null;
  let n = digits;
  if (n.startsWith('62')) {
    // sudah internasional; "620" kadang muncul dari 62 + 0
    if (n.startsWith('620')) n = '62' + n.slice(3);
  } else if (n.startsWith('0')) {
    n = '62' + n.slice(1);
  } else {
    return null; // tanpa awalan 0/62 kita tidak bisa menebak kode negara
  }
  // Nomor seluler Indonesia: 62 + 9-13 digit (total 11-15 digit)
  if (n.length < 11 || n.length > 15) return null;
  return `${n}@c.us`;
}

// ---------------------------------------------------------------------------
// Format pesan
// ---------------------------------------------------------------------------
/**
 * Susun pesan singkat. WhatsApp memotong pesan panjang di daftar chat, jadi
 * judul + isi + tautan login saja — detail ada di aplikasi.
 */
function formatPesan({ title, body, link }) {
  const bagian = ['*SIAGA Taruna Prima*', '', title || ''];
  if (body) bagian.push('', body);
  if (link) bagian.push('', `Buka aplikasi: ${link}`);
  return bagian.join('\n');
}

// ---------------------------------------------------------------------------
// Provider open-wa (Easy API over HTTP)
// ---------------------------------------------------------------------------
// Sengaja lewat HTTP, bukan library @open-wa di dalam proses ini: Easy API
// adalah proses terpisah (menjalankan Chromium + sesi), jadi backend tetap
// ringan dan bisa restart tanpa memutus sesi WhatsApp.
//
// Dua dialek open-wa, dipilih per akun oleh adanya session_id:
//   - tanpa session_id : Easy API satu nomor -> POST /api/messages/sendText
//   - dengan session_id: open-wa multi-sesi -> POST /api/sessions/{sid}/messages/send-text
// Dialek TIDAK bisa ditebak dari URL: satu instance multi-sesi dipakai banyak
// cabang sekaligus (URL sama, session-id beda). Karena itu penentunya adalah
// kolom session_id di wa_akun.
function openwaKirim({ no_wa, pesan, cfg }) {
  const url = cfg?.url || env('WA_API_URL', 'http://127.0.0.1:8080');
  const apiKey = cfg?.key || env('WA_API_KEY');
  const sid = cfg?.sid || env('WA_SESSION_ID');
  const to = chatIdDari(no_wa);
  if (!to) return Promise.reject(new Error(`Nomor tidak valid: ${no_wa}`));
  if (!apiKey) return Promise.reject(new Error('WA_API_KEY belum diset'));
  const multi = !!sid;
  if (multi && !url) return Promise.reject(new Error('URL OpenWA belum diset'));
  const endpoint = multi
    ? `${url}/api/sessions/${encodeURIComponent(sid)}/messages/send-text`
    : `${url}/api/messages/sendText`;
  const body = multi ? { chatId: to, text: pesan } : { to, content: pesan, options: {} };
  return fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify(body),
    // Timeout pendek: kalau Easy API mati, jangan menahan antrean lama.
    signal: AbortSignal.timeout(10000)
  }).then(async (r) => {
    if (!r.ok) throw new Error(`Easy API ${r.status}: ${(await r.text()).slice(0, 120)}`);
    return r.json();
  });
}

// Status sesi multi-sesi: GET /api/sessions/{id} mengembalikan status
// ('connected' | 'qr_ready' | 'disconnected'), phone, pushName, lastActive.
// Diterjemahkan ke bentuk yang dipakai pemantau (connected/ready).
async function openwaMultiStatus({ url, key, sid }) {
  const dasar = { provider: 'openwa', multi: true };
  try {
    const r = await fetch(`${url}/api/sessions/${encodeURIComponent(sid)}`, {
      headers: { 'X-API-Key': key },
      signal: AbortSignal.timeout(5000)
    });
    if (!r.ok) return { ...dasar, reachable: false, error: `OpenWA ${r.status}` };
    const d = await r.json();
    // State "terhubung" bernama 'ready' di build multi-sesi (dashboard
    // Sessions); sebagian build lain memakai 'connected'. Terima keduanya.
    const terhubung = d.status === 'ready' || d.status === 'connected';
    return {
      ...dasar,
      reachable: true,
      // qr_ready (perlu pindai) dan disconnected sama-sama belum bisa dipakai.
      connected: terhubung,
      ready: terhubung,
      detail: { state: d.status, phone: d.phone, pushName: d.pushName, lastActive: d.lastActive }
    };
  } catch (e) {
    return { ...dasar, reachable: false, error: e.message };
  }
}

async function openwaStatus(cfg) {
  const url = cfg?.url || env('WA_API_URL', 'http://127.0.0.1:8080');
  if (cfg?.sid || env('WA_SESSION_ID')) {
    const key = cfg?.key || env('WA_API_KEY');
    if (!key) return { provider: 'openwa', multi: true, reachable: false, error: 'WA_API_KEY belum diset' };
    return openwaMultiStatus({ url, key, sid: cfg?.sid || env('WA_SESSION_ID') });
  }
  try {
    const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return { provider: 'openwa', reachable: false };
    const d = await r.json();
    return {
      provider: 'openwa',
      reachable: true,
      connected: !!(d.connected ?? d.session?.connected),
      ready: !!(d.session?.ready ?? d.ready),
      detail: d.session ? { state: d.session.state, status: d.session.status } : undefined
    };
  } catch (e) {
    return { provider: 'openwa', reachable: false, error: e.message };
  }
}

// ---------------------------------------------------------------------------
// Provider gateway generik (Fonnte/Wablas dan sejenisnya) — cadangan resmi
// ---------------------------------------------------------------------------
function gatewayKirim({ no_wa, pesan, cfg }) {
  const url = cfg?.url || env('WA_GATEWAY_URL');
  const token = cfg?.token || env('WA_GATEWAY_TOKEN');
  const to = chatIdDari(no_wa)?.replace('@c.us', '');
  if (!url) return Promise.reject(new Error('WA_GATEWAY_URL belum diset'));
  if (!to) return Promise.reject(new Error(`Nomor tidak valid: ${no_wa}`));
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ target: to, message: pesan }),
    signal: AbortSignal.timeout(10000)
  }).then(async (r) => {
    if (!r.ok) throw new Error(`Gateway ${r.status}: ${(await r.text()).slice(0, 120)}`);
    return r.json();
  });
}

async function gatewayStatus(cfg) {
  if (!(cfg?.url || env('WA_GATEWAY_URL')))
    return { provider: 'gateway', reachable: false, error: 'URL gateway belum diset' };
  return { provider: 'gateway', reachable: true };
}

// ---------------------------------------------------------------------------
// Provider log (tes): tidak mengirim apa pun, hanya mencatat.
// ---------------------------------------------------------------------------
const riwayatUji = [];
function logKirim({ no_wa, pesan }) {
  riwayatUji.push({ chatId: chatIdDari(no_wa), pesan, at: new Date().toISOString() });
  return Promise.resolve({ success: true, dummy: true });
}

// ---------------------------------------------------------------------------
// Pemilihan provider + gate aktif
// ---------------------------------------------------------------------------
// Provider yang dibangun dari baris wa_akun (satu nomor per cabang).
function providerDariAkun(akun) {
  if (!akun) return null;
  if (akun.provider === 'gateway') {
    const cfg = { url: akun.gateway_url, token: akunWa.dekripsi(akun.gateway_token) };
    return {
      nama: 'gateway',
      akunId: akun.id,
      label: akun.label,
      kirim: (arg) => gatewayKirim({ ...arg, cfg }),
      status: () => gatewayStatus(cfg)
    };
  }
  const cfg = { url: akun.api_url, key: akunWa.dekripsi(akun.api_key), sid: akun.session_id || null };
  return {
    nama: 'openwa',
    akunId: akun.id,
    label: akun.label,
    kirim: (arg) => openwaKirim({ ...arg, cfg }),
    status: () => openwaStatus(cfg)
  };
}

function providerAktif() {
  const p = env('WA_PROVIDER', 'none').toLowerCase();
  if (p === 'openwa') return { nama: 'openwa', kirim: openwaKirim, status: openwaStatus };
  if (p === 'gateway') return { nama: 'gateway', kirim: gatewayKirim, status: gatewayStatus };
  if (p === 'log') return { nama: 'log', kirim: logKirim, status: async () => ({ provider: 'log', reachable: true }) };
  return null; // 'none' atau nilai tak dikenal -> kanal mati
}

/**
 * Tipe notifikasi yang boleh ikut WhatsApp. Dibatasi supaya:
 * - tidak setiap notifikasi internal (mis. pickup guru) mengganggu orang tua,
 * - biaya/risiko pemblokiran tetap terkendali.
 */
function tipeAktif() {
  const daftar = env('WA_TIPE_AKTIF', WA_TIPE_DEFAULT);
  return new Set(
    daftar
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function jedaAntrean() {
  // 1500ms + jitter 0-700ms: tidak presis secara detik sehingga pola robotik
  // berkurang, tetap sekitar <=2,2 detik per pesan.
  return Number(env('WA_DELAY_MS', '1500')) + Math.random() * 700;
}

// ---------------------------------------------------------------------------
// Antrean internal
// ---------------------------------------------------------------------------
let antre = Promise.resolve();
let kedalaman = 0;
const statistik = { terkirim: 0, gagal: 0, dilewati: 0 };

/**
 * Pilih pengirim untuk satu cabang.
 *
 * Kalau ada akun terdaftar tetapi cabang ini tidak punya nomor sendiri dan
 * tidak ada akun pusat, hasilnya `tanpa-akun`: pesan TIDAK dikirim. Mengirim
 * dari nomor cabang lain akan membuat orang tua menerima kabar dari nomor yang
 * tidak mereka kenal — lebih baik terlihat "dilewati" di statistik.
 */
function pilihProvider(cabangId) {
  if (!akunWa.adaAkunAktif()) return { provider: providerAktif(), alasan: null };
  const akun = akunWa.akunUntukCabang(cabangId);
  if (!akun) return { provider: null, alasan: 'tanpa-akun' };
  return { provider: providerDariAkun(akun), alasan: null };
}

/**
 * Kirim satu pesan WA. Fungsi ini aman dipanggil dari jalur request utama:
 * tidak pernah throw, hasilnya tercermin di promise yang dikembalikan (untuk
 * tes) dan di log.
 */
function kirimWA({ no_wa, pesan, cabangId }) {
  const { provider, alasan } = pilihProvider(cabangId);
  if (alasan === 'tanpa-akun') {
    statistik.dilewati++;
    console.warn(`[wa] cabang ${cabangId ?? '-'} belum punya nomor WhatsApp; pesan tidak dikirim`);
    return Promise.resolve({ status: 'tanpa-akun' });
  }
  if (!provider) {
    statistik.dilewati++;
    return Promise.resolve({ status: 'dimati' });
  }
  if (!chatIdDari(no_wa)) {
    statistik.dilewati++;
    return Promise.resolve({ status: 'nomor-tidak-valid' });
  }
  kedalaman++;
  antre = antre.then(async () => {
    try {
      const hasil = await provider.kirim({ no_wa, pesan });
      statistik.terkirim++;
      return { status: 'terkirim', hasil };
    } catch (e) {
      statistik.gagal++;
      console.error(`[wa] gagal kirim (${provider.nama}):`, e.message);
      return { status: 'gagal', error: e.message };
    } finally {
      // Jeda SELALU dihormati, sukses maupun gagal, agar tidak menembus
      // deras ketika targetnya bermasalah.
      await new Promise((r) => setTimeout(r, jedaAntrean()));
      kedalaman--;
    }
  });
  return antre;
}

/**
 * Periksa kesehatan kanal (bisa memanggil jaringan untuk provider openwa).
 * Dipakai pemantau sesi: tanpa ini, sesi yang putus tidak pernah ketahuan
 * sampai ada orang tua bertanya "kenapa saya tidak menerima kabar?".
 */
async function cekStatus(cabangId) {
  const { provider: p, alasan } = pilihProvider(cabangId);
  if (alasan === 'tanpa-akun')
    return { aktif: true, provider: 'none', reachable: false, error: 'Cabang ini belum punya nomor WhatsApp' };
  if (!p) return { aktif: false, provider: 'none', reachable: false };
  try {
    const detail = await p.status();
    return { aktif: true, ...detail, akun: p.label || null };
  } catch (e) {
    return { aktif: true, provider: p.nama, reachable: false, error: e.message, akun: p.label || null };
  }
}

function statusWA() {
  const p = providerAktif();
  const pakaiAkun = akunWa.adaAkunAktif();
  return {
    // Mode 'akun' = nomor per cabang dari tabel wa_akun. Mode 'env' = satu
    // nomor dari .env (perilaku lama). Mode 'none' = kanal mati.
    mode: pakaiAkun ? 'akun' : p ? 'env' : 'none',
    aktif: pakaiAkun || !!p,
    provider: pakaiAkun ? 'per-cabang' : p ? p.nama : 'none',
    akunAktif: pakaiAkun,
    tipeAktif: [...tipeAktif()],
    antrean: kedalaman,
    statistik,
    ...(pakaiAkun || p
      ? undefined
      : { catatan: 'Tambahkan nomor di Admin > Konfigurasi, atau set WA_PROVIDER=openwa (gateway)' })
  };
}

module.exports = {
  chatIdDari,
  formatPesan,
  kirimWA,
  cekStatus,
  pilihProvider,
  providerDariAkun,
  statusWA,
  tipeAktif,
  // ekspor untuk tes saja
  _riwayatUji: riwayatUji,
  _providerAktif: providerAktif,
  _statistik: statistik
};
