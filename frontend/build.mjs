import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

// Konfigurasi (plugin, preview) ada di vite.config.js.
// Vite memuatnya otomatis karena root diarahkan ke direktori ini.
await build({
  root: fileURLToPath(new URL('.', import.meta.url))
});

// Beri setiap build nama cache sendiri.
//
// public/sw.js memuat placeholder __SIAGA_BUILD__. Handler `activate` hanya
// menghapus cache yang bernama BERBEDA, jadi tanpa versi baru cache build lama
// tidak pernah dibersihkan — dan karena nama berkas di /assets/ sudah ber-hash,
// setiap build menambah berkas baru sementara yang lama tersimpan selamanya di
// browser pengguna.
const distDir = path.join(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const swPath = path.join(distDir, 'sw.js');

if (fs.existsSync(swPath)) {
  const sw = fs.readFileSync(swPath, 'utf8');

  // Commit hash lebih bermakna daripada timestamp saat menelusuri laporan
  // pengguna; timestamp dipakai bila git tidak tersedia.
  let stamp = '';
  try {
    stamp = execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {}
  if (!stamp) stamp = new Date().toISOString().replace(/[:.]/g, '-');

  fs.writeFileSync(swPath, sw.replace(/__SIAGA_BUILD__/g, stamp));
  console.log(`[build] service worker cache: siaga-cache-${stamp}`);
}
