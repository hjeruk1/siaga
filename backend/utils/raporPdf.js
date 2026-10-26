// Rapor perkembangan bulanan per anak — dokumen naratif untuk orang tua.
//
// Bedanya dengan rekap absensi (utils/rekapPdf.js): rekap menjawab "berapa hari
// hadir", rapor menjawab "bagaimana anak saya bulan ini". Karena itu isinya
// menggabungkan empat sumber yang biasanya tersebar di empat tab:
//
//   absensi  -> ringkasan kehadiran
//   catatan  -> narasi guru (laporan harian yang sudah published)
//   izin     -> izin/sakit yang disetujui
//   tagihan  -> status pembayaran bulan itu
//
// Dokumen ini untuk dibaca dan dibagikan (cetak/WA), jadi panjangnya dibatasi:
// narasi maksimal 12 entri terbaru, dan setiap catatan dipotong 260 karakter.
// Rapor 40 halaman tidak akan dibaca siapa pun.
const fs = require('fs');
const db = require('../db');
const { BULAN, WARNA, LEBAR, KIRI, namaBerkas, tanggalSingkat } = require('./rekapPdf');

const BATAS_NARASI = 12;
const BATAS_IZIN = 8;
const BATAS_TAGIHAN = 10;
const MAKS_KARAKTER_CATATAN = 260;
const BAWAH = 770;

const LABEL_PAKET = { reguler: 'Reguler', full_day: 'Fullday', care: 'Care' };

function potong(teks, maks) {
  const t = String(teks || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length <= maks) return t;
  return `${t.slice(0, maks - 1).trimEnd()}…`;
}

function rupiah(n) {
  return 'Rp ' + Number(n || 0).toLocaleString('id-ID');
}

function namaBulan(bulan) {
  const [y, m] = String(bulan || '')
    .split('-')
    .map(Number);
  if (!y || !m || m < 1 || m > 12) return bulan || '-';
  return `${BULAN[m - 1]} ${y}`;
}

