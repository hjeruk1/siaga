// Tab Kehadiran: kalender bulan berjalan dengan warna status, ringkasan angka,
// dan jalan pintas ke unduhan laporan resmi.
import { useMemo } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Download, Info } from 'lucide-react';
import { Card, CopyButton, EmptyState, ErrorState, InfoNote, ProgressRing, SectionTitle, Skeleton } from './ui.jsx';
import {
  bulanIni,
  bulanPanjang,
  geserBulan,
  gridBulan,
  liburJudul,
  namaPanggilan,
  petaBulan,
  ringkasAnak,
  statusUI,
  tanggalPanjang,
  todayISO
} from './portalHelpers.js';

const HARI_HEADER = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const URUT_LEGENDA = ['Hadir', 'Terlambat', 'Pulang', 'Menunggu', 'Izin', 'Sakit', 'Absen', 'Libur', 'Belum'];

function chunkMinggu(cells = []) {
  const minggu = [];
  for (let i = 0; i < cells.length; i += 7) minggu.push(cells.slice(i, i + 7));
  return minggu;
}

export default function Kehadiran({
  siswa,
  rekap,
  bulan,
  onGantiBulan,
  memuat = false,
  galat,
  onMuatUlang,
  onBukaLaporan
}) {
  const hariIni = todayISO();
  const ringkas = useMemo(() => ringkasAnak(rekap, siswa?.id), [rekap, siswa?.id]);
  const cells = useMemo(
    () =>
      gridBulan(
        bulan,
        (rekap?.hari_libur || []).map((d) => `${bulan}-${d}`)
      ),
    [bulan, rekap?.hari_libur]
  );
  const minggu = useMemo(() => chunkMinggu(cells), [cells]);
  const peta = useMemo(() => petaBulan(rekap, siswa?.id), [rekap, siswa?.id]);
  const liburSet = useMemo(() => new Set((rekap?.hari_libur || []).map((d) => String(d))), [rekap?.hari_libur]);
  const bulanDepan = geserBulan(bulan, 1) > bulanIni();
  const adaCatatan = peta.some((p) => p.status && p.status !== 'Belum');

  const ringkasanTeks = siswa
    ? `Kehadiran ${siswa.nama} ${bulanPanjang(bulan)}: ${ringkas.persen}% (${ringkas.hadir} dari ${ringkas.hari} hari sekolah).`
    : '';

  if (galat) {
    return (
      <Card className="p-4">
        <ErrorState desc={galat} onRetry={onMuatUlang} />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle
            icon={CalendarDays}
            hint="Hanya hari sekolah yang sudah berjalan. Hari yang belum berjalan tidak dinilai."
          >
            Kehadiran bulanan
          </SectionTitle>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onGantiBulan(geserBulan(bulan, -1))}
              aria-label="Bulan sebelumnya"
              className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <span className="min-w-[132px] text-center text-xs font-black text-text-main">{bulanPanjang(bulan)}</span>
            <button
              type="button"
              onClick={() => onGantiBulan(geserBulan(bulan, 1))}
              disabled={bulanDepan}
              aria-label="Bulan berikutnya"
              className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,260px)_1fr]">
          <div className="flex items-center gap-4 rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50 to-white p-4 dark:border-slate-800 dark:from-slate-800/60 dark:to-slate-900">
            {memuat && !rekap ? (
              <Skeleton className="h-[104px] w-[104px] rounded-full" />
            ) : (
              <ProgressRing value={ringkas.persen} size={104} stroke={9} tone="#f59e0b" track="#fde68a">
                <div>
                  <div className="text-xl font-black tabular-nums text-text-main">{ringkas.persen}%</div>
                  <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500">hadir</div>
                </div>
              </ProgressRing>
            )}
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-wider text-amber-700">Kehadiran</div>
              <div className="mt-1 text-sm font-black text-text-main">
                {ringkas.hadir} dari {ringkas.hari} hari
              </div>
              <p className="mt-1 text-[10px] leading-snug text-slate-400">
                Hadir + terlambat + pulang dihitung hadir. Tanpa catatan tetap dihitung belum hadir.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {['Hadir', 'Terlambat', 'Pulang', 'Menunggu', 'Izin', 'Sakit', 'Absen', 'Belum'].map((k) => (
              <div key={k} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-slate-400">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusUI(k).dot}`} aria-hidden="true" />
                  <span className="truncate">{k === 'Absen' ? 'Tanpa ket.' : k === 'Belum' ? 'Tanpa catatan' : k}</span>
                </div>
                <div className="mt-1 text-lg font-black tabular-nums text-text-main">
                  {memuat && !rekap ? '—' : ringkas.counts?.[k] || 0}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <SectionTitle icon={CalendarDays} hint={`${namaPanggilan(siswa)} • ${bulanPanjang(bulan)}`}>
          Kalender bulan ini
        </SectionTitle>

        {memuat && !rekap ? (
          <Skeleton className="h-64 w-full" />
        ) : !adaCatatan && peta.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Belum ada hari sekolah pada periode ini"
            desc="Pilih bulan lain, atau hubungi admin sekolah bila kalender belum diisi."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-1 text-center">
                <caption className="sr-only">Kalender kehadiran {bulanPanjang(bulan)}</caption>
                <thead>
                  <tr>
                    {HARI_HEADER.map((h) => (
                      <th
                        key={h}
                        scope="col"
                        className="pb-1 text-[10px] font-black uppercase tracking-wider text-slate-400"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {minggu.map((pekan, i) => (
                    <tr key={`pekan-${i}`}>
                      {Array.from({ length: 7 }, (_, j) => {
                        const sel = pekan[j];
                        if (!sel || sel.kosong) return <td key={`kosong-${i}-${j}`} className="p-0" />;
                        const status = sel.libur ? 'Libur' : peta.find((p) => p.iso === sel.iso)?.status || 'Belum';
                        const ui = statusUI(status);
                        const belumBerjalan = sel.iso > hariIni;
                        const judulLibur = sel.libur ? liburJudul(rekap, sel.iso) : null;
                        return (
                          <td key={sel.iso} className="p-0 align-top">
                            <div
                              title={`${tanggalPanjang(sel.iso)} — ${belumBerjalan ? 'belum berjalan' : ui.label}${
                                judulLibur ? ` (${judulLibur})` : ''
                              }`}
                              className={`flex h-full min-h-[54px] flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-1.5 ${
                                belumBerjalan ? 'border-dashed border-slate-200 bg-white text-slate-300' : `${ui.pill}`
                              }`}
                            >
                              <span
                                className={`text-xs font-black tabular-nums ${belumBerjalan ? 'text-slate-300' : ''}`}
                              >
                                {sel.hari}
                              </span>
                              {!belumBerjalan ? (
                                <span className="text-[9px] font-black uppercase tracking-wide">
                                  {ui.singkat === '-' ? '—' : ui.label.split(' ')[0]}
                                </span>
                              ) : null}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="flex flex-wrap gap-1.5">
              {URUT_LEGENDA.map((k) => (
                <li
                  key={k}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-wide ${statusUI(k).pill}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${statusUI(k).dot}`} aria-hidden="true" />
                  {statusUI(k).label}
                </li>
              ))}
            </ul>

            {liburSet.size ? (
              <ul className="space-y-1">
                {(rekap?.hari_libur_detail || []).map((e) => (
                  <li key={e.tanggal} className="flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                    <Info className="w-3.5 h-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                    {tanggalPanjang(e.tanggal)}: libur {e.judul}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </Card>

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="text-sm font-black text-text-main">Laporan bulanan resmi</div>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Berkas PDF berisi ringkasan dan tabel harian, siap diberikan ke keluarga.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CopyButton teks={ringkasanTeks} toast={undefined} />
          <button
            type="button"
            onClick={onBukaLaporan}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-black text-white hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" /> Ke laporan
          </button>
        </div>
      </Card>

      <InfoNote>
        Angka dihitung dari catatan absensi gerbang: <b>Pulang</b> berarti anak sudah terekam masuk lalu dijemput,
        sedangkan <b>Menunggu</b> belum divalidasi petugas. Status <b>Belum</b> berarti hari sekolah tanpa catatan.
      </InfoNote>
    </div>
  );
}
