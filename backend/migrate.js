require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./db');
const logger = require('./utils/logger');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// Nama file migrasi: NNN_deskripsi.js (mis. 001_adopt_legacy_schema.js).
// File lain di direktori ini (mis. helpers.js) diabaikan.
const MIGRATION_FILE = /^(\d+)_.+\.js$/;

function ensureTrackingTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migration (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
}

function loadMigrations() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => MIGRATION_FILE.test(file))
    .sort((a, b) => Number(a.match(MIGRATION_FILE)[1]) - Number(b.match(MIGRATION_FILE)[1]))
    .map((file) => {
      const mod = require(path.join(MIGRATIONS_DIR, file));
      if (typeof mod.up !== 'function') throw new Error(`Migrasi ${file} tidak mengekspor fungsi up()`);
      return { id: file.replace(/\.js$/, ''), up: mod.up };
    });
}

function appliedNames() {
  return new Set(
    db
      .prepare('SELECT name FROM schema_migration')
      .all()
      .map((row) => row.name)
  );
}

function runMigrations({ silent = false } = {}) {
  ensureTrackingTable();
  const applied = appliedNames();
  const pending = loadMigrations().filter((migration) => !applied.has(migration.id));

  if (!pending.length) {
    if (!silent) logger.info('skema database sudah terbaru');
    return [];
  }

  const done = [];
  for (const migration of pending) {
    // Satu transaksi per migrasi: bila gagal, perubahan dibatalkan dan migrasi
    // TIDAK tercatat sebagai applied, sehingga bisa dicoba lagi setelah diperbaiki.
    db.transaction(() => {
      migration.up(db);
      db.prepare('INSERT INTO schema_migration(name, applied_at) VALUES(?,?)').run(
        migration.id,
        new Date().toISOString()
      );
    })();

    done.push(migration.id);
    logger.info({ migration: migration.id }, 'migrasi diterapkan');
  }
  return done;
}

module.exports = { runMigrations, MIGRATIONS_DIR };

if (require.main === module) {
  try {
    const done = runMigrations();
    if (done.length) logger.info({ count: done.length, migrations: done }, 'migrasi selesai');
    else logger.info('tidak ada migrasi yang perlu dijalankan');
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, 'migrasi gagal');
    process.exit(1);
  }
}
