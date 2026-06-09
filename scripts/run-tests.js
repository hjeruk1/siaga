const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const suite = process.argv[2] || 'main';
const files = suite === 'workflow'
  ? ['scripts/workflow-regression.test.js']
  : [
      'scripts/test.js',
      'scripts/daily-record-v2.test.js',
      'scripts/adminview-stabilization.test.js',
      'scripts/export-absensi.test.js'
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
  PORT: String(port)
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
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) throw new Error(`Server test berhenti dengan code ${server.exitCode}`);
    try {
      const response = await fetch(`${env.TEST_URL}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Server test tidak siap dalam 8 detik');
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
    fs.rmSync(tempDir, { recursive: true, force: true });
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
