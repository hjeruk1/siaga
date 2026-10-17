// Laporan kehadiran per anak untuk dibagikan ke orang tua.
//
// Dipisah dari routes/rekap.js karena menggambar satu halaman penuh per siswa:
// kop yayasan, identitas siswa, ringkasan bulan, tabel harian, catatan rumus,
// lalu kolom tanda tangan wali kelas dan orang tua.
const fs = require('fs');

const BULAN = [
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

const BULAN_SINGKAT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const WARNA = {
  utama: '#1e3a8a',
  teks: '#0f172a',
  redup: '#64748b',
  isi: '#334155',
  garis: '#cbd5e1',
  baris: '#f1f5f9',
  latar: '#f8fafc',
  tepi: '#e2e8f0',
  hadir: '#047857',
  terlambat: '#b45309',
  izin: '#2563eb',
  absen: '#b91c1c',
  pulang: '#475569'
};

const LEBAR = 515;
const KIRI = 40;

// 'YYYY-MM-DD' -> '5 Okt 2026'
function tanggalSingkat(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y || !m || !d) return String(iso || '-');
  return `${d} ${BULAN_SINGKAT[m - 1]} ${y}`;
}

// 'YYYY-MM-DD' -> 'Senin, 5 Okt 2026'
function tanggalPanjang(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y || !m || !d) return String(iso || '-');
  const hari = HARI[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${hari}, ${d} ${BULAN_SINGKAT[m - 1]} ${y}`;
}

// Satu bulan penuh: 'Oktober 2026'. Rentang sebagian: '3 Okt 2026 - 20 Okt 2026'.
// Nama bulan hanya dipakai kalau rentangnya memang seluruh bulan itu, supaya
// laporan sebagian bulan tidak terbaca sebagai laporan sebulan.
function periodeLabel(start, end) {
  const awal = String(start || '');
  const akhir = String(end || '');
  const [y1, m1, d1] = awal.split('-').map(Number);
  const [y2, m2, d2] = akhir.split('-').map(Number);
  if (y1 && y1 === y2 && m1 === m2) {
    const hariTerakhir = new Date(Date.UTC(y2, m2, 0)).getUTCDate();
    if (d1 === 1 && d2 === hariTerakhir) return `${BULAN[m1 - 1]} ${y1}`;
  }
  return `${tanggalSingkat(start)} - ${tanggalSingkat(end)}`;
}

// Nama berkas tanpa spasi/tanda baca, supaya aman dipakai di unduhan.
function namaBerkas(nama) {
  return String(nama || 'siswa')
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

// Ringkasan satu siswa. Hadir termasuk Pulang (siswa terekam di gerbang lalu
// dijemput). Menunggu berarti belum divalidasi kampus, jadi dihitung terpisah
// dan tidak masuk pembilang persentase.
function ringkasHarian(attMap, siswaId, schoolDays = []) {
  const r = { Hadir: 0, Terlambat: 0, Pulang: 0, Menunggu: 0, Izin: 0, Sakit: 0, Absen: 0, 'Tanpa catatan': 0 };
  for (const day of schoolDays) {
    const att = attMap[`${siswaId}_${day}`];
    const status = att ? att.status : 'Belum';
    if (status === 'Hadir') r.Hadir++;
    else if (status === 'Terlambat') r.Terlambat++;
    else if (status === 'Pulang') r.Pulang++;
    else if (status === 'Menunggu') r.Menunggu++;
    else if (status === 'Izin') r.Izin++;
    else if (status === 'Sakit') r.Sakit++;
    else if (status === 'Absen') r.Absen++;
    else r['Tanpa catatan']++;
  }
  r.hari = schoolDays.length;
  r.hadir = r.Hadir + r.Terlambat + r.Pulang;
  // Pembulatan 1 desimal disamakan dengan aplikasi (rekapHelpers round1) supaya
  // angka di layar wali sama persis dengan angka di PDF yang mereka terima.
  r.persen = r.hari ? Math.round(((r.hadir / r.hari) * 100) * 10) / 10 : 0;
  return r;
}

function warnaStatus(status) {
  if (status === 'Terlambat') return WARNA.terlambat;
  if (status === 'Pulang') return WARNA.pulang;
  if (status === 'Menunggu') return WARNA.terlambat;
  if (status === 'Izin' || status === 'Sakit') return WARNA.izin;
  if (status === 'Absen') return WARNA.absen;
  if (status === 'Hadir') return WARNA.hadir;
  return WARNA.redup;
}

function gambarKop(doc, { logoPath, cabangNama, yayasan }) {
  let x = KIRI;
  if (logoPath && fs.existsSync(logoPath)) {
    try {
      doc.image(logoPath, KIRI, 35, { width: 100 });
      x = 150;
    } catch (e) {
      x = KIRI;
    }
  }
  doc.font('Helvetica-Bold').fontSize(14).fillColor(WARNA.utama).text(yayasan, x, 35);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(WARNA.isi).text(`Cabang ${cabangNama || '-'}`, x, 51);
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(WARNA.redup)
    .text('Sistem Informasi Akademik & Gerbang Absensi (SIAGA)', x, 63);
  doc.moveTo(KIRI, 86).lineTo(KIRI + LEBAR, 86).strokeColor(WARNA.garis).stroke();
}

function gambarJudul(doc, { periode, y = 96 }) {
  doc.rect(KIRI, y, LEBAR, 26).fillColor(WARNA.utama).fill();
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11.5).text('LAPORAN KEHADIRAN SISWA', KIRI + 12, y + 8, {
    lineBreak: false
  });
  doc.font('Helvetica').fontSize(9).text(`Periode: ${periode}`, KIRI + 12, y + 9, {
    width: LEBAR - 24,
    align: 'right',
    lineBreak: false
  });
}

function gambarIdentitas(doc, { siswa, ringkas, y }) {
  doc.roundedRect(KIRI, y, LEBAR, 58, 6).fillColor(WARNA.latar).fill().strokeColor(WARNA.tepi).stroke();
  const label = (text, x, yy) => doc.font('Helvetica').fontSize(7).fillColor(WARNA.redup).text(text, x, yy);
  const nilai = (text, x, yy, lebar = 200) =>
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(WARNA.teks).text(String(text ?? '-'), x, yy, {
      width: lebar,
      height: 12,
      ellipsis: true,
      lineBreak: false
    });

  label('NAMA SISWA', KIRI + 12, y + 8);
  nilai(siswa.nama, KIRI + 12, y + 18, 260);
  label('NIS', KIRI + 300, y + 8);
  nilai(siswa.nis || '-', KIRI + 300, y + 18, 120);

  label('KELAS / ROMBEL', KIRI + 12, y + 34);
  nilai(siswa.rombel_nama || '-', KIRI + 12, y + 44, 260);
  label('HARI EFEKTIF', KIRI + 300, y + 34);
  nilai(`${ringkas.hari} hari`, KIRI + 300, y + 44, 120);
}

function gambarRingkasan(doc, { ringkas, y }) {
  const sel = [
    ['Hadir', ringkas.Hadir, WARNA.hadir],
    ['Terlambat', ringkas.Terlambat, WARNA.terlambat],
    ['Pulang', ringkas.Pulang, WARNA.pulang],
    ['Izin', ringkas.Izin, WARNA.izin],
    ['Sakit', ringkas.Sakit, WARNA.izin],
    ['Alpa', ringkas.Absen, WARNA.absen]
  ];
  // Enam sel 62pt menyisakan 119pt untuk blok persentase, cukup lebar supaya
  // label dan angka besar tidak bertumpuk.
  const lebarSel = 62;
  const jarak = 4;
  sel.forEach(([teks, nilai, warna], i) => {
    const x = KIRI + i * (lebarSel + jarak);
    doc.roundedRect(x, y, lebarSel, 44, 5).fillColor(WARNA.latar).fill().strokeColor(WARNA.tepi).stroke();
    doc.font('Helvetica').fontSize(6.5).fillColor(WARNA.redup).text(teks, x + 5, y + 7, { width: lebarSel - 10 });
    doc.font('Helvetica-Bold').fontSize(13).fillColor(warna).text(String(nilai), x + 5, y + 18, { width: lebarSel - 10 });
  });

  const xPersen = KIRI + sel.length * (lebarSel + jarak);
  const lebarPersen = KIRI + LEBAR - xPersen;
  doc.roundedRect(xPersen, y, lebarPersen, 44, 5).fillColor(WARNA.utama).fill();
  doc.font('Helvetica').fontSize(7).fillColor('#c7d2fe').text('PERSENTASE KEHADIRAN', xPersen + 8, y + 7, {
    width: lebarPersen - 16,
    lineBreak: false
  });
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#ffffff').text(`${ringkas.persen}%`, xPersen + 8, y + 17, {
    width: lebarPersen - 16
  });
  doc.font('Helvetica').fontSize(6.5).fillColor('#c7d2fe').text('hadir + terlambat + pulang', xPersen + 8, y + 34, {
    width: lebarPersen - 16
  });
}

const KOLOM = [
  ['No', 48, 24, 'left'],
  ['Hari / Tanggal', 78, 140, 'left'],
  ['Status', 224, 76, 'left'],
  ['Masuk', 304, 52, 'left'],
  ['Pulang', 360, 52, 'left'],
  ['Catatan', 416, 139, 'left']
];

function gambarHeaderTabel(doc, y) {
  doc.rect(KIRI, y, LEBAR, 20).fillColor(WARNA.utama).fill();
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
  for (const [teks, x, lebar, align] of KOLOM) doc.text(teks, x, y + 6, { width: lebar, align, lineBreak: false });
}

// Menggambar satu halaman laporan untuk satu siswa. Menambah halaman sendiri
// bila tabel harian melebihi tinggi halaman.
function renderLaporanSiswa(doc, ctx) {
  const { siswa, siswaId, schoolDays, attMap, periode, logoPath, yayasan, cabangNama, tanggalCetak, halamanBaru } =
    ctx;
  if (halamanBaru) doc.addPage();

  const ringkas = ringkasHarian(attMap, siswaId, schoolDays);
  gambarKop(doc, { logoPath, cabangNama, yayasan });
  gambarJudul(doc, { periode });
  gambarIdentitas(doc, { siswa, ringkas, y: 130 });
  gambarRingkasan(doc, { ringkas, y: 196 });

  let y = 254;
  gambarHeaderTabel(doc, y);
  y += 20;

  // Tinggi baris 16 dan batas tabel 660 menyediakan ruang pasti untuk catatan
  // rumus + dua kolom tanda tangan di bawah tabel, jadi satu bulan penuh tetap
  // utuh dalam satu halaman (maksimal 24 baris) dan sisanya pindah ke halaman
  // lanjutan bersama tanda tangannya.
  const TINGGI_BARIS = 16;
  const BATAS_TABEL = 660;
  schoolDays.forEach((day, idx) => {
    if (y + TINGGI_BARIS > BATAS_TABEL) {
      doc.addPage();
      gambarKop(doc, { logoPath, cabangNama, yayasan });
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor(WARNA.teks)
        .text(`${siswa.nama} - lanjutan (${periode})`, KIRI, 96, { lineBreak: false });
      y = 112;
      gambarHeaderTabel(doc, y);
      y += 20;
    }
    const att = attMap[`${siswaId}_${day}`];
    const status = att ? att.status : 'Belum';
    if (idx % 2 === 1) doc.rect(KIRI, y, LEBAR, TINGGI_BARIS).fillColor(WARNA.latar).fill();
    doc.font('Helvetica').fontSize(8.5).fillColor(WARNA.isi);
    doc.text(String(idx + 1), 48, y + 4, { width: 24, lineBreak: false });
    doc.text(tanggalPanjang(day), 78, y + 4, { width: 140, lineBreak: false });
    doc.font('Helvetica-Bold').fillColor(warnaStatus(status)).text(status, 224, y + 4, { width: 76, lineBreak: false });
    doc.font('Helvetica').fillColor(WARNA.isi);
    doc.text(att && att.jam_masuk ? att.jam_masuk : '-', 304, y + 4, { width: 52, lineBreak: false });
    doc.text(att && att.jam_pulang ? att.jam_pulang : '-', 360, y + 4, { width: 52, lineBreak: false });
    doc.text(att && att.catatan ? att.catatan : '-', 416, y + 4, { width: 139, height: 11, ellipsis: true });
    doc
      .moveTo(KIRI, y + TINGGI_BARIS)
      .lineTo(KIRI + LEBAR, y + TINGGI_BARIS)
      .strokeColor(WARNA.baris)
      .stroke();
    y += TINGGI_BARIS;
  });

  // Catatan rumus: angka di ringkasan harus bisa ditelusuri orang tua.
  y += 8;
  const rentangData = schoolDays.length
    ? `Data hari sekolah: ${tanggalSingkat(schoolDays[0])} sampai ${tanggalSingkat(schoolDays[schoolDays.length - 1])}.`
    : 'Belum ada hari sekolah pada periode ini.';
  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(WARNA.redup)
    .text(
      `Persentase kehadiran = (Hadir + Terlambat + Pulang) dibagi hari efektif. Pulang berarti siswa terekam di gerbang lalu dijemput. Menunggu berarti belum divalidasi kampus. Tanpa catatan berarti hari sekolah yang belum ada keterangan. ${rentangData}`,
      KIRI,
      y,
      { width: LEBAR, align: 'left', height: 30 }
    );

  const sigY = y + 38;
  doc.font('Helvetica').fontSize(9).fillColor(WARNA.isi);
  doc.text('Mengetahui,', KIRI + 12, sigY, { width: 200, lineBreak: false });
  doc.text('Wali Kelas / Guru', KIRI + 12, sigY + 12, { width: 200, lineBreak: false });
  doc
    .moveTo(KIRI + 12, sigY + 62)
    .lineTo(KIRI + 180, sigY + 62)
    .strokeColor(WARNA.garis)
    .stroke();
  doc.font('Helvetica').fontSize(8).fillColor(WARNA.redup).text('(nama dan tanda tangan)', KIRI + 12, sigY + 66, {
    width: 200,
    lineBreak: false
  });

  doc.font('Helvetica').fontSize(9).fillColor(WARNA.isi);
  doc.text(`${cabangNama || ''}, ${tanggalCetak}`, KIRI + 300, sigY, { width: 200, lineBreak: false });
  doc.text('Orang Tua / Wali', KIRI + 300, sigY + 12, { width: 200, lineBreak: false });
  doc
    .moveTo(KIRI + 300, sigY + 62)
    .lineTo(KIRI + 468, sigY + 62)
    .strokeColor(WARNA.garis)
    .stroke();
  doc.font('Helvetica').fontSize(8).fillColor(WARNA.redup).text('(nama dan tanda tangan)', KIRI + 300, sigY + 66, {
    width: 200,
    lineBreak: false
  });

  // lineBreak:false supaya catatan kaki tidak membungkus dan tanpa sengaja
  // menambah halaman baru di akhir laporan.
  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor('#94a3b8')
    .text(
      'Dokumen ini dibuat otomatis oleh SIAGA Taruna Prima. Hubungi wali kelas bila ada catatan yang perlu dikoreksi.',
      KIRI,
      788,
      { width: LEBAR, align: 'center', lineBreak: false }
    );
}

module.exports = {
  BULAN,
  namaBerkas,
  periodeLabel,
  renderLaporanSiswa,
  ringkasHarian,
  tanggalPanjang,
  tanggalSingkat
};
