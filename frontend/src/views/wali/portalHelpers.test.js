// Test unit helper murni Portal Wali.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  adaPenilaian,
  barisAnak,
  bulanIni,
  bulanOpsi,
  daftarPenilaian,
  geserBulan,
  gridBulan,
  hariDariIso,
  hariPanjang,
  ikonAktivitas,
  inisial,
  isAkhirPekan,
  jumlahBelumDibaca,
  kabarUI,
  kelompokBulan,
  labelPeriode,
  lampiranDokumen,
  lampiranGambar,
  liburJudul,
  namaLaporan,
  namaPanggilan,
  nadaAvatar,
  parseIso,
  petaBulan,
  persen,
  ringkasAnak,
  ringkasCatatan,
  ringkasTagihan,
  rupiah,
  sapaanSekarang,
  selisihHari,
  statusHariIni,
  statusUI,
  tanggalPanjang,
  tanggalPendek,
  tautanInvoice,
  tautanKabar,
  tautanKuitansi,
  teksBagikanKuitansi,
  teksBagikanLaporan,
  todayISO,
  totalTerbayar,
  waktuRelatif
} from './portalHelpers.js';

const REKAP = {
  bulan: 10,
  tahun: 2026,
  hari_sekolah: ['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06'],
  hari_libur: ['17'],
  hari_libur_detail: [{ tanggal: '2026-10-17', judul: 'Maulid Nabi' }],
  data: [
    {
      id: 11,
      nama: 'Kayla Zahra',
      absensi: { '01': 'Hadir', '02': 'Terlambat', '05': 'Pulang', '06': 'Menunggu' },
      counts: { H: 1, T: 1, P: 1, M: 1, I: 0, S: 0, A: 0, L: 0 }
    },
    {
      id: 12,
      nama: 'Umar Faruq',
      absensi: { '01': 'Hadir' },
      counts: { H: 1, T: 0, P: 0, M: 0, I: 0, S: 0, A: 0, L: 0 }
    }
  ]
};

describe('tanggal', () => {
  it('todayISO memakai format YYYY-MM-DD zona WIB', () => {
    const iso = todayISO(new Date('2026-10-16T18:30:00Z')); // 17 Okt 01:30 WIB
    assert.equal(iso, '2026-10-17');
  });

  it('parseIso menolak nilai kosong', () => {
    assert.equal(parseIso(''), null);
    assert.equal(parseIso(null), null);
  });

  it('label tanggal tidak tergeser zona waktu', () => {
    // new Date('2026-10-17') = UTC; tanpa penguraian manual hari bisa mundur 1.
    assert.equal(hariPanjang('2026-10-17'), 'Sabtu');
    assert.equal(hariDariIso('2026-10-17'), 6);
    assert.equal(tanggalPanjang('2026-10-17'), 'Sabtu, 17 Oktober 2026');
    assert.equal(tanggalPendek('2026-10-05'), '5 Okt');
  });

  it('menandai akhir pekan', () => {
    assert.equal(isAkhirPekan('2026-10-17'), true);
    assert.equal(isAkhirPekan('2026-10-19'), false);
  });

  it('selisihHari memberi label relatif dan diam untuk data lama', () => {
    assert.equal(selisihHari('2026-10-17', '2026-10-17'), 'hari ini');
    assert.equal(selisihHari('2026-10-16', '2026-10-17'), 'kemarin');
    assert.equal(selisihHari('2026-10-15', '2026-10-17'), '2 hari lalu');
    assert.equal(selisihHari('2026-10-05', '2026-10-17'), '1 minggu lalu');
    assert.equal(selisihHari('2026-08-01', '2026-10-17'), '');
    assert.equal(selisihHari('', '2026-10-17'), '');
  });

  it('bulanOpsi dan geserBulan menyeberangi pergantian tahun', () => {
    assert.equal(geserBulan('2026-01', -1), '2025-12');
    assert.equal(geserBulan('2026-12', 1), '2027-01');
    const opsi = bulanOpsi(3, '2026-02');
    assert.deepEqual(
      opsi.map((o) => o.value),
      ['2026-02', '2026-01', '2025-12']
    );
    assert.equal(opsi[0].label, 'Februari 2026');
    assert.match(bulanIni('2026-10-17'), /^2026-10$/);
  });

  it('gridBulan dimulai Senin dan menandai libur', () => {
    const cells = gridBulan('2026-10', ['2026-10-17', '2026-10-18']);
    const isi = cells.filter((c) => !c.kosong);
    assert.equal(isi.length, 31);
    // 1 Oktober 2026 = Kamis -> 3 sel kosong (Sen, Sel, Rab).
    assert.equal(
      cells.findIndex((c) => c.kosong),
      0
    );
    assert.equal(cells[3].hari, 1);
    assert.equal(isi.find((c) => c.hari === 17).libur, true);
    assert.equal(isi.find((c) => c.hari === 17).akhirPekan, true);
    assert.equal(isi.find((c) => c.hari === 15).libur, false);
  });
});

