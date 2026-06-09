import { useState, useEffect, useRef, useMemo } from 'react';
import { api } from '../api';
import { ActionButton, IconButton, CustomSelect, CustomDatePicker, Modal } from '../components/Shared';
import { todayWIB } from '../utils/date';
import { RefreshCw, Upload, FilePlus, Pencil, X, Save } from 'lucide-react';

function useMaster(user, { autoDefaultCabang = false } = {}) {
  const [cabang, setCabang] = useState([]);
  const [jenjang, setJenjang] = useState([]);
  const [rombel, setRombel] = useState([]);
  const [cabangId, setCabangId] = useState(user.role === 'admin' ? '' : user.cabang_id);

  async function load() {
    const [c, j] = await Promise.all([api.cabang(), api.jenjang()]);
    setCabang(c);
    setJenjang(j);
    const preferred = c.find(x => x.kode === 'GDN' && x.aktif) || c.find(x => x.aktif) || c[0];
    const cid = cabangId || (autoDefaultCabang ? preferred?.id : '');
    if (user.role === 'admin' && !cabangId && cid) setCabangId(cid);
    setRombel(await api.rombel(cid));
  }

  useEffect(() => {
    load().catch(() => {});
  }, [cabangId]);

  return { cabang, jenjang, rombel, cabangId, setCabangId, load };
}

function CabangFilter({ user, cabang, cabangId, setCabangId, className = '', plain = false }) {
  if (user.role !== 'admin') return null;
  const classes = plain ? className : `px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm ${className}`;
  return (
    <CustomSelect value={cabangId} onChange={e => setCabangId(e.target.value)} className={classes}>
      <option value="">Semua Cabang</option>
      {cabang.map(c => <option key={c.id} value={c.id}>{c.nama}</option>)}
    </CustomSelect>
  );
}

