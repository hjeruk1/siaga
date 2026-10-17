// Tab "Hari Ini": catatan yang dibagikan guru untuk hari berjalan, atau
// penjelasan ringkas kenapa belum ada (libur, akhir pekan, atau belum dikirim).
import { CalendarOff, Clock, FileText, Sunset, Sunrise } from 'lucide-react';
import CatatanDetail from './CatatanDetail.jsx';
import { Card, EmptyState, InfoNote, Pill, Skeleton } from './ui.jsx';
import { bulanPanjang, isAkhirPekan, tanggalPanjang, todayISO } from './portalHelpers.js';

export default function HariIni({
  siswa,
  hariIni,
  todayInfo,
  catatanHariIni,
  memuat = false,
  galat,
  onMuatUlang,
  komentar,
  setKomentar,
  onKirimKomentar,
  mengirim = false
}) {
  const tanggal = todayISO();
  const libur = !!hariIni?.libur;
  const akhirPekan = isAkhirPekan(tanggal);
  // Akhir pekan juga "bukan hari sekolah", jadi catatan harian memang tidak
  // diharapkan muncul — jangan tampilkan status "menunggu guru" yang menyesatkan.
  const tanpaSekolah = libur || akhirPekan;
  const belumDikirim = !tanpaSekolah && !catatanHariIni;
  const batasJam = todayInfo?.due_time || '18:00';
  const namaAnak = siswa ? siswa.nama.split(' ')[0] : 'anak';

  if (galat) {
    return (
      <Card className="p-4">
        <EmptyState
          icon={FileText}
          title="Catatan hari ini tidak bisa dimuat"
          desc={galat}
          action={
            <button
              type="button"
              onClick={onMuatUlang}
              className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 hover:bg-slate-50"
            >
              Coba lagi
            </button>
          }
        />
      </Card>
    );
  }

  if (memuat && !catatanHariIni) {
    return (
      <Card className="space-y-3 p-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-16 w-full" />
      </Card>
    );
  }

  if (catatanHariIni) {
    return (
      <CatatanDetail
        detail={catatanHariIni}
        komentar={komentar}
        setKomentar={setKomentar}
        onKirim={onKirimKomentar}
        mengirim={mengirim}
      />
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <div
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
            tanpaSekolah ? 'bg-slate-100 text-slate-400' : 'bg-amber-100 text-amber-600'
          }`}
        >
          {tanpaSekolah ? (
            <CalendarOff className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Clock className="h-5 w-5" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-black text-text-main">
            {libur ? 'Hari libur' : akhirPekan ? 'Akhir pekan' : 'Catatan hari ini belum tersedia'}
          </h3>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
            {libur
              ? `Hari ini libur${hariIni?.judulLibur ? `: ${hariIni.judulLibur}` : ''}. Catatan harian hanya dibuat pada hari sekolah${
                  siswa?.cabang_nama ? ` cabang ${siswa.cabang_nama}` : ''
                }.`
              : akhirPekan
                ? `Hari ini akhir pekan. Catatan harian dibuat pada hari sekolah${
                    siswa?.cabang_nama ? ` cabang ${siswa.cabang_nama}` : ''
                  }.`
                : `Catatan ${namaAnak} untuk ${tanggalPanjang(tanggal)} akan muncul di sini setelah guru membagikannya.`}
          </p>
        </div>
        {tanpaSekolah ? (
          <Pill tone="bg-slate-100 text-slate-600 border-slate-200">Bukan hari sekolah</Pill>
        ) : (
          <Pill
            tone={
              belumDikirim
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }
          >
            {belumDikirim ? `Menunggu sampai ${batasJam} WIB` : 'Sudah dibagikan'}
          </Pill>
        )}
      </div>

      {!tanpaSekolah ? (
        <div className="grid gap-2 border-t border-slate-100 p-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
              <Sunrise className="h-3.5 w-3.5" aria-hidden="true" /> Kehadiran hari ini
            </div>
            <div className="mt-1.5">
              <Pill tone="bg-slate-100 text-slate-600 border-slate-200">
                {hariIni?.status && hariIni.status !== 'Belum' ? hariIni.status : 'Belum terekam di gerbang'}
              </Pill>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
              Status gerbang diperbarui petugas saat anak tiba di sekolah.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
              <Sunset className="h-3.5 w-3.5" aria-hidden="true" /> Catatan guru
            </div>
            <div className="mt-1.5">
              <Pill
                tone={
                  belumDikirim
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }
              >
                {belumDikirim ? `Menunggu sampai ${batasJam}` : 'Sudah dibagikan'}
              </Pill>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
              Guru mengirim catatan harian paling lambat pukul {batasJam} WIB.
            </p>
          </div>
        </div>
      ) : null}

      <div className="px-4 pb-4">
        <InfoNote>
          Periode berjalan: {bulanPanjang(String(tanggal).slice(0, 7))}. Lihat tab Kehadiran untuk rekap bulan ini, atau
          Laporan untuk mengunduh berkas resmi.
        </InfoNote>
      </div>
    </Card>
  );
}
