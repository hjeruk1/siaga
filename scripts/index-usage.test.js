// Memverifikasi bahwa index untuk query panas benar-benar DIPAKAI oleh planner,
// bukan sekadar ada di sqlite_master. Index yang dibuat tapi tidak dipakai hanya
// menambah biaya tulis, jadi keberadaannya saja tidak cukup sebagai bukti.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const Database = require(path.join(root, 'backend/node_modules/better-sqlite3'));

let tmp;
let db;

function planFor(sql, params = []) {
  return db
    .prepare(`EXPLAIN QUERY PLAN ${sql}`)
    .all(...params)
    .map((row) => row.detail)
    .join(' | ');
}

describe('Index untuk query panas', () => {
  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'siaga-index-test-'));
    const dbPath = path.join(tmp, 'siaga.db');
    const env = {
      ...process.env,
      DB_PATH: dbPath,
      NODE_ENV: 'test',
      JWT_SECRET: 'x'.repeat(40),
      ADMIN_PASSWORD: 'admin123',
      LOG_LEVEL: 'silent'
    };
    const init = spawnSync(process.execPath, ['backend/init.js'], { cwd: root, env, encoding: 'utf8' });
    assert.equal(init.status, 0, init.stderr);
    const migrate = spawnSync(process.execPath, ['backend/migrate.js'], { cwd: root, env, encoding: 'utf8' });
    assert.equal(migrate.status, 0, migrate.stderr);

    db = new Database(dbPath, { readonly: true });
  });

  after(() => {
    try {
      db?.close();
    } catch {}
    try {
      fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 });
    } catch {}
  });

  it('membuat seluruh index yang diharapkan', () => {
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index'")
      .all()
      .map((r) => r.name);
    const expected = [
      'idx_audit_log_created',
      'idx_audit_log_cabang_created',
      'idx_alokasi_pembayaran',
      'idx_alokasi_tagihan',
      'idx_tagihan_cabang_created',
      'idx_pembayaran_cabang_created',
      'idx_absensi_rombel_tanggal'
    ];
    for (const name of expected) {
      assert.ok(names.includes(name), `index ${name} tidak ditemukan`);
    }
  });

  it('daftar audit-log memakai index, bukan memindai lalu mengurutkan tabel', () => {
    const plan = planFor(
      `SELECT a.* FROM audit_log a
       LEFT JOIN pengguna p ON p.id=a.actor_pengguna_id
       LEFT JOIN cabang c ON c.id=a.cabang_id
       ORDER BY a.created_at DESC LIMIT 100`
    );
    assert.ok(!/SCAN audit_log/.test(plan), `audit_log masih dipindai penuh: ${plan}`);
    assert.ok(!/TEMP B-TREE/.test(plan), `ORDER BY masih butuh pengurutan sementara: ${plan}`);
  });

  it('audit-log yang difilter cabang memakai index komposit', () => {
    const plan = planFor(`SELECT a.* FROM audit_log a WHERE a.cabang_id=1 ORDER BY a.created_at DESC LIMIT 100`);
    assert.ok(/idx_audit_log_cabang_created/.test(plan), `index komposit tidak dipakai: ${plan}`);
  });

  it('subquery alokasi per tagihan memakai index, bukan pemindaian per baris', () => {
    const plan = planFor('SELECT SUM(pa.nominal) FROM pembayaran_alokasi pa WHERE pa.tagihan_id=1');
    assert.ok(/idx_alokasi_tagihan/.test(plan), `index tagihan_id tidak dipakai: ${plan}`);
  });

  it('subquery alokasi per pembayaran memakai index', () => {
    const plan = planFor('SELECT SUM(pa.nominal) FROM pembayaran_alokasi pa WHERE pa.pembayaran_id=1');
    assert.ok(/idx_alokasi_pembayaran/.test(plan), `index pembayaran_id tidak dipakai: ${plan}`);
  });

  it('daftar tagihan per cabang memakai index komposit', () => {
    const plan = planFor('SELECT * FROM tagihan WHERE cabang_id=1 ORDER BY created_at DESC');
    assert.ok(/idx_tagihan_cabang_created/.test(plan), `index tidak dipakai: ${plan}`);
  });

  it('daftar pembayaran per cabang memakai index komposit', () => {
    const plan = planFor('SELECT * FROM pembayaran WHERE cabang_id=1 ORDER BY created_at DESC');
    assert.ok(/idx_pembayaran_cabang_created/.test(plan), `index tidak dipakai: ${plan}`);
  });

  it('rekap absensi per rombel memakai index rentang tanggal', () => {
    const plan = planFor("SELECT * FROM absensi WHERE rombel_id=1 AND tanggal>='2026-01-01' AND tanggal<='2026-12-31'");
    assert.ok(/idx_absensi_rombel_tanggal/.test(plan), `index tidak dipakai: ${plan}`);
  });

  it('query absensi terpanas tetap memakai UNIQUE(siswa_id,tanggal) yang sudah ada', () => {
    const plan = planFor('SELECT * FROM absensi WHERE siswa_id=1 AND tanggal=?', ['2026-05-04']);
    assert.ok(/SCAN absensi|SEARCH absensi/.test(plan), `plan tidak terduga: ${plan}`);
    assert.ok(!/SCAN absensi/.test(plan), `check-in/scan penjemput masih memindai tabel: ${plan}`);
  });
});
