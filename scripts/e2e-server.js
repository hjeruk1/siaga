// Server untuk uji E2E.
//
// Kenapa server terpisah, bukan `npm run dev`: uji ini harus memakai build
// produksi (frontend/dist) yang benar-benar dikirim ke sekolah, bukan dev
// server Vite yang memuat modul satu per satu. Dua bug nyata — tautan PDF 401
// dan modal Billing yang selalu terbuka — hanya muncul di build produksi.
//
// Database-nya sementara dan selalu dibuat ulang, jadi uji tidak pernah
// menyentuh data sekolah.
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, '.e2e');
const dbPath = path.join(dataDir, 'siaga.db');
const port = process.env.E2E_PORT || '4199';

fs.rmSync(dataDir, { recursive: true, force: true });
fs.mkdirSync(dataDir, { recursive: true });

// init dijalankan sebagai proses terpisah dengan NODE_ENV=test supaya
// pengaman "jangan reset database produksi" tidak menahan pembuatan data demo.
const envInit = {
  ...process.env,
  NODE_ENV: 'test',
  DB_PATH: dbPath,
  ADMIN_PASSWORD: 'admin123',
  RESET_DATABASE_CONFIRM: 'HAPUS_DATABASE_SIAGA'
};
const init = spawnSync(process.execPath, ['backend/init.js'], { cwd: root, env: envInit, stdio: 'inherit' });
if (init.status !== 0) {
  console.error('[e2e] gagal menyiapkan database uji');
  process.exit(init.status || 1);
}

// Migrasi dijalankan SEBELUM seeder: seeder menulis ke kolom yang dibuat
// migrasi (mis. tagihan.jatuh_tempo), sedangkan server baru menjalankan
// migrasi saat ia start — sudah terlambat untuk seeding.
const migrate = spawnSync(process.execPath, ['backend/migrate.js'], { cwd: root, env: envInit, stdio: 'inherit' });
if (migrate.status !== 0) {
  console.error('[e2e] gagal menjalankan migrasi database uji');
  process.exit(migrate.status || 1);
}

// init.js hanya membuat master data + admin; peran guru/wali dan tagihan
// contoh dibuat oleh seeder supaya uji bisa menguji alur nyata.
const seed = spawnSync(process.execPath, ['scripts/e2e-seed.js'], { cwd: root, env: envInit, stdio: 'inherit' });
if (seed.status !== 0) {
  console.error('[e2e] gagal menyiapkan data uji');
  process.exit(seed.status || 1);
}

// Server berjalan seperti di produksi: menyajikan dist, cookie Secure, CORS
// ketat. Kalau ada yang rusak di mode ini, uji harus menangkapnya.
Object.assign(process.env, {
  NODE_ENV: 'production',
  DB_PATH: dbPath,
  PORT: port,
  JWT_SECRET: process.env.E2E_JWT_SECRET || 'e2e-jwt-secret-bukan-untuk-produksi',
  ADMIN_PASSWORD: 'admin123',
  FRONTEND_URL: `http://127.0.0.1:${port}`,
  // Kanal luar dimatikan: uji tidak boleh mengirim WhatsApp atau push.
  WA_PROVIDER: 'log',
  WA_DELAY_MS: '0',
  WA_MONITOR: 'off',
  PENGINGAT: 'off',
  RATE_LIMIT_MAX: '100000'
});

require(path.join(root, 'backend/server.js'));
