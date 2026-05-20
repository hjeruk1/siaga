# SIAGA Implementation Tracker

Tracker ini memetakan status implementasi terhadap keputusan di `docs/multi-cabang-dan-portal-wali.md`.

Legenda:

- `[x]` selesai dan sudah ada smoke/regression coverage utama
- `[~]` sebagian selesai, masih ada gap penting
- `[ ]` belum diimplementasikan

## Multi Cabang dan Akses

- [x] Schema multi cabang: `cabang`, `jenjang`, `rombel`, `pengguna`, profil staff/wali, enrollment, audit log.
- [x] Seed 5 cabang awal: Godean, Kentungan, Nitikan, Balong, Solo.
- [x] Admin pusat tanpa cabang dapat melihat/mengelola semua cabang.
- [x] Admin cabang/kepsek/guru/gerbang dibatasi scope cabang/rombel.
- [x] Default admin pusat diarahkan ke Godean sebagai cabang awal data.
- [x] Cabang baru dapat ditambahkan, dan default rombel/config dibuat.
- [x] Cabang dapat dinonaktifkan tanpa hapus data.
- [x] Cabang nonaktif diblokir untuk transaksi operasional baru.
- [ ] Perlindungan kode cabang agar tidak mudah diubah setelah ada transaksi.

## Pengguna, Staff, dan Wali

- [x] Unified account table `pengguna` untuk staff dan wali.
- [x] Role: admin, admin_cabang, kepsek, guru, gerbang, wali.
- [x] Staff login username/password.
- [x] Wali login nomor WA/password.
- [x] Password sementara + `must_change_password` untuk undangan/reset.
- [x] Reset password staff/wali sesuai kewenangan.
- [x] Aktif/nonaktif staff dan wali.
- [x] Admin dapat edit staff, role, status, dan cabang.
- [x] Guru pindah cabang memakai akun yang sama dan assignment rombel lama dilepas.
- [x] Admin dapat edit nomor WA login wali.
- [x] Satu akun wali dapat dikaitkan ke beberapa siswa.
- [x] Satu siswa dibatasi satu wali aktif.
- [x] Password sementara ditampilkan via modal dengan tombol salin teks undangan.
- [~] Minimal satu admin aktif belum diproteksi kuat di endpoint update.

## Siswa, Enrollment, dan Rombel

- [x] Istilah `rombel` dipakai di schema dan UI utama.
- [x] Jenjang standar: KB A, KB B, TK A, TK B, Child and Baby Care.
- [x] Paket siswa: reguler, full_day, care.
- [x] Admin dapat tambah/edit siswa.
- [x] Siswa dapat pindah cabang/jenjang/rombel/paket dengan tanggal efektif.
- [x] Histori enrollment tetap tersimpan.
- [x] Future-dated enrollment tetap bisa dikelola admin.
- [x] Penjemput dapat ditambah dan QR dibuat.
- [x] NFC siswa dapat di-reissue.
- [x] Kenaikan tahun ajaran semi-manual dengan preview.
- [x] Catatan "sekolah luar" untuk anak care dibuat sebagai field khusus.

## Operasional, Absensi, dan Gerbang

- [x] Konfigurasi jam masuk/pulang, terlambat, daily record wajib, due time, pickup fleksibel per cabang/jenjang/paket.
- [x] Absensi check-in dan status izin/sakit/absen.
- [x] Gerbang scan QR penjemput.
- [x] Guru/admin konfirmasi pulang.
- [x] Pickup QR dibatasi cabang/enrollment aktif siswa.
- [~] UI konfigurasi operasional masih basic, belum semua field mudah diedit dengan kontrol boolean yang nyaman.
- [x] Kalender yayasan global dan override cabang.
- [~] Daily record/absensi mengikuti kalender untuk status hari masuk dan blokir check-in saat libur; daily record belum diblokir otomatis saat libur.
- [x] Izin pulang dini.

## Daily Record

- [x] Draft dan published.
- [x] Wali hanya melihat published.
- [x] Guru/admin menyimpan draft dan publish ke wali.
- [x] Published record tetap editable.
- [x] Edit setelah publish memperbarui `last_published_change_at` untuk unread logic.
- [x] Foto attachment maksimal 5 dan dikompres server-side.
- [x] Wali melihat foto setelah published.
- [x] Feedback thread komentar teks.
- [x] Notifikasi daily published, komentar wali, dan balasan guru.
- [x] Notifikasi terlihat di header aplikasi.
- [x] Read receipt saat wali membuka daily record.
- [~] Kewajiban daily record "hari masuk saja" belum terhubung kalender.
- [x] Label terlambat publish dihitung untuk tampilan internal.
- [x] Preview tampilan wali sebelum publish.
- [x] Hapus foto daily record.
- [ ] Admin/kepsek melihat histori/koreksi administratif daily record lama secara lengkap belum dibuat sebagai workflow khusus.

