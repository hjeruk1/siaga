// Pengingat tagihan otomatis: dari "tidak ada pengingat sama sekali" menjadi
// pesan terjadwal ke wali, memakai kanal yang sudah ada (in-app + push + WA
// per cabang).
//
// Tiga keputusan yang menentukan bentuk berkas ini:
//
//   1. Tahap, bukan tanggal tetap. Pengingat dikirim saat tagihan MASUK jendela
//      (H-3, hari-H, lewat jatuh tempo), bukan "hanya pada tanggal 7". Kalau
//      server mati sehari, pesannya tetap terkirim keesokan hari — bukan
//      hilang selamanya.
//   2. Sekali per tahap per tagihan. UNIQUE(tagihan_id, jenis_ingat) menahan
//      pengulangan; tanpa itu, orang tua akan menerima pesan yang sama setiap
//      kali job berjalan.
//   3. Tidak mengejar tunggakan lama. Tagihan yang lewat jatuh tempo lebih dari
//      MAKS_TERLAMBAT_HARI dilewati: tunggakan berbulan-bulan diselesaikan
//      dengan telepon/kunjungan, bukan pesan otomatis bertubi-tubi.
const db = require('../db');
const { nowUtc, todayWIB, nowTimeWIB, audit, notify } = require('./workflow');

const MAKS_TERLAMBAT_HARI = 30;

const KUNCI = {
  aktif: 'pengingat_aktif',
  tanggal: 'pengingat_tanggal_jatuh_tempo',
  hariSebelum: 'pengingat_hari_sebelum',
  jam: 'pengingat_jam',
  mulai: 'pengingat_mulai',
  terakhirJalan: 'pengingat_terakhir_jalan'
};

const BAWAAN = {
  aktif: false,
  tanggal: 10,
  hariSebelum: 3,
  jam: '08:00'
};

// Template pesan bisa diedit admin. Dua kolom per tahap (judul & isi) karena
// judul dipakai juga oleh notifikasi in-app dan push — kalau judul dan isi
// digabung dalam satu teks, pemisahannya jadi tambal sulam.
//
// Placeholder sengaja dibatasi daftar tertutup: admin boleh menyusun kalimat,
// tetapi tidak boleh "menemukan" data baru yang tidak dikirim sistem.
const PLACEHOLDER = ['nama_anak', 'tagihan', 'nominal', 'jatuh_tempo', 'hari'];

const KUNCI_TEMPLATE = {
  h_sebelum: { judul: 'pengingat_judul_h_sebelum', isi: 'pengingat_isi_h_sebelum' },
  jatuh_tempo: { judul: 'pengingat_judul_jatuh_tempo', isi: 'pengingat_isi_jatuh_tempo' },
  terlambat: { judul: 'pengingat_judul_terlambat', isi: 'pengingat_isi_terlambat' }
};

const TEMPLATE_BAWAAN = {
  h_sebelum: {
    judul: 'Tagihan {tagihan} jatuh tempo {hari} hari lagi',
    isi: 'Ananda {nama_anak}: {tagihan} sebesar {nominal} jatuh tempo {jatuh_tempo}. Pembayaran dapat dilakukan melalui admin atau transfer sesuai petunjuk sekolah.'
  },
  jatuh_tempo: {
    judul: 'Tagihan {tagihan} jatuh tempo hari ini',
    isi: 'Ananda {nama_anak}: {tagihan} sebesar {nominal} jatuh tempo hari ini ({jatuh_tempo}). Pembayaran dapat dilakukan melalui admin atau transfer sesuai petunjuk sekolah.'
  },
  terlambat: {
    judul: 'Tagihan {tagihan} sudah lewat jatuh tempo',
    isi: 'Ananda {nama_anak}: {tagihan} sebesar {nominal} sudah lewat jatuh tempo {jatuh_tempo}. Mohon segera diselesaikan, atau hubungi admin bila sudah membayar.'
  }
};

