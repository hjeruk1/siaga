const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

// Resolve dotenv from backend node_modules and load backend/.env
const dotenv = require(path.join(__dirname, '../backend/node_modules/dotenv'));
dotenv.config({ path: path.join(__dirname, '../backend/.env') });

const db = require('../backend/db');
const Database = require(path.join(__dirname, '../backend/node_modules/better-sqlite3'));

const backupDir = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, '../backups'));
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

// Generate human-readable timestamp filename: YYYY-MM-DD-HHmmss
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const filename = `siaga-backup-${timestamp}.db`;
const dest = path.join(backupDir, filename);
const retentionCount = Math.max(1, Number(process.env.BACKUP_RETENTION_COUNT) || 30);

// Folder berkas unggahan pengguna: foto anak, lampiran daily record, dan —
// yang paling penting — FOTO BUKTI PEMBAYARAN. Berkas terakhir adalah bukti
// finansial: kalau hanya database yang dicadangkan, pasca-bencana datanya utuh
// tetapi bukti transfer orang tua hilang semua. Karena itu uploads ikut
// diarsipkan (lihat backupUploads()).
const uploadsDir = path.resolve(__dirname, '../backend/uploads');
const uploadsArchive = `siaga-uploads-${timestamp}.tar.gz`;
const uploadsDest = path.join(backupDir, uploadsArchive);

function verifyBackup() {
  fs.chmodSync(dest, 0o600);
  const checkDb = new Database(dest, { readonly: true, fileMustExist: true });
  try {
    const result = checkDb.pragma('integrity_check', { simple: true });
    if (result !== 'ok') throw new Error(`integrity_check gagal: ${result}`);
  } finally {
    checkDb.close();
    for (const suffix of ['-shm', '-wal']) {
      const sidecar = `${dest}${suffix}`;
      if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
    }
  }
}

/**
 * Retensi dihitung PER JENIS berkas: N cadangan database DAN N arsip unggahan.
 *
 * Sengaja tidak digabung. Kalau disatukan, arsip uploads (selalu dibuat
 * setelah database) akan dianggap "lebih baru" dan cadangan database justru
 * terpotong lebih dulu — hasilnya folder backup berisi tar tanpa db-nya.
 */
