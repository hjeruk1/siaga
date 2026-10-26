import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';
import { ActionButton, Modal, CustomSelect, CustomDatePicker } from '../../components/Shared';
import { todayWIB } from '../../utils/date';
import { CheckCircle2, FileText, RefreshCw, Search, Settings, UserCheck, UserPlus, Users, X } from 'lucide-react';
import { StudentMetricGroup, SiswaCard, SiswaTable, SiswaDrawer, Panel, FotoUpload } from './AdminShared';
import { useMaster } from './useMaster';
import { SiswaDetailPanel } from './siswa/SiswaDetailPanel';

export default function SiswaTab({ user, toast }) {
  const m = useMaster(user);
  const today = todayWIB();
  const nextYearStart = new Date().getMonth() >= 6 ? new Date().getFullYear() + 1 : new Date().getFullYear();
  const empty = {
    cabang_id: m.cabangId || '',
    nama: '',
    nis: '',
    nama_panggilan: '',
    gender: '',
    tanggal_lahir: '',
    status: 'aktif',
    jenjang_id: '',
    rombel_id: '',
    paket: 'reguler',
    tanggal_mulai: today,
    alasan: 'Enrollment awal',
    alamat: '',
    catatan_khusus: '',
    catatan_sekolah_luar: ''
  };
  const [form, setForm] = useState(empty);
  const [openForm, setOpenForm] = useState(false);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [kenaikanForm, setKenaikanForm] = useState({
    tanggal_efektif: `${nextYearStart}-07-01`,
    tahun_ajaran: `${nextYearStart}/${nextYearStart + 1}`
  });
  const [kenaikanPreview, setKenaikanPreview] = useState(null);

  const [selectedFotoFile, setSelectedFotoFile] = useState(null);
  const [selectedFotoUrl, setSelectedFotoUrl] = useState('');

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterJenjang, setFilterJenjang] = useState('');
  const [filterRombel, setFilterRombel] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);

  function closeForm() {
    setOpenForm(false);
    setForm(empty);
    if (selectedFotoUrl) {
      URL.revokeObjectURL(selectedFotoUrl);
    }
    setSelectedFotoFile(null);
    setSelectedFotoUrl('');
  }

  const { data, isPending, refetch } = useQuery({
    queryKey: ['siswa', m.cabangId || ''],
    queryFn: () => api.siswa({ cabang_id: m.cabangId, status: 'semua' })
  });
  const list = useMemo(() => data ?? [], [data]);

  // Client-side filtering logic
  const filteredList = useMemo(() => {
    return list.filter((siswa) => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = siswa.nama?.toLowerCase().includes(query);
        const matchesNis = siswa.nis?.toLowerCase().includes(query);
        if (!matchesName && !matchesNis) return false;
      }
      if (filterJenjang) {
        if (String(siswa.jenjang_id) !== String(filterJenjang)) return false;
      }
      if (filterRombel) {
        if (String(siswa.rombel_id) !== String(filterRombel)) return false;
      }
      if (filterStatus) {
        if (siswa.status?.toLowerCase() !== filterStatus.toLowerCase()) return false;
      }
      return true;
    });
  }, [list, searchQuery, filterJenjang, filterRombel, filterStatus]);

  // Dynamically calculated stats
  const stats = useMemo(() => {
    const total = list.length;
    const activeStudents = list.filter((s) => s.status?.toLowerCase() === 'aktif');
    const active = activeStudents.length;
    const kb = activeStudents.filter((s) => s.jenjang_nama?.toLowerCase().includes('kb')).length;
    const tk = activeStudents.filter((s) => s.jenjang_nama?.toLowerCase().includes('tk')).length;
    const dayCare = activeStudents.filter((s) => {
      const jenjang = s.jenjang_nama?.toLowerCase() || '';
      return jenjang.includes('care') || jenjang.includes('baby');
    }).length;
    const reguler = activeStudents.filter((s) => s.paket?.toLowerCase() === 'reguler').length;
    const fullDay = activeStudents.filter((s) => s.paket?.toLowerCase() === 'full_day').length;
    const care = activeStudents.filter((s) => s.paket?.toLowerCase() === 'care').length;
    return { total, active, kb, tk, dayCare, reguler, fullDay, care };
  }, [list]);

  const activeCabangId = form.cabang_id || m.cabangId;
  const rombelFiltered = m.rombel.filter(
    (r) =>
      (!activeCabangId || String(r.cabang_id) === String(activeCabangId)) &&
      (!form.jenjang_id || String(r.jenjang_id) === String(form.jenjang_id))
  );
  async function add() {
    const finalCabangId = form.cabang_id || m.cabangId;
    if (!finalCabangId) {
      toast('err', 'Pilih cabang dulu');
      return;
    }
    if (!form.nama.trim() || !form.jenjang_id || !form.rombel_id) {
      toast('err', 'Nama, jenjang, dan rombel wajib diisi');
      return;
    }
    try {
      const res = await api.createSiswa({
        ...form,
        nama: form.nama.trim(),
        nis: form.nis.trim(),
        cabang_id: finalCabangId,
        jenjang_id: Number(form.jenjang_id),
        rombel_id: Number(form.rombel_id)
      });
      if (selectedFotoFile) {
        try {
          await api.uploadSiswaFoto(res.id, selectedFotoFile);
        } catch (photoErr) {
          toast('err', 'Siswa disimpan, tapi gagal mengunggah foto: ' + photoErr.message);
        }
      }
      toast('ok', 'Siswa tersimpan');
      closeForm();
      refetch();
    } catch (e) {
      toast('err', e.message);
    }
  }
  async function open(s) {
    try {
      setSelected(s);
      setDetail(await api.siswaDetail(s.id));
    } catch (e) {
      toast('err', e.message);
    }
  }
  async function refreshDetail(id = selected?.id) {
    if (!id) return;
    setDetail(await api.siswaDetail(id));
    refetch();
  }
  function itemFromPreview(p) {
    return {
      siswa_id: p.id,
      action: p.action === 'error' ? 'skip' : p.action,
      target_jenjang_id: p.target_jenjang_id || p.jenjang_id || '',
      target_rombel_id: p.target_rombel_id || p.rombel_id || '',
      paket: p.paket || 'reguler'
    };
  }
  async function previewKenaikan() {
    if (!m.cabangId) {
      toast('err', 'Pilih cabang dulu');
      return;
    }
    try {
      const r = await api.kenaikanPreview({ cabang_id: m.cabangId, ...kenaikanForm });
      setKenaikanPreview({ ...r, items: r.preview.map(itemFromPreview) });
    } catch (e) {
      toast('err', e.message);
    }
  }
  function setKenaikanItem(index, patch) {
    setKenaikanPreview((p) => ({
      ...p,
      items: p.items.map((item, i) => (i === index ? { ...item, ...patch } : item))
    }));
  }
  function changeKenaikanAction(index, action) {
    const row = kenaikanPreview.preview[index];
    if (action === 'tinggal') {
      setKenaikanItem(index, {
        action,
        target_jenjang_id: row.jenjang_id,
        target_rombel_id: row.rombel_id,
        paket: row.paket || 'reguler'
      });
      return;
    }
    if (action === 'naik') {
      setKenaikanItem(index, {
        action,
        target_jenjang_id: row.target_jenjang_id || '',
        target_rombel_id: row.target_rombel_id || '',
        paket: row.paket || 'reguler'
      });
      return;
    }
    setKenaikanItem(index, { action, target_jenjang_id: '', target_rombel_id: '', paket: row.paket || 'reguler' });
  }
  function kenaikanInvalid() {
    if (!kenaikanPreview) return false;
    return kenaikanPreview.items.some(
      (item) => ['naik', 'tinggal'].includes(item.action) && (!item.target_jenjang_id || !item.target_rombel_id)
    );
  }
  function kenaikanSummary() {
    if (!kenaikanPreview) return {};
    const summary = { naik: 0, tinggal: 0, lulus: 0, tetap: 0, skip: 0, error: 0 };
    kenaikanPreview.items.forEach((item) => {
      summary[item.action] = (summary[item.action] || 0) + 1;
    });
    kenaikanPreview.preview.forEach((row) => {
      if (row.action === 'error') summary.error += 1;
    });
    return summary;
  }
  async function doKenaikan() {
    if (kenaikanInvalid()) {
      toast('err', 'Lengkapi rombel tujuan untuk siswa yang naik atau tinggal kelas');
      return;
    }
    try {
      const r = await api.kenaikan({ cabang_id: m.cabangId, ...kenaikanForm, items: kenaikanPreview.items });
      const s = r.summary || {};
      toast(
        'ok',
        `${r.results.length} siswa diproses: ${s.naik || 0} naik, ${s.tinggal || 0} tinggal, ${s.lulus || 0} lulus`
      );
      setKenaikanPreview(null);
      refetch();
    } catch (e) {
      toast('err', e.message);
    }
  }
  const right = (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
      <ActionButton
        icon={RefreshCw}
        onClick={previewKenaikan}
        variant="secondary"
        className="px-2 sm:px-4 text-xs sm:text-sm"
      >
        Kenaikan Tahun Ajaran
      </ActionButton>
      <ActionButton
        icon={UserPlus}
        onClick={() => {
          setForm(empty);
          setOpenForm(true);
        }}
        className="px-2 sm:px-4 text-xs sm:text-sm"
      >
        Tambah Siswa
      </ActionButton>
    </div>
  );

  return (
    <Panel title="Data Siswa" right={right} className="overflow-visible md:overflow-hidden">
      <div className="space-y-4">
        {/* 1. Grouped Stats */}
        {/* Mobile: compact single-row chip bar */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none md:hidden">
          {[
            { label: 'Total', value: stats.total },
            { label: 'Aktif', value: stats.active },
            { label: 'KB', value: stats.kb },
            { label: 'TK', value: stats.tk },
            { label: 'Day Care', value: stats.dayCare },
            { label: 'Full Day', value: stats.fullDay },
            { label: 'Care', value: stats.care },
            { label: 'Reguler', value: stats.reguler }
          ].map((s) => (
            <div
              key={s.label}
              className="flex-none flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm"
            >
              <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">{s.label}</span>
              <span className="text-sm font-black text-text-main">{s.value}</span>
            </div>
          ))}
        </div>
        {/* Desktop: original 3-column card layout */}
        <div className="hidden md:grid md:grid-cols-3 gap-3">
          <StudentMetricGroup
            title="Master"
            items={[
              { label: 'Total', value: stats.total },
              { label: 'Aktif', value: stats.active }
            ]}
          />
          <StudentMetricGroup
            title="Jenjang"
            items={[
              { label: 'KB', value: stats.kb },
              { label: 'TK', value: stats.tk },
              { label: 'Day Care', value: stats.dayCare }
            ]}
          />
          <StudentMetricGroup
            title="Program"
            items={[
              { label: 'Full Day', value: stats.fullDay },
              { label: 'Care', value: stats.care },
              { label: 'Reguler', value: stats.reguler }
            ]}
          />
        </div>

        {/* 2. Search & Filters Panel */}
        <div className="sticky top-[64px] z-20 -mx-1 rounded-xl border border-slate-200 bg-slate-50/95 p-3 shadow-sm backdrop-blur md:static md:z-auto md:mx-0 md:bg-slate-50 md:shadow-none md:backdrop-blur-0">
          <div className="md:grid md:grid-cols-[minmax(18rem,1fr)_auto] md:items-start md:gap-2">
            {/* Search row — always visible */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Search className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  placeholder="Cari nama atau NIS siswa…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input pl-10 w-full font-bold"
                />
                {searchQuery && (
                  <button
                    type="button"
                    aria-label="Hapus pencarian siswa"
                    onClick={() => setSearchQuery('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              {/* Filter toggle — mobile only */}
              <button
                type="button"
                aria-label="Buka filter siswa"
                onClick={() => setFilterOpen((o) => !o)}
                className={`md:hidden relative flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-black transition-colors ${
                  filterOpen ||
                  filterJenjang ||
                  filterRombel ||
                  (filterStatus && filterStatus !== 'aktif') ||
                  (user.role === 'admin' && m.cabangId)
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-slate-200 bg-white text-slate-500'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                Filter
                {(() => {
                  const count = [
                    filterJenjang,
                    filterRombel,
                    filterStatus && filterStatus !== 'aktif',
                    user.role === 'admin' && m.cabangId
                  ].filter(Boolean).length;
                  return count > 0 ? (
                    <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-black text-white">
                      {count}
                    </span>
                  ) : null;
                })()}
              </button>
            </div>

            {/* Filter dropdowns — always visible on md+, collapsible on mobile */}
            <div className={`mt-2 md:mt-0 ${filterOpen ? 'block' : 'hidden md:block'}`}>
              <div className="grid grid-cols-2 md:flex md:flex-nowrap gap-2">
                {user.role === 'admin' && (
                  <CustomSelect
                    value={m.cabangId}
                    onChange={(e) => m.setCabangId(e.target.value)}
                    className="input w-full md:w-44 text-xs sm:text-sm"
                  >
                    <option value="">Semua Cabang</option>
                    {m.cabang.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nama}
                      </option>
                    ))}
                  </CustomSelect>
                )}
                <CustomSelect
                  value={filterJenjang}
                  onChange={(e) => {
                    setFilterJenjang(e.target.value);
                    setFilterRombel('');
                  }}
                  className="input w-full md:w-40 text-xs sm:text-sm"
                >
                  <option value="">Semua Jenjang</option>
                  {m.jenjang.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.nama}
                    </option>
                  ))}
                </CustomSelect>
                <CustomSelect
                  value={filterRombel}
                  onChange={(e) => setFilterRombel(e.target.value)}
                  className="input w-full md:w-40 text-xs sm:text-sm"
                  disabled={!filterJenjang}
                >
                  <option value="">Semua Rombel</option>
                  {m.rombel
                    .filter((r) => !filterJenjang || String(r.jenjang_id) === String(filterJenjang))
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.nama}
                      </option>
                    ))}
                </CustomSelect>
                <CustomSelect
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="input w-full md:w-36 text-xs sm:text-sm"
                >
                  <option value="">Semua Status</option>
                  <option value="aktif">Aktif</option>
                  <option value="lulus">Lulus</option>
                  <option value="keluar">Keluar</option>
                </CustomSelect>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Responsive Layout Switching */}
        {/* Desktop View */}
        <div className="hidden md:block">
          <SiswaTable list={filteredList} selected={selected} open={open} />
          {!isPending && filteredList.length === 0 && (
            <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-sm font-bold">
              Tidak ada data siswa yang ditemukan.
            </div>
          )}
        </div>

        {/* Mobile View */}
        <div className="block md:hidden space-y-3">
          {filteredList.map((s) => (
            <SiswaCard key={s.id} siswa={s} active={selected?.id === s.id} open={open} />
          ))}
          {!isPending && filteredList.length === 0 && (
            <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-sm font-bold">
              Tidak ada data siswa yang ditemukan.
            </div>
          )}
        </div>
      </div>

      {openForm && (
        <Modal title="Tambah Siswa" onClose={closeForm} maxWidth="max-w-4xl">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Left Column: Photo Upload Container */}
            <div className="w-full md:w-52 shrink-0 flex flex-col items-center bg-slate-50 border border-slate-200/60 rounded-2xl p-5 text-center">
              <div className="text-xs font-black text-slate-400 uppercase tracking-wider mb-4">Foto Profil</div>
              <FotoUpload
                size="xl"
                url={selectedFotoUrl}
                onUpload={(file) => {
                  const url = URL.createObjectURL(file);
                  if (selectedFotoUrl) URL.revokeObjectURL(selectedFotoUrl);
                  setSelectedFotoFile(file);
                  setSelectedFotoUrl(url);
                }}
                onDelete={() => {
                  if (selectedFotoUrl) URL.revokeObjectURL(selectedFotoUrl);
                  setSelectedFotoFile(null);
                  setSelectedFotoUrl('');
                }}
              />
              <div className="text-[10px] sm:text-[11px] text-slate-400 mt-4 leading-relaxed">
                Pilih foto siswa. Gunakan format JPG/PNG, maks. 2MB.
              </div>
            </div>

            {/* Right Column: Fields split into logical groups */}
            <div className="flex-1 space-y-6">
              {/* Section 1: Profil Dasar */}
              <div className="space-y-3">
                <div className="text-[11px] font-black text-primary uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  Profil Dasar
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
                  <label className="block sm:col-span-4">
                    <span className="label">
                      Nama Lengkap <span className="text-rose-500">*</span>
                    </span>
                    <input
                      type="text"
                      placeholder="Nama lengkap siswa"
                      value={form.nama}
                      onChange={(e) => setForm((f) => ({ ...f, nama: e.target.value }))}
                      className="input w-full"
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="label">Nama Panggilan</span>
                    <input
                      type="text"
                      placeholder="Panggilan"
                      value={form.nama_panggilan}
                      onChange={(e) => setForm((f) => ({ ...f, nama_panggilan: e.target.value }))}
                      className="input w-full"
                    />
                  </label>
                  <label className="block sm:col-span-3">
                    <span className="label">NIS (Nomor Induk Siswa)</span>
                    <input
                      type="text"
                      placeholder="NIS"
                      value={form.nis}
                      onChange={(e) => setForm((f) => ({ ...f, nis: e.target.value }))}
                      className="input w-full"
                    />
                  </label>
                  <label className="block sm:col-span-3">
                    <span className="label">
                      Gender <span className="text-rose-500">*</span>
                    </span>
                    <CustomSelect
                      value={form.gender}
                      onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
                      className="input w-full"
                    >
                      <option value="">Pilih gender</option>
                      <option value="L">Laki-laki</option>
                      <option value="P">Perempuan</option>
                    </CustomSelect>
                  </label>
                  <label className="block sm:col-span-3">
                    <span className="label">
                      Tanggal Lahir <span className="text-rose-500">*</span>
                    </span>
                    <CustomDatePicker
                      value={form.tanggal_lahir}
                      onChange={(v) => setForm((f) => ({ ...f, tanggal_lahir: v }))}
                      className="input w-full"
                    />
                  </label>
                  <label className="block sm:col-span-3">
                    <span className="label">
                      Status Siswa <span className="text-rose-500">*</span>
                    </span>
                    <CustomSelect
                      value={form.status}
                      onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                      className="input w-full"
                    >
                      <option value="aktif">Aktif</option>
                      <option value="keluar">Keluar</option>
                      <option value="lulus">Lulus</option>
                    </CustomSelect>
                  </label>
                </div>
              </div>

              {/* Section 2: Enrollment Awal */}
              <div className="space-y-3">
                <div className="text-[11px] font-black text-primary uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5" />
                  Enrollment Awal
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
                  {user.role === 'admin' && (
                    <label className="block sm:col-span-3">
                      <span className="label">
                        Cabang Sekolah <span className="text-rose-500">*</span>
                      </span>
                      <CustomSelect
                        value={form.cabang_id}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, cabang_id: e.target.value, jenjang_id: '', rombel_id: '' }))
                        }
                        className="input w-full"
                      >
                        <option value="">Pilih cabang</option>
                        {m.cabang.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nama}
                          </option>
                        ))}
                      </CustomSelect>
                    </label>
                  )}
                  <label className={`block ${user.role === 'admin' ? 'sm:col-span-3' : 'sm:col-span-2'}`}>
                    <span className="label">
                      Jenjang <span className="text-rose-500">*</span>
                    </span>
                    <CustomSelect
                      value={form.jenjang_id}
                      onChange={(e) => setForm((f) => ({ ...f, jenjang_id: e.target.value, rombel_id: '' }))}
                      className="input w-full"
                    >
                      <option value="">Pilih jenjang</option>
                      {m.jenjang.map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.nama}
                        </option>
                      ))}
                    </CustomSelect>
                  </label>
                  <label className={`block ${user.role === 'admin' ? 'sm:col-span-3' : 'sm:col-span-2'}`}>
                    <span className="label">
                      Rombel <span className="text-rose-500">*</span>
                    </span>
                    <CustomSelect
                      value={form.rombel_id}
                      onChange={(e) => setForm((f) => ({ ...f, rombel_id: e.target.value }))}
                      className="input w-full"
                    >
                      <option value="">Pilih rombel</option>
                      {rombelFiltered.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.nama}
                        </option>
                      ))}
                    </CustomSelect>
                  </label>
                  <label className={`block ${user.role === 'admin' ? 'sm:col-span-3' : 'sm:col-span-2'}`}>
                    <span className="label">
                      Paket Kelas <span className="text-rose-500">*</span>
                    </span>
                    <CustomSelect
                      value={form.paket}
                      onChange={(e) => setForm((f) => ({ ...f, paket: e.target.value }))}
                      className="input w-full"
                    >
                      <option value="reguler">Reguler</option>
                      <option value="full_day">Full day</option>
                      <option value="care">Care</option>
                    </CustomSelect>
                  </label>
                  <label className="block sm:col-span-3">
                    <span className="label">
                      Tanggal Mulai <span className="text-rose-500">*</span>
                    </span>
                    <CustomDatePicker
                      value={form.tanggal_mulai}
                      onChange={(v) => setForm((f) => ({ ...f, tanggal_mulai: v }))}
                      className="input w-full"
                    />
                  </label>
                  <label className="block sm:col-span-3">
                    <span className="label">Alasan Enrollment</span>
                    <input
                      type="text"
                      placeholder="Enrollment awal"
                      value={form.alasan}
                      onChange={(e) => setForm((f) => ({ ...f, alasan: e.target.value }))}
                      className="input w-full"
                    />
                  </label>
                </div>
              </div>

              {/* Section 3: Alamat & Catatan */}
              <div className="space-y-3">
                <div className="text-[11px] font-black text-primary uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" />
                  Alamat & Catatan
                </div>
                <div className="space-y-3">
                  <label className="block">
                    <span className="label">Alamat Rumah</span>
                    <textarea
                      value={form.alamat}
                      onChange={(e) => setForm((f) => ({ ...f, alamat: e.target.value }))}
                      className="input w-full min-h-[50px] max-h-[100px]"
                      placeholder="Masukkan alamat lengkap rumah siswa"
                    />
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="label">Catatan Medis / Khusus</span>
                      <textarea
                        value={form.catatan_khusus}
                        onChange={(e) => setForm((f) => ({ ...f, catatan_khusus: e.target.value }))}
                        className="input w-full min-h-[50px] max-h-[100px]"
                        placeholder="Alergi makanan, asma, obat rutin, dll. (jika ada)"
                      />
                    </label>
                    <label className="block">
                      <span className="label">Catatan Sekolah Asal / Luar</span>
                      <textarea
                        value={form.catatan_sekolah_luar}
                        onChange={(e) => setForm((f) => ({ ...f, catatan_sekolah_luar: e.target.value }))}
                        className="input w-full min-h-[50px] max-h-[100px]"
                        placeholder="Pindahan dari sekolah mana, raport awal, dll. (jika ada)"
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 mt-6">
                <ActionButton icon={X} onClick={closeForm} variant="secondary">
                  Batal
                </ActionButton>
                <ActionButton icon={UserPlus} onClick={add}>
                  Tambah Siswa
                </ActionButton>
              </div>
            </div>
          </div>
        </Modal>
      )}
      {detail && (
        <SiswaDrawer
          onClose={() => {
            setSelected(null);
            setDetail(null);
          }}
        >
          <SiswaDetailPanel
            user={user}
            m={m}
            detail={detail}
            setDetail={setDetail}
            toast={toast}
            refresh={() => refreshDetail(detail.id)}
            close={() => {
              setSelected(null);
              setDetail(null);
            }}
          />
        </SiswaDrawer>
      )}
      {kenaikanPreview && (
        <Modal title="Preview Kenaikan Tahun Ajaran" onClose={() => setKenaikanPreview(null)} maxWidth="max-w-6xl">
          <div className="space-y-3 min-w-0">
            {/* Header: meta info + refresh */}
            <div className="grid gap-2 lg:grid-cols-[minmax(12rem,1fr)_13rem_13rem_auto] lg:items-end">
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <div className="text-[10px] font-black text-slate-400 uppercase">Cabang</div>
                <div className="font-black text-text-main text-sm truncate">
                  {m.cabang.find((c) => String(c.id) === String(kenaikanPreview.cabang_id))?.nama ||
                    kenaikanPreview.cabang_id}
                </div>
              </div>
              <label className="block">
                <div className="label">Tanggal efektif</div>
                <CustomDatePicker
                  value={kenaikanForm.tanggal_efektif}
                  onChange={(v) => setKenaikanForm((f) => ({ ...f, tanggal_efektif: v }))}
                  className="input w-full text-sm"
                />
              </label>
              <label className="block">
                <div className="label">Tahun ajaran</div>
                <input
                  value={kenaikanForm.tahun_ajaran}
                  onChange={(e) => setKenaikanForm((f) => ({ ...f, tahun_ajaran: e.target.value }))}
                  className="input w-full text-sm"
                />
              </label>
              <ActionButton
                icon={RefreshCw}
                onClick={previewKenaikan}
                variant="secondary"
                className="w-full lg:w-auto whitespace-nowrap"
              >
                Refresh Preview
              </ActionButton>
            </div>

            {/* Summary chips: always 5 in one row */}
            <div className="grid grid-cols-5 gap-1.5">
              {['naik', 'tinggal', 'lulus', 'skip', 'error'].map((k) => (
                <div
                  key={k}
                  className="flex flex-col items-center rounded-lg bg-slate-50 border border-slate-100 px-1 sm:px-1.5 py-1 text-center"
                >
                  {/* padding & tracking dikecilkan di mobile: "TINGGAL" 2,5px lebih lebar
                      dari kolom 5-grid dan dulu terpotong jadi "TINGG…". */}
                  <div className="text-[9px] sm:text-[10px] font-black uppercase tracking-normal sm:tracking-wide text-slate-400 truncate w-full text-center">
                    {k}
                  </div>
                  <div className="text-base font-black text-text-main leading-tight">{kenaikanSummary()[k] || 0}</div>
                </div>
              ))}
            </div>

            {/* Desktop: table view */}
            <div className="hidden md:block max-h-[50vh] overflow-y-auto rounded-xl border border-slate-100">
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  <col className="w-[32%]" />
                  <col className="w-[20%]" />
                  <col className="w-[15%]" />
                  <col className="w-[20%]" />
                  <col className="w-[13%]" />
                </colgroup>
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Siswa</th>
                    <th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Dari</th>
                    <th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Aksi</th>
                    <th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Rombel Tujuan</th>
                    <th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Catatan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {kenaikanPreview.preview.map((p, i) => {
                    const item = kenaikanPreview.items[i] || itemFromPreview(p);
                    const needsTarget = ['naik', 'tinggal'].includes(item.action);
                    const targetRombel = m.rombel.filter(
                      (r) => String(r.jenjang_id) === String(item.target_jenjang_id)
                    );
                    return (
                      <tr key={p.id || i} className="hover:bg-slate-50/60">
                        <td className="py-2 px-3 font-black text-text-main truncate" title={p.nama}>
                          {p.nama}
                        </td>
                        <td
                          className="py-2 px-3 text-slate-500 text-xs truncate"
                          title={`${p.jenjang_nama} - ${p.rombel_nama}`}
                        >
                          {p.jenjang_nama} · {p.rombel_nama}
                        </td>
                        <td className="py-2 px-3">
                          <CustomSelect
                            value={item.action}
                            onChange={(e) => changeKenaikanAction(i, e.target.value)}
                            className="input w-full text-xs"
                          >
                            <option value="naik">Naik kelas</option>
                            <option value="tinggal">Tinggal kelas</option>
                            <option value="lulus">Lulus</option>
                            <option value="tetap">Tetap</option>
                            <option value="skip">Tidak diproses</option>
                          </CustomSelect>
                        </td>
                        <td className="py-2 px-3">
                          {needsTarget ? (
                            <CustomSelect
                              value={item.target_rombel_id || ''}
                              onChange={(e) =>
                                setKenaikanItem(i, {
                                  target_rombel_id: e.target.value,
                                  target_jenjang_id:
                                    targetRombel.find((r) => String(r.id) === e.target.value)?.jenjang_id ||
                                    item.target_jenjang_id
                                })
                              }
                              className={`input w-full text-xs ${!item.target_rombel_id ? 'border-red-300' : ''}`}
                            >
                              <option value="">Pilih rombel</option>
                              {targetRombel.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {m.jenjang.find((j) => String(j.id) === String(r.jenjang_id))?.nama} - {r.nama}
                                </option>
                              ))}
                            </CustomSelect>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>
                        <td
                          className="py-2 px-3 text-slate-400 text-xs truncate"
                          title={p.error || `${p.target_jenjang || '—'} → ${p.target_rombel || '—'}`}
                        >
                          {p.error || `${p.target_jenjang || '—'} → ${p.target_rombel || '—'}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile: card list */}
            <div className="md:hidden space-y-2 max-h-[45vh] overflow-y-auto custom-scrollbar">
              {kenaikanPreview.preview.map((p, i) => {
                const item = kenaikanPreview.items[i] || itemFromPreview(p);
                const needsTarget = ['naik', 'tinggal'].includes(item.action);
                const targetRombel = m.rombel.filter((r) => String(r.jenjang_id) === String(item.target_jenjang_id));
                return (
                  <div key={p.id || i} className="rounded-xl border border-slate-200 bg-white p-3 space-y-2.5">
                    {/* Student header */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-black text-text-main text-sm">{p.nama}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {p.jenjang_nama} · {p.rombel_nama}
                        </div>
                      </div>
                      {p.error && (
                        <span className="shrink-0 text-[10px] font-black text-red-600 bg-red-50 border border-red-100 rounded-full px-2 py-0.5">
                          Error
                        </span>
                      )}
                    </div>
                    {/* Controls */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="label mb-1">Aksi</div>
                        <CustomSelect
                          value={item.action}
                          onChange={(e) => changeKenaikanAction(i, e.target.value)}
                          className="input w-full text-xs"
                        >
                          <option value="naik">Naik kelas</option>
                          <option value="tinggal">Tinggal kelas</option>
                          <option value="lulus">Lulus</option>
                          <option value="tetap">Tetap</option>
                          <option value="skip">Tidak diproses</option>
                        </CustomSelect>
                      </div>
                      {needsTarget && (
                        <div>
                          <div className="label mb-1">Rombel tujuan</div>
                          <CustomSelect
                            value={item.target_rombel_id || ''}
                            onChange={(e) =>
                              setKenaikanItem(i, {
                                target_rombel_id: e.target.value,
                                target_jenjang_id:
                                  targetRombel.find((r) => String(r.id) === e.target.value)?.jenjang_id ||
                                  item.target_jenjang_id
                              })
                            }
                            className={`input w-full text-xs ${!item.target_rombel_id ? 'border-red-300' : ''}`}
                          >
                            <option value="">Pilih rombel</option>
                            {targetRombel.map((r) => (
                              <option key={r.id} value={r.id}>
                                {m.jenjang.find((j) => String(j.id) === String(r.jenjang_id))?.nama} - {r.nama}
                              </option>
                            ))}
                          </CustomSelect>
                        </div>
                      )}
                    </div>
                    {/* Recommendation note */}
                    {(p.error || p.target_jenjang) && (
                      <div className="text-[10px] text-slate-400 bg-slate-50 rounded px-2 py-1">
                        {p.error || `Rekomendasi: ${p.target_jenjang || '—'} → ${p.target_rombel || '—'}`}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer actions */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
              <ActionButton
                icon={CheckCircle2}
                onClick={doKenaikan}
                disabled={kenaikanInvalid()}
                className={kenaikanInvalid() ? 'opacity-50 cursor-not-allowed' : ''}
              >
                Konfirmasi Kenaikan
              </ActionButton>
              <ActionButton icon={X} onClick={() => setKenaikanPreview(null)} variant="secondary">
                Batal
              </ActionButton>
            </div>
          </div>
        </Modal>
      )}
    </Panel>
  );
}
