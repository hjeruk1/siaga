import { useEffect, useState } from 'react';
import { api } from '../../api';
import { ActionButton, IconButton, Modal, CustomSelect, CustomDatePicker, EmptyState } from '../../components/Shared';
import { FilePenLine, RefreshCw, Save, X } from 'lucide-react';
import { useMaster, CabangFilter, Panel, fmtTime } from './shared';

export default function LaporanTab({ user, toast }) {
  const m = useMaster(user);
  const [rows, setRows] = useState([]);
  const [tanggal, setTanggal] = useState('');
  const [rombelId, setRombelId] = useState('');
  const [detail, setDetail] = useState(null);
  const [edits, setEdits] = useState(null);
  async function load() {
    try {
      const r = await api.dailyAdminHistory({
        cabang_id: m.cabangId,
        tanggal: tanggal || undefined,
        rombel_id: rombelId || undefined,
        limit: 150
      });
      setRows(r);
    } catch (e) {
      toast('err', e.message);
    }
  }
  useEffect(() => {
    if (m.cabangId || user.role === 'admin') load();
  }, [m.cabangId, tanggal, rombelId]);
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
      load();
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
      <ActionButton icon={RefreshCw} onClick={load} variant="secondary" className="w-full px-2 text-xs xl:hidden">
        Refresh
      </ActionButton>
      <ActionButton icon={RefreshCw} onClick={load} variant="secondary" className="hidden xl:inline-flex">
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
          {rows.length === 0 && (
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
              {rows.map((r) => (
                <tr key={r.id} className={detail?.id === r.id ? 'bg-primary-container' : ''}>
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
                  <td className="py-2 px-3 sticky right-0 z-10 bg-white border-l border-slate-200/80">
                    <IconButton
                      icon={FilePenLine}
                      label={`Lihat atau edit laporan ${r.siswa_nama}`}
                      onClick={() => open(r)}
                      size="sm"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
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
            onClose={() => {
              setDetail(null);
              setEdits(null);
            }}
          >
            <div className="space-y-3">
              <div className="text-sm text-slate-500">
                {detail.tanggal} - {detail.cabang_nama} - {detail.rombel_nama}
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-3">
                <div className="label">Focus Theme</div>
                <div className="font-black text-text-main">{detail.focus_theme_title || '-'}</div>
                {detail.modul_ajar_title && (
                  <div className="text-xs text-slate-500 mt-1">Modul: {detail.modul_ajar_title}</div>
                )}
                {detail.focus_theme_activity_summary && (
                  <div className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">
                    {detail.focus_theme_activity_summary}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
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
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={detail.tidur === 1}
                  onChange={(e) => setDetail((d) => ({ ...d, tidur: e.target.checked ? 1 : 0 }))}
                />{' '}
                Tidur siang
              </label>
              <div>
                <div className="label">Domain observasi</div>
                <input
                  value={detail.observation_domain || ''}
                  onChange={(e) => setDetail((d) => ({ ...d, observation_domain: e.target.value }))}
                  className="input w-full"
                  placeholder="Mis. Literasi, Numerasi, Sosial Emosional"
                />
              </div>
              <textarea
                value={detail.observation_note || ''}
                onChange={(e) => setDetail((d) => ({ ...d, observation_note: e.target.value }))}
                className="input w-full min-h-24"
                placeholder="Catatan observasi objektif"
              />
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

              {/* Penilaian Capaian Perkembangan */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
                <div className="text-xs font-black text-slate-400 uppercase tracking-wider">
                  Penilaian Capaian Perkembangan
                </div>

                {/* Aktivitas dari Focus Theme */}
                {(() => {
                  const acts = String(detail.focus_theme_activity_summary || '')
                    .split('\n')
                    .map((l) => l.replace(/^[\s\-•*]+/, '').trim())
                    .filter(Boolean);
                  const actRatings = (detail.structured_observation || {}).activities || {};
                  if (acts.length === 0)
                    return (
                      <p className="text-xs text-slate-400 italic">Tidak ada rencana kegiatan pada Focus Theme ini.</p>
                    );
                  return (
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-text-main">Rencana Kegiatan</div>
                      {acts.map((act) => (
                        <div
                          key={act}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 bg-white rounded-xl border border-slate-100"
                        >
                          <span className="text-xs font-semibold text-slate-700">{act}</span>
                          <div className="flex gap-1">
                            {RATING_OPTS_ADMIN.map((opt) => (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => tapAdminRating('activities', act, opt)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-black border transition-all duration-200 active:scale-95 ${
                                  actRatings[act] === opt
                                    ? opt === 'BSB'
                                      ? 'bg-emerald-500 text-white border-transparent'
                                      : opt === 'BSH'
                                        ? 'bg-primary text-white border-transparent'
                                        : opt === 'MB'
                                          ? 'bg-amber-500 text-white border-transparent'
                                          : 'bg-red-500 text-white border-transparent'
                                    : 'bg-white border-slate-200 text-slate-500 hover:border-primary/40'
                                }`}
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Pilar Karakter */}
                <div className="space-y-2 pt-3 border-t border-slate-200">
                  <div className="text-xs font-bold text-text-main">Pilar Karakter & Tilawati</div>
                  {PILLAR_KEYS_ADMIN.map((p) => {
                    const pRatings = (detail.structured_observation || {}).pillars || {};
                    return (
                      <div
                        key={p.k}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 bg-white rounded-xl border border-slate-100"
                      >
                        <span className="text-xs font-semibold text-slate-700">{p.l}</span>
                        <div className="flex gap-1">
                          {RATING_OPTS_ADMIN.map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => tapAdminRating('pillars', p.k, opt)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-black border transition-all duration-200 active:scale-95 ${
                                pRatings[p.k] === opt
                                  ? opt === 'BSB'
                                    ? 'bg-emerald-500 text-white border-transparent'
                                    : opt === 'BSH'
                                      ? 'bg-primary text-white border-transparent'
                                      : opt === 'MB'
                                        ? 'bg-amber-500 text-white border-transparent'
                                        : 'bg-red-500 text-white border-transparent'
                                  : 'bg-white border-slate-200 text-slate-500 hover:border-primary/40'
                              }`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <textarea
                value={detail.catatan || ''}
                onChange={(e) => setDetail((d) => ({ ...d, catatan: e.target.value }))}
                className="input w-full min-h-20"
                placeholder="Catatan"
              />
              <textarea
                value={detail.parent_note || ''}
                onChange={(e) => setDetail((d) => ({ ...d, parent_note: e.target.value }))}
                className="input w-full min-h-20"
                placeholder="Catatan untuk wali"
              />
              <div className="text-xs text-slate-400">Kelengkapan: {completeness()}%</div>
              <div className="flex gap-2">
                <ActionButton icon={Save} onClick={saveEdit}>
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
              {edits && edits.length > 0 && (
                <div className="border-t border-slate-200 pt-3">
                  <div className="text-xs font-black text-slate-500 mb-2">Riwayat Edit</div>
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