describe('kehadiran', () => {
  it('statusUI punya cadangan untuk status tak dikenal', () => {
    assert.equal(statusUI('Hadir').label, 'Hadir');
    assert.equal(statusUI('Entah').label, 'Belum ada catatan');
  });

  it('ringkasAnak menghitung Pulang sebagai hadir dan Menunggu terpisah', () => {
    const r = ringkasAnak(REKAP, 11);
    assert.equal(r.hari, 4);
    assert.equal(r.counts.Hadir, 1);
    assert.equal(r.counts.Pulang, 1);
    assert.equal(r.counts.Menunggu, 1);
    // (Hadir 1 + Terlambat 1 + Pulang 1) / 4 hari = 75%
    assert.equal(r.hadir, 3);
    assert.equal(r.persen, 75);
  });

  it('menghitung hari tanpa catatan sebagai belum hadir', () => {
    const r = ringkasAnak(REKAP, 12); // hanya 1 hari Hadir dari 4 hari
    assert.equal(r.persen, 25);
    assert.equal(r.counts.Belum, 3);
  });

  it('mengembalikan nol untuk anak yang tidak ada di respons', () => {
    const r = ringkasAnak(REKAP, 999);
    assert.equal(r.persen, 0);
    assert.equal(barisAnak(REKAP, 999), null);
  });

  it('statusHariIni mengenali hari libur beserta judulnya', () => {
    const libur = statusHariIni(REKAP, 11, '2026-10-17');
    assert.equal(libur.status, 'Libur');
    assert.equal(libur.judulLibur, 'Maulid Nabi');
    assert.equal(libur.libur, true);
    const masuk = statusHariIni(REKAP, 11, '2026-10-02');
    assert.equal(masuk.status, 'Terlambat');
    assert.equal(masuk.libur, false);
    assert.equal(liburJudul(REKAP, '2026-10-17'), 'Maulid Nabi');
  });

  it('petaBulan menyusun status per hari sekolah', () => {
    const peta = petaBulan(REKAP, 11);
    assert.equal(peta.length, 4);
    assert.equal(peta[0].status, 'Hadir');
    assert.equal(peta[2].status, 'Pulang');
    assert.equal(peta[0].hari, '01');
  });

  it('persen menjaga pembagian nol', () => {
    assert.equal(persen(0, 0), 0);
    assert.equal(persen(1, 3), 33.3);
  });
});

