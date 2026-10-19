const { z } = require('zod');

// Nilai yang diterima sebagai id: angka, atau string numerik (sebagian klien
// mengirim id sebagai string dari query/JSON).
const idLike = z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]);
const tanggal = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const teks = z.string().max(2000);
const nominalLike = z
  .union([z.number(), z.string()])
  .refine((v) => Number.isFinite(Number(v)) && Number(v) > 0, { message: 'harus angka lebih dari 0' });

// --- auth ---
// Field dibuat opsional karena handler sudah punya pesan validasi berbahasa
// Indonesia sendiri; schema ini menangkap tipe yang salah, bukan menggantikan
// aturan bisnis di handler.
const loginSchema = z.object({
  tipe: z.enum(['staff', 'wali']).optional(),
  username: z.string().max(80).optional(),
  no_wa: z.string().max(80).optional(),
  password: z.string().max(128).optional()
});

const changePasswordSchema = z.object({
  old_password: z.string().max(128).optional(),
  new_password: z.string().max(128).optional()
});

// Lupa password: identitas mengikuti tipe akun — wali lewat nomor WhatsApp,
// staff lewat username (nomornya diambil dari staff_profile).
const lupaPasswordSchema = z.object({
  tipe: z.enum(['staff', 'wali']).optional(),
  username: z.string().max(80).optional(),
  no_wa: z.string().max(80).optional()
});

const resetPasswordSchema = z.object({
  tipe: z.enum(['staff', 'wali']).optional(),
  username: z.string().max(80).optional(),
  no_wa: z.string().max(80).optional(),
  kode: z.string().max(12).optional(),
  password_baru: z.string().max(128).optional()
});

// --- absensi ---
const absensiCheckinSchema = z.object({
  siswa_id: idLike,
  tanggal: tanggal.optional(),
  manual: z.union([z.boolean(), z.number(), z.string()]).optional()
});

const absensiKeteranganSchema = z.object({
  siswa_id: idLike,
  tanggal: tanggal.optional(),
  status: z.enum(['Izin', 'Sakit', 'Absen']),
  catatan: teks.optional()
});

// --- billing ---
const pembayaranSchema = z.object({
  siswa_id: idLike,
  nominal: nominalLike,
  metode: z.string().min(1).max(40),
  cabang_id: idLike.optional(),
  tanggal_bayar: tanggal.optional(),
  reference: teks.optional(),
  catatan: teks.optional(),
  alokasi: z
    .array(
      z.object({
        tagihan_id: idLike,
        nominal: nominalLike.optional()
      })
    )
    .optional()
});

const jam = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format jam harus HH:MM');
const boolish = z.union([z.boolean(), z.number(), z.string().max(10)]);

// Serah terima manual: satu-satunya jalan keluar ketika QR penjemput tidak
// terbaca / kartu hilang. Wajib menyebut alasan karena jalan ini melewati scan.
const penjemputanManualSchema = z.object({
  siswa_id: idLike,
  penjemput_id: idLike,
  alasan: z.string().min(5, 'Alasan minimal 5 karakter').max(500),
  tanggal: tanggal.optional()
});

// Konfigurasi operasional: jam harus "HH:MM" zero-padded supaya perbandingan
// terlambat/pulang tetap benar.
const operasionalConfigSchema = z.object({
  jam_masuk: jam.optional(),
  jam_pulang: jam.optional(),
  daily_record_due_time: jam.optional(),
  hitung_terlambat: boolish.optional(),
  pakai_kalender: boolish.optional(),
  daily_record_wajib: boolish.optional(),
  pickup_fleksibel: boolish.optional()
});

module.exports = {
  loginSchema,
  changePasswordSchema,
  lupaPasswordSchema,
  resetPasswordSchema,
  absensiCheckinSchema,
  absensiKeteranganSchema,
  pembayaranSchema,
  penjemputanManualSchema,
  operasionalConfigSchema
};
