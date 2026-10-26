import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';
import { ActionButton, ConfirmActionModal, IconButton, Modal, CustomSelect } from '../../components/Shared';
import { Pencil, Plus, RefreshCw, Save, Search, Settings, Trash2, UserMinus, UserPlus, Users, X } from 'lucide-react';
import { StudentAvatar, Panel, Input } from './AdminShared';
import { useMaster } from './useMaster';
import { GuruAvatarStack } from './billing/GuruAvatarStack';

export default function RombelTab({ user, toast }) {
  const m = useMaster(user);
  const [form, setForm] = useState({ nama: '', jenjang_id: '', cabang_id: '' });
  const [openForm, setOpenForm] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({ cabang_id: '', rombel_id: '', pengguna_id: '', role: 'bantu' });
  const [guruDetailRombel, setGuruDetailRombel] = useState(null);
  const [roleConfirm, setRoleConfirm] = useState(null);
  const [editingRombel, setEditingRombel] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterJenjang, setFilterJenjang] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  // Kunci `staff` sama dengan StaffTab: keduanya memuat daftar yang sama, jadi
  // berpindah antar tab tidak memicu permintaan baru.
  const staffQ = useQuery({
    queryKey: ['staff', m.cabangId || ''],
    queryFn: () => api.staff(user.role === 'admin' ? '' : m.cabangId)
  });
  const staff = useMemo(() => staffQ.data ?? [], [staffQ.data]);

  // Admin butuh seluruh rombel (lintas cabang) untuk modal penugasan; peran
  // lain cukup memakai rombel cabangnya dari useMaster.
  const rombelSemuaQ = useQuery({
    queryKey: ['rombel-semua'],
    queryFn: () => api.rombel(''),
    enabled: user.role === 'admin'
  });
  const assignRombel = user.role === 'admin' ? (rombelSemuaQ.data ?? []) : m.rombel;

  async function refreshRombelData() {
    await Promise.all([m.load(), staffQ.refetch(), user.role === 'admin' ? rombelSemuaQ.refetch() : null]);
  }
  function openAssignModal() {
    const cabangId = user.role === 'admin' ? m.cabangId || '' : m.cabangId;
    const source = user.role === 'admin' ? (assignRombel.length ? assignRombel : m.rombel) : m.rombel;
    const firstRombel = cabangId ? source.find((r) => String(r.cabang_id) === String(cabangId)) : null;
    setAssignForm({ cabang_id: cabangId, rombel_id: firstRombel?.id || '', pengguna_id: '', role: 'bantu' });
    setAssignModalOpen(true);
  }
  async function add() {
    const targetCabangId = user.role === 'admin' ? form.cabang_id || m.cabangId : user.cabang_id;
    if (!targetCabangId) {
      toast('err', 'Pilih cabang sekolah terlebih dahulu');
      return;
    }
    try {
      await api.createRombel({ ...form, cabang_id: targetCabangId, jenjang_id: Number(form.jenjang_id) });
      toast('ok', 'Rombel dibuat');
      setForm({ nama: '', jenjang_id: '', cabang_id: '' });
      setOpenForm(false);
      await refreshRombelData();
    } catch (e) {
      toast('err', e.message);
    }
  }
  async function saveEdit() {
    if (!editingRombel.nama.trim() || !editingRombel.jenjang_id) {
      toast('err', 'Nama dan jenjang wajib diisi');
      return;
    }
    try {
      await api.updateRombel(editingRombel.id, {
        nama: editingRombel.nama.trim(),
        jenjang_id: Number(editingRombel.jenjang_id),
        aktif: editingRombel.aktif ? 1 : 0
      });
      toast('ok', 'Rombel diperbarui');
      setEditingRombel(null);
      await refreshRombelData();
    } catch (e) {
      toast('err', e.message);
    }
  }
  async function removeRombel(id) {
    try {
      await api.deleteRombel(id);
      toast('ok', 'Rombel dihapus');
      await refreshRombelData();
    } catch (e) {
      toast('err', e.message);
    }
  }
  async function assignGuruFromModal() {
    if (user.role === 'admin' && !assignForm.cabang_id) return toast('err', 'Pilih cabang dulu');
    if (!assignForm.rombel_id) return toast('err', 'Pilih rombel dulu');
    if (!assignForm.pengguna_id) return toast('err', 'Pilih guru dulu');
    try {
      await api.assignGuruRombel(assignForm.rombel_id, {
        pengguna_id: Number(assignForm.pengguna_id),
        role: assignForm.role || 'bantu'
      });
      toast('ok', 'Guru ditugaskan');
      setAssignForm((f) => ({ ...f, pengguna_id: '', role: 'bantu' }));
      await refreshRombelData();
    } catch (e) {
      toast('err', e.message);
    }
  }
  async function removeGuru(r, g) {
    try {
      await api.removeGuruRombel(r.id, g.id);
      toast('ok', 'Guru dilepas');
      if (guruDetailRombel?.id === r.id) setGuruDetailRombel(null);
      await refreshRombelData();
    } catch (e) {
      toast('err', e.message);
    }
  }
  async function toggleGuruRole(r, g) {
    const newRole = g.role === 'utama' ? 'bantu' : 'utama';
    try {
      await api.assignGuruRombel(r.id, { pengguna_id: g.id, role: newRole });
      toast('ok', `Peran ${g.display_name} diubah menjadi ${newRole === 'utama' ? 'Utama' : 'Bantu'}`);
      if (guruDetailRombel?.id === r.id) setGuruDetailRombel(null);
      await refreshRombelData();
    } catch (e) {
      toast('err', e.message);
    }
  }
  const gurus = staff.filter((s) => s.role === 'guru' && s.status !== 'nonaktif');
  const assignCabangId = user.role === 'admin' ? assignForm.cabang_id : m.cabangId;
  const assignRombelOptions = assignRombel.filter(
    (r) => !assignCabangId || String(r.cabang_id) === String(assignCabangId)
  );
  const selectedAssignRombel = assignRombelOptions.find((r) => String(r.id) === String(assignForm.rombel_id));
  const selectedAssignedGurus = selectedAssignRombel?.gurus || [];
  const availableAssignGurus = gurus.filter(
    (g) =>
      (!assignCabangId || Number(g.cabang_id) === Number(assignCabangId)) &&
      (!selectedAssignRombel || Number(g.cabang_id) === Number(selectedAssignRombel.cabang_id)) &&
      !selectedAssignedGurus.some((x) => x.id === g.id)
  );
  const filteredRombel = useMemo(() => {
    return m.rombel.filter((r) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = r.nama?.toLowerCase().includes(q);
        const matchesGuru = (r.gurus || []).some((g) => g.display_name?.toLowerCase().includes(q));
        if (!matchesName && !matchesGuru) return false;
      }
      if (filterJenjang) {
        if (String(r.jenjang_id) !== String(filterJenjang)) return false;
      }
      return true;
    });
  }, [m.rombel, searchQuery, filterJenjang]);

  const right = (
    <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
      <ActionButton
        icon={UserPlus}
        onClick={openAssignModal}
        variant="ghost"
        className="w-full sm:w-auto px-2 sm:px-4 text-xs sm:text-sm"
      >
        Tugaskan Guru
      </ActionButton>
      <ActionButton
        icon={Plus}
        onClick={() => {
          setForm({ nama: '', jenjang_id: '', cabang_id: m.cabangId || '' });
          setOpenForm(true);
        }}
        className="w-full sm:w-auto px-2 sm:px-4 text-xs sm:text-sm"
      >
        Tambah Rombel
      </ActionButton>
    </div>
  );
  return (
    <Panel title="Rombel" right={right} className="overflow-visible md:overflow-hidden">
      <div className="space-y-4">
        {/* Search & Filters Panel */}
        <div className="sticky top-[64px] z-20 -mx-1 rounded-xl border border-slate-200 bg-slate-50/95 p-3 shadow-sm backdrop-blur md:static md:z-auto md:mx-0 md:bg-slate-50 md:shadow-none md:backdrop-blur-0">
          <div className="md:grid md:grid-cols-[minmax(18rem,1fr)_auto] md:items-start md:gap-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Search className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  placeholder="Cari rombel atau guru pengajar…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input pl-10 w-full font-bold"
                />
                {searchQuery && (
                  <button
                    type="button"
                    aria-label="Hapus pencarian rombel"
                    onClick={() => setSearchQuery('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button
                type="button"
                aria-label="Buka filter rombel"
                onClick={() => setFilterOpen((o) => !o)}
                className={`md:hidden relative flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-black transition-colors ${
                  filterOpen || filterJenjang || (user.role === 'admin' && m.cabangId)
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-slate-200 bg-white text-slate-500'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                Filter
                {(() => {
                  const count = [filterJenjang, user.role === 'admin' && m.cabangId].filter(Boolean).length;
                  return count > 0 ? (
                    <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-black text-white">
                      {count}
                    </span>
                  ) : null;
                })()}
              </button>
            </div>

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
                  onChange={(e) => setFilterJenjang(e.target.value)}
                  className="input w-full md:w-40 text-xs sm:text-sm"
                >
                  <option value="">Semua Jenjang</option>
                  {m.jenjang.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.nama}
                    </option>
                  ))}
                </CustomSelect>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filteredRombel.map((r) => {
            const assignedGurus = r.gurus || [];
            return (
              <div
                key={r.id}
                className="relative bg-white border border-slate-200/80 rounded-2xl p-3 shadow-sm transition-all duration-200 flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="truncate font-extrabold text-slate-800 text-base" title={r.nama}>
                          {r.nama}
                        </div>
                        {['admin', 'admin_cabang'].includes(user.role) && (
                          <div className="flex shrink-0 items-center gap-1 opacity-60 hover:opacity-100 transition-opacity">
                            <IconButton
                              icon={Pencil}
                              label={`Edit Rombel ${r.nama}`}
                              onClick={() => setEditingRombel({ ...r })}
                              size="sm"
                            />
                            <IconButton
                              icon={Trash2}
                              label={`Hapus Rombel ${r.nama}`}
                              onClick={() => setDeleteConfirm(r)}
                              size="sm"
                              variant="danger"
                            />
                          </div>
                        )}
                      </div>
                      <div className="text-xs font-semibold text-slate-400 mt-0.5 uppercase tracking-wide">
                        {r.cabang_nama}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                      <span className="bg-primary-container text-primary-active border border-primary/20 rounded-full px-2 py-0.5 text-[11px] font-semibold">
                        {r.jenjang_nama}
                      </span>
                      <span
                        className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full ${
                          r.aktif
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {r.aktif ? 'aktif' : 'nonaktif'}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          Guru Pengajar
                        </div>
                        <div className="mt-1 min-h-9">
                          <GuruAvatarStack gurus={assignedGurus} onSelect={() => setGuruDetailRombel(r)} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {filteredRombel.length === 0 && (
          <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-sm font-bold">
            Tidak ada data rombel yang ditemukan.
          </div>
        )}
      </div>
      {openForm && (
        <Modal title="Tambah Rombel" onClose={() => setOpenForm(false)} maxWidth="max-w-xl">
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-black uppercase tracking-wider text-slate-400">Identitas Rombel</div>
              {user.role === 'admin' && (
                <div className="mt-3">
                  <label className="block">
                    <span className="label">
                      Cabang Sekolah <span className="text-rose-500">*</span>
                    </span>
                    <CustomSelect
                      value={form.cabang_id || ''}
                      onChange={(e) => setForm((f) => ({ ...f, cabang_id: e.target.value }))}
                      className="input w-full"
                    >
                      <option value="">Pilih Cabang</option>
                      {m.cabang.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nama}
                        </option>
                      ))}
                    </CustomSelect>
                  </label>
                </div>
              )}
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_12rem] gap-3">
                <label className="block">
                  <span className="label">
                    Nama Rombel <span className="text-rose-500">*</span>
                  </span>
                  <Input
                    placeholder="Contoh: KB A Mawar"
                    value={form.nama}
                    onChange={(v) => setForm((f) => ({ ...f, nama: v }))}
                  />
                </label>
                <label className="block">
                  <span className="label">
                    Jenjang <span className="text-rose-500">*</span>
                  </span>
                  <CustomSelect
                    value={form.jenjang_id}
                    onChange={(e) => setForm((f) => ({ ...f, jenjang_id: e.target.value }))}
                    className="input w-full"
                  >
                    <option value="">Pilih Jenjang</option>
                    {m.jenjang.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.nama}
                      </option>
                    ))}
                  </CustomSelect>
                </label>
              </div>
              <div className="mt-2 text-xs text-slate-500">Guru pengajar bisa ditugaskan setelah rombel dibuat.</div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-slate-100 pt-4">
              <ActionButton icon={X} onClick={() => setOpenForm(false)} variant="ghost" className="w-full sm:w-auto">
                Batal
              </ActionButton>
              <ActionButton
                icon={Plus}
                onClick={add}
                disabled={!form.nama.trim() || !form.jenjang_id}
                className="w-full sm:w-auto"
              >
                Tambah Rombel
              </ActionButton>
            </div>
          </div>
        </Modal>
      )}
      {assignModalOpen && (
        <Modal title="Tugaskan Guru" onClose={() => setAssignModalOpen(false)} maxWidth="max-w-2xl">
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-black uppercase tracking-wider text-slate-400">Target Penugasan</div>
              <div
                className={`mt-3 grid grid-cols-1 gap-3 ${user.role === 'admin' ? 'sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)_10rem]' : 'sm:grid-cols-[1fr_12rem]'}`}
              >
                {user.role === 'admin' && (
                  <label className="block">
                    <span className="label">
                      Cabang <span className="text-rose-500">*</span>
                    </span>
                    <CustomSelect
                      value={assignForm.cabang_id}
                      onChange={(e) =>
                        setAssignForm((f) => ({ ...f, cabang_id: e.target.value, rombel_id: '', pengguna_id: '' }))
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
                <label className="block">
                  <span className="label">
                    Rombel <span className="text-rose-500">*</span>
                  </span>
                  <CustomSelect
                    value={assignForm.rombel_id}
                    onChange={(e) => setAssignForm((f) => ({ ...f, rombel_id: e.target.value, pengguna_id: '' }))}
                    className="input w-full"
                    disabled={user.role === 'admin' && !assignForm.cabang_id}
                  >
                    <option value="">
                      {user.role === 'admin' && !assignForm.cabang_id ? 'Pilih cabang dulu' : 'Pilih rombel'}
                    </option>
                    {assignRombelOptions.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.nama} - {r.jenjang_nama}
                      </option>
                    ))}
                  </CustomSelect>
                </label>
                <label className="block">
                  <span className="label">Peran</span>
                  <CustomSelect
                    value={assignForm.role}
                    onChange={(e) => setAssignForm((f) => ({ ...f, role: e.target.value }))}
                    className="input w-full"
                  >
                    <option value="bantu">Bantu</option>
                    <option value="utama">Utama</option>
                  </CustomSelect>
                </label>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-black uppercase tracking-wider text-slate-400">Guru Terpasang</div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {selectedAssignRombel?.nama || 'Pilih rombel terlebih dahulu'}
                  </div>
                </div>
                {selectedAssignedGurus.length > 0 && (
                  <GuruAvatarStack
                    gurus={selectedAssignedGurus}
                    onSelect={(g) => selectedAssignRombel && setRoleConfirm({ rombel: selectedAssignRombel, guru: g })}
                  />
                )}
              </div>
              {selectedAssignedGurus.length > 0 && (
                <div className="mt-3 max-h-52 space-y-1.5 overflow-y-auto pr-1 custom-scrollbar">
                  {selectedAssignedGurus.map((g) => (
                    <div
                      key={g.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1.5"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <StudentAvatar name={g.display_name} url={g.foto} size="sm" />
                        <div className="min-w-0">
                          <div className="truncate text-xs font-black text-slate-700">{g.display_name}</div>
                          <button
                            onClick={() => setRoleConfirm({ rombel: selectedAssignRombel, guru: g })}
                            className={`mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-black ${g.role === 'utama' ? 'bg-primary-container text-primary-active' : 'bg-slate-100 text-slate-500'}`}
                          >
                            {g.role === 'utama' ? 'Utama' : 'Bantu'}
                          </button>
                        </div>
                      </div>
                      <IconButton
                        icon={UserMinus}
                        label={`Lepas ${g.display_name}`}
                        onClick={() => removeGuru(selectedAssignRombel, g)}
                        size="sm"
                        variant="danger"
                      />
                    </div>
                  ))}
                </div>
              )}
              {selectedAssignRombel && selectedAssignedGurus.length === 0 && (
                <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs italic text-slate-400">
                  Belum ada guru terpasang.
                </div>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-xs font-black uppercase tracking-wider text-slate-400">Tambah Guru</div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                <CustomSelect
                  value={assignForm.pengguna_id}
                  onChange={(e) => setAssignForm((f) => ({ ...f, pengguna_id: e.target.value }))}
                  className="input w-full"
                  disabled={!assignForm.rombel_id}
                >
                  <option value="">
                    {assignForm.rombel_id
                      ? availableAssignGurus.length
                        ? 'Pilih guru'
                        : 'Semua guru sudah ditugaskan'
                      : user.role === 'admin' && !assignForm.cabang_id
                        ? 'Pilih cabang dulu'
                        : 'Pilih rombel dulu'}
                  </option>
                  {availableAssignGurus.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.display_name}
                    </option>
                  ))}
                </CustomSelect>
                <ActionButton
                  icon={Users}
                  onClick={assignGuruFromModal}
                  disabled={
                    (user.role === 'admin' && !assignForm.cabang_id) || !assignForm.rombel_id || !assignForm.pengguna_id
                  }
                >
                  Simpan
                </ActionButton>
              </div>
            </div>
          </div>
        </Modal>
      )}
      {guruDetailRombel && (
        <Modal title={`Guru ${guruDetailRombel.nama}`} onClose={() => setGuruDetailRombel(null)} maxWidth="max-w-xl">
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-black uppercase tracking-wider text-slate-400">Rombel</div>
              <div className="mt-1 font-black text-text-main">{guruDetailRombel.nama}</div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {guruDetailRombel.cabang_nama} · {guruDetailRombel.jenjang_nama}
              </div>
            </div>
            {(guruDetailRombel.gurus || []).length > 0 ? (
              <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1 custom-scrollbar">
                {(guruDetailRombel.gurus || []).map((g) => (
                  <div
                    key={g.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-white px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <StudentAvatar name={g.display_name} url={g.foto} size="sm" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-slate-800">{g.display_name}</div>
                        <button
                          onClick={() => setRoleConfirm({ rombel: guruDetailRombel, guru: g })}
                          className={`mt-1 rounded px-1.5 py-0.5 text-[10px] font-black ${g.role === 'utama' ? 'bg-primary-container text-primary-active' : 'bg-slate-100 text-slate-500'}`}
                        >
                          {g.role === 'utama' ? 'Utama' : 'Bantu'}
                        </button>
                      </div>
                    </div>
                    <IconButton
                      icon={UserMinus}
                      label={`Lepas ${g.display_name}`}
                      onClick={() => removeGuru(guruDetailRombel, g)}
                      size="sm"
                      variant="danger"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm italic text-slate-400">
                Belum ada guru terpasang.
              </div>
            )}
          </div>
        </Modal>
      )}
      {roleConfirm && (
        <ConfirmActionModal
          title="Ubah Peran Guru"
          entityName={`${roleConfirm.guru.display_name} (${roleConfirm.rombel.nama})`}
          affectedBranch={roleConfirm.rombel.cabang_nama || m.cabang.find((c) => c.id === m.cabangId)?.nama || 'Pusat'}
          consequence={
            roleConfirm.guru.role === 'bantu'
              ? `Mengubah peran menjadi Guru Utama akan otomatis mengubah status Guru Utama saat ini di kelas ${roleConfirm.rombel.nama} menjadi Guru Bantu.`
              : `Mengubah peran menjadi Guru Bantu.`
          }
          actionLabel="Ya, Ubah Peran"
          actionVariant="primary"
          icon={RefreshCw}
          onClose={() => setRoleConfirm(null)}
          onSubmit={async () => {
            await toggleGuruRole(roleConfirm.rombel, roleConfirm.guru);
            setRoleConfirm(null);
          }}
        />
      )}
      {editingRombel && (
        <Modal title="Edit Rombel" onClose={() => setEditingRombel(null)} maxWidth="max-w-md">
          <div className="space-y-4 p-1">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nama Rombel</span>
              <Input
                placeholder="Nama rombel (contoh: KB Tulip)"
                value={editingRombel.nama}
                onChange={(v) => setEditingRombel((f) => ({ ...f, nama: v }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Jenjang</span>
              <CustomSelect
                value={editingRombel.jenjang_id}
                onChange={(e) => setEditingRombel((f) => ({ ...f, jenjang_id: e.target.value }))}
                className="input w-full"
              >
                <option value="">Pilih Jenjang</option>
                {m.jenjang.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.nama}
                  </option>
                ))}
              </CustomSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Status Rombel</span>
              <CustomSelect
                value={editingRombel.aktif === undefined ? 1 : editingRombel.aktif}
                onChange={(e) => setEditingRombel((f) => ({ ...f, aktif: e.target.value === '1' ? 1 : 0 }))}
                className="input w-full"
              >
                <option value="1">Aktif</option>
                <option value="0">Nonaktif</option>
              </CustomSelect>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <ActionButton
                onClick={() => setEditingRombel(null)}
                className="bg-slate-100 text-slate-600 hover:bg-slate-200"
              >
                Batal
              </ActionButton>
              <ActionButton icon={Save} onClick={saveEdit}>
                Simpan Perubahan
              </ActionButton>
            </div>
          </div>
        </Modal>
      )}
      {deleteConfirm && (
        <ConfirmActionModal
          title="Hapus Rombel"
          entityName={deleteConfirm.nama}
          affectedBranch={deleteConfirm.cabang_nama || m.cabang.find((c) => c.id === m.cabangId)?.nama || 'Pusat'}
          consequence="Menghapus rombel ini juga akan menghapus data penugasan guru di dalamnya. Rombel tidak bisa dihapus jika masih ada siswa yang terdaftar aktif."
          actionLabel="Ya, Hapus Rombel"
          actionVariant="danger"
          icon={Trash2}
          onClose={() => setDeleteConfirm(null)}
          onSubmit={async () => {
            await removeRombel(deleteConfirm.id);
            setDeleteConfirm(null);
          }}
        />
      )}
    </Panel>
  );
}
