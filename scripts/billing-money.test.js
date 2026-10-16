const test = require('node:test');
const assert = require('node:assert');
const db = require('../backend/db');
const bcrypt = require('../backend/node_modules/bcryptjs');

const BASE_URL = process.env.TEST_URL || 'http://127.0.0.1:3999';

const P1 = '2026-09';
const P2 = '2026-10';
const P3 = '2026-11';
const UNIQUE = Date.now();

function schoolYear(period) {
  const [year, month] = period.split('-').map(Number);
  const start = month >= 7 ? year : year - 1;
  return `${start}/${start + 1}`;
}
const TAHUN = schoolYear(P2);

async function req(method, path, body, token) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  let parsed = raw;
  try { parsed = JSON.parse(raw); } catch {}
  return { status: res.status, body: parsed, raw };
}

async function login(username = 'admin', password = process.env.TEST_ADMIN_PASSWORD || 'admin123') {
  const res = await req('POST', '/api/auth/login', { tipe: 'staff', username, password });
  assert.equal(res.status, 200, `login ${username} gagal: ${res.raw}`);
  return res.body.token;
}

function billFor(response, siswaId, periode, jenis) {
  return response.body.find(b => Number(b.siswa_id) === Number(siswaId) && b.periode === periode && b.jenis === jenis);
}

function paidOf(tagihanId) {
  return db.prepare(`SELECT COALESCE(SUM(pa.nominal),0) AS paid
    FROM pembayaran_alokasi pa JOIN pembayaran p ON p.id=pa.pembayaran_id
    WHERE pa.tagihan_id=? AND p.status='confirmed'`).get(tagihanId).paid;
}

async function billsOf(token, siswaId, label) {
  const res = await req('GET', `/api/billing/tagihan?siswa_id=${siswaId}`, undefined, token);
  assert.equal(res.status, 200, `GET tagihan ${label} gagal: ${res.raw}`);
  return res;
}

async function createStudent(token, m, suffix, paket, tanggalMulai) {
  const res = await req('POST', '/api/siswa', {
    nama: `Siswa Billing ${suffix}`,
    nis: `BL${suffix}`,
    cabang_id: m.cabang.id,
    jenjang_id: m.jenjang.id,
    rombel_id: m.rombel.id,
    paket,
    tanggal_mulai: tanggalMulai
  }, token);
  assert.equal(res.status, 200, `create siswa ${suffix} gagal: ${res.raw}`);
  return res.body;
}

async function createTarif(token, m, jenis, nominal, suffix) {
  const res = await req('POST', '/api/billing/tarif', {
    cabang_id: m.cabang.id,
    jenjang_id: m.jenjang.id,
    jenis,
    nama: `Tarif ${jenis} ${suffix}`,
    nominal,
    tahun_ajaran: TAHUN
  }, token);
  assert.equal(res.status, 200, `create tarif ${jenis} gagal: ${res.raw}`);
  return res.body;
}

async function createDiskon(token, siswaId, tipe, jenis, nilai, suffix) {
  const res = await req('POST', '/api/billing/diskon', {
    cabang_id: cabang.id,
    siswa_id: siswaId,
    tipe,
    jenis,
    nilai,
    tahun_ajaran: TAHUN,
    catatan: `diskon test ${suffix}`
  }, token);
  assert.equal(res.status, 200, `create diskon ${tipe}/${jenis} gagal: ${res.raw}`);
  return res.body;
}
async function pay(token, body) {
  const res = await req('POST', '/api/billing/pembayaran', body, token);
  return res;
}

let adminToken, cabangToken, adminCabangUserId, cabang;
let mA, mB;
let siswaA, siswaB, siswaD, siswaE;
let billA_spp, billA_full, billB;
let billD1, billD2, billD3;
let billE;
let payFull, payPartial, payClamp, payVoid;

