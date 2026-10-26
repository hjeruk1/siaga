// Tes pengingat tagihan.
//
// Yang dijaga:
//   - tanggal jatuh tempo diturunkan benar (termasuk akhir bulan pendek)
//   - tahap pengingat tepat di batas H-, hari-H, dan lewat jatuh tempo
//   - hanya tagihan belum lunas & masih bersisa yang diingatkan
//   - satu tahap hanya dikirim SEKALI (anti-spam) — inilah yang mencegah
//     orang tua menerima pesan sama setiap hari
//   - tanggal mulai menahan tunggakan lama; tombol manual boleh menyertakannya
//   - pengiriman benar-benar membuat notifikasi + pesan WA, dan rutenya
//     menghormati peran (admin_cabang tidak boleh mengubah kebijakan)
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const db = require('../backend/db');
const bcrypt = require('../backend/node_modules/bcryptjs');

process.env.JWT_SECRET ||= 'siaga-test-secret-change-me';
// Kanal WA diuji dengan provider 'log' (diset harness). Tipe pengingat harus
// diizinkan eksplisit: tanpa ini WA memang sengaja tidak dikirim.
// Diset juga saat berkas ini dijalankan sendiri (`node --test`) supaya tes
// tidak lulus/gagal tergantung harness.
process.env.WA_PROVIDER ||= 'log';
process.env.WA_DELAY_MS ||= '0';
process.env.WA_TIPE_AKTIF = 'daily_published,invoice_issued,tagihan_jatuh_tempo';

const pengingat = require('../backend/utils/pengingat');
const wa = require('../backend/utils/wa');

const BASE = process.env.TEST_URL || 'http://127.0.0.1:3999';
const NYAWA = Date.now();
const HARI_INI = '2026-10-15';
const nowIso = () => new Date().toISOString();

function req(method, path, body, token) {
  return fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
}

async function login(username, password) {
  const r = await req('POST', '/api/auth/login', { tipe: 'staff', username, password });
  return r.body?.token || null;
}

