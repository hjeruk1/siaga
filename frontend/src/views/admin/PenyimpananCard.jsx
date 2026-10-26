import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { HardDrive, Loader2, RefreshCw, TriangleAlert } from 'lucide-react';

// Kartu pemakaian penyimpanan untuk admin pusat.
//
// Angka disk diambil dari statfs (sisa sebenarnya di server), bukan perkiraan
// dari ukuran berkas: folder uploads bisa kecil sementara disk penuh karena
// log, backup, atau paket sistem. Bar di atas menjawab "apakah saya dalam
// bahaya", tabel di bawah menjawab "apa yang memakan tempat".

function ukuran(bytes) {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export default function PenyimpananCard({ toast }) {
  const [data, setData] = useState(null);
  const [memuat, setMemuat] = useState(true);
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const muat = useCallback(async () => {
    setMemuat(true);
    try {
      setData(await api.storage());
    } catch (e) {
      toastRef.current?.('err', e.message);
    } finally {
      setMemuat(false);
    }
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  if (memuat && !data) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 text-sm font-black text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Membaca pemakaian penyimpanan
        </div>
      </section>
    );
  }
  if (!data) return null;

  const disk = data.disk;
  const persen = disk?.persen ?? 0;
  const warna = persen >= 85 ? 'bg-rose-500' : persen >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
  const folder = (data.uploads.folder || []).filter((f) => f.bytes > 0 || f.files > 0);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_18px_60px_rgba(15,23,42,.05)] sm:p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[15px] font-black text-text-main">
            <HardDrive className="h-4 w-4 text-primary" />
            Penyimpanan server
          </h2>
          <p className="text-[11px] font-semibold text-slate-500">
            Foto kegiatan menambah sekitar 1,5–2 MB per album. Angka ini menunjukkan sisa ruang sebenarnya.
          </p>
        </div>
        <button
          type="button"
          onClick={muat}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-100 px-3 text-[12px] font-black text-slate-700 hover:bg-slate-200"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Segarkan
        </button>
      </div>

      {disk ? (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-lg font-black text-text-main">
              {persen}% terpakai
              <span className="ml-2 text-[12px] font-bold text-slate-500">
                {ukuran(disk.terpakai)} dari {ukuran(disk.total)}
              </span>
            </div>
            <div className="text-[12px] font-bold text-slate-500">Sisa {ukuran(disk.bebas)}</div>
          </div>
          <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full ${warna}`} style={{ width: `${Math.min(100, persen)}%` }} />
          </div>
        </>
      ) : (
        <p className="text-[12px] font-semibold text-slate-500">
          Informasi disk tidak tersedia di sistem ini. Angka folder di bawah tetap akurat.
        </p>
      )}

      {disk && persen >= 85 && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <p className="text-[12px] font-bold leading-relaxed text-rose-700">
            Ruang disk hampir habis. Kosongkan backup lama atau pindahkan foto kegiatan yang sudah lama ke arsip —
            aplikasi berhenti menulis bila disk penuh.
          </p>
        </div>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Berkas unggahan</div>
          <div className="mt-1 text-lg font-black text-text-main">{ukuran(data.uploads.bytes)}</div>
          <div className="mt-1 text-[11px] font-semibold text-slate-500">{data.uploads.files} berkas</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Database</div>
          <div className="mt-1 text-lg font-black text-text-main">
            {ukuran(data.database.utama + data.database.wal)}
          </div>
          <div className="mt-1 text-[11px] font-semibold text-slate-500">
            utama {ukuran(data.database.utama)} · WAL {ukuran(data.database.wal)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Backup lokal</div>
          <div className="mt-1 text-lg font-black text-text-main">
            {data.backup.ada ? ukuran(data.backup.bytes) : '—'}
          </div>
          <div className="mt-1 text-[11px] font-semibold text-slate-500">
            {data.backup.ada ? `${data.backup.files} berkas` : 'belum ada di folder ini'}
          </div>
        </div>
      </div>

      {folder.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-left text-[12px]">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-2 font-black">Folder</th>
                <th className="px-3 py-2 font-black">Berkas</th>
                <th className="px-3 py-2 text-right font-black">Ukuran</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {folder.map((f) => (
                <tr key={f.nama}>
                  <td className="px-3 py-2 font-bold text-text-main">{f.label}</td>
                  <td className="px-3 py-2 font-semibold text-slate-500">{f.files}</td>
                  <td className="px-3 py-2 text-right font-black text-text-main">{ukuran(f.bytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-2 text-[11px] font-semibold text-slate-500">
        Galeri: {data.galeri.foto} foto ({ukuran(data.galeri.bytes)}), {data.galeri.bulan_ini} di antaranya bulan ini.
        Semua berkas unggahan ikut backup otomatis.
      </p>
    </section>
  );
}
