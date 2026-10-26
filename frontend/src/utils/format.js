// Pemformat tampilan yang dipakai lintas view.
//
// Sebelumnya ketiganya tinggal di `admin/AdminShared.jsx`, bercampur dengan
// komponen. Akibatnya Fast Refresh menolak berkas itu: setiap perubahan satu
// komponen memuat ulang seluruh modul dan kehilangan state halaman. Berkas ini
// hanya berisi fungsi murni, jadi tidak punya masalah yang sama.

export function money(v) {
  return 'Rp ' + Number(v || 0).toLocaleString('id-ID');
}

export function fmtTime(v) {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'Asia/Jakarta'
    }).format(new Date(v));
  } catch {
    return v;
  }
}

// Enum paket mentah ('full_day') tidak layak tampil di UI. Dipakai oleh tabel
// siswa, kartu siswa mobile, dan badge paket di panel detail supaya ketiganya
// seragam.
export const PAKET_LABELS = { reguler: 'Reguler', full_day: 'Full Day', care: 'Care' };

export function paketLabel(paket) {
  const key = String(paket || '').toLowerCase();
  return PAKET_LABELS[key] || paket || '';
}