test.before(async () => {
  adminToken = await login();

  const cabangList = await req('GET', '/api/master/cabang', undefined, adminToken);
  assert.equal(cabangList.status, 200);
  cabang = cabangList.body[0];

  const jenjangRows = db.prepare("SELECT * FROM jenjang WHERE tipe != 'care' ORDER BY urutan LIMIT 2").all();
  assert.ok(jenjangRows.length >= 2, 'butuh dua jenjang reguler untuk tarif terpisah');

  const rombelList = await req('GET', `/api/master/rombel?cabang_id=${cabang.id}`, undefined, adminToken);
  assert.equal(rombelList.status, 200);
  const rombelA = rombelList.body.find(r => Number(r.jenjang_id) === Number(jenjangRows[0].id)) || rombelList.body[0];
  const rombelB = rombelList.body.find(r => Number(r.jenjang_id) === Number(jenjangRows[1].id)) || rombelList.body[0];

  mA = { cabang, jenjang: jenjangRows[0], rombel: rombelA };
  mB = { cabang, jenjang: jenjangRows[1], rombel: rombelB };

  siswaA = await createStudent(adminToken, mA, `A${UNIQUE}`, 'full_day', '2026-01-01');
  siswaB = await createStudent(adminToken, mB, `B${UNIQUE}`, 'reguler', '2026-01-01');
  siswaD = await createStudent(adminToken, mA, `D${UNIQUE}`, 'reguler', '2026-01-01');
  siswaE = await createStudent(adminToken, mA, `E${UNIQUE}`, 'reguler', '2026-01-01');

  // Tarif untuk dua jenjang terpisah sehingga lookup tarif tidak bertumpuk.
  await createTarif(adminToken, mA, 'spp', 1000000, UNIQUE);
  await createTarif(adminToken, mA, 'full_day', 999999, UNIQUE);
  await createTarif(adminToken, mB, 'spp', 50000, UNIQUE);

  // Diskon siswa A: persen biasa dan persen yang menghasilkan pecahan.
  await createDiskon(adminToken, siswaA.id, 'persen', 'spp', 10, UNIQUE);
  await createDiskon(adminToken, siswaA.id, 'persen', 'full_day', 12.345, UNIQUE);
  // Diskon siswa B: nominal diskon melebihi tarif.
  await createDiskon(adminToken, siswaB.id, 'nominal', 'spp', 60000, UNIQUE);

  // User admin_cabang untuk menguji pembayaran non-tunai yang perlu verifikasi.
  const hash = bcrypt.hashSync('cabang-test-123', 10);
  const now = db.prepare("SELECT datetime('now') AS n").get().n;
  const r = db.prepare(`INSERT INTO pengguna(tipe,role,display_name,username,password_hash,status,must_change_password,created_at,updated_at)
    VALUES('staff','admin_cabang','Kepala Cabang Test','cabang_test',?,?,0,?,?)`).run(hash, 'aktif', now, now);
  adminCabangUserId = r.lastInsertRowid;
  db.prepare('INSERT INTO staff_profile(pengguna_id,cabang_id,jabatan) VALUES(?,?,?)')
    .run(Number(r.lastInsertRowid), cabang.id, 'Kepala Cabang Test');

  cabangToken = await login('cabang_test', 'cabang-test-123');
  const me = await req('GET', '/api/auth/me', undefined, cabangToken);
  assert.equal(me.status, 200, 'GET /api/auth/me gagal');
  assert.equal(me.body.role, 'admin_cabang');
  assert.equal(Number(me.body.cabang_id), Number(cabang.id), 'admin_cabang harus tergabung ke cabang test');
});

test('men-generate tagihan bulanan dengan diskon persen dan pembulatan', async () => {
  const gen = await req('POST', '/api/billing/generate-bulanan', { periode: P2, cabang_id: cabang.id }, adminToken);
  assert.equal(gen.status, 200, gen.raw);
  assert.ok(Number(gen.body.created_count) >= 1, 'harus ada tagihan baru');

  const bills = await billsOf(adminToken, siswaA.id, 'A');
  billA_spp = billFor(bills, siswaA.id, P2, 'spp');
  billA_full = billFor(bills, siswaA.id, P2, 'full_day');
  assert.ok(billA_spp, 'tagihan SPP siswa A ada');
  assert.ok(billA_full, 'tagihan full_day siswa A ada');
  assert.equal(billA_spp.nominal_final, 900000, 'diskon 10% dari 1000000');
  assert.equal(billA_spp.status, 'open');
  assert.equal(billA_spp.diskon_amount, 100000);
  // 999999 x 12.345% = 123449.877... dibulatkan ke 123450.
  assert.equal(billA_full.diskon_amount, 123450, 'diskon persen pecahan dibulatkan');
  assert.equal(billA_full.nominal_final, 876549);
});

