// Retensi galeri kegiatan: kebijakan umur foto + pelaksanaannya.
//
// Tiga keputusan yang membentuk berkas ini:
//
//   1. Dua tingkat, bukan satu. "Arsip" menghapus berkas penuh tetapi
//      mempertahankan thumbnail, sehingga album lama tetap bisa dibuka wali
//      sementara ~85% ruang kembali. "Hapus" baru membuang barisnya. Kalau
//      hanya ada satu tombol hapus, admin akan menundanya sampai disk penuh —
//      dan pada titik itu tidak ada lagi pilihan yang aman.
//   2. Patokan umurnya `tanggal` foto, bukan created_at. Guru kadang mengunggah
//      foto lama; yang menentukan "foto ini sudah lama" adalah tanggal
//      kegiatannya, sama seperti yang dilihat wali di galeri.
//   3. Dibatasi per putaran (MAKS_PER_JALAN). better-sqlite3 sinkron dan
//      unlink juga sinkron: 3.000 foto sekaligus akan membekukan server
//      beberapa detik. Sisanya dikerjakan putaran berikutnya.
//
// Berkas yatim (ada di folder, tidak ada barisnya) ikut dibersihkan — tetapi
// hanya yang cocok pola nama unggahan dan berumur lebih dari SEHARI, supaya
// unggahan yang sedang berjalan tidak tersapu.
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { nowUtc, todayWIB, audit } = require('./workflow');

const DIR = path.resolve(__dirname, '../uploads/kegiatan');
const MAKS_PER_JALAN = 400;
const MAKS_YATIM_PER_JALAN = 300;
const UMUR_YATIM_JAM = 24;
// Nama berkas buatan routes/kegiatan.js: `<rombel>-<epoch>-<hex>.jpg` dan
// versi thumbnail-nya. Pola ini yang membuat penyapuan berkas asing aman.
const POLA_NAMA = /^\d+-\d+-[0-9a-f]{4,}(-thumb)?\.jpg$/;

const KUNCI = {
  aktif: 'retensi_aktif',
  arsipBulan: 'retensi_arsip_bulan',
  hapusBulan: 'retensi_hapus_bulan',
  terakhir: 'retensi_terakhir_jalan'
};

const BAWAAN = { aktif: false, arsipBulan: 12, hapusBulan: 0 };

const BATAS_ARSIP = { min: 0, maks: 60 };
const BATAS_HAPUS = { min: 0, maks: 120 };

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

// Angka dari DB bisa kosong/rusak; jatuh ke bawaan daripada mengarsipkan foto
// tahun ini karena pembacaan yang gagal.
function angka(nilai, bawaan) {
  if (nilai === null || nilai === undefined || nilai === '') return bawaan;
  const n = Number(nilai);
  return Number.isFinite(n) ? Math.round(n) : bawaan;
}

function ambilSetelan() {
  const aktif = getNilai(KUNCI.aktif);
  return {
    aktif: aktif === '1' || aktif === 'true',
    arsipBulan: angka(getNilai(KUNCI.arsipBulan), BAWAAN.arsipBulan),
    hapusBulan: angka(getNilai(KUNCI.hapusBulan), BAWAAN.hapusBulan),
    terakhirJalan: getNilai(KUNCI.terakhir) || null
  };
}

function periksaAngka(nama, nilai, batas) {
  if (!Number.isInteger(nilai)) throw new Error(`${nama} harus bilangan bulat`);
  if (nilai < batas.min || nilai > batas.maks) throw new Error(`${nama} harus antara ${batas.min} dan ${batas.maks}`);
  return nilai;
}

