// Isi database lokal dengan data demo agar layar tidak kosong saat audit visual.
//
//   node scripts/seed-demo.js
//
// Sengaja MENOLAK berjalan di production tanpa konfirmasi eksplisit: data ini
// fiktif dan tidak boleh masuk database sunguhan.
// dotenv hanya terpasang di backend/node_modules, jadi diambil dari sana
// (pola yang sama dipakai scripts/backup.js dan scripts/maintenance.js).
const path = require('path');
const fs = require('fs');
const bcrypt = require(path.join(__dirname, '..', 'backend', 'node_modules', 'bcryptjs'));
const Database = require(path.join(__dirname, '..', 'backend', 'node_modules', 'better-sqlite3'));
const dotenv = require(path.join(__dirname, '..', 'backend', 'node_modules', 'dotenv'));
const { todayWIB, schoolYearForDate } = require(path.join(__dirname, '..', 'backend', 'utils', 'workflow'));

dotenv.config({ path: path.join(__dirname, '..', 'backend', '.env') });

if (process.env.NODE_ENV === 'production' && process.env.SEED_DEMO_CONFIRM !== '1') {
  console.error('Menolak menjalankan seed di NODE_ENV=production tanpa SEED_DEMO_CONFIRM=1.');
  process.exit(1);
}

const db = new Database(process.env.DB_PATH || path.join(__dirname, '..', 'backend', 'siaga.db'));

// Seed hanya untuk database yang masih kosong. Menjalankannya dua kali akan
// gagal di UNIQUE username, dan pesan errornya tidak menjelaskan penyebabnya.
const existingSiswa = db.prepare('SELECT COUNT(*) AS c FROM siswa').get().c;
if (existingSiswa > 0) {
  console.error(`Database sudah berisi ${existingSiswa} siswa. Seed demo hanya untuk database kosong.`);
  console.error('Reset dulu. CATATAN: database berjalan dalam mode WAL, jadi hapus juga berkas');
  console.error('-wal dan -shm — menyalin hanya siaga.db saja tidak menghapus transaksi yang');
  console.error('sudah masuk WAL, dan data lama akan muncul kembali.');
  process.exit(1);
}
const FOTO_DIR = path.join(__dirname, '..', 'backend', 'uploads', 'foto');
fs.mkdirSync(FOTO_DIR, { recursive: true });

const TAHUN = schoolYearForDate(todayWIB());
const TODAY = todayWIB();
const NOW = new Date().toISOString();

const NAMA = [
  'Aisyah Putri',
  'Bima Saputra',
  'Citra Kirana',
  'Dimas Aryo',
  'Eka Lestari',
  'Farel Mahesa',
  'Gita Nuraini',
  'Hafiz Rahman',
  'Indah Permata',
  'Jovan Aditya',
  'Kayla Zahra',
  'Lukman Hakim',
  'Maharani Ayu',
  'Naufal Rizky',
  'Olivia Tanaya',
  'Putra Wijaya',
  'Quinn Aulia',
  'Rangga Baskara',
  'Salsabila Naura',
  'Tegar Prakoso',
  'Umar Faruq',
  'Vania Larasati',
  'Wahyu Setiawan',
  'Xaviera Kirana',
  'Yusuf Maulana',
  'Zahra Kamila',
  'Aditio Prawira',
  'Bella Anggraini',
  'Cahyo Wibowo',
  'Dinda Maharani',
  'Elang Perkasa',
  'Fitri Handayani',
  'Galih Prakoso',
  'Hana Kirana',
  'Irfan Maulana',
  'Jasmine Ayu',
  'Kevin Hartanto',
  'Laras Ayu',
  'Mika Salsabila',
  'Nanda Perwira',
  'Oscar Tanaya',
  'Puspita Ayu',
  'Rizky Ramadhan',
  'Sinta Maharani',
  'Taufik Hidayat',
  'Utari Lestari',
  'Vino Bastian',
  'Wulan Sari',
  'Yoga Pratama',
  'Zulfa Naura',
  'Anindya Kirana',
  'Bagas Prakoso',
  'Calista Ayu',
  'Damar Wibowo',
  'Elin Puspita',
  'Fikri Ramadhan',
  'Ganesha Perwira',
  'Hanifah Ayu',
  'Ivan Hartanto'
];

