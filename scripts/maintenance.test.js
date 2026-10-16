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
let baseEnv;

const daysAgo = (d) => new Date(Date.now() - d * 86400000).toISOString();

function runMaintenance(extraEnv = {}, args = []) {
  return spawnSync(process.execPath, ['scripts/maintenance.js', ...args], {
    cwd: root,
    env: { ...baseEnv, ...extraEnv },
    encoding: 'utf8'
  });
}

function counts() {
  const db = new Database(dbPath, { readonly: true });
  const out = {
    audit_log: db.prepare('SELECT COUNT(*) c FROM audit_log').get().c,
    nfc_scan_log: db.prepare('SELECT COUNT(*) c FROM nfc_scan_log').get().c,
    penjemputan_log: db.prepare('SELECT COUNT(*) c FROM penjemputan_log').get().c,
    hasStat1: !!db.prepare("SELECT 1 FROM sqlite_master WHERE name='sqlite_stat1'").get()
  };
  db.close();
  return out;
}

describe('Perawatan database (retensi)', () => {
  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'siaga-maint-test-'));
    dbPath = path.join(tmp, 'siaga.db');
    baseEnv = {
      ...process.env,
      DB_PATH: dbPath,
      NODE_ENV: 'test',
      JWT_SECRET: 'x'.repeat(40),
      ADMIN_PASSWORD: 'admin123',
      LOG_LEVEL: 'silent'
    };

    for (const script of ['backend/init.js', 'backend/migrate.js']) {
      const r = spawnSync(process.execPath, [script], { cwd: root, env: baseEnv, stdio: 'ignore' });
      assert.equal(r.status, 0, `${script} gagal`);
    }

    const now = new Date().toISOString();
    const seed = new Database(dbPath);
    // nfc_scan_log mensyaratkan action + status, dan penjemputan_log mensyaratkan
    // absensi_id yang valid (foreign_keys aktif), jadi data pendukungnya dibuat dulu.
    const cabang = seed.prepare('SELECT id FROM cabang ORDER BY id LIMIT 1').get();
    const jenjang = seed.prepare('SELECT id FROM jenjang ORDER BY urutan LIMIT 1').get();
    const rombel = seed
      .prepare('SELECT id FROM rombel WHERE cabang_id=? AND jenjang_id=? LIMIT 1')
      .get(cabang.id, jenjang.id);
    const siswaId = seed
      .prepare("INSERT INTO siswa(nama,nis,status,created_at,updated_at) VALUES('Uji','MNT-1','aktif',?,?)")
      .run(now, now).lastInsertRowid;
    const absensiId = seed
      .prepare(
        "INSERT INTO absensi(siswa_id,cabang_id,jenjang_id,rombel_id,paket,tanggal,status,created_at,updated_at) VALUES(?,?,?,?,'reguler','2026-01-01','Hadir',?,?)"
      )
      .run(siswaId, cabang.id, jenjang.id, rombel.id, now, now).lastInsertRowid;

    const nfcSql =
      "INSERT INTO nfc_scan_log(siswa_id,pengguna_id,cabang_id,action,status,tanggal,jam,created_at) VALUES(?,NULL,1,'scan','success','2026-01-01','08:00',?)";
    seed.transaction(() => {
      for (let i = 0; i < 10; i++)
        seed
          .prepare("INSERT INTO audit_log(action,entity_type,cabang_id,created_at) VALUES('create','siswa',1,?)")
          .run(daysAgo(800));
      for (let i = 0; i < 5; i++)
        seed
          .prepare("INSERT INTO audit_log(action,entity_type,cabang_id,created_at) VALUES('create','siswa',1,?)")
          .run(now);
      for (let i = 0; i < 8; i++) seed.prepare(nfcSql).run(siswaId, daysAgo(300));
      for (let i = 0; i < 2; i++) seed.prepare(nfcSql).run(siswaId, now);
      for (let i = 0; i < 6; i++)
        seed
          .prepare(
            "INSERT INTO penjemputan_log(absensi_id,siswa_id,cabang_id,tanggal,jam_pulang,sumber,created_at) VALUES(?,?,?,'2026-01-01','14:00','manual',?)"
          )
          .run(absensiId, siswaId, cabang.id, daysAgo(800));
    })();
    seed.close();
  });

  after(() => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 });
    } catch {}
  });

  it('dry-run tidak menghapus apa pun', () => {
    const before = counts();
    const res = runMaintenance({}, ['--dry-run']);
    assert.equal(res.status, 0, res.stderr);
    assert.deepEqual(counts(), before, 'jumlah baris tidak boleh berubah');
    assert.match(res.stdout, /10 baris akan dihapus/);
    assert.match(res.stdout, /penjemputan_log: dilewati/);
  });

  it('hanya memotong baris yang melewati batas retensi', () => {
    const res = runMaintenance();
    assert.equal(res.status, 0, res.stderr);
    const after = counts();
    assert.equal(after.audit_log, 5, 'audit_log: 10 lama dihapus, 5 baru tetap');
    assert.equal(after.nfc_scan_log, 2, 'nfc_scan_log: 8 lama dihapus, 2 baru tetap');
  });

  it('menjaga penjemputan_log sebagai data bisnis secara default', () => {
    assert.equal(counts().penjemputan_log, 6, 'retensi default 0 berarti dipakai/dilewati');
  });

  it('menjalankan ANALYZE setelah pemotongan', () => {
    assert.equal(counts().hasStat1, true, 'tabel sqlite_stat1 harus terbentuk');
  });

  it('VACUUM hanya berjalan bila diminta', () => {
    const skipped = runMaintenance();
    assert.match(skipped.stdout, /VACUUM: dilewati/);
    const enabled = runMaintenance({ MAINTENANCE_VACUUM: '1' });
    assert.match(enabled.stdout, /VACUUM: selesai/);
  });

  it('idempoten: menjalankan lagi tidak menyentuh sisa data', () => {
    const before = counts();
    const res = runMaintenance();
    assert.equal(res.status, 0, res.stderr);
    assert.deepEqual(counts(), before);
    assert.match(res.stdout, /0 baris dihapus/);
  });

  it('retensi bisa ditimpa lewat variabel lingkungan', () => {
    const res = runMaintenance({ RETENTION_PENJEMPUTAN_LOG_DAYS: '365' });
    assert.equal(res.status, 0, res.stderr);
    assert.equal(counts().penjemputan_log, 0, 'penjemputan_log lama ikut terpotong saat diaktifkan');
  });
});
