import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';

// Banner "Pasang aplikasi" di portal wali.
//
// Chrome/Edge menembakkan `beforeinstallprompt` (hanya sekali per halaman) —
// event-nya disimpan lalu dipakai saat pengguna menekan tombol. Memanggil
// prompt tanpa gestur pengguna dianggap spam oleh Chrome, jadi alurnya:
// tangkap event -> tampilkan tombol -> prompt saat diklik.
//
// iOS tidak punya event ini, jadi diberikan petunjuk manual
// (Share -> Add to Home Screen) — justru platform dengan orang tua terbanyak.
//
// Event bisa muncul SEBELUM komponen ini mount (mis. saat pengguna masih di
// halaman login), jadi main.jsx menangkapnya lebih dulu ke
// `window.__siagaInstallPrompt` dan komponen ini memakainya ulang.
const SUDAH_DITUTUP = 'siaga_install_ditutup';

function standalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function ios() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function InstallBanner() {
  const [event, setEvent] = useState(null);
  const [dihapus, setDihapus] = useState(
    () => standalone() || Boolean(localStorage.getItem(SUDAH_DITUTUP))
  );

  useEffect(() => {
    if (dihapus) return;
    // Pakai ulang event yang tertangkap sebelum komponen mount.
    if (window.__siagaInstallPrompt) setEvent(window.__siagaInstallPrompt);
    function onPrompt(e) {
      e.preventDefault(); // cegah prompt otomatis Chrome (bisa dianggap spam)
      setEvent(e);
    }
    function onInstalled() {
      setDihapus(true);
    }
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [dihapus]);

  async function pasang() {
    if (!event) return;
    event.prompt();
    const hasil = await event.userChoice;
    if (hasil.outcome === 'accepted') setDihapus(true);
  }

  function nanti() {
    localStorage.setItem(SUDAH_DITUTUP, '1');
    setDihapus(true);
  }

  const iosMode = ios();
  const tampil = !dihapus && (iosMode || Boolean(event));
  if (!tampil) return null;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary-container/60 p-3.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/70 text-primary">
        {iosMode ? (
          <Share className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Download className="h-4 w-4" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-black text-text-main">Pasang SIAGA di HP Anda</div>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
          {iosMode
            ? 'Ketuk ikon Share di Safari, lalu "Add to Home Screen" agar SIAGA membuka seperti aplikasi dan bisa mengirim notifikasi.'
            : 'Buka lebih cepat dari layar utama dan terima notifikasi catatan harian anak.'}
        </p>
      </div>
      {iosMode ? null : (
        <button
          type="button"
          onClick={pasang}
          disabled={!event}
          className="shrink-0 rounded-xl bg-primary px-3.5 py-2 text-xs font-black text-white shadow-sm transition-all hover:bg-primary-hover active:scale-[0.98] disabled:opacity-40"
        >
          Pasang
        </button>
      )}
      <button
        type="button"
        onClick={nanti}
        aria-label="Tutup"
        className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/60 hover:text-slate-600"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