// CHECK constraint siswa.status hanya menerima aktif|keluar|lulus.
const STATUS_SISWA = ['aktif', 'aktif', 'aktif', 'aktif', 'aktif', 'aktif', 'aktif', 'aktif', 'lulus', 'keluar'];

const seed = db.transaction(() => {
  // ---- Pengguna ----
  // Catatan: cabang staff BUKAN kolom di tabel pengguna, melainkan di
  // staff_profile (lihat middleware/auth.js -> loadUser).
  const hash = bcrypt.hashSync('admin123', 10);
  const mkUser = (tipe, role, display_name, username, mustChange = 0, no_wa = null) =>
    db
      .prepare(
        `INSERT INTO pengguna(tipe,role,display_name,username,no_wa,password_hash,status,must_change_password,created_at,updated_at)
         VALUES(?,?,?,?,?,?,'aktif',?,?,?)`
      )
      .run(tipe, role, display_name, username, no_wa, hash, mustChange, NOW, NOW).lastInsertRowid;

  const insStaffProfile = db.prepare(
    'INSERT INTO staff_profile(pengguna_id,cabang_id,jabatan,no_wa_kontak) VALUES(?,?,?,?)'
  );
  const mkStaff = (role, display_name, username, cabang_id, mustChange = 0) => {
    const id = mkUser('staff', role, display_name, username, mustChange);
    insStaffProfile.run(id, cabang_id, role, '0812000000' + String(cabang_id));
    return id;
  };

  db.prepare(
    "UPDATE pengguna SET status='aktif',must_change_password=0,password_hash=?,updated_at=? WHERE username='admin'"
  ).run(hash, NOW);

  // adminCab1 dipakai sebagai pelaku di audit_log. Akun lain dibuat agar bisa
  // dipakai login saat audit visual, jadi tidak perlu ditampung dalam variabel.
  const adminCab1 = mkStaff('admin_cabang', 'Rina Wibowo', 'admin_cabang1', 1);
  mkStaff('admin_cabang', 'Budi Santoso', 'admin_cabang2', 2);
  mkStaff('kepsek', 'Siti Nurhaliza', 'kepsek', 1);
  mkStaff('gerbang', 'Joko Susilo', 'gerbang', 1);
  const gurus = ['Ayu Lestari', 'Dewi Anggraini', 'Putri Maharani', 'Rani Kusuma', 'Maya Sari'].map((nama, i) =>
    mkStaff('guru', nama, 'guru' + (i + 1), (i % 3) + 1)
  );
  const waliUsers = ['Andi Pratama', 'Sari Melati', 'Hendra Wijaya', 'Lestari Dewi', 'Agus Setiawan'].map((nama, i) =>
    mkUser('wali', 'wali', nama, 'wali' + (i + 1), 0, '08120000000' + i)
  );
  // Satu akun sengaja masih wajib ganti password, untuk mengaudit alur itu.
  mkStaff('guru', 'Fajar Nugroho', 'guru_baru', 3, 1);

  const cabangList = db
    .prepare('SELECT id FROM cabang ORDER BY id')
    .all()
    .map((r) => r.id);
  const rombelList = db.prepare('SELECT id,cabang_id,jenjang_id,nama FROM rombel ORDER BY cabang_id,jenjang_id').all();
  const jenjangList = db.prepare('SELECT id,nama,tipe FROM jenjang ORDER BY urutan').all();

  // ---- Siswa + enrollment ----
  const insSiswa = db.prepare(
    `INSERT INTO siswa(nama,nis,nama_panggilan,gender,tanggal_lahir,alamat,foto,status,status_kartu,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?, 'aktif',?,?)`
  );
  const insEnroll = db.prepare(
    `INSERT INTO siswa_enrollment(siswa_id,cabang_id,jenjang_id,rombel_id,paket,tanggal_mulai,status,created_at)
     VALUES(?,?,?,?,?,'2026-07-01','aktif',?)`
  );

  const siswaRows = [];
  NAMA.forEach((nama, i) => {
    const rombel = rombelList[i % rombelList.length];
    const paket = i % 3 === 0 ? 'full_day' : 'reguler';
    const status = STATUS_SISWA[i % STATUS_SISWA.length];
    const foto = i % 4 === 0 ? null : `/uploads/foto/siswa-demo-${i + 1}.jpg`;
    const id = insSiswa.run(
      nama,
      `NIS${String(2026000 + i + 1)}`,
      nama.split(' ')[0],
      i % 2 ? 'P' : 'L',
      `20${20 - (i % 4)}-0${(i % 9) + 1}-1${i % 9}`,
      `Jl. Melati No. ${i + 1}, Sleman`,
      foto,
      status,
      NOW,
      NOW
    ).lastInsertRowid;
    insEnroll.run(id, rombel.cabang_id, rombel.jenjang_id, rombel.id, paket, NOW);
    siswaRows.push({
      id,
      nama,
      cabang: rombel.cabang_id,
      jenjang: rombel.jenjang_id,
      rombel: rombel.id,
      paket,
      status
    });
  });

  // ---- Penjemput ----
  const insJemput = db.prepare(
    'INSERT INTO penjemput(siswa_id,nama,no_wa,relasi,qr_code,catatan,aktif) VALUES(?,?,?,?,?,?,1)'
  );
  const penjemputRows = [];
  siswaRows.forEach((s, i) => {
    if (i % 2 === 0) {
      const rel = i % 4 === 0 ? 'Ayah' : 'Ibu';
      const namaJ = rel === 'Ayah' ? 'Bapak ' + s.nama.split(' ')[0] : 'Ibu ' + s.nama.split(' ')[0];
      const id = insJemput.run(
        s.id,
        namaJ,
        '0813000000' + String(i).padStart(2, '0'),
        rel,
        `QR-DEMO-${s.id}`,
        i % 6 === 0 ? 'Jemput fleksibel' : null
      ).lastInsertRowid;
      penjemputRows.push({ id, siswa: s.id });
    }
  });

  // ---- Wali <-> siswa ----
  const insWaliSiswa = db.prepare(
    'INSERT INTO wali_siswa(wali_pengguna_id,siswa_id,relasi,aktif,created_at) VALUES(?,?,?,1,?)'
  );
  siswaRows.forEach((s, i) => insWaliSiswa.run(waliUsers[i % waliUsers.length], s.id, i % 2 ? 'Ayah' : 'Ibu', NOW));

  // ---- Guru <-> rombel ----
  const insGuruRombel = db.prepare(
    "INSERT INTO guru_rombel(pengguna_id,rombel_id,role,created_at) VALUES(?,?,'utama',?)"
  );
  rombelList.forEach((r, i) => insGuruRombel.run(gurus[i % gurus.length], r.id, NOW));

  // ---- Tarif ----
  const insTarif = db.prepare(
    'INSERT INTO biaya_tarif(cabang_id,tahun_ajaran,jenjang_id,jenis,nama,nominal,aktif,created_at,updated_at) VALUES(?,?,?,?,?,?,1,?,?)'
  );
  const tarifRows = [];
  cabangList.forEach((c) =>
    jenjangList.forEach((j) => {
      const isCare = j.tipe === 'care';
      const jenisList = isCare ? ['care'] : ['spp', 'kegiatan'];
      if (!isCare && c % 2 === 0) jenisList.push('full_day');
      jenisList.forEach((jenis) => {
        const nominal =
          jenis === 'spp' ? 650000 : jenis === 'full_day' ? 250000 : jenis === 'kegiatan' ? 300000 : 1200000;
        const nama =
          jenis === 'spp'
            ? 'SPP Bulanan'
            : jenis === 'kegiatan'
              ? 'Uji Kompetensi'
              : jenis === 'full_day'
                ? 'Full Day'
                : 'Child and Baby Care';
        const id = insTarif.run(c, TAHUN, j.id, jenis, nama, nominal, NOW, NOW).lastInsertRowid;
        tarifRows.push({ id, cabang: c, jenjang: j.id, jenis, nama, nominal });
      });
    })
  );

  // ---- Tagihan (2 bulan) + pembayaran + alokasi ----
  const insTagihan = db.prepare(
    `INSERT INTO tagihan(siswa_id,cabang_id,jenjang_id,rombel_id,paket,tahun_ajaran,periode,jenis,nama,nominal_awal,diskon_amount,nominal_final,status,created_by,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`
  );
  const insPay = db.prepare(
    `INSERT INTO pembayaran(cabang_id,siswa_id,receipt_no,tanggal_bayar,nominal,metode,status,reference,catatan,created_by,created_at,updated_at)
     VALUES(?,?,?,?,?,?,'confirmed',?,?,1,?,?)`
  );
  const insAlok = db.prepare(
    'INSERT INTO pembayaran_alokasi(pembayaran_id,tagihan_id,nominal,created_at) VALUES(?,?,?,?)'
  );
  const insDiskon = db.prepare(
    'INSERT INTO diskon_siswa(siswa_id,cabang_id,tahun_ajaran,jenis,tipe,nilai,catatan,aktif,created_by,created_at) VALUES(?,?,?,?,?,?,?,1,1,?)'
  );

  const tagihanBySiswa = new Map();
  siswaRows
    .filter((s) => s.status === 'aktif')
    .forEach((s, idx) => {
      const tarifPilihan = tarifRows.filter(
        (t) =>
          t.cabang === s.cabang &&
          t.jenjang === s.jenjang &&
          (t.jenis === 'spp' || t.jenis === 'care' || t.jenis === 'kegiatan')
      );

      // Diskon berlaku per tahun ajaran — diskon_siswa tidak punya kolom
      // periode. Karena itu barisnya dimasukkan SEKALI per siswa, di luar loop
      // periode di bawah. Sebelumnya insert ini ada di dalam loop periode,
      // sehingga tiap siswa mendapat dua baris kembar; discountTotal()
      // menjumlahkan seluruh baris siswa+jenis, jadi tagihan yang dibuat ulang
      // akan memotong diskon dua kali.
      const diskonPerJenis = new Map();
      if (idx % 7 === 0) {
        tarifPilihan
          .filter((t) => t.jenis !== 'kegiatan')
          .forEach((t) => {
            const tipe = t.jenis === 'spp' ? 'persen' : 'nominal';
            const nilai = t.jenis === 'spp' ? 10 : 50000;
            insDiskon.run(s.id, s.cabang, TAHUN, t.jenis, tipe, nilai, 'Beasiswa prestasi', NOW);
            diskonPerJenis.set(t.jenis, tipe === 'persen' ? Math.round((t.nominal * nilai) / 100) : nilai);
          });
      }

      ['2026-08', '2026-09'].forEach((periode) => {
        tarifPilihan.forEach((t) => {
          // Diskon untuk sebagian siswa, supaya layar billing punya variasi.
          const diskon = diskonPerJenis.get(t.jenis) || 0;
          const final = Math.max(0, t.nominal - diskon);
          // Bulan lalu sebagian besar lunas; bulan ini campuran.
          const status =
            periode === '2026-08'
              ? idx % 9 === 0
                ? 'sebagian'
                : 'lunas'
              : idx % 3 === 0
                ? 'lunas'
                : idx % 3 === 1
                  ? 'sebagian'
                  : 'open';
          const id = insTagihan.run(
            s.id,
            s.cabang,
            s.jenjang,
            s.rombel,
            s.paket,
            TAHUN,
            periode,
            t.jenis,
            t.nama,
            t.nominal,
            diskon,
            final,
            status,
            NOW,
            NOW
          ).lastInsertRowid;
          if (!tagihanBySiswa.has(s.id)) tagihanBySiswa.set(s.id, []);
          tagihanBySiswa.get(s.id).push({ id, final, status, periode });
        });
      });
    });

  let receiptSeq = 0;
  siswaRows
    .filter((s) => s.status === 'aktif')
    .forEach((s) => {
      const list = (tagihanBySiswa.get(s.id) || []).filter((t) => t.status !== 'open');
      if (!list.length) return;
      // Bayar sesuai status: lunas dibayar penuh, sebagian dibayar ~40%.
      list.forEach((t, i) => {
        const target = t.status === 'lunas' ? t.final : Math.round(t.final * 0.4);
        if (target <= 0) return;
        receiptSeq += 1;
        const payId = insPay.run(
          s.cabang,
          s.id,
          `TP-${String(s.cabang).padStart(2, '0')}-${String(2026)}-${String(receiptSeq).padStart(6, '0')}`,
          t.periode + '-10',
          target,
          i % 3 === 0 ? 'tunai' : i % 3 === 1 ? 'transfer' : 'qris',
          'DEMO',
          'Pembayaran demo',
          NOW,
          NOW
        ).lastInsertRowid;
        insAlok.run(payId, t.id, target, NOW);
      });
    });

  // ---- Absensi hari ini ----
  const insAbsen = db.prepare(
    `INSERT INTO absensi(siswa_id,cabang_id,jenjang_id,rombel_id,paket,tanggal,status,jam_masuk,jam_tunggu,jam_pulang,penjemput_id,manual,catatan,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  const pola = [
    'Hadir',
    'Hadir',
    'Hadir',
    'Hadir',
    'Hadir',
    'Hadir',
    'Hadir',
    'Terlambat',
    'Terlambat',
    'Menunggu',
    'Menunggu',
    'Pulang',
    'Pulang',
    'Izin',
    'Sakit',
    'Absen',
    'Belum',
    'Hadir',
    'Hadir',
    'Menunggu'
  ];
  siswaRows
    .filter((s) => s.status === 'aktif')
    .forEach((s, i) => {
      const status = pola[i % pola.length];
      const jemput = penjemputRows.find((p) => p.siswa === s.id);
      const masuk = ['Hadir', 'Terlambat', 'Menunggu', 'Pulang'].includes(status)
        ? status === 'Terlambat'
          ? '08:12'
          : '07:35'
        : null;
      const tunggu = ['Menunggu', 'Pulang'].includes(status) ? (status === 'Pulang' ? '11:05' : '10:48') : null;
      const pulang = status === 'Pulang' ? '11:32' : null;
      insAbsen.run(
        s.id,
        s.cabang,
        s.jenjang,
        s.rombel,
        s.paket,
        TODAY,
        status,
        masuk,
        tunggu,
        pulang,
        pulang && jemput ? jemput.id : null,
        status === 'Izin' || status === 'Sakit' ? 1 : 0,
        status === 'Izin' ? 'Izin keluarga' : status === 'Sakit' ? 'Demam' : status === 'Terlambat' ? 'Macet' : null,
        NOW,
        NOW
      );
    });

  // ---- Laporan harian hari ini ----
  const insLaporan = db.prepare(
    `INSERT INTO laporan_harian(siswa_id,cabang_id,jenjang_id,rombel_id,paket,tanggal,guru_id,status,mood,makan,tidur,aktivitas,catatan,observation_domain,observation_note,focus_theme_id,published_at,last_published_change_at,created_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  const moodOpt = ['ceria', 'biasa', 'rewel'];
  const makanOpt = ['habis', 'setengah', 'tidak'];
  const domainOpt = ['Literasi', 'Numerasi', 'Motorik', 'Sosial Emosional', 'Seni'];
  siswaRows
    .filter((s) => s.status === 'aktif')
    .forEach((s, i) => {
      if (i % 5 === 0) return; // sebagian siswa memang belum ada laporan
      const lengkap = i % 3 !== 0;
      const published = i % 4 === 0;
      const mood = moodOpt[i % 3];
      const makan = makanOpt[i % 3];
      const tidur = i % 2;
      const aktivitas = JSON.stringify(['Mewarnai', i % 2 ? 'Bernyanyi & Menari' : 'Motorik Halus']);
      const observasi = lengkap ? `${s.nama} sudah bisa menulis namanya dengan rapi hari ini.` : '';
      insLaporan.run(
        s.id,
        s.cabang,
        s.jenjang,
        s.rombel,
        s.paket,
        TODAY,
        gurus[i % gurus.length],
        published ? 'published' : 'draft',
        mood,
        makan,
        tidur,
        aktivitas,
        lengkap ? 'Membawa bekal sendiri.' : '',
        lengkap ? domainOpt[i % domainOpt.length] : null,
        observasi,
        null,
        published ? NOW : null,
        published ? NOW : null,
        NOW,
        NOW
      );
    });

  // ---- Focus theme per rombel ----
  const insTheme = db.prepare(
    'INSERT INTO focus_theme(cabang_id,rombel_id,tanggal,title,activity_summary,suggested_domains,teacher_prompt,menu_makanan,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,1,?,?)'
  );
  const temaList = [
    ['Kebun Binatang', 'Mengenal hewan dan habitatnya', '["Literasi","Numerasi"]', 'Nasi ayam, tempe, semangka'],
    ['Transportasi', 'Kenali kendaraan dan aturan lalu lintas', '["Motorik","Literasi"]', 'Nasi telur, wortel, apel'],
    ['Warna di Sekitarku', 'Mencampur warna primer jadi sekunder', '["Seni","Motorik"]', 'Bubur kacang hijau, pisang'],
    ['Angka 1-10', 'Berhitung benda di sekitar kelas', '["Numerasi"]', 'Nasi sapi, brokoli, jeruk'],
    ['Keluargaku', 'Mengenal anggota keluarga dan perannya', '["Sosial Emosional"]', 'Nasi ikan, bayam, pepaya']
  ];
  rombelList.forEach((r, i) => {
    const t = temaList[i % temaList.length];
    insTheme.run(
      r.cabang_id,
      r.id,
      TODAY,
      t[0],
      t[1],
      t[2],
      'Ajak anak menyebutkan contoh dari rumah.',
      t[3],
      NOW,
      NOW
    );
  });

  // ---- Log NFC & audit ----
  const insNfc = db.prepare(
    'INSERT INTO nfc_scan_log(siswa_id,pengguna_id,cabang_id,action,status,reason,token_masked,tab,tanggal,jam,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)'
  );
  siswaRows.slice(0, 25).forEach((s, i) => {
    const ok = i % 6 !== 0;
    insNfc.run(
      s.id,
      gurus[i % gurus.length],
      s.cabang,
      ok ? 'checkin' : 'pulang',
      ok ? 'success' : 'failed',
      ok ? null : 'Token tidak dikenali',
      '****' + String(1000 + i),
      'absensi',
      TODAY,
      '07:' + String(20 + (i % 30)).padStart(2, '0'),
      NOW
    );
  });
  const insAudit = db.prepare(
    'INSERT INTO audit_log(actor_pengguna_id,action,entity_type,entity_id,cabang_id,before_json,after_json,reason,created_at) VALUES(?,?,?,?,?,?,?,?,?)'
  );
  [
    ['create', 'tagihan', 1, 'Generate tagihan bulanan'],
    ['update', 'siswa', 1, 'Perubahan data siswa'],
    ['delete', 'penjemput', 1, 'Penjemput dihapus'],
    ['login', 'pengguna', 1, null],
    ['generate_bulanan', 'tagihan', 1, 'Generate 2026-09']
  ].forEach((a, i) =>
    insAudit.run(
      adminCab1,
      a[0],
      a[1],
      a[2],
      1,
      null,
      '{"demo":true}',
      a[3],
      new Date(Date.now() - i * 3600000).toISOString()
    )
  );

  // ---- Kalender ----
  // CHECK constraint: scope hanya yayasan|cabang, tipe hanya libur|masuk.
  const insKal = db.prepare(
    'INSERT INTO kalender_event(scope,cabang_id,tanggal,tipe,nama,created_at) VALUES(?,?,?,?,?,?)'
  );
  insKal.run('yayasan', null, TODAY, 'libur', 'Hari Libur Nasional', NOW);
  insKal.run(
    'yayasan',
    null,
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    'masuk',
    'Masuk Semester Genap',
    NOW
  );
  insKal.run(
    'cabang',
    1,
    new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    'libur',
    'Libur Cabang Godean',
    NOW
  );
});

seed();

// ---- Foto placeholder ----
// Siswa tanpa foto menampilkan placeholder abu-abu. Supaya audit visual juga
// melihat jalur "ada foto", sebagian siswa diberi foto buatan.
//
// Daftar siswa diambil SEBELUM db.close(), dan penutupan database dipindah ke
// dalam fungsi async ini. Sebelumnya db.close() dipanggil di akhir kode sinkron,
// sehingga database sudah tertutup ketika blok ini berjalan.
const siswaFoto = db.prepare("SELECT id,nama,foto FROM siswa WHERE foto LIKE '/uploads/foto/%'").all();

(async () => {
  let sharp;
  try {
    sharp = require(path.join(__dirname, '..', 'backend', 'node_modules', 'sharp'));
  } catch {
    console.log('[seed] sharp tidak tersedia, lewati pembuatan foto');
    db.close();
    return;
  }

  const warna = ['#1D9E75', '#378ADD', '#7F77DD', '#D85A30', '#BA7517', '#E24B4A', '#639922', '#185FA5'];
  let dibuat = 0;
  for (const s of siswaFoto) {
    const nama = s.foto.split('/').pop();
    const inisial = s.nama
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="${warna[s.id % warna.length]}"/><text x="200" y="240" font-family="Arial,Helvetica,sans-serif" font-size="150" font-weight="bold" fill="#ffffff" text-anchor="middle">${inisial}</text></svg>`;
    await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toFile(path.join(FOTO_DIR, nama));
    dibuat += 1;
  }

  db.close();
  console.log(`[seed] ${dibuat} foto placeholder dibuat`);
  console.log(`[seed] selesai — siswa, tagihan, absensi, laporan, dan pengguna demo dibuat (tahun ajaran ${TAHUN})`);
})();