describe('keuangan', () => {
  const tagihan = [
    { id: 1, nama: 'SPP Bulanan', nominal_final: 650000, paid_amount: 0 },
    { id: 2, nama: 'Uji Kompetensi', nominal_final: 300000, paid_amount: 300000 },
    { id: 3, nama: 'Seragam', nominal_final: 200000, paid_amount: 50000 }
  ];

  it('memisahkan tagihan bersisa dari yang sudah lunas', () => {
    const r = ringkasTagihan(tagihan);
    assert.equal(r.jumlahBelum, 2);
    assert.equal(r.jumlahLunas, 1);
    assert.equal(r.totalSisa, 800000); // 650.000 + 150.000
    assert.equal(r.semuaLunas, false);
  });

  it('semuaLunas hanya saat semua bersisa nol', () => {
    const r = ringkasTagihan([
      { id: 1, nominal_final: 100000, paid_amount: 100000 },
      { id: 2, nominal_final: 50000, paid_amount: 60000 }
    ]);
    assert.equal(r.jumlahBelum, 0);
    assert.equal(r.semuaLunas, true);
    assert.equal(r.totalSisa, 0);
  });

  it('menandai daftar kosong', () => {
    const r = ringkasTagihan([]);
    assert.equal(r.kosong, true);
    assert.equal(r.semuaLunas, false);
  });

  it('totalTerbayar hanya menghitung yang terkonfirmasi', () => {
    assert.equal(
      totalTerbayar([
        { nominal: 100000, status: 'confirmed' },
        { nominal: 50000, status: 'pending_verification' }
      ]),
      100000
    );
  });

  it('label periode dan rupiah memakai format Indonesia', () => {
    assert.equal(labelPeriode('2026-09'), 'September 2026');
    assert.equal(labelPeriode('bebas'), 'bebas');
    assert.equal(rupiah(1250000), 'Rp 1.250.000');
    assert.equal(rupiah(null), 'Rp 0');
  });

  it('tautan publik hanya dibuat bila token ada', () => {
    assert.equal(tautanKuitansi({ id: 7, public_key: 'abc' }), '/api/billing/public/pembayaran/7/pdf?key=abc');
    assert.equal(tautanKuitansi({ id: 7 }), null);
    assert.equal(tautanKuitansi(null), null);
    assert.equal(tautanInvoice({ id: 3, public_key: 'k' }), '/api/billing/public/invoice/3/pdf?key=k');
    assert.equal(tautanInvoice({ id: 3 }), null);
  });

  it('teks bagikan kuitansi menyebut nominal dan nomor kuitansi', () => {
    const t = teksBagikanKuitansi('Kayla Zahra', { receipt_no: 'TP-03-2026-000027', nominal: 650000 });
    assert.match(t, /TP-03-2026-000027/);
    assert.match(t, /Kayla Zahra/);
    assert.match(t, /Rp 650\.000/);
  });
});

describe('notifikasi', () => {
  const notif = [
    { id: 1, tipe: 'daily_published', entity_type: 'laporan_harian', entity_id: 7, read_at: null },
    { id: 2, tipe: 'payment_verified', entity_type: 'pembayaran', entity_id: 27, read_at: '2026-10-17T02:00:00.000Z' }
  ];

  it('menghitung yang belum dibaca', () => {
    assert.equal(jumlahBelumDibaca(notif), 1);
    assert.equal(jumlahBelumDibaca([]), 0);
  });

  it('kabarUI mengenali tipe dan punya cadangan', () => {
    assert.equal(kabarUI('daily_published').label, 'Catatan harian');
    assert.equal(kabarUI('payment_verified').label, 'Pembayaran');
    assert.equal(kabarUI('apa-pun').label, 'Kabar');
  });

  it('tautanKabar mengarahkan ke tab yang tepat', () => {
    assert.deepEqual(tautanKabar(notif[0]), { tab: 'catatan', laporanId: 7, siswaId: null });
    assert.deepEqual(tautanKabar(notif[1]), { tab: 'tagihan' });
    assert.equal(tautanKabar({ entity_type: 'siswa' }), null);
    assert.equal(tautanKabar(null), null);
  });

  it('waktuRelatif memakai satuan Indonesia', () => {
    const now = new Date('2026-10-17T03:00:00.000Z');
    assert.equal(waktuRelatif('2026-10-17T02:59:30.000Z', now), 'baru saja');
    assert.equal(waktuRelatif('2026-10-17T02:30:00.000Z', now), '30 menit lalu');
    assert.equal(waktuRelatif('2026-10-17T00:00:00.000Z', now), '3 jam lalu');
    assert.equal(waktuRelatif('2026-10-16T01:00:00.000Z', now), 'kemarin');
    assert.equal(waktuRelatif('2026-10-13T01:00:00.000Z', now), '4 hari lalu');
    assert.equal(waktuRelatif('bukan-tanggal', now), '');
  });
});

