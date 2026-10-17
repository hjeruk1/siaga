const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

// Test untuk GET /api/rekap (matriks absensi bulanan) dan perilaku hari libur.
const BASE = process.env.TEST_URL || 'http://localhost:3001';
let token = '';
let student = null;
let eventId = null;

function req(method, path, body, authToken) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    const data = body ? JSON.stringify(body) : undefined;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request(url, { method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const bodyBuffer = Buffer.concat(chunks);
        let parsed = '';
        try {
          parsed = JSON.parse(bodyBuffer.toString());
        } catch {
          parsed = bodyBuffer.toString();
        }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function todayWIB() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(new Date());
}

async function rekapBulanan(params = {}) {
  const today = todayWIB();
  const query = new URLSearchParams({
    tahun: today.slice(0, 4),
    bulan: String(Number(today.slice(5, 7))),
    ...params
  });
  return req('GET', `/api/rekap?${query.toString()}`, null, token);
}

function reqRaw(path, authToken) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const headers = {};
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    const r = http.request(url, { method: 'GET', headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, buffer: Buffer.concat(chunks) }));
    });
    r.on('error', reject);
    r.end();
  });
}

// Hitung halaman dan cari teks di dalam PDF keluaran pdfkit (teks disimpan
// sebagai string hex di dalam operator TJ).
function jumlahHalaman(pdf) {
  const cocok = pdf.toString('latin1').match(/\/Count\s+(\d+)/);
  return cocok ? Number(cocok[1]) : 0;
}

// Teks di dalam PDF keluaran pdfkit berada di stream terkompresi, dan setiap
// huruf bisa jadi potongan hex di operator TJ. Stream diambil pakai /Length
// supaya potongan byte yang tidak sengaja memuat kata 'endstream' tidak
// memotong data, lalu dikembangkan dengan zlib.
function teksPdf(buf) {
  const zlib = require('node:zlib');
  const teks = buf.toString('latin1');
  let semua = '';
  let idx = 0;
  while ((idx = teks.indexOf('stream', idx)) !== -1) {
    const awalan = teks.slice(Math.max(0, idx - 400), idx);
    const lm = awalan.match(/\/Length\s+(\d+)[^0-9]*$/);
    let mulai = idx + 'stream'.length;
    if (teks[mulai] === '\r') mulai++;
    if (teks[mulai] === '\n') mulai++;
    if (!lm || !/FlateDecode/.test(awalan)) {
      idx = mulai;
      continue;
    }
    const panjang = Number(lm[1]);
    let isi = '';
    try {
      isi = zlib.inflateSync(buf.subarray(mulai, mulai + panjang)).toString('latin1');
    } catch {
      idx = mulai;
      continue;
    }
    for (const tj of isi.matchAll(/\[([\s\S]*?)\]\s*TJ/g)) {
      for (const hex of tj[1].matchAll(/<([0-9A-Fa-f]+)>/g)) {
        const kode = hex[1].length % 2 ? hex[1].slice(0, -1) : hex[1];
        semua += Buffer.from(kode, 'hex').toString('latin1');
      }
      for (const par of tj[1].matchAll(/\((.*?)\)/g)) semua += par[1];
    }
    for (const par of isi.matchAll(/\((.*?)\)\s*Tj/g)) semua += par[1];
    idx = mulai + panjang;
  }
  return semua;
}

function adaTeks(pdf, teks) {
  return teksPdf(pdf).includes(teks);
}

