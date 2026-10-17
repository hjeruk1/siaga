// Primitif tampilan Portal Wali. Semua warna status/label datang dari
// portalHelpers supaya tidak ada perakitan kelas Tailwind di beberapa tempat.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Copy, FileText, Hourglass, RefreshCw, X } from 'lucide-react';
import { inisial, nadaAvatar, statusUI } from './portalHelpers.js';

export function Avatar({ nama, url, size = 'md', ring = false, className = '' }) {
  const px = { xs: 'w-8 h-8 text-[11px]', sm: 'w-9 h-9 text-xs', md: 'w-11 h-11 text-sm', lg: 'w-14 h-14 text-lg', xl: 'w-24 h-24 text-3xl' }[
    size
  ];
  const base = `${px} shrink-0 rounded-full object-cover ${className}`;
  if (url) {
    return (
      <img
        src={url}
        alt={nama ? `Foto ${nama}` : 'Foto anak'}
        loading="lazy"
        decoding="async"
        className={`${base} ${ring ? 'ring-4 ring-white/70 shadow-lg' : 'border border-slate-200/70'}`}
      />
    );
  }
  return (
    <span
      className={`${px} shrink-0 rounded-full font-black grid place-items-center ${nadaAvatar(
        nama
      )} ${ring ? 'ring-4 ring-white/70 shadow-lg' : 'border border-black/5'} ${className}`}
      aria-hidden="true"
    >
      {inisial(nama)}
    </span>
  );
}

export function Pill({ children, tone = 'bg-slate-100 text-slate-600 border-slate-200', icon: Icon, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${tone} ${className}`}
    >
      {Icon ? <Icon className="w-3 h-3" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export function Card({ children, className = '', as: Tag = 'section' }) {
  return (
    <Tag className={`bg-white border border-slate-200 rounded-2xl shadow-[0_10px_30px_rgba(15,23,42,.05)] ${className}`}>
      {children}
    </Tag>
  );
}

export function SectionTitle({ icon: Icon, children, hint, action }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-text-main">
          {Icon ? <Icon className="w-4 h-4 text-slate-400" aria-hidden="true" /> : null}
          {children}
        </h2>
        {hint ? <p className="mt-1 text-xs text-slate-500 leading-relaxed">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function StatTile({ label, value, hint, icon: Icon, tone = 'text-text-main' }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4">
      <div className="flex items-center gap-2">
        {Icon ? <Icon className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" /> : null}
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</span>
      </div>
      <div className={`mt-1.5 text-xl sm:text-2xl font-black tabular-nums leading-none ${tone}`}>{value}</div>
      {hint ? <div className="mt-1.5 text-[11px] font-semibold text-slate-400">{hint}</div> : null}
    </div>
  );
}

// Cincin persentase. Radius dihitung dari ukuran supaya tidak ada angka ajaib
// yang harus dijaga bersamaan dengan perubahan ukuran.
export function ProgressRing({ value = 0, size = 116, stroke = 10, children, tone = '#f59e0b', track = 'rgba(255,255,255,.28)' }) {
  const r = (size - stroke) / 2;
  const keliling = 2 * Math.PI * r;
  const isi = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={keliling}
          strokeDashoffset={keliling - (isi / 100) * keliling}
          className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-700"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse rounded-xl bg-slate-200/70 ${className}`} aria-hidden="true" />;
}

export function EmptyState({ icon: Icon = FileText, title, desc, action, tone = 'text-slate-300' }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-5 py-8 text-center">
      <Icon className={`mx-auto w-7 h-7 ${tone}`} aria-hidden="true" />
      <div className="mt-2.5 text-sm font-black text-text-main">{title}</div>
      {desc ? <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-500">{desc}</p> : null}
      {action ? <div className="mt-3.5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title = 'Gagal memuat data', desc, onRetry }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-6 text-center">
      <AlertCircle className="mx-auto w-6 h-6 text-red-500" aria-hidden="true" />
      <div className="mt-2 text-sm font-black text-red-700">{title}</div>
      {desc ? <p className="mx-auto mt-1 max-w-sm text-xs text-red-600">{desc}</p> : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 text-xs font-black text-red-600 hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Coba lagi
        </button>
      ) : null}
    </div>
  );
}

