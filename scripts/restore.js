#!/usr/bin/env node
// Restore cadangan SIAGA (database + folder uploads).
//
// Kenapa alat terpisah, bukan sekadar "copy file": restore adalah operasi yang
// paling mudah menghapus data hidup. Karena itu aturannya dibuat eksplisit:
//
// 1. TANPA `--apply` hanya memeriksa (dry-run). Perintah default tidak menulis
//    apa pun — salah ketik tidak langsung menimpa database produksi.
// 2. Cadangan diverifikasi LEBIH DULU: integrity_check SQLite dan gzip arsip
//    uploads. Cadangan rusak ditolak sebelum ada berkas yang disentuh.
// 3. Database yang sedang dipakai SELALU disalin ke
//    `<db>.pre-restore-<waktu>` sebelum ditimpa. Kalau cadangan ternyata bukan
//    yang dimaksud, masih ada jalan kembali.
// 4. Folder uploads lama TIDAK dihapus, hanya diganti nama menjadi
//    `<uploads>.pre-restore-<waktu>`. Foto anak dan bukti pembayaran bukan
//    berkas yang boleh hilang karena salah pilih arsip.
//
// Pemakaian:
//   node scripts/restore.js --list
//   node scripts/restore.js --from ./backups                 (periksa saja)
//   node scripts/restore.js --from ./backups --apply         (pulihkan)
//   node scripts/restore.js --db ./backups/siaga-backup-....db \
//                           --uploads ./backups/siaga-uploads-....tar.gz --apply
//   node scripts/restore.js --from ./backups --apply --db-path /tmp/uji.db
//
// Opsi:
//   --from <dir>        folder cadangan (default: BACKUP_DIR atau ./backups)
//   --db <file>         berkas database cadangan tertentu
//   --uploads <file>    arsip uploads tertentu
//   --db-path <file>    database tujuan (default: DB_PATH atau backend/siaga.db)
//   --uploads-dir <dir> folder uploads tujuan (default: backend/uploads)
//   --apply             benar-benar menulis (tanpa ini = dry-run)
//   --list              tampilkan pasangan cadangan yang tersedia
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const Database = require(path.join(__dirname, '../backend/node_modules/better-sqlite3'));

// Baca backend/.env seperti scripts/backup.js: kalau DB_PATH atau BACKUP_DIR
// diatur di sana, restore harus memakai nilai yang SAMA dengan aplikasi —
// bukan menebak backend/siaga.db lalu memulihkan ke berkas yang salah.
require(path.join(__dirname, '../backend/node_modules/dotenv')).config({
  path: path.join(__dirname, '../backend/.env')
});

const AKAR = path.resolve(__dirname, '..');
const TAR_BIN = process.env.TAR_BIN || 'tar';

function arg(nama, bawaan = null) {
  const i = process.argv.indexOf(`--${nama}`);
  if (i === -1) return bawaan;
  const nilai = process.argv[i + 1];
  if (!nilai || nilai.startsWith('--')) return true; // flag tanpa nilai
  return nilai;
}
const adaFlag = (nama) => process.argv.includes(`--${nama}`);

const APPLY = adaFlag('apply');
const LIST = adaFlag('list');
const backupDir = path.resolve(String(arg('from', process.env.BACKUP_DIR || path.join(AKAR, 'backups'))));
const targetDb = path.resolve(String(arg('db-path', process.env.DB_PATH || path.join(AKAR, 'backend/siaga.db'))));
const uploadsDir = path.resolve(String(arg('uploads-dir', path.join(AKAR, 'backend/uploads'))));

function stempel() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function ukuranMB(byte) {
  return `${(byte / 1024 / 1024).toFixed(1)} MB`;
}

function daftarCadangan(dir) {
  if (!fs.existsSync(dir)) return { db: [], uploads: [] };
  const nama = fs.readdirSync(dir);
  return {
    db: nama
      .filter((n) => /^siaga-backup-.*\.db$/.test(n))
      .map((n) => ({ nama: n, waktu: fs.statSync(path.join(dir, n)).mtimeMs }))
      .sort((a, b) => b.waktu - a.waktu),
    uploads: nama
      .filter((n) => /^siaga-uploads-.*\.tar\.gz$/.test(n))
      .map((n) => ({ nama: n, waktu: fs.statSync(path.join(dir, n)).mtimeMs }))
      .sort((a, b) => b.waktu - a.waktu)
  };
}

