// Klien React Query untuk seluruh aplikasi.
//
// Kenapa singleton di tingkat modul, bukan dibuat di dalam App: provider harus
// membungkus App (termasuk layar login dan wajib-ganti-password), sedangkan
// `toast` hidup di dalam App. Dengan singleton, arah ketergantungannya satu
// arah — klien tidak tahu apa-apa soal toast; App yang mendaftarkan penangan
// error-nya saat mount.
//
// Dua pilihan bawaan yang sengaja berbeda dari bawaan React Query:
//
//   staleTime 30 detik — dashboard ini dipakai bergantian antar tab. Tanpa ini
//     setiap kembali ke tab memicu permintaan baru, padahal datanya baru saja
//     diambil; efeknya deretan spinner yang tidak perlu.
//   refetchOnWindowFocus mati — terminal sekolah sering berpindah jendela, dan
//     daftar yang berubah sendiri di tengah pekerjaan lebih mengganggu daripada
//     membantu. Data absensi yang perlu realtime sudah punya SSE sendiri.
import { QueryCache, QueryClient } from '@tanstack/react-query';

let tanganiError = null;

/** Didaftarkan App sekali; menerima setiap kegagalan query yang tidak ditangani lokal. */
export function daftarkanPenanganError(fn) {
  tanganiError = fn;
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      // 401 sudah ditangani api.js (sesi berakhir + kembali ke login).
      // Menampilkannya lagi hanya menutupi pesan yang benar-benar penting.
      if (error?.status === 401) return;
      tanganiError?.(error);
    }
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Satu percobaan ulang saja: aplikasi internal, dan admin perlu tahu
      // segera kalau server bermasalah — bukan menunggu 3 percobaan backoff.
      retry: 1,
      retryDelay: 400,
      refetchOnWindowFocus: false
    },
    mutations: {
      retry: 0
    }
  }
});
