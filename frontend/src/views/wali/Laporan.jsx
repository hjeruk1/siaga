// Tab Laporan: unduh PDF rekap absensi bulanan per anak dan bagikan ringkasan.
import { useMemo } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Download, MessageCircle } from 'lucide-react';
import { Card, CopyButton, InfoNote, SectionTitle, StatTile } from './ui.jsx';
import {
  bulanPanjang,
  geserBulan,
  rentangBulan,
  ringkasAnak,
  tanggalPanjang,
  teksBagikanLaporan,
  waUrl
} from './portalHelpers.js';
export default function Laporan({ siswa, bulan, onGantiBulan, rekap, memuat = false, toast }) {
  const ringkas = useMemo(() => ringkasAnak(rekap, siswa?.id), [rekap, siswa?.id]);
  // monthRange() mengembalikan objek {tahun,bulan,start,end}, bukan array —
  // destructuring array di sini dulu membuat tab Laporan crash (layar putih).
  const rentang = useMemo(() => rentangBulan(bulan) || {}, [bulan]);
  const mulai = rentang.start || '';
  const akhir = rentang.end || '';
  const bulanDepan = geserBulan(bulan, 1) > String(new Date().toISOString().slice(0, 7));
  const ringkasan = siswa
    ? `Kehadiran ${siswa.nama} ${bulanPanjang(bulan)}: ${ringkas.persen}% (${ringkas.hadir} dari ${ringkas.hari} hari sekolah).`
    : '';
  const teksBagikan = siswa ? teksBagikanLaporan(siswa.nama, bulan) : '';
  const tautan = siswa
    ? `/api/rekap/export?siswa_id=${siswa.id}&start_date=${mulai}&end_date=${akhir}&format=pdf`
    : null;

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle icon={CalendarDays} hint="Berkas PDF resmi per anak, siap dibagikan ke keluarga.">
            Laporan absensi bulanan
          </SectionTitle>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onGantiBulan(geserBulan(bulan, -1))}
              aria-label="Bulan sebelumnya"
              className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <span className="min-w-[120px] text-center text-xs font-black text-text-main">{bulanPanjang(bulan)}</span>
            <button
              type="button"
              onClick={() => onGantiBulan(geserBulan(bulan, 1))}
              disabled={bulanDepan}
              aria-label="Bulan berikutnya"
              className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {memuat && !rekap ? (
          <div className="grid gap-2 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-200/70" />)}
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-4">
            <StatTile label="Hari sekolah" value={ringkas.hari} hint="berjalan" />
            <StatTile label="Hadir" value={ringkas.hadir} hint="hari" tone="text-emerald-600" />
            <StatTile label="Persentase" value={`${ringkas.persen}%`} hint="kehadiran" tone="text-amber-600" />
            <StatTile label="Belum catatan" value={ringkas.counts?.Belum || 0} hint="hari" />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {tautan ? (
            <a
              href={tautan}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-black text-white hover:bg-primary/90"
            >
              <Download className="w-4 h-4" aria-hidden="true" /> Unduh PDF
            </a>
          ) : null}
          <CopyButton teks={ringkasan} label="Salin ringkasan" toast={toast} />
          <a
            href={waUrl(null, teksBagikan)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-xs font-black text-emerald-700 hover:bg-emerald-100"
          >
            <MessageCircle className="w-4 h-4" aria-hidden="true" /> Bagikan WA
          </a>
        </div>
      </Card>

      <Card className="p-4">
        <SectionTitle icon={CalendarDays} hint="Periode laporan mengikuti bulan yang dipilih.">
          Periode berkas
        </SectionTitle>
        <p className="mt-2 text-xs text-slate-600">
          Berkas mencakup {tanggalPanjang(mulai)} sampai {tanggalPanjang(akhir)}. Hanya hari sekolah yang sudah berjalan
          yang dihitung.
        </p>
      </Card>

      <InfoNote>
        Laporan PDF berisi ringkasan dan tabel harian per anak, sama dengan yang digunakan staf sekolah.
      </InfoNote>
    </div>
  );
}
