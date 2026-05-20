# Desain Multi Cabang dan Portal Wali

Dokumen ini merangkum keputusan desain untuk mengubah SIAGA dari aplikasi satu sekolah menjadi aplikasi satu server untuk banyak cabang Taruna Prima, sekaligus menyiapkan portal wali murid untuk daily record dan feedback.

## Tujuan

- Satu aplikasi dan satu server dapat dipakai semua cabang Taruna Prima.
- Data operasional tiap cabang terisolasi sesuai role.
- Admin pusat dapat mengelola dan melihat semua cabang.
- Siswa/guru dapat pindah cabang tanpa kehilangan riwayat.
- Billing mendukung perbedaan biaya cabang, jenjang, paket, diskon, koreksi, invoice, dan kuitansi.
- Wali murid dapat melihat daily record yang sudah dikirim guru dan memberi feedback dalam thread komentar.

## Cabang

Cabang awal:

- Godean (`GDN`)
- Kentungan (`KTG`)
- Nitikan (`NTK`)
- Balong (`BLG`)
- Solo (`SLO`)

Data dummy saat ini dianggap milik cabang Godean saat migrasi awal. Cabang baru harus bisa ditambahkan dari sistem.

Kantor pusat yayasan bukan cabang operasional. Walaupun kantor pusat berbagi gedung dengan cabang Godean, identitas yayasan dan identitas cabang Godean harus disimpan terpisah.

Cabang dapat dinonaktifkan tanpa menghapus data. Cabang nonaktif tidak boleh menerima transaksi operasional baru. Admin pusat tetap dapat melihat histori dan menerima pembayaran tagihan lama.

## Role dan Akses

Role internal:

- `admin`: admin pusat/yayasan. Tidak terikat cabang, bisa mengelola semua cabang.
- `admin_cabang`: operator cabang. Terikat satu cabang.
- `kepsek`: kepala cabang/sekolah. Terikat satu cabang.
- `guru`: guru/pengasuh. Terikat satu cabang dan rombel yang ditugaskan.
- `gerbang`: petugas/akun gerbang. Terikat satu cabang.

Role wali:

- `wali`: akun wali murid/orang tua untuk portal wali.

Model akun:

- `pengguna` menjadi tabel akun login untuk semua user, baik staff internal maupun wali.
- `pengguna.tipe` membedakan `staff` dan `wali`.
- `pengguna.role` menyimpan role eksplisit, misalnya `admin`, `admin_cabang`, `kepsek`, `guru`, `gerbang`, atau `wali`.
- `pengguna.display_name` menjadi nama utama untuk navbar, notifikasi, dan audit log.
- Detail staff disimpan di `staff_profile`.
- Detail wali disimpan di `wali_profile`.
- Relasi wali ke siswa disimpan di `wali_siswa`.

Aturan akun:

- Username staff unik tingkat yayasan.
- Staff login dengan username dan password.
- Wali login dengan nomor WhatsApp dan password.
- Nomor WhatsApp wali menjadi identitas login dan unik untuk akun wali.
- Wali dapat mengubah password sendiri.
- Nomor WhatsApp/login wali hanya dapat diubah admin/admin cabang.
- `pengguna.username` wajib untuk staff dan boleh kosong untuk wali.
- `pengguna.no_wa` wajib untuk wali dan boleh kosong untuk staff.
- `staff_profile.cabang_id` menyimpan scope cabang staff.
- Admin pusat memiliki `staff_profile.cabang_id = NULL`.
- Staff cabang wajib memiliki `staff_profile.cabang_id`.
- Wali tidak memiliki cabang langsung; aksesnya lewat relasi `wali_siswa`.
- Satu guru/kepsek/admin cabang/gerbang hanya boleh aktif di satu cabang.
- Guru yang pindah cabang memakai akun yang sama. Assignment rombel lama dilepas, lalu ditugaskan ulang di cabang baru.
- Status akun umum: `undangan`, `aktif`, `nonaktif`.
- Akun dengan status `undangan` boleh login, tetapi wajib mengganti password.
- `must_change_password` digunakan untuk memaksa ganti password setelah aktivasi awal atau reset password.