## Portal Wali

- [x] Login wali.
- [x] Ubah password wali.
- [x] Lihat daftar anak yang terhubung.
- [x] Lihat histori daily record published.
- [x] Feedback/komentar.
- [x] Histori published tetap terlihat setelah siswa pindah cabang.
- [x] Komentar pada record cabang/rombel lama menjadi read-only setelah siswa pindah.
- [x] Portal wali tidak mencakup billing/absensi/profil/penjemput, sesuai fase awal.
- [~] UX notifikasi wali masih sederhana.

## Billing dan Keuangan

- [x] Tarif per cabang + tahun ajaran + jenjang + jenis.
- [x] Jenis biaya: spp, full_day, care, kegiatan.
- [x] Child and Baby Care hanya kena biaya care bulanan.
- [x] Generate tagihan bulanan manual.
- [x] Generate tagihan kegiatan tahunan manual.
- [x] Generate idempotent, tidak dobel untuk kombinasi unik.
- [x] Tarif yang belum lengkap dilaporkan sebagai error list, bukan tagihan Rp0.
- [x] Biaya kegiatan tahunan prorata untuk siswa masuk tengah tahun.
- [x] Diskon nominal/persen per siswa/tahun ajaran/jenis.
- [x] Koreksi manual tagihan oleh admin/admin cabang dengan alasan.
- [x] Pembayaran parsial/cicilan.
- [x] Default alokasi pembayaran ke tagihan tertua.
- [x] Metode tunai/transfer/qris/lainnya.
- [x] Transfer/QRIS admin cabang masuk pending verification.
- [x] Admin pusat verify/reject pending payment.
- [x] Void tagihan dan pembayaran dengan alasan.
- [x] Kepsek dapat melihat billing tanpa input.
- [x] Generate tagihan punya preview sebelum eksekusi.
- [x] Admin bisa memilih/mengedit alokasi pembayaran spesifik dari UI.
- [~] Riwayat tagihan cabang lama ada di backend berdasarkan siswa, tapi UI profil siswa belum menampilkan histori billing lintas cabang.
- [x] Konfigurasi rekening yayasan/global punya UI.
- [x] Laporan keuangan/tunggakan untuk kepsek.

## Invoice dan Kuitansi PDF

- [x] Nomor invoice `INV-{KODECABANG}-{TAHUN}-{000001}`.
- [x] Nomor kuitansi `TP-{KODECABANG}-{TAHUN}-{000001}`.
- [x] Invoice on-demand dari tagihan terpilih.
- [x] Invoice tidak boleh lintas siswa/cabang.
- [x] Kuitansi hanya untuk pembayaran confirmed.
- [x] PDF invoice dan kuitansi dapat dibuka dari UI billing.
- [~] Kop PDF masih teks yayasan/cabang, belum memakai logo.
- [~] Detail desain PDF final menunggu logo/kop resmi.

## Audit, Waktu, dan Keamanan

- [x] Audit log global lintas modul.
- [x] Audit untuk akun, password reset, cabang, rombel, siswa, enrollment, daily record, billing, payment, invoice.
- [x] Timestamp teknis UTC ISO.
- [x] Tanggal operasional Asia/Jakarta.
- [x] UI menampilkan waktu WIB untuk audit/notifikasi.
- [x] `ADMIN_PASSWORD` wajib untuk `npm run init` production.
- [~] Audit detail before/after belum konsisten sedetail PRD untuk semua action.

## Testing dan Verifikasi

- [x] `npm run build`.
- [x] Smoke test end-to-end di `scripts/smoke.js`.
- [x] Smoke mencakup cabang default Godean, staff/guru, rombel assignment, siswa, wali multi-siswa, billing, invoice PDF, kuitansi PDF, daily record, komentar wali, pindah cabang, histori, audit.
- [x] Test runner API formal di `scripts/test.js`.

## Audit Repair Follow-up 2026-05-17

- [x] Gerbang handoff authorization aligned with UI.
- [x] Tutup hari materializes implicit `Belum` absensi rows.
- [x] Billing `siswa_id` reads scoped to authorized users.
- [x] Payment state transitions constrained and reflected in UI.
- [x] Siswa/enrollment status vocabulary aligned with schema.
- [x] Wali published history available after move/exit/lulus.
- [x] Stable non-watch test workflow documented and passing.
- [ ] Risky admin actions use impact-focused confirmation.
- [x] Duplicate table header key warning removed.
- [x] Mobile header/table pressure improved.
