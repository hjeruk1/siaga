// Tes pemulihan cadangan (scripts/restore.js).
//
// Fokusnya bukan "apakah restore bisa jalan", tapi "apakah restore AMAN":
//   - tanpa --apply tidak boleh mengubah apa pun
//   - cadangan rusak ditolak SEBELUM data aktif disentuh
//   - arsip uploads rusak juga tidak boleh menyentuh database (regresi dari bug
//     nyata: versi pertama menukar database dulu, lalu gagal mengekstrak tar,
//     sehingga sistem tertinggal setengah pulih)
//   - database lama selalu disalin ke *.pre-restore-* dan folder uploads lama
//     tidak dihapus, hanya diganti nama
const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('../backend/node_modules/better-sqlite3');

const ROOT = path.resolve(__dirname, '..');

function jalankan(args) {
  return spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'restore.js'), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function buatDb(berkas, siswa) {
  const db = new Database(berkas);
  db.exec('CREATE TABLE siswa(id INTEGER PRIMARY KEY, nama TEXT)');
  for (const n of siswa) db.prepare('INSERT INTO siswa(nama) VALUES(?)').run(n);
  db.close();
}

function namaSiswa(berkas) {
  const db = new Database(berkas, { readonly: true });
  try {
    return db
      .prepare('SELECT nama FROM siswa ORDER BY id')
      .all()
      .map((r) => r.nama);
  } finally {
    db.close();
  }
}

function buatTar(arsip, isiDir) {
  // cwd dipakai, bukan -C: bsdtar Windows mengacaukan path tertentu.
  const r = spawnSync('tar', ['--force-local', '-czf', arsip, '.'], { cwd: isiDir, encoding: 'utf8' });
  assert.equal(r.status, 0, `tar gagal: ${r.stderr}`);
}

describe('restore cadangan', () => {
  let dir;
  let cadangan;
  let tujuan;
  let arsip;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'siaga-restore-'));
    cadangan = path.join(dir, 'backups');
    fs.mkdirSync(cadangan, { recursive: true });

    // Cadangan berisi 2 siswa; data "aktif" berisi 3 (satu penanda tambahan).
    const dbCadangan = path.join(cadangan, 'siaga-backup-2026-01-01-010101.db');
    buatDb(dbCadangan, ['Ani', 'Budi']);
    tujuan = path.join(dir, 'kerja', 'siaga.db');
    fs.mkdirSync(path.dirname(tujuan), { recursive: true });
    buatDb(tujuan, ['Ani', 'Budi', 'PENANDA-RUSAK']);

    // Arsip uploads berisi 2 berkas.
    const sumberUploads = path.join(dir, 'uploads-sumber');
    fs.mkdirSync(path.join(sumberUploads, 'foto'), { recursive: true });
    fs.writeFileSync(path.join(sumberUploads, 'foto', 'a.txt'), 'foto a');
    fs.writeFileSync(path.join(sumberUploads, 'b.txt'), 'foto b');
    arsip = path.join(cadangan, 'siaga-uploads-2026-01-01-010101.tar.gz');
    buatTar(arsip, sumberUploads);
  });

  it('--list menampilkan pasangan database + arsip', () => {
    const r = jalankan(['--from', cadangan, '--list']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /siaga-backup-2026-01-01-010101\.db/);
    assert.match(r.stdout, /siaga-uploads-2026-01-01-010101\.tar\.gz/);
  });

  it('tanpa --apply tidak mengubah apa pun (dry-run)', () => {
    const r = jalankan(['--from', cadangan, '--db-path', tujuan, '--uploads-dir', path.join(dir, 'uploads')]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /DRY-RUN/);
    assert.deepEqual(namaSiswa(tujuan), ['Ani', 'Budi', 'PENANDA-RUSAK']);
  });

  it('--apply memulihkan database dan uploads, dengan salinan pengaman', () => {
    const uploads = path.join(dir, 'uploads');
    fs.mkdirSync(uploads, { recursive: true });
    fs.writeFileSync(path.join(uploads, 'lama.txt'), 'berkas lama');

    const r = jalankan(['--from', cadangan, '--db-path', tujuan, '--uploads-dir', uploads, '--apply']);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(namaSiswa(tujuan), ['Ani', 'Budi'], 'penanda dari data rusak harus hilang');

    const isiUploads = fs.readdirSync(uploads).sort();
    assert.ok(isiUploads.includes('b.txt'));
    assert.ok(!isiUploads.includes('lama.txt'), 'berkas lama tidak boleh bercampur dengan hasil restore');

    // Salinan pengaman database & folder lama tetap ada.
    const berkasKerja = fs.readdirSync(path.dirname(tujuan));
    assert.ok(
      berkasKerja.some((n) => n.includes('siaga.db.pre-restore-')),
      'database lama harus disalin sebelum ditimpa'
    );
    const diInduk = fs.readdirSync(dir).filter((n) => n.includes('uploads.pre-restore-'));
    assert.equal(diInduk.length, 1, 'folder uploads lama harus diganti nama, bukan dihapus');
  });

  it('database cadangan rusak ditolak tanpa menyentuh data aktif', () => {
    const rusak = path.join(dir, 'rusak.db');
    fs.writeFileSync(rusak, Buffer.from('ini bukan sqlite sama sekali'));
    const sebelum = namaSiswa(tujuan);

    const r = jalankan(['--db', rusak, '--db-path', tujuan, '--uploads-dir', path.join(dir, 'uploads'), '--apply']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /tidak layak dipakai/i);
    assert.deepEqual(namaSiswa(tujuan), sebelum, 'data aktif tidak boleh berubah');
  });

  it('arsip uploads rusak ditolak SEBELUM database ditimpa', () => {
    // Regresi: versi pertama menukar database lebih dulu, lalu gagal mengekstrak
    // arsip — database sudah berubah padahal restore dinyatakan gagal.
    const rusak = path.join(dir, 'rusak.tar.gz');
    fs.writeFileSync(rusak, Buffer.from('bukan gzip'));
    const dbCadangan = path.join(cadangan, 'siaga-backup-2026-01-01-010101.db');
    const sebelum = namaSiswa(tujuan);

    const r = jalankan([
      '--db',
      dbCadangan,
      '--uploads',
      rusak,
      '--db-path',
      tujuan,
      '--uploads-dir',
      path.join(dir, 'uploads'),
      '--apply'
    ]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /rusak|gagal/i);
    assert.deepEqual(namaSiswa(tujuan), sebelum, 'database TIDAK boleh ditimpa saat arsip gagal');
  });

  it('folder cadangan kosong menghasilkan kode keluar 2 dan pesan jelas', () => {
    const kosong = path.join(dir, 'kosong');
    fs.mkdirSync(kosong, { recursive: true });
    const r = jalankan(['--from', kosong, '--db-path', tujuan]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /tidak ada cadangan/i);
  });
});
