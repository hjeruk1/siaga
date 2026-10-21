// Tampilan satu catatan harian untuk orang tua: ringkasan hari, kegiatan,
// penilaian, observasi guru, foto kegiatan, dan ruang tanggapan.
import { useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  BookOpen,
  CalendarDays,
  ChevronDown,
  Heart,
  Image as ImageIcon,
  Info,
  MessageSquare,
  Moon,
  Palette,
  Pencil,
  Send,
  Sparkles,
  Sun,
  Utensils,
  Users as UsersIcon
} from 'lucide-react';
import { Avatar, Card, InfoNote, Lightbox, Pill } from './ui.jsx';
import {
  adaPenilaian,
  daftarPenilaian,
  hariPanjang,
  ikonAktivitas,
  lampiranDokumen,
  lampiranGambar,
  makanUI,
  moodUI,
  ratingUI,
  tanggalPanjang,
  waktuRelatif
} from './portalHelpers.js';

const IKON = {
  palette: Palette,
  activity: Activity,
  book: BookOpen,
  pencil: Pencil,
  users: UsersIcon,
  utensils: Utensils,
  moon: Moon,
  heart: Heart,
  sun: Sun,
  sparkles: Sparkles
};

function Baris({ label, nilai, tone }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
      <span className="text-[11px] font-black uppercase tracking-wide text-slate-400">{label}</span>
      <Pill tone={tone}>{nilai}</Pill>
    </div>
  );
}

