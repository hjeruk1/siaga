// Kelas warna per status absensi, satu tempat untuk seluruh aplikasi.
//
// Dipisah dari `components/Shared.jsx` karena berkas itu hanya boleh
// mengekspor komponen (aturan Fast Refresh); peta kelas adalah data, bukan
// komponen.
export const SS = {
  Hadir: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Menunggu: 'bg-amber-100 text-amber-700 border-amber-200',
  Pulang: 'bg-slate-100 text-slate-500 border-slate-200',
  Terlambat: 'bg-orange-100 text-orange-700 border-orange-200',
  Izin: 'bg-sky-100 text-sky-700 border-sky-200',
  Sakit: 'bg-purple-100 text-purple-700 border-purple-200',
  Absen: 'bg-red-100 text-red-600 border-red-200',
  Libur: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  Belum: 'bg-slate-100 text-slate-400 border-slate-200'
};
