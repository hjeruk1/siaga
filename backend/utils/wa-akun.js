// Registry akun WhatsApp per cabang + penyimpanan kredensial terenkripsi.
//
// Kenapa kredensial dienkripsi: backup database sekarang ikut diunggah ke
// Google Cloud Storage (lihat scripts/backup.js). Kalau API key/token disimpan
// plaintext, satu berkas backup yang bocor berarti semua nomor sekolah bisa
// dipakai orang lain. Kunci enkripsi hidup di environment (WA_SECRET_KEY, atau
// diturunkan dari JWT_SECRET), jadi TIDAK ikut ke dalam backup.
//
// Enkripsi sendiri hidup di utils/rahasia.js bersama dengan TOTP, supaya aturan
// mainnya (format simpanan, penanganan kunci hilang) hanya ditulis sekali.
const { enkripsi, dekripsi } = require('./rahasia');
const db = require('../db');

const LABEL_KUNCI = 'siaga-wa-akun';

function enkripsiKredensial(teks) {
  return enkripsi(teks, LABEL_KUNCI);
}

function dekripsiKredensial(simpanan) {
  return dekripsi(simpanan, LABEL_KUNCI);
}

function tabelAda() {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='wa_akun'").get();
}

// Bentuk yang aman dikirim ke klien: tanpa nilai rahasia, hanya penanda ada/tidak.
function aman(row) {
  if (!row) return null;
  const { api_key, gateway_token, ...sisa } = row;
  return {
    ...sisa,
    punya_api_key: !!api_key,
    punya_gateway_token: !!gateway_token,
    kredensial_terbaca: row.provider === 'openwa' ? !!dekripsiKredensial(api_key) : !!dekripsiKredensial(gateway_token)
  };
}

function daftar() {
  if (!tabelAda()) return [];
  return db
    .prepare(
      `SELECT a.*, c.nama AS cabang_nama, c.kode AS cabang_kode
       FROM wa_akun a
       LEFT JOIN cabang c ON c.id=a.cabang_id
       ORDER BY (a.cabang_id IS NULL), c.nama, a.id`
    )
    .all()
    .map(aman);
}

// Baris mentah (termasuk kredensial terenkripsi) untuk kebutuhan internal:
// membangun provider, memeriksa status. JANGAN dikirim ke klien.
function daftarMentah() {
  if (!tabelAda()) return [];
  return db
    .prepare(
      `SELECT a.*, c.nama AS cabang_nama, c.kode AS cabang_kode
       FROM wa_akun a LEFT JOIN cabang c ON c.id=a.cabang_id
       ORDER BY (a.cabang_id IS NULL), c.nama, a.id`
    )
    .all();
}

function ambil(id) {
  if (!tabelAda()) return null;
  return db.prepare('SELECT * FROM wa_akun WHERE id=?').get(id) || null;
}

function adaAkunAktif() {
  if (!tabelAda()) return false;
  return !!db.prepare('SELECT 1 FROM wa_akun WHERE aktif=1 LIMIT 1').get();
}

/**
 * Akun yang dipakai untuk satu cabang.
 * - cabang punya nomor sendiri -> pakai itu
 * - tidak punya -> pakai akun pusat (cabang_id NULL)
 * - tidak ada keduanya -> null (pesan TIDAK dikirim; lebih baik diam daripada
 *   mengirim dari nomor yang bukan milik cabang itu)
 */
function akunUntukCabang(cabangId) {
  if (!tabelAda()) return null;
  const semua = db.prepare('SELECT * FROM wa_akun WHERE aktif=1').all();
  if (!semua.length) return null;
  if (cabangId) {
    const sendiri = semua.find((a) => Number(a.cabang_id) === Number(cabangId));
    if (sendiri) return sendiri;
  }
  return semua.find((a) => a.cabang_id === null) || null;
}

function simpan(data, id = null) {
  const now = new Date().toISOString();
  // null/''/undefined = akun pusat. Tanpa pemeriksaan null eksplisit,
  // Number(null) menghasilkan 0 dan INSERT gagal karena FK cabang.
  const kosong = data.cabang_id === '' || data.cabang_id === undefined || data.cabang_id === null;
  const cabangId = kosong ? null : Number(data.cabang_id);
  const provider = data.provider === 'gateway' ? 'gateway' : 'openwa';
  const label = String(data.label || '').trim();
  if (!label) throw new Error('Label akun wajib diisi');
  if (cabangId && !db.prepare('SELECT 1 FROM cabang WHERE id=?').get(cabangId)) {
    throw new Error('Cabang tidak ditemukan');
  }

  const isi = {
    cabang_id: cabangId,
    label,
    provider,
    nomor: String(data.nomor || '').trim() || null,
    api_url: provider === 'openwa' ? String(data.api_url || '').trim() || null : null,
    gateway_url: provider === 'gateway' ? String(data.gateway_url || '').trim() || null : null,
    aktif: data.aktif === false || data.aktif === 0 || data.aktif === '0' ? 0 : 1
  };

  if (provider === 'openwa' && !isi.api_url) throw new Error('URL Easy API wajib diisi untuk provider open-wa');
  if (provider === 'gateway' && !isi.gateway_url) throw new Error('URL gateway wajib diisi untuk provider gateway');

  if (id) {
    const lama = ambil(id);
    if (!lama) throw new Error('Akun tidak ditemukan');
    // Kunci hanya ditimpa kalau diisi; form edit tidak menampilkan nilai lama.
    const apiKey = data.api_key ? enkripsiKredensial(data.api_key) : provider === 'openwa' ? lama.api_key : null;
    const token = data.gateway_token
      ? enkripsiKredensial(data.gateway_token)
      : provider === 'gateway'
        ? lama.gateway_token
        : null;
    db.prepare(
      `UPDATE wa_akun SET cabang_id=?,label=?,provider=?,nomor=?,api_url=?,api_key=?,gateway_url=?,gateway_token=?,aktif=?,updated_at=? WHERE id=?`
    ).run(
      isi.cabang_id,
      isi.label,
      isi.provider,
      isi.nomor,
      isi.api_url,
      apiKey,
      isi.gateway_url,
      token,
      isi.aktif,
      now,
      id
    );
    return id;
  }

  const r = db
    .prepare(
      `INSERT INTO wa_akun(cabang_id,label,provider,nomor,api_url,api_key,gateway_url,gateway_token,aktif,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      isi.cabang_id,
      isi.label,
      isi.provider,
      isi.nomor,
      isi.api_url,
      data.api_key ? enkripsiKredensial(data.api_key) : null,
      isi.gateway_url,
      data.gateway_token ? enkripsiKredensial(data.gateway_token) : null,
      isi.aktif,
      now,
      now
    );
  return r.lastInsertRowid;
}

function hapus(id) {
  if (!tabelAda()) return false;
  return db.prepare('DELETE FROM wa_akun WHERE id=?').run(id).changes > 0;
}

module.exports = {
  tabelAda,
  enkripsi: enkripsiKredensial,
  dekripsi: dekripsiKredensial,
  aman,
  daftar,
  daftarMentah,
  ambil,
  adaAkunAktif,
  akunUntukCabang,
  simpan,
  hapus
};