Hak kelola akun:

- `admin` dapat mengelola semua akun.
- `admin_cabang` dapat membuat/mengedit `guru` dan `gerbang` hanya di cabangnya.
- `admin_cabang` tidak dapat membuat/mengedit `admin`, `admin_cabang`, atau `kepsek`.
- `kepsek`, `guru`, dan `gerbang` tidak mengelola akun.
- `admin_cabang` dapat melihat dan reset password wali yang terhubung ke siswa aktif di cabangnya.
- `kepsek` boleh melihat daftar wali bila diperlukan, tetapi tidak reset password.
- Reset password dilakukan oleh admin yang berwenang.
- Setelah reset password, sistem membuat password sementara, set `must_change_password = 1`, dan menampilkan password sementara sekali saja dengan tombol salin teks undangan.
- Password sementara tidak boleh dapat dilihat ulang setelah modal ditutup.
- Perubahan administratif akun wajib masuk audit log: create user, update role, update cabang staff, reset password, aktif/nonaktif akun, dan ubah relasi wali-siswa.

Keamanan bootstrap:

- Untuk development, admin default boleh memakai username `admin` dan password fallback `admin123`.
- Untuk production, `ADMIN_PASSWORD` wajib diset eksplisit. Script init harus gagal jika `NODE_ENV=production` dan `ADMIN_PASSWORD` kosong.
- Admin default wajib `must_change_password = 1` setelah setup.
- Minimal harus selalu ada satu akun `admin` aktif.
- Akun admin tidak dihapus permanen; gunakan nonaktif.
- Staff yang sudah punya histori tidak dihapus permanen; gunakan nonaktif.
- Akun wali tetap dapat aktif untuk melihat histori walaupun semua anaknya sudah keluar/lulus, kecuali dinonaktifkan manual.

## Terminologi Data

Gunakan istilah domain Bahasa Indonesia:

- `cabang`
- `jenjang`
- `rombel`
- `guru_rombel`
- `pengguna` atau model akun umum yang bisa mencakup staff dan wali

Karena sistem akan punya akun internal dan akun wali, nama teknis `pengguna` lebih netral daripada `guru` atau `staff`.

`kelas` lama sebaiknya diganti konsepnya menjadi `rombel`, karena rombel adalah kelompok aktual siswa yang dipegang guru. Data saat ini dummy, jadi rename besar masih dapat dilakukan.

## Jenjang, Rombel, dan Paket

Jenjang/layanan standar:

- `KB A`
- `KB B`
- `TK A`
- `TK B`
- `Child and Baby Care`

Rombel adalah kelompok aktual per cabang. Default rombel saat cabang dibuat:

- `KB A`
- `KB B`
- `TK A`
- `TK B`
- `Child and Baby Care`

Cabang dapat menambah rombel paralel, misalnya `KB A 2`. Biaya tetap berdasarkan cabang + jenjang + paket, bukan berdasarkan rombel.

Paket/varian:

- Jenjang sekolah (`KB/TK`) dapat `reguler` atau `full_day`.
- `full_day` adalah status per siswa, bukan per rombel.
- `Child and Baby Care` hanya memakai paket penitipan/care.
- Anak sekolah yang lanjut sore memakai paket `full_day`, bukan double enrollment sekolah + care.
- `Child and Baby Care` adalah layanan penitipan independen. Anak dapat tetap care beberapa tahun, pindah manual ke `KB A`, keluar, atau mengikuti sekolah lain di luar Taruna Prima. Sekolah luar cukup dicatat di catatan profil bila perlu.

## Enrollment, Pindah Cabang, dan Kenaikan

Siswa dapat pindah cabang, jenjang, paket, dan rombel dengan tanggal efektif.

Saat pindah cabang, admin wajib memilih:

- Cabang tujuan
- Jenjang/layanan tujuan
- Paket tujuan
- Rombel tujuan
- Tanggal efektif
- Catatan/alasan opsional