function simpanSetelan(input, aktor) {
  const arsipBulan = periksaAngka('Batas arsip (bulan)', angka(input.arsipBulan, BAWAAN.arsipBulan), BATAS_ARSIP);
  const hapusBulan = periksaAngka('Batas hapus (bulan)', angka(input.hapusBulan, BAWAAN.hapusBulan), BATAS_HAPUS);

  // Hapus harus SELALU setelah arsip. Kalau dibalik, foto akan dihapus total
  // sebelum sempat diarsipkan — dan admin mengira ia memilih "arsip".
  if (arsipBulan > 0 && hapusBulan > 0 && hapusBulan <= arsipBulan)
    throw new Error('Batas hapus harus lebih lama dari batas arsip');

  setNilai(KUNCI.aktif, input.aktif ? '1' : '0');
  setNilai(KUNCI.arsipBulan, arsipBulan);
  setNilai(KUNCI.hapusBulan, hapusBulan);

  const hasil = ambilSetelan();
  audit(aktor, 'ubah_retensi', 'setelan', null, { after: hasil });
  return hasil;
}

// Tanggal `YYYY-MM-DD` dikurangi n bulan, dengan pembatasan akhir bulan
// (31 Maret - 1 bulan = 28/29 Februari, bukan tanggal invalid).
function kurangiBulan(tanggal, bulan) {
  const [y, m, d] = String(tanggal).split('-').map(Number);
  if (!y || !m || !d) return null;
  const total = y * 12 + (m - 1) - bulan;
  const tahun = Math.floor(total / 12);
  const bulanBaru = ((total % 12) + 12) % 12;
  const akhirBulan = new Date(Date.UTC(tahun, bulanBaru + 1, 0)).getUTCDate();
  const hari = Math.min(d, akhirBulan);
  return `${tahun}-${String(bulanBaru + 1).padStart(2, '0')}-${String(hari).padStart(2, '0')}`;
}

function batas(setelan, sekarang) {
  return {
    arsip: setelan.arsipBulan > 0 ? kurangiBulan(sekarang, setelan.arsipBulan) : null,
    hapus: setelan.hapusBulan > 0 ? kurangiBulan(sekarang, setelan.hapusBulan) : null
  };
}

function kandidatArsip(b, limit = MAKS_PER_JALAN) {
  if (!b.arsip) return [];
  return db
    .prepare(
      `SELECT id,tanggal,judul,url,thumb_url,size_bytes,ukuran_thumb
       FROM kegiatan_foto
       WHERE diarsipkan=0 AND tanggal<?
       ORDER BY tanggal ASC, id ASC
       LIMIT ?`
    )
    .all(b.arsip, limit);
}

function kandidatHapus(b, limit = MAKS_PER_JALAN) {
  if (!b.hapus) return [];
  return db
    .prepare(
      `SELECT id,tanggal,judul,url,thumb_url,size_bytes,ukuran_thumb
       FROM kegiatan_foto
       WHERE tanggal<?
       ORDER BY tanggal ASC, id ASC
       LIMIT ?`
    )
    .all(b.hapus, limit);
}

function hitungKandidat(b) {
  const hitung = (sql, param) => db.prepare(sql).get(param) || { foto: 0, bytes: 0 };
  return {
    arsip: b.arsip
      ? hitung(
          `SELECT COUNT(*) foto, COALESCE(SUM(size_bytes+ukuran_thumb),0) bytes
           FROM kegiatan_foto WHERE diarsipkan=0 AND tanggal<?`,
          b.arsip
        )
      : { foto: 0, bytes: 0 },
    hapus: b.hapus
      ? hitung(
          `SELECT COUNT(*) foto, COALESCE(SUM(size_bytes+ukuran_thumb),0) bytes
           FROM kegiatan_foto WHERE tanggal<?`,
          b.hapus
        )
      : { foto: 0, bytes: 0 }
  };
}