// Rail tab dengan indikator geser (sliding pill). Bisa digeser di layar sempit
// (.rail-scroll menyembunyikan scrollbar). Panah kiri/kanan berpindah tab dan
// tab aktif otomatis digulir ke tengah.
export function SegmentedTabs({ tabs, value, onChange, ariaLabel = 'Pilih bagian' }) {
  const ref = useRef(null);
  const btnRefs = useRef({});
  const [pill, setPill] = useState({ left: 0, width: 0, siap: false });

  useLayoutEffect(() => {
    const el = btnRefs.current[value];
    if (!el) return;
    const next = { left: el.offsetLeft, width: el.offsetWidth, siap: true };
    setPill((p) => (p.left === next.left && p.width === next.width && p.siap ? p : next));
  }, [value, tabs.length]);

  useEffect(() => {
    btnRefs.current[value]?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [value]);

  function pindah(arah) {
    const idx = tabs.findIndex((t) => t.id === value);
    const next = tabs[(idx + arah + tabs.length) % tabs.length];
    if (next) onChange(next.id);
  }

  function tombol(index) {
    const tab = tabs[index];
    if (!tab) return;
    onChange(tab.id);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="Bagian sebelumnya"
        onClick={() => pindah(-1)}
        className="hidden h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white/90 text-slate-500 shadow-sm backdrop-blur transition-colors hover:text-text-main md:grid"
      >
        <span aria-hidden="true">‹</span>
      </button>
      <div
        ref={ref}
        role="tablist"
        aria-label={ariaLabel}
        className="rail-scroll relative flex flex-1 gap-1.5 rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-[0_6px_20px_rgba(15,23,42,.05)] backdrop-blur"
        onKeyDown={(e) => {
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
          const idx = tabs.findIndex((t) => t.id === value);
          e.preventDefault();
          tombol((idx + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length);
        }}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-1.5 top-1.5 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-[0_6px_16px_rgba(234,88,12,.35)] transition-[left,width,opacity] duration-300 ease-out"
          style={{ left: pill.left, width: pill.width, opacity: pill.siap ? 1 : 0 }}
        />
        {tabs.map((t) => {
          const Icon = t.icon;
          const aktif = t.id === value;
          return (
            <button
              key={t.id}
              ref={(el) => {
                btnRefs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={aktif}
              aria-controls={`panel-${t.id}`}
              tabIndex={aktif ? 0 : -1}
              onClick={() => onChange(t.id)}
              className={`relative z-10 flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-[11px] font-black transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:px-3 sm:text-xs ${
                aktif ? 'text-white' : 'text-slate-500 hover:bg-slate-100/80 hover:text-text-main'
              }`}
            >
              {Icon ? <Icon className="hidden h-3.5 w-3.5 sm:block" aria-hidden="true" /> : null}
              {t.label}
              {t.badge ? (
                <span
                  className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-black tabular-nums ${
                    aktif ? 'bg-white/25 text-white' : 'bg-red-500 text-white'
                  }`}
                >
                  {t.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        aria-label="Bagian berikutnya"
        onClick={() => pindah(1)}
        className="hidden h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white/90 text-slate-500 shadow-sm backdrop-blur transition-colors hover:text-text-main md:grid"
      >
        <span aria-hidden="true">›</span>
      </button>
    </div>
  );
}

// Strip kehadiran ringkas: satu kotak per hari sekolah, diwarnai statusnya.
// Dipakai hero supaya orang tua melihat pola kehadiran sekilas, bukan hanya %.
export function WeekStrip({ items = [], className = '' }) {
  if (!items.length) return null;
  return (
    <div className={`flex items-end gap-1 ${className}`} role="img" aria-label="Pola kehadiran beberapa hari terakhir">
      {items.map((it) => {
        const ui = statusUI(it.status);
        return (
          <span
            key={it.iso || it.hari}
            title={`${it.label || it.iso}: ${ui.label}`}
            className={`h-6 w-2.5 rounded-full ${it.status === 'Belum' ? 'bg-white/25' : ui.dot} ${
              it.hariIni ? 'ring-2 ring-white ring-offset-2 ring-offset-transparent' : ''
            }`}
            aria-hidden="true"
          />
        );
      })}
    </div>
  );
}

// Panel geser (kabar terbaru). Desktop: sheet kanan. Mobile: sheet bawah.
export function Sheet({ open, onClose, title, subtitle, children, footer }) {
  const tutupRef = useRef(null);
  const [tampil, setTampil] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    setTampil(true);
    const t = setTimeout(() => tutupRef.current?.focus(), 30);
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);

  if (!open && !tampil) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70]" role="presentation">
      <button
        type="button"
        aria-label="Tutup kabar"
        onClick={onClose}
        className={`absolute inset-0 bg-slate-900/50 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`absolute bg-white shadow-2xl transition-transform duration-300 ease-out inset-x-0 bottom-0 max-h-[85dvh] rounded-t-3xl sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[420px] sm:max-h-none sm:rounded-none sm:rounded-l-3xl ${
          open ? 'translate-y-0 sm:translate-x-0' : 'translate-y-full sm:translate-y-0 sm:translate-x-full'
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
          <div className="min-w-0">
            <h2 className="text-base font-black text-text-main">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
          </div>
          <button
            ref={tutupRef}
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <div className="max-h-[70dvh] overflow-y-auto p-4 sm:max-h-[calc(100dvh-140px)] custom-scrollbar">{children}</div>
        {footer ? <div className="border-t border-slate-200 p-3">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}

export function Lightbox({ gambar, onClose }) {
  useEffect(() => {
    if (!gambar) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [gambar, onClose]);

  if (!gambar) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/85 p-4" role="dialog" aria-modal="true" aria-label="Pratinjau foto">
      <button type="button" aria-label="Tutup pratinjau" onClick={onClose} className="absolute inset-0" />
      <figure className="relative max-h-full w-full max-w-3xl">
        <img src={gambar.url} alt={gambar.filename || 'Foto kegiatan'} className="mx-auto max-h-[80dvh] rounded-2xl object-contain" />
        <figcaption className="mt-3 flex items-center justify-between gap-3 text-xs font-semibold text-white/80">
          <span className="truncate">{gambar.filename || 'Foto kegiatan'}</span>
          <a href={gambar.url} target="_blank" rel="noreferrer" className="shrink-0 underline decoration-white/40 hover:text-white">
            Buka di tab baru
          </a>
        </figcaption>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup"
          className="absolute -top-2 right-0 grid h-9 w-9 place-items-center rounded-xl bg-white/15 text-white hover:bg-white/25"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </figure>
    </div>,
    document.body
  );
}

// Tombol kecil dengan status salin. Dipakai untuk ringkasan kehadiran agar
// orang tua bisa menempelkannya ke WhatsApp tanpa perlu mengunduh apa pun.
export function CopyButton({ teks, label = 'Salin ringkasan', toast, className = '' }) {
  const [salin, setSalin] = useState(false);
  async function jalan() {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(teks);
      else {
        const ta = document.createElement('textarea');
        ta.value = teks;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      setSalin(true);
      toast?.('ok', 'Ringkasan disalin');
      setTimeout(() => setSalin(false), 2000);
    } catch {
      toast?.('err', 'Gagal menyalin. Salin manual dari kotak ringkasan.');
    }
  }
  return (
    <button
      type="button"
      onClick={jalan}
      className={`inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${className}`}
    >
      {salin ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
      {salin ? 'Tersalin' : label}
    </button>
  );
}

export function InfoNote({ children, icon: Icon = AlertCircle, tone = 'border-slate-200 bg-slate-50 text-slate-600' }) {
  return (
    <p className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[11px] leading-relaxed ${tone}`}>
      <Icon className="mt-0.5 w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export { Hourglass };
