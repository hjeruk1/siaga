// Tumpukan avatar guru pada kartu rombel.
//
// Dipisahkan dari BillingTab.jsx karena ikut dipakai RombelTab.jsx — menaruhnya
// di BillingTab membuat Rombel bergantung pada berkas 2700 baris hanya untuk
// mengambil satu komponen kecil.
import { StudentAvatar } from '../AdminShared';

export function GuruAvatarStack({ gurus, onSelect }) {
  const visible = gurus.slice(0, 3);
  const extra = Math.max(0, gurus.length - visible.length);
  if (!gurus.length) return <div className="text-xs italic text-slate-400">Belum ada guru</div>;
  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {visible.map((g) => {
          const title = `${g.display_name} - ${g.role === 'utama' ? 'Utama' : 'Bantu'}`;
          return (
            <button
              key={g.id}
              type="button"
              title={title}
              onClick={() => onSelect(g)}
              className={`relative rounded-lg ring-2 ring-white transition hover:z-10 hover:-translate-y-0.5 ${g.role === 'utama' ? 'ring-amber-200' : ''}`}
            >
              <StudentAvatar name={g.display_name} url={g.foto} size="sm" />
              {g.role === 'utama' && (
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-primary" />
              )}
            </button>
          );
        })}
        {extra > 0 && (
          <div
            title={gurus
              .slice(3)
              .map((g) => `${g.display_name} (${g.role})`)
              .join(', ')}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-200 text-xs font-black text-slate-600 ring-2 ring-white"
          >
            +{extra}
          </div>
        )}
      </div>
    </div>
  );
}
