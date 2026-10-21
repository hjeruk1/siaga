const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const suite = process.argv[2] || 'main';
const files =
  suite === 'workflow'
    ? ['scripts/workflow-regression.test.js']
    : [
        'scripts/test.js',
        'scripts/daily-record-v2.test.js',
        'scripts/adminview-stabilization.test.js',
        'scripts/export-absensi.test.js',
        'scripts/rekap-bulanan.test.js',
        'scripts/billing-money.test.js',
        'scripts/validation.test.js',
        'scripts/migration.test.js',
        'scripts/index-usage.test.js',
        'scripts/maintenance.test.js',
        'scripts/push.test.js',
        'scripts/wali-konfirmasi.test.js',
        'scripts/wa.test.js',
        'scripts/backup.test.js',
        'scripts/pin.test.js',
        'scripts/reset-password.test.js',
        'scripts/guru-lintas-cabang.test.js'
      ];
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'siaga-test-'));
const dbPath = path.join(tempDir, 'siaga.db');
const port = 4100 + Math.floor(Math.random() * 700);
const env = {
  ...process.env,
  DB_PATH: dbPath,
  NODE_ENV: 'test',
  JWT_SECRET: 'siaga-test-secret-change-me',
  ADMIN_PASSWORD: 'admin123',
  TEST_ADMIN_PASSWORD: 'admin123',
  TEST_URL: `http://127.0.0.1:${port}`,
  PORT: String(port),
  // Kunci uji bebas: push tidak benar-benar terkirim di tes, tapi jalur
  // registrasi subscription (200/503/400) tetap tervalidasi.
  VAPID_PUBLIC_KEY:
    process.env.VAPID_PUBLIC_KEY ||
    'BJ/8nTtK0WTf2b5gGgh7OnPQOKaaOGvRBcQMSGozLWJJQQpJ0tC1zWInAGVdBKKqOFYgCE1RNGUHPELLvGxDkI',
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || '8wqhxKfItgNLARI1ZmSNbAtUCyxOPUCzHX6xkafC3zY',
  VAPID_SUBJECT: 'mailto:test@localhost',
  // Kanal WhatsApp diuji dengan provider 'log': tidak ada jaringan, tapi
  // alur notifikasi -> antrean -> penandaan wa_sent_at tetap tervalidasi.
  WA_PROVIDER: 'log',
  WA_DELAY_MS: '0',
  WA_TIPE_AKTIF: 'daily_published,guru_reply,payment_verified,payment_rejected,invoice_issued',
  // Kode OTP ditulis ke berkas ini supaya tes bisa menyelesaikan alur pemulihan
  // password. Hanya diset di harness — server sungguhan tidak pernah menulis
  // kode OTP ke disk.
  OTP_DEBUG_FILE: path.join(tempDir, 'otp-debug.txt'),
  FRONTEND_URL: 'http://localhost:5173'
};

const initialized = spawnSync(process.execPath, ['backend/init.js'], {
  cwd: root,
  env,
  stdio: 'inherit'
});
if (initialized.status !== 0) process.exit(initialized.status || 1);

const server = spawn(process.execPath, ['backend/server.js'], {
  cwd: root,
  env,
  stdio: ['ignore', 'inherit', 'inherit']
});

let stopping = false;
function stopServer() {
  if (stopping) return;
  stopping = true;
  if (!server.killed) server.kill('SIGTERM');
}

async function waitForServer() {
  // Cold start di Windows (better-sqlite3 + WAL + antivirus) bisa jauh lebih lama
  // dari 8 detik, yang membuat suite flaky. Beri ruang lega, tetap bisa di-override.
  const timeoutMs = Number(process.env.TEST_SERVER_TIMEOUT_MS) || 60_000;
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Server test berhenti dengan code ${server.exitCode}`);
    try {
      const response = await fetch(`${env.TEST_URL}/api/health`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `Server test tidak siap dalam ${Math.round(timeoutMs / 1000)} detik (${lastError?.message || 'tanpa respons'})`
  );
}

(async () => {
  let exitCode = 1;
  try {
    await waitForServer();
    const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], {
      cwd: root,
      env,
      stdio: 'inherit'
    });
    exitCode = result.status || 0;
  } catch (error) {
    console.error(error.stack || error);
  } finally {
    stopServer();
    // Windows: better-sqlite3 can hold the DB handle briefly after the child
    // process dies, so a single rmSync loses the race with EBUSY.
    let cleaned = false;
    for (let attempt = 1; attempt <= 6 && !cleaned; attempt++) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
        cleaned = true;
      } catch (error) {
        if (attempt === 6) {
          console.error(`ERROR: gagal menghapus direktori test ${tempDir}: ${error.message}`);
          if (exitCode === 0) exitCode = 1;
        } else {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
        }
      }
    }
  }
  process.exit(exitCode);
})();

process.once('SIGINT', () => {
  stopServer();
  process.exit(130);
});
process.once('SIGTERM', () => {
  stopServer();
  process.exit(143);
});
