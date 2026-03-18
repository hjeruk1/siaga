require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(process.env.DB_PATH || path.join(__dirname, 'siaga.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS guru (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT NOT NULL, no_wa TEXT,
    username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'guru' CHECK(role IN ('admin','kepsek','guru','gerbang'))
  );
  CREATE TABLE IF NOT EXISTS kelas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT NOT NULL UNIQUE,
    guru_id INTEGER REFERENCES guru(id) ON DELETE SET NULL
  );
  CREATE TABLE IF NOT EXISTS siswa (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT NOT NULL, kelas_id INTEGER REFERENCES kelas(id),
    status_kartu TEXT DEFAULT 'aktif' CHECK(status_kartu IN ('aktif','hilang','cetak'))
  );
  CREATE TABLE IF NOT EXISTS penjemput (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    siswa_id INTEGER NOT NULL REFERENCES siswa(id) ON DELETE CASCADE,
    nama TEXT NOT NULL, no_wa TEXT, relasi TEXT, qr_code TEXT UNIQUE NOT NULL
  );
  CREATE TABLE IF NOT EXISTS absensi (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    siswa_id INTEGER NOT NULL REFERENCES siswa(id),
    tanggal TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Absen'
      CHECK(status IN ('Hadir','Terlambat','Menunggu','Pulang','Izin','Sakit','Absen')),
    jam_masuk TEXT, jam_pulang TEXT, jam_tunggu TEXT,
    penjemput_id INTEGER REFERENCES penjemput(id),
    manual INTEGER DEFAULT 0, catatan TEXT,
    UNIQUE(siswa_id, tanggal)
  );
  CREATE TABLE IF NOT EXISTS notif_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    siswa_id INTEGER REFERENCES siswa(id),
    guru_id  INTEGER REFERENCES guru(id),
    tipe TEXT NOT NULL, pesan TEXT, jam TEXT, dibaca INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M','now','localtime'))
  );
`);
module.exports = db;