const BATAS_JUDUL = 120;
const BATAS_ISI = 800;

function tabelAda(nama) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(nama);
}

function getNilai(kunci) {
  if (!tabelAda('setelan')) return null;
  const row = db.prepare('SELECT nilai FROM setelan WHERE kunci=?').get(kunci);
  return row ? row.nilai : null;
}

function setNilai(kunci, nilai) {
  db.prepare(
    `INSERT INTO setelan(kunci,nilai,updated_at) VALUES(?,?,?)
     ON CONFLICT(kunci) DO UPDATE SET nilai=excluded.nilai, updated_at=excluded.updated_at`
  ).run(kunci, String(nilai), nowUtc());
}

// Angka dari DB/env selalu bisa aneh (null, string kosong, NaN). Jatuh ke
// bawaan daripada mengirim pengingat pada tanggal yang salah.
//
// Pemeriksaan null/'' di depan BUKAN hiasan: Number(null) === 0 dan
// Number('') === 0, sehingga tanpa ini "ingatkan H-3 hari" yang belum pernah
// disimpan akan terbaca sebagai H-0 dan pengingat awal tidak pernah terkirim.
function keAngka(nilai, bawaan, min, maks) {
  if (nilai === null || nilai === undefined || String(nilai).trim() === '') return bawaan;
  const n = Number(nilai);
  if (!Number.isFinite(n)) return bawaan;
  const bulat = Math.round(n);
  if (bulat < min || bulat > maks) return bawaan;
  return bulat;
}

function ambilSetelan() {
  const jam = getNilai(KUNCI.jam);
  return {
    aktif: getNilai(KUNCI.aktif) === '1',
    tanggal: keAngka(getNilai(KUNCI.tanggal), BAWAAN.tanggal, 1, 28),
    hariSebelum: keAngka(getNilai(KUNCI.hariSebelum), BAWAAN.hariSebelum, 0, 14),
    jam: /^\d{2}:\d{2}$/.test(String(jam)) ? String(jam) : BAWAAN.jam,
    mulai: getNilai(KUNCI.mulai) || null,
    terakhirJalan: getNilai(KUNCI.terakhirJalan) || null
  };
}

// Template efektif: nilai tersimpan kalau ada isinya, kalau tidak pakai
// bawaan. Field kosong sengaja TIDAK dianggap "kosongkan pesan" — pesan
// tagihan tanpa isi lebih buruk daripada pesan dengan kalimat bawaan.
function ambilTemplate() {
  const hasil = {};
  for (const tahap of Object.keys(TEMPLATE_BAWAAN)) {
    const kunci = KUNCI_TEMPLATE[tahap];
    hasil[tahap] = {
      judul: String(getNilai(kunci.judul) || '').trim() || TEMPLATE_BAWAAN[tahap].judul,
      isi: String(getNilai(kunci.isi) || '').trim() || TEMPLATE_BAWAAN[tahap].isi
    };
  }
  return hasil;
}

function placeholderDipakai(teks) {
  return [...String(teks || '').matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]);
}

// Validasi saat menyimpan, bukan saat mengirim: admin harus tahu sekarang
// kalau ada placeholder yang tidak dikenal (mis. {nama} alih-alih {nama_anak}),
// bukan setelah 60 orang tua menerima pesan dengan teks aneh.
function validasiTemplate(masukan) {
  if (masukan === undefined || masukan === null) return null;
  if (typeof masukan !== 'object') throw new Error('Template harus berupa objek');
  const bersih = {};
  for (const tahap of Object.keys(TEMPLATE_BAWAAN)) {
    const isiMasuk = masukan[tahap];
    if (isiMasuk === undefined) continue;
    if (typeof isiMasuk !== 'object' || isiMasuk === null) throw new Error(`Template ${tahap} tidak valid`);
    const judul = String(isiMasuk.judul ?? '').trim();
    const isi = String(isiMasuk.isi ?? '').trim();
    if (judul.length > BATAS_JUDUL) throw new Error(`Judul ${tahap} terlalu panjang (maks ${BATAS_JUDUL})`);
    if (isi.length > BATAS_ISI) throw new Error(`Isi ${tahap} terlalu panjang (maks ${BATAS_ISI})`);
    const asing = [...new Set([...placeholderDipakai(judul), ...placeholderDipakai(isi)])].filter(
      (p) => !PLACEHOLDER.includes(p)
    );
    if (asing.length) {
      throw new Error(`Placeholder tidak dikenal: ${asing.map((p) => `{${p}}`).join(', ')}`);
    }
    bersih[tahap] = { judul, isi };
  }
  return bersih;
}

