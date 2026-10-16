import { useEffect, useState } from 'react';
import { api } from '../../api';
import { IconButton, CustomSelect, CustomDatePicker, CustomTimePicker } from '../../components/Shared';
import {
  Banknote,
  Check,
  CreditCard,
  ImagePlus,
  Pencil,
  Power,
  PowerOff,
  RotateCcw,
  Settings,
  Smartphone,
  Trash2,
  Users,
  Wallet
} from 'lucide-react';

export function useMaster(user, { autoDefaultCabang = false } = {}) {
  const [cabang, setCabang] = useState([]),
    [jenjang, setJenjang] = useState([]),
    [rombel, setRombel] = useState([]);
  const [cabangId, setCabangId] = useState(user.role === 'admin' ? '' : user.cabang_id);
  async function load() {
    const [c, j] = await Promise.all([api.cabang(), api.jenjang()]);
    setCabang(c);
    setJenjang(j);
    const preferred = c.find((x) => x.kode === 'GDN' && x.aktif) || c.find((x) => x.aktif) || c[0];
    const cid = cabangId || (autoDefaultCabang ? preferred?.id : '');
    if (user.role === 'admin' && !cabangId && cid) setCabangId(cid);
    setRombel(await api.rombel(cid));
  }
  useEffect(() => {
    load().catch(() => {});
  }, [cabangId]);
  return { cabang, jenjang, rombel, cabangId, setCabangId, load };
}

export function StudentAvatar({ name, url, size = 'md' }) {
  const boxClass =
    size === 'xl'
      ? 'w-32 h-32 sm:w-36 sm:h-36 rounded-2xl'
      : size === 'lg'
        ? 'w-12 h-12 rounded-xl'
        : 'w-9 h-9 rounded-lg';
  const textClass = size === 'xl' ? 'text-4xl' : size === 'lg' ? 'text-lg' : 'text-xs';

  if (url) {
    return (
      <img
        src={url}
        className={`${boxClass} object-cover border border-slate-200/60 shadow-sm`}
        alt={name}
        loading="lazy"
        decoding="async"
      />
    );
  }

  const parts = name.trim().split(/\s+/);
  const initials =
    parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : parts[0] ? parts[0][0].toUpperCase() : '?';

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    'bg-blue-50 text-blue-600 border-blue-100',
    'bg-emerald-50 text-emerald-600 border-emerald-100',
    'bg-indigo-50 text-indigo-600 border-indigo-100',
    'bg-violet-50 text-violet-600 border-violet-100',
    'bg-amber-50 text-amber-600 border-amber-100',
    'bg-rose-50 text-rose-600 border-rose-100',
    'bg-cyan-50 text-cyan-600 border-cyan-100'
  ];
  const colorClass = colors[Math.abs(hash) % colors.length];

  return (
    <div className={`${boxClass} flex items-center justify-center font-black ${colorClass} border shadow-sm`}>
      <span className={textClass}>{initials}</span>
    </div>
  );
}

export function StatusBadge({ status }) {
  const config =
    {
      aktif: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
      lulus: 'bg-blue-50 text-blue-700 border-blue-200/80',
      keluar: 'bg-rose-50 text-rose-700 border-rose-200/80',
      undangan: 'bg-amber-50 text-amber-700 border-amber-200/80',
      nonaktif: 'bg-slate-100 text-slate-600 border-slate-200/80'
    }[status.toLowerCase()] || 'bg-slate-50 text-slate-600 border-slate-200';

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${config}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5 shrink-0" />
      <span className="capitalize">{status}</span>
    </span>
  );
}