// Menunggu kondisi asinkron (antrean WA) sampai batas waktu.
async function tungguSampai(cek, batasMs = 5000) {
  const batas = Date.now() + batasMs;
  while (Date.now() < batas) {
    const nilai = cek();
    if (nilai) return nilai;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

function refKelas() {
  const cabang = db.prepare('SELECT id FROM cabang ORDER BY id LIMIT 1').get();
  const jenjang = db.prepare('SELECT id FROM jenjang ORDER BY urutan LIMIT 1').get();
  const rombel = db.prepare('SELECT id FROM rombel WHERE cabang_id=? ORDER BY id LIMIT 1').get(cabang.id);
  return { cabang, jenjang, rombel };
}

function buatWali(nama, noWa) {
  return db
    .prepare(
      `INSERT INTO pengguna(tipe,role,display_name,username,no_wa,password_hash,status,must_change_password,created_at,updated_at)
       VALUES('wali','wali',?,?,?,?,'aktif',0,?,?)`
    )
    .run(`Wali ${nama}`, `wali-pg-${nama}-${NYAWA}`, noWa, bcrypt.hashSync('admin123', 8), nowIso(), nowIso())
    .lastInsertRowid;
}

const dibuat = { pengguna: [], siswa: [], tagihan: [] };

function buatSiswa(nama, waliId) {
  const { cabang, jenjang, rombel } = refKelas();
  const siswaId = db
    .prepare(
      `INSERT INTO siswa(nama,status,foto,catatan_khusus,created_at,updated_at)
       VALUES(?,'aktif',NULL,'fixture pengingat',?,?)`
    )
    .run(nama, nowIso(), nowIso()).lastInsertRowid;
  dibuat.siswa.push(siswaId);
  if (waliId) {
    db.prepare("INSERT INTO wali_siswa(wali_pengguna_id,siswa_id,relasi,aktif,created_at) VALUES(?,?,'Ayah',1,?)").run(
      waliId,
      siswaId,
      nowIso()
    );
  }
  db.prepare(
    `INSERT INTO siswa_enrollment(siswa_id,cabang_id,jenjang_id,rombel_id,paket,tanggal_mulai,status,created_at,created_by)
     VALUES(?,?,?,?,'reguler','2026-01-01','aktif',?,NULL)`
  ).run(siswaId, cabang.id, jenjang.id, rombel.id, nowIso());
  return { siswaId, cabangId: cabang.id, jenjangId: jenjang.id, rombelId: rombel.id };
}

function buatTagihan(ref, { nama, jatuhTempo, nominal = 350000, status = 'open', periode = '2026-10' }) {
  const id = db
    .prepare(
      `INSERT INTO tagihan(siswa_id,cabang_id,jenjang_id,rombel_id,paket,tahun_ajaran,periode,jenis,nama,
        nominal_awal,diskon_amount,nominal_final,jatuh_tempo,status,created_by,created_at,updated_at)
       VALUES(?,?,?,?,'reguler','2026/2027',?,'spp',?,?,0,?,?,?,NULL,?,?)`
    )
    .run(
      ref.siswaId,
      ref.cabangId,
      ref.jenjangId,
      ref.rombelId,
      periode,
      nama,
      nominal,
      nominal,
      jatuhTempo,
      status,
      nowIso(),
      nowIso()
    ).lastInsertRowid;
  dibuat.tagihan.push(id);
  return id;
}

function setSetelan({ aktif = false, tanggal = 10, hariSebelum = 3, jam = '00:00', mulai = null }) {
  const simpan = db.prepare(
    `INSERT INTO setelan(kunci,nilai,updated_at) VALUES(?,?,?)
     ON CONFLICT(kunci) DO UPDATE SET nilai=excluded.nilai, updated_at=excluded.updated_at`
  );
  simpan.run('pengingat_aktif', aktif ? '1' : '0', nowIso());
  simpan.run('pengingat_tanggal_jatuh_tempo', String(tanggal), nowIso());
  simpan.run('pengingat_hari_sebelum', String(hariSebelum), nowIso());
  simpan.run('pengingat_jam', jam, nowIso());
  if (mulai) simpan.run('pengingat_mulai', mulai, nowIso());
  else db.prepare("DELETE FROM setelan WHERE kunci='pengingat_mulai'").run();
  db.prepare("DELETE FROM setelan WHERE kunci='pengingat_terakhir_jalan'").run();
}

function bersihkan() {
  const t = dibuat.tagihan.join(',');
  if (t) {
    db.prepare(`DELETE FROM tagihan_pengingat WHERE tagihan_id IN (${t})`).run();
    db.prepare(`DELETE FROM tagihan WHERE id IN (${t})`).run();
  }
  const s = dibuat.siswa.join(',');
  if (s) {
    db.prepare(`DELETE FROM wali_siswa WHERE siswa_id IN (${s})`).run();
    db.prepare(`DELETE FROM siswa_enrollment WHERE siswa_id IN (${s})`).run();
    db.prepare(`DELETE FROM siswa WHERE id IN (${s})`).run();
  }
  const p = dibuat.pengguna.join(',');
  if (p) {
    db.prepare(`DELETE FROM notifikasi WHERE recipient_pengguna_id IN (${p})`).run();
    db.prepare(`DELETE FROM audit_log WHERE actor_pengguna_id IN (${p})`).run();
    db.prepare(`DELETE FROM pengguna WHERE id IN (${p})`).run();
  }
  db.prepare("DELETE FROM setelan WHERE kunci LIKE 'pengingat_%'").run();
  db.prepare("DELETE FROM audit_log WHERE action LIKE 'pengingat_%'").run();
  dibuat.tagihan = [];
  dibuat.siswa = [];
  dibuat.pengguna = [];
}

// ---------------------------------------------------------------------------
// Bagian 1: perhitungan murni
// ---------------------------------------------------------------------------

describe('util pengingat', () => {
  it('menurunkan jatuh tempo dari periode dan membatasi akhir bulan', () => {
    assert.equal(pengingat.tanggalJatuhTempo('2026-10', 10), '2026-10-10');
    assert.equal(pengingat.tanggalJatuhTempo('2026-02', 28), '2026-02-28');
    // Tanggal 31 di Februari tidak boleh menghasilkan '2026-02-31'.
    assert.equal(pengingat.tanggalJatuhTempo('2026-02', 31), '2026-02-28');
    assert.equal(pengingat.tanggalJatuhTempo('2026-04', 31), '2026-04-30');
    assert.equal(pengingat.tanggalJatuhTempo('2026-10', 0), '2026-10-10', 'nilai aneh jatuh ke bawaan');
    assert.equal(pengingat.tanggalJatuhTempo('2026/2027', 10), null, 'periode bukan YYYY-MM ditolak');
    assert.equal(pengingat.tanggalJatuhTempo(null, 10), null);
  });

  it('menghitung selisih hari tanpa terpengaruh zona waktu', () => {
    assert.equal(pengingat.selisihHari('2026-10-15', '2026-10-15'), 0);
    assert.equal(pengingat.selisihHari('2026-10-18', '2026-10-15'), 3);
    assert.equal(pengingat.selisihHari('2026-10-14', '2026-10-15'), -1);
    assert.equal(pengingat.selisihHari('2026-11-01', '2026-10-31'), 1, 'lintas bulan');
    assert.equal(pengingat.selisihHari('bukan-tanggal', '2026-10-15'), null);
  });

  it('memilih tahap tepat di batas jendela', () => {
    // hariSebelum = 3
    assert.equal(pengingat.tahapUntuk(10, 3), null, 'masih jauh');
    assert.equal(pengingat.tahapUntuk(4, 3), null);
    assert.equal(pengingat.tahapUntuk(3, 3), 'h_sebelum');
    assert.equal(pengingat.tahapUntuk(1, 3), 'h_sebelum');
    assert.equal(pengingat.tahapUntuk(0, 3), 'jatuh_tempo');
    assert.equal(pengingat.tahapUntuk(-1, 3), 'terlambat');
    assert.equal(pengingat.tahapUntuk(-pengingat.MAKS_TERLAMBAT_HARI, 3), 'terlambat');
    assert.equal(pengingat.tahapUntuk(-pengingat.MAKS_TERLAMBAT_HARI - 1, 3), null, 'tunggakan terlalu tua');
    // hariSebelum 0 berarti hanya hari-H dan setelahnya.
    assert.equal(pengingat.tahapUntuk(1, 0), null);
    assert.equal(pengingat.tahapUntuk(0, 0), 'jatuh_tempo');
  });

  it('menyusun pesan yang menyebut anak, nominal, dan tanggal', () => {
    const dasar = {
      nama: 'SPP Oktober 2026',
      siswa_nama: 'Aisyah',
      sisa: 350000,
      jatuh_tempo: '2026-10-18',
      hari_tersisa: 3
    };
    const h3 = pengingat.susunPesan({ ...dasar, tahap: 'h_sebelum' });
    assert.match(h3.title, /jatuh tempo 3 hari lagi/);
    assert.match(h3.body, /Aisyah/);
    assert.match(h3.body, /350\.000/);
    assert.match(h3.body, /18 Okt 2026/);

    const hariIni = pengingat.susunPesan({ ...dasar, tahap: 'jatuh_tempo' });
    assert.match(hariIni.title, /jatuh tempo hari ini/);

    const telat = pengingat.susunPesan({ ...dasar, tahap: 'terlambat' });
    assert.match(telat.title, /lewat jatuh tempo/);
    assert.match(telat.body, /segera diselesaikan/);
  });
});

// ---------------------------------------------------------------------------
// Bagian 2: pemilihan tagihan dari database
// ---------------------------------------------------------------------------

describe('pemilihan tagihan', () => {
  let ref;
  let waliId;
  let billH3;
  let billHariIni;
  let billTelat;
  let billTua;
  let billLunas;
  let billNol;

  before(() => {
    const wali = buatWali(`pg${NYAWA}`, `0812${String(NYAWA).slice(-8)}`);
    dibuat.pengguna.push(wali);
    waliId = wali;
    ref = buatSiswa(`Siswa Pengingat ${NYAWA}`, wali);
    billH3 = buatTagihan(ref, { nama: 'SPP H3', jatuhTempo: '2026-10-18' });
    billHariIni = buatTagihan(ref, { nama: 'SPP Hari Ini', jatuhTempo: '2026-10-15' });
    billTelat = buatTagihan(ref, { nama: 'SPP Telat', jatuhTempo: '2026-10-14' });
    billTua = buatTagihan(ref, { nama: 'SPP Tua', jatuhTempo: '2026-08-01' });
    billLunas = buatTagihan(ref, { nama: 'SPP Lunas', jatuhTempo: '2026-10-16', status: 'lunas' });
    billNol = buatTagihan(ref, { nama: 'SPP Nol', jatuhTempo: '2026-10-16', nominal: 0 });
  });

  after(bersihkan);

  it('memilih tagihan sesuai tahap dan melewati yang lunas/nol/terlalu tua', () => {
    setSetelan({ aktif: true, hariSebelum: 3 });
    const { kandidat } = pengingat.daftarKandidat({ tanggal: HARI_INI });
    const ids = kandidat.map((k) => k.tagihan_id);
    assert.ok(ids.includes(billH3), 'H-3 masuk');
    assert.ok(ids.includes(billHariIni), 'hari-H masuk');
    assert.ok(ids.includes(billTelat), 'terlambat masuk');
    assert.ok(!ids.includes(billTua), 'terlambat 75 hari dilewati');
    assert.ok(!ids.includes(billLunas), 'lunas dilewati');
    assert.ok(!ids.includes(billNol), 'nominal nol dilewati');

    const tahap = Object.fromEntries(kandidat.map((k) => [k.tagihan_id, k.tahap]));
    assert.equal(tahap[billH3], 'h_sebelum');
    assert.equal(tahap[billHariIni], 'jatuh_tempo');
    assert.equal(tahap[billTelat], 'terlambat');
    // Sisa dihitung dari nominal final (belum ada pembayaran di fixture ini).
    assert.equal(kandidat.find((k) => k.tagihan_id === billH3).sisa, 350000);
  });

  it('satu tahap hanya terkirim sekali (anti-spam)', () => {
    setSetelan({ aktif: true, hariSebelum: 3 });
    const milikKita = new Set([billH3, billHariIni, billTelat]);
    const pertama = pengingat.kirimPengingat({ tanggal: HARI_INI });
    assert.ok(pertama.terkirim >= 3, 'kiriman pertama mengirim beberapa pesan');
    for (const id of milikKita) {
      assert.equal(
        db.prepare('SELECT COUNT(*) c FROM tagihan_pengingat WHERE tagihan_id=?').get(id).c,
        1,
        'satu baris per tahap per tagihan'
      );
    }

    // Berkas tes lain memakai database yang sama, jadi yang dijaga adalah
    // tagihan milik tes ini — bukan total global.
    const kedua = pengingat.kirimPengingat({ tanggal: HARI_INI });
    const ulang = kedua.detail.filter((d) => milikKita.has(d.tagihan_id));
    assert.equal(ulang.length, 0, 'kiriman kedua tidak mengulang pesan yang sama');
  });

  it('notifikasi tercatat untuk wali dengan tipe dan entity tagihan', () => {
    const n = db
      .prepare(
        `SELECT * FROM notifikasi WHERE recipient_pengguna_id=? AND tipe='tagihan_jatuh_tempo' AND entity_id=? ORDER BY id DESC LIMIT 1`
      )
      .get(waliId, billHariIni);
    assert.ok(n, 'notifikasi pengingat harus ada');
    assert.match(n.title, /jatuh tempo hari ini/);
    assert.equal(n.entity_type, 'tagihan');
    assert.ok(n.body.includes('Siswa Pengingat'), 'body menyebut nama anak');
  });

  it('mengirim lewat WhatsApp per cabang (provider log)', async () => {
    // Kalau database ini punya akun WhatsApp aktif, kirimWA memakai nomor
    // cabang SUNGGUHAN — tes tidak boleh menyentuh nomor nyata. Harness tes
    // selalu bermigrasi dari nol (tanpa wa_akun), jadi jalur log hanya diuji
    // di sana; di DB dev kita cukup memastikan notifikasi in-app terbentuk.
    const adaAkunNyata = !!db.prepare('SELECT 1 FROM wa_akun WHERE aktif=1 LIMIT 1').get();
    const sebelum = wa._riwayatUji.length;
    const baru = buatTagihan(ref, { nama: 'SPP Baru WA', jatuhTempo: '2026-10-20', periode: '2026-11' });
    const hasil = pengingat.kirimPengingat({ tanggal: '2026-10-18' });
    assert.ok(hasil.terkirim > 0);

    const notif = db
      .prepare(`SELECT * FROM notifikasi WHERE recipient_pengguna_id=? AND entity_id=? ORDER BY id DESC LIMIT 1`)
      .get(waliId, baru);
    assert.ok(notif, 'notifikasi in-app selalu dibuat, apa pun kanal luarnya');

    if (adaAkunNyata) return; // lihat komentar di atas

    // Antrean WA berpacu (jeda acak sampai ~0,7 detik per pesan), dan berkas
    // tes lain bisa meninggalkan pesan di antrean yang sama. Jadi tunggu
    // sampai batas waktu, bukan menebak satu jeda tetap.
    const terkirim = await tungguSampai(() => {
      const daftar = wa._riwayatUji.slice(sebelum).filter((m) => m.chatId === `62812${String(NYAWA).slice(-8)}@c.us`);
      return daftar.length > 0 ? daftar : null;
    });
    assert.ok(
      terkirim,
      `pesan WA harus terkirim ke nomor wali (riwayat ${wa._riwayatUji.length}, mode ${wa.statusWA().mode}, tipe ${[...wa.tipeAktif()].join('|')})`
    );
    assert.ok(
      terkirim.some((m) => /jatuh tempo|lewat jatuh tempo/.test(m.pesan)),
      'isi pesan memuat konteks jatuh tempo'
    );
    const waSentAt = await tungguSampai(
      () => db.prepare('SELECT wa_sent_at FROM notifikasi WHERE id=?').get(notif.id)?.wa_sent_at
    );
    assert.ok(waSentAt, 'wa_sent_at terisi setelah pengiriman');
  });

  it('tanggal mulai menahan tunggakan lama; mode manual menyertakannya', () => {
    // Tagihan BARU yang belum pernah diingatkan: kalau memakai fixture lama,
    // anti-spam sudah menahannya dan tes ini tidak membuktikan apa pun.
    const lama = buatTagihan(ref, { nama: 'SPP Lama A', jatuhTempo: '2026-10-10', periode: '2030-03' });
    setSetelan({ aktif: true, hariSebelum: 3, mulai: '2026-10-20' });

    const otomatis = pengingat.daftarKandidat({ tanggal: HARI_INI });
    assert.ok(
      !otomatis.kandidat.some((k) => k.tagihan_id === lama),
      'job otomatis tidak mengejar tunggakan sebelum tanggal mulai'
    );

    const manual = pengingat.daftarKandidat({ tanggal: HARI_INI, abaikanMulai: true });
    assert.ok(
      manual.kandidat.some((k) => k.tagihan_id === lama),
      'tombol manual tetap boleh menyertakan tunggakan'
    );
  });

  it('tagihan tanpa wali dihitung, tidak dikirim', () => {
    const tanpaWali = buatSiswa(`Siswa Tanpa Wali ${NYAWA}`, null);
    const bill = buatTagihan(tanpaWali, { nama: 'SPP Tanpa Wali', jatuhTempo: '2026-10-16', periode: '2026-12' });
    setSetelan({ aktif: true, hariSebelum: 3 });
    const hasil = pengingat.kirimPengingat({ tanggal: HARI_INI });
    assert.ok(hasil.tanpa_wali >= 1);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM tagihan_pengingat WHERE tagihan_id=?').get(bill).c, 0);
  });

  it('job harian tidak berjalan bila nonaktif atau sebelum jam kirim', () => {
    setSetelan({ aktif: false });
    assert.equal(pengingat.jalanHarian({ sekarang: new Date('2026-10-15T01:00:00Z') }).status, 'nonaktif');

    setSetelan({ aktif: true, jam: '23:59' });
    const belumJam = pengingat.jalanHarian({ sekarang: new Date('2026-10-15T01:00:00Z') });
    assert.equal(belumJam.status, 'belum-jam');
  });
});

// ---------------------------------------------------------------------------
// Bagian 3: rute HTTP
// ---------------------------------------------------------------------------

describe('rute pengingat', () => {
  let tokenAdmin;
  let tokenCabang;

  // Tanggal relatif terhadap HARI INI sungguhan: rute memakai todayWIB(), jadi
  // fixture harus bergerak bersama jam sistem — bukan tanggal tetap.
  function tanggalRelatif(offsetHari) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + offsetHari);
    return d.toISOString().slice(0, 10);
  }

  before(async () => {
    tokenAdmin = await login('admin', 'admin123');
    assert.ok(tokenAdmin, 'login admin harus berhasil');

    const { cabang } = refKelas();
    const id = db
      .prepare(
        `INSERT INTO pengguna(tipe,role,display_name,username,password_hash,status,must_change_password,created_at,updated_at)
         VALUES('staff','admin_cabang',?,?,?,'aktif',0,?,?)`
      )
      .run(
        `Admin Cabang PG ${NYAWA}`,
        `pg-cabang-${NYAWA}`,
        bcrypt.hashSync('admin123', 8),
        nowIso(),
        nowIso()
      ).lastInsertRowid;
    db.prepare('INSERT INTO staff_profile(pengguna_id,cabang_id) VALUES(?,?)').run(id, cabang.id);
    dibuat.pengguna.push(id);
    tokenCabang = await login(`pg-cabang-${NYAWA}`, 'admin123');
    assert.ok(tokenCabang, 'login admin cabang harus berhasil');

    // Fixture untuk uji kirim: satu tagihan jatuh tempo 2 hari lagi, satu lewat.
    const wali = buatWali(`rute${NYAWA}`, `0813${String(NYAWA).slice(-8)}`);
    dibuat.pengguna.push(wali);
    const ref = buatSiswa(`Siswa Rute ${NYAWA}`, wali);
    buatTagihan(ref, { nama: 'SPP Rute H2', jatuhTempo: tanggalRelatif(2), periode: '2030-01' });
    buatTagihan(ref, { nama: 'SPP Rute Telat', jatuhTempo: tanggalRelatif(-1), periode: '2030-02' });
  });

  after(bersihkan);

  it('admin bisa membaca setelan dan pratinjau', async () => {
    const s = await req('GET', '/api/pengingat/setelan', null, tokenAdmin);
    assert.equal(s.status, 200);
    assert.ok(s.body.setelan, 'ada objek setelan');
    assert.ok(s.body.hari_ini, 'ada ringkasan hari ini');
    assert.ok(s.body.tunggakan, 'ada ringkasan tunggakan');

    const p = await req('GET', '/api/pengingat/pratinjau', null, tokenAdmin);
    assert.equal(p.status, 200);
    assert.equal(p.body.mode, 'otomatis');
    assert.equal(typeof p.body.total, 'number');

    const pm = await req('GET', '/api/pengingat/pratinjau?mode=manual', null, tokenAdmin);
    assert.equal(pm.body.mode, 'manual');
    assert.ok(pm.body.total >= p.body.total, 'mode manual tidak boleh lebih sedikit');
  });

  it('admin bisa mengubah setelan; admin cabang ditolak', async () => {
    const ok = await req('PUT', '/api/pengingat/setelan', { aktif: true, tanggal: 5, hariSebelum: 2 }, tokenAdmin);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.setelan.tanggal, 5);
    assert.equal(ok.body.setelan.hariSebelum, 2);
    assert.ok(ok.body.setelan.mulai, 'tanggal mulai dipasang saat pertama diaktifkan');

    const tolak = await req('PUT', '/api/pengingat/setelan', { aktif: false }, tokenCabang);
    assert.equal(tolak.status, 403, 'kebijakan penagihan bukan wewenang admin cabang');
  });

  it('kirim manual melaporkan jumlah dan menghormati anti-spam', async () => {
    setSetelan({ aktif: true, hariSebelum: 3 });
    const r = await req('POST', '/api/pengingat/kirim', { mode: 'semua' }, tokenAdmin);
    assert.equal(r.status, 200);
    assert.equal(r.body.mode, 'semua');
    assert.ok(r.body.terkirim > 0, 'harus ada yang terkirim pada percobaan pertama');

    const lagi = await req('POST', '/api/pengingat/kirim', { mode: 'semua' }, tokenAdmin);
    assert.equal(lagi.body.terkirim, 0, 'percobaan kedua tidak mengulang');

    const tolak = await req('POST', '/api/pengingat/kirim', {}, tokenCabang);
    assert.equal(tolak.status, 403);
  });
});
