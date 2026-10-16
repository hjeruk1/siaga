/**
 * ActionCard — kartu aksi di dashboard Ringkasan ("Catat Pembayaran", "Generate
 * Tagihan", "Kelola Tarif"). Menggantikan 3 blok kartu berulang di BillingTab.jsx.
 * `tone="primary"` memberi aksen warna brand + efek hover, sisanya netral.
 *
 * Diringkas agar tiga kartu pas dalam satu baris desktop dan tetap nyaman
 * disentuh di mobile (ikon 36px, judul 13px, subjudul 10px).
 */
export function ActionCard({ icon: Icon, title, subtitle, onClick, tone = 'slate' }) {
  const isPrimary = tone === 'primary';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition active:scale-[0.99] ${
        isPrimary ? 'hover:border-primary/30 hover:bg-primary-container/40' : 'hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          isPrimary ? 'bg-primary/10' : 'bg-slate-100'
        }`}
      >
        <Icon className={`h-4 w-4 ${isPrimary ? 'text-primary' : 'text-slate-500'}`} />
      </div>
      <div className="min-w-0">
        <div
          className={`truncate text-[13px] font-black leading-tight transition ${
            isPrimary ? 'text-text-main group-hover:text-primary' : 'text-text-main'
          }`}
        >
          {title}
        </div>
        <div className="mt-0.5 truncate text-[10px] leading-tight text-slate-400">{subtitle}</div>
      </div>
    </button>
  );
}