Tagihan bulanan mengikuti kondisi siswa pada tanggal 1 bulan tersebut. Jika siswa pindah cabang/paket di tengah bulan, tagihan bulan berjalan tetap mengikuti kondisi tanggal 1, dan bulan berikutnya mengikuti kondisi terbaru.

Status siswa:

- `aktif`
- `keluar`/`nonaktif`
- `lulus`

Siswa keluar/lulus tidak ditagih mulai bulan berikutnya jika pada tanggal 1 bulan itu sudah tidak aktif. Histori tetap tersimpan.

Kenaikan tahun ajaran bersifat semi-manual dengan preview:

- `KB A -> KB B`
- `KB B -> TK A`
- `TK A -> TK B`
- `TK B -> lulus`
- `Child and Baby Care -> tetap care` secara default

Admin pusat dapat menjalankan kenaikan untuk semua cabang. Admin cabang dapat menjalankan untuk cabangnya sendiri. Proses mencatat audit log.

Tahun ajaran global yayasan: Juli sampai Juni.

## Konfigurasi Operasional

Semua jam dan aturan harus dapat dikustomisasi, tidak hardcoded.

Konfigurasi per cabang/paket perlu mencakup:

- Jam masuk
- Jam pulang reguler
- Jam pulang full day
- Jam/pola care bila perlu
- Apakah terlambat dihitung
- Apakah kalender sekolah berlaku
- Apakah daily record wajib
- Batas ideal publish daily record
- Aturan pickup fleksibel untuk care

Kalender:

- Kalender yayasan global
- Override kalender per cabang
- Masuk khusus/libur khusus per cabang
- Daily record dan absensi mengikuti hasil gabungan kalender sesuai cabang dan paket

Pickup:

- Siswa reguler mengikuti jam pulang paket reguler.
- Siswa full day mengikuti jam pulang paket full day.
- Care lebih fleksibel, tetapi tetap perlu konfirmasi pulang demi keamanan.
- QR penjemput tetap melekat ke siswa/penjemput saat pindah cabang, tetapi valid hanya di cabang aktif siswa.
- NFC siswa juga tetap melekat ke siswa dan dibatasi oleh scope cabang/rombel aktif.

## Snapshot Histori

Data historis tidak boleh berubah makna saat siswa pindah cabang/rombel/paket.

Record historis seperti absensi, daily record, billing, dan log penting harus menyimpan snapshot:

- `siswa_id`
- `cabang_id`
- `rombel_id`
- `jenjang_id`
- Paket/program saat kejadian
- Tanggal/periode
- Pengguna pembuat/petugas

Daily record, absensi, tagihan, invoice, pembayaran, dan log penjemputan tidak boleh hanya bergantung pada data siswa saat ini untuk laporan historis.

## Audit Log dan Waktu

Gunakan satu audit log global lintas modul.

Audit log minimal menyimpan:

- `actor_pengguna_id`
- `action`
- `entity_type`
- `entity_id`
- `cabang_id` nullable
- `before_json` opsional
- `after_json` opsional
- `reason`/catatan opsional
- `created_at`

Audit log digunakan untuk perubahan penting seperti:

- Perubahan akun dan role
- Reset password
- Perubahan cabang staff
- Relasi wali-siswa
- Koreksi daily record
- Perubahan attachment daily record setelah publish
- Koreksi billing/tagihan
- Void pembayaran
- Verifikasi atau penolakan pembayaran pending

Audit log tidak boleh menyimpan password, password sementara, password hash, token rahasia, atau credential lain. Untuk perubahan password cukup simpan action seperti `password_reset` atau `password_changed`.

Waktu:

- Timestamp teknis seperti `created_at`, `updated_at`, `published_at`, `read_at`, dan audit log disimpan sebagai UTC ISO.
- Tanggal operasional sekolah tetap memakai tanggal lokal Asia/Jakarta.
- Field seperti tanggal absensi, tanggal daily record, dan periode billing dihitung berdasarkan Asia/Jakarta.
- UI menampilkan waktu dalam WIB/Asia Jakarta.

## Billing dan Keuangan

Scope keuangan fase awal:

- SPP bulanan
- Tambahan full day bulanan
- Biaya penitipan bulanan untuk Child and Baby Care
- Biaya kegiatan tahunan untuk jenjang sekolah

Child and Baby Care hanya memiliki satu biaya penitipan bulanan dan tidak terkena SPP, full day, atau biaya kegiatan tahunan.

Biaya:

- Tarif dibuat per cabang + tahun ajaran + jenjang + jenis biaya/paket.
- SPP pokok berlaku untuk siswa sekolah reguler/full day.
- Tambahan full day adalah item terpisah dan berlaku otomatis bulanan untuk siswa sekolah full day.
- Biaya penitipan berlaku otomatis bulanan untuk care.
- Biaya kegiatan tahunan berlaku untuk jenjang sekolah, bukan care.
- Tarif hanya dapat dibuat/diubah oleh `admin` pusat.
- Perubahan tarif hanya memengaruhi tagihan baru. Tagihan yang sudah dibuat menyimpan nominal final sendiri.

Generate tagihan:

- Tagihan bulanan dibuat melalui tombol generate dengan preview, bukan scheduler otomatis fase awal.
- `admin` dapat generate semua cabang.
- `admin_cabang` dapat generate cabangnya sendiri.
- `kepsek` hanya melihat laporan.
- Proses harus idempotent, tidak membuat tagihan dobel.
- Jika tarif belum lengkap, sistem mencegah tagihan dan menampilkan daftar konfigurasi yang perlu dilengkapi. Jangan membuat tagihan Rp0 diam-diam.

Biaya kegiatan tahunan:

- Dibuat dengan proses generate tahunan dengan preview.
- Untuk siswa masuk tengah tahun ajaran, biaya kegiatan tahunan prorata berdasarkan sisa bulan Juli-Juni.
- Bulan masuk dihitung sebagai bulan penuh.
- Urutan hitung: tarif dasar -> prorata -> koreksi manual -> diskon/keringanan -> nominal final.
- Koreksi manual dapat dilakukan `admin` atau `admin_cabang` untuk tagihan cabangnya sendiri.
- Koreksi wajib mencatat nilai sebelum/sesudah, alasan, petugas, dan waktu.
- `kepsek` dapat melihat, tetapi tidak input koreksi.

Diskon/keringanan:

- Dapat dibuat oleh `admin` untuk semua cabang.
- Dapat dibuat oleh `admin_cabang` untuk cabangnya sendiri.
- `kepsek` lihat saja.
- Bisa berbentuk persentase atau nominal tetap.
- Ditargetkan per jenis biaya: SPP pokok, tambahan full day, biaya kegiatan, atau biaya penitipan.
- Keringanan default per siswa per tahun ajaran, tetapi tagihan individual tetap dapat dikoreksi manual.

Pembayaran:

- Mendukung pembayaran parsial/cicilan.
- `payments` mencatat transaksi uang masuk.
- `payment_allocations` mencatat alokasi pembayaran ke tagihan.
- Default alokasi pembayaran ke tagihan tertua, tetapi admin dapat memilih/mengedit alokasi.
- Metode awal: tunai, transfer, QRIS, lainnya.
- Pembayaran tidak dihapus. Gunakan void/pembatalan dengan alasan.
- Kuitansi resmi hanya untuk pembayaran confirmed.

Verifikasi rekening:

- Saat ini semua transfer/QRIS masuk ke rekening yayasan pusat.
- Simpan konfigurasi rekening sebagai pengaturan yayasan/global agar bisa diperluas ke per cabang nanti.
- `tunai` oleh admin cabang langsung `confirmed`.
- `transfer`/`qris` oleh admin cabang masuk `pending_verification`.
- Admin pusat memverifikasi setelah cocok dengan mutasi rekening.
- Pembayaran pending belum membuat tagihan dianggap lunas. Tampilkan sebagai menunggu verifikasi.

Akses keuangan:

- `admin`: semua cabang, semua aksi.
- `admin_cabang`: cabangnya sendiri, input/edit pembayaran, generate tagihan, koreksi tagihan cabangnya.
- `kepsek`: melihat laporan dan detail tunggakan cabangnya, tanpa input/void.
- `guru` dan `gerbang`: tidak ada akses keuangan.

Siswa pindah cabang:

- Riwayat tagihan/pembayaran cabang lama tetap terlihat pada profil siswa.
- Admin cabang baru boleh melihat riwayat lama, tetapi tidak dapat mengubah/void transaksi cabang lama.
- Pembayaran tagihan cabang lama hanya dapat diinput admin cabang lama atau admin pusat.
- Tidak ada settlement antar cabang di fase awal.

## Invoice dan Kuitansi PDF

Nomor dokumen:

- Invoice: `INV-{KODECABANG}-{TAHUNAJARAN}-{000001}`
- Kuitansi: `TP-{KODECABANG}-{TAHUNAJARAN}-{000001}`

Nomor dibuat per cabang per tahun ajaran. Kode cabang sebaiknya tidak mudah diubah setelah ada transaksi.

PDF memakai kop yayasan + identitas cabang:

- Nama/logo yayasan sebagai identitas utama
- Nama cabang, alamat, dan kontak cabang
- Instruksi pembayaran rekening yayasan pusat fase awal

Invoice:

- Dibuat on-demand oleh admin, bukan otomatis setiap bulan.
- Dapat menggabungkan beberapa tagihan selama siswa sama dan cabang pemilik tagihan sama.
- Tidak boleh lintas cabang.
- Dapat memuat SPP beberapa bulan dan biaya kegiatan tahunan dalam satu invoice.

Kuitansi:

- Dibuat untuk pembayaran `confirmed`.
- Tidak dibuat untuk pembayaran pending.

Logo dan detail kop akan diminta saat implementasi PDF.

## Portal Wali

Fase awal portal wali hanya mencakup:

- Daily record published
- Feedback/komentar thread
- Notifikasi daily record dan komentar
- Read receipt daily record
- Ubah password wali

Belum termasuk fase awal:

- Tagihan
- Invoice
- Pembayaran
- Kuitansi
- Absensi/check-in/pulang
- Edit profil anak
- Edit penjemput

Akun wali:

- Dibuat manual oleh admin/admin cabang.
- Dapat dibuat dengan bantuan data penjemput, tetapi tidak semua penjemput otomatis mendapat akses.
- Satu siswa cukup memiliki satu akun wali aktif.
- Satu akun wali dapat dikaitkan ke beberapa siswa, misalnya saudara kandung.
- Akun wali melekat ke siswa, bukan cabang. Saat siswa pindah cabang, akun wali tetap sama.
- Satu siswa maksimal memiliki satu akun wali aktif, tetapi satu akun wali dapat memiliki beberapa siswa.
- `wali_siswa.relasi` disimpan opsional, misalnya Ayah, Ibu, Wali, atau Lainnya.

Login:

- Satu layar login dengan tab `Staff` dan `Wali Murid`.
- Staff memakai username/password.
- Wali memakai nomor WhatsApp/password.

## Daily Record

Daily record guru harus memiliki status:

- `draft`
- `published`

Aturan:

- Guru dapat menyimpan draft.
- Wali hanya melihat record `published`.
- Guru menekan "Kirim ke Wali" untuk publish.
- Tidak ada unpublish fase awal.
- Setelah published, record tetap editable oleh guru yang punya akses.
- Edit setelah published dicatat di audit log.
- Wali melihat versi terbaru.
- Guru memiliki preview tampilan wali sebelum publish.

Kewajiban:

- Daily record wajib dibuat dan dikirim untuk semua siswa aktif yang hadir/beraktivitas pada hari masuk.
- Tidak wajib pada hari libur.
- Tidak wajib untuk siswa Izin/Sakit/Absen karena tidak ada kegiatan harian yang perlu dicatat.
- Jika siswa check-in lalu pulang dini, daily record tetap wajib.
- Publish terlambat diperbolehkan, tetapi tercatat.
- Batas ideal publish daily record konfiguratif per cabang/paket.
- Label telat hanya untuk internal, tidak ditampilkan ke wali.