// Berkas di folder galeri yang tidak dirujuk satu baris pun. Dibatasi pada nama
// berpola dan berkas berumur > 1 hari: unggahan yang sedang berjalan belum
// sempat ditulis ke DB saat penyapuan berjalan.
function berkasYatim() {
  let isi;
  try {
    isi = fs.readdirSync(DIR, { withFileTypes: true });
  } catch {
    return [];
  }
  const dirujuk = new Set();
  for (const r of db.prepare('SELECT url,thumb_url FROM kegiatan_foto').all()) {
    if (r.url) dirujuk.add(path.basename(r.url));
    if (r.thumb_url) dirujuk.add(path.basename(r.thumb_url));
  }
  const batasWaktu = Date.now() - UMUR_YATIM_JAM * 60 * 60 * 1000;
  const hasil = [];
  for (const e of isi) {
    if (!e.isFile() || !POLA_NAMA.test(e.name) || dirujuk.has(e.name)) continue;
    const p = path.join(DIR, e.name);
    try {
      const st = fs.statSync(p);
      if (st.mtimeMs > batasWaktu) continue;
      hasil.push({ nama: e.name, bytes: st.size });
    } catch {
      // berkas hilang di tengah pemindaian — abaikan
    }
  }
  return hasil;
}

function pratinjau(sekarang = todayWIB()) {
  const setelan = ambilSetelan();
  const b = batas(setelan, sekarang);
  const kandidat = hitungKandidat(b);
  const yatim = berkasYatim();
  return {
    setelan: { ...setelan, batas_arsip: b.arsip, batas_hapus: b.hapus },
    hari_ini: sekarang,
    akan_arsip: { foto: kandidat.arsip.foto, bytes: kandidat.arsip.bytes },
    akan_hapus: { foto: kandidat.hapus.foto, bytes: kandidat.hapus.bytes },
    yatim: { berkas: yatim.length, bytes: yatim.reduce((n, f) => n + f.bytes, 0) },
    contoh: {
      arsip: kandidatArsip(b, 8).map((r) => ({
        id: r.id,
        tanggal: r.tanggal,
        judul: r.judul,
        bytes: Number(r.size_bytes || 0)
      })),
      hapus: kandidatHapus(b, 8).map((r) => ({
        id: r.id,
        tanggal: r.tanggal,
        judul: r.judul,
        bytes: Number(r.size_bytes || 0) + Number(r.ukuran_thumb || 0)
      }))
    }
  };
}

function ukuranBerkas(p) {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
}

function hapusBerkas(p) {
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    // Berkas yang gagal dihapus tidak boleh menghentikan putaran; barisnya
    // tetap ditandai sehingga penyapuan yatim berikutnya yang menuntaskan.
  }
}

function arsipkanSatu(row) {
  const penuh = path.join(DIR, path.basename(String(row.url || '')));
  const thumb = path.join(DIR, path.basename(String(row.thumb_url || '')));
  const ukuranThumb = ukuranBerkas(thumb);
  const ukuranPenuh = ukuranBerkas(penuh) || Number(row.size_bytes || 0);
  hapusBerkas(penuh);
  db.prepare(
    `UPDATE kegiatan_foto
     SET diarsipkan=1, diarsipkan_at=?, ukuran_asli=CASE WHEN ukuran_asli=0 THEN ? ELSE ukuran_asli END,
         size_bytes=0, ukuran_thumb=?
     WHERE id=?`
  ).run(nowUtc(), ukuranPenuh, ukuranThumb, row.id);
  return ukuranPenuh;
}

function hapusSatu(row) {
  const penuh = path.join(DIR, path.basename(String(row.url || '')));
  const thumb = path.join(DIR, path.basename(String(row.thumb_url || '')));
  const bytes = ukuranBerkas(penuh) + ukuranBerkas(thumb);
  hapusBerkas(penuh);
  hapusBerkas(thumb);
  db.prepare('DELETE FROM kegiatan_foto WHERE id=?').run(row.id);
  return bytes;
}

function catatLog(hasil) {
  if (!tabelAda('retensi_log')) return;
  db.prepare(
    `INSERT INTO retensi_log(dijalankan_at,mode,foto_diarsip,byte_diarsip,foto_dihapus,byte_dihapus,
      berkas_yatim,byte_yatim,sisa,oleh_pengguna_id)
     VALUES(?,?,?,?,?,?,?,?,?,?)`
  ).run(
    hasil.dijalankan_at,
    hasil.mode,
    hasil.diarsip.foto,
    hasil.diarsip.bytes,
    hasil.dihapus.foto,
    hasil.dihapus.bytes,
    hasil.yatim.berkas,
    hasil.yatim.bytes,
    hasil.sisa,
    hasil.oleh || null
  );
}

