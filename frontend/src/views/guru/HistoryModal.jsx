// Modal riwayat laporan harian siswa. Dipisah dari GuruView.jsx.
// Tampilan memakai helper Portal Wali (tanggal/mood/makan) supaya warna dan
// istilah sama persis dengan yang dilihat orang tua.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Camera, CheckCircle2, ChevronRight, MessageSquare, RefreshCw, X } from 'lucide-react';
import { api } from '../../api';
import {
  kelompokBulan,
  lampiranGambar,
  MAKAN_UI,
  MOOD_UI,
  tanggalPanjang,
  waktuRelatif
} from '../wali/portalHelpers.js';

export function HistoryModal({ siswa, onClose, onOpenDate }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [galat, setGalat] = useState(null);
  const siswaId = siswa?.siswa_id;

  useEffect(() => {
    if (!siswaId) return;
    setLoading(true);
    setGalat(null);
    api
      .dailyHistory(siswaId, 60)
      .then((d) => setRows(d || []))
      .catch((e) => setGalat(e.message))
      .finally(() => setLoading(false));
  }, [siswaId]);

  // Escape menutup modal dan scroll halaman dikunci selama modal terbuka.
  useEffect(() => {
    if (!siswa) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [siswa, onClose]);

  if (!siswa) return null;

  const published = rows.filter((r) => r.status === 'published').length;
  const grup = kelompokBulan(rows);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Riwayat laporan ${siswa.nama}`}
        className="flex max-h-[88dvh] w-full flex-col rounded-t-3xl bg-white shadow-2xl motion-safe:animate-[slideUp_.25s_ease-out] sm:max-w-lg sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <div className="truncate font-black text-text-main">Riwayat Laporan</div>
            <div className="truncate text-xs text-slate-400">
              {siswa.nama} · {siswa.rombel_nama}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup riwayat"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 transition-colors hover:bg-slate-100"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 custom-scrollbar">
          {loading ? (
            <div className="space-y-3" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : galat ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-6 text-center">
              <AlertCircle className="mx-auto h-6 w-6 text-red-500" aria-hidden="true" />
              <div className="mt-2 text-sm font-black text-red-700">Riwayat gagal dimuat</div>
              <p className="mx-auto mt-1 max-w-xs text-xs text-red-600">{galat}</p>
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  setGalat(null);
                  api
                    .dailyHistory(siswa.siswa_id, 60)
                    .then((d) => setRows(d || []))
                    .catch((e) => setGalat(e.message))
                    .finally(() => setLoading(false));
                }}
                className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 text-xs font-black text-red-600 hover:bg-red-100"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Coba lagi
              </button>
            </div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">Belum ada laporan tersimpan.</div>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-500">
                <span>
                  {rows.length} laporan · {published} dibagikan
                </span>
                {onOpenDate ? <span>Klik catatan untuk membuka</span> : null}
              </div>
              {grup.map((g) => (
                <div key={g.bulan} className="mb-4">
                  <div className="mb-1.5 px-1 text-[11px] font-black uppercase tracking-wider text-slate-400">
                    {g.label}
                  </div>
                  <ul className="space-y-2">
                    {g.rows.map((l) => {
                      const mood = MOOD_UI[l.mood];
                      const makan = MAKAN_UI[l.makan];
                      const foto = lampiranGambar(l.attachments || []).slice(0, 3);
                      const komentar = l.comments?.length || 0;
                      return (
                        <li key={l.id}>
                          <button
                            type="button"
                            onClick={() => onOpenDate?.(l)}
                            className="w-full rounded-2xl border border-slate-200 bg-white p-3.5 text-left transition-all duration-200 hover:border-primary/40 hover:bg-slate-50 motion-safe:hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-xs font-black text-text-main">
                                    {tanggalPanjang(l.tanggal)}
                                  </span>
                                  {l.status === 'published' ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-black text-emerald-700">
                                      <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Terkirim
                                    </span>
                                  ) : (
                                    <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-black text-amber-700">
                                      Draft
                                    </span>
                                  )}
                                </div>
                                <div className="mt-1 flex items-center gap-1.5 truncate text-[11px] font-semibold text-slate-500">
                                  <span className="truncate">
                                    {l.focus_theme_title || 'Tanpa tema'}
                                    {l.guru_nama ? ` • ${l.guru_nama}` : ''}
                                  </span>
                                  {l.updated_at ? (
                                    <span className="shrink-0 text-[10px] font-bold text-slate-400">
                                      · {waktuRelatif(l.updated_at)}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              {onOpenDate ? (
                                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
                              ) : null}
                            </div>

                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {mood ? (
                                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${mood.tone}`}>
                                  {mood.label}
                                </span>
                              ) : null}
                              {makan ? (
                                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${makan.tone}`}>
                                  Makan: {makan.label}
                                </span>
                              ) : null}
                              {l.tidur === 1 ? (
                                <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700">
                                  💤 Tidur
                                </span>
                              ) : l.tidur === 0 ? (
                                <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">
                                  Tidak tidur
                                </span>
                              ) : null}
                              {komentar ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">
                                  <MessageSquare className="h-3 w-3" aria-hidden="true" /> {komentar}
                                </span>
                              ) : null}
                            </div>

                            {Array.isArray(l.aktivitas) && l.aktivitas.length ? (
                              <div className="mt-2 truncate text-[11px] text-slate-500">
                                {l.aktivitas.join(' · ')}
                              </div>
                            ) : null}
                            {l.observation_note ? (
                              <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-slate-600">
                                {l.observation_note}
                              </p>
                            ) : null}
                            {foto.length ? (
                              <div className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                                <Camera className="h-3 w-3" aria-hidden="true" />
                                <span>{l.attachments.length} foto</span>
                                <span className="flex gap-1">
                                  {foto.map((f) => (
                                    <img
                                      key={f.id || f.url}
                                      src={f.url}
                                      alt=""
                                      loading="lazy"
                                      decoding="async"
                                      className="h-7 w-7 rounded-md border border-slate-200 object-cover"
                                    />
                                  ))}
                                </span>
                              </div>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
