// Test unit untuk helper murni Rekap Absensi Bulanan.
// Dipisah dari komponen supaya bisa diuji tanpa DOM.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  RINGKAS_ORDER,
  STATUS_LETTER,
  STATUS_ORDER,
  buildMatrix,
  dayColumns,
  filterRows,
  groupByRombel,
  monthLabel,
  monthRange,
  statusFor,
  summarize
} from './rekapHelpers.js';

const HARI = ['2026-10-01', '2026-10-02', '2026-10-05'];
const ROWS = [
  {
    id: 1,
    nama: 'Ani',
    kelas_nama: 'TK A',
    rombel_id: 10,
    absensi: { '01': 'Hadir', '02': 'Hadir', '05': 'Terlambat' }
  },
  {
    id: 2,
    nama: 'Budi',
    kelas_nama: 'TK A',
    rombel_id: 10,
    absensi: { '01': 'Sakit', '02': 'Libur' }
  },
  {
    id: 3,
    nama: 'Citra',
    kelas_nama: 'TK B',
    rombel_id: 11,
    absensi: { '01': 'Hadir' }
  }
];

describe('rekapHelpers bulan', () => {
  it('monthRange menghitung hari terakhir tiap bulan', () => {
    assert.deepEqual(monthRange('2026-10'), { tahun: 2026, bulan: 10, start: '2026-10-01', end: '2026-10-31' });
    assert.deepEqual(monthRange('2026-02'), { tahun: 2026, bulan: 2, start: '2026-02-01', end: '2026-02-28' });
    assert.deepEqual(monthRange('2028-02'), { tahun: 2028, bulan: 2, start: '2028-02-01', end: '2028-02-29' });
    assert.equal(monthRange(''), null);
  });

  it('monthLabel memakai nama bulan Indonesia', () => {
    assert.equal(monthLabel('2026-10'), 'Oktober 2026');
    assert.equal(monthLabel('2026-01'), 'Januari 2026');
  });

  it('dayColumns memakai tanggal dua digit', () => {
    assert.deepEqual(dayColumns(['2026-10-05']), [{ iso: '2026-10-05', hari: '05', singkat: '5/10' }]);
  });
});

describe('rekapHelpers status dan ringkasan', () => {
  it('statusFor mengembalikan Belum bila tidak ada baris', () => {
    assert.equal(statusFor(ROWS[1], '2026-10-05'), 'Belum');
    assert.equal(statusFor(ROWS[0], '2026-10-05'), 'Terlambat');
    assert.equal(statusFor(undefined, '2026-10-05'), 'Belum');
  });

  it('summarize menghitung per status dan persentase kehadiran', () => {
    const r = summarize([ROWS[0]], HARI);
    assert.equal(r.hari, 3);
    assert.equal(r.siswa, 1);
    assert.equal(r.counts.Hadir, 2);
    assert.equal(r.counts.Terlambat, 1);
    assert.equal(r.counts.Belum, 0);
    assert.equal(r.terisi, 3);
    assert.equal(r.persen, 100);
  });

  it('summarize menghitung Belum sebagai hari belum hadir pada persentase', () => {
    const r = summarize([ROWS[2]], HARI);
    assert.equal(r.counts.Hadir, 1);
    assert.equal(r.counts.Belum, 2);
    assert.equal(r.terisi, 1);
    assert.equal(r.persen, 33.3);
  });

  it('summarize aman untuk data kosong', () => {
    const r = summarize([], []);
    assert.equal(r.persen, 0);
    assert.equal(r.siswa, 0);
    assert.equal(r.counts.Hadir, 0);
  });

  it('Pulang dihitung hadir, Menunggu tidak', () => {
    const row = { id: 4, nama: 'Dewi', kelas_nama: 'TK A', absensi: { '01': 'Pulang', '02': 'Menunggu' } };
    const r = summarize([row], HARI);
    assert.equal(r.counts.Pulang, 1);
    assert.equal(r.counts.Menunggu, 1);
    assert.equal(r.hadir, 1);
    assert.equal(r.terisi, 2);
    assert.equal(r.persen, 33.3);
    assert.equal(r.counts.Belum, 1);
  });

  it('setiap status punya huruf dan urutan tetap', () => {
    for (const s of STATUS_ORDER) assert.ok(STATUS_LETTER[s], `huruf untuk ${s}`);
    assert.equal(STATUS_LETTER.Libur, 'L');
    assert.equal(STATUS_LETTER.Pulang, 'P');
    assert.equal(STATUS_LETTER.Menunggu, 'M');
    assert.equal(STATUS_LETTER.Belum, '-');
    for (const s of RINGKAS_ORDER) assert.ok(STATUS_LETTER[s], `huruf ringkas ${s}`);
  });
});

describe('rekapHelpers matriks dan pengelompokan', () => {
  it('buildMatrix menambah sel per hari dan ringkasan baris', () => {
    const m = buildMatrix(ROWS, HARI);
    assert.equal(m.length, 3);
    assert.deepEqual(
      m[0].cells.map((c) => c.status),
      ['Hadir', 'Hadir', 'Terlambat']
    );
    assert.equal(m[0].ringkas.persen, 100);
    assert.equal(m[1].ringkas.counts.Belum, 1);
  });

  it('filterRows mencari nama dan kelas tanpa membedakan huruf besar', () => {
    assert.equal(filterRows(ROWS, 'ani').length, 1);
    assert.equal(filterRows(ROWS, 'tk a').length, 2);
    assert.equal(filterRows(ROWS, '  ').length, 3);
    assert.equal(filterRows(ROWS, 'zzz').length, 0);
  });

  it('groupByRombel mengelompokkan dan mengurutkan nama kelas', () => {
    const g = groupByRombel(ROWS, HARI);
    assert.deepEqual(
      g.map((x) => x.nama),
      ['TK A', 'TK B']
    );
    assert.equal(g[0].siswa.length, 2);
    assert.equal(g[0].ringkas.siswa, 2);
    assert.equal(g[2], undefined);
  });

  it('groupByRombel tetap jalan tanpa rombel_id', () => {
    const g = groupByRombel([{ id: 9, nama: 'Dewi', kelas_nama: 'TK C' }], HARI);
    assert.equal(g.length, 1);
    assert.equal(g[0].rombel_id, null);
    assert.equal(g[0].ringkas.counts.Belum, 3);
  });
});
