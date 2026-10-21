// Fungsi murni Portal Wali. Dipisah dari komponen supaya bisa diuji tanpa DOM
// dan supaya aturan tampilan (warna status, label, rumus persentase) hanya
// hidup di satu tempat.
//
// Semantik kehadiran mengikuti Rekap Absensi Bulanan (views/shared/rekapHelpers):
//   Pulang   = terekam di gerbang lalu dijemput  -> dihitung hadir
//   Menunggu = penjemput tiba, belum divalidasi  -> dihitung terpisah
//   Belum    = hari sekolah tanpa catatan        -> masuk penyebut
import { dayColumns, monthLabel, monthRange, round1, statusFor, summarize } from '../shared/rekapHelpers.js';

export { dayColumns, monthLabel, monthRange, statusFor, summarize };

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

const BULAN_SINGKAT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const HARI_NAMA = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const HARI_SINGKAT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

// ---------------------------------------------------------------------------
// Tanggal. Semua tanggal dari server berbentuk YYYY-MM-DD (tanpa jam), jadi
// diurai manual: `new Date('2026-10-17')` diperlakukan sebagai UTC dan bisa
// tergeser satu hari saat diformat di zona WIB.
// ---------------------------------------------------------------------------
export function parseIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return null;
  return { tahun: Number(m[1]), bulan: Number(m[2]), hari: Number(m[3]) };
}

export function todayISO(now = new Date()) {
  // en-CA memberi format YYYY-MM-DD; zona WIB dipatok eksplisit.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
}

export function hariDariIso(iso) {
  const p = parseIso(iso);
  if (!p) return 0;
  return new Date(Date.UTC(p.tahun, p.bulan - 1, p.hari)).getUTCDay();
}

export function hariPanjang(iso) {
  return HARI_NAMA[hariDariIso(iso)] || '';
}

export function hariSingkat(iso) {
  return HARI_SINGKAT[hariDariIso(iso)] || '';
}

export function isAkhirPekan(iso) {
  const d = hariDariIso(iso);
  return d === 0 || d === 6;
}

export function tanggalPanjang(iso) {
  const p = parseIso(iso);
  if (!p) return String(iso || '');
  return `${HARI_NAMA[new Date(Date.UTC(p.tahun, p.bulan - 1, p.hari)).getUTCDay()]}, ${p.hari} ${
    BULAN_NAMA[p.bulan - 1]
  } ${p.tahun}`;
}

export function tanggalPendek(iso) {
  const p = parseIso(iso);
  if (!p) return String(iso || '');
  return `${p.hari} ${BULAN_SINGKAT[p.bulan - 1]}`;
}

// Jarak hari dari hari ini, untuk label "kemarin" / "2 hari lalu" di linimasa.
// Mengembalikan '' kalau lebih dari 30 hari supaya tidak berisik.
export function selisihHari(iso, hariIni = todayISO()) {
  const a = parseIso(iso);
  const b = parseIso(hariIni);
  if (!a || !b) return '';
  const selisih = Math.round(
    (Date.UTC(b.tahun, b.bulan - 1, b.hari) - Date.UTC(a.tahun, a.bulan - 1, a.hari)) / 86400000
  );
  if (selisih <= 0) return 'hari ini';
  if (selisih === 1) return 'kemarin';
  if (selisih < 7) return `${selisih} hari lalu`;
  if (selisih < 30) return `${Math.floor(selisih / 7)} minggu lalu`;
  return '';
}

export function bulanPanjang(bulan) {
  return monthLabel(bulan);
}

export function bulanIni(iso = todayISO()) {
  return String(iso).slice(0, 7);
}

// Daftar bulan untuk pemilih periode, terbaru lebih dulu.
export function bulanOpsi(jumlah = 6, dari = bulanIni()) {
  const [y, m] = String(dari).split('-').map(Number);
  const out = [];
  for (let i = 0; i < jumlah; i++) {
    const total = y * 12 + (m - 1) - i;
    const yy = Math.floor(total / 12);
    const mm = (total % 12) + 1;
    const value = `${yy}-${String(mm).padStart(2, '0')}`;
    out.push({ value, label: `${BULAN_NAMA[mm - 1]} ${yy}` });
  }
  return out;
}

