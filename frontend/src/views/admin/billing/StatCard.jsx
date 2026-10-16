/**
 * StatCard — kartu metrik ringkas di dashboard Ringkasan dan mini-dashboard
 * Tagihan. Satu komponen bertema seragam untuk menggantikan 8 blok kartu yang
 * dulu diduplikasi di BillingTab.jsx.
 *
 * Tampilan sengaja dipadatkan: ikon kecil + label uppercase 10px + nilai tebal,
 * sehingga 4 kartu tetap terbaca di layar 390px tanpa label terpotong.
 * `tone` mengontrol warna aksen ikon + nilai. `progress` (0-100) menampilkan
 * bilah rasio koleksi. `size="sm"` dipakai di mini-dashboard yang lebih padat.
 */
const TONES = {
  slate: { iconWrap: 'bg-slate-100', icon: 'text-slate-500', value: 'text-text-main' },
  emerald: { iconWrap: 'bg-emerald-50', icon: 'text-emerald-600', value: 'text-emerald-600' },
  amber: { iconWrap: 'bg-amber-50', icon: 'text-amber-600', value: 'text-amber-600' },
  primary: { iconWrap: 'bg-primary-container', icon: 'text-primary', value: 'text-primary' }
};

export function StatCard({ icon: Icon, label, value, hint, tone = 'slate', progress, size = 'lg' }) {
  const t = TONES[tone] || TONES.slate;
  const isLg = size === 'lg';
  const wrap = 'flex flex-col rounded-xl border border-slate-200/80 bg-white shadow-sm';
  const pad = isLg ? 'p-3 sm:p-3.5' : 'p-2.5';
  const iconBox = isLg ? 'w-7 h-7 rounded-lg' : 'w-6 h-6 rounded-md';
  const iconSize = isLg ? 'w-4 h-4' : 'w-3.5 h-3.5';
  const valueSize = isLg ? 'text-base sm:text-xl' : 'text-sm sm:text-lg';
  const labelGap = isLg ? 'mb-2' : 'mb-1.5';

  return (
    <div className={`${wrap} ${pad}`}>
      <div className={`flex items-center gap-2 ${labelGap}`}>
        <div className={`${iconBox} ${t.iconWrap} flex items-center justify-center shrink-0`}>
          <Icon className={`${iconSize} ${t.icon}`} />
        </div>
        <span className="min-w-0 truncate text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</span>
      </div>
      <div className={`${valueSize} font-black ${t.value} tabular-nums leading-none`}>{value}</div>
      {progress != null && (
        <div className={`mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-100`}>
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      )}
      {hint && <div className="mt-1.5 text-[10px] leading-tight text-slate-400">{hint}</div>}
    </div>
  );
}
