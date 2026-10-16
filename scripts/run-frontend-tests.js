// Menjalankan test unit frontend (Node test runner).
//
// Dipakai script terpisah, bukan langsung `node --test <glob>`, karena pola glob
// harus dikutip agar tidak diperluas shell — dan aturan quoting berbeda antara
// cmd.exe (Windows) dan sh (Linux/macOS). Mencari berkasnya di sini menghindari
// masalah itu sekaligus memberi pesan jelas bila tidak ada test yang ditemukan.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const searchRoot = path.join(root, 'frontend', 'src');
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);

function findTests(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      findTests(path.join(dir, entry.name), found);
    } else if (entry.name.endsWith('.test.js')) {
      found.push(path.join(dir, entry.name));
    }
  }
  return found;
}

if (!fs.existsSync(searchRoot)) {
  console.error(`Direktori tidak ditemukan: ${searchRoot}`);
  process.exit(1);
}

const files = findTests(searchRoot).sort();
if (!files.length) {
  console.error(`Tidak ada berkas *.test.js di ${searchRoot}`);
  process.exit(1);
}

console.log(`Menjalankan ${files.length} berkas test frontend:\n`);
for (const file of files) console.log(`  - ${path.relative(root, file)}`);
console.log('');

const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], {
  cwd: root,
  stdio: 'inherit'
});

process.exit(result.status === null ? 1 : result.status);