export function geserBulan(bulan, delta) {
  const [y, m] = String(bulan).split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

// Grid kalender satu bulan (Senin sebagai awal pekan, sama seperti dinding
// kelas). `libur` = daftar tanggal ISO libur, dipakai untuk menandai sel.
export function gridBulan(bulan, libur = []) {
  const [y, m] = String(bulan).split('-').map(Number);
  if (!y || !m) return [];
  const jumlahHari = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const geser = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // Senin = 0
  const liburSet = new Set(libur.map((d) => String(d).slice(0, 10)));
  const cells = [];
  for (let i = 0; i < geser; i++) cells.push({ kosong: true, key: `kosong-${i}` });
  for (let d = 1; d <= jumlahHari; d++) {
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ iso, hari: d, akhirPekan: isAkhirPekan(iso), libur: liburSet.has(iso), key: iso });
  }
  return cells;
}

// ---------------------------------------------------------------------------
// Tampilan status kehadiran
// ---------------------------------------------------------------------------
export const STATUS_UI = {
  Hadir: {
    label: 'Hadir',
    singkat: 'H',
    ikon: 'check',
    pill: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
    sel: 'bg-emerald-100 text-emerald-700 border-emerald-200'
  },
  Terlambat: {
    label: 'Terlambat',
    singkat: 'T',
    ikon: 'clock',
    pill: 'bg-amber-50 text-amber-700 border-amber-200',
    dot: 'bg-amber-500',
    sel: 'bg-amber-100 text-amber-700 border-amber-200'
  },
  Pulang: {
    label: 'Pulang',
    singkat: 'P',
    ikon: 'home',
    pill: 'bg-sky-50 text-sky-700 border-sky-200',
    dot: 'bg-sky-500',
    sel: 'bg-sky-100 text-sky-700 border-sky-200'
  },
  Menunggu: {
    label: 'Menunggu',
    singkat: 'M',
    ikon: 'hourglass',
    pill: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    dot: 'bg-indigo-500',
    sel: 'bg-indigo-100 text-indigo-700 border-indigo-200'
  },
  Izin: {
    label: 'Izin',
    singkat: 'I',
    ikon: 'file',
    pill: 'bg-blue-50 text-blue-700 border-blue-200',
    dot: 'bg-blue-500',
    sel: 'bg-blue-100 text-blue-700 border-blue-200'
  },
  Sakit: {
    label: 'Sakit',
    singkat: 'S',
    ikon: 'heart',
    pill: 'bg-rose-50 text-rose-700 border-rose-200',
    dot: 'bg-rose-500',
    sel: 'bg-rose-100 text-rose-700 border-rose-200'
  },
  Absen: {
    label: 'Tanpa keterangan',
    singkat: 'A',
    ikon: 'alert',
    pill: 'bg-red-50 text-red-700 border-red-200',
    dot: 'bg-red-500',
    sel: 'bg-red-100 text-red-700 border-red-200'
  },
  Libur: {
    label: 'Libur',
    singkat: 'L',
    ikon: 'calendar',
    pill: 'bg-slate-100 text-slate-600 border-slate-200',
    dot: 'bg-slate-400',
    sel: 'bg-slate-200 text-slate-600 border-slate-300'
  },
  Belum: {
    label: 'Belum ada catatan',
    singkat: '-',
    ikon: 'dot',
    pill: 'bg-slate-100 text-slate-500 border-slate-200',
    dot: 'bg-slate-300',
    sel: 'bg-slate-100 text-slate-500 border-slate-200'
  }
};

export function statusUI(status) {
  return STATUS_UI[status] || STATUS_UI.Belum;
}

// Status yang dihitung hadir untuk persentase (lihat catatan di atas).
export const STATUS_HADIR = ['Hadir', 'Terlambat', 'Pulang'];

// Urutan chip ringkas pada kartu anak.
export const RINGKAS_ANAK = ['Hadir', 'Terlambat', 'Pulang', 'Menunggu', 'Izin', 'Sakit', 'Absen'];

// ---------------------------------------------------------------------------
// Kehadiran per anak dari respons /api/rekap
// ---------------------------------------------------------------------------
export function barisAnak(rekap, siswaId) {
  const rows = rekap?.data || [];
  return rows.find((r) => String(r.id) === String(siswaId)) || null;
}

// Ringkasan kehadiran satu anak pada bulan yang sedang dimuat.
export function ringkasAnak(rekap, siswaId) {
  const row = barisAnak(rekap, siswaId);
  const hari = rekap?.hari_sekolah || [];
  if (!row) return { row: null, hari: hari.length, hadir: 0, persen: 0, counts: {}, total: hari.length };
  const s = summarize([row], hari);
  return { row, hari: s.hari, hadir: s.hadir, persen: s.persen, counts: s.counts, total: s.hari };
}