export function StudentMetricGroup({ title, items }) {
  const gridCols = items.length >= 3 ? 'grid-cols-3' : 'grid-cols-2';
  return (
    <div className="rounded-lg sm:rounded-xl border border-slate-200 bg-white p-2 sm:p-3">
      <div className="mb-1.5 sm:mb-2 text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-slate-400">
        {title}
      </div>
      <div className={`grid ${gridCols} gap-1.5 sm:gap-2`}>
        {items.map((item) => (
          <div key={item.label} className="rounded-md sm:rounded-lg bg-slate-50 px-2 py-1.5 sm:px-3 sm:py-2">
            <div className="truncate text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-slate-400">
              {item.label}
            </div>
            <div className="mt-0.5 text-base sm:text-xl font-black leading-tight text-text-main">{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SiswaCard({ siswa, active, open }) {
  function activate(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open(siswa);
    }
  }
  return (
    <button
      type="button"
      onClick={() => open(siswa)}
      onKeyDown={activate}
      className={`w-full bg-white border rounded-xl p-3 flex gap-3 items-start text-left transition cursor-pointer active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 ${
        active ? 'border-primary ring-1 ring-primary' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <StudentAvatar name={siswa.nama} url={siswa.foto} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="min-w-0">
          <div className="font-black text-text-main text-sm truncate leading-tight" title={siswa.nama}>
            {siswa.nama}
          </div>
          <div className="mt-1">
            <StatusBadge status={siswa.status} />
          </div>
        </div>

        <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
          <span className="font-medium">NIS:</span>
          <span className="font-mono text-slate-700 font-bold">{siswa.nis || '-'}</span>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold text-slate-600">
          <span className="px-2 py-0.5 rounded bg-slate-50 border border-slate-100">{siswa.jenjang_nama}</span>
          <span className="px-2 py-0.5 rounded bg-slate-50 border border-slate-100">{siswa.rombel_nama}</span>
          <span className="px-2 py-0.5 rounded bg-slate-50 border border-slate-100 uppercase">{siswa.paket}</span>
        </div>
      </div>
      <div className="self-center pl-1 text-slate-400" aria-hidden="true">
        <Settings className="w-4 h-4" />
      </div>
    </button>
  );
}

export function StaffCard({ staff, onEdit, onReset, onStatusToggle, onDelete, canDelete }) {
  return (
    <div className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-3.5 flex gap-3 items-start transition shadow-sm">
      <StudentAvatar name={staff.display_name} url={staff.foto} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="font-bold text-text-main text-sm truncate leading-tight" title={staff.display_name}>
            {staff.display_name}
          </div>
          <StatusBadge status={staff.status} />
        </div>

        <div className="text-xs text-slate-500 mt-2 space-y-1">
          <div>
            <span className="font-medium text-slate-400">Username:</span>{' '}
            <span className="font-mono text-slate-700 font-bold">{staff.username}</span>
          </div>
          <div>
            <span className="font-medium text-slate-400">Role:</span>{' '}
            <span className="capitalize font-medium text-slate-600">{staff.role.replace('_', ' ')}</span>
          </div>
          <div>
            <span className="font-medium text-slate-400">Cabang:</span>{' '}
            <span className="font-medium text-slate-600">{staff.cabang_nama || 'Pusat'}</span>
          </div>
        </div>

        <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-2.5">
          <IconButton icon={Pencil} label={`Edit ${staff.display_name}`} onClick={() => onEdit(staff)} size="sm" />
          <IconButton icon={RotateCcw} label="Reset password" onClick={() => onReset(staff)} size="sm" />
          {staff.status === 'nonaktif' ? (
            <IconButton
              icon={Power}
              label="Aktifkan"
              onClick={() => onStatusToggle({ staff, status: 'aktif' })}
              size="sm"
            />
          ) : (
            <IconButton
              icon={PowerOff}
              label="Nonaktifkan"
              onClick={() => onStatusToggle({ staff, status: 'nonaktif' })}
              size="sm"
              variant="danger"
            />
          )}
          {canDelete && (
            <IconButton
              icon={Trash2}
              label={`Hapus permanen ${staff.display_name}`}
              onClick={() => onDelete(staff)}
              size="sm"
              variant="danger"
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function SiswaTable({ list, selected, open }) {
  const headers = [
    { label: 'Siswa', className: 'min-w-72 w-80' },
    { label: 'Cabang', className: 'w-36' },
    { label: 'Jenjang', className: 'w-28' },
    { label: 'Rombel', className: 'w-32' },
    { label: 'Paket', className: 'w-28' },
    { label: '', className: 'w-28 sticky right-0 z-10 bg-slate-50 border-l border-slate-200/80' }
  ];
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-100">
      <table className="w-full min-w-[820px] table-fixed text-sm">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th
                key={`${i}-${h.label || 'empty'}`}
                className={`text-left py-2 px-3 bg-slate-50 text-slate-500 font-black ${h.className}`}
              >
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {list.map((s) => {
            const active = selected?.id === s.id;
            const rowBg = active ? 'bg-primary-container' : 'bg-white';
            return (
              <tr key={s.id} className={active ? 'bg-primary-container' : ''}>
                <td className="py-2 px-3 text-slate-700">
                  <div className="flex items-center gap-3 min-w-0">
                    <StudentAvatar name={s.nama} url={s.foto} size="md" />
                    <div className="min-w-0">
                      <div className="font-black text-text-main truncate" title={s.nama}>
                        {s.nama}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <StatusBadge status={s.status} />
                        <span className="font-mono text-xs font-bold text-slate-500 truncate" title={s.nis || '-'}>
                          {s.nis || '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                </td>
                <td className="py-2 px-3 text-slate-600 truncate" title={s.cabang_nama}>
                  {s.cabang_nama}
                </td>
                <td className="py-2 px-3 text-slate-600 truncate" title={s.jenjang_nama}>
                  {s.jenjang_nama}
                </td>
                <td className="py-2 px-3 text-slate-600 truncate" title={s.rombel_nama}>
                  {s.rombel_nama}
                </td>
                <td className="py-2 px-3 text-slate-600 truncate" title={s.paket}>
                  {s.paket}
                </td>
                <td className={`py-2 px-3 sticky right-0 z-10 ${rowBg} border-l border-slate-200/80`}>
                  <IconButton icon={Settings} label={`Kelola ${s.nama}`} onClick={() => open(s)} size="sm" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function CabangFilter({ user, cabang, cabangId, setCabangId, className = '' }) {
  if (user.role !== 'admin') return null;
  const classes = className || 'w-full sm:w-56';
  return (
    <CustomSelect value={cabangId} onChange={(e) => setCabangId(e.target.value)} className={classes}>
      <option value="">Semua Cabang</option>
      {cabang.map((c) => (
        <option key={c.id} value={c.id}>
          {c.nama}
        </option>
      ))}
    </CustomSelect>
  );
}

export function BranchMetricRow({ title, total, items }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs">
      <div className="font-black text-text-main whitespace-nowrap">
        {title} <span className={total ? 'text-slate-600' : 'text-slate-400'}>({total})</span>
      </div>
      <div className="flex flex-wrap gap-x-2 gap-y-0.5 font-bold">
        {items.map(([label, value]) => (
          <span key={label} className={value ? 'text-slate-700' : 'text-slate-400'}>
            <span className="text-slate-400">{label}:</span> {value}
          </span>
        ))}
      </div>
    </div>
  );
}

export function WaliStatusBadge({ status }) {
  const t =
    {
      aktif: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
      lulus: 'bg-blue-50 text-blue-700 border-blue-200/80',
      keluar: 'bg-rose-50 text-rose-700 border-rose-200/80',
      undangan: 'bg-amber-50 text-amber-700 border-amber-200/80',
      nonaktif: 'bg-slate-100 text-slate-600 border-slate-200/80'
    }[(status || '').toLowerCase()] || 'bg-slate-50 text-slate-600 border-slate-200';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${t}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5 shrink-0" />
      <span className="capitalize">{status}</span>
    </span>
  );
}

export function WaliCard({ wali, onEdit, onReset, onStatusToggle }) {
  return (
    <div className="bg-white border border-slate-200/80 hover:border-slate-300 rounded-xl p-3 flex gap-3 items-start transition cursor-pointer active:scale-[0.98]">
      <StudentAvatar name={wali.display_name} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="font-bold text-text-main text-sm truncate leading-tight" title={wali.display_name}>
            {wali.display_name}
          </div>
          <WaliStatusBadge status={wali.status} />
        </div>
        <div className="text-xs text-slate-500 mt-2 space-y-1">
          <div>
            <span className="font-medium text-slate-400">WA:</span>{' '}
            <span className="font-mono text-slate-700 font-bold">{wali.no_wa}</span>
          </div>
          <div>
            <span className="font-medium text-slate-400">Siswa:</span>{' '}
            <span className="font-medium text-slate-600">{wali.siswa_nama || '-'}</span>
          </div>
          <div>
            <span className="font-medium text-slate-400">Cabang:</span>{' '}
            <span className="font-medium text-slate-600">{wali.cabang_nama || 'Pusat'}</span>
          </div>
        </div>
        <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-2.5">
          <IconButton icon={Pencil} label={`Edit ${wali.display_name}`} onClick={() => onEdit(wali)} size="sm" />
          <IconButton icon={RotateCcw} label="Reset password" onClick={() => onReset(wali)} size="sm" />
          {wali.status === 'nonaktif' ? (
            <IconButton
              icon={Check}
              label="Aktifkan"
              onClick={() => onStatusToggle({ wali, status: 'aktif' })}
              size="sm"
            />
          ) : (
            <IconButton
              icon={Power}
              label="Nonaktifkan"
              onClick={() => onStatusToggle({ wali, status: 'nonaktif' })}
              size="sm"
              variant="danger"
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function SiswaDrawer({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/45 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full sm:max-w-2xl xl:max-w-3xl h-full bg-slate-100 border-l border-slate-200 overflow-y-auto custom-scrollbar p-3 sm:p-4 animate-slide-left shadow-2xl shadow-slate-950/25"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function Panel({ title, right, children, className = '' }) {
  return (
    <section
      className={`bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 max-w-full overflow-hidden shadow-[0_18px_60px_rgba(15,23,42,.05)] ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <div className="inline-flex rounded-full bg-primary-container px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-primary">
            Admin
          </div>
          <h2 className="mt-2 text-lg font-black text-text-main tracking-[-0.01em]">{title}</h2>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}
export function Input({ value, onChange, placeholder, className = '', type = 'text', ...props }) {
  return type === 'date' ? (
    <CustomDatePicker
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={`input w-full ${className}`}
      {...props}
    />
  ) : type === 'time' ? (
    <CustomTimePicker
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={`input w-full ${className}`}
      {...props}
    />
  ) : (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`input w-full ${className}`}
      {...props}
    />
  );
}
export function Textarea({ label, value, onChange, placeholder }) {
  return (
    <div>
      <div className="label">{label}</div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="input w-full min-h-20 resize-none"
      />
    </div>
  );
}
export function Table({ headers, children }) {
  return (
    <div className="overflow-x-auto custom-scrollbar rounded-xl border border-slate-100">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={`${i}-${h || 'empty'}`} className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}
export function Td({ children, className = '', ...props }) {
  return (
    <td className={`py-2 px-3 text-slate-700 whitespace-nowrap ${className}`} {...props}>
      {children}
    </td>
  );
}
export function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-2 ${checked ? 'bg-emerald-500' : 'bg-slate-300'}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`}
        />
      </button>
      <span className="text-sm font-medium text-slate-700">{label}</span>
    </label>
  );
}
export function FotoUpload({ url, onUpload, onDelete, size = 'md' }) {
  const box = size === 'xl' ? 'w-32 h-32 sm:w-36 sm:h-36' : 'w-16 h-16';
  const icon = size === 'xl' ? 'w-10 h-10' : 'w-6 h-6';
  return (
    <div className="relative group flex-shrink-0">
      {url ? (
        <img src={url} className={`${box} rounded-2xl object-cover border-2 border-white`} alt="foto" />
      ) : (
        <div
          className={`${box} rounded-2xl bg-slate-200 border-2 border-white flex items-center justify-center text-slate-400`}
        >
          <Users className={icon} strokeWidth={2.4} />
        </div>
      )}
      <label
        className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
        title="Ubah foto"
      >
        <ImagePlus className="w-5 h-5 text-white" strokeWidth={2.4} />
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = '';
          }}
        />
      </label>
      {url && (
        <IconButton
          icon={Trash2}
          label="Hapus foto"
          onClick={onDelete}
          size="sm"
          variant="danger"
          className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity"
        />
      )}
    </div>
  );
}
export function money(v) {
  return 'Rp ' + Number(v || 0).toLocaleString('id-ID');
}
export function fmtTime(v) {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'Asia/Jakarta'
    }).format(new Date(v));
  } catch {
    return v;
  }
}

export function BillingStatusBadge({ status }) {
  const s = (status || '').toLowerCase();
  const cfg = {
    lunas: {
      bg: 'bg-emerald-50 dark:bg-emerald-950/30',
      text: 'text-emerald-700 dark:text-emerald-400',
      border: 'border-emerald-200/80 dark:border-emerald-800',
      dot: 'bg-emerald-500',
      label: 'Lunas'
    },
    paid: {
      bg: 'bg-emerald-50 dark:bg-emerald-950/30',
      text: 'text-emerald-700 dark:text-emerald-400',
      border: 'border-emerald-200/80 dark:border-emerald-800',
      dot: 'bg-emerald-500',
      label: 'Lunas'
    },
    confirmed: {
      bg: 'bg-emerald-50 dark:bg-emerald-950/30',
      text: 'text-emerald-700 dark:text-emerald-400',
      border: 'border-emerald-200/80 dark:border-emerald-800',
      dot: 'bg-emerald-500',
      label: 'Terkonfirmasi'
    },
    open: {
      bg: 'bg-amber-50 dark:bg-amber-950/30',
      text: 'text-amber-700 dark:text-amber-400',
      border: 'border-amber-200/80 dark:border-amber-800',
      dot: 'bg-amber-500',
      label: 'Belum Bayar'
    },
    unpaid: {
      bg: 'bg-amber-50 dark:bg-amber-950/30',
      text: 'text-amber-700 dark:text-amber-400',
      border: 'border-amber-200/80 dark:border-amber-800',
      dot: 'bg-amber-500',
      label: 'Belum Bayar'
    },
    sebagian: {
      bg: 'bg-blue-50 dark:bg-blue-950/30',
      text: 'text-blue-700 dark:text-blue-400',
      border: 'border-blue-200/80 dark:border-blue-800',
      dot: 'bg-blue-500',
      label: 'Sebagian'
    },
    partially_paid: {
      bg: 'bg-blue-50 dark:bg-blue-950/30',
      text: 'text-blue-700 dark:text-blue-400',
      border: 'border-blue-200/80 dark:border-blue-800',
      dot: 'bg-blue-500',
      label: 'Sebagian'
    },
    pending_verification: {
      bg: 'bg-violet-50 dark:bg-violet-950/30',
      text: 'text-violet-700 dark:text-violet-400',
      border: 'border-violet-200/80 dark:border-violet-800',
      dot: 'bg-violet-500 animate-pulse',
      label: 'Menunggu Verifikasi'
    },
    issued: {
      bg: 'bg-sky-50 dark:bg-sky-950/30',
      text: 'text-sky-700 dark:text-sky-400',
      border: 'border-sky-200/80 dark:border-sky-800',
      dot: 'bg-sky-500',
      label: 'Terbit'
    },
    rejected: {
      bg: 'bg-red-50 dark:bg-red-950/30',
      text: 'text-red-700 dark:text-red-400',
      border: 'border-red-200/80 dark:border-red-800',
      dot: 'bg-red-500',
      label: 'Ditolak'
    },
    void: {
      bg: 'bg-slate-100 dark:bg-slate-800/50',
      text: 'text-slate-500 dark:text-slate-400',
      border: 'border-slate-200/80 dark:border-slate-700',
      dot: 'bg-slate-400',
      label: 'Void'
    }
  }[s] || { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200', dot: 'bg-slate-400', label: status };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${cfg.bg} ${cfg.text} ${cfg.border}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} mr-1.5 shrink-0`} />
      <span>{cfg.label}</span>
    </span>
  );
}

export function MethodBadge({ metode }) {
  const m = (metode || '').toLowerCase();
  const cfg = {
    tunai: {
      icon: Banknote,
      bg: 'bg-emerald-50 dark:bg-emerald-950/30',
      text: 'text-emerald-700 dark:text-emerald-400',
      label: 'Tunai'
    },
    transfer: {
      icon: CreditCard,
      bg: 'bg-blue-50 dark:bg-blue-950/30',
      text: 'text-blue-700 dark:text-blue-400',
      label: 'Transfer'
    },
    qris: {
      icon: Smartphone,
      bg: 'bg-violet-50 dark:bg-violet-950/30',
      text: 'text-violet-700 dark:text-violet-400',
      label: 'QRIS'
    },
    lainnya: {
      icon: Wallet,
      bg: 'bg-slate-100 dark:bg-slate-800/50',
      text: 'text-slate-600 dark:text-slate-400',
      label: 'Lainnya'
    }
  }[m] || { icon: Wallet, bg: 'bg-slate-50', text: 'text-slate-600', label: metode };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${cfg.bg} ${cfg.text}`}>
      <Icon className="w-3.5 h-3.5" />
      {cfg.label}
    </span>
  );
}

export function MoneyCell({ children, className = '' }) {
  return (
    <td
      className={`py-2 px-3 text-right font-semibold tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap ${className}`}
    >
      {children}
    </td>
  );
}