describe('Rekap Absensi Bulanan', () => {
  before(async () => {
    const login = await req('POST', '/api/auth/login', {
      tipe: 'staff',
      username: 'admin',
      password: process.env.TEST_ADMIN_PASSWORD || 'admin123'
    });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    token = login.body.token;

    const cabangRes = await req('GET', '/api/master/cabang', null, token);
    assert.equal(cabangRes.status, 200);
    const cabang = cabangRes.body.find((c) => c.aktif) || cabangRes.body[0];
    const rombelRes = await req('GET', `/api/master/rombel?cabang_id=${cabang.id}`, null, token);
    assert.equal(rombelRes.status, 200);
    const rombel = rombelRes.body[0];
    assert.ok(rombel, 'butuh minimal satu rombel untuk uji rekap bulanan');

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const namaSiswa = `Siswa Rekap ${suffix}`;
    const createRes = await req(
      'POST',
      '/api/siswa',
      {
        nama: namaSiswa,
        nis: `RKB-${suffix}`,
        cabang_id: cabang.id,
        jenjang_id: rombel.jenjang_id,
        rombel_id: rombel.id,
        paket: 'reguler',
        tanggal_mulai: '2026-07-01'
      },
      token
    );
    assert.equal(createRes.status, 200, JSON.stringify(createRes.body));
    // POST /api/siswa hanya mengembalikan id, jadi nama diambil dari variabel.
    student = { id: createRes.body.id, nama: namaSiswa, rombel_id: rombel.id };
  });

  it('menolak permintaan tanpa token', async () => {
    const res = await req('GET', `/api/rekap?tahun=${todayWIB().slice(0, 4)}&bulan=1`);
    assert.equal(res.status, 401);
  });

  it('mengembalikan matriks bulanan beserta hari sekolah', async () => {
    const res = await rekapBulanan();
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const today = todayWIB();
    assert.equal(res.body.tahun, Number(today.slice(0, 4)));
    assert.equal(res.body.bulan, Number(today.slice(5, 7)));
    assert.ok(Array.isArray(res.body.hari_sekolah), 'hari_sekolah harus array');
    assert.ok(Array.isArray(res.body.data), 'data harus array');
    for (const iso of res.body.hari_sekolah) {
      assert.match(iso, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(iso <= today, `hari sekolah tidak boleh melewati hari ini: ${iso}`);
      assert.equal(iso.slice(0, 7), today.slice(0, 7), 'hari sekolah harus di bulan yang diminta');
    }
    const row = res.body.data.find((r) => Number(r.id) === Number(student.id));
    assert.ok(row, 'siswa baru harus muncul di matriks');
    assert.equal(Number(row.rombel_id), Number(student.rombel_id));
    for (const key of ['H', 'T', 'I', 'S', 'A', 'L']) {
      assert.equal(typeof row.counts[key], 'number', `counts.${key} harus angka`);
    }
  });

  it('mencatat check-in ke dalam matriks bulanan', async () => {
    const awal = await rekapBulanan();
    assert.equal(awal.status, 200);
    const kandidat = [...awal.body.hari_sekolah].reverse().slice(0, 5);
    if (!kandidat.length) return; // bulan ini belum punya hari sekolah berjalan

    let sukses = null;
    for (const tanggal of kandidat) {
      const res = await req('POST', '/api/absensi/checkin', { siswa_id: student.id, tanggal }, token);
      if (res.status === 200) {
        sukses = { tanggal, status: res.body.status };
        break;
      }
    }
    assert.ok(sukses, 'minimal satu hari sekolah bisa diisi check-in');
    assert.ok(['Hadir', 'Terlambat'].includes(sukses.status));

    const sesudah = await rekapBulanan();
    const row = sesudah.body.data.find((r) => Number(r.id) === Number(student.id));
    const hari = sukses.tanggal.slice(-2);
    assert.equal(row.absensi[hari], sukses.status);
    // Satu siswa hanya satu hari terisi, jadi counter sesuai status harus 1.
    const kunci = sukses.status === 'Hadir' ? 'H' : 'T';
    assert.equal(row.counts[kunci], 1, `counts.${kunci} harus 1 untuk status ${sukses.status}`);
  });

  it('memfilter matriks per rombel', async () => {
    const res = await rekapBulanan({ rombel_id: student.rombel_id });
    assert.equal(res.status, 200);
    assert.ok(res.body.data.length > 0);
    for (const row of res.body.data) {
      assert.equal(Number(row.rombel_id), Number(student.rombel_id));
    }
  });

  it('mengeluarkan hari libur dari hari sekolah dan menandainya Libur', async () => {
    const awal = await rekapBulanan({ rombel_id: student.rombel_id });
    assert.equal(awal.status, 200);
    const tanggal = awal.body.hari_sekolah[0];
    if (!tanggal) return; // tidak ada hari sekolah berjalan untuk diuji

    const buat = await req(
      'POST',
      '/api/master/kalender',
      { tanggal, tipe: 'libur', nama: 'Uji Rekap Libur', scope: 'yayasan' },
      token
    );
    assert.equal(buat.status, 200, JSON.stringify(buat.body));
    eventId = buat.body.id;

    const sesudah = await rekapBulanan({ rombel_id: student.rombel_id });
    assert.ok(!sesudah.body.hari_sekolah.includes(tanggal), 'tanggal libur tidak boleh jadi kolom hari sekolah');
    assert.ok(sesudah.body.hari_libur.includes(tanggal.slice(-2)), 'tanggal libur harus ditandai');

    const hapus = await req('DELETE', `/api/master/kalender/${eventId}`, null, token);
    assert.equal(hapus.status, 200);
    eventId = null;
  });

  it('mengunduh laporan per anak dengan nama berkas dan identitas siswa', async () => {
    const bulan = todayWIB().slice(0, 7);
    const res = await reqRaw(
      `/api/rekap/export?format=pdf&siswa_id=${student.id}&start_date=${bulan}-01&end_date=${bulan}-28`,
      token
    );
    assert.equal(res.status, 200, res.buffer.toString('latin1').slice(0, 200));
    assert.equal(res.headers['content-type'], 'application/pdf');
    assert.match(res.headers['content-disposition'], /^attachment; filename="Absensi_.+\.pdf"$/);
    assert.equal(res.buffer.subarray(0, 4).toString(), '%PDF');
    assert.equal(jumlahHalaman(res.buffer), 1, 'laporan satu siswa harus satu halaman');
    assert.ok(adaTeks(res.buffer, 'LAPORAN KEHADIRAN SISWA'), 'judul laporan harus ada');
    assert.ok(adaTeks(res.buffer, 'PERSENTASE KEHADIRAN'), 'ringkasan persentase harus ada');
    assert.ok(adaTeks(res.buffer, 'Orang Tua / Wali'), 'kolom tanda tangan orang tua harus ada');
    assert.ok(adaTeks(res.buffer, student.nama), 'nama siswa harus tercetak');
  });

  it('membuat satu halaman per siswa untuk satu rombel', async () => {
    const bulan = todayWIB().slice(0, 7);
    const satu = await reqRaw(
      `/api/rekap/export?format=pdf&siswa_id=${student.id}&start_date=${bulan}-01&end_date=${bulan}-28`,
      token
    );
    const res = await reqRaw(
      `/api/rekap/export?format=pdf&per_anak=1&rombel_id=${student.rombel_id}&start_date=${bulan}-01&end_date=${bulan}-28`,
      token
    );
    assert.equal(res.status, 200);
    assert.match(res.headers['content-disposition'], /filename="Absensi_Per-Anak_.+\.pdf"/);
    const rombel = await rekapBulanan({ rombel_id: student.rombel_id });
    const jumlahSiswa = rombel.body.data.length;
    assert.ok(jumlahSiswa >= 1);
    assert.ok(jumlahHalaman(res.buffer) >= jumlahSiswa, 'setiap siswa minimal satu halaman');
    assert.ok(jumlahHalaman(res.buffer) >= jumlahHalaman(satu.buffer));
    assert.equal(jumlahHalaman(satu.buffer), 1);
  });

  it('tetap menyediakan rekap kelas dan CSV per siswa', async () => {
    const bulan = todayWIB().slice(0, 7);
    const kelas = await reqRaw(
      `/api/rekap/export?format=pdf&rombel_id=${student.rombel_id}&start_date=${bulan}-01&end_date=${bulan}-28`,
      token
    );
    assert.equal(kelas.status, 200);
    assert.match(kelas.headers['content-disposition'], /filename="Rekap_.+\.pdf"/);
    assert.ok(adaTeks(kelas.buffer, 'REKAPITULASI ABSENSI KELAS'));

    const csv = await reqRaw(
      `/api/rekap/export?format=excel&siswa_id=${student.id}&start_date=${bulan}-01&end_date=${bulan}-28`,
      token
    );
    assert.equal(csv.status, 200);
    assert.match(csv.headers['content-type'], /text\/csv/);
    assert.ok(csv.buffer.toString('utf8').includes(student.nama));
  });
});

describe('rekapPdf helper', () => {
  const { namaBerkas, periodeLabel, ringkasHarian, tanggalPanjang } = require('../backend/utils/rekapPdf');

  it('periodeLabel memakai nama bulan untuk satu bulan penuh', () => {
    assert.equal(periodeLabel('2026-10-01', '2026-10-31'), 'Oktober 2026');
    assert.equal(periodeLabel('2026-10-03', '2026-10-20'), '3 Okt 2026 - 20 Okt 2026');
    assert.equal(periodeLabel('2026-10-28', '2026-11-03'), '28 Okt 2026 - 3 Nov 2026');
  });

  it('namaBerkas membuang karakter yang tidak aman', () => {
    assert.equal(namaBerkas('Indah Permata'), 'Indah_Permata');
    assert.equal(namaBerkas('TK B / Anggrek'), 'TK_B_Anggrek');
    assert.equal(namaBerkas(''), 'siswa');
    assert.ok(namaBerkas('x'.repeat(80)).length <= 40);
  });

  it('tanggalPanjang memakai nama hari Indonesia', () => {
    assert.equal(tanggalPanjang('2026-10-05'), 'Senin, 5 Okt 2026');
    assert.equal(tanggalPanjang('2026-10-17'), 'Sabtu, 17 Okt 2026');
  });

  it('ringkasHarian menghitung Pulang sebagai hadir dan Menunggu terpisah', () => {
    const hari = ['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06'];
    const attMap = {
      '7_2026-10-01': { status: 'Hadir' },
      '7_2026-10-02': { status: 'Pulang' },
      '7_2026-10-05': { status: 'Menunggu' }
    };
    const r = ringkasHarian(attMap, 7, hari);
    assert.equal(r.Hadir, 1);
    assert.equal(r.Pulang, 1);
    assert.equal(r.Menunggu, 1);
    assert.equal(r['Tanpa catatan'], 1);
    assert.equal(r.hari, 4);
    assert.equal(r.hadir, 2);
    assert.equal(r.persen, 50);
  });
});
