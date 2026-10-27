// Dokumen PDF billing: invoice dan kuitansi.
//
// Dipisah dari billing.js karena isinya berbeda sifat dari route biasa — yang
// dominan di sini tata letak dokumen (pdfkit), bukan query dan validasi. Dua
// jalur berbagi satu gambar: endpoint ber-login (admin/bendahara) dan endpoint
// publik bertanda tangan (tautan yang dikirim ke wali lewat WhatsApp).
const fs = require('fs');
const path = require('path');
const express = require('express');
const db = require('../../db');
const auth = require('../../middleware/auth');
const { requireCabang } = require('../../utils/workflow');
const PDFDocument = require('pdfkit');
const { validPublicKey } = require('./helpers');

const router = express.Router();

// --- PDF & PUBLIC DOWNLOAD ENDPOINTS ---

function formatDate(isoStr) {
  if (!isoStr) return '-';
  try {
    const d = new Date(isoStr);
    const months = [
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
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return isoStr.slice(0, 10);
  }
}

function renderPdf(res, filename, title, draw) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  const doc = new PDFDocument({ margin: 48, size: 'A4', info: { Title: title } });
  doc.pipe(res);
  draw(doc);
  doc.end();
}

function generateInvoicePdfResponse(inv, res) {
  const items = db
    .prepare(
      `
    SELECT t.*,COALESCE((SELECT SUM(pa.nominal) FROM pembayaran_alokasi pa JOIN pembayaran p ON p.id=pa.pembayaran_id WHERE pa.tagihan_id=t.id AND p.status='confirmed'),0) AS paid_amount
    FROM invoice_item ii JOIN tagihan t ON t.id=ii.tagihan_id
    WHERE ii.invoice_id=? ORDER BY t.periode,t.jenis,t.nama
  `
    )
    .all(inv.id);

  const enrollment =
    db
      .prepare(
        `
    SELECT j.nama AS jenjang_nama, r.nama AS rombel_nama, e.paket
    FROM siswa_enrollment e
    LEFT JOIN jenjang j ON j.id=e.jenjang_id
    LEFT JOIN rombel r ON r.id=e.rombel_id
    WHERE e.siswa_id=? AND e.status='aktif'
    LIMIT 1
  `
      )
      .get(inv.siswa_id) || {};

  const wali =
    db
      .prepare(
        `
    SELECT p.display_name AS wali_nama, p.no_wa AS wali_no_wa
    FROM wali_siswa ws
    JOIN pengguna p ON p.id=ws.wali_pengguna_id
    WHERE ws.siswa_id=? AND ws.aktif=1
    LIMIT 1
  `
      )
      .get(inv.siswa_id) || {};

  renderPdf(res, `invoice-${inv.invoice_no}.pdf`, `SIAGA Invoice ${inv.invoice_no}`, (doc) => {
    // Draw Top Accent Bar (Blue)
    doc.rect(48, 25, 500, 6).fillColor('#1e3a8a').fill();

    // Check for logo
    const logoPath = path.join(__dirname, '../../../frontend/public/tp_logo.png');
    const hasLogo = fs.existsSync(logoPath);
    let textX = 48;
    if (hasLogo) {
      try {
        doc.image(logoPath, 48, 42, { width: 140 }); // landscape logo size matching UAT specs
        textX = 200;
      } catch (e) {
        console.error('Failed to render PDF logo:', e);
      }
    }

    // Organization Header (Left)
    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor('#1e3a8a')
      .text(inv.organisasi_nama || 'Yayasan Taruna Prima', textX, 42);
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#334155')
      .text(`Cabang ${inv.cabang_nama || ''} (${inv.cabang_kode || ''})`, textX, 58);

    let branchContactStr = '';
    if (inv.cabang_alamat) branchContactStr += inv.cabang_alamat;
    if (inv.cabang_kontak) branchContactStr += (branchContactStr ? ' | Telp/WA: ' : 'Telp/WA: ') + inv.cabang_kontak;
    if (!branchContactStr) branchContactStr = 'Alamat & Kontak hubungi admin sekolah.';
    doc.font('Helvetica').fontSize(7.5).fillColor('#64748b').text(branchContactStr, textX, 70, { width: 280 });

    // Invoice Title and Metadata (Right Aligned)
    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .fillColor('#0f172a')
      .text('INVOICE', 328, 42, { align: 'right', width: 220 });
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#475569')
      .text(inv.invoice_no, 328, 58, { align: 'right', width: 220 });
    doc.font('Helvetica').fontSize(8).fillColor('#64748b');
    doc.text(`Tanggal Terbit: ${formatDate(inv.created_at)}`, 328, 72, { align: 'right', width: 220 });
    doc.text(`Tahun Ajaran: ${inv.tahun_ajaran}`, 328, 84, { align: 'right', width: 220 });

    // Divider
    doc.moveTo(48, 122).lineTo(548, 122).strokeColor('#e2e8f0').stroke();

    // Student & Wali Info Block (Double-Column Card)
    doc.roundedRect(48, 134, 500, 48, 6).fillColor('#f8fafc').fill().strokeColor('#e2e8f0').stroke();

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#475569').text('SISWA TERHUBUNG', 60, 142);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text(inv.siswa_nama, 60, 154);

    let infoLeft = '';
    if (enrollment.jenjang_nama) infoLeft += enrollment.jenjang_nama;
    if (enrollment.rombel_nama) infoLeft += (infoLeft ? ' / ' : '') + enrollment.rombel_nama;
    if (enrollment.paket)
      infoLeft += (infoLeft ? ' / ' : '') + (enrollment.paket === 'full_day' ? 'Full Day' : 'Half Day');
    doc.font('Helvetica').fontSize(8).fillColor('#475569').text(infoLeft, 60, 168);

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#475569').text('WALI / PENERIMA', 260, 142);
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#0f172a')
      .text(wali.wali_nama || '-', 260, 154);
    if (wali.wali_no_wa) {
      doc.font('Helvetica').fontSize(8).fillColor('#475569').text(`Telp/WA: ${wali.wali_no_wa}`, 260, 168);
    }

    let total = 0,
      paid = 0;
    for (const item of items) {
      total += item.nominal_final;
      paid += item.paid_amount;
    }
    const outstanding = Math.max(0, total - paid);
    const statusText = outstanding === 0 ? 'LUNAS' : paid > 0 ? 'DIBAYAR SEBAGIAN' : 'BELUM DIBAYAR';
    const statusColor = outstanding === 0 ? '#10b981' : paid > 0 ? '#3b82f6' : '#ef4444';

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#475569').text('STATUS TAGIHAN', 440, 142);
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(statusColor).text(statusText, 440, 154);

    // Table Header
    const tableTop = 196;
    doc.rect(48, tableTop, 500, 22).fillColor('#1e3a8a').fill();
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff');
    doc.text('Item Tagihan', 58, tableTop + 6, { width: 170 });
    doc.text('Periode', 238, tableTop + 6, { width: 70, align: 'center' });
    doc.text('Tagihan', 308, tableTop + 6, { width: 80, align: 'right' });
    doc.text('Terbayar', 388, tableTop + 6, { width: 80, align: 'right' });
    doc.text('Sisa', 468, tableTop + 6, { width: 70, align: 'right' });

    // Table Rows
    let currentY = tableTop + 22;
    items.forEach((item, index) => {
      const sisa = Math.max(0, item.nominal_final - item.paid_amount);

      // Zebra Striping
      if (index % 2 === 1) {
        doc.rect(48, currentY, 500, 22).fillColor('#f8fafc').fill();
      }

      doc.font('Helvetica').fontSize(9).fillColor('#334155');
      doc.text(item.nama, 58, currentY + 6, { width: 170, height: 12, ellipsis: true });
      doc.text(item.periode || '-', 238, currentY + 6, { width: 70, align: 'center' });
      doc.text(money(item.nominal_final), 308, currentY + 6, { width: 80, align: 'right' });
      doc.text(money(item.paid_amount), 388, currentY + 6, { width: 80, align: 'right' });

      if (sisa > 0) {
        doc
          .font('Helvetica-Bold')
          .fillColor('#b91c1c')
          .text(money(sisa), 468, currentY + 6, { width: 70, align: 'right' });
      } else {
        doc
          .font('Helvetica-Bold')
          .fillColor('#047857')
          .text('Lunas', 468, currentY + 6, { width: 70, align: 'right' });
      }

      // Border line
      doc
        .moveTo(48, currentY + 22)
        .lineTo(548, currentY + 22)
        .strokeColor('#f1f5f9')
        .stroke();
      currentY += 22;
    });

    // Space below table
    currentY += 12;

    // Draw Payment Instructions & Totals Box
    if (inv.rekening_nomor) {
      doc.roundedRect(48, currentY, 260, 68, 6).fillColor('#eff6ff').fill().strokeColor('#cbd5e1').stroke();
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor('#1e40af')
        .text('INSTRUKSI PEMBAYARAN', 58, currentY + 8);
      doc.font('Helvetica').fontSize(8.5).fillColor('#334155');
      doc.text(`Pembayaran dapat ditransfer ke rekening:`, 58, currentY + 20, { width: 240 });
      doc.font('Helvetica-Bold').text(`${inv.rekening_bank || ''} - ${inv.rekening_nomor}`, 58, currentY + 34);
      doc.font('Helvetica').text(`a.n. ${inv.rekening_nama || inv.organisasi_nama || ''}`, 58, currentY + 46);
    } else {
      // Fallback cash warning
      doc.roundedRect(48, currentY, 260, 68, 6).fillColor('#fffbeb').fill().strokeColor('#fef3c7').stroke();
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor('#b45309')
        .text('INSTRUKSI PEMBAYARAN', 58, currentY + 8);
      doc.font('Helvetica').fontSize(8.5).fillColor('#334155');
      doc.text(
        `Informasi rekening belum diatur. Silakan lakukan pembayaran tunai ke petugas kasir sekolah di cabang Anda.`,
        58,
        currentY + 20,
        { width: 240 }
      );
    }

    // Totals Summary Box (Right)
    doc.rect(328, currentY, 220, 68).fillColor('#f8fafc').fill().strokeColor('#cbd5e1').stroke();
    doc.font('Helvetica').fontSize(9).fillColor('#475569');

    doc.text('Total Tagihan:', 338, currentY + 10, { width: 90 });
    doc
      .font('Helvetica-Bold')
      .fillColor('#0f172a')
      .text(money(total), 438, currentY + 10, { width: 100, align: 'right' });

    doc
      .font('Helvetica')
      .fillColor('#475569')
      .text('Total Terbayar:', 338, currentY + 26, { width: 90 });
    doc
      .font('Helvetica-Bold')
      .fillColor('#047857')
      .text(money(paid), 438, currentY + 26, { width: 100, align: 'right' });

    doc
      .moveTo(338, currentY + 42)
      .lineTo(538, currentY + 42)
      .strokeColor('#cbd5e1')
      .stroke();

    doc
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .fillColor('#0f172a')
      .text('Sisa Tagihan:', 338, currentY + 48, { width: 90 });
    doc
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .fillColor(outstanding > 0 ? '#b91c1c' : '#047857')
      .text(money(outstanding), 438, currentY + 48, { width: 100, align: 'right' });

    // Signature Block
    currentY += 80;
    if (currentY > 700) {
      doc.addPage();
      currentY = 48;
    }

    const sigY = currentY;
    doc.font('Helvetica').fontSize(9).fillColor('#334155');
    doc.text(`${inv.cabang_nama || 'Yogyakarta'}, ${formatDate(inv.created_at)}`, 360, sigY, {
      width: 188,
      align: 'center'
    });
    doc.text('Petugas Administrasi', 360, sigY + 12, { width: 188, align: 'center' });

    // Centered stamp box placeholder
    const stampBoxX = 360 + (188 - 50) / 2; // = 429
    doc
      .roundedRect(stampBoxX, sigY + 28, 50, 30, 3)
      .dash(3, { space: 3 })
      .strokeColor('#cbd5e1')
      .stroke();
    doc
      .font('Helvetica')
      .fontSize(6)
      .fillColor('#94a3b8')
      .text('STAMP', stampBoxX, sigY + 40, { width: 50, align: 'center' });
    doc.undash();

    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0f172a');
    doc.text(inv.created_by_name || 'Petugas Sekolah', 360, sigY + 68, { width: 188, align: 'center' });
    doc
      .moveTo(380, sigY + 79)
      .lineTo(528, sigY + 79)
      .strokeColor('#cbd5e1')
      .stroke();

    // Footer Note
    doc.font('Helvetica').fontSize(7.5).fillColor('#94a3b8');
    doc.text(
      'Dokumen ini diterbitkan secara resmi oleh sistem sekolah dan merupakan bukti tagihan yang sah.',
      48,
      755,
      { align: 'center', width: 500 }
    );
    doc.text('Terima kasih atas kerja sama Bapak/Ibu Wali Murid.', 48, 765, { align: 'center', width: 500 });
  });
}

