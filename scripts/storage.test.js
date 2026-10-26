// Tes ringkasan penyimpanan.
//
// Dua hal yang dijaga:
//   - hitungan folder benar (rekursif, termasuk subfolder)
//   - angkanya hanya untuk admin pusat — ia mencakup seluruh server, bukan
//     milik satu cabang
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const db = require('../backend/db');
const bcrypt = require('../backend/node_modules/bcryptjs');
const storage = require('../backend/utils/storage');

process.env.JWT_SECRET ||= 'siaga-test-secret-change-me';

const BASE = process.env.TEST_URL || 'http://127.0.0.1:3999';
const NYAWA = Date.now();
const nowIso = () => new Date().toISOString();

function req(method, p, body, token) {
  return fetch(`${BASE}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
}

async function login(username, password) {
  const r = await req('POST', '/api/auth/login', { tipe: 'staff', username, password });
  return r.body?.token || null;
}

describe('penyimpanan', () => {
  let tmp;
  const dibuat = [];
  let tokenAdmin;
  let tokenCabang;

  before(async () => {
    // Folder sementara di tmpdir sistem (bukan /tmp gaya bash yang bisa
    // menghasilkan path 8.3 pendek di Windows).
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'siaga-storage-'));
    fs.mkdirSync(path.join(tmp, 'a'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'a', 'dalam'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'a', 'satu.bin'), Buffer.alloc(1000));
    fs.writeFileSync(path.join(tmp, 'a', 'dalam', 'dua.bin'), Buffer.alloc(2000));

    tokenAdmin = await login('admin', 'admin123');
    assert.ok(tokenAdmin, 'login admin harus berhasil');

    const cabang = db.prepare('SELECT id FROM cabang ORDER BY id LIMIT 1').get();
    const username = `storage-cabang-${NYAWA}`;
    const id = db
      .prepare(
        `INSERT INTO pengguna(tipe,role,display_name,username,password_hash,status,must_change_password,created_at,updated_at)
         VALUES('staff','admin_cabang',?,?,?,'aktif',0,?,?)`
      )
      .run('Admin Cabang Storage', username, bcrypt.hashSync('admin123', 8), nowIso(), nowIso()).lastInsertRowid;
    db.prepare('INSERT INTO staff_profile(pengguna_id,cabang_id) VALUES(?,?)').run(id, cabang.id);
    dibuat.push(id);
    tokenCabang = await login(username, 'admin123');
    assert.ok(tokenCabang, 'login admin cabang harus berhasil');
  });

  after(() => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* diabaikan */
    }
    if (dibuat.length) {
      const ids = dibuat.join(',');
      db.prepare(`DELETE FROM audit_log WHERE actor_pengguna_id IN (${ids})`).run();
      db.prepare(`DELETE FROM staff_profile WHERE pengguna_id IN (${ids})`).run();
      db.prepare(`DELETE FROM pengguna WHERE id IN (${ids})`).run();
    }
  });

  it('menghitung folder secara rekursif', () => {
    const u = storage.ukuranFolder(tmp);
    assert.equal(u.files, 2, 'dua berkas termasuk yang di subfolder');
    assert.equal(u.bytes, 3000);
  });

  it('folder yang tidak ada menghasilkan nol, bukan error', () => {
    const u = storage.ukuranFolder(path.join(tmp, 'tidak-ada'));
    assert.deepEqual(u, { files: 0, bytes: 0 });
  });

  it('admin mendapat ringkasan lengkap', async () => {
    const r = await req('GET', '/api/storage', null, tokenAdmin);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.uploads.folder), 'ada rincian folder');
    assert.ok(r.body.uploads.bytes >= 0);
    assert.ok(r.body.database.utama > 0, 'ukuran database utama harus terbaca');
    assert.ok(typeof r.body.database.wal === 'number');
    assert.ok(r.body.galeri && typeof r.body.galeri.foto === 'number');
    // disk boleh null di platform tanpa statfs, tapi kalau ada harus masuk akal
    if (r.body.disk) {
      assert.ok(r.body.disk.total > 0);
      assert.ok(r.body.disk.bebas <= r.body.disk.total);
    }
  });

  it('admin cabang ditolak (angkanya milik seluruh server)', async () => {
    const r = await req('GET', '/api/storage', null, tokenCabang);
    assert.equal(r.status, 403);
  });

  it('tanpa token ditolak', async () => {
    const r = await req('GET', '/api/storage', null, null);
    assert.equal(r.status, 401);
  });
});