function namaBerkasRapor(nama, bulan) {
  return `Rapor_${namaBerkas(nama)}_${String(bulan || '').replace('-', '')}.pdf`;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

function dataRapor(siswaId, bulan) {
  const siswa = db
    .prepare(
      `SELECT s.id, s.nama, se.cabang_id, se.jenjang_id, se.rombel_id, se.paket,
              c.nama AS cabang_nama, j.nama AS jenjang_nama, r.nama AS rombel_nama
       FROM siswa s
       JOIN siswa_enrollment se ON se.siswa_id=s.id AND se.status='aktif'
       JOIN cabang c ON c.id=se.cabang_id
       JOIN jenjang j ON j.id=se.jenjang_id
       JOIN rombel r ON r.id=se.rombel_id
       WHERE s.id=?
       ORDER BY se.tanggal_mulai DESC, se.id DESC
       LIMIT 1`
    )
    .get(siswaId);
  if (!siswa) return null;

  const awal = `${bulan}-01`;
  const akhir = `${bulan}-31`;

  const absensi = db
    .prepare(
      'SELECT tanggal,status,jam_masuk,catatan FROM absensi WHERE siswa_id=? AND tanggal BETWEEN ? AND ? ORDER BY tanggal'
    )
    .all(siswaId, awal, akhir);

  const catatan = db
    .prepare(
      `SELECT tanggal,catatan,observation_note,mood,makan,tidur
       FROM laporan_harian
       WHERE siswa_id=? AND status='published' AND tanggal BETWEEN ? AND ?
       ORDER BY tanggal`
    )
    .all(siswaId, awal, akhir);

  const izin = db
    .prepare(
      `SELECT jenis,tanggal_mulai,tanggal_selesai,alasan,status
       FROM izin_request
       WHERE siswa_id=? AND tanggal_mulai<=? AND tanggal_selesai>=?
       ORDER BY tanggal_mulai`
    )
    .all(siswaId, akhir, awal);

  const tagihan = db
    .prepare(
      `SELECT t.nama, t.nominal_final, t.status, t.jatuh_tempo,
              COALESCE((SELECT SUM(pa.nominal) FROM pembayaran_alokasi pa
                        JOIN pembayaran p ON p.id=pa.pembayaran_id
                        WHERE pa.tagihan_id=t.id AND p.status='confirmed'),0) AS paid
       FROM tagihan t
       WHERE t.siswa_id=? AND t.periode=? AND t.status<>'void'
       ORDER BY t.nama`
    )
    .all(siswaId, bulan);

  // Hari efektif = hari yang punya baris absensi. Baris dibuat saat hari
  // sekolah diproses, jadi libur tidak ikut dihitung sebagai ketidakhadiran.
  const hitung = { Hadir: 0, Terlambat: 0, Izin: 0, Sakit: 0, Absen: 0, Pulang: 0, Menunggu: 0, Belum: 0 };
  for (const a of absensi) if (hitung[a.status] !== undefined) hitung[a.status] += 1;
  const hariEfektif = absensi.length;
  const hadirTotal = hitung.Hadir + hitung.Terlambat;
  const persen = hariEfektif ? Math.round((hadirTotal / hariEfektif) * 100) : 0;

  return { siswa, bulan, absensi, catatan, izin, tagihan, hitung, hariEfektif, persen };
}

// ---------------------------------------------------------------------------
// Gambar
// ---------------------------------------------------------------------------

function pastikanRuang(doc, y, butuh) {
  if (y + butuh <= BAWAH) return y;
  doc.addPage();
  return 56;
}

function kop(doc, { logoPath, yayasan, cabangNama }) {
  let x = KIRI;
  if (logoPath && fs.existsSync(logoPath)) {
    try {
      doc.image(logoPath, KIRI, 34, { width: 96 });
      x = 146;
    } catch {
      x = KIRI;
    }
  }
  doc.font('Helvetica-Bold').fontSize(13).fillColor(WARNA.utama).text(yayasan, x, 34);
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(WARNA.isi)
    .text(`Cabang ${cabangNama || '-'}`, x, 50);
  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor(WARNA.redup)
    .text('Sistem Informasi Akademik & Gerbang Absensi (SIAGA)', x, 62);
  doc
    .moveTo(KIRI, 84)
    .lineTo(KIRI + LEBAR, 84)
    .strokeColor(WARNA.garis)
    .stroke();
}

function judulBar(doc, teks, y) {
  doc.rect(KIRI, y, LEBAR, 24).fillColor(WARNA.utama).fill();
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor('#ffffff')
    .text(teks, KIRI + 10, y + 7, { width: LEBAR - 20 });
  return y + 32;
}

function judulSeksi(doc, teks, y) {
  doc.rect(KIRI, y, LEBAR, 17).fillColor('#eef2ff').fill();
  doc
    .font('Helvetica-Bold')
    .fontSize(8.5)
    .fillColor(WARNA.utama)
    .text(teks.toUpperCase(), KIRI + 8, y + 5);
  return y + 24;
}

function pasangan(doc, label, nilai, x, y, lebar) {
  doc.font('Helvetica').fontSize(8).fillColor(WARNA.redup).text(label, x, y, { width: lebar });
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor(WARNA.teks)
    .text(nilai || '-', x, y + 10, { width: lebar });
}

function kotakRingkas(doc, items, y) {
  const lebar = (LEBAR - 12) / 4;
  items.forEach((it, i) => {
    const x = KIRI + i * (lebar + 4);
    doc.rect(x, y, lebar, 42).fillColor(WARNA.latar).strokeColor(WARNA.tepi).lineWidth(0.6).fillAndStroke();
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor(WARNA.redup)
      .text(it.label, x + 7, y + 7, { width: lebar - 14 });
    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor(it.warna || WARNA.teks)
      .text(String(it.nilai), x + 7, y + 18);
  });
  return y + 50;
}

function barisTabel(doc, kolom, y, { header = false, warna = null } = {}) {
  const tinggi = 16;
  if (header) doc.rect(KIRI, y, LEBAR, tinggi).fillColor('#f1f5f9').fill();
  let x = KIRI;
  kolom.forEach((k) => {
    doc
      .font(header ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(7.8)
      .fillColor(warna || (header ? WARNA.isi : WARNA.teks))
      .text(String(k.teks ?? ''), x + 5, y + 4, { width: k.lebar - 8, align: k.align || 'left', lineBreak: false });
    x += k.lebar;
  });
  doc
    .moveTo(KIRI, y + tinggi)
    .lineTo(KIRI + LEBAR, y + tinggi)
    .strokeColor(WARNA.tepi)
    .lineWidth(0.5)
    .stroke();
  return y + tinggi;
}

function renderRaporBulanan(doc, data, { logoPath, yayasan } = {}) {
  const { siswa } = data;
  kop(doc, { logoPath, yayasan: yayasan || 'Yayasan Taruna Prima', cabangNama: siswa.cabang_nama });

  let y = judulBar(doc, `RAPOR PERKEMBANGAN BULANAN — ${namaBulan(data.bulan).toUpperCase()}`, 96);

  pasangan(doc, 'Nama anak', siswa.nama, KIRI, y, 200);
  // Nama jenjang sering sama dengan nama rombel ("KB A"); menampilkan
  // keduanya hanya membuat dokumen terlihat salah ketik.
  const rombel =
    siswa.jenjang_nama && siswa.jenjang_nama !== siswa.rombel_nama
      ? `${siswa.rombel_nama} (${siswa.jenjang_nama})`
      : siswa.rombel_nama;
  pasangan(doc, 'Rombel', rombel, KIRI + 210, y, 160);
  pasangan(doc, 'Paket', LABEL_PAKET[siswa.paket] || siswa.paket, KIRI + 380, y, 135);
  y += 32;

  y = judulSeksi(doc, 'Kehadiran', y);
  y = kotakRingkas(
    doc,
    [
      { label: 'Hadir', nilai: data.hitung.Hadir, warna: WARNA.hadir },
      { label: 'Terlambat', nilai: data.hitung.Terlambat, warna: WARNA.terlambat },
      { label: 'Izin / Sakit', nilai: data.hitung.Izin + data.hitung.Sakit, warna: WARNA.izin },
      { label: 'Tanpa keterangan', nilai: data.hitung.Absen, warna: WARNA.absen }
    ],
    y
  );
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(WARNA.isi)
    .text(
      `Hari efektif ${data.hariEfektif} hari · kehadiran ${data.persen}%` +
        (data.hitung.Pulang ? ` · pulang lebih awal ${data.hitung.Pulang} hari` : ''),
      KIRI,
      y,
      { width: LEBAR }
    );
  y += 18;

  // --- Narasi guru ---
  y = pastikanRuang(doc, y, 80);
  y = judulSeksi(doc, 'Catatan perkembangan', y);
  if (!data.catatan.length) {
    doc
      .font('Helvetica-Oblique')
      .fontSize(8.5)
      .fillColor(WARNA.redup)
      .text('Belum ada catatan guru yang dipublikasikan pada bulan ini.', KIRI, y, { width: LEBAR });
    y += 16;
  } else {
    const tampil = data.catatan.slice(-BATAS_NARASI);
    for (const c of tampil) {
      const isi = potong([c.catatan, c.observation_note].filter(Boolean).join(' '), MAKS_KARAKTER_CATATAN);
      const teks = isi || '(catatan tanpa keterangan)';
      doc.font('Helvetica').fontSize(8.5);
      const tinggi = doc.heightOfString(teks, { width: LEBAR - 92 });
      y = pastikanRuang(doc, y, tinggi + 10);
      doc.font('Helvetica-Bold').fontSize(8.2).fillColor(WARNA.isi).text(tanggalSingkat(c.tanggal), KIRI, y, {
        width: 80
      });
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor(WARNA.teks)
        .text(teks, KIRI + 86, y, { width: LEBAR - 86 });
      y += Math.max(tinggi, 11) + 5;
    }
    if (data.catatan.length > tampil.length) {
      doc
        .font('Helvetica-Oblique')
        .fontSize(7.8)
        .fillColor(WARNA.redup)
        .text(`+ ${data.catatan.length - tampil.length} catatan lain pada bulan ini`, KIRI, y);
      y += 14;
    }
  }
  y += 4;

  // --- Izin ---
  if (data.izin.length) {
    y = pastikanRuang(doc, y, 70);
    y = judulSeksi(doc, 'Izin dan sakit', y);
    y = barisTabel(
      doc,
      [
        { teks: 'Tanggal', lebar: 150 },
        { teks: 'Jenis', lebar: 70 },
        { teks: 'Alasan', lebar: 205 },
        { teks: 'Status', lebar: 90 }
      ],
      y,
      { header: true }
    );
    for (const i of data.izin.slice(0, BATAS_IZIN)) {
      const rentang =
        i.tanggal_mulai === i.tanggal_selesai
          ? tanggalSingkat(i.tanggal_mulai)
          : `${tanggalSingkat(i.tanggal_mulai)} – ${tanggalSingkat(i.tanggal_selesai)}`;
      y = pastikanRuang(doc, y, 18);
      y = barisTabel(
        doc,
        [
          { teks: rentang, lebar: 150 },
          { teks: i.jenis === 'sakit' ? 'Sakit' : 'Izin', lebar: 70 },
          { teks: potong(i.alasan, 70), lebar: 205 },
          { teks: i.status, lebar: 90 }
        ],
        y
      );
    }
    y += 8;
  }

  // --- Tagihan ---
  if (data.tagihan.length) {
    y = pastikanRuang(doc, y, 70);
    y = judulSeksi(doc, 'Tagihan bulan ini', y);
    y = barisTabel(
      doc,
      [
        { teks: 'Tagihan', lebar: 200 },
        { teks: 'Jatuh tempo', lebar: 90 },
        { teks: 'Nominal', lebar: 110, align: 'right' },
        { teks: 'Status', lebar: 115 }
      ],
      y,
      { header: true }
    );
    for (const t of data.tagihan.slice(0, BATAS_TAGIHAN)) {
      const sisa = Number(t.nominal_final) - Number(t.paid || 0);
      const status =
        t.status === 'lunas' ? 'Lunas' : t.status === 'sebagian' ? `Sebagian (sisa ${rupiah(sisa)})` : 'Belum dibayar';
      y = pastikanRuang(doc, y, 18);
      y = barisTabel(
        doc,
        [
          { teks: potong(t.nama, 42), lebar: 200 },
          { teks: t.jatuh_tempo ? tanggalSingkat(t.jatuh_tempo) : '-', lebar: 90 },
          { teks: rupiah(t.nominal_final), lebar: 110, align: 'right' },
          { teks: status, lebar: 115 }
        ],
        y,
        { warna: t.status === 'lunas' ? WARNA.hadir : WARNA.teks }
      );
    }
  }

  // --- Tanda tangan ---
  const yTtd = Math.max(y + 30, 580);
  const yy = pastikanRuang(doc, yTtd, 90);
  doc.font('Helvetica').fontSize(8).fillColor(WARNA.isi);
  doc.text('Wali Kelas', KIRI + 40, yy, { width: 160, align: 'center' });
  doc.text('Orang Tua / Wali', KIRI + 300, yy, { width: 160, align: 'center' });
  doc
    .moveTo(KIRI + 40, yy + 58)
    .lineTo(KIRI + 200, yy + 58)
    .strokeColor(WARNA.garis)
    .stroke();
  doc
    .moveTo(KIRI + 300, yy + 58)
    .lineTo(KIRI + 460, yy + 58)
    .strokeColor(WARNA.garis)
    .stroke();

  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor(WARNA.redup)
    .text(
      `Dokumen dibuat otomatis oleh SIAGA pada ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}. ` +
        'Isi catatan berasal dari laporan harian yang dipublikasikan guru.',
      KIRI,
      yy + 70,
      { width: LEBAR }
    );
}

module.exports = { dataRapor, renderRaporBulanan, namaBerkasRapor, namaBulan, LABEL_PAKET };
