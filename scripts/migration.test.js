const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const Database = require(path.join(root, 'backend/node_modules/better-sqlite3'));

let tmp;
let dbPath;

function runNode(args) {
  return spawnSync(process.execPath, args, {
    cwd: root,
    env: {
      ...process.env,
      DB_PATH: dbPath,
      NODE_ENV: 'test',
      JWT_SECRET: 'x'.repeat(40),
      ADMIN_PASSWORD: 'admin123',
      // Naikkan level agar kegagalan migrasi terlihat saat menelusuri test ini.
      LOG_LEVEL: 'silent'
    },
    encoding: 'utf8'
  });
}

function open() {
  return new Database(dbPath, { readonly: true });
}

describe('Database migrations', () => {
  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'siaga-migrate-test-'));
    dbPath = path.join(tmp, 'siaga.db');
  });

  after(() => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 });
    } catch {}
  });

  it('init.js menyiapkan database tanpa menjalankan migrasi', () => {
    const res = runNode(['backend/init.js']);
    assert.equal(res.status, 0, res.stderr);

    const db = open();
    const tracking = db
      .prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type='table' AND name='schema_migration'")
      .get().c;
    db.close();
    assert.equal(tracking, 0, 'tabel schema_migration belum boleh ada sebelum migrate.js dijalankan');
  });

  it('menerapkan migrasi dan mencatatnya', () => {
    const res = runNode(['backend/migrate.js']);
    assert.equal(res.status, 0, res.stderr);

    const db = open();
    const applied = db.prepare('SELECT name FROM schema_migration ORDER BY name').all();
    db.close();
    assert.equal(applied.length, 1);
    assert.match(applied[0].name, /^\d+_/);
  });

  it('menghasilkan skema lengkap pada database baru', () => {
    const db = open();
    const cols = db.pragma('table_info(laporan_harian)').map((c) => c.name);
    db.close();
    for (const col of [
      'focus_theme_id',
      'observation_domain',
      'observation_note',
      'parent_note',
      'structured_observation_json'
    ]) {
      assert.ok(cols.includes(col), `kolom ${col} harus ada di laporan_harian`);
    }
  });

  it('idempoten: migrasi kedua tidak menerapkan apa pun', () => {
    const res = runNode(['backend/migrate.js']);
    assert.equal(res.status, 0, res.stderr);

    const db = open();
    const count = db.prepare('SELECT COUNT(*) c FROM schema_migration').get().c;
    db.close();
    assert.equal(count, 1, 'migrasi tidak boleh tercatat dua kali');
  });

  it('memperbaiki database lama yang kehilangan kolom', () => {
    const db = new Database(dbPath);
    db.exec('ALTER TABLE laporan_harian DROP COLUMN observation_domain');
    db.exec("DELETE FROM schema_migration WHERE name LIKE '%adopt_legacy%'");
    db.close();

    const afterDrop = open();
    const droppedCols = afterDrop.pragma('table_info(laporan_harian)').map((c) => c.name);
    afterDrop.close();
    assert.ok(!droppedCols.includes('observation_domain'), 'prasyarat: kolom harus sudah dibuang');

    const res = runNode(['backend/migrate.js']);
    assert.equal(res.status, 0, res.stderr);

    const repaired = open();
    const cols = repaired.pragma('table_info(laporan_harian)').map((c) => c.name);
    repaired.close();
    assert.ok(cols.includes('observation_domain'), 'kolom harus dipulihkan oleh migrasi');
    assert.ok(cols.includes('focus_theme_id'), 'kolom lain tidak boleh ikut rusak');
  });
});
