import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';
import { ActionButton, IconButton, Modal, CustomSelect, CustomDatePicker, EmptyState } from '../../components/Shared';
import { FilePenLine, Loader2, Moon, RefreshCw, Save, X } from 'lucide-react';
import { CabangFilter, Panel } from './AdminShared';
import { useMaster } from './useMaster';
import { fmtTime } from '../../utils/format';

/** Caption grup di dalam modal koreksi — 11px, idiom yang sama dengan kartu mobile. */
const CAPTION = 'text-[11px] font-black uppercase tracking-wider text-slate-400';
const RATING_TONE = {
  BSB: 'bg-emerald-500 text-white border-transparent',
  BSH: 'bg-primary text-white border-transparent',
  MB: 'bg-amber-500 text-white border-transparent',
  BB: 'bg-red-500 text-white border-transparent'
};

/** Satu baris penilaian (nama capaian + BB/MB/BSH/BSB).
 *  Sebelumnya markup ini diduplikasi utuh untuk Rencana Kegiatan dan Pilar Karakter. */
function RatingRow({ label, value, options, onPick }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-slate-100 bg-white p-2 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <div className="flex gap-1">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onPick(opt)}
            aria-pressed={value === opt}
            className={`min-w-9 rounded-lg border px-2 py-1 text-xs font-black transition-all duration-200 active:scale-95 ${
              value === opt ? RATING_TONE[opt] : 'border-slate-200 bg-white text-slate-500 hover:border-primary/40'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function LaporanTab({ user, toast }) {
  const m = useMaster(user);
  const [tanggal, setTanggal] = useState('');
  const [rombelId, setRombelId] = useState('');
  const [detail, setDetail] = useState(null);
  const [edits, setEdits] = useState(null);

  // Kunci query = seluruh filter yang menentukan isi daftar. React Query yang
  // mengurus pemuatan, cache, dan pembatalan permintaan lama saat filter
  // berubah cepat — sebelumnya itu harus ditulis tangan di setiap tab.
  const { data, isPending, isFetching, refetch } = useQuery({
    queryKey: ['laporan-harian', m.cabangId || '', tanggal || '', rombelId || ''],
    queryFn: () =>
      api.dailyAdminHistory({
        cabang_id: m.cabangId,
        tanggal: tanggal || undefined,
        rombel_id: rombelId || undefined,
        limit: 150
      }),
    // Admin tanpa cabang terpilih tetap boleh melihat semua cabang; peran lain
    // baru memuat setelah cabangnya diketahui.
    enabled: !!m.cabangId || user.role === 'admin'
  });
  const rows = data ?? [];

  useEffect(() => {
    setRombelId('');
  }, [m.cabangId]);
  async function open(r) {
    setDetail(r);
    if (r.id)
      api
        .dailyEdits(r.id)
        .then(setEdits)
        .catch(() => setEdits([]));
  }
  const RATING_OPTS_ADMIN = ['BB', 'MB', 'BSH', 'BSB'];
  const PILLAR_KEYS_ADMIN = [
    { k: 'iqra', l: 'Tilawati' },
    { k: 'akhlak', l: 'Akhlak' },
    { k: 'aktif_mandiri', l: 'Aktif & Mandiri' },
    { k: 'disiplin_tertib', l: 'Disiplin & Tertib' }
  ];
  function tapAdminRating(type, key, opt) {
    setDetail((d) => {
      const obs = d.structured_observation || {};
      const section = { ...(obs[type] || {}) };
      if (section[key] === opt) {
        delete section[key];
      } else {
        section[key] = opt;
      }
      return { ...d, structured_observation: { ...obs, [type]: section } };
    });
  }
  async function saveEdit() {
    try {
      await api.saveDaily({
        siswa_id: detail.siswa_id,
        tanggal: detail.tanggal,
        mood: detail.mood,
        makan: detail.makan,
        tidur: detail.tidur,
        aktivitas: detail.aktivitas,
        catatan: detail.catatan,
        focus_theme_id: detail.focus_theme_id,
        observation_domain: detail.observation_domain,
        observation_note: detail.observation_note,
        parent_note: detail.parent_note,
        structured_observation: detail.structured_observation
      });
      toast('ok', 'Laporan dikoreksi');
      setDetail(null);
      refetch();
    } catch (e) {
      toast('err', e.message);
    }
  }
  const completeness = () => {
    if (!detail) return 0;
    let s = 0;
    if (detail.focus_theme_id) s++;
    if (detail.mood) s++;
    if (detail.makan) s++;
    if (detail.tidur !== null && detail.tidur !== undefined) s++;
    if (detail.observation_domain) s++;
    if (String(detail.observation_note || '').trim().length >= 12) s++;
    return Math.round((s / 6) * 100);
  };
  const showCabangColumn = user.role === 'admin';
  const statusClass = (status) =>
    status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-primary-container text-primary-active';
  const toolbar = (
    <div className="grid w-full min-w-0 grid-cols-2 gap-2 xl:flex xl:w-auto xl:items-center xl:justify-end">
      <CustomDatePicker
        value={tanggal}
        onChange={setTanggal}
        className="input h-9 w-full min-w-0 text-xs xl:w-40 xl:text-sm"
      />
      <CabangFilter user={user} {...m} className="h-9 w-full min-w-0 xl:w-64" />
      <CustomSelect
        value={rombelId}
        onChange={(e) => setRombelId(e.target.value)}
        className="input h-9 w-full min-w-0 xl:w-48"
      >
        <option value="">Semua rombel</option>
        {m.rombel.map((r) => (
          <option key={r.id} value={r.id}>
            {showCabangColumn && !m.cabangId ? `${r.cabang_nama} - ${r.nama}` : r.nama}
          </option>
        ))}
      </CustomSelect>
      {/* Satu tombol saja: versi "hidden xl:inline-flex" sebelumnya tidak pernah tersembunyi
          karena kelas dasar ActionButton (inline-flex) menang di cascade, sehingga di mobile
          muncul dua tombol Refresh. Kelas responsif di sini menghasilkan tampilan yang sama. */}
      <ActionButton
        icon={isFetching ? Loader2 : RefreshCw}
        onClick={() => refetch()}
        variant="secondary"
        className="w-full px-2 text-xs xl:w-auto xl:px-4 xl:text-sm"
      >
        Refresh
      </ActionButton>
    </div>
  );
  return (
    <Panel title="Histori & Koreksi Laporan Harian" className="min-w-0">
      <div className="min-w-0 space-y-4 overflow-hidden">
        {toolbar}
        <div className="grid w-full min-w-0 max-w-full gap-2 md:hidden">
          {rows.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => open(r)}
              className={`block w-full min-w-0 max-w-full overflow-hidden rounded-xl border p-2.5 text-left transition active:scale-[0.99] ${detail?.id === r.id ? 'border-primary bg-primary-container' : 'border-slate-200 bg-white'}`}
            >
              <div className="w-full min-w-0 overflow-hidden">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="min-w-0 flex-1 truncate text-[11px] font-black uppercase tracking-wider text-slate-400">
                      {r.tanggal}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${statusClass(r.status)}`}
                    >
                      {r.status || 'draft'}
                    </span>
                  </div>
                  <div
                    className="mt-1 block max-w-full truncate text-sm font-black leading-tight text-text-main"
                    title={r.siswa_nama}
                  >
                    {r.siswa_nama}
                  </div>
                  <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1 text-[10px] font-bold text-slate-500">
                    {showCabangColumn && (
                      <span className="inline-block max-w-full truncate rounded bg-slate-50 px-1.5 py-0.5">
                        {r.cabang_nama || '-'}
                      </span>
                    )}
                    <span className="inline-block max-w-full truncate rounded bg-slate-50 px-1.5 py-0.5">
                      {r.rombel_nama || '-'}
                    </span>
                  </div>
                  <div className="mt-2 max-w-full truncate text-[11px] font-semibold text-slate-500">
                    Guru: {r.guru_nama || 'Belum ada guru'}
                  </div>
                </div>
              </div>
            </button>
          ))}
          {!isPending && rows.length === 0 && (
            <EmptyState
              icon="clipboard"
              title="Belum Ada Laporan"
              description="Tidak ada laporan yang cocok dengan filter saat ini."
            />
          )}
        </div>
        <div className="hidden overflow-x-auto custom-scrollbar max-w-full rounded-xl border border-slate-100 md:block">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr>
                <th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Tanggal</th>
                <th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Siswa</th>
                {showCabangColumn && (
                  <th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Cabang</th>
                )}
                <th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Rombel</th>
                <th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Status</th>
                <th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Guru</th>
                <th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black sticky right-0 z-10 border-l border-slate-200/80"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const active = detail?.id === r.id;
                const rowBg = active ? 'bg-primary-container' : 'bg-white';
                return (
                  <tr key={r.id} className={active ? 'bg-primary-container' : ''}>
                    <td className="py-2 px-3 text-slate-700">{r.tanggal}</td>
                    <td className="py-2 px-3 font-bold text-text-main">{r.siswa_nama}</td>
                    {showCabangColumn && <td className="py-2 px-3 text-slate-600">{r.cabang_nama || '-'}</td>}
                    <td className="py-2 px-3 text-slate-600">{r.rombel_nama}</td>
                    <td className="py-2 px-3">
                      <span className={`text-xs font-black px-2 py-1 rounded-full ${statusClass(r.status)}`}>
                        {r.status || 'draft'}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-600">{r.guru_nama || '-'}</td>
                    <td className={`py-2 px-3 sticky right-0 z-10 ${rowBg} border-l border-slate-200/80`}>
                      <IconButton
                        icon={FilePenLine}
                        label={`Lihat atau edit laporan ${r.siswa_nama}`}
                        onClick={() => open(r)}
                        size="sm"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!isPending && rows.length === 0 && (
          <div className="hidden md:block">
            <EmptyState
              icon="clipboard"
              title="Belum Ada Laporan"
              description="Tidak ada laporan yang cocok dengan filter saat ini."
            />
          </div>
        )}
        {detail && (
          <Modal
            title={`Koreksi Laporan - ${detail.siswa_nama}`}
            maxWidth="max-w-2xl"
            footer={
              <>
                <div className="mb-2 flex items-center gap-2">
                  <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${completeness()}%` }}
                    />
                  </div>
                  <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-slate-500 tabular-nums">
                    {completeness()}% lengkap
                  </span>
                </div>
                <div className="flex gap-2">
                  <ActionButton icon={Save} onClick={saveEdit} className="flex-1 sm:flex-none">
                    Simpan Koreksi
                  </ActionButton>
                  <ActionButton
                    icon={X}
                    onClick={() => {
                      setDetail(null);
                      setEdits(null);
                    }}
                    variant="secondary"
                  >
                    Batal
                  </ActionButton>
                </div>
              </>
            }
            onClose={() => {
              setDetail(null);
              setEdits(null);
            }}
          >
            <div className="space-y-2.5">
              {/* Meta laporan sebagai chip, bukan satu baris teks abu-abu */}
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-slate-400">
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5">{detail.tanggal}</span>
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5">{detail.cabang_nama || '-'}</span>
                <span className="rounded-md bg-slate-100 px-1.5 py-0.5">{detail.rombel_nama || '-'}</span>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className={CAPTION}>Focus Theme</div>
                <div className="font-black text-text-main">{detail.focus_theme_title || '-'}</div>
                {detail.modul_ajar_title && (
                  <div className="mt-1 text-xs text-slate-500">Modul: {detail.modul_ajar_title}</div>
                )}
                {detail.focus_theme_activity_summary && (
                  <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                    {detail.focus_theme_activity_summary}
                  </div>
                )}
              </div>

              {/* Kondisi hari ini: tiga input jadi satu grup */}
              <div className="rounded-xl border border-slate-200 bg-white p-2.5">
                <div className={CAPTION}>Kondisi Hari Ini</div>
                {/* 1 kolom di bawah 475px: dua kolom membuat label terpanjang
                    ("🍱 Setengah") terpotong 2px di layar 390px. */}
                <div className="grid grid-cols-1 gap-2 xs:grid-cols-2">
                  <CustomSelect
                    value={detail.mood || ''}
                    onChange={(e) => setDetail((d) => ({ ...d, mood: e.target.value || null }))}
                    className="input"
                  >
                    <option value="">Mood</option>
                    <option value="ceria">😊 Ceria</option>
                    <option value="biasa">😐 Biasa</option>
                    <option value="rewel">😢 Rewel</option>
                  </CustomSelect>
                  <CustomSelect
                    value={detail.makan || ''}
                    onChange={(e) => setDetail((d) => ({ ...d, makan: e.target.value || null }))}
                    className="input"
                  >
                    <option value="">Makan</option>
                    <option value="habis">🍽️ Habis</option>
                    <option value="setengah">🍱 Setengah</option>
                    <option value="tidak">❌ Tidak</option>
                  </CustomSelect>
                  <button
                    type="button"
                    onClick={() => setDetail((d) => ({ ...d, tidur: d.tidur === 1 ? 0 : 1 }))}
                    aria-pressed={detail.tidur === 1}
                    className={`col-span-1 inline-flex items-center justify-center gap-1.5 rounded-xl border px-2 py-1.5 text-xs font-bold transition-all duration-200 active:scale-[0.98] xs:col-span-2 ${
                      detail.tidur === 1
                        ? 'border-primary/20 bg-primary-container text-primary-active'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-primary/20'
                    }`}
                  >
                    <Moon className="h-3.5 w-3.5" strokeWidth={2.4} />
                    Tidur siang
                  </button>
                </div>
              </div>

              {/* Observasi */}
              <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-2.5">
                <div className={CAPTION}>Observasi</div>
                <div>
                  <div className="label">Domain observasi</div>
                  <input
                    value={detail.observation_domain || ''}
                    onChange={(e) => setDetail((d) => ({ ...d, observation_domain: e.target.value }))}
                    className="input w-full"
                    placeholder="Mis. Literasi, Numerasi, Sosial Emosional"
                  />
                </div>
                <div>
                  <div className="label">Catatan observasi</div>
                  <textarea
                    value={detail.observation_note || ''}
                    onChange={(e) => setDetail((d) => ({ ...d, observation_note: e.target.value }))}
                    className="input w-full min-h-20"
                    placeholder="Catatan observasi objektif"
                  />
                </div>
                <div>
                  <div className="label">Aktivitas</div>
                  <div className="flex flex-wrap gap-1">
                    {[
                      ...'Mewarnai,Bernyanyi & Menari,Bermain Bebas,Membaca & Menulis,Motorik Halus,Motorik Kasar,Ibadah / Doa,Seni & Kerajinan,Bercerita,Bermain Peran'.split(
                        ','
                      )
                    ].map((a) => (
                      <button
                        key={a}
                        onClick={() =>
                          setDetail((d) => ({
                            ...d,
                            aktivitas: (d.aktivitas || []).includes(a)
                              ? (d.aktivitas || []).filter((x) => x !== a)
                              : [...(d.aktivitas || []), a]
                          }))
                        }
                        className={`text-xs px-2 py-1 rounded-lg border transition-all duration-200 ${(detail.aktivitas || []).includes(a) ? 'bg-primary-container border-primary/20 text-primary-active active:scale-95' : 'bg-white border-slate-200 text-slate-600 hover:border-primary/20'}`}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Penilaian Capaian Perkembangan */}
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                <div className={CAPTION}>Penilaian Capaian Perkembangan</div>

                {/* Aktivitas dari Focus Theme */}
                {(() => {
                  const acts = String(detail.focus_theme_activity_summary || '')
                    .split('\n')
                    .map((l) => l.replace(/^[\s\-•*]+/, '').trim())
                    .filter(Boolean);
                  const actRatings = (detail.structured_observation || {}).activities || {};
                  if (acts.length === 0)
                    return (
                      <p className="text-xs italic text-slate-400">Tidak ada rencana kegiatan pada Focus Theme ini.</p>
                    );
                  return (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-bold text-text-main">Rencana Kegiatan</div>
                      {acts.map((act) => (
                        <RatingRow
                          key={act}
                          label={act}
                          value={actRatings[act]}
                          options={RATING_OPTS_ADMIN}
                          onPick={(opt) => tapAdminRating('activities', act, opt)}
                        />
                      ))}
                    </div>
                  );
                })()}

                {/* Pilar Karakter */}
                <div className="space-y-1.5 border-t border-slate-200 pt-2">
                  <div className="text-[11px] font-bold text-text-main">Pilar Karakter & Tilawati</div>
                  {PILLAR_KEYS_ADMIN.map((p) => {
                    const pRatings = (detail.structured_observation || {}).pillars || {};
                    return (
                      <RatingRow
                        key={p.k}
                        label={p.l}
                        value={pRatings[p.k]}
                        options={RATING_OPTS_ADMIN}
                        onPick={(opt) => tapAdminRating('pillars', p.k, opt)}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Catatan */}
              <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-2.5">
                <div className={CAPTION}>Catatan</div>
                <div>
                  <div className="label">Catatan internal</div>
                  <textarea
                    value={detail.catatan || ''}
                    onChange={(e) => setDetail((d) => ({ ...d, catatan: e.target.value }))}
                    className="input w-full min-h-20"
                    placeholder="Catatan untuk tim sekolah"
                  />
                </div>
                <div>
                  <div className="label">Catatan untuk wali</div>
                  <textarea
                    value={detail.parent_note || ''}
                    onChange={(e) => setDetail((d) => ({ ...d, parent_note: e.target.value }))}
                    className="input w-full min-h-20"
                    placeholder="Ringkasan yang dikirim ke orang tua"
                  />
                </div>
              </div>

              {/* Riwayat dipindah ke atas footer supaya aksi selalu di paling bawah */}
              {edits && edits.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-2.5">
                  <div className={`${CAPTION} mb-1.5`}>Riwayat Edit</div>
                  <div className="space-y-1">
                    {edits.slice(0, 10).map((e, i) => (
                      <div key={i} className="text-xs text-slate-500">
                        <span className="font-bold">{e.guru_nama || 'Guru'}</span> - {fmtTime(e.created_at)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Modal>
        )}
      </div>
    </Panel>
  );
}
