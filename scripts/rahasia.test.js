// Tes penyimpanan rahasia terenkripsi (backend/utils/rahasia.js).
//
// Yang dijaga:
//   - round-trip dengan kunci khusus (SECRET_ENCRYPTION_KEY)
//   - data lama yang terenkripsi dari JWT_SECRET tetap terbaca setelah kunci
//     khusus diset (jalur migrasi kunci)
//   - label berbeda tidak bisa saling membuka
//   - production tanpa kunci apa pun gagal keras, bukan menyimpan 'plain:'
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { enkripsi, dekripsi } = require('../backend/utils/rahasia');

const KUNCI = ['SECRET_ENCRYPTION_KEY', 'WA_SECRET_KEY', 'JWT_SECRET', 'NODE_ENV'];
let simpan;

beforeEach(() => {
  simpan = {};
  for (const k of KUNCI) {
    simpan[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of KUNCI) {
    if (simpan[k] === undefined) delete process.env[k];
    else process.env[k] = simpan[k];
  }
});

describe('rahasia terenkripsi', () => {
  it('round-trip dengan kunci khusus', () => {
    process.env.SECRET_ENCRYPTION_KEY = 'kunci-khusus-uji';
    const s = enkripsi('token-rahasia', 'siaga-totp');
    assert.match(s, /^enc:v1:/);
    assert.equal(dekripsi(s, 'siaga-totp'), 'token-rahasia');
  });

  it('label berbeda tidak bisa membuka', () => {
    process.env.SECRET_ENCRYPTION_KEY = 'kunci-khusus-uji';
    const s = enkripsi('token-rahasia', 'siaga-totp');
    assert.equal(dekripsi(s, 'siaga-wa'), null);
  });

  it('data legacy dari JWT_SECRET tetap terbaca setelah kunci khusus diset', () => {
    process.env.JWT_SECRET = 'jwt-lama';
    const s = enkripsi('token-rahasia', 'siaga-totp');
    process.env.SECRET_ENCRYPTION_KEY = 'kunci-khusus-uji';
    assert.equal(dekripsi(s, 'siaga-totp'), 'token-rahasia');
    // Tulisan baru memakai kunci khusus, bukan JWT lagi.
    const baru = enkripsi('token-baru', 'siaga-totp');
    delete process.env.JWT_SECRET;
    assert.equal(dekripsi(baru, 'siaga-totp'), 'token-baru');
  });

  it('data legacy dari WA_SECRET_KEY tetap terbaca setelah SECRET_ENCRYPTION_KEY diset', () => {
    process.env.WA_SECRET_KEY = 'kunci-wa-lama';
    const s = enkripsi('token-rahasia', 'siaga-wa');
    process.env.SECRET_ENCRYPTION_KEY = 'kunci-khusus-baru';
    assert.equal(dekripsi(s, 'siaga-wa'), 'token-rahasia');
  });

  it('production tanpa kunci gagal keras', () => {
    process.env.NODE_ENV = 'production';
    assert.throws(() => enkripsi('token-rahasia', 'siaga-totp'), /wajib diset/);
  });

  it('di luar production tanpa kunci tetap plain dan terbaca', () => {
    process.env.NODE_ENV = 'test';
    const s = enkripsi('token-rahasia', 'siaga-totp');
    assert.equal(s, 'plain:token-rahasia');
    assert.equal(dekripsi(s, 'siaga-totp'), 'token-rahasia');
  });

  it('format lama tanpa awalan tetap terbaca', () => {
    assert.equal(dekripsi('teks-lama', 'siaga-totp'), 'teks-lama');
    assert.equal(dekripsi(null, 'siaga-totp'), null);
    assert.equal(enkripsi('', 'siaga-totp'), null);
  });
});
