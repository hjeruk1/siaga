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
  let sw = fs.readFileSync(swPath, 'utf8');

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

  sw = sw.replace(/__SIAGA_BUILD__/g, stamp);

  // Daftar aset build (JS/CSS ber-hash) ikut di-precache. Tanpa ini hanya
  // index.html yang tersimpan: saat pengguna yang baru pertama kali datang
  // kehilangan sinyal, halaman tampil tapi React tidak pernah bootstrap
  // (JS/CSS belum sempat masuk cache) — layar kosong saat dipakai offline.
  const assetsDir = path.join(distDir, 'assets');
  const shellAssets = [];
  if (fs.existsSync(assetsDir)) {
    for (const f of fs.readdirSync(assetsDir)) {
      if (/\.(js|css)$/.test(f)) shellAssets.push(`/assets/${f}`);
    }
  }
  if (shellAssets.length) {
    sw = sw.replace(
      /const SHELL_ASSETS = \[\];/,
      `const SHELL_ASSETS = [\n${shellAssets.map((a) => `  '${a}'`).join(',\n')}\n];`
    );
    console.log(`[build] precache shell: ${shellAssets.length} aset`);
  }

  fs.writeFileSync(swPath, sw);
  console.log(`[build] service worker cache: siaga-cache-${stamp}`);
}
