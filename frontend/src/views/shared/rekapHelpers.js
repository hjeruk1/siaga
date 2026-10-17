// Fungsi murni untuk Rekap Absensi Bulanan. Dipisah dari komponen supaya bisa
// diuji tanpa DOM dan dipakai ulang oleh tampilan Admin dan Kepsek.

export const STATUS_ORDER = ['Hadir', 'Terlambat', 'Izin', 'Sakit', 'Absen'];

// Urutan chip ringkas pada kartu siswa mobile: Pulang ikut karena status itu
// berarti siswa sudah terekam hadir di gerbang lalu dijemput.
export const RINGKAS_ORDER = ['Hadir', 'Terlambat', 'Pulang', 'Izin', 'Sakit', 'Absen'];

export const STATUS_LETTER = {
  Hadir: 'H',
  Terlambat: 'T',
  Pulang: 'P',
  Menunggu: 'M',
  Izin: 'I',
  Sakit: 'S',
  Absen: 'A',
  Libur: 'L',
  Belum: '-'
};

export const STATUS_LABEL = {
  Hadir: 'Hadir',
  Terlambat: 'Terlambat',
  Pulang: 'Pulang',
  Menunggu: 'Menunggu',
  Izin: 'Izin',
  Sakit: 'Sakit',
  Absen: 'Absen',
  Libur: 'Libur',
  Belum: 'Tanpa catatan'
};

const BULAN_NAMA = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember'
];

export function monthLabel(bulan) {
  const [y, m] = String(bulan || '').split('-').map(Number);
  if (!y || !m) return '';
  return `${BULAN_NAMA[m - 1]} ${y}`;
}

// 'YYYY-MM' -> rentang tanggal untuk ekspor (hari terakhir bulan itu).
export function monthRange(bulan) {
  const [y, m] = String(bulan || '').split('-').map(Number);
  if (!y || !m) return null;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    tahun: y,
    bulan: m,
    start: `${bulan}-01`,
    end: `${bulan}-${String(last).padStart(2, '0')}`
  };
}

// Daftar kolom hari dari hari sekolah. Setiap kolom: iso, hari (tanggal), singkat.
export function dayColumns(hariSekolah = []) {
  return (hariSekolah || []).map((iso) => ({
    iso,
    hari: iso.slice(-2),
    singkat: `${Number(iso.slice(-2))}/${Number(iso.slice(5, 7))}`
  }));
}

// Status satu siswa pada satu tanggal. Tanpa baris absensi berarti Belum.
export function statusFor(row, iso) {
  const status = row?.absensi?.[iso.slice(-2)];
  return status || 'Belum';
}

export function round1(n) {
  return Math.round(n * 10) / 10;
}

// Ringkasan satu kumpulan siswa: hitungan per status dan persentase kehadiran.
// Persentase = (Hadir + Terlambat + Pulang) / jumlah hari sekolah yang sudah
// berjalan, jadi hari tanpa catatan tetap dihitung belum hadir. Pulang berarti
// siswa terekam di gerbang lalu dijemput, jadi ikut dihitung hadir; Menunggu
// (belum divalidasi kampus) tetap di luar pembilang dan dihitung terpisah.
export function summarize(rows = [], hariSekolah = []) {
  const counts = { Hadir: 0, Terlambat: 0, Pulang: 0, Menunggu: 0, Izin: 0, Sakit: 0, Absen: 0, Libur: 0, Belum: 0 };
  for (const row of rows) {
    for (const iso of hariSekolah) {
      const status = statusFor(row, iso);
      counts[status] = (counts[status] || 0) + 1;
    }
  }
  const hari = hariSekolah.length;
  const siswa = rows.length;
  const terisi =
    counts.Hadir + counts.Terlambat + counts.Pulang + counts.Menunggu + counts.Izin + counts.Sakit + counts.Absen;
  const hariSiswa = hari * siswa;
  const hadir = counts.Hadir + counts.Terlambat + counts.Pulang;
  const persen = hariSiswa ? round1((hadir / hariSiswa) * 100) : 0;
  return { hari, siswa, counts, terisi, hariSiswa, hadir, persen };
}

// Matriks siap render: satu baris per siswa dengan sel hari dan hitungannya.
export function buildMatrix(rows = [], hariSekolah = []) {
  return rows.map((row) => {
    const cells = hariSekolah.map((iso) => ({ iso, status: statusFor(row, iso) }));
    const ringkas = summarize([row], hariSekolah);
    return { ...row, cells, ringkas };
  });
}

export function filterRows(rows = [], q = '') {
  const key = String(q || '')
    .trim()
    .toLowerCase();
  if (!key) return rows;
  return rows.filter(
    (r) => String(r.nama || '').toLowerCase().includes(key) || String(r.kelas_nama || '').toLowerCase().includes(key)
  );
}

// Kelompokkan siswa per rombel, terurut nama kelas, plus ringkasannya.
export function groupByRombel(rows = [], hariSekolah = []) {
  const map = new Map();
  for (const row of rows) {
    const key = row.rombel_id ?? row.kelas_nama ?? '-';
    if (!map.has(key)) map.set(key, { rombel_id: row.rombel_id ?? null, nama: row.kelas_nama || '-', siswa: [] });
    map.get(key).siswa.push(row);
  }
  return [...map.values()]
    .map((g) => ({ ...g, ringkas: summarize(g.siswa, hariSekolah) }))
    .sort((a, b) => String(a.nama).localeCompare(String(b.nama)));
}
