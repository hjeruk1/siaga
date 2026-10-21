// Session ID untuk akun open-wa multi-sesi.
//
// Satu proses open-wa bisa menangangi beberapa nomor (dashboard "Sessions"):
// tiap nomor adalah satu sesi dengan session-id sendiri. Tabel wa_akun sudah
// memetakan cabang -> akun pengirim; kolom ini melengkapi pemetaan itu ke
// SESI di dalam satu instance open-wa.
//
// Dialek dipilih per baris, bukan per server: satu instance multi-sesi bisa
// dipakai beberapa cabang (session-id berbeda, URL & api_key SAMA), sementara
// baris lain masih menunjuk Easy API satu-nomor (session-id kosong).
//
// Kenapa ALTER dan bukan rebuild tabel: menambah nilai ke CHECK(provider) di
// SQLite berarti rebuild tabel + Drop parent yang dirujuk wa_monitor_akun —
// risiko besar untuk manfaat kosmetik. Provider tetap 'openwa'; kehadiran
// session_id yang menentukan dialek.
module.exports.up = (db) => {
  const kolom = db
    .prepare('PRAGMA table_info(wa_akun)')
    .all()
    .map((c) => c.name);
  if (!kolom.includes('session_id')) db.exec('ALTER TABLE wa_akun ADD COLUMN session_id TEXT');
};

module.exports.down = (db) => {
  // SQLite < 3.35 tak bisa DROP COLUMN; kosongkan saja (kembali ke dialek
  // Easy API satu-nomor untuk semua baris).
  db.exec('UPDATE wa_akun SET session_id=NULL');
};