function generatePaymentPdfResponse(pay, res) {
  const alloc = db
    .prepare(
      `
    SELECT pa.nominal,t.nama,t.periode FROM pembayaran_alokasi pa JOIN tagihan t ON t.id=pa.tagihan_id WHERE pa.pembayaran_id=?
  `
    )
    .all(pay.id);

  const enrollment =
    db
      .prepare(
        `
    SELECT j.nama AS jenjang_nama, r.nama AS rombel_nama, e.paket
    FROM siswa_enrollment e
    LEFT JOIN jenjang j ON j.id=e.jenjang_id
    LEFT JOIN rombel r ON r.id=e.rombel_id
    WHERE e.siswa_id=? AND e.status='aktif'
    LIMIT 1
  `
      )
      .get(pay.siswa_id) || {};

  const wali =
    db
      .prepare(
        `
    SELECT p.display_name AS wali_nama, p.no_wa AS wali_no_wa
    FROM wali_siswa ws
    JOIN pengguna p ON p.id=ws.wali_pengguna_id
    WHERE ws.siswa_id=? AND ws.aktif=1
    LIMIT 1
  `
      )
      .get(pay.siswa_id) || {};

  renderPdf(res, `kuitansi-${pay.receipt_no}.pdf`, `SIAGA Receipt ${pay.receipt_no}`, (doc) => {
    // Draw Top Accent Bar (Green)
    doc.rect(48, 25, 500, 6).fillColor('#059669').fill();

    // Check for logo
    const logoPath = path.join(__dirname, '../../../frontend/public/tp_logo.png');
    const hasLogo = fs.existsSync(logoPath);
    let textX = 48;
    if (hasLogo) {
      try {
        doc.image(logoPath, 48, 42, { width: 140 }); // landscape logo size matching UAT specs
        textX = 200;
      } catch (e) {
        console.error('Failed to render PDF logo:', e);
      }
    }

    // Organization Header (Left)
    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .fillColor('#059669')
      .text(pay.organisasi_nama || 'Yayasan Taruna Prima', textX, 42);
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#334155')
      .text(`Cabang ${pay.cabang_nama || ''} (${pay.cabang_kode || ''})`, textX, 58);

    let branchContactStr = '';
    if (pay.cabang_alamat) branchContactStr += pay.cabang_alamat;
    if (pay.cabang_kontak) branchContactStr += (branchContactStr ? ' | Telp/WA: ' : 'Telp/WA: ') + pay.cabang_kontak;
    if (!branchContactStr) branchContactStr = 'Alamat & Kontak hubungi admin sekolah.';
    doc.font('Helvetica').fontSize(7.5).fillColor('#64748b').text(branchContactStr, textX, 70, { width: 280 });

    // Title and Metadata (Right Aligned)
    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .fillColor('#0f172a')
      .text('KUITANSI PEMBAYARAN', 328, 42, { align: 'right', width: 220 });
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#475569')
      .text(pay.receipt_no, 328, 58, { align: 'right', width: 220 });
    doc.font('Helvetica').fontSize(8).fillColor('#64748b');
    doc.text(`Tanggal Bayar: ${formatDate(pay.tanggal_bayar)}`, 328, 72, { align: 'right', width: 220 });
    doc.text(`Metode: ${String(pay.metode || '').toUpperCase()}`, 328, 84, { align: 'right', width: 220 });

    // Divider
    doc.moveTo(48, 122).lineTo(548, 122).strokeColor('#e2e8f0').stroke();

    // Student Info Block (Emerald theme)
    doc.roundedRect(48, 134, 500, 48, 6).fillColor('#f0fdf4').fill().strokeColor('#bcf0da').stroke();

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#047857').text('SISWA', 60, 142);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text(pay.siswa_nama, 60, 154);

    let infoLeft = '';
    if (enrollment.jenjang_nama) infoLeft += enrollment.jenjang_nama;
    if (enrollment.rombel_nama) infoLeft += (infoLeft ? ' / ' : '') + enrollment.rombel_nama;
    if (enrollment.paket)
      infoLeft += (infoLeft ? ' / ' : '') + (enrollment.paket === 'full_day' ? 'Full Day' : 'Half Day');
    doc.font('Helvetica').fontSize(8).fillColor('#475569').text(infoLeft, 60, 168);

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#047857').text('WALI / PENERIMA', 260, 142);
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#0f172a')
      .text(wali.wali_nama || '-', 260, 154);
    if (wali.wali_no_wa) {
      doc.font('Helvetica').fontSize(8).fillColor('#475569').text(`Telp/WA: ${wali.wali_no_wa}`, 260, 168);
    }

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#047857').text('STATUS', 440, 142);
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#047857').text('LUNAS / SELESAI', 440, 154);

    // Table Header
    const tableTop = 196;
    doc.rect(48, tableTop, 500, 22).fillColor('#059669').fill();
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff');
    doc.text('Alokasi Pembayaran', 58, tableTop + 6, { width: 300 });
    doc.text('Periode', 358, tableTop + 6, { width: 90, align: 'center' });
    doc.text('Nominal', 458, tableTop + 6, { width: 80, align: 'right' });

    // Table Rows
    let currentY = tableTop + 22;
    alloc.forEach((a, index) => {
      if (index % 2 === 1) {
        doc.rect(48, currentY, 500, 22).fillColor('#f0fdf4').fill();
      }

      doc.font('Helvetica').fontSize(9).fillColor('#334155');
      doc.text(a.nama, 58, currentY + 6, { width: 300, height: 12, ellipsis: true });
      doc.text(a.periode || '-', 358, currentY + 6, { width: 90, align: 'center' });
      doc
        .font('Helvetica-Bold')
        .fillColor('#047857')
        .text(money(a.nominal), 458, currentY + 6, { width: 80, align: 'right' });

      doc
        .moveTo(48, currentY + 22)
        .lineTo(548, currentY + 22)
        .strokeColor('#e2e8f0')
        .stroke();
      currentY += 22;
    });

    // Space below table
    currentY += 12;

    // Catatan Pembayaran
    if (pay.catatan) {
      doc.roundedRect(48, currentY, 260, 56, 6).fillColor('#f9fafb').fill().strokeColor('#e5e7eb').stroke();
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor('#475569')
        .text('CATATAN', 58, currentY + 8);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#64748b')
        .text(pay.catatan, 58, currentY + 20, { width: 240 });
    }

    // Totals Summary Box (Right)
    doc.rect(328, currentY, 220, 56).fillColor('#f9fafb').fill().strokeColor('#e5e7eb').stroke();
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#475569')
      .text('TOTAL BAYAR:', 338, currentY + 22, { width: 90 });
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor('#047857')
      .text(money(pay.nominal), 438, currentY + 20, { width: 100, align: 'right' });

    // Signature and Stamp Block
    currentY += 80;
    if (currentY > 700) {
      doc.addPage();
      currentY = 48;
    }

    const sigY = currentY;
    doc.font('Helvetica').fontSize(9).fillColor('#334155');
    doc.text(`${pay.cabang_nama || 'Yogyakarta'}, ${formatDate(pay.tanggal_bayar)}`, 360, sigY, {
      width: 188,
      align: 'center'
    });
    doc.text('Penerima / Petugas Kasir', 360, sigY + 12, { width: 188, align: 'center' });

    // Stamp Box centered
    const stampBoxX = 360 + (188 - 50) / 2; // = 429
    doc
      .roundedRect(stampBoxX, sigY + 28, 50, 30, 3)
      .dash(3, { space: 3 })
      .strokeColor('#cbd5e1')
      .stroke();
    doc
      .font('Helvetica')
      .fontSize(6)
      .fillColor('#94a3b8')
      .text('LUNAS', stampBoxX, sigY + 40, { width: 50, align: 'center' });
    doc.undash();

    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0f172a');
    doc.text(pay.created_by_name || 'Petugas Sekolah', 360, sigY + 68, { width: 188, align: 'center' });
    doc
      .moveTo(380, sigY + 79)
      .lineTo(528, sigY + 79)
      .strokeColor('#cbd5e1')
      .stroke();

    // Footer Note
    doc.font('Helvetica').fontSize(7.5).fillColor('#94a3b8');
    doc.text(
      'Dokumen ini diterbitkan secara resmi oleh sistem sekolah dan merupakan bukti pembayaran yang sah.',
      48,
      755,
      { align: 'center', width: 500 }
    );
    doc.text('Terima kasih atas pembayaran Bapak/Ibu Wali Murid.', 48, 765, { align: 'center', width: 500 });
  });
}

