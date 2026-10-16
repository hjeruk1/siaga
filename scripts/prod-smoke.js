// Smoke test mode production: memverifikasi SPA fallback Express 5 dan route API.
// Dijalankan manual, bukan bagian dari suite CI. Lihat docs/siaga-improvement-plan.md Fase 2.1.
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync, spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'siaga-prod-smoke-'));
const port = 4598;
const base = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  DB_PATH: path.join(tmp, 'siaga.db'),
  NODE_ENV: 'production',
  JWT_SECRET: 'test-secret-at-least-32-characters-long',
  ADMIN_PASSWORD: 'admin123',
  RESET_DATABASE_CONFIRM: 'HAPUS_DATABASE_SIAGA',
  FRONTEND_URL: base,
  PORT: String(port)
};

const init = spawnSync(process.execPath, ['backend/init.js'], { cwd: root, env, stdio: 'ignore' });
if (init.status !== 0) {
  console.error('init gagal');
  process.exit(1);
}

const server = spawn(process.execPath, ['backend/server.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
server.stdout.on('data', (d) => (log += d));
server.stderr.on('data', (d) => (log += d));

async function waitReady() {
  for (let i = 0; i < 300; i++) {
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server tidak siap');
}

const results = [];
async function check(label, p, opts) {
  const r = await fetch(base + p, opts);
  const ct = (r.headers.get('content-type') || '').split(';')[0];
  results.push({ label, status: r.status, ct });
  console.log(`${label.padEnd(24)} ${String(r.status).padEnd(4)} ${ct}`);
}

function assert(label, cond) {
  if (!cond) {
    console.error(`GAGAL: ${label}`);
    return false;
  }
  return true;
}

(async () => {
  let ok = true;
  try {
    await waitReady();
    await check('GET /', '/');
    await check('GET /some/spa/route', '/some/spa/route');
    await check('GET /api/health', '/api/health');
    await check('GET /api/health/ready', '/api/health/ready');
    await check('GET /api/nonexistent', '/api/nonexistent');
    await check('POST /api/auth/login', '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });

    const by = (l) => results.find((r) => r.label === l);
    ok = assert('GET / harus HTML', by('GET /')?.ct === 'text/html') && ok;
    ok = assert('SPA route harus HTML', by('GET /some/spa/route')?.ct === 'text/html') && ok;
    ok = assert('SPA route harus 200', by('GET /some/spa/route')?.status === 200) && ok;
    ok = assert('/api/health harus JSON 200', by('GET /api/health')?.ct === 'application/json') && ok;
    ok = assert('readiness harus 200', by('GET /api/health/ready')?.status === 200) && ok;
    ok = assert('/api/nonexistent harus 404 (bukan HTML)', by('GET /api/nonexistent')?.status === 404) && ok;
    // Di production admin dibuat dengan status 'undangan' + must_change_password,
    // jadi 403 PASSWORD_CHANGE_REQUIRED juga sah untuk kredensial yang benar.
    ok = assert('login harus 200/403', [200, 403].includes(by('POST /api/auth/login')?.status)) && ok;
  } catch (e) {
    console.error('SMOKE ERROR:', e.message);
    ok = false;
  } finally {
    server.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 400));
    try {
      fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 });
    } catch {}
    console.log(ok ? '\nSMOKE: SEMUA LULUS' : '\nSMOKE: ADA YANG GAGAL');
    if (!ok && log) console.error('--- server log ---\n' + log);
    process.exit(ok ? 0 : 1);
  }
})();
