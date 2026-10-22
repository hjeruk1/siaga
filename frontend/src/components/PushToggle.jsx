import { useCallback, useEffect, useState } from 'react';
import { BellRing, Check, Loader2, Send, Smartphone } from 'lucide-react';
import { api } from '../api';

// Aktivasi notifikasi push untuk staff (admin/guru/gerbang).
//
// Wali punya kartu sendiri di portalnya (views/wali/PushCard.jsx); komponen ini
// sengaja mandiri — tanpa dependensi UI wali — supaya bisa dipakai di modal
// "Keamanan akun" staff. Logika langganan sama persis dengan standar Web Push:
//   izin pengguna (gestur) -> kunci VAPID server -> pushManager.subscribe
//   -> kirim subscription ke server (per perangkat).
//
// Push TIDAK bisa diaktifkan otomatis: browser mewajibkan gestur pengguna.
function kunciKeBytes(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// iOS hanya mengizinkan push kalau aplikasi dijalankan dari Layar Utama.
function iosPerluInstall() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  return ios && !standalone;
}

export default function PushToggle({ toast }) {
  const [state, setState] = useState('memeriksa'); // memeriksa | tidak-didukung | ios-install | mati | ditolak | aktif
  const [sibuk, setSibuk] = useState(false);

  const dukung = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

  const periksa = useCallback(async () => {
    if (!dukung) return setState('tidak-didukung');
    if (iosPerluInstall()) return setState('ios-install');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        setState('aktif');
      } else {
        setState(Notification.permission === 'denied' ? 'ditolak' : 'mati');
      }
    } catch {
      setState('mati');
    }
  }, [dukung]);

  useEffect(() => {
    periksa();
  }, [periksa]);

  async function aktifkan() {
    setSibuk(true);
    try {
      const izin = await Notification.requestPermission();
      if (izin !== 'granted') {
        setState(izin === 'denied' ? 'ditolak' : 'mati');
        toast?.('err', 'Izin notifikasi tidak diberikan.');
        return;
      }
      const { publicKey } = await api.vapidKey();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: kunciKeBytes(publicKey)
      });
      await api.subscribePush(sub.toJSON());
      setState('aktif');
      toast?.('ok', 'Notifikasi perangkat aktif.');
    } catch (e) {
      toast?.('err', e.message);
    } finally {
      setSibuk(false);
    }
  }

  async function matikan() {
    setSibuk(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api.unsubscribePush({ endpoint: sub.endpoint }).catch(() => {});
        await sub.unsubscribe();
      }
      setState('mati');
      toast?.('ok', 'Notifikasi perangkat dimatikan.');
    } catch (e) {
      toast?.('err', e.message);
    } finally {
      setSibuk(false);
    }
  }

  async function kirimUji() {
    setSibuk(true);
    try {
      const r = await api.ujiPush();
      if (!r.dikirim) toast?.('err', 'Tidak ada perangkat terdaftar untuk akun ini.');
      else toast?.('ok', `Notifikasi uji dikirim ke ${r.dikirim} perangkat.`);
    } catch (e) {
      toast?.('err', e.message);
    } finally {
      setSibuk(false);
    }
  }

  const ket = {
    memeriksa: 'Memeriksa dukungan perangkat…',
    'tidak-didukung': 'Peramban ini tidak mendukung notifikasi push.',
    'ios-install': 'Di iPhone/iPad: pasang SIAGA ke Layar Utama dulu, lalu buka dari ikon tersebut.',
    mati: 'Notifikasi akan muncul di perangkat ini walau aplikasi tertutup.',
    ditolak: 'Izin notifikasi diblokir. Aktifkan lewat pengaturan situs di peramban.',
    aktif: 'Notifikasi perangkat aktif untuk akun ini.'
  }[state];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">
          <BellRing className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-black text-text-main">Notifikasi perangkat</div>
          <p className="text-[11px] text-slate-500">Kabar penting tetap masuk walau aplikasi tidak sedang dibuka.</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {state === 'aktif' ? (
          <>
            <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
              <Check className="h-3.5 w-3.5" /> Aktif
            </span>
            <button
              type="button"
              onClick={kirimUji}
              disabled={sibuk}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {sibuk ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Kirim uji
            </button>
            <button
              type="button"
              onClick={matikan}
              disabled={sibuk}
              className="rounded-xl px-2.5 py-2 text-xs font-black text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-60"
            >
              Matikan
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={aktifkan}
            disabled={sibuk || state === 'memeriksa' || state === 'tidak-didukung' || state === 'ios-install'}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-black text-white hover:bg-primary-hover disabled:opacity-60"
          >
            {sibuk ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Smartphone className="h-3.5 w-3.5" />}
            Aktifkan notifikasi
          </button>
        )}
      </div>

      <p className="mt-2 text-[10px] leading-relaxed text-slate-400">{ket}</p>
    </div>
  );
}