function money(v) {
  return 'Rp ' + Number(v || 0).toLocaleString('id-ID');
}

// --- AUTHENTICATED PDF GENERATION ENDPOINTS ---

router.get('/invoice/:id/pdf', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const inv = db
    .prepare(
      `
    SELECT i.*,s.nama AS siswa_nama,c.nama AS cabang_nama,c.kode AS cabang_kode,c.alamat AS cabang_alamat,c.kontak AS cabang_kontak,o.nama AS organisasi_nama,o.rekening_bank,o.rekening_nomor,o.rekening_nama,u.display_name AS created_by_name
    FROM invoice i
    JOIN siswa s ON s.id=i.siswa_id
    JOIN cabang c ON c.id=i.cabang_id
    JOIN organisasi o ON o.id=1
    LEFT JOIN pengguna u ON u.id=i.created_by
    WHERE i.id=?
  `
    )
    .get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Invoice tidak ditemukan' });
  if (!requireCabang(req, res, inv.cabang_id)) return;
  generateInvoicePdfResponse(inv, res);
});

router.get('/pembayaran/:id/pdf', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const pay = db
    .prepare(
      `
    SELECT p.*,s.nama AS siswa_nama,c.nama AS cabang_nama,c.kode AS cabang_kode,c.alamat AS cabang_alamat,c.kontak AS cabang_kontak,o.nama AS organisasi_nama,u.display_name AS created_by_name
    FROM pembayaran p
    JOIN siswa s ON s.id=p.siswa_id
    JOIN cabang c ON c.id=p.cabang_id
    JOIN organisasi o ON o.id=1
    LEFT JOIN pengguna u ON u.id=p.created_by
    WHERE p.id=?
  `
    )
    .get(req.params.id);
  if (!pay) return res.status(404).json({ error: 'Pembayaran tidak ditemukan' });
  if (!requireCabang(req, res, pay.cabang_id)) return;
  if (pay.status !== 'confirmed') return res.status(400).json({ error: 'Kuitansi hanya untuk pembayaran confirmed' });
  generatePaymentPdfResponse(pay, res);
});