export function statusHariIni(rekap, siswaId, iso = todayISO()) {
  const row = barisAnak(rekap, siswaId);
  if (!row) return { status: 'Belum', iso, libur: false, judulLibur: null };
  const detail = (rekap?.hari_libur_detail || []).find((e) => String(e.tanggal).slice(0, 10) === iso);
  const st = row.absensi?.[iso.slice(-2)] || (detail ? 'Libur' : 'Belum');
  return { status: st, iso, libur: !!detail, judulLibur: detail?.judul || null };
}

export function liburJudul(rekap, iso) {
  const detail = (rekap?.hari_libur_detail || []).find((e) => String(e.tanggal).slice(0, 10) === iso);
  return detail?.judul || null;
}

// Deret hari sekolah satu bulan + status anak, untuk baris "peta bulan".
export function petaBulan(rekap, siswaId) {
  const row = barisAnak(rekap, siswaId);
  return dayColumns(rekap?.hari_sekolah || []).map((c) => ({
    ...c,
    status: row?.absensi?.[c.hari] || 'Belum',
    akhirPekan: isAkhirPekan(c.iso)
  }));
}

// ---------------------------------------------------------------------------
// Keuangan
// ---------------------------------------------------------------------------
export function rupiah(v) {
  return 'Rp ' + Number(v || 0).toLocaleString('id-ID');
}

export function sisaTagihan(t) {
  return Math.max(0, Number(t?.nominal_final || 0) - Number(t?.paid_amount || 0));
}

// Ringkasan tagihan yang jujur: "belum lunas" hanya untuk tagihan yang benar
// benar masih bersisa. Tagihan yang sudah lunas dipisah agar tidak lagi
// muncul di bawah label "belum lunas".
export function ringkasTagihan(tagihan = []) {
  const belum = tagihan.filter((t) => sisaTagihan(t) > 0);
  const lunas = tagihan.filter((t) => sisaTagihan(t) <= 0);
  const totalSisa = belum.reduce((sum, t) => sum + sisaTagihan(t), 0);
  return {
    belum,
    lunas,
    totalSisa,
    jumlahBelum: belum.length,
    jumlahLunas: lunas.length,
    semuaLunas: tagihan.length > 0 && belum.length === 0,
    kosong: tagihan.length === 0
  };
}

// Total terbayar dari pembayaran yang sudah terkonfirmasi.
export function totalTerbayar(pembayaran = []) {
  return pembayaran.filter((p) => p.status === 'confirmed').reduce((sum, p) => sum + Number(p.nominal || 0), 0);
}

export function labelPeriode(periode) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(periode || ''));
  if (!m) return periode || '-';
  return `${BULAN_NAMA[Number(m[2]) - 1]} ${m[1]}`;
}

// Tautan PDF publik (bertoken, tanpa login) supaya orang tua bisa meneruskan
// dokumen ke WhatsApp keluarga. Tidak memakai token sesi.
export function tautanKuitansi(pembayaran) {
  if (!pembayaran?.id || !pembayaran?.public_key) return null;
  return `/api/billing/public/pembayaran/${pembayaran.id}/pdf?key=${pembayaran.public_key}`;
}

export function tautanInvoice(invoice) {
  if (!invoice?.id || !invoice?.public_key) return null;
  return `/api/billing/public/invoice/${invoice.id}/pdf?key=${invoice.public_key}`;
}

export function waUrl(nomor, teks) {
  const angka = String(nomor || '')
    .replace(/\D/g, '')
    .replace(/^0/, '62');
  const dasar = angka ? `https://wa.me/${angka}` : 'https://wa.me/';
  return teks ? `${dasar}?text=${encodeURIComponent(teks)}` : dasar;
}

