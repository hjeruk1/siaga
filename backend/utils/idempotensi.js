// Idempotensi untuk aksi absensi yang bisa dikirim ulang dari antrean offline.
//
// Masalah yang diselesaikan: guru menekan "hadir" saat sinyal putus. Request
// mungkin SUDAH sampai ke server, tapi responsnya tidak pernah diterima
// perangkat. Saat online, antrean mengirim ulang — dan tanpa penanda, server
// akan menolak dengan "Status Hadir tidak bisa diubah menjadi hadir" padahal
// absensinya sudah tercatat. Guru melihat error, mengira gagal, lalu mencatat
// manual di kertas.
//
// Solusinya: klien mengirim `client_id` (uuid per aksi). Hasil pertama disimpan
// di tabel ini; pengiriman ulang dengan id yang sama mengembalikan hasil yang
// sama tanpa mengulang efek samping (audit, notifikasi, siaran SSE).
const db = require('../db');
const { nowUtc } = require('./workflow');

const MAKS_UMUR_JAM = 48;

function tabelAda() {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='absensi_idempotensi'").get();
}

function ambil(clientId) {
  if (!clientId || !tabelAda()) return null;
  const row = db.prepare('SELECT aksi,hasil_json,created_at FROM absensi_idempotensi WHERE client_id=?').get(clientId);
  if (!row) return null;
  // Penanda tua dibuang: kalau tidak, tabel ini tumbuh selamanya.
  if (Date.parse(row.created_at) < Date.now() - MAKS_UMUR_JAM * 3600 * 1000) return null;
  try {
    return { aksi: row.aksi, hasil: JSON.parse(row.hasil_json) };
  } catch {
    return null;
  }
}

function simpan(clientId, aksi, hasil) {
  if (!clientId || !tabelAda()) return;
  db.prepare(
    `INSERT INTO absensi_idempotensi(client_id,aksi,hasil_json,created_at) VALUES(?,?,?,?)
     ON CONFLICT(client_id) DO NOTHING`
  ).run(clientId, aksi, JSON.stringify(hasil ?? {}), nowUtc());
}

// Bersihkan penanda lama; dipanggil dari job pemeliharaan bila ada.
function bersihkan() {
  if (!tabelAda()) return 0;
  const batas = new Date(Date.now() - MAKS_UMUR_JAM * 3600 * 1000).toISOString();
  return db.prepare('DELETE FROM absensi_idempotensi WHERE created_at<?').run(batas).changes;
}

module.exports = { ambil, simpan, bersihkan, MAKS_UMUR_JAM };
