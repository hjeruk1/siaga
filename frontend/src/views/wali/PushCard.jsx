import { useEffect, useState } from 'react';
import { BellRing, Check, Loader2, Smartphone, X } from 'lucide-react';
import { api } from '../../api';
import { Card, Pill } from './ui.jsx';

// Konversi kunci VAPID (base64url) -> Uint8Array untuk pushManager.subscribe.
function kunciKeBytes(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function keBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// iOS: PushManager baru aktif kalau aplikasi dijalankan dari Layar Utama
// (PWA terpasang). Deteksi supaya pesannya jujur, bukan tombol yang gagal.
function iosPerluInstall() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  return ios && !standalone;
}

/**
 * Kartu aktivasi push notification di portal wali.
 *
 * Push hanya bisa digerakkan oleh aksi pengguna (gestur), jadi UI-nya berupa
 * tombol eksplisit — bukan auto-prompt yang sering ditolak tanpa dibaca.
 */
export function PushCard({ toast }) {
  const [state, setState] = useState('loading'); // loading | unsupported | ios-install | prompt | denied | on
  const [sub, setSub] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setState('unsupported');
        return;
      }
      if (iosPerluInstall()) {
        setState('ios-install');
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          setSub(existing);
          setState('on');
        } else if (Notification.permission === 'denied') {
          setState('denied');
        } else {
          setState('prompt');
        }
      } catch {
        setState('unsupported');
      }
    })();
  }, []);

  async function nyalakan() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const izin = await Notification.requestPermission();
      if (izin !== 'granted') {
        setState('denied');
        toast?.('err', 'Notifikasi belum diizinkan browser');
        return;
      }
      const { publicKey } = await api.vapidKey();
      const s = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: kunciKeBytes(publicKey)
      });
      const keys = s.toJSON().keys || {};
      await api.subscribePush({
        endpoint: s.endpoint,
        keys: { p256dh: keys.p256dh || keBase64(s.getKeys().p256dh), auth: keys.auth || keBase64(s.getKeys().auth) }
      });
      setSub(s);
      setState('on');
      toast?.('ok', 'Notifikasi aktif di perangkat ini');
    } catch (e) {
      if (String(e.message || '').includes('izinkan')) {
        setState('denied');
        toast?.('err', 'Notifikasi belum diizinkan browser');
      } else {
        toast?.('err', e.message || 'Gagal mengaktifkan notifikasi');
      }
    } finally {
      setBusy(false);
    }
  }

  async function matikan() {
    if (!sub) return;
    setBusy(true);
    try {
      await api.unsubscribePush({ endpoint: sub.endpoint });
      await sub.unsubscribe();
      setSub(null);
      setState('prompt');
      toast?.('ok', 'Notifikasi dimatikan di perangkat ini');
    } catch (e) {
      toast?.('err', e.message || 'Gagal mematikan notifikasi');
    } finally {
      setBusy(false);
    }
  }

  async function ujiCoba() {
    setBusy(true);
    try {
      const r = await api.testPush();
      if (r?.dikirim) toast?.('ok', `Notifikasi uji terkirim ke ${r.dikirim} perangkat`);
      else if (!r?.perangkat) toast?.('err', 'Perangkat ini belum terdaftar. Muat ulang halaman dulu.');
      else toast?.('err', 'Gagal mengirim ke push service, coba lagi beberapa saat');
    } catch (e) {
      toast?.('err', e.message || 'Gagal mengirim notifikasi uji');
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading') {
    return (
      <Card className="flex items-center gap-2.5 p-3.5 text-xs font-bold text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Memeriksa notifikasi…
      </Card>
    );
  }

  if (state === 'unsupported' || state === 'ios-install' || state === 'denied') return null;

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-container text-primary">
          <BellRing className="h-4.5 w-4.5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black text-text-main">Notifikasi ke HP</div>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
            Dapat kabar langsung saat catatan harian atau balasan guru masuk, walau aplikasi tidak sedang dibuka.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {state === 'on' ? (
              <>
                <Pill tone="bg-emerald-50 text-emerald-700 border-emerald-200" icon={Check}>
                  Aktif di perangkat ini
                </Pill>
                <button
                  type="button"
                  onClick={ujiCoba}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellRing className="h-3.5 w-3.5" />}
                  Kirim uji
                </button>
                <button
                  type="button"
                  onClick={matikan}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />
                  Matikan
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={nyalakan}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-black text-white shadow-sm transition-all hover:bg-primary-hover active:scale-[0.98] disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <BellRing className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Aktifkan notifikasi
              </button>
            )}
          </div>
          {iosPerluInstall() ? (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] font-semibold text-amber-600">
              <Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Di iPhone: tambahkan SIAGA ke Layar Utama dulu (Share → Add to Home Screen), lalu buka dari ikon aplikasi.
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