test('menahan nominal final di nol saat diskon nominal melebihi tarif', async () => {
  const bills = await billsOf(adminToken, siswaB.id, 'B');
  billB = billFor(bills, siswaB.id, P2, 'spp');
  assert.ok(billB, 'tagihan SPP siswa B ada');
  assert.equal(billB.nominal_final, 0, 'diskon menutupi seluruh tarif');
  assert.equal(billB.status, 'open');
});

test('mengalokasi pembayaran tunai secara FIFO antar periode', async () => {
  for (const periode of [P1, P2]) {
    const gen = await req('POST', '/api/billing/generate-bulanan', { periode, cabang_id: cabang.id }, adminToken);
    assert.equal(gen.status, 200, gen.raw);
  }
  const bills = await billsOf(adminToken, siswaD.id, 'D');
  billD1 = billFor(bills, siswaD.id, P1, 'spp');
  billD2 = billFor(bills, siswaD.id, P2, 'spp');
  assert.ok(billD1 && billD2, 'dua tagihan periode berbeda');

  payFull = await pay(adminToken, { cabang_id: cabang.id, siswa_id: siswaD.id, nominal: 1500000, metode: 'tunai', tanggal_bayar: '2026-10-16', catatan: 'bayar dua bulan' });
  assert.equal(payFull.status, 200, payFull.raw);
  assert.equal(payFull.body.status, 'confirmed');
  assert.match(payFull.body.receipt_no, /^TP-/, 'pembayaran terkonfirmasi mendapat struk');

  const after = await billsOf(adminToken, siswaD.id, 'D-after-fifo');
  const d1 = billFor(after, siswaD.id, P1, 'spp');
  const d2 = billFor(after, siswaD.id, P2, 'spp');
  assert.equal(d1.nominal_final - paidOf(billD1.id), 0, 'tagihan periode pertama lunas');
  assert.equal(d1.status, 'lunas');
  assert.equal(d2.nominal_final - paidOf(billD2.id), 500000, 'sisa masuk tagihan periode kedua');
  assert.equal(d2.status, 'sebagian');
});

test('alokasi eksplisit tidak mengisi sisa dan menyimpan kredit', async () => {
  payPartial = await pay(adminToken, {
    cabang_id: cabang.id,
    siswa_id: siswaD.id,
    nominal: 200000,
    metode: 'tunai',
    tanggal_bayar: '2026-10-16',
    alokasi: [{ tagihan_id: billD2.id, nominal: 120000 }]
  });
  assert.equal(payPartial.status, 200, payPartial.raw);

  const list = await req('GET', `/api/billing/pembayaran?siswa_id=${siswaD.id}`, undefined, adminToken);
  assert.equal(list.status, 200, list.raw);
  const row = list.body.find(p => Number(p.id) === Number(payPartial.body.id));
  assert.ok(row, 'pembayaran tampil di daftar');
  assert.equal(Number(row.allocated_amount), 120000, 'hanya alokasi eksplisit yang dipakai');
  assert.equal(Number(row.credit_amount), 80000, 'sisa menjadi kredit pembayaran');

  const bills = await billsOf(adminToken, siswaD.id, 'D-after-explicit');
  const d2 = billFor(bills, siswaD.id, P2, 'spp');
  assert.equal(d2.status, 'sebagian');
  assert.equal(paidOf(billD2.id), 620000);
});