// Pedoman istilah dilipat agar tidak mendominasi halaman, tetapi tetap bisa
// dibuka tepat saat orang tua membaca istilah yang tidak ia kenal.
function PanduanIstilah() {
  const [buka, setBuka] = useState(false);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setBuka((v) => !v)}
        aria-expanded={buka}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-text-main">
          <Info className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
          Arti istilah di catatan ini
        </span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${buka ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {buka ? (
        <div className="grid gap-4 border-t border-slate-200 px-4 py-4 text-[11px] leading-relaxed text-slate-600 sm:grid-cols-3">
          <div>
            <div className="mb-1.5 font-black text-slate-700">Mood harian</div>
            <p>
              <b>Ceria</b> aktif dan gembira, <b>Biasa</b> stabil, <b>Rewel</b> murung atau butuh perhatian ekstra.
            </p>
          </div>
          <div>
            <div className="mb-1.5 font-black text-slate-700">Konsumsi makan</div>
            <p>
              <b>Habis</b> porsi penuh, <b>Setengah</b> separuh porsi, <b>Tidak</b> menolak atau sangat sedikit.
            </p>
          </div>
          <div>
            <div className="mb-1.5 font-black text-slate-700">Status perkembangan</div>
            <p>
              <b>BB</b> belum berkembang, <b>MB</b> mulai berkembang, <b>BSH</b> sesuai harapan, <b>BSB</b> sangat baik.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function CatatanDetail({
  detail,
  komentarList = [],
  komentar,
  setKomentar,
  onKirim,
  mengirim = false,
  onBack
}) {
  const [pratinjau, setPratinjau] = useState(null);
  const mood = moodUI(detail?.mood);
  const makan = makanUI(detail?.makan);
  const penilaian = useMemo(() => daftarPenilaian(detail?.structured_observation), [detail?.structured_observation]);
  const foto = lampiranGambar(detail?.attachments);
  const dokumen = lampiranDokumen(detail?.attachments);
  const aktivitas = detail?.aktivitas || [];

  if (!detail) return null;

  return (
    <Card className="overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:hidden"
              aria-label="Kembali ke daftar catatan"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            </button>
          ) : null}
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-black text-text-main">
              <CalendarDays className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              <span className="truncate">{tanggalPanjang(detail.tanggal)}</span>
            </div>
            <p className="mt-0.5 truncate text-[11px] text-slate-500">
              {hariPanjang(detail.tanggal)} • {detail.rombel_nama}
              {detail.guru_nama ? ` • ${detail.guru_nama}` : ''}
            </p>
          </div>
        </div>
        <Pill tone="bg-primary-container text-primary border-transparent">Dibagikan</Pill>
      </header>

      <div className="space-y-4 p-4">
        {detail.focus_theme_title ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-amber-700">
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> Tema hari ini
            </div>
            <div className="mt-1.5 text-sm font-black text-text-main">{detail.focus_theme_title}</div>
            {detail.focus_theme_activity_summary ? (
              <p className="mt-1 text-xs leading-relaxed text-slate-600">{detail.focus_theme_activity_summary}</p>
            ) : null}
            {detail.focus_theme_menu_makanan ? (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                <Utensils className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" /> Menu:{' '}
                {detail.focus_theme_menu_makanan}
              </p>
            ) : null}
            {detail.modul_ajar_title ? (
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-amber-700/80">
                Modul: {detail.modul_ajar_title}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-3">
          <Baris label="Mood" nilai={mood ? mood.label : '-'} tone={mood?.tone} />
          <Baris label="Makan" nilai={makan ? makan.label : '-'} tone={makan?.tone} />
          <Baris
            label="Tidur"
            nilai={detail.tidur === 1 ? 'Tidur' : detail.tidur === 0 ? 'Tidak tidur' : '-'}
            tone="bg-slate-100 text-slate-600 border-slate-200"
          />
        </div>

        {aktivitas.length ? (
          <div>
            <div className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-400">Kegiatan hari ini</div>
            <ul className="flex flex-wrap gap-2">
              {aktivitas.map((nama, i) => {
                const Ikon = IKON[ikonAktivitas(nama)] || Sparkles;
                return (
                  <li
                    key={`${nama}-${i}`}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700"
                  >
                    <Ikon className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
                    {nama}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {adaPenilaian(detail.structured_observation) ? (
          <div>
            <div className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
              Penilaian perkembangan
            </div>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {penilaian.map((p, i) => {
                const r = ratingUI(p.rating);
                return (
                  <li
                    key={`${p.grup}-${p.label}-${i}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-bold text-text-main">{p.label}</span>
                      <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">{p.grup}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <Pill tone={r?.tone}>{r?.singkat || p.rating}</Pill>
                      <span className="mt-1 block text-[10px] text-slate-400">{r?.label || ''}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {detail.observation_note ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Observasi guru{detail.observation_domain ? ` • ${detail.observation_domain}` : ''}
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{detail.observation_note}</p>
          </div>
        ) : null}

        {detail.catatan ? (
          <div>
            <div className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400">Catatan guru</div>
            <p className="text-sm leading-relaxed text-slate-700">{detail.catatan}</p>
          </div>
        ) : null}

        {detail.parent_note ? (
          <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-3.5">
            <div className="text-[10px] font-black uppercase tracking-wider text-sky-700">Pesan untuk orang tua</div>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{detail.parent_note}</p>
          </div>
        ) : null}

        {foto.length ? (
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
              <ImageIcon className="w-3.5 h-3.5" aria-hidden="true" /> Foto kegiatan ({foto.length})
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {foto.map((f) => (
                <button
                  key={f.id || f.url}
                  type="button"
                  onClick={() => setPratinjau(f)}
                  className="group relative aspect-square overflow-hidden rounded-2xl border border-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <img
                    src={f.url}
                    alt={f.filename || `Foto kegiatan ${detail.tanggal}`}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-105"
                  />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {dokumen.length ? (
          <ul className="space-y-1.5">
            {dokumen.map((d) => (
              <li key={d.id || d.url}>
                <a
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  <BookOpen className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                  {d.filename || 'Lampiran'}
                </a>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="rounded-2xl border border-slate-200 p-3.5">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
            <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" /> Tanggapan ({komentarList.length})
          </div>
          {komentarList.length ? (
            <ul className="space-y-2">
              {komentarList.map((c) => {
                const wali = c.author_role === 'wali';
                return (
                  <li key={c.id} className={`flex gap-2 ${wali ? 'justify-end' : ''}`}>
                    <div className={`max-w-[85%] ${wali ? 'order-2' : ''}`}>
                      <div
                        className={`rounded-2xl px-3 py-2 text-xs leading-relaxed ${wali ? 'bg-primary-container text-text-main' : 'bg-slate-100 text-slate-700'}`}
                      >
                        {c.body}
                      </div>
                      <div className={`mt-1 text-[10px] font-semibold text-slate-400 ${wali ? 'text-right' : ''}`}>
                        {c.author_name} • {waktuRelatif(c.created_at)}
                      </div>
                    </div>
                    {!wali ? <Avatar nama={c.author_name} size="xs" /> : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-slate-500">
              Belum ada tanggapan. Tulis pertanyaan atau apresiasi untuk guru {detail.guru_nama || 'kelas'}.
            </p>
          )}

          <form
            className="mt-3 flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!komentar.trim() || mengirim) return;
              onKirim();
            }}
          >
            <label className="sr-only" htmlFor={`komentar-${detail.id}`}>
              Tulis tanggapan untuk guru
            </label>
            <textarea
              id={`komentar-${detail.id}`}
              value={komentar}
              onChange={(e) => setKomentar(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (komentar.trim() && !mengirim) onKirim();
                }
              }}
              rows={1}
              placeholder="Tulis tanggapan untuk guru…"
              className="min-h-[44px] flex-1 resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-text-main placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
            />
            <button
              type="submit"
              disabled={!komentar.trim() || mengirim}
              aria-label="Kirim tanggapan"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
            </button>
          </form>
          <InfoNote tone="border-slate-200 bg-slate-50 text-slate-500">
            Tanggapan Anda dibaca wali kelas pada aplikasi guru. Tekan Enter untuk mengirim, Shift+Enter untuk baris
            baru.
          </InfoNote>
        </div>

        <PanduanIstilah />
      </div>

      <Lightbox gambar={pratinjau} onClose={() => setPratinjau(null)} />
    </Card>
  );
}