// Tanggal 1-28 saja: tanggal 29-31 tidak ada di semua bulan, dan pengingat
// yang bergeser sendiri tiap Februari lebih membingungkan daripada membantu.
function simpanSetelan(patch, aktor) {
  const lama = ambilSetelan();
  const template = validasiTemplate(patch.template);
  const baru = {
    aktif: patch.aktif === undefined ? lama.aktif : !!patch.aktif,
    tanggal: patch.tanggal === undefined ? lama.tanggal : keAngka(patch.tanggal, lama.tanggal, 1, 28),
    hariSebelum:
      patch.hariSebelum === undefined ? lama.hariSebelum : keAngka(patch.hariSebelum, lama.hariSebelum, 0, 14),
    jam: /^\d{2}:\d{2}$/.test(String(patch.jam)) ? String(patch.jam) : lama.jam
  };
  setNilai(KUNCI.aktif, baru.aktif ? '1' : '0');
  setNilai(KUNCI.tanggal, baru.tanggal);
  setNilai(KUNCI.hariSebelum, baru.hariSebelum);
  setNilai(KUNCI.jam, baru.jam);
  if (template) {
    for (const tahap of Object.keys(template)) {
      const kunci = KUNCI_TEMPLATE[tahap];
      // String kosong = kembalikan ke bawaan: hapus kuncinya supaya
      // ambilTemplate() memakai TEMPLATE_BAWAAN, bukan menyimpan ''.
      if (template[tahap].judul) setNilai(kunci.judul, template[tahap].judul);
      else db.prepare('DELETE FROM setelan WHERE kunci=?').run(kunci.judul);
      if (template[tahap].isi) setNilai(kunci.isi, template[tahap].isi);
      else db.prepare('DELETE FROM setelan WHERE kunci=?').run(kunci.isi);
    }
  }
  // Saat pertama kali diaktifkan, pasang garis start hari ini. Tanpa ini,
  // job pertama langsung mengejar SEMUA tunggakan lama dan mengirim puluhan
  // pesan "sudah lewat jatuh tempo" dalam satu pagi — cara tercepat membuat
  // orang tua memblokir nomor sekolah. Tunggakan lama tetap bisa dikirim,
  // tetapi lewat tombol manual yang disadari admin.
  if (baru.aktif && !lama.aktif && !lama.mulai) setNilai(KUNCI.mulai, todayWIB());
  audit(aktor, 'pengingat_setelan', 'setelan', null, {
    after: {
      aktif: baru.aktif,
      tanggal: baru.tanggal,
      hari_sebelum: baru.hariSebelum,
      jam: baru.jam,
      template_diubah: !!template
    }
  });
  return ambilSetelan();
}