describe('catatan harian', () => {
  it('daftarPenilaian menggabungkan pilar dan kegiatan', () => {
    const hasil = daftarPenilaian({
      pillars: { iqra: 'BSH', akhlak: 'BB', kosong: null },
      activities: { Mewarnai: 'MB' }
    });
    assert.equal(hasil.length, 3);
    assert.deepEqual(hasil[0], { grup: 'Pilar', label: 'Tilawati', rating: 'BSH' });
    assert.deepEqual(hasil[1], { grup: 'Pilar', label: 'Akhlak', rating: 'BB' });
    assert.deepEqual(hasil[2], { grup: 'Kegiatan', label: 'Mewarnai', rating: 'MB' });
  });

  it('adaPenilaian menandai struktur kosong', () => {
    assert.equal(adaPenilaian({}), false);
    assert.equal(adaPenilaian({ pillars: { iqra: 'BSH' } }), true);
  });

  it('ikonAktivitas memakai kata kunci dengan cadangan', () => {
    assert.equal(ikonAktivitas('Mewarnai gambar bebas'), 'palette');
    assert.equal(ikonAktivitas('Motorik kasar di halaman'), 'activity');
    assert.equal(ikonAktivitas('Snack bersama'), 'utensils');
    assert.equal(ikonAktivitas('Kegiatan rahasia'), 'sparkles');
    assert.equal(ikonAktivitas(null), 'sparkles');
  });

  it('memisahkan lampiran gambar dari dokumen', () => {
    const lampiran = [
      { url: '/uploads/laporan/foto-1.jpg' },
      { url: '/uploads/laporan/rencana.pdf' },
      { url: '/uploads/laporan/IMG_2.PNG' }
    ];
    assert.equal(lampiranGambar(lampiran).length, 2);
    assert.equal(lampiranDokumen(lampiran).length, 1);
  });

  it('kelompokBulan menjaga urutan bulan terbaru lebih dulu', () => {
    const grup = kelompokBulan([
      { id: 1, tanggal: '2026-10-17' },
      { id: 2, tanggal: '2026-10-01' },
      { id: 3, tanggal: '2026-09-30' }
    ]);
    assert.equal(grup.length, 2);
    assert.equal(grup[0].label, 'Oktober 2026');
    assert.equal(grup[0].rows.length, 2);
    assert.equal(grup[1].label, 'September 2026');
  });

  it('ringkasCatatan menandai belum dibaca dan menghitung tanggapan', () => {
    const r = ringkasCatatan({
      read: null,
      comments: [{ author_role: 'wali' }, { author_role: 'guru' }, { author_role: 'guru' }]
    });
    assert.equal(r.belumDibaca, true);
    assert.equal(r.jumlahKomentar, 3);
    assert.equal(r.tanggapanWali, 1);
    assert.equal(r.balasanGuru, 2);
    assert.equal(ringkasCatatan({}).belumDibaca, true);
    assert.equal(ringkasCatatan({ read: { read_at: 'x' } }).belumDibaca, false);
  });
});

describe('laporan dan identitas', () => {
  it('namaLaporan memakai nama anak yang aman untuk berkas', () => {
    assert.equal(namaLaporan('Kayla Zahra', '2026-10'), 'Laporan-Absensi_Kayla-Zahra_2026-10.pdf');
    assert.equal(namaLaporan('Anak/Ajaib?', '2026-09'), 'Laporan-Absensi_AnakAjaib_2026-09.pdf');
    assert.equal(namaLaporan('', '2026-09'), 'Laporan-Absensi_Siswa_2026-09.pdf');
  });

  it('teks bagikan laporan menyebut periode panjang', () => {
    assert.match(teksBagikanLaporan('Kayla Zahra', '2026-10'), /Oktober 2026/);
  });

  it('inisial dan nada avatar stabil', () => {
    assert.equal(inisial('Kayla Zahra'), 'KZ');
    assert.equal(inisial('Umar'), 'U');
    assert.equal(inisial(''), '?');
    assert.equal(nadaAvatar('Kayla Zahra'), nadaAvatar('Kayla Zahra'));
  });

  it('namaPanggilan memakai nama_panggilan bila ada', () => {
    assert.equal(namaPanggilan({ nama: 'Kayla Zahra', nama_panggilan: 'Kayla' }), 'Kayla');
    assert.equal(namaPanggilan({ nama: 'Umar Faruq' }), 'Umar');
    assert.equal(namaPanggilan(null), 'Anak');
  });

  it('sapaanSekarang mengikuti jam WIB', () => {
    // 2026-10-17T00:00:00Z = 07:00 WIB
    assert.equal(sapaanSekarang(new Date('2026-10-17T00:00:00Z')), 'Selamat pagi');
    assert.equal(sapaanSekarang(new Date('2026-10-17T06:00:00Z')), 'Selamat siang');
    assert.equal(sapaanSekarang(new Date('2026-10-17T10:00:00Z')), 'Selamat sore');
    assert.equal(sapaanSekarang(new Date('2026-10-17T15:00:00Z')), 'Selamat malam');
  });
});