test('menolak alokasi ke tagihan siswa lain', async () => {
  const before = db.prepare('SELECT COUNT(*) AS n FROM pembayaran WHERE siswa_id=?').get(siswaD.id).n;
  const res = await pay(adminToken, {
    cabang_id: cabang.id,
    siswa_id: siswaD.id,
    nominal: 100000,
    metode: 'tunai',
    tanggal_bayar: '2026-10-16',
    alokasi: [{ tagihan_id: billA_spp.id, nominal: 50000 }]
  });
  assert.equal(res.status, 400, 'tagihan siswa lain harus ditolak');
  assert.match(String(res.body.error), /bukan milik siswa/);
  const after = db.prepare('SELECT COUNT(*) AS n FROM pembayaran WHERE siswa_id=?').get(siswaD.id).n;
  assert.equal(after, before, 'transaksi ditolak tidak boleh menyimpan baris pembayaran');
});

test('membatasi alokasi yang melebihi sisa tagihan, bukan meng-oversell', async () => {
  payClamp = await pay(adminToken, {
    cabang_id: cabang.id,
    siswa_id: siswaD.id,
    nominal: 500000,
    metode: 'tunai',
    tanggal_bayar: '2026-10-16',
    alokasi: [{ tagihan_id: billD2.id, nominal: 999999 }]
  });
  assert.equal(payClamp.status, 200, payClamp.raw);

  const bills = await billsOf(adminToken, siswaD.id, 'D-after-clamp');
  const d2 = billFor(bills, siswaD.id, P2, 'spp');
  assert.equal(d2.status, 'lunas', 'alokasi dipotong ke sisa tagihan');
  assert.equal(paidOf(billD2.id), d2.nominal_final);

  const list = await req('GET', `/api/billing/pembayaran?siswa_id=${siswaD.id}`, undefined, adminToken);
  const row = list.body.find(p => Number(p.id) === Number(payClamp.body.id));
  assert.equal(Number(row.allocated_amount), 380000, 'alokasi terpotong ke 380000');
  assert.equal(Number(row.credit_amount), 120000, 'lebihannya jadi kredit');
});

test('mengunci edit alokasi di bawah nominal pembayaran dan sisa tagihan', async () => {
  const gen = await req('POST', '/api/billing/generate-bulanan', { periode: P3, cabang_id: cabang.id }, adminToken);
  assert.equal(gen.status, 200, gen.raw);
  const bills = await billsOf(adminToken, siswaD.id, 'D-p3');
  billD3 = billFor(bills, siswaD.id, P3, 'spp');
  assert.ok(billD3, 'tagihan periode ketiga ada');

  const ok = await req('PUT', `/api/billing/pembayaran/${payPartial.body.id}/alokasi`, {
    alokasi: [{ tagihan_id: billD3.id, nominal: 120000 }]
  }, adminToken);
  assert.equal(ok.status, 200, `edit alokasi valid: ${ok.raw}`);
  assert.equal(paidOf(billD3.id), 120000, 'alokasi pindah ke tagihan periode ketiga');

  const overPayment = await req('PUT', `/api/billing/pembayaran/${payPartial.body.id}/alokasi`, {
    alokasi: [{ tagihan_id: billD3.id, nominal: 999999 }]
  }, adminToken);
  assert.equal(overPayment.status, 400, 'total alokasi melebihi nominal pembayaran harus 400');
  assert.match(String(overPayment.body.error), /melebihi nominal pembayaran/);

  const overBill = await req('PUT', `/api/billing/pembayaran/${payPartial.body.id}/alokasi`, {
    alokasi: [{ tagihan_id: billD2.id, nominal: 200000 }]
  }, adminToken);
  assert.equal(overBill.status, 400, 'alokasi melebihi sisa tagihan harus 400');
  assert.match(String(overBill.body.error), /melebihi sisa tagihan/);
});

