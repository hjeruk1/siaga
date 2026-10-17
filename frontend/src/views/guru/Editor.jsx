// Editor laporan harian guru. Dipisah dari GuruView.jsx (sebelumnya ~1130 baris
// menumpuk dalam satu file bersama view induk).
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api';
import {
  ArrowLeft,
  BookOpen,
  Camera,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Eye,
  MessageCircle,
  Send,
  Sparkles,
  X
} from 'lucide-react';
import {
  generatePedagogicalNote,
  AKTIVITAS,
  MOOD_OPT,
  MAKAN_OPT,
  TIDUR_OPT,
  noteOk,
  activityLinesFromText,
  domainOptions,
  formalText,
  completeness
} from './helpers';

export function Editor({ row, detail, setDetail, onClose, user, toast }) {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [tersimpanField, setTersimpanField] = useState(null);
  const timerTersimpan = useRef(null);
  const [activityCustom, setActivityCustom] = useState('');
  const [domainCustom, setDomainCustom] = useState('');
  const [preview, setPreview] = useState(false);
  const [edits, setEdits] = useState(null);
  const [mobileChecklistOpen, setMobileChecklistOpen] = useState(false);
  const activities = useMemo(() => (Array.isArray(detail.aktivitas) ? detail.aktivitas : []), [detail.aktivitas]);
  const tanggal = detail.tanggal || row.tanggal;
  const cabangId = user?.cabang_id || row.cabang_id;

  const activeActivities = useMemo(() => {
    return activityLinesFromText(detail.focus_theme_activity_summary);
  }, [detail.focus_theme_activity_summary]);

  const PILLAR_KEYS = [
    { k: 'iqra', l: 'Tilawati' },
    { k: 'akhlak', l: 'Akhlak' },
    { k: 'aktif_mandiri', l: 'Aktif & Mandiri' },
    { k: 'disiplin_tertib', l: 'Disiplin & Tertib' }
  ];

  useEffect(() => {
    if (detail.id)
      api
        .dailyEdits(detail.id)
        .then(setEdits)
        .catch(() => setEdits([]));
    else setEdits(null);
  }, [detail.id]);

  useEffect(() => {
    let alive = true;
    async function loadFocusTheme() {
      try {
        const theme = await (row.rombel_id
          ? api.focusTheme({ rombel_id: row.rombel_id, tanggal }).catch(() => null)
          : Promise.resolve(null));
        if (!alive) return;

        let detailUpdate = {};
        if (theme?.id) {
          detailUpdate = {
            focus_theme_id: theme.id,
            focus_theme_title: theme.title,
            focus_theme_activity_summary: theme.activity_summary || '',
            focus_theme_domains: theme.suggested_domains || [],
            focus_theme_menu_makanan: theme.menu_makanan || ''
          };
        }

        // Auto-precheck: if row.laporan_id is null or detail.aktivitas is empty,
        // pre-fill and save the activities from the Focus Theme
        const currentActivities = Array.isArray(detail.aktivitas) ? detail.aktivitas : [];
        const themeActivities = activityLinesFromText(theme?.activity_summary || detail.focus_theme_activity_summary);

        if (!row.laporan_id && currentActivities.length === 0 && themeActivities.length > 0) {
          // Build structured observation defaulting to BSH
          const obs = { ...(detail.structured_observation || {}) };
          const actObs = { ...(obs.activities || {}) };
          themeActivities.forEach((act) => {
            if (!actObs[act]) actObs[act] = 'BSH';
          });

          const updatedDetail = {
            ...detail,
            ...detailUpdate,
            aktivitas: themeActivities,
            structured_observation: { ...obs, activities: actObs }
          };

          setDetail(updatedDetail);

          // Save to backend immediately so they are persisted as draft
          const payload = {
            ...updatedDetail,
            siswa_id: row.siswa_id,
            tanggal,
            focus_theme_id: updatedDetail.focus_theme_id || null
          };

          api
            .saveDaily(payload)
            .then((saved) => {
              if (saved?.id) {
                api
                  .dailyDetail(saved.id)
                  .then((freshD) => {
                    if (alive) {
                      setDetail((prev) => ({ ...prev, ...freshD }));
                    }
                  })
                  .catch(() => {});
              }
            })
            .catch(() => {});
        } else if (theme?.id) {
          setDetail((d) => ({ ...d, ...detailUpdate }));
        }
      } catch (e) {
        toast('err', e.message);
      }
    }
    loadFocusTheme();
    return () => {
      alive = false;
    };
  }, [row.rombel_id, row.jenjang_id, row.paket, tanggal, cabangId]);

  function update(k, v) {
    setDetail((d) => ({ ...d, [k]: v }));
  }

  // Konfirmasi singkat setelah auto-save, ditampilkan di kolom yang disimpan.
  function tandaiTersimpan(field) {
    setTersimpanField(field);
    clearTimeout(timerTersimpan.current);
    timerTersimpan.current = setTimeout(() => setTersimpanField(null), 2200);
  }

  useEffect(() => () => clearTimeout(timerTersimpan.current), []);

  // Aktivitas bebas: daftar tetap tidak selalu mencakup kegiatan hari ini.
  async function tambahAktivitas() {
    const v = activityCustom.trim();
    if (!v || busy) return;
    if (activities.includes(v)) {
      setActivityCustom('');
      return;
    }
    await tapActivityCheckbox(v, true);
    setActivityCustom('');
  }

  function tambahDomain() {
    const v = domainCustom.trim();
    if (!v || busy) return;
    tap('observation_domain', v);
    setDomainCustom('');
  }

  function buildDailyPayload(extra = {}) {
    return {
      ...detail,
      siswa_id: row.siswa_id,
      tanggal,
      focus_theme_id: detail.focus_theme_id || row.focus_theme_id || null,
      structured_observation: detail.structured_observation || {},
      ...extra
    };
  }

  async function tap(field, value) {
    setBusy(true);
    try {
      const payload = buildDailyPayload({ [field]: value });
      const r = await api.saveDaily(payload);
      tandaiTersimpan(field);
      if (!detail.id && r.id) {
        const d = await api.dailyDetail(r.id).catch(() => null);
        if (d)
          setDetail((prev) => ({
            ...prev,
            ...d,
            focus_theme_id: d.focus_theme_id || prev.focus_theme_id,
            focus_theme_title: d.focus_theme_title || prev.focus_theme_title,
            focus_theme_domains: d.focus_theme_domains?.length ? d.focus_theme_domains : prev.focus_theme_domains,
            focus_theme_menu_makanan: d.focus_theme_menu_makanan || prev.focus_theme_menu_makanan
          }));
      } else {
        setDetail((prev) => ({ ...prev, [field]: value }));
      }
      if (detail.id)
        api
          .dailyEdits(detail.id)
          .then(setEdits)
          .catch(() => {});
    } catch (e) {
      toast('err', e.message);
    } finally {
      setBusy(false);
    }
  }

  async function tapActivityCheckbox(act, checked) {
    setBusy(true);
    try {
      const currentActs = Array.isArray(detail.aktivitas) ? detail.aktivitas : [];
      let updatedActs;
      const obs = { ...(detail.structured_observation || {}) };
      const actObs = { ...(obs.activities || {}) };

      if (checked) {
        updatedActs = currentActs.includes(act) ? currentActs : [...currentActs, act];
        if (!actObs[act]) {
          actObs[act] = 'BSH'; // Default to BSH
        }
      } else {
        updatedActs = currentActs.filter((x) => x !== act);
        delete actObs[act];
      }

      const updatedObs = { ...obs, activities: actObs };
      const payload = buildDailyPayload({ aktivitas: updatedActs, structured_observation: updatedObs });
      const r = await api.saveDaily(payload);

      setDetail((prev) => ({ ...prev, aktivitas: updatedActs, structured_observation: updatedObs }));
      if (!detail.id && r.id) {
        const d = await api.dailyDetail(r.id).catch(() => null);
        if (d) setDetail((prev) => ({ ...prev, ...d }));
      }
    } catch (e) {
      toast('err', e.message);
    } finally {
      setBusy(false);
    }
  }

  async function tapRating(type, key, opt) {
    setBusy(true);
    try {
      const obs = { ...(detail.structured_observation || {}) };
      const section = { ...(obs[type] || {}) };
      if (opt === null) {
        delete section[key];
      } else {
        section[key] = opt;
      }
      const updatedObs = { ...obs, [type]: section };
      const payload = buildDailyPayload({ structured_observation: updatedObs });
      const r = await api.saveDaily(payload);

      setDetail((prev) => ({ ...prev, structured_observation: updatedObs }));
      if (!detail.id && r.id) {
        const d = await api.dailyDetail(r.id).catch(() => null);
        if (d) setDetail((prev) => ({ ...prev, ...d }));
      }
    } catch (e) {
      toast('err', e.message);
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    try {
      // Simpan dulu seluruh isian yang sedang diedit (observasi, catatan guru,
      // catatan wali) sebelum publish. Tanpa ini, teks yang diketik tapi belum
      // sempat diklik "Simpan" tidak ikut terkirim ke wali.
      const saved = await api.saveDaily(buildDailyPayload());
      const id = saved?.id || detail.id;
      if (!id) {
        toast('err', 'Gagal menyimpan laporan');
        return;
      }
      await api.publishDaily(id);
      toast('ok', 'Daily record dikirim ke wali');
      const d = await api.dailyDetail(id);
      setDetail(d);
    } catch (e) {
      toast('err', e.message);
    } finally {
      setBusy(false);
    }
  }
  async function sendComment() {
    try {
      await api.commentDaily(detail.id, comment);
      setComment('');
      setDetail(await api.dailyDetail(detail.id));
    } catch (e) {
      toast('err', e.message);
    }
  }
  async function upload(file) {
    try {
      if (!detail.id) {
        toast('err', 'Simpan dulu sebelum upload foto');
        return;
      }
      await api.uploadDailyPhoto(detail.id, file);
      setDetail(await api.dailyDetail(detail.id));
      toast('ok', 'Foto ditambahkan');
    } catch (e) {
      toast('err', e.message);
    }
  }
  async function deletePhoto(attId) {
    try {
      await api.deleteDailyPhoto(detail.id, attId);
      setDetail(await api.dailyDetail(detail.id));
      toast('ok', 'Foto dihapus');
    } catch (e) {
      toast('err', e.message);
    }
  }
  async function copyFormal() {
    const t = formalText(detail, row.nama);
    if (!t) return;
    try {
      await navigator.clipboard.writeText(t);
      toast('ok', 'Laporan disalin');
    } catch {
      toast('err', 'Gagal menyalin');
    }
  }
  const pct = completeness(detail);
  const formal = formalText(detail, row.nama);
  const required = [
    { label: 'Focus Theme', ok: !!detail.focus_theme_id },
    { label: 'Mood', ok: !!detail.mood },
    { label: 'Makan', ok: !!detail.makan },
    { label: 'Tidur', ok: detail.tidur !== null && detail.tidur !== undefined },
    { label: 'Domain', ok: !!detail.observation_domain },
    { label: 'Observasi', ok: noteOk(detail.observation_note) }
  ];
  if (preview) {
    const tidurText = detail.tidur === 1 ? 'Ya' : detail.tidur === 0 ? 'Tidak' : '-';
    return (
      <section className="bg-white border-0 sm:border border-slate-200 rounded-none sm:rounded-2xl p-0 sm:p-4 flex flex-col min-h-screen sm:min-h-0">
        <div className="sticky top-0 bg-white border-b border-slate-200 sm:border-0 px-4 py-3 sm:px-0 sm:py-0 flex justify-between items-center gap-3 mb-4 z-20">
          <h2 className="text-sm sm:text-lg font-black text-text-main truncate">Preview Tampilan Wali</h2>
          <div className="flex gap-2">
            <button onClick={() => setPreview(false)} className="btn-secondary h-9 rounded-lg font-medium px-4 text-xs">
              Kembali Edit
            </button>
            <button onClick={onClose} className="link text-xs">
              Tutup
            </button>
          </div>
        </div>
        <div className="p-4 sm:p-0 flex-1 overflow-y-auto">
          <div className="bg-slate-50 rounded-2xl p-4 sm:p-6 border border-slate-200 max-w-lg mx-auto space-y-4">
            <div>
              <div className="font-black text-text-main text-lg">{row.nama}</div>
              <div className="text-sm text-slate-500">{detail.tanggal || row.tanggal}</div>
            </div>
            {detail.focus_theme_title && (
              <div>
                <div className="text-xs text-slate-500 mb-1">Focus Theme</div>
                <div className="bg-white rounded-xl p-3 text-sm text-slate-700">
                  <div className="font-black text-text-main">{detail.focus_theme_title}</div>
                  {detail.focus_theme_activity_summary && (
                    <div className="mt-1 text-slate-600">{detail.focus_theme_activity_summary}</div>
                  )}
                </div>
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-xl p-3 text-center">
                <div className="text-xs text-slate-500">Mood</div>
                <div className="font-black text-text-main text-sm truncate">{detail.mood || '-'}</div>
              </div>
              <div className="bg-white rounded-xl p-3 text-center">
                <div className="text-xs text-slate-500">Makan</div>
                <div className="font-black text-text-main text-sm truncate" title={detail.focus_theme_menu_makanan}>
                  {detail.makan
                    ? `${detail.makan.toUpperCase()} ${detail.focus_theme_menu_makanan ? `(${detail.focus_theme_menu_makanan})` : ''}`
                    : '-'}
                </div>
              </div>
              <div className="bg-white rounded-xl p-3 text-center">
                <div className="text-xs text-slate-500">Tidur</div>
                <div className="font-black text-text-main text-sm truncate">{tidurText}</div>
              </div>
            </div>
            {detail.observation_note && (
              <div>
                <div className="text-xs text-slate-500 mb-1">Observasi Anak</div>
                <div className="bg-white rounded-xl p-3 text-sm text-slate-700">
                  <span className="font-black text-text-main">{detail.observation_domain || 'Observasi'}: </span>
                  {detail.observation_note}
                </div>
              </div>
            )}
            {detail.structured_observation &&
              (detail.structured_observation.activities || detail.structured_observation.pillars) && (
                <div className="bg-white rounded-xl p-4 space-y-4 border border-slate-100">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    Capaian Perkembangan
                  </div>

                  {detail.structured_observation.activities &&
                    Object.keys(detail.structured_observation.activities).length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs font-bold text-text-main">Rencana Kegiatan</div>
                        <div className="grid grid-cols-1 gap-2">
                          {Object.entries(detail.structured_observation.activities).map(([act, rating]) => (
                            <div
                              key={act}
                              className="flex justify-between items-center gap-3 p-2 bg-slate-50 rounded-lg text-xs border border-slate-100"
                            >
                              <span className="text-slate-700 font-medium">{act}</span>
                              <span
                                className={`px-2 py-0.5 rounded font-black text-[10px] border ${
                                  rating === 'BSB'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : rating === 'BSH'
                                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                                      : rating === 'MB'
                                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                                        : 'bg-red-50 text-red-700 border-red-200'
                                }`}
                              >
                                {rating}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {detail.structured_observation.pillars &&
                    Object.keys(detail.structured_observation.pillars).length > 0 && (
                      <div className="space-y-2 pt-3 border-t border-slate-100">
                        <div className="text-xs font-bold text-text-main">Pilar Karakter & Tilawati</div>
                        <div className="grid grid-cols-2 gap-2">
                          {Object.entries(detail.structured_observation.pillars).map(([pillar, rating]) => {
                            const labelMap = {
                              iqra: 'Tilawati',
                              akhlak: 'Akhlak',
                              aktif_mandiri: 'Aktif & Mandiri',
                              disiplin_tertib: 'Disiplin & Tertib'
                            };
                            return (
                              <div
                                key={pillar}
                                className="text-center p-2 bg-slate-50 rounded-lg text-xs border border-slate-100"
                              >
                                <div className="text-[10px] text-slate-400 font-semibold mb-1 truncate">
                                  {labelMap[pillar] || pillar}
                                </div>
                                <span
                                  className={`inline-block px-2.5 py-0.5 rounded font-black text-[10px] border ${
                                    rating === 'BSB'
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : rating === 'BSH'
                                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                                        : rating === 'MB'
                                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                                          : 'bg-red-50 text-red-700 border-red-200'
                                  }`}
                                >
                                  {rating}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                </div>
              )}
            {detail.parent_note && (
              <div>
                <div className="text-xs text-slate-500 mb-1">Catatan untuk wali</div>
                <div className="bg-white rounded-xl p-3 text-sm text-slate-700">{detail.parent_note}</div>
              </div>
            )}
            {activities.length > 0 && (
              <div>
                <div className="text-xs text-slate-500 mb-1">Aktivitas</div>
                <div className="flex flex-wrap gap-1">
                  {activities.map((a, i) => (
                    <span key={i} className="bg-white px-2 py-1 rounded-lg text-sm text-slate-700">
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {detail.catatan && (
              <div>
                <div className="text-xs text-slate-500 mb-1">Catatan</div>
                <div className="bg-white rounded-xl p-3 text-sm text-slate-700">{detail.catatan}</div>
              </div>
            )}
            {(detail.attachments || []).length > 0 && (
              <div>
                <div className="text-xs text-slate-500 mb-2">Foto</div>
                <div className="grid grid-cols-3 gap-2">
                  {(detail.attachments || []).map((a) => (
                    <img
                      key={a.id}
                      src={a.url}
                      className="aspect-square object-cover rounded-xl border border-slate-200 w-full"
                      alt="foto"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }
  const completedSteps = required.filter((x) => x.ok).length;
  const missingCount = required.length - completedSteps;
  const statusText = detail.status === 'published' ? 'Published' : 'Draft';
  const saveObservation = () => tap('observation_note', detail.observation_note || '');
  const saveTeacherNote = () => tap('catatan', detail.catatan || '');
  const saveParentNote = () => tap('parent_note', detail.parent_note || '');

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-none border-0 border-slate-200 bg-slate-50 sm:rounded-2xl sm:border lg:h-auto">
      <div className="flex-shrink-0 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-md lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={onClose}
              aria-label="Kembali"
              className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600 transition-all hover:bg-slate-200 active:scale-95"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={2.4} />
            </button>
            <div className="min-w-0">
              <div className="truncate text-sm font-black text-text-main">{row.nama}</div>
              <div className="truncate text-[11px] font-semibold text-slate-500">
                {row.rombel_nama} - {tanggal}
              </div>
            </div>
          </div>
          {busy && (
            <div className="h-4 w-4 flex-shrink-0 animate-spin rounded-full border-2 border-primary-container border-t-primary" />
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-5">
        <div className="sticky top-2 z-30 mb-4 lg:hidden">
          <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-lg shadow-slate-900/10 backdrop-blur-md">
            <button
              type="button"
              onClick={() => setMobileChecklistOpen((v) => !v)}
              aria-expanded={mobileChecklistOpen}
              className="w-full px-3.5 py-3 text-left active:scale-[0.99]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase text-slate-400">Checklist kirim</div>
                  <div className="truncate text-xs font-semibold text-slate-600">
                    {missingCount === 0 ? 'Siap dikirim' : `${missingCount} item belum lengkap`}
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <div className="rounded-xl bg-slate-50 px-2.5 py-1 text-right ring-1 ring-slate-200">
                    <div className="text-sm font-black tabular-nums text-text-main">
                      {completedSteps}/{required.length}
                    </div>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${mobileChecklistOpen ? 'rotate-180' : ''}`}
                    strokeWidth={2.5}
                  />
                </div>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </button>
            {mobileChecklistOpen && (
              <div className="space-y-1.5 border-t border-slate-100 bg-slate-50/80 px-3.5 pb-3 pt-2">
                {required.map((x) => (
                  <div
                    key={x.label}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${x.ok ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}
                  >
                    <span className={`text-xs font-black ${x.ok ? 'text-emerald-700' : 'text-slate-500'}`}>
                      {x.label}
                    </span>
                    {x.ok ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" strokeWidth={2.6} />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-slate-300" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
        <div className="mx-auto grid max-w-7xl gap-5 2xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-5">
            <header className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white lg:block">
              <div className="p-4 sm:p-5">
                <div className="flex items-start gap-4">
                  {row.foto ? (
                    <img
                      src={row.foto}
                      className="h-16 w-16 rounded-2xl object-cover sm:h-20 sm:w-20"
                      alt={row.nama}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="grid h-16 w-16 place-items-center rounded-2xl bg-slate-100 text-xl font-black text-slate-400 sm:h-20 sm:w-20">
                      {String(row.nama || '?').slice(0, 1)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-xl font-black leading-tight text-text-main sm:text-2xl">
                        {row.nama}
                      </h2>
                      <span
                        className={`rounded-lg border px-2 py-1 text-[10px] font-black ${detail.status === 'published' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}
                      >
                        {statusText}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                      {row.rombel_nama} - {detail.tanggal || row.tanggal}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        onClick={publish}
                        disabled={missingCount > 0 || busy}
                        title={
                          missingCount > 0
                            ? `Lengkapi dulu: ${required
                                .filter((x) => !x.ok)
                                .map((x) => x.label)
                                .join(', ')}`
                            : 'Kirim laporan harian ke wali'
                        }
                        className="btn gap-2"
                      >
                        <Send className="h-4 w-4" strokeWidth={2.4} />
                        Kirim ke Wali
                      </button>
                      <button onClick={() => setPreview(true)} className="btn-secondary gap-2">
                        <Eye className="h-4 w-4" strokeWidth={2.4} />
                        Preview
                      </button>
                      <label className="btn-secondary cursor-pointer gap-2">
                        <Camera className="h-4 w-4" strokeWidth={2.4} />
                        Tambah Foto
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
                        />
                      </label>
                      <button
                        onClick={onClose}
                        className="hidden h-9 items-center gap-2 rounded-lg bg-slate-100 px-3 text-sm font-bold text-slate-600 transition-all hover:bg-slate-200 active:scale-[0.98] lg:inline-flex"
                      >
                        <X className="h-4 w-4" strokeWidth={2.4} />
                        Tutup
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </header>

            {detail.focus_theme_id ? (
              <div className="bg-gradient-to-r from-primary/10 to-indigo-50/10 border border-primary/20 rounded-2xl p-4 sm:p-5 shadow-sm">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase text-primary-active mb-2">
                  <BookOpen className="h-4 w-4" strokeWidth={2.4} />
                  Konteks kelas hari ini
                </div>
                <h3 className="text-base font-black text-text-main leading-tight">{detail.focus_theme_title}</h3>
                {detail.focus_theme_menu_makanan && (
                  <div className="mt-2 text-xs text-slate-650 bg-white/60 w-fit px-2.5 py-1 border border-slate-100 rounded-lg">
                    🍽️ Menu makanan: <strong className="text-slate-800">{detail.focus_theme_menu_makanan}</strong>
                  </div>
                )}
                {detail.focus_theme_activity_summary && (
                  <div className="mt-3 text-xs text-slate-600 bg-white/45 border border-slate-200/60 rounded-xl p-3 whitespace-pre-wrap leading-relaxed">
                    {detail.focus_theme_activity_summary}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 sm:p-5 shadow-sm">
                <div className="flex items-center gap-2 text-[11px] font-black uppercase text-amber-700 mb-2">
                  <BookOpen className="h-4 w-4" strokeWidth={2.4} />
                  Tema Kelas Belum Diatur
                </div>
                <p className="text-xs text-amber-700 leading-relaxed">
                  Silakan atur tema & kegiatan kelas terlebih dahulu menggunakan tombol{' '}
                  <strong>"Atur Tema & Kegiatan Kelas"</strong> di daftar siswa sebelah kiri agar bisa mengisi laporan
                  harian.
                </p>
              </div>
            )}

            <section className="grid gap-5 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1fr)]">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                <h3 className="text-sm font-black text-text-main">Kondisi harian</h3>
                <div className="mt-4 space-y-5">
                  <div>
                    <p className="mb-2 text-xs font-black text-slate-500">Mood hari ini</p>
                    <div className="grid grid-cols-3 gap-2">
                      {MOOD_OPT.map((o) => (
                        <button
                          key={o.v}
                          onClick={() => tap('mood', o.v)}
                          className={`min-h-11 rounded-xl border-2 px-2 text-xs font-black transition-all duration-200 active:scale-95 ${detail.mood === o.v ? o.c + ' text-white border-transparent shadow-sm' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-primary/40 hover:bg-white'}`}
                        >
                          {o.l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 flex items-center justify-between gap-2 text-xs font-black text-slate-500">
                      <span>Makan siang</span>
                      {detail.focus_theme_menu_makanan && (
                        <span className="truncate text-[11px] font-bold normal-case text-slate-400">
                          Menu: {detail.focus_theme_menu_makanan}
                        </span>
                      )}
                    </p>
                    <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-3">
                      {MAKAN_OPT.map((o) => (
                        <button
                          key={o.v}
                          onClick={() => tap('makan', o.v)}
                          className={`min-h-11 rounded-xl border-2 px-2 text-xs font-black transition-all duration-200 active:scale-95 ${detail.makan === o.v ? o.c + ' text-white border-transparent shadow-sm' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-primary/40 hover:bg-white'}`}
                        >
                          {o.l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-black text-slate-500">Tidur siang</p>
                    <div className="grid max-w-xs grid-cols-2 gap-2">
                      {TIDUR_OPT.map((o) => (
                        <button
                          key={o.v}
                          onClick={() => tap('tidur', o.v)}
                          className={`min-h-11 rounded-xl border-2 px-2 text-xs font-black transition-all duration-200 active:scale-95 ${detail.tidur === o.v ? o.c + ' text-white border-transparent shadow-sm' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-primary/40 hover:bg-white'}`}
                        >
                          {o.l}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                <h3 className="text-sm font-black text-text-main">Aktivitas anak</h3>
                <div className="mt-4 space-y-5">
                  {activeActivities.length > 0 ? (
                    <div>
                      <div className="mb-2 text-xs font-black text-slate-500">Aktivitas Kegiatan Mingguan / Tema</div>
                      <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto pr-1">
                        {activeActivities.map((act) => {
                          const isSelected = activities.includes(act);
                          return (
                            <label
                              key={act}
                              className={`flex items-start gap-2.5 rounded-xl border p-3 text-xs font-bold transition-all duration-200 active:scale-[0.98] cursor-pointer ${
                                isSelected
                                  ? 'border-primary bg-primary-container/20 text-text-main font-black'
                                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-primary/40 hover:bg-white'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={!detail.focus_theme_id}
                                onChange={(e) => tapActivityCheckbox(act, e.target.checked)}
                                className="mt-[2px] h-4 w-4 shrink-0 rounded border-slate-300 text-primary focus:ring-primary/45 disabled:opacity-40"
                              />
                              <span className="block min-w-0 leading-snug">{act}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-400">
                      Belum ada rencana kegiatan Focus Theme untuk hari ini. Gunakan aktivitas tambahan di bawah.
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* Penilaian Capaian Perkembangan */}
            {activities.length > 0 && (
              <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
                <div>
                  <h3 className="text-sm font-black text-text-main">Penilaian Capaian Perkembangan</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Nilai tingkat perkembangan anak untuk setiap kegiatan hari ini.
                  </p>
                </div>
                <div className="space-y-2.5">
                  {activities.map((act) => {
                    const rating = (detail.structured_observation?.activities || {})[act] || 'BSH';
                    return (
                      <div
                        key={act}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2.5 bg-slate-50 rounded-xl border border-slate-200/65"
                      >
                        <span className="text-xs font-bold text-slate-700 leading-snug">{act}</span>
                        <div className="flex gap-1 shrink-0">
                          {['BB', 'MB', 'BSH', 'BSB'].map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => tapRating('activities', act, opt)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-black border transition-all duration-200 active:scale-95 ${
                                rating === opt
                                  ? opt === 'BSB'
                                    ? 'bg-emerald-500 text-white border-transparent shadow-sm'
                                    : opt === 'BSH'
                                      ? 'bg-primary text-white border-transparent shadow-sm'
                                      : opt === 'MB'
                                        ? 'bg-amber-500 text-white border-transparent shadow-sm'
                                        : 'bg-red-500 text-white border-transparent shadow-sm'
                                  : 'bg-white border-slate-200 text-slate-500 hover:border-primary/30'
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
              </section>
            )}

            {/* Pilar Karakter & Tilawati */}
            <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
              <div>
                <h3 className="text-sm font-black text-text-main">Pilar Karakter & Tilawati</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Penilaian perkembangan pilar & tilawati (biarkan - jika tidak ada kegiatan).
                </p>
              </div>
              <div className="space-y-2.5">
                {PILLAR_KEYS.map((p) => {
                  const rating = (detail.structured_observation?.pillars || {})[p.k] || null;
                  return (
                    <div
                      key={p.k}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2.5 bg-slate-50 rounded-xl border border-slate-200/65"
                    >
                      <span className="text-xs font-bold text-slate-700 leading-snug">{p.l}</span>
                      <div className="flex gap-1 items-center shrink-0">
                        {/* Reset Button */}
                        <button
                          type="button"
                          onClick={() => tapRating('pillars', p.k, null)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-black border transition-all duration-200 active:scale-95 ${
                            rating === null
                              ? 'bg-slate-500 text-white border-transparent shadow-sm'
                              : 'bg-white border-slate-200 text-slate-400 hover:border-slate-350'
                          }`}
                          title="Hapus Penilaian"
                        >
                          -
                        </button>
                        {['BB', 'MB', 'BSH', 'BSB'].map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => tapRating('pillars', p.k, opt)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-black border transition-all duration-200 active:scale-95 ${
                              rating === opt
                                ? opt === 'BSB'
                                  ? 'bg-emerald-500 text-white border-transparent shadow-sm'
                                  : opt === 'BSH'
                                    ? 'bg-primary text-white border-transparent shadow-sm'
                                    : opt === 'MB'
                                      ? 'bg-amber-500 text-white border-transparent shadow-sm'
                                      : 'bg-red-500 text-white border-transparent shadow-sm'
                                : 'bg-white border-slate-200 text-slate-550 hover:border-primary/30'
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
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black text-text-main">Observasi anak</h3>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Pilih domain, lalu tulis perilaku yang terlihat hari ini.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const existing = (detail.observation_note || '').trim();
                    if (
                      existing.length > 20 &&
                      !window.confirm('Catatan observasi yang sudah ada akan ditimpa. Lanjutkan?')
                    )
                      return;
                    const note = generatePedagogicalNote(row.nama, activities, detail.mood);
                    update('observation_note', note);
                  }}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-black text-emerald-700 transition-all hover:bg-emerald-100 active:scale-[0.98]"
                >
                  <Sparkles className="h-4 w-4" strokeWidth={2.4} />
                  Bantu deskripsi
                </button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {detail.observation_domain && !domainOptions(detail).includes(detail.observation_domain) ? (
                  <button
                    type="button"
                    onClick={() => tap('observation_domain', null)}
                    title="Klik untuk hapus domain ini"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-text-main bg-text-main px-3 py-2 text-xs font-black text-white transition-all duration-200 active:scale-95"
                  >
                    {detail.observation_domain}
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                ) : null}
                {domainOptions(detail).map((d) => (
                  <button
                    key={d}
                    onClick={() => tap('observation_domain', d)}
                    className={`rounded-lg border px-3 py-2 text-xs font-black transition-all duration-200 active:scale-95 ${detail.observation_domain === d ? 'border-text-main bg-text-main text-white' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-primary/40 hover:bg-white'}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  value={domainCustom}
                  onChange={(e) => setDomainCustom(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      tambahDomain();
                    }
                  }}
                  placeholder="Tulis domain lain…"
                  className="input h-9 flex-1 text-xs"
                />
                <button
                  type="button"
                  onClick={tambahDomain}
                  disabled={!domainCustom.trim() || busy}
                  className="inline-flex h-9 shrink-0 items-center rounded-lg border border-primary/40 bg-primary-container px-3 text-xs font-black text-primary transition-all hover:bg-primary/20 active:scale-[0.98] disabled:opacity-40"
                >
                  Tambah
                </button>
              </div>
              <div className="mt-4">
                <textarea
                  value={detail.observation_note || ''}
                  onChange={(e) => update('observation_note', e.target.value)}
                  onBlur={saveObservation}
                  rows={4}
                  placeholder="Contoh: Rafi menunggu giliran saat memakai krayon dan meminta bantuan ketika tutupnya sulit dibuka."
                  className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-relaxed focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  {detail.observation_note && !noteOk(detail.observation_note) ? (
                    <p className="text-xs font-bold text-primary-active">Minimal 12 karakter agar bisa dikirim.</p>
                  ) : (
                    <p className="text-xs font-semibold text-slate-400">Catatan ini tampil di laporan wali.</p>
                  )}
                  <button
                    onClick={saveObservation}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-text-main px-4 text-sm font-bold text-white transition-all hover:opacity-90 active:scale-[0.98]"
                  >
                    {tersimpanField === 'observation_note' ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Tersimpan
                      </>
                    ) : (
                      'Simpan observasi'
                    )}
                  </button>
                </div>
              </div>
              <div className="mt-5 border-t border-slate-100 pt-4">
                <div className="mb-2 text-xs font-black text-slate-500">Aktivitas tambahan</div>
                <div className="flex flex-wrap gap-2">
                  {AKTIVITAS.map((a) => {
                    const on = activities.includes(a);
                    return (
                      <button
                        key={a}
                        disabled={!detail.focus_theme_id}
                        onClick={() => tapActivityCheckbox(a, !on)}
                        className={`rounded-lg border px-3 py-2 text-xs font-bold transition-all duration-200 active:scale-95 disabled:opacity-40 ${on ? 'border-primary bg-primary text-white' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-primary/40 hover:bg-white'}`}
                      >
                        {a}
                      </button>
                    );
                  })}
                  {activities
                    .filter((a) => !AKTIVITAS.includes(a) && !activeActivities.includes(a))
                    .map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => tapActivityCheckbox(a, false)}
                        title="Klik untuk hapus aktivitas ini"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-primary bg-primary px-3 py-2 text-xs font-bold text-white transition-all duration-200 active:scale-95"
                      >
                        {a}
                        <X className="h-3 w-3" aria-hidden="true" />
                      </button>
                    ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    value={activityCustom}
                    onChange={(e) => setActivityCustom(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        tambahAktivitas();
                      }
                    }}
                    placeholder="Tulis aktivitas lain…"
                    className="input h-9 flex-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={tambahAktivitas}
                    disabled={!activityCustom.trim() || busy}
                    className="inline-flex h-9 shrink-0 items-center rounded-lg border border-primary/40 bg-primary-container px-3 text-xs font-black text-primary transition-all hover:bg-primary/20 active:scale-[0.98] disabled:opacity-40"
                  >
                    Tambah
                  </button>
                </div>
              </div>
            </section>

            <section className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                <h3 className="text-sm font-black text-text-main">Catatan tambahan</h3>
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="label">Catatan guru</label>
                    <textarea
                      value={detail.catatan || ''}
                      onChange={(e) => update('catatan', e.target.value)}
                      onBlur={saveTeacherNote}
                      rows={3}
                      placeholder="Tambahkan catatan khusus untuk hari ini…"
                      className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    <button
                      onClick={saveTeacherNote}
                      className="mt-2 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-bold text-white transition-all hover:bg-primary-hover active:scale-[0.98]"
                    >
                      {tersimpanField === 'catatan' ? (
                        <>
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Tersimpan
                        </>
                      ) : (
                        'Simpan catatan guru'
                      )}
                    </button>
                  </div>
                  <div className="border-t border-slate-100 pt-4">
                    <label className="label">Catatan untuk wali</label>
                    <textarea
                      value={detail.parent_note || ''}
                      onChange={(e) => update('parent_note', e.target.value)}
                      onBlur={saveParentNote}
                      rows={2}
                      placeholder="Opsional. Info singkat yang perlu diketahui wali."
                      className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    <button
                      onClick={saveParentNote}
                      className="mt-2 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.98]"
                    >
                      {tersimpanField === 'parent_note' ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" /> Tersimpan
                        </>
                      ) : (
                        'Simpan catatan wali'
                      )}
                    </button>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-black text-text-main">Dokumentasi foto</h3>
                  <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg bg-slate-100 px-3 text-xs font-black text-slate-600 transition-all hover:bg-slate-200 active:scale-95">
                    <Camera className="h-4 w-4" strokeWidth={2.4} />
                    Upload
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
                    />
                  </label>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3">
                  {(detail.attachments || []).map((a) => (
                    <div
                      key={a.id}
                      className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                    >
                      <img
                        src={a.url}
                        className="aspect-square w-full object-cover"
                        alt="foto daily record"
                        loading="lazy"
                        decoding="async"
                      />
                      <button
                        onClick={() => deletePhoto(a.id)}
                        aria-label="Hapus foto"
                        className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-lg bg-red-600 text-white opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                      >
                        <X className="h-4 w-4" strokeWidth={2.6} />
                      </button>
                    </div>
                  ))}
                  {(!detail.attachments || detail.attachments.length === 0) && (
                    <div className="col-span-full rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-semibold text-slate-400">
                      Belum ada foto yang diunggah.
                    </div>
                  )}
                </div>
              </div>
            </section>

            {formal && (
              <section className="rounded-2xl border border-sky-200 bg-sky-50 p-4 sm:p-5">
                <div className="flex items-center gap-2 text-xs font-black uppercase text-sky-700">
                  <ClipboardCheck className="h-4 w-4" strokeWidth={2.4} />
                  Preview laporan formal
                </div>
                <p className="mt-3 text-sm leading-relaxed text-sky-900">{formal}</p>
                <button
                  onClick={copyFormal}
                  className="mt-3 h-9 rounded-lg bg-sky-700 px-4 text-sm font-bold text-white transition-all hover:bg-sky-800 active:scale-[0.98]"
                >
                  Copy laporan
                </button>
              </section>
            )}
            {edits && edits.length > 0 && (
              <section className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="text-xs font-black uppercase text-slate-400">Riwayat perubahan</h3>
                <div className="mt-3 max-h-32 space-y-2 overflow-y-auto">
                  {edits.map((l, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-slate-300" />
                      <span>
                        {l.created_at?.slice(0, 16).replace('T', ' ')} - {l.guru_nama || 'Sistem'}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside className="space-y-5 2xl:sticky 2xl:top-5 2xl:self-start">
            <section className="hidden rounded-2xl border border-slate-200 bg-white p-4 lg:block">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-black text-text-main">Checklist kirim</h3>
                  <p className="text-xs font-semibold text-slate-500">
                    {missingCount === 0 ? 'Laporan siap dipublish.' : `${missingCount} item belum lengkap.`}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-xl font-black tabular-nums text-text-main">{pct}%</div>
                  <div className="text-[10px] font-black uppercase text-slate-400">Lengkap</div>
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-4 space-y-2">
                {required.map((x) => (
                  <div
                    key={x.label}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${x.ok ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}
                  >
                    <span className={`text-xs font-black ${x.ok ? 'text-emerald-700' : 'text-slate-500'}`}>
                      {x.label}
                    </span>
                    {x.ok ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" strokeWidth={2.6} />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-slate-300" />
                    )}
                  </div>
                ))}
              </div>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-slate-500" strokeWidth={2.4} />
                <h3 className="font-black text-text-main">Feedback Wali</h3>
              </div>
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {(detail.comments || []).map((c) => (
                  <div key={c.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs font-black text-slate-500">
                      {c.author_name} - {c.author_role}
                    </div>
                    <div className="mt-1 text-sm text-text-main">{c.body}</div>
                  </div>
                ))}
                {(!detail.comments || detail.comments.length === 0) && (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-400">
                    Belum ada komentar.
                  </div>
                )}
              </div>
              {detail.status === 'published' && (
                <div className="mt-3 flex gap-2">
                  <input
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    autoComplete="off"
                    className="input min-w-0 flex-1 bg-white"
                    placeholder="Balas wali…"
                  />
                  <button onClick={sendComment} className="btn px-3" aria-label="Kirim feedback">
                    <Send className="h-4 w-4" strokeWidth={2.4} />
                  </button>
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>

      <div className="flex flex-shrink-0 gap-2 border-t border-slate-200/80 bg-white/95 p-3 backdrop-blur-md lg:hidden">
        <button
          onClick={publish}
          disabled={missingCount > 0 || busy}
          className="btn h-10 flex-1 gap-1 px-2 text-[11px] font-bold"
        >
          <Send className="h-4 w-4" strokeWidth={2.4} />
          {missingCount > 0 ? `Lengkapi ${missingCount}` : 'Kirim'}
        </button>
        <button onClick={() => setPreview(true)} className="btn-secondary h-10 gap-1 px-3 text-[11px] font-bold">
          <Eye className="h-4 w-4" strokeWidth={2.4} />
          Preview
        </button>
        <label className="btn-secondary h-10 cursor-pointer gap-1 px-3 text-[11px] font-bold">
          <Camera className="h-4 w-4" strokeWidth={2.4} />
          Foto
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
        </label>
      </div>
    </section>
  );
}