// ---------------------------------------------------------------------------
// Notifikasi
// ---------------------------------------------------------------------------
export const KABAR_UI = {
  daily_published: { label: 'Catatan harian', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  daily_record: { label: 'Catatan harian', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  wali_comment: { label: 'Tanggapan', tone: 'bg-sky-50 text-sky-700 border-sky-200' },
  guru_reply: { label: 'Balasan guru', tone: 'bg-sky-50 text-sky-700 border-sky-200' },
  payment_verified: { label: 'Pembayaran', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  invoice_issued: { label: 'Tagihan', tone: 'bg-rose-50 text-rose-700 border-rose-200' },
  absensi: { label: 'Kehadiran', tone: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  pembayaran: { label: 'Pembayaran', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  invoice: { label: 'Tagihan', tone: 'bg-rose-50 text-rose-700 border-rose-200' },
  tagihan: { label: 'Tagihan', tone: 'bg-rose-50 text-rose-700 border-rose-200' }
};

export function kabarUI(tipe) {
  return KABAR_UI[tipe] || { label: 'Kabar', tone: 'bg-slate-100 text-slate-600 border-slate-200' };
}

export function jumlahBelumDibaca(notif = []) {
  return notif.filter((n) => !n.read_at).length;
}

// Ke mana klik kabar mengarah. Entity type yang benar-benar dikirim server:
// laporan_harian, invoice, pembayaran (lihat notify() di backend).
export function tautanKabar(n) {
  if (!n) return null;
  if (n.entity_type === 'laporan_harian' && n.entity_id) {
    return { tab: 'catatan', laporanId: n.entity_id, siswaId: n.siswa_id || null };
  }
  if (['invoice', 'pembayaran'].includes(n.entity_type)) return { tab: 'tagihan' };
  return null;
}

// Waktu notifikasi (ISO UTC) -> teks Indonesia ringkas.
export function waktuRelatif(iso, now = new Date()) {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  const menit = Math.floor((now.getTime() - t.getTime()) / 60000);
  if (menit < 1) return 'baru saja';
  if (menit < 60) return `${menit} menit lalu`;
  const jam = Math.floor(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  const hari = Math.floor(jam / 24);
  if (hari === 1) return 'kemarin';
  if (hari < 7) return `${hari} hari lalu`;
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: '2-digit'
  }).format(t);
}

// ---------------------------------------------------------------------------
// Catatan harian
// ---------------------------------------------------------------------------
export const PILLAR_LABEL = {
  iqra: 'Tilawati',
  akhlak: 'Akhlak',
  aktif_mandiri: 'Aktif & Mandiri',
  disiplin_tertib: 'Disiplin & Tertib'
};

export const RATING_UI = {
  BB: { label: 'Belum Berkembang', singkat: 'BB', tone: 'bg-red-50 text-red-700 border-red-200' },
  MB: { label: 'Mulai Berkembang', singkat: 'MB', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  BSH: {
    label: 'Berkembang Sesuai Harapan',
    singkat: 'BSH',
    tone: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  },
  BSB: { label: 'Berkembang Sangat Baik', singkat: 'BSB', tone: 'bg-sky-50 text-sky-700 border-sky-200' }
};

export function ratingUI(rating) {
  return RATING_UI[rating] || null;
}

// structured_observation = { pillars: {iqra:'BSH',...}, activities: {'Mewarnai':'MB',...} }
export function daftarPenilaian(structured) {
  const out = [];
  const pillars = structured?.pillars || {};
  for (const [kunci, rating] of Object.entries(pillars)) {
    if (!rating) continue;
    out.push({ grup: 'Pilar', label: PILLAR_LABEL[kunci] || kunci, rating });
  }
  const akt = structured?.activities || {};
  for (const [nama, rating] of Object.entries(akt)) {
    if (!rating) continue;
    out.push({ grup: 'Kegiatan', label: nama, rating });
  }
  return out;
}

export function adaPenilaian(structured) {
  return daftarPenilaian(structured).length > 0;
}

export const MOOD_UI = {
  ceria: { label: 'Ceria', emoji: 'mood-ceria', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  tenang: { label: 'Tenang', emoji: 'mood-tenang', tone: 'bg-sky-50 text-sky-700 border-sky-200' },
  biasa: { label: 'Biasa', emoji: 'mood-biasa', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  mengantuk: { label: 'Mengantuk', emoji: 'mood-mengantuk', tone: 'bg-blue-50 text-blue-700 border-blue-200' },
  manja: { label: 'Manja', emoji: 'mood-manja', tone: 'bg-violet-50 text-violet-700 border-violet-200' },
  rewel: { label: 'Rewel', emoji: 'mood-rewel', tone: 'bg-rose-50 text-rose-700 border-rose-200' }
};

export const MAKAN_UI = {
  habis: { label: 'Habis', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  setengah: { label: 'Setengah', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  tidak: { label: 'Tidak makan', tone: 'bg-rose-50 text-rose-700 border-rose-200' }
};

export function moodUI(mood) {
  return MOOD_UI[mood] || null;
}

export function makanUI(makan) {
  return MAKAN_UI[makan] || null;
}

// Ikon kegiatan: cocokkan kata kunci, sisanya pakai ikon umum. Sengaja
// longgar supaya nama kegiatan bebas dari guru tetap dapat ikon.
const IKON_AKTIVITAS = [
  [/(mewarnai|melukis|menggambar|kolase|kreatif)/i, 'palette'],
  [/(motorik|senam|olahraga|melompat|menari|gerak)/i, 'activity'],
  [/(membaca|cerita|bernyanyi|musik|tilawati|iqra|hafalan)/i, 'book'],
  [/(menulis|huruf|angka|berhitung|kognitif)/i, 'pencil'],
  [/(sosial|emosional|bermain|kelompok|sharing)/i, 'users'],
  [/(makan|snack|minum|menu)/i, 'utensils'],
  [/(tidur|istirahat)/i, 'moon'],
  [/(sholat|doa|agama|akhlak)/i, 'heart'],
  [/(kebersihan|cuci tangan|toilet|mandiri)/i, 'droplet'],
  [/(berkebun|alam|outdoor|pasir|air)/i, 'leaf']
];

export function ikonAktivitas(nama) {
  const teks = String(nama || '');
  for (const [pola, ikon] of IKON_AKTIVITAS) if (pola.test(teks)) return ikon;
  return 'sparkles';
}

export function lampiranGambar(lampiran = []) {
  return (lampiran || []).filter((a) => /\.(png|jpe?g|webp|gif|avif)$/i.test(String(a.url || '')));
}

export function lampiranDokumen(lampiran = []) {
  return (lampiran || []).filter((a) => !/\.(png|jpe?g|webp|gif|avif)$/i.test(String(a.url || '')));
}

// Kelompokkan riwayat per bulan untuk linimasa ("Oktober 2026").
export function kelompokBulan(rows = []) {
  const map = new Map();
  for (const r of rows) {
    const key = String(r.tanggal || '').slice(0, 7);
    if (!map.has(key)) map.set(key, { bulan: key, label: monthLabel(key), rows: [] });
    map.get(key).rows.push(r);
  }
  return [...map.values()];
}

// Satu catatan ringkas untuk linimasa: status baca + ada tanggapan atau belum.
export function ringkasCatatan(r) {
  const komentar = r?.comments || [];
  const tanggapanWali = komentar.filter((c) => c.author_role === 'wali').length;
  const balasanGuru = komentar.filter((c) => c.author_role !== 'wali').length;
  return {
    belumDibaca: !r?.read,
    jumlahKomentar: komentar.length,
    tanggapanWali,
    balasanGuru,
    adaTanggapan: komentar.length > 0
  };
}

// ---------------------------------------------------------------------------
// Laporan bulanan
// ---------------------------------------------------------------------------
export function slugNama(nama) {
  return (
    String(nama || 'Siswa')
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-') || 'Siswa'
  );
}

export function namaLaporan(siswaNama, bulan, ext = 'pdf') {
  return `Laporan-Absensi_${slugNama(siswaNama)}_${String(bulan).replace('-', '-')}.${ext}`;
}

export function teksBagikanLaporan(siswaNama, bulan) {
  return `Assalamualaikum, berikut laporan kehadiran ${siswaNama} periode ${monthLabel(bulan)}. Terima kasih.`;
}

export function teksBagikanKuitansi(nama, pembayaran) {
  return `Kuitansi ${pembayaran?.receipt_no || ''} atas nama ${nama} sebesar ${rupiah(
    pembayaran?.nominal
  )} sudah terverifikasi. Terima kasih.`;
}

// ---------------------------------------------------------------------------
// Identitas & angka
// ---------------------------------------------------------------------------
export function inisial(nama) {
  const parts = String(nama || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const NADA_AVATAR = [
  'bg-amber-100 text-amber-700',
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
  'bg-indigo-100 text-indigo-700'
];

export function nadaAvatar(nama) {
  const teks = String(nama || '');
  let hash = 0;
  for (let i = 0; i < teks.length; i++) hash = (teks.charCodeAt(i) + ((hash << 5) - hash)) | 0;
  return NADA_AVATAR[Math.abs(hash) % NADA_AVATAR.length];
}

// Sapaan waktu WIB. Dipakai hero portal supaya pembukaan terasa personal.
export function sapaanSekarang(now = new Date()) {
  const jam = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false }).format(now)
  );
  if (jam < 11) return 'Selamat pagi';
  if (jam < 15) return 'Selamat siang';
  if (jam < 18) return 'Selamat sore';
  return 'Selamat malam';
}

export function persen(hitung, total) {
  if (!total) return 0;
  return round1((hitung / total) * 100);
}

export function namaPanggilan(siswa) {
  return siswa?.nama_panggilan || String(siswa?.nama || '').split(' ')[0] || 'Anak';
}

// Rentang tanggal untuk ekspor laporan satu bulan.
export function rentangBulan(bulan) {
  return monthRange(bulan);
}