test('void pembayaran mengembalikan tagihan ke status terbuka', async () => {
  payVoid = await pay(adminToken, {
    cabang_id: cabang.id,
    siswa_id: siswaD.id,
    nominal: 300000,
    metode: 'tunai',
    tanggal_bayar: '2026-10-16',
    alokasi: [{ tagihan_id: billD3.id, nominal: 300000 }]
  });
  assert.equal(payVoid.status, 200, payVoid.raw);
  assert.equal(paidOf(billD3.id), 420000, 'tagihan P3 menerima alokasi sebelum void');

  const noReason = await req('POST', `/api/billing/pembayaran/${payVoid.body.id}/void`, {}, adminToken);
  assert.equal(noReason.status, 400, 'void tanpa alasan harus 400');

  const voided = await req('POST', `/api/billing/pembayaran/${payVoid.body.id}/void`, { reason: 'salah input nominal' }, adminToken);
  assert.equal(voided.status, 200, voided.raw);

  const p = db.prepare('SELECT * FROM pembayaran WHERE id=?').get(payVoid.body.id);
  assert.equal(p.status, 'void');
  assert.equal(paidOf(billD3.id), 120000, 'alokasi payment batal tidak dihitung');
  const bills = await billsOf(adminToken, siswaD.id, 'D-after-void');
  const d3 = billFor(bills, siswaD.id, P3, 'spp');
  assert.equal(d3.status, 'sebagian');
});

test('pembayaran transfer menunggu verifikasi sebelum dihitung', async () => {
  const gen = await req('POST', '/api/billing/generate-bulanan', { periode: P3, cabang_id: cabang.id }, adminToken);
  assert.equal(gen.status, 200, gen.raw);
  const billsRes = await billsOf(adminToken, siswaE.id, 'E');
  // Pembayaran tanpa alokasi eksplisit dialokasikan ke tagihan periode paling awal (FIFO).
  billE = billsRes.body
    .filter(b => Number(b.siswa_id) === Number(siswaE.id) && b.jenis === 'spp')
    .sort((a, b) => String(a.periode).localeCompare(String(b.periode)))[0];
  assert.ok(billE, 'tagihan siswa E ada');

  const pending = await pay(cabangToken, {
    siswa_id: siswaE.id,
    nominal: 1000000,
    metode: 'transfer',
    tanggal_bayar: '2026-10-16',
    reference: 'TRF-TEST-001'
  });
  assert.equal(pending.status, 200, pending.raw);
  assert.equal(pending.body.status, 'pending_verification');
  assert.equal(pending.body.receipt_no, null, 'pembayaran pending belum menerbitkan struk');

  const billsBefore = await billsOf(adminToken, siswaE.id, 'E-before-verify');
  assert.equal(billFor(billsBefore, siswaE.id, billE.periode, 'spp').status, 'open', 'tagihan belum lunas sebelum verifikasi');

  const verified = await req('POST', `/api/billing/pembayaran/${pending.body.id}/verify`, { note: 'dana masuk' }, adminToken);
  assert.equal(verified.status, 200, verified.raw);
  const p = db.prepare('SELECT * FROM pembayaran WHERE id=?').get(pending.body.id);
  assert.equal(p.status, 'confirmed');
  assert.match(p.receipt_no, /^TP-/, 'struk terbit setelah verifikasi');
  const billsAfter = await billsOf(adminToken, siswaE.id, 'E-after-verify');
  // Tanpa alokasi eksplisit, pembayaran masuk ke tagihan periode paling awal (FIFO).
  assert.equal(billFor(billsAfter, siswaE.id, billE.periode, 'spp').status, 'lunas', 'tagihan periode terawal lunas setelah verifikasi');
  assert.equal(paidOf(billE.id), 1000000);

  const pending2 = await pay(cabangToken, {
    siswa_id: siswaE.id,
    nominal: 250000,
    metode: 'transfer',
    tanggal_bayar: '2026-10-16',
    reference: 'TRF-TEST-002'
  });
  assert.equal(pending2.status, 200, pending2.raw);
  const rejected = await req('POST', `/api/billing/pembayaran/${pending2.body.id}/reject`, { reason: 'bukti tidak jelas' }, adminToken);
  assert.equal(rejected.status, 200, rejected.raw);
  const p2 = db.prepare('SELECT * FROM pembayaran WHERE id=?').get(pending2.body.id);
  assert.equal(p2.status, 'rejected');
  assert.equal(p2.receipt_no, null);
  assert.equal(paidOf(billE.id), 1000000, 'pembayaran ditolak tidak menambah saldo');
});