// Stempel waktu ada di nama berkas: siaga-backup-2026-10-21-091500.db
function stempelDariNama(nama) {
  const m = String(nama).match(/(\d{4}-\d{2}-\d{2}-\d{6})/);
  return m ? m[1] : null;
}

function pilihPasangan(dir) {
  const { db, uploads } = daftarCadangan(dir);
  if (!db.length) return { db: null, uploads: null };
  const terbaru = db[0];
  const st = stempelDariNama(terbaru.nama);
  // Utamakan arsip uploads dari BACKUP YANG SAMA. Kalau tidak ada, pakai yang
  // terbaru — dengan peringatan, karena isinya bisa beda hari.
  const pasangan = uploads.find((u) => stempelDariNama(u.nama) === st) || uploads[0] || null;
  return {
    db: terbaru.nama,
    uploads: pasangan ? pasangan.nama : null,
    cocok: pasangan ? stempelDariNama(pasangan.nama) === st : false
  };
}

function periksaSqlite(berkas) {
  const hasil = { berkas, ok: false, tabel: 0, baris: 0, ukuran: 0, pesan: '' };
  if (!fs.existsSync(berkas)) {
    hasil.pesan = 'berkas tidak ditemukan';
    return hasil;
  }
  hasil.ukuran = fs.statSync(berkas).size;
  let db;
  try {
    db = new Database(berkas, { readonly: true, fileMustExist: true });
    const integritas = db.pragma('integrity_check', { simple: true });
    if (integritas !== 'ok') {
      hasil.pesan = `integrity_check: ${integritas}`;
      return hasil;
    }
    const tabel = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
    hasil.tabel = tabel.length;
    // Hitung baris tabel inti sebagai bukti isinya benar-benar ada — database
    // kosong tetap lolos integrity_check, dan itu justru kasus paling berbahaya.
    for (const t of ['pengguna', 'siswa', 'absensi']) {
      if (!tabel.some((x) => x.name === t)) continue;
      hasil.baris += db.prepare(`SELECT COUNT(*) c FROM "${t}"`).get().c;
    }
    hasil.ok = true;
    return hasil;
  } catch (e) {
    hasil.pesan = e.message;
    return hasil;
  } finally {
    if (db) db.close();
  }
}

function periksaTar(berkas) {
  const hasil = { berkas, ok: false, berkas_di_dalam: 0, ukuran: 0, pesan: '' };
  if (!fs.existsSync(berkas)) {
    hasil.pesan = 'berkas tidak ditemukan';
    return hasil;
  }
  hasil.ukuran = fs.statSync(berkas).size;
  const r = spawnSync(TAR_BIN, ['--force-local', '-tzf', berkas], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    hasil.pesan = (r.stderr || (r.error && r.error.message) || 'tar gagal').slice(0, 200);
    return hasil;
  }
  hasil.berkas_di_dalam = String(r.stdout || '')
    .split('\n')
    .filter((x) => x.trim() && !x.endsWith('/')).length;
  hasil.ok = true;
  return hasil;
}

function salinanPengaman(berkas, label) {
  if (!fs.existsSync(berkas)) return null;
  const tujuan = `${berkas}.${label}-${stempel()}`;
  fs.copyFileSync(berkas, tujuan);
  return tujuan;
}

// Salin ke berkas sementara DULU, verifikasi, baru tukar. Kalau penyalinan
// gagal di tengah (disk penuh, izin), database aktif belum tersentuh.
function pasangDatabase(sumber, tujuan) {
  fs.mkdirSync(path.dirname(tujuan), { recursive: true });
  const tmp = `${tujuan}.restore-tmp-${stempel()}`;
  fs.copyFileSync(sumber, tmp);
  const cek = periksaSqlite(tmp);
  if (!cek.ok) {
    fs.unlinkSync(tmp);
    throw new Error(`salinan sementara tidak lolos verifikasi (${cek.pesan})`);
  }

  const pengaman = salinanPengaman(tujuan, 'pre-restore');
  // -wal/-shm milik database LAMA: kalau tertinggal, SQLite bisa memakai ulang
  // jurnal lama di atas berkas baru dan hasilnya rusak/kacau.
  for (const akhiran of ['-wal', '-shm']) {
    const s = `${tujuan}${akhiran}`;
    if (fs.existsSync(s)) fs.unlinkSync(s);
  }
  // rename menimpa berkas tujuan; di Windows harus dihapus lebih dulu.
  if (fs.existsSync(tujuan)) fs.unlinkSync(tujuan);
  fs.renameSync(tmp, tujuan);
  return pengaman;
}

