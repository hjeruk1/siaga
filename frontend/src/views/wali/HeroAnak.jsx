// Hero Portal Wali: identitas anak, status hari ini, ringkasan kehadiran
// bulan berjalan, dan tiga jawaban cepat yang paling dicari orang tua
// (status hari ini, catatan terakhir, sisa tagihan).
import {
  Award,
  Bell,
  CalendarCheck,
  GraduationCap,
  MapPin,
  MessageCircle,
  NotebookPen,
  Sparkles,
  Users,
  Wallet
} from 'lucide-react';
import { Avatar, ProgressRing, WeekStrip } from './ui.jsx';
import { inisial, isAkhirPekan, namaPanggilan, rupiah, statusUI, tanggalPanjang, tanggalPendek, todayISO } from './portalHelpers.js';

function InfoChip({ icon: Icon, children }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/15 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
      {Icon ? <Icon className="h-3 w-3 opacity-80" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

function QuickFact({ icon: Icon, label, value, hint }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/20 bg-black/25 px-2.5 py-2 backdrop-blur-sm">
      <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-white/70">
        <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-0.5 truncate text-xs font-black tabular-nums text-white">{value}</div>
      {hint ? <div className="truncate text-[9px] font-semibold text-white/60">{hint}</div> : null}
    </div>
  );
}

function RailAnak({ siswa = [], selected, onSelect }) {
  if (siswa.length <= 1) return null;
  return (
    <div className="rail-scroll -mx-4 flex gap-2 px-4 pb-1 sm:mx-0 sm:px-0" role="tablist" aria-label="Pilih anak">
      {siswa.map((s) => {
        const aktif = String(selected?.id) === String(s.id);
        return (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={aktif}
            onClick={() => onSelect(s)}
            className={`flex shrink-0 items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-left transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
              aktif
                ? // nilai eksplisit: tema gelap menimpa .bg-white, padahal pil aktif
                  // harus tetap putih agar jelas terbaca di atas gradasi oranye.
                  'border-white bg-[#ffffff] shadow-md'
                : 'border-white/25 bg-white/10 hover:bg-white/20'
            }`}
          >
            <Avatar nama={s.nama} url={s.foto} size="xs" />
            <span className={`text-xs font-black ${aktif ? 'text-[#0f172a]' : 'text-white'}`}>{namaPanggilan(s)}</span>
          </button>
        );
      })}
    </div>
  );
}

const KOTAK_KECIL = {
  Hadir: 'text-white/95',
  Terlambat: 'text-white/95',
  Pulang: 'text-white/95',
  Menunggu: 'text-white/95',
  Izin: 'text-white/95',
  Sakit: 'text-white/95',
  Absen: 'text-white/95',
  Libur: 'text-white/80',
  Belum: 'text-white/80'
};

export default function HeroAnak({
  user,
  siswa,
  selected,
  ringkas,
  statusHariIni: hariIni,
  sapaan,
  unread = 0,
  onSelect,
  onOpenKabar,
  muatKehadiran = false,
  peta = [],
  tagihanRingkas = null,
  catatanTerakhir = null
}) {
  const ui = statusUI(hariIni?.status);
  const akhirPekan = isAkhirPekan(todayISO());
  const hariIniLabel = akhirPekan
    ? 'Akhir pekan'
    : hariIni?.status === 'Belum'
      ? 'Belum ada catatan'
      : ui.label;
  const hariIniHint = hariIni?.libur ? 'Libur' : tanggalPendek(todayISO());

  const harian = [
    ['Hadir', 'H'],
    ['Terlambat', 'T'],
    ['Pulang', 'P'],
    ['Izin', 'I'],
    ['Sakit', 'S'],
    ['Absen', 'A']
  ].filter(([k]) => (ringkas?.counts?.[k] || 0) > 0);

  const strip = (peta || []).slice(-10).map((p) => ({
    iso: p.iso,
    status: p.status,
    label: tanggalPendek(p.iso),
    hariIni: p.iso === todayISO()
  }));

  const sisa = Number(tagihanRingkas?.totalSisa || 0);
  const tagihanNilai = sisa > 0 ? rupiah(sisa) : 'Lunas';
  const tagihanHint = sisa > 0 ? `${tagihanRingkas?.jumlahBelum || 0} tagihan` : 'Tidak ada tunggakan';

  return (
    <section className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#fbbf24_0%,#f59e0b_32%,#ea580c_68%,#c2410c_100%)] p-4 text-white shadow-[0_24px_60px_-22px_rgba(194,65,12,.6)] sm:p-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        aria-hidden="true"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,.16) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
          maskImage: 'linear-gradient(to bottom, #000 0%, transparent 72%)',
          WebkitMaskImage: 'linear-gradient(to bottom, #000 0%, transparent 72%)'
        }}
      />
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/20 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-28 -left-16 h-64 w-64 rounded-full bg-amber-200/25 blur-3xl" aria-hidden="true" />

      <div className="relative space-y-4 sm:space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/90 backdrop-blur-sm">
              <Sparkles className="h-3 w-3" aria-hidden="true" /> Portal keluarga
            </span>
            <h1 className="mt-2 text-lg font-black leading-tight sm:text-xl">
              {sapaan}
              {user?.display_name ? `, ${String(user.display_name).split(' ')[0]}` : ''}
            </h1>
            <p className="mt-0.5 text-xs text-white/80">
              {selected ? `Ringkasan ${namaPanggilan(selected)} hari ini dan bulan berjalan.` : 'Ringkasan anak Anda.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenKabar}
            aria-label="Kabar terbaru"
            className="relative inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-white/25 bg-white/15 px-3 text-xs font-black text-white backdrop-blur-sm transition-colors hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <Bell className="h-4 w-4" aria-hidden="true" />
            <span className="hidden xs:inline">Kabar</span>
            {unread > 0 ? (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-white px-1 text-[10px] font-black tabular-nums text-orange-700">
                {unread}
              </span>
            ) : null}
            {unread > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-white motion-safe:animate-pulse" aria-hidden="true" />
            ) : null}
          </button>
        </div>

        <RailAnak siswa={siswa} selected={selected} onSelect={onSelect} />

        {selected ? (
          <div className="grid gap-4 lg:grid-cols-[340px_1fr] lg:items-stretch">
            <div className="relative flex min-h-[320px] flex-col justify-end overflow-hidden rounded-2xl border border-white/20 shadow-[0_18px_44px_rgba(60,20,6,.38)] sm:min-h-[380px]">
              {selected.foto ? (
                <img
                  src={selected.foto}
                  alt={`Foto ${selected.nama}`}
                  loading="eager"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover object-[center_18%] motion-safe:transition-transform motion-safe:duration-700 hover:scale-[1.04]"
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center" aria-hidden="true">
                  <span className="text-7xl font-black text-white/20">{inisial(selected.nama)}</span>
                </div>
              )}

              {/* Selubung: transparan di atas, menyatu solid ke bawah — foto jadi
                  latar kartu tanpa kotak/tepi, teks duduk di atas selubung. */}
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 top-[46%] bg-[linear-gradient(to_top,rgba(58,18,6,.98)_0%,rgba(88,28,10,.92)_48%,rgba(120,53,15,0)_100%)]"
                aria-hidden="true"
              />
              <div
                className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(58,18,6,.5),transparent_58%)]"
                aria-hidden="true"
              />

              <div className="relative space-y-2 p-4">
                <div className="flex flex-wrap gap-1.5">
                  {selected.rombel_nama ? <InfoChip icon={GraduationCap}>Kelas {selected.rombel_nama}</InfoChip> : null}
                  {selected.cabang_nama ? <InfoChip icon={MapPin}>{selected.cabang_nama}</InfoChip> : null}
                  {selected.paket ? <InfoChip icon={Award}>{String(selected.paket).toUpperCase()}</InfoChip> : null}
                </div>
                <h2 className="text-2xl font-black leading-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,.4)] sm:text-3xl">
                  {selected.nama}
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${ui.pill}`}
                  >
                    <span className={`h-2 w-2 rounded-full ${ui.dot}`} aria-hidden="true" />
                    {hariIniLabel}
                  </span>
                  <span className="text-[11px] font-semibold text-white/85">
                    {hariIni?.libur ? `Libur: ${hariIni.judulLibur || 'kegiatan yayasan'}` : tanggalPanjang(todayISO())}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex h-full flex-col gap-3 rounded-2xl border border-white/25 bg-white/12 p-4 backdrop-blur-md">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-white/80">Kehadiran bulan ini</span>
                <span className="text-[10px] font-bold tabular-nums text-white/70">{ringkas?.hari || 0} hari sekolah</span>
              </div>

              <div className="flex flex-1 items-center gap-4">
                <ProgressRing
                  value={muatKehadiran ? 0 : ringkas?.persen || 0}
                  size={124}
                  stroke={11}
                  tone="#ffffff"
                  track="rgba(255,255,255,.25)"
                >
                  <div>
                    <div className="text-2xl font-black leading-none tabular-nums">
                      {muatKehadiran ? '—' : `${ringkas?.persen || 0}%`}
                    </div>
                    <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-white/75">hadir</div>
                  </div>
                </ProgressRing>

                <div className="min-w-0 flex-1">
                  {muatKehadiran ? (
                    <div className="grid grid-cols-2 gap-2" aria-hidden="true">
                      {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="h-11 animate-pulse rounded-xl bg-white/20" />
                      ))}
                    </div>
                  ) : harian.length ? (
                    <div className="grid grid-cols-2 gap-2">
                      {harian.map(([kunci, huruf]) => (
                        <div key={kunci} className="rounded-xl border border-white/15 bg-white/10 px-2.5 py-1.5">
                          <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wide text-white/70">
                            <span className={`h-1.5 w-1.5 rounded-full ${statusUI(kunci).dot}`} aria-hidden="true" />
                            <span className={KOTAK_KECIL[kunci] || 'text-white/90'}>{statusUI(kunci).label}</span>
                            <span className="sr-only">({huruf})</span>
                          </div>
                          <div className="mt-0.5 text-base font-black leading-none tabular-nums text-white">
                            {ringkas?.counts?.[kunci] || 0}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] font-semibold text-white/85">Belum ada catatan kehadiran bulan ini.</p>
                  )}

                  {strip.length ? (
                    <div className="mt-2.5">
                      <div className="text-[9px] font-black uppercase tracking-wider text-white/55">10 hari terakhir</div>
                      <WeekStrip items={strip} className="mt-1" />
                    </div>
                  ) : null}
                </div>
              </div>

              <p className="text-[10px] leading-snug text-white/60">
                Hadir + terlambat + pulang dihitung hadir. Tanpa catatan dihitung belum hadir.
              </p>

              <div className="grid grid-cols-3 gap-2 border-t border-white/20 pt-3">
                <QuickFact
                  icon={CalendarCheck}
                  label="Hari ini"
                  value={akhirPekan ? 'Libur' : hariIniLabel}
                  hint={hariIniHint}
                />
                <QuickFact
                  icon={NotebookPen}
                  label="Catatan"
                  value={catatanTerakhir ? tanggalPendek(catatanTerakhir.tanggal) : 'Belum ada'}
                  hint={catatanTerakhir ? 'terakhir dibagikan' : 'menunggu guru'}
                />
                <QuickFact icon={Wallet} label="Tagihan" value={tagihanNilai} hint={tagihanHint} />
              </div>
            </div>
          </div>
        ) : null}

        {selected?.gurus?.length ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-white/20 pt-3">
            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-white/75">
              <Users className="h-3 w-3" aria-hidden="true" /> Guru kelas
            </span>
            {selected.gurus.map((g) => (
              <span
                key={g.id}
                className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/12 py-1 pl-1 pr-2 text-[11px] font-bold text-white"
              >
                <Avatar nama={g.display_name} url={g.foto} size="xs" />
                {g.display_name}
                <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-black uppercase">
                  {g.role === 'utama' ? 'Wali kelas' : 'Bantu'}
                </span>
                {g.no_wa ? (
                  <a
                    href={`https://wa.me/${String(g.no_wa).replace(/\D/g, '').replace(/^0/, '62')}`}
                    target="_blank"
                    rel="noreferrer"
                    title={`Chat WhatsApp ${g.display_name}`}
                    className="grid h-6 w-6 place-items-center rounded-full bg-white/25 hover:bg-white/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    <MessageCircle className="h-3 w-3" aria-hidden="true" />
                    <span className="sr-only">Chat WhatsApp {g.display_name}</span>
                  </a>
                ) : null}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