test('koreksi tagihan menghitung ulang status lalu void melindunginya', async () => {
  const bills = await billsOf(adminToken, siswaD.id, 'D-koreksi');
  const before = billFor(bills, siswaD.id, P3, 'spp');

  const up = await req('PUT', `/api/billing/tagihan/${billD3.id}/koreksi`, { nominal_final: 100000, reason: 'koreksi nominal ke wali' }, adminToken);
  assert.equal(up.status, 200, up.raw);
  let row = db.prepare('SELECT * FROM tagihan WHERE id=?').get(billD3.id);
  assert.equal(row.nominal_final, 100000);
  assert.equal(row.koreksi_amount, 100000 - before.nominal_final, 'koreksi_amount = final - (awal + prorata - diskon)');
  assert.equal(row.status, 'lunas', 'pembayaran 120000 menutup final 100000');

  const down = await req('PUT', `/api/billing/tagihan/${billD3.id}/koreksi`, { nominal_final: 200000, reason: 'koreksi naik lagi' }, adminToken);
  assert.equal(down.status, 200, down.raw);
  row = db.prepare('SELECT * FROM tagihan WHERE id=?').get(billD3.id);
  assert.equal(row.status, 'sebagian', 'final 200000 di atas bayar 120000');

  const noReason = await req('PUT', `/api/billing/tagihan/${billD3.id}/koreksi`, { nominal_final: 150000 }, adminToken);
  assert.equal(noReason.status, 400, 'koreksi tanpa alasan harus 400');

  const voided = await req('POST', `/api/billing/tagihan/${billD3.id}/void`, { reason: 'tagihan ganda' }, adminToken);
  assert.equal(voided.status, 200, voided.raw);
  row = db.prepare('SELECT * FROM tagihan WHERE id=?').get(billD3.id);
  assert.equal(row.status, 'void');

  const afterVoid = await req('PUT', `/api/billing/tagihan/${billD3.id}/koreksi`, { nominal_final: 100000, reason: 'ubah setelah void' }, adminToken);
  assert.equal(afterVoid.status, 400, 'tagihan void tidak boleh dikoreksi');
});

test('laporan billing konsisten dengan data tagihan dan pembayaran', async () => {
  const res = await req('GET', `/api/billing/laporan?cabang_id=${cabang.id}`, undefined, adminToken);
  assert.equal(res.status, 200, res.raw);
  const { summary, by_jenis } = res.body;

  const totalFromJenis = by_jenis.reduce((sum, r) => sum + r.total, 0);
  assert.equal(totalFromJenis, summary.total_nominal, 'jumlah by_jenis sama dengan total_nominal');

  assert.equal(
    summary.count_lunas + summary.count_outstanding + summary.count_void,
    summary.total_tagihan,
    'kelompok status menutup seluruh tagihan'
  );

  const expectedPaid = db.prepare(`SELECT COALESCE(SUM(pa.nominal),0) AS paid
    FROM pembayaran_alokasi pa
    JOIN pembayaran p ON p.id=pa.pembayaran_id
    JOIN tagihan t ON t.id=pa.tagihan_id
    WHERE p.status='confirmed' AND t.cabang_id=?`).get(cabang.id).paid;
  assert.equal(Number(summary.total_paid), expectedPaid, 'total_paid hanya menghitung pembayaran confirmed');
});

test('nomor struk unik per pembayaran terkonfirmasi', async () => {
  const confirmed = db.prepare("SELECT receipt_no FROM pembayaran WHERE cabang_id=? AND status='confirmed' AND receipt_no IS NOT NULL").all(cabang.id);
  const numbers = confirmed.map(r => r.receipt_no);
  assert.ok(numbers.length >= 2, 'harus ada beberapa struk terbit');
  assert.equal(new Set(numbers).size, numbers.length, 'tidak boleh ada nomor struk kembar');
});