// Ekstrak ke folder sementara LEBIH DULU, baru tukar folder. Kalau arsipnya
// rusak di tengah jalan, folder uploads yang sedang dipakai tidak tersentuh.
//
// `cwd` dipakai, bukan `-C`: bsdtar di Windows mengacaukan path yang
// mengandung "\\r" (mis. folder bernama "restore-test") sehingga ekstraksi
// gagal — dan pada versi pertama skrip ini kegagalan itu terjadi SETELAH
// database ditimpa, menyisakan sistem setengah pulih.
function ekstrakUploads(arsip) {
  const tmp = `${uploadsDir}.restore-tmp-${stempel()}`;
  fs.mkdirSync(tmp, { recursive: true });
  const r = spawnSync(TAR_BIN, ['--force-local', '-xzf', arsip], { cwd: tmp, encoding: 'utf8' });
  if (r.status !== 0) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw new Error((r.stderr || (r.error && r.error.message) || 'tar gagal mengekstrak').slice(0, 300));
  }
  const jumlah = hitungBerkas(tmp);
  if (!jumlah) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw new Error('arsip uploads tidak berisi berkas apa pun');
  }
  return { tmp, jumlah };
}

function tukarUploads(tmp) {
  let lama = null;
  if (fs.existsSync(uploadsDir) && fs.readdirSync(uploadsDir).length) {
    lama = `${uploadsDir}.pre-restore-${stempel()}`;
    fs.renameSync(uploadsDir, lama);
  }
  fs.mkdirSync(uploadsDir, { recursive: true });
  for (const e of fs.readdirSync(tmp)) {
    fs.renameSync(path.join(tmp, e), path.join(uploadsDir, e));
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  return lama;
}

function hitungBerkas(dir) {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  const telusuri = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) telusuri(path.join(d, e.name));
      else n += 1;
    }
  };
  telusuri(dir);
  return n;
}

// ---------------------------------------------------------------------------
if (LIST) {
  const { db, uploads } = daftarCadangan(backupDir);
  console.log(`\nFolder cadangan: ${backupDir}`);
  if (!db.length) {
    console.log('Tidak ada cadangan database ditemukan.\n');
    process.exit(0);
  }
  console.log(`\n${'Database'.padEnd(44)} ${'Ukuran'.padStart(10)}   Arsip uploads`);
  for (const d of db) {
    const st = stempelDariNama(d.nama);
    const u = uploads.find((x) => stempelDariNama(x.nama) === st);
    const ukuran = ukuranMB(fs.statSync(path.join(backupDir, d.nama)).size);
    console.log(`${d.nama.padEnd(44)} ${ukuran.padStart(10)}   ${u ? u.nama : '(tidak ada)'}`);
  }
  console.log('');
  process.exit(0);
}

const dbArg = arg('db', null);
const uploadsArg = arg('uploads', null);
let sumberDb;
let sumberUploads;

if (dbArg) {
  sumberDb = path.resolve(String(dbArg));
  sumberUploads = uploadsArg ? path.resolve(String(uploadsArg)) : null;
} else {
  const p = pilihPasangan(backupDir);
  if (!p.db) {
    console.error(`\n[Restore] Tidak ada cadangan database di ${backupDir}`);
    console.error('[Restore] Tentukan sendiri dengan --db <berkas>, atau jalankan backup dulu.\n');
    process.exit(2);
  }
  sumberDb = path.join(backupDir, p.db);
  sumberUploads = p.uploads ? path.join(backupDir, p.uploads) : null;
  console.log(`\n[Restore] Cadangan terpilih: ${p.db}`);
  if (p.uploads) {
    console.log(
      `[Restore] Arsip uploads    : ${p.uploads}${p.cocok === false ? '  (PERINGATAN: stempel waktu berbeda)' : ''}`
    );
  } else {
    console.log('[Restore] Arsip uploads    : (tidak ada — foto & bukti bayar tidak akan dipulihkan)');
  }
}

console.log(`[Restore] Database tujuan  : ${targetDb}`);
console.log(`[Restore] Folder uploads   : ${uploadsDir}`);
console.log(`[Restore] Mode             : ${APPLY ? 'APPLY (menulis)' : 'DRY-RUN (hanya memeriksa)'}\n`);