// Satu putaran: arsip dulu, baru hapus. Urutannya penting — kalau hapus
// dijalankan lebih dulu, foto yang seharusnya hanya diarsipkan (karena
// batasnya sama-sama terlewati di putaran yang sama) akan hilang total.
function jalankan({ mode = 'manual', aktor = null, sekarang = todayWIB() } = {}) {
  const setelan = ambilSetelan();
  const b = batas(setelan, sekarang);
  const diarsip = { foto: 0, bytes: 0 };
  const dihapus = { foto: 0, bytes: 0 };

  if (b.arsip) {
    for (const row of kandidatArsip(b)) {
      diarsip.bytes += arsipkanSatu(row);
      diarsip.foto += 1;
    }
  }
  if (b.hapus) {
    for (const row of kandidatHapus(b)) {
      dihapus.bytes += hapusSatu(row);
      dihapus.foto += 1;
    }
  }

  // Penyapuan yatim hanya dijalankan bila tabel galeri berisi sesuatu. Database
  // kosong + folder penuh adalah tanda restore yang tidak lengkap; menyapu
  // dalam keadaan itu akan menghapus seluruh galeri.
  let yatim = { berkas: 0, bytes: 0 };
  const adaFoto = db.prepare('SELECT COUNT(*) c FROM kegiatan_foto').get().c > 0;
  if (adaFoto) {
    for (const f of berkasYatim().slice(0, MAKS_YATIM_PER_JALAN)) {
      hapusBerkas(path.join(DIR, f.nama));
      yatim.berkas += 1;
      yatim.bytes += f.bytes;
    }
  }

  const sisaArsip = b.arsip
    ? db.prepare('SELECT COUNT(*) c FROM kegiatan_foto WHERE diarsipkan=0 AND tanggal<?').get(b.arsip).c
    : 0;
  const sisaHapus = b.hapus ? db.prepare('SELECT COUNT(*) c FROM kegiatan_foto WHERE tanggal<?').get(b.hapus).c : 0;

  const hasil = {
    status: 'jalan',
    mode,
    dijalankan_at: nowUtc(),
    oleh: aktor ? aktor.id : null,
    batas: b,
    diarsip,
    dihapus,
    yatim,
    sisa: Math.max(sisaArsip, sisaHapus)
  };

  setNilai(KUNCI.terakhir, hasil.dijalankan_at);
  catatLog(hasil);

  if (aktor) audit(aktor, 'jalankan_retensi', 'kegiatan_foto', null, { after: hasil });
  return hasil;
}

// Job harian: sekali per tanggal WIB. Server yang mati semalam tetap
// menjalankan retensi saat hidup kembali, bukan melewatkannya.
function jalanHarian({ paksa = false, aktor = null, sekarang = todayWIB() } = {}) {
  const setelan = ambilSetelan();
  if (!setelan.aktif && !paksa) return { status: 'nonaktif' };
  if (!paksa && setelan.terakhirJalan && String(setelan.terakhirJalan).slice(0, 10) === sekarang)
    return { status: 'sudah' };
  return jalankan({ mode: paksa ? 'manual' : 'otomatis', aktor, sekarang });
}

function riwayat(limit = 12) {
  if (!tabelAda('retensi_log')) return [];
  const n = Math.min(50, Math.max(1, Number(limit) || 12));
  return db.prepare(`SELECT * FROM retensi_log ORDER BY id DESC LIMIT ${n}`).all();
}

module.exports = {
  KUNCI,
  BAWAAN,
  DIR,
  ambilSetelan,
  simpanSetelan,
  kurangiBulan,
  pratinjau,
  jalankan,
  jalanHarian,
  riwayat,
  berkasYatim
};
