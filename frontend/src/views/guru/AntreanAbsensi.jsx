import { useCallback, useEffect, useRef, useState } from 'react';
import { CloudOff, Loader2, RefreshCw, TriangleAlert } from 'lucide-react';
import { baca, sinkron, subscribe } from '../../utils/absensiAntrean';

// Banner antrean absensi offline.
//
// Komponen ini sengaja memegang sendiri logika sinkronisasi: GuruView hanya
// perlu menambah item ke antrean, dan banner menanggapi perubahan itu. Dengan
// begitu tidak ada dua tempat yang berlomba mengirim.
export default function AntreanAbsensi({ user, toast }) {
  const [daftar, setDaftar] = useState([]);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [sibuk, setSibuk] = useState(false);
  const [gagal, setGagal] = useState([]);
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const segarkan = useCallback(() => {
    setDaftar(baca(user?.id));
  }, [user?.id]);

  useEffect(() => {
    segarkan();
    return subscribe(segarkan);
  }, [segarkan]);

  useEffect(() => {
    function naik() {
      setOnline(true);
    }
    function turun() {
      setOnline(false);
    }
    window.addEventListener('online', naik);
    window.addEventListener('offline', turun);
    return () => {
      window.removeEventListener('online', naik);
      window.removeEventListener('offline', turun);
    };
  }, []);

  const kirim = useCallback(async () => {
    if (!user?.id || sibuk) return;
    setSibuk(true);
    try {
      const hasil = await sinkron(user.id);
      if (hasil?.terkirim) toastRef.current?.('ok', `${hasil.terkirim} absensi terkirim`);
      if (hasil?.gagal?.length) {
        setGagal(hasil.gagal);
        toastRef.current?.('err', `${hasil.gagal.length} absensi ditolak server`);
      }
    } finally {
      setSibuk(false);
    }
  }, [user?.id, sibuk]);

  // Sinkron otomatis saat komponen muncul dengan antrean terisi dan perangkat
  // online — mis. guru membuka aplikasi lagi setelah sinyal kembali.
  useEffect(() => {
    if (online && daftar.length > 0 && !sibuk) kirim();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, daftar.length]);

  if (!online && daftar.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
        <CloudOff className="h-4 w-4 shrink-0 text-amber-600" />
        <p className="text-[12px] font-bold text-amber-800">
          Tidak ada sinyal. Absensi yang Anda tandai akan disimpan di perangkat dan dikirim otomatis saat online.
        </p>
      </div>
    );
  }

  if (daftar.length === 0 && gagal.length === 0) return null;

  return (
    <div className="space-y-2">
      {daftar.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <CloudOff className="h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-[12px] font-bold text-amber-800">
              {daftar.length} absensi tersimpan di perangkat{online ? ' — menunggu dikirim' : ''}.
            </p>
          </div>
          <button
            type="button"
            onClick={kirim}
            disabled={sibuk || !online}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-amber-600 px-2.5 text-[11px] font-black text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {sibuk ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {sibuk ? 'Mengirim' : 'Kirim sekarang'}
          </button>
        </div>
      )}

      {gagal.length > 0 && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <div className="min-w-0">
              <p className="text-[12px] font-black text-rose-700">
                {gagal.length} absensi tidak bisa dikirim dan sudah dihapus dari antrean:
              </p>
              <ul className="mt-1 space-y-0.5">
                {gagal.slice(0, 4).map((g, i) => (
                  <li key={i} className="text-[11px] font-semibold text-rose-700">
                    {g.label ? `${g.label}: ` : ''}
                    {g.pesan}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setGagal([])}
                className="mt-1 text-[11px] font-black text-rose-700 underline"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
