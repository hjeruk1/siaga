// Linimasa catatan harian: daftar per bulan + detail. Di layar lebar daftar
// dan detail berdampingan; di ponsel detail dibuka penuh lalu kembali.
import { useMemo, useState } from 'react';
import { ChevronRight, FileText, Filter, MessageSquare, Sparkles } from 'lucide-react';
import CatatanDetail from './CatatanDetail.jsx';
import { Card, EmptyState, ErrorState, Pill, Skeleton } from './ui.jsx';
import {
  kelompokBulan,
  lampiranGambar,
  makanUI,
  moodUI,
  ringkasCatatan,
  selisihHari,
  tanggalPanjang
} from './portalHelpers.js';

const FILTER = [
  { id: 'semua', label: 'Semua' },
  { id: 'belum', label: 'Belum dibaca' },
  { id: 'tanggapan', label: 'Ada tanggapan' }
];

export default function CatatanTimeline({
  riwayat = [],
  detail,
  pratinjau = null,
  memuat = false,
  galat,
  onMuatUlang,
  onBuka,
  onTutupDetail,
  komentar,
  setKomentar,
  onKirimKomentar,
  mengirim = false,
  onMuatLagi,
  bisaMuatLagi = false,
  memuatLagi = false
}) {
  const [filter, setFilter] = useState('semua');
  const [field, setField] = useState('');

  const tersaring = useMemo(() => {
    let rows = riwayat;
    if (filter === 'belum') rows = rows.filter((r) => ringkasCatatan(r).belumDibaca);
    if (filter === 'tanggapan') rows = rows.filter((r) => ringkasCatatan(r).adaTanggapan);
    const kunci = field.trim().toLowerCase();
    if (kunci) {
      rows = rows.filter((r) =>
        [r.focus_theme_title, r.catatan, r.observation_note, r.guru_nama, r.tanggal]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(kunci))
      );
    }
    return rows;
  }, [riwayat, filter, field]);

  const grup = useMemo(() => kelompokBulan(tersaring), [tersaring]);
  const gambarPratinjau = pratinjau ? lampiranGambar(pratinjau.attachments || []).slice(0, 3) : [];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
      <div className={`space-y-3 ${detail ? 'hidden lg:block' : ''}`}>
        <Card className="p-3">
          <label className="sr-only" htmlFor="cari-catatan">
            Cari catatan
          </label>
          <input
            id="cari-catatan"
            type="search"
            value={field}
            onChange={(e) => setField(e.target.value)}
            placeholder="Cari tema, catatan, atau guru…"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-text-main placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
          />
          <div className="mt-2 flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 shrink-0 text-slate-400" aria-hidden="true" />
            <div className="rail-scroll flex gap-1.5" role="tablist" aria-label="Saring catatan">
              {FILTER.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-black transition-colors duration-200 ${
                    filter === f.id
                      ? 'border-primary bg-primary-container text-primary'
                      : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {galat ? (
          <ErrorState desc={galat} onRetry={onMuatUlang} />
        ) : memuat && !riwayat.length ? (
          <Card className="space-y-2 p-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </Card>
        ) : grup.length === 0 ? (
          <Card className="p-3">
            <EmptyState
              icon={FileText}
              title={filter === 'semua' && !field ? 'Belum ada catatan yang dibagikan' : 'Tidak ada catatan yang cocok'}
              desc={
                filter === 'semua' && !field
                  ? 'Guru akan mengirim catatan harian setelah kegiatan selesai. Catatan yang sudah dikirim akan tampil di sini.'
                  : 'Coba ubah saringan atau kata pencarian.'
              }
            />
          </Card>
        ) : (
          <div className="space-y-4">
            {grup.map((g) => (
              <div key={g.bulan}>
                <div className="mb-1.5 px-1 text-[11px] font-black uppercase tracking-wider text-slate-400">
                  {g.label}
                </div>
                <ul className="space-y-2">
                  {g.rows.map((r) => {
                    const ringkas = ringkasCatatan(r);
                    const mood = moodUI(r.mood);
                    const makan = makanUI(r.makan);
                    const aktif = String(detail?.id) === String(r.id);
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => onBuka(r)}
                          aria-current={aktif ? 'true' : undefined}
                          className={`w-full rounded-2xl border px-3 py-3 text-left transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-safe:hover:-translate-y-0.5 ${
                            aktif
                              ? 'border-primary bg-primary-container shadow-sm'
                              : 'border-slate-200 bg-white hover:border-primary/40 hover:bg-slate-50 hover:shadow-[0_10px_24px_rgba(15,23,42,.06)]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black text-text-main">{tanggalPanjang(r.tanggal)}</span>
                                {ringkas.belumDibaca ? (
                                  <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" title="Belum dibaca" />
                                ) : null}
                              </div>
                              <div className="mt-1 flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                                <span className="truncate">
                                  {r.focus_theme_title || 'Catatan harian'}
                                  {r.guru_nama ? ` • ${r.guru_nama}` : ''}
                                </span>
                                {selisihHari(r.tanggal) ? (
                                  <span className="shrink-0 text-[10px] font-bold text-slate-400">
                                    · {selisihHari(r.tanggal)}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <ChevronRight className="mt-0.5 w-4 h-4 shrink-0 text-slate-300" aria-hidden="true" />
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {mood ? <Pill tone={mood.tone}>Mood: {mood.label}</Pill> : null}
                            {makan ? <Pill tone={makan.tone}>Makan: {makan.label}</Pill> : null}
                            {ringkas.jumlahKomentar ? (
                              <Pill tone="bg-slate-100 text-slate-600 border-slate-200" icon={MessageSquare}>
                                {ringkas.jumlahKomentar}
                              </Pill>
                            ) : null}
                            {r.attachments?.length ? (
                              <Pill tone="bg-slate-100 text-slate-600 border-slate-200" icon={Sparkles}>
                                {r.attachments.length} lampiran
                              </Pill>
                            ) : null}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {bisaMuatLagi ? (
              <button
                type="button"
                onClick={onMuatLagi}
                disabled={memuatLagi}
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-black text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                {memuatLagi ? 'Memuat…' : 'Muat catatan lebih lama'}
              </button>
            ) : null}
          </div>
        )}
      </div>

      <div className={detail ? '' : 'hidden lg:block'}>
        {detail ? (
          <CatatanDetail
            detail={detail}
            komentarList={detail?.comments || []}
            komentar={komentar}
            setKomentar={setKomentar}
            onKirim={onKirimKomentar}
            mengirim={mengirim}
            onBack={onTutupDetail}
          />
        ) : pratinjau ? (
          <Card className="hidden flex-col p-5 lg:sticky lg:top-4 lg:flex">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Catatan terbaru</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-sm font-black text-text-main">{tanggalPanjang(pratinjau.tanggal)}</span>
              {selisihHari(pratinjau.tanggal) ? (
                <span className="text-[10px] font-bold text-slate-400">· {selisihHari(pratinjau.tanggal)}</span>
              ) : null}
            </div>
            <div className="mt-0.5 text-[11px] font-semibold text-slate-500">
              {pratinjau.focus_theme_title || 'Catatan harian'}
              {pratinjau.guru_nama ? ` • ${pratinjau.guru_nama}` : ''}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {moodUI(pratinjau.mood) ? (
                <Pill tone={moodUI(pratinjau.mood).tone}>Mood: {moodUI(pratinjau.mood).label}</Pill>
              ) : null}
              {makanUI(pratinjau.makan) ? (
                <Pill tone={makanUI(pratinjau.makan).tone}>Makan: {makanUI(pratinjau.makan).label}</Pill>
              ) : null}
              {pratinjau.attachments?.length ? (
                <Pill icon={Sparkles}>{pratinjau.attachments.length} lampiran</Pill>
              ) : null}
            </div>
            {gambarPratinjau.length ? (
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {gambarPratinjau.map((g) => (
                  <img
                    key={g.id || g.url}
                    src={g.url}
                    alt={g.filename || 'Foto kegiatan'}
                    loading="lazy"
                    decoding="async"
                    className="aspect-square w-full rounded-lg border border-slate-200 object-cover"
                  />
                ))}
              </div>
            ) : null}
            <p className="mt-3 line-clamp-5 text-sm leading-relaxed text-slate-600">
              {pratinjau.observation_note || pratinjau.catatan || 'Belum ada ringkasan pada catatan ini.'}
            </p>
            <div className="mt-4">
              <button
                type="button"
                onClick={() => onBuka(pratinjau)}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-black text-white hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Buka catatan lengkap <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </Card>
        ) : (
          <Card className="hidden h-full min-h-[320px] place-items-center p-6 lg:grid">
            <div className="text-center">
              <FileText className="mx-auto w-8 h-8 text-slate-300" aria-hidden="true" />
              <div className="mt-2 text-sm font-black text-text-main">Pilih satu catatan</div>
              <p className="mx-auto mt-1 max-w-xs text-xs text-slate-500">
                Detail kegiatan, penilaian, foto, dan ruang tanggapan akan tampil di sini.
              </p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