// 1. Verifikasi cadangan SEBELUM menyentuh apa pun.
const cekDb = periksaSqlite(sumberDb);
if (!cekDb.ok) {
  console.error(`[Restore] GAGAL: cadangan database tidak layak dipakai (${cekDb.pesan})`);
  console.error('[Restore] Tidak ada berkas yang diubah.\n');
  process.exit(1);
}
console.log(
  `[Verifikasi] Database cadangan: OK — ${cekDb.tabel} tabel, ${cekDb.baris} baris inti, ${ukuranMB(cekDb.ukuran)}`
);

let cekUploads = null;
if (sumberUploads) {
  cekUploads = periksaTar(sumberUploads);
  if (!cekUploads.ok) {
    console.error(`[Restore] GAGAL: arsip uploads rusak (${cekUploads.pesan})`);
    console.error(
      '[Restore] Tidak ada berkas yang diubah. Perbaiki arsipnya atau pulihkan database saja dengan --uploads kosong.\n'
    );
    process.exit(1);
  }
  console.log(
    `[Verifikasi] Arsip uploads   : OK — ${cekUploads.berkas_di_dalam} berkas, ${ukuranMB(cekUploads.ukuran)}`
  );
}

// 2. Bandingkan dengan kondisi sekarang, supaya terlihat apa yang akan hilang.
const cekTujuan = fs.existsSync(targetDb) ? periksaSqlite(targetDb) : null;
if (cekTujuan?.ok) {
  console.log(`[Sekarang]   Database aktif  : ${cekTujuan.tabel} tabel, ${cekTujuan.baris} baris inti`);
} else {
  console.log('[Sekarang]   Database aktif  : (belum ada / tidak terbaca)');
}
console.log(`[Sekarang]   Berkas uploads  : ${hitungBerkas(uploadsDir)} berkas\n`);

if (!APPLY) {
  console.log('[Restore] DRY-RUN selesai. Tidak ada yang diubah.');
  console.log('[Restore] Jalankan ulang dengan --apply untuk benar-benar memulihkan.\n');
  process.exit(0);
}

// 3. Eksekusi. Urutannya disengaja: pekerjaan yang BISA gagal (ekstraksi arsip)
// dikerjakan lebih dulu, baru database ditukar. Versi pertama skrip ini
// menukar database dulu lalu mengekstrak arsip, sehingga satu kegagalan tar
// meninggalkan sistem setengah pulih: data lama hilang, foto belum kembali.
let siapUploads = null;
try {
  if (sumberUploads) siapUploads = ekstrakUploads(sumberUploads);
} catch (e) {
  console.error(`[Restore] GAGAL menyiapkan uploads: ${e.message}`);
  console.error('[Restore] Tidak ada berkas aktif yang diubah.\n');
  process.exit(1);
}

let pengamanDb = null;
try {
  pengamanDb = pasangDatabase(sumberDb, targetDb);
  console.log(`[Restore] Database dipulihkan.${pengamanDb ? ` Salinan lama: ${path.basename(pengamanDb)}` : ''}`);

  if (siapUploads) {
    const lama = tukarUploads(siapUploads.tmp);
    console.log(
      `[Restore] Uploads dipulihkan: ${hitungBerkas(uploadsDir)} berkas.${lama ? ` Folder lama: ${path.basename(lama)}` : ''}`
    );
  }

  // 4. Verifikasi hasil, bukan sekadar "perintahnya selesai".
  const hasil = periksaSqlite(targetDb);
  if (!hasil.ok) {
    console.error(`[Restore] GAGAL memverifikasi hasil restore: ${hasil.pesan}`);
    console.error('[Restore] Gunakan salinan pre-restore di atas untuk kembali.\n');
    process.exit(1);
  }
  console.log(`[Restore] Verifikasi akhir: OK — ${hasil.tabel} tabel, ${hasil.baris} baris inti.\n`);
  console.log('[Restore] Selesai. JANGAN lupa: hentikan lalu jalankan ulang layanan backend');
  console.log('[Restore] (systemctl restart siaga) agar proses lama tidak memakai berkas lama.\n');
  process.exit(0);
} catch (e) {
  console.error(`[Restore] GAGAL saat memulihkan: ${e.message}`);
  console.error('[Restore] Periksa salinan pre-restore sebelum mencoba lagi.\n');
  process.exit(1);
}
