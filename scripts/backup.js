const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

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
const pad = n => String(n).padStart(2, '0');
const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const filename = `siaga-backup-${timestamp}.db`;
const dest = path.join(backupDir, filename);
const retentionCount = Math.max(1, Number(process.env.BACKUP_RETENTION_COUNT) || 30);

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

function enforceRetention() {
  const files = fs.readdirSync(backupDir)
    .filter(name => /^siaga-backup-.*\.db$/.test(name))
    .map(name => ({ name, mtime: fs.statSync(path.join(backupDir, name)).mtimeMs }))
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

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

async function uploadToGcs(filePath, bucketName, keyFilePath, objectName) {
  const credentials = JSON.parse(fs.readFileSync(keyFilePath, 'utf8'));
  if (!credentials.client_email || !credentials.private_key) throw new Error('Service account GCS tidak valid');
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/devstorage.read_write',
    aud: credentials.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }));
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
      'Content-Type': 'application/x-sqlite3'
    },
    body: fs.createReadStream(filePath),
    duplex: 'half'
  });
  if (!uploadResponse.ok) throw new Error(`Upload GCS gagal (${uploadResponse.status}): ${(await uploadResponse.text()).slice(0, 300)}`);
}

console.log(`\n[Backup] Memulai pencadangan database online...`);
console.log(`[Backup] File tujuan lokal: ${dest}`);

db.backup(dest)
  .then(() => {
    verifyBackup();
    enforceRetention();
    console.log(`[Backup] Sukses! Cadangan database lokal berhasil dibuat.`);
    
    // GCS upload flow
    const bucketName = process.env.GCS_BUCKET_NAME;
    const keyFilePath = process.env.GCS_KEY_FILE_PATH;

    if (!bucketName || !keyFilePath) {
      console.log(`[Backup Cloud] Konfigurasi GCS tidak lengkap (GCS_BUCKET_NAME atau GCS_KEY_FILE_PATH kosong).`);
      console.log(`[Backup Cloud] Upload ke cloud dilewati. Backup lokal selesai.\n`);
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

    try {
      uploadToGcs(dest, bucketName, resolvedKeyPath, `backups/${filename}`)
      .then(() => {
        console.log(`[Backup GCS] Sukses! File database berhasil diunggah ke Google Cloud Storage.\n`);
        process.exit(0);
      })
      .catch(uploadErr => {
        console.error(`[Backup GCS] GAGAL mengunggah ke GCS:`, uploadErr.message || uploadErr);
        console.log(`[Backup GCS] Backup lokal tetap tersimpan di: ${dest}\n`);
        process.exit(1);
      });
    } catch (err) {
      console.error(`[Backup GCS] GAGAL inisialisasi client GCS:`, err.message || err);
      console.log(`[Backup GCS] Backup lokal tetap tersimpan di: ${dest}\n`);
      process.exit(1);
    }
  })
  .catch(err => {
    console.error(`[Backup] GAGAL membuat backup lokal:`, err);
    process.exit(1);
  });