// --- PUBLIC DOWNLOAD ENDPOINTS ---

router.get('/public/invoice/:id/pdf', (req, res) => {
  const id = Number(req.params.id);
  const key = req.query.key;
  if (!validPublicKey('invoice', id, key)) {
    return res.status(403).json({ error: 'Akses ditolak' });
  }
  const inv = db
    .prepare(
      `
    SELECT i.*,s.nama AS siswa_nama,c.nama AS cabang_nama,c.kode AS cabang_kode,c.alamat AS cabang_alamat,c.kontak AS cabang_kontak,o.nama AS organisasi_nama,o.rekening_bank,o.rekening_nomor,o.rekening_nama,u.display_name AS created_by_name
    FROM invoice i
    JOIN siswa s ON s.id=i.siswa_id
    JOIN cabang c ON c.id=i.cabang_id
    JOIN organisasi o ON o.id=1
    LEFT JOIN pengguna u ON u.id=i.created_by
    WHERE i.id=?
  `
    )
    .get(id);
  if (!inv) return res.status(404).json({ error: 'Invoice tidak ditemukan' });
  generateInvoicePdfResponse(inv, res);
});

router.get('/public/pembayaran/:id/pdf', (req, res) => {
  const id = Number(req.params.id);
  const key = req.query.key;
  if (!validPublicKey('payment', id, key)) {
    return res.status(403).json({ error: 'Akses ditolak' });
  }
  const pay = db
    .prepare(
      `
    SELECT p.*,s.nama AS siswa_nama,c.nama AS cabang_nama,c.kode AS cabang_kode,c.alamat AS cabang_alamat,c.kontak AS cabang_kontak,o.nama AS organisasi_nama,u.display_name AS created_by_name
    FROM pembayaran p
    JOIN siswa s ON s.id=p.siswa_id
    JOIN cabang c ON c.id=p.cabang_id
    JOIN organisasi o ON o.id=1
    LEFT JOIN pengguna u ON u.id=p.created_by
    WHERE p.id=?
  `
    )
    .get(id);
  if (!pay) return res.status(404).json({ error: 'Pembayaran tidak ditemukan' });
  if (pay.status !== 'confirmed') return res.status(400).json({ error: 'Kuitansi hanya untuk pembayaran confirmed' });
  generatePaymentPdfResponse(pay, res);
});

module.exports = router;
