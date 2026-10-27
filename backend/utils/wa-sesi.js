// Klien manajemen sesi open-wa multi-sesi (untuk alur "hubungkan nomor
// mandiri"): admin cabang menghubungkan nomor cabangnya lewat SIAGA, tanpa
// pernah membuka dashboard OpenWA di server.
//
// Prinsip keamanan:
// - Kredensial instance (URL + API key) HANYA hidup di .env server. Modul ini
//   satu-satunya yang memakainya; browser tidak pernah melihatnya.
// - QR adalah kredensial HIDUP (siapa pun yang memindainya memperoleh sesi).
//   Karena itu QR hanya diteruskan ke pemegang sesi admin yang berhak, dan
//   tidak pernah ditulis ke log.
// - Permintaan kode pairing dibatasi: permintaan beruntun adalah pemicu
//   pemblokiran nomor oleh WhatsApp.
const db = require('../db');
const akunWa = require('./wa-akun');
const { audit } = require('./workflow');

// Instance default dari environment. Sekolah dengan satu instance open-wa
// multi-sesi tidak perlu menyimpan URL/key di setiap baris akun.
function instance() {
  return {
    url: String(process.env.WA_API_URL || 'http://127.0.0.1:8080').trim(),
    key: String(process.env.WA_API_KEY || '').trim()
  };
}

function instanceSiap() {
  const { url, key } = instance();
  return !!url && !!key;
}

