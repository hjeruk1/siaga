// Ringkasan pemakaian penyimpanan.
//
// Kenapa perlu: foto kegiatan menambah ~1,5-2 MB per album, dan satu-satunya
// cara admin tahu "kapan disk penuh" sebelumnya adalah menunggu aplikasi
// berhenti menulis. Angka di sini menjawab tiga pertanyaan berbeda:
//
//   1. Disk server: berapa sisa sebenarnya (statfs), bukan tebakan.
//   2. Folder unggahan: siapa yang memakan tempat (bukti bayar, foto, galeri).
//   3. Database: SQLite + WAL, karena WAL yang membengkak sering tidak terlihat
//      padahal ia ikut di-backup.
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { todayWIB } = require('./workflow');

const UPLOAD_ROOT = path.resolve(__dirname, '../uploads');
const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, '../backups'));

const LABEL_FOLDER = {
  bukti: 'Bukti pembayaran',
  foto: 'Foto siswa & staff',
  laporan: 'Lampiran catatan harian',
  kegiatan: 'Galeri kegiatan',
  izin: 'Lampiran izin/sakit'
};

function ukuranFolder(dir, kedalaman = 0) {
  const hasil = { files: 0, bytes: 0 };
  if (kedalaman > 6) return hasil; // pengaman terhadap symlink melingkar
  let isi;
  try {
    isi = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return hasil;
  }
  for (const e of isi) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      const sub = ukuranFolder(p, kedalaman + 1);
      hasil.files += sub.files;
      hasil.bytes += sub.bytes;
    } else if (e.isFile()) {
      try {
        hasil.bytes += fs.statSync(p).size;
        hasil.files += 1;
      } catch {
        // berkas bisa hilang di tengah pemindaian; abaikan daripada gagal
      }
    }
  }
  return hasil;
}

function ukuranBerkas(p) {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
}

function ringkasDisk() {
  try {
    const s = fs.statfsSync(UPLOAD_ROOT);
    const total = Number(s.blocks) * Number(s.bsize);
    const bebas = Number(s.bavail) * Number(s.bsize);
    return { total, bebas, terpakai: total - bebas, persen: total ? Math.round(((total - bebas) / total) * 100) : 0 };
  } catch {
    // statfs tidak tersedia di semua platform/berkas sistem.
    return null;
  }
}

function ringkas() {
  const folder = [];
  let totalFiles = 0;
  let totalBytes = 0;
  let daftar = [];
  try {
    daftar = fs.readdirSync(UPLOAD_ROOT, { withFileTypes: true }).filter((e) => e.isDirectory());
  } catch {
    daftar = [];
  }
  for (const e of daftar) {
    const u = ukuranFolder(path.join(UPLOAD_ROOT, e.name));
    folder.push({ nama: e.name, label: LABEL_FOLDER[e.name] || e.name, ...u });
    totalFiles += u.files;
    totalBytes += u.bytes;
  }
  folder.sort((a, b) => b.bytes - a.bytes);

  const dbUtama = path.join(__dirname, '../siaga.db');
  const dbWal = `${dbUtama}-wal`;

  const bulanIni = `${todayWIB().slice(0, 7)}-01`;
  const galeri = db.prepare('SELECT COUNT(*) c, COALESCE(SUM(size_bytes),0) b FROM kegiatan_foto').get();
  const galeriBulanIni = db.prepare('SELECT COUNT(*) c FROM kegiatan_foto WHERE tanggal>=?').get(bulanIni).c;
  // Foto yang sudah diarsipkan hanya menyisakan thumbnail: size_bytes-nya 0,
  // jadi angka `bytes` di atas adalah ruang yang benar-benar terpakai sekarang.
  const diarsip = db.prepare('SELECT COUNT(*) c FROM kegiatan_foto WHERE diarsipkan=1').get().c;

  return {
    disk: ringkasDisk(),
    uploads: { files: totalFiles, bytes: totalBytes, folder },
    database: { utama: ukuranBerkas(dbUtama), wal: ukuranBerkas(dbWal) },
    backup: {
      folder: BACKUP_DIR,
      ada: fs.existsSync(BACKUP_DIR),
      ...ukuranFolder(BACKUP_DIR)
    },
    galeri: {
      foto: galeri.c,
      bytes: galeri.b,
      rata_rata: galeri.c ? Math.round(galeri.b / galeri.c) : 0,
      bulan_ini: galeriBulanIni,
      diarsip
    },
    waktu: new Date().toISOString()
  };
}

module.exports = { ringkas, ukuranFolder, UPLOAD_ROOT, BACKUP_DIR };