function enforceRetention() {
  const pola = [/^siaga-backup-.*\.db$/, /^siaga-uploads-.*\.tar\.gz$/];
  for (const regex of pola) {
    const files = fs
      .readdirSync(backupDir)
      .filter((name) => regex.test(name))
      .map((name) => ({ name, mtime: fs.statSync(path.join(backupDir, name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const old of files.slice(retentionCount)) {
      const oldPath = path.join(backupDir, old.name);
      fs.unlinkSync(oldPath);
      for (const suffix of ['-shm', '-wal']) {
        const sidecar = `${oldPath}${suffix}`;
        if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
      }
    }
  }
}

/**
 * Arsipkan folder uploads (foto anak, lampiran, bukti pembayaran).
 *
 * Catatan penting:
 * - Kegagalan di sini TIDAK membatalkan backup database. Database adalah data
 *   inti; kalau arsip uploads gagal, itu harus terlihat sebagai peringatan
 *   jelas ("upload gagal, database aman") alih-alih membuat seluruh backup
 *   dianggap gagal.
 * - tar keluar dengan kode 1 saat berkas berubah selama pengarsipan (orang tua
 *   sedang mengunggah bukti pembayaran saat backup berjalan). Arsipnya tetap
 *   layak dipakai, jadi kode 1 = peringatan, bukan kegagalan.
 */
function backupUploads() {
  if (!fs.existsSync(uploadsDir)) {
    console.log('[Backup Uploads] Folder uploads tidak ada, dilewati.');
    return Promise.resolve(false);
  }
  // TAR_BIN bisa di-override (mis. /usr/bin/tar di server) kalau `tar` di PATH
  // bukan GNU tar. --force-local dibutuhkan bsdtar (tar bawaan Windows): tanpanya
  // path "C:\\..." disangka host remote dan pengarsipan gagal. Di GNU tar
  // opsi ini diabaikan, jadi aman dipakai di kedua platform.
  const tarBin = process.env.TAR_BIN || 'tar';
  const tar = spawnSync(tarBin, ['--force-local', '-czf', uploadsDest, '-C', uploadsDir, '.'], {
    encoding: 'utf8'
  });
  const size = fs.existsSync(uploadsDest) ? fs.statSync(uploadsDest).size : 0;
  if (tar.status === 0) {
    fs.chmodSync(uploadsDest, 0o600);
    console.log(`[Backup Uploads] Sukses: ${uploadsArchive} (${(size / 1024 / 1024).toFixed(1)} MB).`);
    return Promise.resolve(true);
  }
  if (tar.status === 1 && size > 0) {
    console.warn(
      `[Backup Uploads] SELESAI DENGAN PERINGATAN (berkas berubah saat diarsipkan): ${uploadsArchive} (${(size / 1024 / 1024).toFixed(1)} MB).`
    );
    return Promise.resolve(true);
  }
  console.error(
    '[Backup Uploads] GAGAL mengarsipkan uploads:',
    (tar.stderr || (tar.error && tar.error.message) || 'tar tidak tersedia').slice(0, 200)
  );
  console.error('[Backup Uploads] Backup database tetap valid, TAPI foto/bukti pembayaran TIDAK tercadangkan.');
  return Promise.resolve(false);
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

async function uploadToGcs(filePath, bucketName, keyFilePath, objectName, contentType) {
  const credentials = JSON.parse(fs.readFileSync(keyFilePath, 'utf8'));
  if (!credentials.client_email || !credentials.private_key) throw new Error('Service account GCS tidak valid');
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      iss: credentials.client_email,
      scope: 'https://www.googleapis.com/auth/devstorage.read_write',
      aud: credentials.token_uri || 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600
    })
  );
  const unsigned = `${header}.${payload}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), credentials.private_key).toString('base64url');
  const assertion = `${unsigned}.${signature}`;
  const tokenResponse = await fetch(credentials.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });
  if (!tokenResponse.ok) throw new Error(`OAuth GCS gagal (${tokenResponse.status})`);
  const token = await tokenResponse.json();
  const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucketName)}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      'Content-Type': contentType || 'application/x-sqlite3'
    },
    body: fs.createReadStream(filePath),
    duplex: 'half'
  });
  if (!uploadResponse.ok)
    throw new Error(`Upload GCS gagal (${uploadResponse.status}): ${(await uploadResponse.text()).slice(0, 300)}`);
}

console.log(`\n[Backup] Memulai pencadangan database online...`);
console.log(`[Backup] File tujuan lokal: ${dest}`);

db.backup(dest)
  .then(async () => {
    verifyBackup();
    enforceRetention();
    console.log(`[Backup] Sukses! Cadangan database lokal berhasil dibuat.`);

    // Berkas unggahan (foto anak + bukti pembayaran) dicadangkan terpisah.
    // Kegagalan di sini tidak membatalkan backup database.
    const uploadsOk = await backupUploads();
    enforceRetention();

    // GCS upload flow
    const bucketName = process.env.GCS_BUCKET_NAME;
    const keyFilePath = process.env.GCS_KEY_FILE_PATH;

    if (!bucketName || !keyFilePath) {
      console.log('[Backup Cloud] Konfigurasi GCS tidak lengkap (GCS_BUCKET_NAME atau GCS_KEY_FILE_PATH kosong).');
      console.log('[Backup Cloud] Upload ke cloud dilewati. Backup lokal selesai.\n');
      // Kode 0: backup LOKAL (database + arsip) berhasil; GCS hanya opsional.
      process.exit(0);
    }

    let resolvedKeyPath = keyFilePath;
    if (!path.isAbsolute(keyFilePath)) {
      resolvedKeyPath = path.resolve(__dirname, '../backend', keyFilePath);
    }

    if (!fs.existsSync(resolvedKeyPath)) {
      console.error(`[Backup GCS] File key JSON GCS tidak ditemukan di: ${resolvedKeyPath}`);
      console.log(`[Backup GCS] Backup lokal tetap tersimpan di: ${dest}\n`);
      process.exit(1);
    }

    console.log(`[Backup GCS] Mengunggah file ke Google Cloud Storage...`);
    console.log(`[Backup GCS] Bucket: ${bucketName}`);
    console.log(`[Backup GCS] File tujuan cloud: backups/${filename}`);
    if (uploadsOk) console.log(`[Backup GCS] File unggahan: backups/${uploadsArchive}`);

    // Database dulu (data inti), baru arsip uploads. Kegagalan mengunggah
    // arsip tidak boleh menghapus fakta bahwa database sudah aman di cloud.
    const unggahDb = () =>
      uploadToGcs(dest, bucketName, resolvedKeyPath, `backups/${filename}`, 'application/x-sqlite3');
    const unggahUploads = () =>
      uploadToGcs(uploadsDest, bucketName, resolvedKeyPath, `backups/${uploadsArchive}`, 'application/gzip');

    try {
      await unggahDb();
      console.log(`[Backup GCS] Sukses! Database terunggah ke cloud.`);
      if (uploadsOk) {
        try {
          await unggahUploads();
          console.log(`[Backup GCS] Sukses! Arsip unggahan terunggah ke cloud.\n`);
        } catch (e2) {
          console.error('[Backup GCS] GAGAL mengunggah arsip unggahan:', e2.message || e2);
          console.error('[Backup GCS] Database aman di cloud, TAPI foto/bukti pembayaran belum.\n');
          process.exit(1);
        }
      }
      process.exit(0);
    } catch (uploadErr) {
      console.error(`[Backup GCS] GAGAL mengunggah database ke GCS:`, uploadErr.message || uploadErr);
      console.log(`[Backup GCS] Backup lokal tetap tersimpan di: ${dest}\n`);
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error(`[Backup] GAGAL membuat backup lokal:`, err);
    process.exit(1);
  });
