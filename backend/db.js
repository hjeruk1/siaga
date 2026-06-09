require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(process.env.DB_PATH || path.join(__dirname, 'siaga.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.pragma('synchronous = NORMAL');

db.exec(`
CREATE TABLE IF NOT EXISTS organisasi (
  id INTEGER PRIMARY KEY CHECK(id=1),
  nama TEXT NOT NULL DEFAULT 'Taruna Prima',
  alamat TEXT,
  kontak TEXT,
  rekening_nama TEXT,
  rekening_bank TEXT,
  rekening_nomor TEXT,
  logo_url TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS cabang (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT NOT NULL,
  kode TEXT NOT NULL UNIQUE,
  alamat TEXT,
  kontak TEXT,
  aktif INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jenjang (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kode TEXT NOT NULL UNIQUE,
  nama TEXT NOT NULL,
  tipe TEXT NOT NULL CHECK(tipe IN ('sekolah','care')),
  urutan INTEGER NOT NULL DEFAULT 0,
  aktif INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS rombel (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cabang_id INTEGER NOT NULL REFERENCES cabang(id),
  jenjang_id INTEGER NOT NULL REFERENCES jenjang(id),
  nama TEXT NOT NULL,
  aktif INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(cabang_id,nama)
);

CREATE TABLE IF NOT EXISTS pengguna (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipe TEXT NOT NULL CHECK(tipe IN ('staff','wali')),
  role TEXT NOT NULL CHECK(role IN ('admin','admin_cabang','kepsek','guru','gerbang','wali')),
  display_name TEXT NOT NULL,
  username TEXT,
  no_wa TEXT,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'undangan' CHECK(status IN ('undangan','aktif','nonaktif')),
  must_change_password INTEGER NOT NULL DEFAULT 1,
  auth_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pengguna_staff_username ON pengguna(username) WHERE tipe='staff' AND username IS NOT NULL AND username!='';
CREATE UNIQUE INDEX IF NOT EXISTS idx_pengguna_wali_wa ON pengguna(no_wa) WHERE tipe='wali' AND no_wa IS NOT NULL AND no_wa!='';

CREATE TABLE IF NOT EXISTS staff_profile (
  pengguna_id INTEGER PRIMARY KEY REFERENCES pengguna(id) ON DELETE CASCADE,
  cabang_id INTEGER REFERENCES cabang(id),
  foto TEXT,
  jabatan TEXT,
  no_wa_kontak TEXT
);

CREATE TABLE IF NOT EXISTS wali_profile (
  pengguna_id INTEGER PRIMARY KEY REFERENCES pengguna(id) ON DELETE CASCADE,
  no_wa TEXT NOT NULL,
  catatan TEXT
);

CREATE TABLE IF NOT EXISTS siswa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT NOT NULL,
  nis TEXT,
  nama_panggilan TEXT,
  gender TEXT,
  tanggal_lahir TEXT,
  alamat TEXT,
  catatan_khusus TEXT,
  catatan_sekolah_luar TEXT,
  foto TEXT,
  nfc_token TEXT,
  status TEXT NOT NULL DEFAULT 'aktif' CHECK(status IN ('aktif','keluar','lulus')),
  status_kartu TEXT DEFAULT 'aktif' CHECK(status_kartu IN ('aktif','hilang','cetak')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_siswa_nis_unique ON siswa(nis) WHERE nis IS NOT NULL AND nis!='';
CREATE UNIQUE INDEX IF NOT EXISTS idx_siswa_nfc_unique ON siswa(nfc_token) WHERE nfc_token IS NOT NULL AND nfc_token!='';

CREATE TABLE IF NOT EXISTS early_release (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  siswa_id INTEGER NOT NULL REFERENCES siswa(id),
  cabang_id INTEGER NOT NULL REFERENCES cabang(id),
  tanggal TEXT NOT NULL,
  alasan TEXT NOT NULL,
  created_by INTEGER REFERENCES pengguna(id),
  created_at TEXT NOT NULL,
  UNIQUE(siswa_id, tanggal)
);

CREATE TABLE IF NOT EXISTS siswa_enrollment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  siswa_id INTEGER NOT NULL REFERENCES siswa(id) ON DELETE CASCADE,
  cabang_id INTEGER NOT NULL REFERENCES cabang(id),
  jenjang_id INTEGER NOT NULL REFERENCES jenjang(id),
  rombel_id INTEGER NOT NULL REFERENCES rombel(id),
  paket TEXT NOT NULL CHECK(paket IN ('reguler','full_day','care')),
  tanggal_mulai TEXT NOT NULL,
  tanggal_selesai TEXT,
  status TEXT NOT NULL DEFAULT 'aktif' CHECK(status IN ('aktif','selesai')),
  alasan TEXT,
  created_at TEXT NOT NULL,
  created_by INTEGER REFERENCES pengguna(id)
);
CREATE INDEX IF NOT EXISTS idx_enrollment_siswa ON siswa_enrollment(siswa_id,status,tanggal_mulai);

CREATE TABLE IF NOT EXISTS wali_siswa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wali_pengguna_id INTEGER NOT NULL REFERENCES pengguna(id) ON DELETE CASCADE,
  siswa_id INTEGER NOT NULL REFERENCES siswa(id) ON DELETE CASCADE,
  relasi TEXT,
  aktif INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE(siswa_id,aktif) ON CONFLICT REPLACE
);

CREATE TABLE IF NOT EXISTS guru_rombel (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pengguna_id INTEGER NOT NULL REFERENCES pengguna(id) ON DELETE CASCADE,
  rombel_id INTEGER NOT NULL REFERENCES rombel(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'bantu' CHECK(role IN ('utama','bantu')),
  created_at TEXT NOT NULL,
  UNIQUE(pengguna_id,rombel_id)
);

CREATE TABLE IF NOT EXISTS penjemput (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  siswa_id INTEGER NOT NULL REFERENCES siswa(id) ON DELETE CASCADE,
  nama TEXT NOT NULL,
  no_wa TEXT,
  relasi TEXT,
  qr_code TEXT UNIQUE NOT NULL,
  catatan TEXT,
  aktif INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS operasional_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cabang_id INTEGER NOT NULL REFERENCES cabang(id) ON DELETE CASCADE,
  jenjang_id INTEGER NOT NULL REFERENCES jenjang(id),
  paket TEXT NOT NULL CHECK(paket IN ('reguler','full_day','care')),
  jam_masuk TEXT NOT NULL DEFAULT '08:00',
  jam_pulang TEXT NOT NULL DEFAULT '11:00',
  hitung_terlambat INTEGER NOT NULL DEFAULT 1,
  pakai_kalender INTEGER NOT NULL DEFAULT 1,
  daily_record_wajib INTEGER NOT NULL DEFAULT 1,
  daily_record_due_time TEXT NOT NULL DEFAULT '18:00',
  pickup_fleksibel INTEGER NOT NULL DEFAULT 0,
  UNIQUE(cabang_id,jenjang_id,paket)
);

CREATE TABLE IF NOT EXISTS kalender_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL CHECK(scope IN ('yayasan','cabang')),
  cabang_id INTEGER REFERENCES cabang(id) ON DELETE CASCADE,
  tanggal TEXT NOT NULL,
  tipe TEXT NOT NULL CHECK(tipe IN ('libur','masuk')),
  nama TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS absensi (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  siswa_id INTEGER NOT NULL REFERENCES siswa(id),
  cabang_id INTEGER NOT NULL REFERENCES cabang(id),
  jenjang_id INTEGER NOT NULL REFERENCES jenjang(id),
  rombel_id INTEGER NOT NULL REFERENCES rombel(id),
  paket TEXT NOT NULL,
  tanggal TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Belum' CHECK(status IN ('Belum','Hadir','Terlambat','Menunggu','Pulang','Izin','Sakit','Absen','Libur')),
  jam_masuk TEXT,
  jam_pulang TEXT,
  jam_tunggu TEXT,
  penjemput_id INTEGER REFERENCES penjemput(id),
  manual INTEGER NOT NULL DEFAULT 0,
  catatan TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(siswa_id,tanggal)
);

CREATE TABLE IF NOT EXISTS tutup_hari (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cabang_id INTEGER NOT NULL REFERENCES cabang(id),
  tanggal TEXT NOT NULL,
  closed_by INTEGER NOT NULL REFERENCES pengguna(id),
  closed_at TEXT NOT NULL,
  summary TEXT,
  UNIQUE(cabang_id,tanggal)
);

CREATE TABLE IF NOT EXISTS penjemputan_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  absensi_id INTEGER NOT NULL REFERENCES absensi(id) ON DELETE CASCADE,
  siswa_id INTEGER NOT NULL REFERENCES siswa(id),
  penjemput_id INTEGER REFERENCES penjemput(id),
  guru_id INTEGER REFERENCES pengguna(id),
  cabang_id INTEGER NOT NULL REFERENCES cabang(id),
  tanggal TEXT NOT NULL,
  jam_scan TEXT,
  jam_pulang TEXT,
  durasi_menit INTEGER,
  sumber TEXT NOT NULL DEFAULT 'manual' CHECK(sumber IN ('manual','nfc','qr')),
  catatan TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS qr_reissue_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  siswa_id INTEGER NOT NULL REFERENCES siswa(id),
  penjemput_id INTEGER REFERENCES penjemput(id),
  admin_id INTEGER REFERENCES pengguna(id),
  cabang_id INTEGER REFERENCES cabang(id),
  old_qr_code TEXT,
  new_qr_code TEXT,
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS nfc_scan_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  siswa_id INTEGER REFERENCES siswa(id),
  pengguna_id INTEGER REFERENCES pengguna(id),
  cabang_id INTEGER REFERENCES cabang(id),
  action TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('success','failed')),
  reason TEXT,
  token_masked TEXT,
  tab TEXT,
  tanggal TEXT,
  jam TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS modul_ajar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cabang_id INTEGER NOT NULL REFERENCES cabang(id),
  jenjang_id INTEGER REFERENCES jenjang(id),
  rombel_id INTEGER REFERENCES rombel(id),
  paket TEXT CHECK(paket IN ('reguler','full_day','care')),
  title TEXT NOT NULL,
  week_start TEXT NOT NULL,
  week_end TEXT NOT NULL,
  goals TEXT NOT NULL DEFAULT '[]',
  suggested_activities TEXT NOT NULL DEFAULT '[]',
  suggested_domains TEXT NOT NULL DEFAULT '[]',
  attachment_url TEXT,
  created_by INTEGER REFERENCES pengguna(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_modul_ajar_scope ON modul_ajar(cabang_id,jenjang_id,rombel_id,week_start,week_end);

CREATE TABLE IF NOT EXISTS focus_theme (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modul_ajar_id INTEGER REFERENCES modul_ajar(id),
  cabang_id INTEGER NOT NULL REFERENCES cabang(id),
  rombel_id INTEGER NOT NULL REFERENCES rombel(id),
  tanggal TEXT NOT NULL,
  title TEXT NOT NULL,
  activity_summary TEXT,
  suggested_domains TEXT NOT NULL DEFAULT '[]',
  teacher_prompt TEXT,
  created_by INTEGER REFERENCES pengguna(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(rombel_id,tanggal)
);

CREATE INDEX IF NOT EXISTS idx_focus_theme_date ON focus_theme(cabang_id,rombel_id,tanggal);

CREATE TABLE IF NOT EXISTS laporan_harian (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  siswa_id INTEGER NOT NULL REFERENCES siswa(id),
  cabang_id INTEGER NOT NULL REFERENCES cabang(id),
  jenjang_id INTEGER NOT NULL REFERENCES jenjang(id),
  rombel_id INTEGER NOT NULL REFERENCES rombel(id),
  paket TEXT NOT NULL,
  tanggal TEXT NOT NULL,
  guru_id INTEGER REFERENCES pengguna(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
  mood TEXT CHECK(mood IN ('ceria','biasa','rewel')),
  makan TEXT CHECK(makan IN ('habis','setengah','tidak')),
  tidur INTEGER,
  aktivitas TEXT NOT NULL DEFAULT '[]',
  catatan TEXT,
  published_at TEXT,
  last_published_change_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(siswa_id,tanggal)
);

CREATE TABLE IF NOT EXISTS laporan_edit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  laporan_id INTEGER NOT NULL REFERENCES laporan_harian(id) ON DELETE CASCADE,
  pengguna_id INTEGER REFERENCES pengguna(id),
  perubahan TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS laporan_attachment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  laporan_id INTEGER NOT NULL REFERENCES laporan_harian(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  filename TEXT NOT NULL,
  size_bytes INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES pengguna(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS laporan_read (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  laporan_id INTEGER NOT NULL REFERENCES laporan_harian(id) ON DELETE CASCADE,
  wali_pengguna_id INTEGER NOT NULL REFERENCES pengguna(id) ON DELETE CASCADE,
  read_at TEXT NOT NULL,
  UNIQUE(laporan_id,wali_pengguna_id)
);

CREATE TABLE IF NOT EXISTS laporan_comment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  laporan_id INTEGER NOT NULL REFERENCES laporan_harian(id) ON DELETE CASCADE,
  siswa_id INTEGER NOT NULL REFERENCES siswa(id),
  cabang_id INTEGER NOT NULL REFERENCES cabang(id),
  author_pengguna_id INTEGER NOT NULL REFERENCES pengguna(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifikasi (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient_pengguna_id INTEGER NOT NULL REFERENCES pengguna(id) ON DELETE CASCADE,
  tipe TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  entity_type TEXT,
  entity_id INTEGER,
  cabang_id INTEGER REFERENCES cabang(id),
  read_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_pengguna_id INTEGER REFERENCES pengguna(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  cabang_id INTEGER REFERENCES cabang(id),
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS biaya_tarif (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cabang_id INTEGER NOT NULL REFERENCES cabang(id),
  tahun_ajaran TEXT NOT NULL,
  jenjang_id INTEGER NOT NULL REFERENCES jenjang(id),
  jenis TEXT NOT NULL CHECK(jenis IN ('spp','full_day','care','kegiatan')),
  nama TEXT NOT NULL,
  nominal INTEGER NOT NULL CHECK(nominal >= 0),
  aktif INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(cabang_id,tahun_ajaran,jenjang_id,jenis,nama)
);

CREATE TABLE IF NOT EXISTS diskon_siswa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  siswa_id INTEGER NOT NULL REFERENCES siswa(id) ON DELETE CASCADE,
  cabang_id INTEGER NOT NULL REFERENCES cabang(id),
  tahun_ajaran TEXT NOT NULL,
  jenis TEXT NOT NULL CHECK(jenis IN ('spp','full_day','care','kegiatan')),
  tipe TEXT NOT NULL CHECK(tipe IN ('persen','nominal')),
  nilai INTEGER NOT NULL,
  catatan TEXT,
  aktif INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES pengguna(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tagihan (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  siswa_id INTEGER NOT NULL REFERENCES siswa(id),
  cabang_id INTEGER NOT NULL REFERENCES cabang(id),
  jenjang_id INTEGER NOT NULL REFERENCES jenjang(id),
  rombel_id INTEGER NOT NULL REFERENCES rombel(id),
  paket TEXT NOT NULL,
  tahun_ajaran TEXT NOT NULL,
  periode TEXT,
  jenis TEXT NOT NULL CHECK(jenis IN ('spp','full_day','care','kegiatan')),
  nama TEXT NOT NULL,
  nominal_awal INTEGER NOT NULL,
  prorata_amount INTEGER NOT NULL DEFAULT 0,
  koreksi_amount INTEGER NOT NULL DEFAULT 0,
  diskon_amount INTEGER NOT NULL DEFAULT 0,
  nominal_final INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','sebagian','lunas','void')),
  koreksi_reason TEXT,
  created_by INTEGER REFERENCES pengguna(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(siswa_id,cabang_id,tahun_ajaran,periode,jenis,nama)
);

CREATE TABLE IF NOT EXISTS pembayaran (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cabang_id INTEGER NOT NULL REFERENCES cabang(id),
  siswa_id INTEGER NOT NULL REFERENCES siswa(id),
  receipt_no TEXT UNIQUE,
  tanggal_bayar TEXT NOT NULL,
  nominal INTEGER NOT NULL CHECK(nominal > 0),
  metode TEXT NOT NULL CHECK(metode IN ('tunai','transfer','qris','lainnya')),
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('pending_verification','confirmed','rejected','void')),
  reference TEXT,
  catatan TEXT,
  verified_by INTEGER REFERENCES pengguna(id),
  verified_at TEXT,
  void_reason TEXT,
  created_by INTEGER REFERENCES pengguna(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pembayaran_alokasi (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pembayaran_id INTEGER NOT NULL REFERENCES pembayaran(id) ON DELETE CASCADE,
  tagihan_id INTEGER NOT NULL REFERENCES tagihan(id),
  nominal INTEGER NOT NULL CHECK(nominal > 0),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS saldo_kredit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  siswa_id INTEGER NOT NULL REFERENCES siswa(id),
  cabang_id INTEGER NOT NULL REFERENCES cabang(id),
  pembayaran_id INTEGER REFERENCES pembayaran(id) ON DELETE CASCADE,
  nominal INTEGER NOT NULL,
  tipe TEXT NOT NULL CHECK(tipe IN ('credit','used','void')),
  catatan TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoice (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cabang_id INTEGER NOT NULL REFERENCES cabang(id),
  siswa_id INTEGER NOT NULL REFERENCES siswa(id),
  invoice_no TEXT NOT NULL UNIQUE,
  tahun_ajaran TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'issued' CHECK(status IN ('issued','void')),
  created_by INTEGER REFERENCES pengguna(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoice_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoice(id) ON DELETE CASCADE,
  tagihan_id INTEGER NOT NULL REFERENCES tagihan(id)
);

CREATE TABLE IF NOT EXISTS kenaikan_batch (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cabang_id INTEGER NOT NULL REFERENCES cabang(id),
  tahun_ajaran TEXT NOT NULL,
  tanggal_efektif TEXT NOT NULL,
  summary_json TEXT,
  created_by INTEGER REFERENCES pengguna(id),
  created_at TEXT NOT NULL,
  UNIQUE(cabang_id,tahun_ajaran)
);

CREATE TABLE IF NOT EXISTS sequence_counter (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);
`);

try { db.prepare('ALTER TABLE siswa ADD COLUMN catatan_sekolah_luar TEXT').run(); } catch {}
try { db.prepare('ALTER TABLE pengguna ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0').run(); } catch {}
try { db.prepare('ALTER TABLE penjemputan_log ADD COLUMN absensi_id INTEGER REFERENCES absensi(id) ON DELETE CASCADE').run(); } catch {}
try { db.prepare('ALTER TABLE penjemputan_log ADD COLUMN siswa_id INTEGER REFERENCES siswa(id)').run(); } catch {}
try { db.prepare('ALTER TABLE penjemputan_log ADD COLUMN penjemput_id INTEGER REFERENCES penjemput(id)').run(); } catch {}
try { db.prepare('ALTER TABLE penjemputan_log ADD COLUMN guru_id INTEGER REFERENCES pengguna(id)').run(); } catch {}
try { db.prepare('ALTER TABLE penjemputan_log ADD COLUMN cabang_id INTEGER REFERENCES cabang(id)').run(); } catch {}
try { db.prepare('ALTER TABLE penjemputan_log ADD COLUMN tanggal TEXT').run(); } catch {}
try { db.prepare('ALTER TABLE penjemputan_log ADD COLUMN jam_scan TEXT').run(); } catch {}
try { db.prepare('ALTER TABLE penjemputan_log ADD COLUMN jam_pulang TEXT').run(); } catch {}
try { db.prepare('ALTER TABLE penjemputan_log ADD COLUMN durasi_menit INTEGER').run(); } catch {}
try { db.prepare("ALTER TABLE penjemputan_log ADD COLUMN sumber TEXT NOT NULL DEFAULT 'manual'").run(); } catch {}
try { db.prepare('ALTER TABLE penjemputan_log ADD COLUMN catatan TEXT').run(); } catch {}
try { db.prepare('ALTER TABLE penjemputan_log ADD COLUMN created_at TEXT').run(); } catch {}
try { db.prepare('CREATE INDEX IF NOT EXISTS idx_penjemputan_log_tanggal ON penjemputan_log(tanggal,cabang_id)').run(); } catch {}
try { db.prepare('ALTER TABLE qr_reissue_log ADD COLUMN siswa_id INTEGER REFERENCES siswa(id)').run(); } catch {}
try { db.prepare('ALTER TABLE qr_reissue_log ADD COLUMN penjemput_id INTEGER REFERENCES penjemput(id)').run(); } catch {}
try { db.prepare('ALTER TABLE qr_reissue_log ADD COLUMN admin_id INTEGER REFERENCES pengguna(id)').run(); } catch {}
try { db.prepare('ALTER TABLE qr_reissue_log ADD COLUMN cabang_id INTEGER REFERENCES cabang(id)').run(); } catch {}
try { db.prepare('ALTER TABLE qr_reissue_log ADD COLUMN old_qr_code TEXT').run(); } catch {}
try { db.prepare('ALTER TABLE qr_reissue_log ADD COLUMN new_qr_code TEXT').run(); } catch {}
try { db.prepare('ALTER TABLE qr_reissue_log ADD COLUMN reason TEXT').run(); } catch {}
try { db.prepare('ALTER TABLE qr_reissue_log ADD COLUMN created_at TEXT').run(); } catch {}
try { db.prepare('ALTER TABLE nfc_scan_log ADD COLUMN pengguna_id INTEGER REFERENCES pengguna(id)').run(); } catch {}
try { db.prepare('ALTER TABLE nfc_scan_log ADD COLUMN cabang_id INTEGER REFERENCES cabang(id)').run(); } catch {}
try { db.prepare('ALTER TABLE nfc_scan_log ADD COLUMN siswa_id INTEGER REFERENCES siswa(id)').run(); } catch {}
try { db.prepare('ALTER TABLE nfc_scan_log ADD COLUMN action TEXT').run(); } catch {}
try { db.prepare('ALTER TABLE nfc_scan_log ADD COLUMN status TEXT').run(); } catch {}
try { db.prepare('ALTER TABLE nfc_scan_log ADD COLUMN reason TEXT').run(); } catch {}
try { db.prepare('ALTER TABLE nfc_scan_log ADD COLUMN token_masked TEXT').run(); } catch {}
try { db.prepare('ALTER TABLE nfc_scan_log ADD COLUMN tab TEXT').run(); } catch {}
try { db.prepare('ALTER TABLE nfc_scan_log ADD COLUMN tanggal TEXT').run(); } catch {}
try { db.prepare('ALTER TABLE nfc_scan_log ADD COLUMN jam TEXT').run(); } catch {}
try { db.prepare('ALTER TABLE nfc_scan_log ADD COLUMN created_at TEXT').run(); } catch {}
try { db.prepare('UPDATE nfc_scan_log SET pengguna_id=COALESCE(pengguna_id,guru_id) WHERE guru_id IS NOT NULL').run(); } catch {}
try { db.prepare('CREATE INDEX IF NOT EXISTS idx_nfc_scan_log_tanggal ON nfc_scan_log(tanggal,cabang_id,status)').run(); } catch {}
try { db.prepare('ALTER TABLE laporan_harian ADD COLUMN focus_theme_id INTEGER REFERENCES focus_theme(id)').run(); } catch {}
try { db.prepare('ALTER TABLE laporan_harian ADD COLUMN observation_domain TEXT').run(); } catch {}
try { db.prepare('ALTER TABLE laporan_harian ADD COLUMN observation_note TEXT').run(); } catch {}
try { db.prepare('ALTER TABLE laporan_harian ADD COLUMN parent_note TEXT').run(); } catch {}
try { db.prepare("ALTER TABLE laporan_harian ADD COLUMN structured_observation_json TEXT NOT NULL DEFAULT '{}'").run(); } catch {}
try { db.prepare('CREATE INDEX IF NOT EXISTS idx_laporan_focus_theme ON laporan_harian(focus_theme_id)').run(); } catch {}
try { db.prepare('ALTER TABLE focus_theme ADD COLUMN menu_makanan TEXT').run(); } catch {}

db.prepare("INSERT OR IGNORE INTO organisasi(id,nama,updated_at) VALUES(1,'Taruna Prima',?)").run(new Date().toISOString());

module.exports = db;
