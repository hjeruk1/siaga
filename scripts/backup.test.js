// Tes backup: database DAN arsip uploads harus sama-sama ada, retensi
// dihitung per jenis (bukan total), dan arsip harus benar-benar berisi berkas
// unggahan. Menghasilkan direktori cadangan sementara, tidak menyentuh yang asli.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function jalankanBackup(env) {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'backup.js')], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return out;
}

function isiDir(dir) {
  return fs.readdirSync(dir).sort();
}

describe('backup: database + arsip unggahan', () => {
  let dir;
  let out;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'siaga-backup-test-'));
    out = jalankanBackup({ BACKUP_DIR: dir, BACKUP_RETENTION_COUNT: '5' });
  });

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('menghasilkan cadangan database dan arsip uploads', () => {
    const berkas = isiDir(dir);
    assert.ok(
      berkas.some((f) => /^siaga-backup-.*\.db$/.test(f)),
      `db tidak ada: ${berkas}`
    );
    assert.ok(
      berkas.some((f) => /^siaga-uploads-.*\.tar\.gz$/.test(f)),
      `arsip uploads tidak ada: ${berkas}`
    );
  });

  it('melaporkan keberhasilan arsip uploads di output', () => {
    assert.match(out, /\[Backup Uploads\] Sukses/, 'log harus menyebut arsip berhasil');
  });

  it('arsip uploads benar-benar berisi berkas unggahan', () => {
    const tar = isiDir(dir).find((f) => /^siaga-uploads-.*\.tar\.gz$/.test(f));
    // --force-local: tanpa ini, tar bawaan Windows (bsdtar) mengira "C:\..."
    // adalah host remote dan gagal. Di GNU tar opsi ini diabaikan.
    const daftar = execFileSync('tar', ['--force-local', '-tzf', path.join(dir, tar)], { encoding: 'utf8' });
    const isi = daftar.split('\n').filter(Boolean);
    assert.ok(isi.length > 0, 'arsip kosong');
    // folder unggahan dikenal: foto, bukti, laporan (lihat backend/uploads)
    assert.ok(
      isi.some((l) => /foto|bukti|laporan/.test(l)),
      `tidak ada isi uploads yang dikenal: ${isi.slice(0, 5).join(' | ')}`
    );
  });

  it('arsip uploads terbaca utuh (gzip -t)', () => {
    const tar = isiDir(dir).find((f) => /^siaga-uploads-.*\.tar\.gz$/.test(f));
    execFileSync('gzip', ['-t', path.join(dir, tar)]);
    assert.ok(true);
  });

  it('retensi dihitung PER JENIS, bukan total', () => {
    // Dijalankan dua kali lagi dengan retensi 1: harus tersisa 1 db + 1 tar.
    // Kalau retensi menyatukan kedua jenis, db (lebih tua dari tar) akan
    // terpotong dan folder berisi tar tanpa db-nya.
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'siaga-backup-ret-'));
    try {
      for (let i = 0; i < 2; i++) {
        jalankanBackup({ BACKUP_DIR: dir2, BACKUP_RETENTION_COUNT: '1' });
        if (i === 0) execFileSync(process.execPath, ['-e', 'setTimeout(()=>{},1200)']);
      }
      const sisa = isiDir(dir2);
      assert.equal(sisa.filter((f) => f.endsWith('.db')).length, 1, `sisa db bukan 1: ${sisa}`);
      assert.equal(sisa.filter((f) => f.endsWith('.tar.gz')).length, 1, `sisa tar bukan 1: ${sisa}`);
    } finally {
      fs.rmSync(dir2, { recursive: true, force: true });
    }
  });

  it('tanpa konfigurasi GCS, backup lokal tetap sukses (exit 0)', () => {
    const dir3 = fs.mkdtempSync(path.join(os.tmpdir(), 'siaga-backup-nogcs-'));
    try {
      jalankanBackup({ BACKUP_DIR: dir3, GCS_BUCKET_NAME: '', GCS_KEY_FILE_PATH: '' });
      assert.ok(isiDir(dir3).some((f) => f.endsWith('.db')));
    } finally {
      fs.rmSync(dir3, { recursive: true, force: true });
    }
  });
});
