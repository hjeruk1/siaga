import { Fragment, useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { CustomSelect } from '../../components/Shared';
import { ChevronRight, Search, X } from 'lucide-react';
import { useMaster, Panel } from './AdminShared';

// Vocabulary untuk data audit mentah: action dan entity_type adalah token teknis
// (create, pickup_scan, laporan_harian) — dipetakan ke label Indonesia.
const ACTION_LABELS = {
  create: 'Buat',
  update: 'Ubah',
  delete: 'Hapus',
  change_enrollment: 'Pindah Rombel',
  update_wali: 'Ubah Wali',
  link_wali_siswa: 'Hubungkan Wali',
  reissue_nfc: 'Reissue NFC',
  reissue_qr: 'Reissue QR',
  pickup_scan: 'Scan Penjemputan',
  checkin: 'Check-in',
  checkout: 'Check-out',
  password_reset: 'Reset Sandi',
  upload_foto: 'Unggah Foto',
  delete_foto: 'Hapus Foto',
  kenaikan_tahun_ajaran: 'Naik Tahun Ajaran'
};
function actionLabel(a) {
  return ACTION_LABELS[a] || String(a || '').replace(/_/g, ' ');
}
function categoryOf(action) {
  const a = String(action || '').toLowerCase();
  if (a === 'create') return 'buat';
  if (a === 'delete') return 'hapus';
  if (a === 'password_reset') return 'kredensial';
  if (['update', 'change_enrollment', 'update_wali', 'upload_foto'].includes(a)) return 'ubah';
  return 'lainnya';
}
const CATEGORY_TONE = {
  buat: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  ubah: 'bg-amber-50 text-amber-700 border-amber-100',
  hapus: 'bg-red-50 text-red-700 border-red-100',
  kredensial: 'bg-violet-50 text-violet-700 border-violet-100',
  lainnya: 'bg-slate-100 text-slate-600 border-slate-200'
};
const ENTITY_LABELS = {
  siswa: 'Siswa',
  pengguna: 'Akun',
  wali: 'Wali',
  laporan_harian: 'Daily Record',
  laporan_comment: 'Komentar',
  absensi: 'Absensi',
  penjemput: 'Penjemput',
  cabang: 'Cabang',
  jenjang: 'Jenjang',
  rombel: 'Rombel',
  diskon_siswa: 'Diskon',
  biaya_tarif: 'Tarif',
  tagihan: 'Tagihan',
  pembayaran: 'Pembayaran',
  invoice: 'Invoice',
  kalender_event: 'Kalender',
  early_release: 'Pulang Dini',
  tutup_hari: 'Tutup Hari',
  modul_ajar: 'Modul Ajar',
  focus_theme: 'Focus Theme',
  guru_rombel: 'Guru-Rombel',
  operasional_config: 'Konfigurasi',
  staff_profile: 'Staff',
  wali_siswa: 'Wali-Siswa',
  siswa_enrollment: 'Rombel Siswa',
  kenaikan_batch: 'Kenaikan'
};
function entityLabel(t) {
  return ENTITY_LABELS[t] || String(t || '').replace(/_/g, ' ');
}

// tanggal & jam dalam zona WIB, konsisten dengan sisa aplikasi lokal.
const wibDateKey = (iso) => {
  const d = new Date(String(iso).includes(' ') ? String(iso).replace(' ', 'T') + 'Z' : iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
};
const wibTime = (iso) => {
  const d = new Date(String(iso).includes(' ') ? String(iso).replace(' ', 'T') + 'Z' : iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
};
function groupLabel(dateKey, todayKey, yesterdayKey) {
  if (dateKey === todayKey) return 'Hari Ini';
  if (dateKey === yesterdayKey) return 'Kemarin';
  const d = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
}

// Nilai kredensial tidak boleh muncul di layar — disaring di sini.
const PRIVATE_JSON_KEYS = /password|hash|token|secret|pin|nip/i;
function JsonRows({ label, value }) {
  let obj = null;
  try {
    obj = typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    obj = null;
  }
  if (!obj || typeof obj !== 'object') return null;
  const entries = Object.entries(obj).filter(
    ([k, v]) => !PRIVATE_JSON_KEYS.test(k) && v !== null && v !== undefined && String(v).trim() !== ''
  );
  if (!entries.length) return null;
  return (
    <div className="min-w-0">
      <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 font-mono text-[11px] text-slate-600">
        {entries.map(([k, v]) => (
          <Fragment key={k}>
            <span className="text-slate-400">{k}</span>
            <span className="min-w-0 truncate">{String(v).slice(0, 80)}</span>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

export default function AuditTab({ user, toast }) {
  const m = useMaster(user);
  const [rows, setRows] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('semua');
  useEffect(() => {
    api
      .auditLog({ cabang_id: m.cabangId, limit: 150 })
      .then(setRows)
      .catch((e) => toast('err', e.message));
  }, [m.cabangId]);

  const searched = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return rows;
    return rows.filter((a) =>
      [a.actor_name || 'Sistem', a.action, a.entity_type, a.reason].some((v) =>
        String(v || '').toLowerCase().includes(q)
      )
    );
  }, [rows, searchQuery]);

  const categoryCounts = useMemo(() => {
    const c = { buat: 0, ubah: 0, hapus: 0, kredensial: 0, lainnya: 0 };
    for (const r of searched) c[categoryOf(r.action)] += 1;
    return c;
  }, [searched]);
  const chipDefs = [
    { id: 'semua', label: 'Semua', count: searched.length },
    { id: 'buat', label: 'Buat', count: categoryCounts.buat },
    { id: 'ubah', label: 'Ubah', count: categoryCounts.ubah },
    { id: 'hapus', label: 'Hapus', count: categoryCounts.hapus },
    { id: 'kredensial', label: 'Kredensial', count: categoryCounts.kredensial },
    { id: 'lainnya', label: 'Lainnya', count: categoryCounts.lainnya }
  ].filter((f) => f.id === 'semua' || f.count > 0);
  const chipTitles = { lainnya: 'Aksi operasional lain: check-in, scan penjemputan, dan sejenisnya' };

  const filteredRows = useMemo(
    () => (filter === 'semua' ? searched : searched.filter((a) => categoryOf(a.action) === filter)),
    [searched, filter]
  );

  const groups = useMemo(() => {
    const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const yKey = new Date(Date.now() - 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const map = new Map();
    for (const a of filteredRows) {
      const key = wibDateKey(a.created_at) || 'tanpa-tanggal';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ a, time: wibTime(a.created_at) });
    }
    return Array.from(map.entries()).map(([dateKey, items]) => ({
      dateKey,
      label: groupLabel(dateKey, todayKey, yKey),
      items
    }));
  }, [filteredRows]);

  return (
    <Panel title="Audit Log" right={null} className="overflow-visible md:overflow-hidden">
      <div className="space-y-4">
        {/* Search & filter — sticky di mobile mengikuti pola tab admin lain */}
        <div className="sticky top-[64px] z-20 -mx-1 rounded-xl border border-slate-200 bg-slate-50/95 p-3 shadow-sm backdrop-blur md:static md:z-auto md:mx-0 md:bg-slate-50 md:shadow-none md:backdrop-blur-0">
          <div className="flex flex-row items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Search className="h-3.5 w-3.5" />
              </span>
              <input
                type="text"
                placeholder="Cari log…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input w-full pl-8 text-xs font-bold sm:text-sm"
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Hapus pencarian audit"
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {user.role === 'admin' && (
              <CustomSelect
                value={m.cabangId}
                onChange={(e) => m.setCabangId(e.target.value)}
                className="input w-40 shrink-0 text-xs font-bold sm:w-44 sm:text-sm"
              >
                <option value="">Semua Cabang</option>
                {m.cabang.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nama}
                  </option>
                ))}
              </CustomSelect>
            )}
          </div>
          {/* Kategori aksi: tally mengikuti hasil pencarian aktif */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {chipDefs.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                title={chipTitles[f.id]}
                onClick={() => setFilter(f.id)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                  filter === f.id
                    ? 'border-transparent bg-primary-container text-primary'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                }`}
              >
                {f.label} <span className="tabular-nums opacity-70">{f.count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200">
          {groups.length === 0 && (
            <div className="p-6 text-center text-sm font-bold text-slate-400">Tidak ada log audit yang ditemukan.</div>
          )}
          {groups.map((g) => (
            <div key={g.dateKey}>
              <div className="flex items-baseline gap-2 border-t border-slate-100 bg-slate-50/80 px-3 py-1.5 first:border-t-0">
                <span className="text-xs font-black text-text-main">{g.label}</span>
                <span className="text-[10px] font-semibold tabular-nums text-slate-400">{g.items.length} aktivitas</span>
              </div>
              {g.items.map(({ a, time }) => (
                <AuditRow key={a.id} item={a} time={time} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function AuditRow({ item, time }) {
  const a = item;
  const cat = categoryOf(a.action);
  return (
    <details className="group border-t border-slate-100 first:border-t-0">
      <summary className="flex cursor-pointer list-none items-start gap-2.5 px-3 py-2 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
        <span
          className={`mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${CATEGORY_TONE[cat]}`}
        >
          {actionLabel(a.action)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-text-main">
            {entityLabel(a.entity_type)}
            {a.entity_id ? ` #${a.entity_id}` : ''}
          </div>
          <div className="truncate text-[11px] text-slate-500">
            {a.actor_name || 'Sistem'}
            {a.cabang_nama ? ` · ${a.cabang_nama}` : ''}
          </div>
        </div>
        <span className="shrink-0 pt-1 text-[10px] tabular-nums text-slate-400">{time}</span>
        <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-300 transition-transform group-open:rotate-90" />
      </summary>
      <div className="space-y-2.5 border-t border-slate-100 bg-slate-50/60 px-3 py-2.5">
        {a.reason && (
          <div className="text-xs text-slate-600">
            <span className="mr-1.5 text-[9px] font-black uppercase tracking-wider text-slate-400">Alasan</span>
            {a.reason}
          </div>
        )}
        <JsonRows label="Sebelum" value={a.before_json} />
        <JsonRows label="Sesudah" value={a.after_json} />
        {!a.reason && !a.before_json && !a.after_json && (
          <div className="text-[11px] text-slate-400">Tidak ada detail tambahan.</div>
        )}
      </div>
    </details>
  );
}