function Panel({ title, right, children, className = '' }) {
  return (
    <section className={`bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 max-w-full overflow-hidden shadow-[0_18px_60px_rgba(15,23,42,.05)] ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <div className="inline-flex rounded-full bg-primary-container px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-primary">Rencana kelas</div>
          <h2 className="mt-2 text-lg font-black text-text-main tracking-[-0.01em]">{title}</h2>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Input({ value, onChange, placeholder, className = '', ...props }) {
  if (props.type === 'date') {
    return <CustomDatePicker value={value} onChange={onChange} placeholder={placeholder} className={`input w-full ${className}`} disabled={props.disabled} />;
  }
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`input w-full ${className}`}
      {...props}
    />
  );
}

function Textarea({ label, value, onChange, placeholder }) {
  return (
    <div>
      <div className="label">{label}</div>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="input w-full min-h-20 resize-none"
      />
    </div>
  );
}

const normalizeActivities = (v) => {
  const result = {};
  const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
  
  let parsed = {};
  if (v && typeof v === 'object') {
    parsed = v;
  } else if (v && typeof v === 'string') {
    try {
      parsed = JSON.parse(v || '{}');
    } catch {}
  }

  DAYS.forEach(day => {
    const dayData = parsed[day] || {};
    result[day] = {
      opening: Array.isArray(dayData.opening) ? dayData.opening.filter(Boolean) : [],
      focus_theme: Array.isArray(dayData.focus_theme) ? dayData.focus_theme.filter(Boolean) : [],
      break: Array.isArray(dayData.break) ? dayData.break.filter(Boolean) : [],
      closing: Array.isArray(dayData.closing) ? dayData.closing.filter(Boolean) : []
    };
  });

  return result;
};

export default function KegiatanMingguanTab({ user, toast }) {
  const m = useMaster(user, { autoDefaultCabang: false });

  const leadRombels = useMemo(() => {
    if (user.role !== 'guru') return [];
    return m.rombel.filter(r => r.gurus?.some(g => String(g.id) === String(user.id) && g.role === 'utama'));
  }, [user?.id, user?.role, m.rombel]);

  const allowedJenjangIds = useMemo(() => {
    return Array.from(new Set(leadRombels.map(r => String(r.jenjang_id))));
  }, [leadRombels]);

  const isLeadTeacher = useMemo(() => {
    if (user.role === 'admin' || user.role === 'admin_cabang' || user.role === 'kepsek') return true;
    return leadRombels.length > 0;
  }, [user?.role, leadRombels]);

  const canEditRow = (row) => {
    if (user.role === 'admin' || user.role === 'admin_cabang' || user.role === 'kepsek') return true;
    if (user.role === 'guru') {
      if (row.rombel_id) {
        return leadRombels.some(r => String(r.id) === String(row.rombel_id));
      }
      if (row.jenjang_id) {
        return allowedJenjangIds.includes(String(row.jenjang_id));
      }
    }
    return false;
  };
  const today = todayWIB();
  const empty = {
    id: null,
    cabang_id: m.cabangId || '',
    title: '',
    week_start: today,
    week_end: today,
    jenjang_id: '',
    rombel_id: '',
    paket: '',
    goals: '',
    suggested_activities: normalizeActivities(null),
    suggested_domains: '',
    attachment_url: '',
    parsed_metadata: null
  };

  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(empty);
  const [openForm, setOpenForm] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [tanggal, setTanggal] = useState(today);
  const [filterJenjang, setFilterJenjang] = useState('');
  const [filterRombel, setFilterRombel] = useState('');
  const [busy, setBusy] = useState(false);
  const [parseBusy, setParseBusy] = useState(false);
  const [parsedFrom, setParsedFrom] = useState(null);
  const [activeDay, setActiveDay] = useState('Senin');

  const renderSectionBuilder = (targetState, setTargetState, sectionKey, sectionLabel) => {
    const currentActs = targetState.suggested_activities?.[activeDay]?.[sectionKey] || [];
    
    const updateItem = (idx, newVal) => {
      const updated = [...currentActs];
      updated[idx] = newVal;
      setTargetState(prev => ({
        ...prev,
        suggested_activities: {
          ...prev.suggested_activities,
          [activeDay]: {
            ...prev.suggested_activities[activeDay],
            [sectionKey]: updated
          }
        }
      }));
    };

    const removeItem = (idx) => {
      const updated = currentActs.filter((_, i) => i !== idx);
      setTargetState(prev => ({
        ...prev,
        suggested_activities: {
          ...prev.suggested_activities,
          [activeDay]: {
            ...prev.suggested_activities[activeDay],
            [sectionKey]: updated
          }
        }
      }));
    };

    const addItem = () => {
      setTargetState(prev => ({
        ...prev,
        suggested_activities: {
          ...prev.suggested_activities,
          [activeDay]: {
            ...prev.suggested_activities[activeDay],
            [sectionKey]: [...currentActs, '']
          }
        }
      }));
    };

    return (
      <div className="bg-white p-3 rounded-xl border border-slate-200/80 space-y-2">
        <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{sectionLabel}</div>
        
        <div className="space-y-1.5">
          {currentActs.map((act, idx) => (
            <div key={idx} className="flex gap-1.5 items-center">
              <input
                type="text"
                value={act}
                onChange={(e) => updateItem(idx, e.target.value)}
                placeholder="Rencana kegiatan…"
                className="w-full text-xs h-8 px-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                type="button"
                onClick={() => removeItem(idx)}
        className="w-8 h-8 rounded-lg border border-slate-200 hover:border-red-200 hover:bg-red-50 text-slate-400 hover:text-red-600 transition-all flex items-center justify-center shrink-0"
        title="Hapus"
      >
                <X className="w-3.5 h-3.5" strokeWidth={2.4}/>
      </button>
            </div>
          ))}
          {currentActs.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-center text-[11px] font-bold text-slate-400">Belum ada kegiatan di bagian ini.</p>
          )}
        </div>

        <button
          type="button"
          onClick={addItem}
          className="w-full h-8 border border-dashed border-slate-300 hover:border-primary/50 text-[11px] font-bold text-slate-600 hover:text-primary rounded-lg transition-all"
        >
          Tambah Kegiatan
        </button>
      </div>
    );
  };

  const fileInputRef = useRef(null);

  async function parseFile(file) {
    if (!file) return;
    setParseBusy(true);
    try {
      const result = await api.parseModulAjar(file);
      const norm = normalizeActivities(result.suggested_activities);

      // Auto-match rombel and jenjang based on result.metadata.kelompok
      let matchedRombelId = '';
      let matchedJenjangId = '';
      let matchedCabangId = '';
      if (result.metadata?.kelompok && m.rombel) {
        const cleanExtracted = result.metadata.kelompok.toLowerCase()
          .replace(/kelompok/g, '')
          .replace(/usia/g, '')
          .replace(/kelas/g, '')
          .replace(/tahun/g, '')
          .replace(/[^a-z0-9]/g, '')
          .trim();
        
        const matched = m.rombel.find(r => {
          if (m.cabangId && String(r.cabang_id) !== String(m.cabangId)) return false;
          if (user.role === 'guru' && !leadRombels.some(lr => String(lr.id) === String(r.id))) return false;
          const cleanName = r.nama.toLowerCase()
            .replace(/kelompok/g, '')
            .replace(/usia/g, '')
            .replace(/kelas/g, '')
            .replace(/tahun/g, '')
            .replace(/[^a-z0-9]/g, '')
            .trim();
          return cleanExtracted === cleanName || cleanExtracted.includes(cleanName) || cleanName.includes(cleanExtracted);
        });

        if (matched) {
          matchedRombelId = matched.id;
          matchedJenjangId = matched.jenjang_id;
          matchedCabangId = matched.cabang_id;
        }
      }

      setForm(f => ({
        ...f,
        cabang_id: matchedCabangId || f.cabang_id || m.cabangId || '',
        title: result.title || f.title,
        goals: (result.goals || []).join('\n'),
        suggested_activities: norm,
        suggested_domains: (result.suggested_domains || []).join('\n'),
        rombel_id: matchedRombelId || f.rombel_id,
        jenjang_id: matchedJenjangId || f.jenjang_id,
        parsed_metadata: result.metadata || null
      }));
      setParsedFrom(result.file_name || file.name);
      setOpenForm(true);
      setActiveDay('Senin');
      toast('ok', matchedRombelId ? 'Data berhasil diekstrak & rombel otomatis dipilih!' : 'Data berhasil diekstrak dari file');
    } catch (e) {
      toast('err', 'Gagal memproses file: ' + e.message);
    } finally {
      setParseBusy(false);
    }
  }

  const parseList = v => String(v || '').split(/[\n,]/).map(x => x.trim()).filter(Boolean);
  const joinList = v => Array.isArray(v) ? v.join(', ') : String(v || '');
  
  const scopedRombel = draft => {
    const cid = draft.cabang_id || m.cabangId;
    if (!cid) return [];
    return m.rombel.filter(r => 
      String(r.cabang_id) === String(cid) &&
      (!draft.jenjang_id || String(r.jenjang_id) === String(draft.jenjang_id)) &&
      (user.role !== 'guru' || leadRombels.some(lr => String(lr.id) === String(r.id)))
    );
  };

  const filteredRows = rows.filter(r => 
    (!filterJenjang || String(r.jenjang_id) === String(filterJenjang)) &&
    (!filterRombel || String(r.rombel_id) === String(filterRombel))
  );

  async function load() {
    if (user.role !== 'admin' && !m.cabangId) return;
    const data = await api.modulAjar({ cabang_id: m.cabangId || '', tanggal });
    setRows(data);
  }

  useEffect(() => {
    load().catch(e => toast('err', e.message));
  }, [m.cabangId, tanggal]);

  useEffect(() => {
    setFilterRombel('');
  }, [m.cabangId]);

  function reset() {
    setForm(empty);
    setActiveDay('Senin');
  }

  function edit(row) {
    const norm = normalizeActivities(row.suggested_activities);
    setEditForm({
      id: row.id,
      cabang_id: row.cabang_id || '',
      title: row.title || '',
      week_start: row.week_start || today,
      week_end: row.week_end || row.week_start || today,
      jenjang_id: row.jenjang_id || '',
      rombel_id: row.rombel_id || '',
      paket: row.paket || '',
      goals: joinList(row.goals),
      suggested_activities: norm,
      suggested_domains: joinList(row.suggested_domains),
      attachment_url: row.attachment_url || ''
    });
    setActiveDay('Senin');
  }

  async function save(draft = form) {
    if (!draft.title.trim()) {
      toast('err', 'Judul Focus Theme wajib diisi');
      return;
    }
    if (!draft.week_start || !draft.week_end) {
      toast('err', 'Periode minggu wajib diisi');
      return;
    }
    const finalCabangId = draft.cabang_id || m.cabangId;
    if (!finalCabangId) {
      toast('err', 'Pilih cabang terlebih dahulu');
      return;
    }
    if (user.role === 'guru') {
      if (!draft.jenjang_id && !draft.rombel_id) {
        toast('err', 'Anda harus memilih jenjang atau rombel');
        return;
      }
      const hasPerm = canEditRow(draft);
      if (!hasPerm) {
        toast('err', 'Anda tidak memiliki hak akses untuk jenjang atau rombel yang dipilih');
        return;
      }
    }
    if (draft.rombel_id) {
      const rombel = m.rombel.find(r => String(r.id) === String(draft.rombel_id));
      if (rombel && String(rombel.cabang_id) !== String(finalCabangId)) {
        toast('err', 'Rombel tidak sesuai cabang');
        return;
      }
      if (rombel && draft.jenjang_id && String(rombel.jenjang_id) !== String(draft.jenjang_id)) {
        toast('err', 'Jenjang tidak sesuai rombel');
        return;
      }
    }
    const payload = {
      cabang_id: finalCabangId,
      jenjang_id: draft.jenjang_id || null,
      rombel_id: draft.rombel_id || null,
      paket: draft.paket || null,
      title: draft.title.trim(),
      week_start: draft.week_start,
      week_end: draft.week_end,
      goals: parseList(draft.goals),
      suggested_activities: draft.suggested_activities,
      suggested_domains: parseList(draft.suggested_domains),
      attachment_url: draft.attachment_url?.trim() || null
    };
    setBusy(true);
    try {
      if (draft.id) await api.updateModulAjar(draft.id, payload);
      else await api.createModulAjar(payload);
      toast('ok', draft.id ? 'Focus Theme diperbarui' : 'Focus Theme dibuat');
      if (draft.id) setEditForm(null);
      else {
        reset();
        setOpenForm(false);
      }
      load();
    } catch (e) {
      toast('err', e.message);
    } finally {
      setBusy(false);
    }
  }

  const right = isLeadTeacher ? (
    <div className="grid grid-cols-2 sm:flex sm:flex-row gap-2 w-full sm:w-auto">
      <input
        ref={fileInputRef}
        type="file"
        accept=".doc,.docx,.pdf"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) parseFile(f);
          e.target.value = '';
        }}
      />
      <ActionButton
        icon={parseBusy ? RefreshCw : Upload}
        onClick={() => fileInputRef.current?.click()}
        variant="secondary"
        disabled={parseBusy}
        className={parseBusy ? 'animate-pulse' : ''}
      >
        {parseBusy ? 'Mengekstrak...' : 'Upload & Parse'}
      </ActionButton>
      <ActionButton
        icon={FilePlus}
        onClick={() => {
          const defaultJenjangId = user.role === 'guru' && allowedJenjangIds.length > 0 ? allowedJenjangIds[0] : '';
          setForm({
            ...empty,
            jenjang_id: defaultJenjangId
          });
          setParsedFrom(null);
          setOpenForm(true);
        }}
      >
        Tambah Focus Theme
      </ActionButton>
    </div>
  ) : null;

  return (
    <Panel title="Focus Theme Mingguan" right={right}>
      <div className="space-y-4 min-w-0">
        <div className={`grid grid-cols-2 ${user.role === 'admin' ? 'sm:grid-cols-5' : 'sm:grid-cols-4'} gap-2`}>
          <CabangFilter user={user} {...m} plain className="input w-full" />
          <CustomDatePicker value={tanggal} onChange={setTanggal} className="input w-full" />
          <CustomSelect value={filterJenjang} onChange={e => { setFilterJenjang(e.target.value); setFilterRombel(''); }} className="input">
            <option value="">Semua jenjang</option>
            {m.jenjang.map(j => <option key={j.id} value={j.id}>{j.nama}</option>)}
          </CustomSelect>
          <CustomSelect value={filterRombel} onChange={e => setFilterRombel(e.target.value)} className="input">
            <option value="">Semua rombel</option>
            {m.rombel.filter(r => !filterJenjang || String(r.jenjang_id) === String(filterJenjang)).map(r =>
              <option key={r.id} value={r.id}>{r.nama}{!m.cabangId ? ` (${r.cabang_nama})` : ''}</option>
            )}
          </CustomSelect>
          <ActionButton icon={RefreshCw} onClick={load} variant="secondary" className="w-full col-span-2 sm:col-span-1">Refresh</ActionButton>
        </div>
        <div className="overflow-x-auto max-w-full rounded-xl border border-slate-100 custom-scrollbar">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr>
                {['Minggu', 'Judul Rencana', 'Cabang', 'Jenjang', 'Rombel', 'Aktivitas', 'Domain', 'Dibuat oleh', ''].map((h, i) => (
                  <th key={`${i}-${h}`} className={`text-left py-2 px-3 bg-slate-50 text-slate-500 font-black ${i === 8 ? 'sticky right-0 z-10 border-l border-slate-200/80' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map(r => (
                <tr key={r.id} className={editForm?.id === r.id ? 'bg-primary-container' : 'bg-white'}>
                  <td className="py-2 px-3 text-slate-600 whitespace-nowrap">{r.week_start} - {r.week_end}</td>
                  <td className="py-2 px-3 font-black text-text-main min-w-56">{r.title}</td>
                  <td className="py-2 px-3 text-slate-600 font-bold">{r.cabang_nama || '-'}</td>
                  <td className="py-2 px-3 text-slate-600">{r.jenjang_nama || '-'}</td>
                  <td className="py-2 px-3 text-slate-600">{r.rombel_nama || 'Semua rombel'}</td>
                  <td className="py-2 px-3 text-slate-600 max-w-48">
                    {(() => {
                      const norm = normalizeActivities(r.suggested_activities);
                      const allActs = Object.values(norm).reduce((acc, day) => {
                        return [...acc, ...(day.opening || []), ...(day.focus_theme || []), ...(day.break || []), ...(day.closing || [])];
                      }, []);
                      return allActs.length > 0
                        ? <span title={allActs.join(', ')}>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-container text-primary-active rounded-full text-[10px] font-black">{allActs.length} kegiatan</span>
                            <span className="block text-[11px] text-slate-500 mt-0.5 truncate max-w-40">{allActs.slice(0, 2).join(', ')}{allActs.length > 2 ? '…' : ''}</span>
                          </span>
                        : <span className="text-slate-300 text-xs">-</span>;
                    })()}
                  </td>
                  <td className="py-2 px-3 text-slate-600 max-w-64">{(r.suggested_domains || []).join(', ') || '-'}</td>
                  <td className="py-2 px-3 text-slate-600">{r.created_by_name || '-'}</td>
                  <td className="py-2 px-3 sticky right-0 z-10 bg-white border-l border-slate-200/80">
                    {canEditRow(r) ? (
                      <IconButton icon={Pencil} label={`Edit Focus Theme ${r.title}`} onClick={() => edit(r)} size="sm" />
                    ) : (
                      <span className="text-slate-400 text-xs italic font-bold">View-only</span>
                    )}
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8">
                    <div className="mx-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-bold text-slate-400">Belum ada Focus Theme mingguan untuk filter ini.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {openForm && (
        <Modal title={parsedFrom ? 'Tambah Focus Theme (dari file)' : 'Tambah Focus Theme'} onClose={() => { setOpenForm(false); setParsedFrom(null); }}>
          <div className="space-y-3">
            {parsedFrom && (
              <div className="flex flex-col gap-1.5 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                <div className="flex items-center gap-2">
                  <div>
                    <div className="text-xs font-black text-emerald-700">Data diekstrak otomatis dari file</div>
                    <div className="text-[11px] text-emerald-600 truncate max-w-xs">{parsedFrom}</div>
                  </div>
                  <button onClick={() => { setParsedFrom(null); setForm(f => ({ ...f, parsed_metadata: null })); }} className="ml-auto text-emerald-500 hover:text-emerald-700 rounded-lg p-1 hover:bg-emerald-100" aria-label="Hapus data ekstraksi"><X className="w-4 h-4"/></button>
                </div>
                {form.parsed_metadata && (
                  <div className="text-[10px] bg-white/60 border border-emerald-100/50 rounded-lg px-2.5 py-1 text-emerald-800 flex flex-wrap gap-x-3 gap-y-1 mt-0.5">
                    {form.parsed_metadata.kelompok && <span>Kelompok: <strong>{form.parsed_metadata.kelompok}</strong></span>}
                    {form.parsed_metadata.semester && <span>Semester: <strong>{form.parsed_metadata.semester}</strong></span>}
                    {form.parsed_metadata.minggu && <span>Weeks: <strong>Minggu {form.parsed_metadata.minggu}</strong></span>}
                  </div>
                )}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white p-3 rounded-2xl border border-slate-200/80">
              {user.role === 'admin' && (
                <div className="sm:col-span-2">
                  <label className="label text-[11px] font-bold text-slate-500 mb-1 block">Cabang Sekolah</label>
                  <CustomSelect value={form.cabang_id} onChange={e => setForm(f => ({ ...f, cabang_id: e.target.value, rombel_id: '' }))} className="input w-full">
                    <option value="">Pilih Cabang</option>
                    {m.cabang.map(c => <option key={c.id} value={c.id}>{c.nama}</option>)}
                  </CustomSelect>
                </div>
              )}

              <div className="sm:col-span-2">
                <label className="label text-[11px] font-bold text-slate-500 mb-1 block">Judul Rencana Kegiatan</label>
                <div className="relative">
                  {parsedFrom && form.title && <span className="absolute -top-1.5 right-2 text-[9px] font-black text-emerald-600 bg-emerald-50 px-1.5 rounded-full border border-emerald-200">AI ✨</span>}
                  <Input placeholder="Judul rencana kegiatan" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} />
                </div>
              </div>

              <div>
                <label className="label text-[11px] font-bold text-slate-500 mb-1 block">Mulai Minggu</label>
                <CustomDatePicker value={form.week_start} onChange={v => setForm(f => ({ ...f, week_start: v }))} className="input w-full" />
              </div>
              <div>
                <label className="label text-[11px] font-bold text-slate-500 mb-1 block">Sampai Minggu</label>
                <CustomDatePicker value={form.week_end} onChange={v => setForm(f => ({ ...f, week_end: v }))} className="input w-full" />
              </div>

              <div>
                <label className="label text-[11px] font-bold text-slate-500 mb-1 block">Jenjang</label>
                <CustomSelect value={form.jenjang_id} onChange={e => setForm(f => ({ ...f, jenjang_id: e.target.value, rombel_id: '' }))} className="input w-full">
                  {user.role !== 'guru' && <option value="">Semua jenjang</option>}
                  {m.jenjang
                    .filter(j => user.role !== 'guru' || allowedJenjangIds.includes(String(j.id)))
                    .map(j => <option key={j.id} value={j.id}>{j.nama}</option>)}
                </CustomSelect>
              </div>
              <div>
                <label className="label text-[11px] font-bold text-slate-500 mb-1 block">Rombongan Belajar (Rombel)</label>
                <CustomSelect value={form.rombel_id} onChange={e => setForm(f => ({ ...f, rombel_id: e.target.value }))} className="input w-full">
                  <option value="">Semua rombel</option>
                  {scopedRombel(form).map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}
                </CustomSelect>
              </div>

              <div className="sm:col-span-2">
                <label className="label text-[11px] font-bold text-slate-500 mb-1 block">Paket Program</label>
                <CustomSelect value={form.paket} onChange={e => setForm(f => ({ ...f, paket: e.target.value }))} className="input w-full">
                  <option value="">Semua paket</option>
                  <option value="reguler">Reguler</option>
                  <option value="full_day">Full day</option>
                  <option value="care">Care</option>
                </CustomSelect>
              </div>
            </div>
            
            <div className="relative">
              {parsedFrom && form.goals && <span className="absolute -top-1.5 right-2 text-[9px] font-black text-emerald-600 bg-emerald-50 px-1.5 rounded-full border border-emerald-200">AI ✨</span>}
              <Textarea label="Tujuan pembelajaran" value={form.goals} onChange={v => setForm(f => ({ ...f, goals: v }))} placeholder="Pisahkan dengan koma atau baris baru" />
            </div>
            
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-black text-slate-500 uppercase tracking-wider">Rangkaian Kegiatan Harian</span>
                {parsedFrom && <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-1.5 rounded-full border border-emerald-200">AI ✨</span>}
              </div>
              
              {/* Day Tabs */}
              <div className="flex border-b border-slate-200 gap-1 overflow-x-auto pb-1">
                {['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'].map(day => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setActiveDay(day)}
                    className={`px-3 py-1.5 text-xs font-black rounded-t-lg transition-all duration-200 shrink-0 ${
                      activeDay === day ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                {renderSectionBuilder(form, setForm, 'opening', 'Pembuka (Opening)')}
                {renderSectionBuilder(form, setForm, 'focus_theme', 'Inti (Focus Theme)')}
                {renderSectionBuilder(form, setForm, 'break', 'Istirahat (Take a Break)')}
                {renderSectionBuilder(form, setForm, 'closing', 'Penutup (Recalling & Closing)')}
              </div>
            </div>

            <div className="relative">
              {parsedFrom && form.suggested_domains && <span className="absolute -top-1.5 right-2 text-[9px] font-black text-emerald-600 bg-emerald-50 px-1.5 rounded-full border border-emerald-200">AI ✨</span>}
              <Textarea label="Domain observasi" value={form.suggested_domains} onChange={v => setForm(f => ({ ...f, suggested_domains: v }))} placeholder="Literasi, Numerasi, Sosial Emosional" />
            </div>
            <div className="flex gap-2">
              <ActionButton icon={FilePlus} onClick={() => save(form)} disabled={busy}>{busy ? 'Menyimpan...' : 'Tambah Rencana'}</ActionButton>
              <ActionButton icon={X} onClick={() => { setOpenForm(false); setParsedFrom(null); }} variant="secondary">Batal</ActionButton>
            </div>
          </div>
        </Modal>
      )}

      {editForm && (
        <Modal title="Edit Focus Theme" onClose={() => setEditForm(null)}>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white p-3 rounded-2xl border border-slate-200/80">
              {user.role === 'admin' && (
                <div className="sm:col-span-2">
                  <label className="label text-[11px] font-bold text-slate-500 mb-1 block">Cabang Sekolah</label>
                  <CustomSelect value={editForm.cabang_id} onChange={e => setEditForm(f => ({ ...f, cabang_id: e.target.value, rombel_id: '' }))} className="input w-full">
                    <option value="">Pilih Cabang</option>
                    {m.cabang.map(c => <option key={c.id} value={c.id}>{c.nama}</option>)}
                  </CustomSelect>
                </div>
              )}

              <div className="sm:col-span-2">
                <label className="label text-[11px] font-bold text-slate-500 mb-1 block">Judul Rencana Kegiatan</label>
                <Input placeholder="Judul rencana kegiatan" value={editForm.title} onChange={v => setEditForm(f => ({ ...f, title: v }))} />
              </div>

              <div>
                <label className="label text-[11px] font-bold text-slate-500 mb-1 block">Mulai Minggu</label>
                <CustomDatePicker value={editForm.week_start} onChange={v => setEditForm(f => ({ ...f, week_start: v }))} className="input w-full" />
              </div>
              <div>
                <label className="label text-[11px] font-bold text-slate-500 mb-1 block">Sampai Minggu</label>
                <CustomDatePicker value={editForm.week_end} onChange={v => setEditForm(f => ({ ...f, week_end: v }))} className="input w-full" />
              </div>

              <div>
                <label className="label text-[11px] font-bold text-slate-500 mb-1 block">Jenjang</label>
                <CustomSelect value={editForm.jenjang_id} onChange={e => setEditForm(f => ({ ...f, jenjang_id: e.target.value, rombel_id: '' }))} className="input w-full">
                  {user.role !== 'guru' && <option value="">Semua jenjang</option>}
                  {user.role === 'guru' && editForm.rombel_id && <option value="">Ikuti jenjang rombel</option>}
                  {m.jenjang
                    .filter(j => user.role !== 'guru' || allowedJenjangIds.includes(String(j.id)))
                    .map(j => <option key={j.id} value={j.id}>{j.nama}</option>)}
                </CustomSelect>
              </div>
              <div>
                <label className="label text-[11px] font-bold text-slate-500 mb-1 block">Rombongan Belajar (Rombel)</label>
                <CustomSelect value={editForm.rombel_id} onChange={e => setEditForm(f => ({ ...f, rombel_id: e.target.value }))} className="input w-full">
                  <option value="">Semua rombel</option>
                  {scopedRombel(editForm).map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}
                </CustomSelect>
              </div>

              <div className="sm:col-span-2">
                <label className="label text-[11px] font-bold text-slate-500 mb-1 block">Paket Program</label>
                <CustomSelect value={editForm.paket} onChange={e => setEditForm(f => ({ ...f, paket: e.target.value }))} className="input w-full">
                  <option value="">Semua paket</option>
                  <option value="reguler">Reguler</option>
                  <option value="full_day">Full day</option>
                  <option value="care">Care</option>
                </CustomSelect>
              </div>
            </div>
            
            <Textarea label="Tujuan pembelajaran" value={editForm.goals} onChange={v => setEditForm(f => ({ ...f, goals: v }))} placeholder="Pisahkan dengan koma atau baris baru" />
            
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-3">
              <div className="text-xs font-black text-slate-400 uppercase tracking-wider">Rangkaian Kegiatan Harian</div>
              
              {/* Day Tabs */}
              <div className="flex border-b border-slate-200 gap-1 overflow-x-auto pb-1">
                {['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'].map(day => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setActiveDay(day)}
                    className={`px-3 py-1.5 text-xs font-black rounded-t-lg transition-all duration-200 shrink-0 ${
                      activeDay === day ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                {renderSectionBuilder(editForm, setEditForm, 'opening', 'Pembuka (Opening)')}
                {renderSectionBuilder(editForm, setEditForm, 'focus_theme', 'Inti (Focus Theme)')}
                {renderSectionBuilder(editForm, setEditForm, 'break', 'Istirahat (Take a Break)')}
                {renderSectionBuilder(editForm, setEditForm, 'closing', 'Penutup (Recalling & Closing)')}
              </div>
            </div>

            <Textarea label="Domain observasi" value={editForm.suggested_domains} onChange={v => setEditForm(f => ({ ...f, suggested_domains: v }))} placeholder="Literasi, Numerasi, Sosial Emosional" />
            <div className="flex gap-2">
              <ActionButton icon={Save} onClick={() => save(editForm)} disabled={busy}>{busy ? 'Menyimpan...' : 'Simpan Perubahan'}</ActionButton>
              <ActionButton icon={X} onClick={() => setEditForm(null)} variant="secondary">Batal</ActionButton>
            </div>
          </div>
        </Modal>
      )}
    </Panel>
  );
}
