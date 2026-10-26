// Tes retensi galeri.
//
// Yang dijaga:
//   - hanya admin pusat yang boleh mengubah kebijakan (satu disk untuk semua
//     cabang, jadi bukan wewenang admin cabang)
//   - batas hapus tidak boleh lebih pendek dari batas arsip — kalau boleh,
//     foto akan dihapus total padahal admin mengira memilih "arsip"
//   - arsip benar-benar membuang berkas penuh dan menyisakan thumbnail, dengan
//     angka ukuran yang jujur
//   - hapus membuang baris + kedua berkas
//   - foto yang belum melewati batas tidak tersentuh
//   - berkas yatim (tanpa baris) dibersihkan, tetapi berkas baru tidak
//   - putaran kedua tidak mengulang pekerjaan (idempoten)
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../backend/db');
const bcrypt = require('../backend/node_modules/bcryptjs');
const retensi = require('../backend/utils/retensi');

process.env.JWT_SECRET ||= 'siaga-test-secret-change-me';

const BASE = process.env.TEST_URL || 'http://127.0.0.1:3999';
const NYAWA = Date.now();
const nowIso = () => new Date().toISOString();
const DIR = retensi.DIR;

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

// Tanggal WIB hari ini, dikurangi n bulan — dipakai sebagai tanggal foto uji.
function tanggalMundur(bulan) {
  const hariIni = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(new Date());
  return retensi.kurangiBulan(hariIni, bulan);
}

const dibuat = { pengguna: [], foto: [], berkas: [] };

function buatStaff(role, cabangId, nama) {
  const username = `retensi-${role}-${nama}-${NYAWA}`;
  const id = db
    .prepare(
      `INSERT INTO pengguna(tipe,role,display_name,username,password_hash,status,must_change_password,created_at,updated_at)
       VALUES('staff',?,?,?,?,'aktif',0,?,?)`
    )
    .run(role, `Uji retensi ${nama}`, username, bcrypt.hashSync('admin123', 8), nowIso(), nowIso()).lastInsertRowid;
  db.prepare('INSERT INTO staff_profile(pengguna_id,cabang_id) VALUES(?,?)').run(id, cabangId);
  dibuat.pengguna.push(id);
  return { id, username };
}

// Baris galeri + dua berkas di disk, tanpa lewat HTTP: tes ini soal kebijakan
// umur, bukan soal unggahan (itu sudah diuji di kegiatan.test.js).
function buatFoto({ tanggal, judul, rombelId, cabangId, ukuranPenuh = 4096, ukuranThumb = 512 }) {
  const nama = `${rombelId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`;
  const namaThumb = nama.replace(/\.jpg$/, '-thumb.jpg');
  fs.writeFileSync(path.join(DIR, nama), Buffer.alloc(ukuranPenuh));
  fs.writeFileSync(path.join(DIR, namaThumb), Buffer.alloc(ukuranThumb));
  dibuat.berkas.push(nama, namaThumb);
  const id = db
    .prepare(
      `INSERT INTO kegiatan_foto(cabang_id,rombel_id,tanggal,judul,keterangan,url,thumb_url,size_bytes,created_by,created_at)
       VALUES(?,?,?,?,NULL,?,?,?,NULL,?)`
    )
    .run(
      cabangId,
      rombelId,
      tanggal,
      judul,
      `/uploads/kegiatan/${nama}`,
      `/uploads/kegiatan/${namaThumb}`,
      ukuranPenuh,
      nowIso()
    ).lastInsertRowid;
  dibuat.foto.push(id);
  return { id, nama, namaThumb, ukuranPenuh, ukuranThumb };
}

function berkasAda(nama) {
  return fs.existsSync(path.join(DIR, nama));
}