Read receipt:

- Saat wali membuka daily record, sistem mencatat `read_at`.
- Notifikasi tidak dibuat hanya karena wali membaca record.
- Jika guru mengedit teks atau attachment setelah publish, record menjadi unread lagi untuk wali.
- Status terbaca harus dibandingkan dengan `last_published_change_at`, bukan hanya pernah dibaca.

Attachment:

- Guru dapat melampirkan foto, tidak wajib.
- Maksimal 5 foto per daily record.
- Foto wajib dikompres otomatis.
- Video tidak didukung fase awal.
- Foto terlihat wali setelah record published.
- Foto dapat ditambah/dihapus setelah publish oleh guru yang punya akses, dengan audit log.
- Edit foto setelah publish membuat record unread lagi untuk wali.

## Feedback dan Komentar

Feedback memakai thread komentar sederhana per daily record.

Aturan:

- Wali dapat komentar pada daily record published.
- Tidak ada batas waktu komentar. Wali dapat komentar pada record historis kapan saja.
- Guru dapat membalas komentar kapan saja.
- Komunikasi hanya antara guru/pengasuh dan wali.
- Kepsek, admin cabang, dan admin pusat dapat melihat sesuai scope, tetapi tidak membalas.
- Gerbang tidak mengakses komentar daily record.
- Semua guru/pengasuh yang ditugaskan ke rombel siswa menerima notifikasi komentar wali.
- Semua guru/pengasuh rombel boleh membalas.
- Read status komentar/notifikasi per pengguna.
- Wali melihat nama guru yang membalas.
- Komentar wali teks saja, tanpa attachment fase awal.

Notifikasi:

- Wali mendapat notifikasi saat daily record pertama kali published.
- Guru mendapat notifikasi saat wali komentar.
- Wali mendapat notifikasi saat guru membalas komentar.
- Wali tidak mendapat notifikasi untuk setiap edit record, tetapi record menjadi unread.

## Histori Portal Wali

Jika siswa lulus atau keluar:

- Wali tetap dapat login kecuali akunnya dinonaktifkan manual.
- Wali dapat melihat histori daily record yang sudah `published`.
- Histori menjadi read-only.
- Wali tidak dapat membuat komentar baru.
- Komentar lama tetap terlihat.

Jika siswa pindah cabang:

- Wali tetap dapat melihat histori `published` dari cabang lama.
- Daily record cabang lama menjadi read-only untuk wali dan guru lama.
- Komentar baru hanya boleh dibuat pada daily record yang terkait cabang/enrollment aktif siswa.
- Guru cabang lama tetap dapat melihat komentar lama secara read-only untuk histori yang pernah menjadi tanggung jawabnya.
- Guru cabang lama tidak dapat membalas atau mengedit record setelah siswa pindah.
- Admin cabang pemilik record lama dapat melakukan koreksi administratif dengan audit log.
- Admin cabang baru tidak dapat mengoreksi record lama milik cabang lain.
- Kepsek cabang pemilik record lama dapat melihat histori read-only.

Jika siswa pindah rombel dalam cabang yang sama:

- Daily record dari rombel lama menjadi read-only untuk wali dan guru lama.
- Komentar baru hanya boleh dibuat pada daily record yang terkait rombel/enrollment aktif siswa.
- Guru lama tetap dapat melihat histori read-only.
- Koreksi administratif mengikuti cabang pemilik record.

## Pertanyaan Lanjutan

Beberapa keputusan masih perlu digrill sebelum implementasi detail:

- Bentuk schema detail untuk enrollment aktif dan histori enrollment.
- Apakah daily record lama cabang lama dapat dilihat admin cabang lama selamanya, atau hanya melalui laporan historis read-only tertentu.
- Detail UI modul cabang, jenjang, rombel, dan paket.
- Detail format invoice/kuitansi PDF setelah logo/kop diberikan.
- Batas ukuran upload foto sebelum dan sesudah kompres.
- Strategi migrasi dari schema dummy saat ini ke schema baru.