async function panggil(path, { method = 'GET', body } = {}) {
  const { url, key } = instance();
  if (!key) throw new Error('WA_API_KEY belum diset di server');
  const r = await fetch(`${url}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000)
  });
  const teks = await r.text();
  let json = null;
  try {
    json = teks ? JSON.parse(teks) : null;
  } catch {
    json = null;
  }
  if (!r.ok) throw new Error((json && json.message) || `OpenWA ${r.status}`);
  return json;
}

function daftarSesi() {
  return panggil('/api/sessions');
}

function detailSesi(sid) {
  return panggil(`/api/sessions/${encodeURIComponent(sid)}`);
}

// Buat sesi baru DAN start: sesi yang baru dibuat berstatus 'created' dan QR
// belum tersedia sampai di-start (tanpa start, GET /qr menjawab 400).
async function buatSesi(nama) {
  const sesi = await panggil('/api/sessions', { method: 'POST', body: { name: String(nama || '').trim() } });
  try {
    await panggil(`/api/sessions/${sesi.id}/start`, { method: 'POST' });
  } catch {
    // Start gagal: sesi tetap 'created'. UI akan menampilkan statusnya dan
    // menawarkan coba start lagi — jangan gagalkan pembuatan sesi.
  }
  return sesi;
}

function startSesi(sid) {
  return panggil(`/api/sessions/${encodeURIComponent(sid)}/start`, { method: 'POST' });
}

async function hapusSesi(sid) {
  const hasil = await panggil(`/api/sessions/${encodeURIComponent(sid)}`, { method: 'DELETE' });
  // Kepemilikan baru dihapus sesudah instance membenarkan penghapusan; kalau
  // instance gagal, sesi hidup harus tetap bisa dikelola pemiliknya.
  hapusPending(sid);
  return hasil;
}

// ---------------------------------------------------------------------------
// Kepemilikan sesi yang belum disimpan (migrasi 021)
// ---------------------------------------------------------------------------
// Sesi dicatat milik satu cabang sejak dibuat. Tanpa catatan ini, rute QR dan
// pairing tidak bisa membedakan sesi milik cabang sendiri dari sesi cabang
// lain, padahal QR adalah kredensial hidup.

function catatPending(sid, cabangId, penggunaId) {
  if (!sid) return;
  try {
    db.prepare(
      `INSERT INTO wa_sesi_pending(session_id,cabang_id,dibuat_oleh,created_at)
       VALUES(?,?,?,?)
       ON CONFLICT(session_id) DO NOTHING`
    ).run(
      String(sid),
      cabangId === '' || cabangId === null || cabangId === undefined ? null : Number(cabangId),
      penggunaId || null,
      new Date().toISOString()
    );
  } catch {
    // Tabel belum ada di database yang belum menjalankan migrasi 021: sesi
    // tetap dibuat, dan hanya admin pusat yang bisa mengelolanya sesudah itu.
  }
}

function hapusPending(sid) {
  try {
    db.prepare('DELETE FROM wa_sesi_pending WHERE session_id=?').run(String(sid));
  } catch {
    // Tabel belum ada di database yang belum menjalankan migrasi 021.
  }
}

function pendingUntukSesi(sid) {
  try {
    return db.prepare('SELECT * FROM wa_sesi_pending WHERE session_id=?').get(String(sid)) || null;
  } catch {
    return null;
  }
}

// Admin pusat: semua sesi. Admin cabang: hanya sesi pending milik cabangnya
// atau sesi yang sudah tersimpan sebagai akun cabangnya. Sesi tanpa catatan
// kepemilikan (dibuat sebelum migrasi 021) hanya untuk admin pusat.
function sesiDiizinkan(user, sid) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role !== 'admin_cabang') return false;
  const pending = pendingUntukSesi(sid);
  if (pending) return pending.cabang_id !== null && Number(pending.cabang_id) === Number(user.cabang_id);
  const akun = akunUntukSesi(sid);
  return !!akun && akun.cabang_id !== null && Number(akun.cabang_id) === Number(user.cabang_id);
}

// QR dengan cache 3 detik. Dashboard open-wa mem-poll tiap 5 detik; beberapa
// tab admin yang membuka wizard bersamaan tidak perlu memukul instance.
let qrCache = { sid: null, at: 0, isi: null };
function qrSesi(sid) {
  const sekarang = Date.now();
  if (qrCache.sid === sid && sekarang - qrCache.at < 3000) return Promise.resolve(qrCache.isi);
  return panggil(`/api/sessions/${encodeURIComponent(sid)}/qr`).then((isi) => {
    qrCache = { sid, at: sekarang, isi };
    return isi;
  });
}

// ---------------------------------------------------------------------------
// Kode pairing
// ---------------------------------------------------------------------------
const pairingTerakhir = new Map(); // sid -> ms permintaan terakhir
const PAIRING_JEDA_MS = 60 * 1000;

function sisaJedaPairing(sid) {
  const t = pairingTerakhir.get(sid) || 0;
  return Math.max(0, PAIRING_JEDA_MS - (Date.now() - t));
}

// Nomor Indonesia -> format internasional tanpa '+' (628xxx), bentuk yang
// diterima open-wa untuk pairing. null kalau tidak masuk akal.
function nomorPairing(nomor) {
  const digits = String(nomor || '').replace(/\D/g, '');
  if (!digits) return null;
  let n = digits.startsWith('62') ? digits : digits.startsWith('0') ? '62' + digits.slice(1) : null;
  if (!n) return null;
  if (n.length < 11 || n.length > 15) return null;
  return n;
}

async function kodePairing(sid, nomor) {
  const sisa = sisaJedaPairing(sid);
  if (sisa > 0) {
    const err = new Error(`Tunggu ${Math.ceil(sisa / 1000)} detik sebelum meminta kode pairing lagi.`);
    err.code = 'TERLALU_SERING';
    throw err;
  }
  const bersih = nomorPairing(nomor);
  if (!bersih) {
    const err = new Error('Nomor tidak valid. Gunakan format 08xx atau 628xx.');
    err.code = 'NOMOR_TIDAK_VALID';
    throw err;
  }
  const hasil = await panggil(`/api/sessions/${encodeURIComponent(sid)}/pairing-code`, {
    method: 'POST',
    body: { phoneNumber: bersih }
  });
  pairingTerakhir.set(sid, Date.now());
  return { pairingCode: hasil && hasil.pairingCode, nomor: bersih };
}

// ---------------------------------------------------------------------------
// Simpan sesi yang sudah terhubung sebagai akun pengirim cabang
// ---------------------------------------------------------------------------

// 628xxx -> 08xxx untuk tampilan.
function nomorTampilan(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('62') && d.length >= 11) return '0' + d.slice(2);
  return d || null;
}

// Status "sudah terhubung": build multi-sesi memakai 'ready', sebagian build
// lain 'connected'. Satu tempat, supaya simpan/UI tidak berbeda pendapat.
function sudahTerhubung(status) {
  return status === 'ready' || status === 'connected';
}

function akunUntukSesi(sid) {
  return db.prepare('SELECT * FROM wa_akun WHERE session_id=?').get(sid) || null;
}

/**
 * Setelah sesi terhubung, jadikan sesi itu akun pengirim untuk satu cabang.
 * Kredensial instance diambil dari environment lalu dienkripsi seperti akun
 * lain — admin cabang tidak pernah mengetahui URL/API key-nya.
 */
async function simpanSebagaiAkun(sid, { cabang_id, label }, aktor) {
  const sesi = await detailSesi(sid);
  if (!sesi || !sudahTerhubung(sesi.status))
    throw new Error('Sesi belum terhubung. Selesaikan pemindaian QR / kode pairing terlebih dahulu.');
  if (akunUntukSesi(sid))
    throw new Error('Sesi ini sudah terdaftar sebagai nomor WhatsApp. Hapus dulu bila ingin mengganti.');

  const { url, key } = instance();
  const id = akunWa.simpan({
    cabang_id: cabang_id === '' || cabang_id === null || cabang_id === undefined ? null : cabang_id,
    label: String(label || sesi.name || '').trim() || `Sesi ${String(sid).slice(0, 8)}`,
    provider: 'openwa',
    nomor: nomorTampilan(sesi.phone),
    api_url: url,
    api_key: key,
    session_id: sid
  });
  audit(aktor, 'wa_sesi_disimpan', 'wa_akun', id, {
    reason: 'sesi open-wa dihubungkan mandiri lewat SIAGA',
    after: { session_id: sid, cabang_id: cabang_id ?? null, nomor: nomorTampilan(sesi.phone) }
  });
  hapusPending(sid);
  return { id, nomor: nomorTampilan(sesi.phone), pushName: sesi.pushName || null };
}

module.exports = {
  instance,
  instanceSiap,
  daftarSesi,
  detailSesi,
  buatSesi,
  startSesi,
  hapusSesi,
  qrSesi,
  kodePairing,
  nomorPairing,
  sisaJedaPairing,
  nomorTampilan,
  sudahTerhubung,
  akunUntukSesi,
  simpanSebagaiAkun,
  catatPending,
  hapusPending,
  pendingUntukSesi,
  sesiDiizinkan,
  PAIRING_JEDA_MS
};