// 'YYYY-MM' + tanggal -> 'YYYY-MM-DD', dibatasi akhir bulan.
function tanggalJatuhTempo(periode, tanggal) {
  const m = String(periode || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const tahun = Number(m[1]);
  const bulan = Number(m[2]);
  if (!tahun || !bulan || bulan > 12) return null;
  const akhirBulan = new Date(Date.UTC(tahun, bulan, 0)).getUTCDate();
  const hari = Math.min(Math.max(1, Number(tanggal) || BAWAAN.tanggal), akhirBulan);
  return `${m[1]}-${m[2]}-${String(hari).padStart(2, '0')}`;
}

// Selisih hari (tanggalA - tanggalB) untuk string YYYY-MM-DD. Dihitung di UTC
// supaya perbedaan zona waktu tidak pernah menghasilkan selisih 23/25 jam yang
// membulat ke hari yang salah.
function selisihHari(tanggalA, tanggalB) {
  const a = Date.parse(`${tanggalA}T00:00:00Z`);
  const b = Date.parse(`${tanggalB}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((a - b) / 86400000);
}

// Tahap pengingat untuk sisa hari tertentu.
//   lewat jatuh tempo        -> 'terlambat' (sekali, segera setelah lewat)
//   hari ini jatuh tempo     -> 'jatuh_tempo'
//   <= hariSebelum           -> 'h_sebelum'
//   masih jauh               -> null
function tahapUntuk(hariTersisa, hariSebelum) {
  if (hariTersisa === null) return null;
  if (hariTersisa < -MAKS_TERLAMBAT_HARI) return null;
  if (hariTersisa < 0) return 'terlambat';
  if (hariTersisa === 0) return 'jatuh_tempo';
  if (hariTersisa <= hariSebelum) return 'h_sebelum';
  return null;
}

function rupiah(n) {
  return 'Rp ' + Number(n || 0).toLocaleString('id-ID');
}

function tanggalPanjang(iso) {
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(t)) return iso;
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(new Date(t));
}

// Nilai yang tersedia untuk placeholder. Dikumpulkan di satu tempat supaya
// daftar PLACEHOLDER dan isi sebenarnya tidak bisa berbeda.
function nilaiPlaceholder(kandidat) {
  return {
    nama_anak: kandidat.siswa_nama,
    tagihan: kandidat.nama,
    nominal: rupiah(kandidat.sisa),
    jatuh_tempo: tanggalPanjang(kandidat.jatuh_tempo),
    hari: String(kandidat.hari_tersisa)
  };
}

function isiPlaceholder(teks, nilai) {
  return String(teks || '').replace(/\{([a-z_]+)\}/g, (utuh, nama) =>
    Object.prototype.hasOwnProperty.call(nilai, nama) ? String(nilai[nama] ?? '') : utuh
  );
}

function susunPesan(kandidat, template) {
  const tpl = template || ambilTemplate();
  const dipakai = tpl[kandidat.tahap] || TEMPLATE_BAWAAN[kandidat.tahap];
  const nilai = nilaiPlaceholder(kandidat);
  return {
    title: isiPlaceholder(dipakai.judul, nilai),
    body: isiPlaceholder(dipakai.isi, nilai)
  };
}

// Daftar tagihan yang PERLU diingatkan sekarang, sudah dikurangi yang sudah
// pernah dikirim untuk tahap itu.
//
// abaikanMulai=true dipakai tombol "kirim sekarang": admin sudah melihat
// pratinjau dan memutuskan sendiri, termasuk untuk tunggakan sebelum tanggal
// mulai. Job otomatis TIDAK pernah memakai ini.
function daftarKandidat({ cabangId = null, tanggal = todayWIB(), abaikanMulai = false } = {}) {
  const setelan = ambilSetelan();
  const params = [];
  let where = "WHERE t.status IN ('open','sebagian') AND t.nominal_final > 0";
  if (cabangId) {
    where += ' AND t.cabang_id=?';
    params.push(cabangId);
  }
  if (!abaikanMulai && setelan.mulai) {
    where += ' AND t.jatuh_tempo >= ?';
    params.push(setelan.mulai);
  }
  const rows = db
    .prepare(
      `SELECT t.id, t.nama, t.jenis, t.periode, t.status, t.nominal_final, t.jatuh_tempo, t.cabang_id,
              s.nama AS siswa_nama, c.nama AS cabang_nama,
              COALESCE((SELECT SUM(pa.nominal) FROM pembayaran_alokasi pa
                        JOIN pembayaran p ON p.id=pa.pembayaran_id
                        WHERE pa.tagihan_id=t.id AND p.status='confirmed'),0) AS paid_amount,
              w.wali_id, w.wali_no_wa
       FROM tagihan t
       JOIN siswa s ON s.id=t.siswa_id
       JOIN cabang c ON c.id=t.cabang_id
       LEFT JOIN (
         SELECT ws.siswa_id, p.id AS wali_id, p.no_wa AS wali_no_wa
         FROM wali_siswa ws JOIN pengguna p ON p.id=ws.wali_pengguna_id
         WHERE ws.aktif=1 AND p.status='aktif'
       ) w ON w.siswa_id=t.siswa_id
       ${where}`
    )
    .all(...params);

  const sudah = new Set(
    db
      .prepare('SELECT tagihan_id, jenis_ingat FROM tagihan_pengingat')
      .all()
      .map((r) => `${r.tagihan_id}:${r.jenis_ingat}`)
  );

  const hasil = [];
  for (const r of rows) {
    const jatuhTempo = r.jatuh_tempo || tanggalJatuhTempo(r.periode, setelan.tanggal);
    if (!jatuhTempo) continue;
    const hariTersisa = selisihHari(jatuhTempo, tanggal);
    const tahap = tahapUntuk(hariTersisa, setelan.hariSebelum);
    if (!tahap) continue;
    if (sudah.has(`${r.id}:${tahap}`)) continue;
    const sisa = Number(r.nominal_final) - Number(r.paid_amount || 0);
    if (sisa <= 0) continue;
    hasil.push({
      tagihan_id: r.id,
      nama: r.nama,
      jenis: r.jenis,
      periode: r.periode,
      cabang_id: r.cabang_id,
      cabang_nama: r.cabang_nama,
      siswa_nama: r.siswa_nama,
      jatuh_tempo: jatuhTempo,
      hari_tersisa: hariTersisa,
      tahap,
      sisa,
      wali_id: r.wali_id || null,
      wali_no_wa: r.wali_no_wa || null
    });
  }
  return { setelan, kandidat: hasil };
}

function catat(tagihanId, tahap, penggunaId, status, pesanError) {
  db.prepare(
    `INSERT INTO tagihan_pengingat(tagihan_id,jenis_ingat,pengguna_id,status,pesan_error,created_at)
     VALUES(?,?,?,?,?,?)
     ON CONFLICT(tagihan_id,jenis_ingat) DO UPDATE SET
       pengguna_id=excluded.pengguna_id, status=excluded.status,
       pesan_error=excluded.pesan_error, created_at=excluded.created_at`
  ).run(tagihanId, tahap, penggunaId || null, status, pesanError ? String(pesanError).slice(0, 300) : null, nowUtc());
}

// Kirim pengingat untuk semua kandidat. `aktif` sengaja TIDAK diperiksa di
// sini: admin boleh menekan "Kirim sekarang" tanpa mengubah kebijakan harian,
// sedangkan job harian memeriksa `aktif` sebelum memanggil fungsi ini.
function kirimPengingat({ cabangId = null, aktor = null, tanggal = todayWIB(), abaikanMulai = false } = {}) {
  const { kandidat } = daftarKandidat({ cabangId, tanggal, abaikanMulai });
  const template = ambilTemplate(); // sekali baca, bukan per tagihan
  const hasil = { total: kandidat.length, terkirim: 0, tanpa_wali: 0, gagal: 0, detail: [] };

  for (const k of kandidat) {
    if (!k.wali_id) {
      hasil.tanpa_wali += 1;
      hasil.detail.push({ tagihan_id: k.tagihan_id, status: 'tanpa-wali', siswa: k.siswa_nama });
      continue;
    }
    const { title, body } = susunPesan(k, template);
    try {
      // notify() menulis notifikasi in-app, lalu meneruskan ke push dan WA
      // (WA per cabang lewat cabang_id). Hasil WA tercatat di notifikasi.wa_*.
      notify(k.wali_id, 'tagihan_jatuh_tempo', title, body, 'tagihan', k.tagihan_id, k.cabang_id);
      catat(k.tagihan_id, k.tahap, k.wali_id, 'terkirim', null);
      hasil.terkirim += 1;
      hasil.detail.push({ tagihan_id: k.tagihan_id, status: 'terkirim', siswa: k.siswa_nama, tahap: k.tahap });
    } catch (e) {
      catat(k.tagihan_id, k.tahap, k.wali_id, 'gagal', e.message);
      hasil.gagal += 1;
      hasil.detail.push({ tagihan_id: k.tagihan_id, status: 'gagal', siswa: k.siswa_nama, error: e.message });
    }
  }

  if (aktor) {
    audit(aktor, 'pengingat_kirim', 'tagihan', null, {
      cabang_id: cabangId,
      after: {
        total: hasil.total,
        terkirim: hasil.terkirim,
        tanpa_wali: hasil.tanpa_wali,
        gagal: hasil.gagal,
        mode: abaikanMulai ? 'semua' : 'otomatis'
      }
    });
  }
  return hasil;
}

// Job harian: sekali per tanggal, hanya setelah jam kirim, hanya bila aktif.
// Idempoten terhadap restart — penanda "sudah jalan" disimpan di setelan.
function jalanHarian({ sekarang = new Date() } = {}) {
  const setelan = ambilSetelan();
  if (!setelan.aktif) return { status: 'nonaktif' };
  const tanggal = todayWIB(sekarang);
  if (setelan.terakhirJalan === tanggal) return { status: 'sudah-jalan', tanggal };
  if (nowTimeWIB(sekarang) < setelan.jam) return { status: 'belum-jam', jam: setelan.jam };
  const hasil = kirimPengingat({ tanggal });
  setNilai(KUNCI.terakhirJalan, tanggal);
  return { status: 'jalan', tanggal, ...hasil };
}

// Ringkasan untuk UI: setelan + apa yang akan dikirim hari ini.
// Dua angka ditampilkan terpisah supaya admin tahu bedanya sebelum menekan
// tombol: job otomatis (sejak tanggal mulai) vs seluruh tunggakan (manual).
function ringkasan(cabangId = null) {
  const { setelan, kandidat } = daftarKandidat({ cabangId });
  const semua = daftarKandidat({ cabangId, abaikanMulai: true }).kandidat;
  const perTahap = { h_sebelum: 0, jatuh_tempo: 0, terlambat: 0 };
  for (const k of kandidat) perTahap[k.tahap] += 1;
  const contoh = kandidat[0] ? { ...kandidat[0], ...susunPesan(kandidat[0]) } : null;
  const terakhir = db
    .prepare('SELECT jenis_ingat, COUNT(*) AS jumlah FROM tagihan_pengingat GROUP BY jenis_ingat')
    .all();
  return {
    setelan,
    hari_ini: { total: kandidat.length, ...perTahap },
    tunggakan: { total: semua.length, nilai: semua.reduce((n, k) => n + k.sisa, 0) },
    contoh,
    riwayat: Object.fromEntries(terakhir.map((r) => [r.jenis_ingat, r.jumlah])),
    maks_terlambat_hari: MAKS_TERLAMBAT_HARI,
    template: ambilTemplate(),
    template_bawaan: TEMPLATE_BAWAAN,
    placeholder: PLACEHOLDER
  };
}

module.exports = {
  MAKS_TERLAMBAT_HARI,
  BAWAAN,
  KUNCI,
  KUNCI_TEMPLATE,
  TEMPLATE_BAWAAN,
  PLACEHOLDER,
  ambilSetelan,
  simpanSetelan,
  ambilTemplate,
  validasiTemplate,
  tanggalJatuhTempo,
  selisihHari,
  tahapUntuk,
  susunPesan,
  daftarKandidat,
  kirimPengingat,
  jalanHarian,
  ringkasan
};
