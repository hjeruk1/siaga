// Status kanal WhatsApp untuk admin.
//
// Endpoint /api/wa/status sudah lama ada tetapi tidak pernah ditampilkan di
// mana pun — artinya satu-satunya cara mengetahui sesi putus adalah membuka
// URL-nya manual. Kartu ini menutup celah itu, termasuk tombol "Periksa
// sekarang" supaya admin tidak perlu menunggu jadwal berkala setelah
// memperbaiki sesi.
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, MessageCircle, RefreshCw, XCircle } from 'lucide-react';
import { api } from '../../api';

function waktu(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const TONE = {
  ok: { chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2, label: 'Siap' },
  down: { chip: 'bg-rose-50 text-rose-700 border-rose-200', icon: AlertTriangle, label: 'Terputus' },
  mati: { chip: 'bg-slate-100 text-slate-600 border-slate-200', icon: XCircle, label: 'Tidak dikonfigurasi' },
  'belum-dicek': { chip: 'bg-slate-100 text-slate-600 border-slate-200', icon: MessageCircle, label: 'Belum diperiksa' }
};

export default function WaStatusPanel({ toast }) {
  const [data, setData] = useState(null);
  const [memuat, setMemuat] = useState(true);
  const [busy, setBusy] = useState(false);

  const muat = useCallback(async () => {
    setMemuat(true);
    try {
      setData(await api.waStatus());
    } catch (e) {
      toast?.('err', e.message);
    } finally {
      setMemuat(false);
    }
  }, [toast]);

  useEffect(() => {
    muat();
  }, [muat]);

  async function periksa() {
    setBusy(true);
    try {
      const r = await api.waCheck();
      setData((d) => ({ ...(d || {}), ...r, pantau: r.pantau }));
      const status = r?.pantau?.status || r?.status;
      if (status === 'ok') toast?.('ok', 'Kanal WhatsApp siap.');
      else if (status === 'down') toast?.('err', r?.pantau?.pesan || 'Kanal WhatsApp terputus.');
      else toast?.('info', 'Kanal WhatsApp tidak dikonfigurasi.');
      await muat();
    } catch (e) {
      toast?.('err', e.message);
    } finally {
      setBusy(false);
    }
  }

  const pantau = data?.pantau || {};
  const status = pantau.status || (data?.aktif === false ? 'mati' : 'belum-dicek');
  const tone = TONE[status] || TONE['belum-dicek'];
  const Icon = tone.icon;
  const provider = data?.provider || pantau.provider || 'none';

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_18px_60px_rgba(15,23,42,.05)] sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-container text-primary">
            <MessageCircle className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-[15px] font-black text-text-main">Status WhatsApp</h2>
            <p className="text-[11px] font-semibold text-slate-500">
              Notifikasi orang tua lewat WhatsApp — diperiksa otomatis tiap 5 menit.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black ${tone.chip}`}
          >
            <Icon className="h-3.5 w-3.5" />
            {tone.label}
          </span>
          <button
            type="button"
            onClick={periksa}
            disabled={busy || memuat}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Periksa sekarang
          </button>
        </div>
      </div>

      {pantau.pesan && status === 'down' && (
        <div className="mb-3 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {pantau.pesan} Pengumuman, izin, dan pembayaran tetap tercatat di aplikasi, tetapi orang tua tidak menerima
            WhatsApp sampai sesi diperbaiki.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Provider', provider],
          ['Terakhir diperiksa', waktu(pantau.terakhir_cek)],
          ['Terakhir sehat', waktu(pantau.terakhir_ok)],
          ['Gagal beruntun', String(pantau.gagal_beruntun ?? 0)]
        ].map(([label, nilai]) => (
          <div key={label} className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
            <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</div>
            <div className="mt-0.5 truncate text-[13px] font-black text-text-main">{nilai}</div>
          </div>
        ))}
      </div>

      {data?.statistik && (
        <p className="mt-2 text-[11px] font-semibold text-slate-400">
          Sejak server hidup: {data.statistik.terkirim} terkirim · {data.statistik.gagal} gagal ·{' '}
          {data.statistik.dilewati} dilewati · antrean {data.antrean ?? 0}
        </p>
      )}
    </section>
  );
}