describe('retensi galeri', () => {
  let cabang;
  let rombel;
  let tokenAdmin;
  let tokenAdminCabang;
  let fotoLama;
  let fotoSangatLama;
  let fotoBaru;

  before(async () => {
    cabang = db.prepare('SELECT id FROM cabang ORDER BY id LIMIT 1').get();
    rombel = db.prepare('SELECT id FROM rombel ORDER BY id LIMIT 1').get();
    assert.ok(cabang && rombel, 'seed harus menyediakan cabang & rombel');
    fs.mkdirSync(DIR, { recursive: true });

    const ac = buatStaff('admin_cabang', cabang.id, 'cabang');
    tokenAdmin = await login('admin', 'admin123');
    tokenAdminCabang = await login(ac.username, 'admin123');
    assert.ok(tokenAdmin && tokenAdminCabang, 'login admin & admin cabang harus berhasil');
  });

  after(() => {
    // Berkas dihapus lebih dulu: nama hanya diketahui dari daftar yang dibuat
    // tes ini (sebagian sudah hilang karena retensi).
    for (const nama of dibuat.berkas) {
      try {
        const p = path.join(DIR, nama);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch {
        /* diabaikan */
      }
    }
    if (dibuat.foto.length) {
      db.prepare(`DELETE FROM kegiatan_foto WHERE id IN (${dibuat.foto.join(',')})`).run();
    }
    db.prepare('DELETE FROM retensi_log WHERE oleh_pengguna_id IS NULL OR oleh_pengguna_id IN (?)').run(
      dibuat.pengguna.join(',') || -1
    );
    db.prepare("DELETE FROM setelan WHERE kunci LIKE 'retensi_%'").run();
    const p = dibuat.pengguna.join(',');
    if (p) {
      db.prepare(`DELETE FROM audit_log WHERE actor_pengguna_id IN (${p})`).run();
      db.prepare(`DELETE FROM staff_profile WHERE pengguna_id IN (${p})`).run();
      db.prepare(`DELETE FROM pengguna WHERE id IN (${p})`).run();
    }
  });

  it('kurangiBulan membatasi ke akhir bulan, bukan menghasilkan tanggal invalid', () => {
    assert.equal(retensi.kurangiBulan('2026-03-31', 1), '2026-02-28');
    assert.equal(retensi.kurangiBulan('2024-03-31', 1), '2024-02-29', 'tahun kabisat');
    assert.equal(retensi.kurangiBulan('2026-01-15', 1), '2025-12-15', 'lintas tahun');
    assert.equal(retensi.kurangiBulan('2026-10-27', 12), '2025-10-27');
    assert.equal(retensi.kurangiBulan('2026-10-27', 0), '2026-10-27');
  });

  it('hanya admin pusat yang boleh membaca kebijakan', async () => {
    const admin = await req('GET', '/api/retensi', null, tokenAdmin);
    assert.equal(admin.status, 200);
    assert.ok(admin.body.setelan, 'ada setelan');
    assert.ok(admin.body.akan_arsip && admin.body.akan_hapus, 'ada pratinjau');

    assert.equal((await req('GET', '/api/retensi', null, tokenAdminCabang)).status, 403, 'admin cabang ditolak');
    assert.equal((await req('GET', '/api/retensi', null, null)).status, 401, 'tanpa token ditolak');
    assert.equal((await req('PUT', '/api/retensi', { aktif: true }, tokenAdminCabang)).status, 403);
    assert.equal((await req('POST', '/api/retensi/jalankan', {}, tokenAdminCabang)).status, 403);
  });

  it('menolak batas hapus yang lebih pendek dari batas arsip', async () => {
    const salah = await req('PUT', '/api/retensi', { aktif: true, arsipBulan: 12, hapusBulan: 6 }, tokenAdmin);
    assert.equal(salah.status, 400);
    assert.match(salah.body.error, /lebih lama dari batas arsip/i);

    const negatif = await req('PUT', '/api/retensi', { aktif: true, arsipBulan: -1, hapusBulan: 0 }, tokenAdmin);
    assert.equal(negatif.status, 400);

    const sama = await req('PUT', '/api/retensi', { aktif: true, arsipBulan: 12, hapusBulan: 12 }, tokenAdmin);
    assert.equal(sama.status, 400, 'batas sama berarti hapus mendahului arsip');
  });

  it('pratinjau menghitung foto yang melewati batas, bukan menebak', async () => {
    fotoLama = buatFoto({
      tanggal: tanggalMundur(13),
      judul: 'Menari 13 bulan',
      rombelId: rombel.id,
      cabangId: cabang.id
    });
    fotoSangatLama = buatFoto({
      tanggal: tanggalMundur(25),
      judul: 'Kunjungan 25 bulan',
      rombelId: rombel.id,
      cabangId: cabang.id
    });
    fotoBaru = buatFoto({ tanggal: tanggalMundur(0), judul: 'Hari ini', rombelId: rombel.id, cabangId: cabang.id });

    const r = await req('PUT', '/api/retensi', { aktif: false, arsipBulan: 12, hapusBulan: 24 }, tokenAdmin);
    assert.equal(r.status, 200);
    assert.equal(r.body.setelan.arsipBulan, 12);
    assert.equal(r.body.setelan.hapusBulan, 24);

    const pratinjau = await req('GET', '/api/retensi', null, tokenAdmin);
    assert.equal(pratinjau.status, 200);
    const { akan_arsip: arsip, akan_hapus: hapus } = pratinjau.body;
    // 13 bulan > 12 bulan → arsip; 25 bulan > 24 bulan → hapus (dan arsip).
    // Foto hari ini tidak masuk hitungan mana pun.
    assert.equal(arsip.foto, 2, 'dua foto melewati batas arsip');
    assert.equal(hapus.foto, 1, 'satu foto melewati batas hapus');
    assert.equal(arsip.bytes, fotoLama.ukuranPenuh + fotoSangatLama.ukuranPenuh);
  });

  it('menjalankan retensi: arsip menyisakan thumbnail, hapus membuang baris', async () => {
    const r = await req('POST', '/api/retensi/jalankan', {}, tokenAdmin);
    assert.equal(r.status, 200);
    assert.equal(r.body.hasil.diarsip.foto, 2, 'dua foto diarsipkan');
    assert.equal(r.body.hasil.dihapus.foto, 1, 'satu foto dihapus');

    // Foto 13 bulan: berkas penuh hilang, thumbnail tetap, angka jujur.
    const lama = db.prepare('SELECT * FROM kegiatan_foto WHERE id=?').get(fotoLama.id);
    assert.equal(lama.diarsipkan, 1);
    assert.ok(lama.diarsipkan_at, 'ada jejak waktu arsip');
    assert.equal(lama.size_bytes, 0, 'berkas penuh tidak lagi dihitung');
    assert.equal(lama.ukuran_asli, fotoLama.ukuranPenuh, 'ukuran asli tetap tercatat');
    assert.equal(lama.ukuran_thumb, fotoLama.ukuranThumb);
    assert.ok(!berkasAda(fotoLama.nama), 'berkas penuh harus terhapus');
    assert.ok(berkasAda(fotoLama.namaThumb), 'thumbnail harus tetap ada');

    // Foto 25 bulan: baris dan kedua berkas hilang.
    assert.equal(db.prepare('SELECT COUNT(*) c FROM kegiatan_foto WHERE id=?').get(fotoSangatLama.id).c, 0);
    assert.ok(!berkasAda(fotoSangatLama.nama));
    assert.ok(!berkasAda(fotoSangatLama.namaThumb));

    // Foto hari ini tidak tersentuh.
    const baru = db.prepare('SELECT * FROM kegiatan_foto WHERE id=?').get(fotoBaru.id);
    assert.equal(baru.diarsipkan, 0);
    assert.equal(baru.size_bytes, fotoBaru.ukuranPenuh);
    assert.ok(berkasAda(fotoBaru.nama) && berkasAda(fotoBaru.namaThumb));
  });

  it('foto yang diarsipkan tetap tampil di galeri dengan thumbnail', async () => {
    const r = await req('GET', '/api/kegiatan?limit=200', null, tokenAdmin);
    assert.equal(r.status, 200);
    const baris = r.body.find((x) => x.id === fotoLama.id);
    assert.ok(baris, 'foto arsip harus tetap terdaftar');
    assert.equal(baris.diarsipkan, true);
    assert.equal(baris.url, baris.thumb_url, 'url diarahkan ke thumbnail supaya tidak 404');

    const thumb = await fetch(`${BASE}${baris.thumb_url}`, { headers: { Authorization: `Bearer ${tokenAdmin}` } });
    assert.equal(thumb.status, 200, 'thumbnail arsip masih bisa diambil');
  });

  it('putaran kedua tidak mengulang pekerjaan', async () => {
    const r = await req('POST', '/api/retensi/jalankan', {}, tokenAdmin);
    assert.equal(r.status, 200);
    assert.equal(r.body.hasil.diarsip.foto, 0);
    assert.equal(r.body.hasil.dihapus.foto, 0);
  });

  it('membersihkan berkas yatim, tetapi tidak menyentuh berkas baru', async () => {
    const namaYatim = `${rombel.id}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`;
    const namaBaru = `${rombel.id}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`;
    fs.writeFileSync(path.join(DIR, namaYatim), Buffer.alloc(1024));
    fs.writeFileSync(path.join(DIR, namaBaru), Buffer.alloc(1024));
    dibuat.berkas.push(namaYatim, namaBaru);
    // Berkas yatim dibuat "kemarin" supaya lolos ambang 24 jam.
    const kemarin = new Date(Date.now() - 48 * 60 * 60 * 1000);
    fs.utimesSync(path.join(DIR, namaYatim), kemarin, kemarin);

    const yatim = retensi.berkasYatim().map((f) => f.nama);
    assert.ok(yatim.includes(namaYatim), 'berkas lama tanpa baris terdeteksi');
    assert.ok(!yatim.includes(namaBaru), 'berkas baru belum boleh disapu');

    const r = await req('POST', '/api/retensi/jalankan', {}, tokenAdmin);
    assert.equal(r.status, 200);
    assert.ok(r.body.hasil.yatim.berkas >= 1, 'jumlah yang dibersihkan dilaporkan terpisah dari sisa');
    assert.ok(!berkasAda(namaYatim), 'berkas yatim dibersihkan');
    assert.ok(berkasAda(namaBaru), 'berkas baru dipertahankan');
  });

  it('mencatat riwayat setiap putaran', async () => {
    const r = await req('GET', '/api/retensi', null, tokenAdmin);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.riwayat) && r.body.riwayat.length >= 2, 'riwayat tersimpan');
    const terbaru = r.body.riwayat[0];
    assert.equal(terbaru.mode, 'manual');
    assert.ok(terbaru.dijalankan_at);
    assert.ok('foto_diarsip' in terbaru && 'byte_dihapus' in terbaru);
  });

  it('mematikan kebijakan berarti tidak ada foto yang disentuh', async () => {
    const r = await req('PUT', '/api/retensi', { aktif: false, arsipBulan: 0, hapusBulan: 0 }, tokenAdmin);
    assert.equal(r.status, 200);
    assert.equal(r.body.setelan.arsipBulan, 0);
    assert.equal(r.body.setelan.hapusBulan, 0);

    const pratinjau = await req('GET', '/api/retensi', null, tokenAdmin);
    assert.equal(pratinjau.body.akan_arsip.foto, 0);
    assert.equal(pratinjau.body.akan_hapus.foto, 0);

    const jalan = await req('POST', '/api/retensi/jalankan', {}, tokenAdmin);
    assert.equal(jalan.body.hasil.diarsip.foto, 0);
    assert.equal(jalan.body.hasil.dihapus.foto, 0);
  });
});
