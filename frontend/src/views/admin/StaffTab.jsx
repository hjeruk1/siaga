import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { ActionButton, ConfirmActionModal, IconButton, Modal, CustomSelect } from '../../components/Shared';
import {
  AlertCircle,
  Copy,
  KeyRound,
  Pencil,
  Power,
  PowerOff,
  RotateCcw,
  Save,
  Search,
  Settings,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X
} from 'lucide-react';
import { useMaster, StudentAvatar, StatusBadge, StaffCard, Panel, Table, Td, FotoUpload } from './AdminShared';

export default function StaffTab({ user, toast }) {
  const m = useMaster(user);
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ display_name: '', username: '', role: 'guru', cabang_id: '' });
  const [edit, setEdit] = useState(null);
  const [tempPw, setTempPw] = useState(null);
  const [openForm, setOpenForm] = useState(false);
  const [statusConfirm, setStatusConfirm] = useState(null);
  const [resetConfirm, setResetConfirm] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Photo upload states
  const [selectedFotoFile, setSelectedFotoFile] = useState(null);
  const [selectedFotoUrl, setSelectedFotoUrl] = useState('');

  // Photo upload states for Edit modal
  const [editFotoFile, setEditFotoFile] = useState(null);
  const [editFotoUrl, setEditFotoUrl] = useState('');
  const [editFotoDeleted, setEditFotoDeleted] = useState(false);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);

  function closeAddForm() {
    setOpenForm(false);
    setForm({ display_name: '', username: '', role: 'guru', cabang_id: '' });
    if (selectedFotoUrl) {
      URL.revokeObjectURL(selectedFotoUrl);
    }
    setSelectedFotoFile(null);
    setSelectedFotoUrl('');
  }

  function closeEditForm() {
    if (editFotoUrl) {
      URL.revokeObjectURL(editFotoUrl);
    }
    setEditFotoFile(null);
    setEditFotoUrl('');
    setEditFotoDeleted(false);
    setEdit(null);
  }

  useEffect(() => {
    return () => {
      if (editFotoUrl) URL.revokeObjectURL(editFotoUrl);
    };
  }, [editFotoUrl]);

  async function load() {
    setList(await api.staff(m.cabangId));
  }
  useEffect(() => {
    load().catch((e) => toast('err', e.message));
  }, [m.cabangId]);

  // Client-side filtering logic
  const filteredList = useMemo(() => {
    return list.filter((s) => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = s.display_name?.toLowerCase().includes(query);
        const matchesUsername = s.username?.toLowerCase().includes(query);
        if (!matchesName && !matchesUsername) return false;
      }
      if (filterRole) {
        if (s.role !== filterRole) return false;
      }
      if (filterStatus) {
        if (s.status?.toLowerCase() !== filterStatus.toLowerCase()) return false;
      }
      return true;
    });
  }, [list, searchQuery, filterRole, filterStatus]);

  async function add() {
    if (!form.display_name.trim() || !form.username.trim()) {
      toast('err', 'Nama dan username wajib diisi');
      return;
    }
    const targetCabang = form.role === 'admin' ? '' : user.role === 'admin' ? form.cabang_id : m.cabangId;
    if (form.role !== 'admin' && !targetCabang) {
      toast('err', 'Pilih cabang dulu');
      return;
    }
    try {
      const r = await api.createStaff({
        ...form,
        display_name: form.display_name.trim(),
        username: form.username.trim(),
        cabang_id: targetCabang
      });
      if (selectedFotoFile) {
        try {
          await api.uploadStaffFoto(r.id, selectedFotoFile);
        } catch (photoErr) {
          toast('err', 'Staff disimpan, tapi gagal mengunggah foto: ' + photoErr.message);
        }
      }
      setTempPw(r.temporary_password);
      closeAddForm();
      load();
    } catch (e) {
      toast('err', e.message);
    }
  }

  async function reset(id) {
    try {
      const r = await api.resetPassword(id);
      setTempPw(r.temporary_password);
    } catch (e) {
      toast('err', e.message);
    }
  }
  async function setStatus(s, status) {
    try {
      await api.updateStaff(s.id, { display_name: s.display_name, role: s.role, cabang_id: s.cabang_id, status });
      toast('ok', status === 'nonaktif' ? 'Staff dinonaktifkan' : 'Staff diaktifkan');
      load();
    } catch (e) {
      toast('err', e.message);
    }
  }
  async function saveEdit() {
    try {
      if (editFotoDeleted) {
        await api.deleteStaffFoto(edit.id);
      }
      if (editFotoFile) {
        await api.uploadStaffFoto(edit.id, editFotoFile);
      }
      const { foto, ...payload } = edit;
      await api.updateStaff(edit.id, payload);
      toast('ok', 'Staff diperbarui');
      closeEditForm();
      load();
    } catch (e) {
      toast('err', e.message);
    }
  }
  function openDeleteStaff(s) {
    setDeleteConfirm(s);
    setDeleteConfirmText('');
  }
  async function deleteStaffPermanently() {
    if (!deleteConfirm) return;
    if (deleteConfirmText !== deleteConfirm.username) {
      toast('err', 'Username konfirmasi belum cocok');
      return;
    }
    try {
      await api.deleteStaff(deleteConfirm.id);
      toast('ok', 'Staff dihapus permanen');
      setDeleteConfirm(null);
      setDeleteConfirmText('');
      load();
    } catch (e) {
      toast('err', e.message);
    }
  }

  const roles = user.role === 'admin' ? ['admin', 'admin_cabang', 'kepsek', 'guru', 'gerbang'] : ['guru', 'gerbang'];
  const canDeleteStaff = (s) =>
    ['admin', 'admin_cabang'].includes(user.role) &&
    Number(s.id) !== Number(user.id) &&
    (user.role === 'admin' || ['guru', 'gerbang'].includes(s.role));
  const right = (
    <ActionButton
      icon={UserPlus}
      onClick={() => {
        setForm({ display_name: '', username: '', role: 'guru', cabang_id: m.cabangId || '' });
        setOpenForm(true);
      }}
      className="w-full sm:w-auto"
    >
      Tambah Staff
    </ActionButton>
  );

  return (
    <Panel title="Staff" right={right} className="overflow-visible md:overflow-hidden">
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
                  placeholder="Cari staff…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input pl-10 w-full font-bold"
                />
                {searchQuery && (
                  <button
                    type="button"
                    aria-label="Hapus pencarian staff"
                    onClick={() => setSearchQuery('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button
                type="button"
                aria-label="Buka filter staff"
                onClick={() => setFilterOpen((v) => !v)}
                className={`md:hidden relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-black transition ${
                  filterOpen || filterRole || filterStatus || (user.role === 'admin' && m.cabangId)
                    ? 'border-primary bg-primary-container text-primary'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Filter</span>
                {(() => {
                  const count = [filterRole, filterStatus, user.role === 'admin' && m.cabangId].filter(Boolean).length;
                  return count > 0 ? (
                    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-white">
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
                  value={filterRole}
                  onChange={(e) => setFilterRole(e.target.value)}
                  className="input w-full md:w-40 text-xs sm:text-sm"
                >
                  <option value="">Semua Role</option>
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {r.replace('_', ' ')}
                    </option>
                  ))}
                </CustomSelect>

                <CustomSelect
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="input w-full md:w-36 text-xs sm:text-sm"
                >
                  <option value="">Semua Status</option>
                  <option value="undangan">Undangan</option>
                  <option value="aktif">Aktif</option>
                  <option value="nonaktif">Nonaktif</option>
                </CustomSelect>
              </div>
            </div>
          </div>
        </div>

        {/* Desktop view table */}
        <div className="hidden md:block">
          <Table headers={['', 'Nama', 'Username', 'Role', 'Cabang', 'Status', 'Aksi']}>
            {filteredList.map((s) => (
              <tr key={s.id}>
                <Td>
                  <StudentAvatar name={s.display_name} url={s.foto} size="md" />
                </Td>
                <Td>
                  <span className="font-bold text-slate-800">{s.display_name}</span>
                </Td>
                <Td>{s.username}</Td>
                <Td>
                  <span className="capitalize font-medium text-slate-600">{s.role.replace('_', ' ')}</span>
                </Td>
                <Td>{s.cabang_nama || 'Pusat'}</Td>
                <Td>
                  <StatusBadge status={s.status} />
                </Td>
                <Td>
                  <div className="flex gap-2">
                    <IconButton icon={Pencil} label={`Edit ${s.display_name}`} onClick={() => setEdit(s)} size="sm" />
                    <IconButton icon={RotateCcw} label="Reset password" onClick={() => setResetConfirm(s)} size="sm" />
                    {s.status === 'nonaktif' ? (
                      <IconButton
                        icon={Power}
                        label="Aktifkan"
                        onClick={() => setStatusConfirm({ staff: s, status: 'aktif' })}
                        size="sm"
                      />
                    ) : (
                      <IconButton
                        icon={PowerOff}
                        label="Nonaktifkan"
                        onClick={() => setStatusConfirm({ staff: s, status: 'nonaktif' })}
                        size="sm"
                        variant="danger"
                      />
                    )}
                    {canDeleteStaff(s) && (
                      <IconButton
                        icon={Trash2}
                        label={`Hapus permanen ${s.display_name}`}
                        onClick={() => openDeleteStaff(s)}
                        size="sm"
                        variant="danger"
                      />
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
          {filteredList.length === 0 && (
            <div className="mt-3 bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-sm font-bold">
              Tidak ada data staff yang ditemukan.
            </div>
          )}
        </div>

        {/* Mobile view card stack */}
        <div className="block md:hidden space-y-3">
          {filteredList.map((s) => (
            <StaffCard
              key={s.id}
              staff={s}
              onEdit={setEdit}
              onReset={setResetConfirm}
              onStatusToggle={setStatusConfirm}
              onDelete={openDeleteStaff}
              canDelete={canDeleteStaff(s)}
            />
          ))}
          {filteredList.length === 0 && (
            <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-sm font-bold">
              Tidak ada data staff yang ditemukan.
            </div>
          )}
        </div>
      </div>

      {openForm && (
        <Modal title="Tambah Staff" onClose={closeAddForm} maxWidth="max-w-3xl">
          <div className="flex flex-col md:flex-row gap-5">
            {/* Left Column: Photo Upload Container */}
            <div className="w-full md:w-48 shrink-0 flex flex-col items-center bg-slate-50 border border-slate-200/60 rounded-2xl p-5 text-center">
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
                Pilih foto staff. Gunakan format JPG/PNG, maks. 2MB.
              </div>
            </div>

            {/* Right Column: compact staff account form */}
            <div className="flex-1 space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
                <div className="text-[11px] font-black text-primary uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  Data Akun Staff
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="label">
                      Nama Lengkap <span className="text-rose-500">*</span>
                    </span>
                    <input
                      type="text"
                      placeholder="Nama lengkap staff"
                      value={form.display_name}
                      onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
                      autoComplete="off"
                      className="input w-full"
                    />
                  </label>
                  <label className="block">
                    <span className="label">
                      Username <span className="text-rose-500">*</span>
                    </span>
                    <input
                      type="text"
                      placeholder="Username login"
                      value={form.username}
                      onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                      autoComplete="username"
                      spellCheck={false}
                      className="input w-full"
                    />
                  </label>
                  <label className="block">
                    <span className="label">
                      Role / Jabatan <span className="text-rose-500">*</span>
                    </span>
                    <CustomSelect
                      value={form.role}
                      onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                      className="input w-full"
                    >
                      {roles.map((r) => (
                        <option key={r} value={r}>
                          {r.replace('_', ' ')}
                        </option>
                      ))}
                    </CustomSelect>
                  </label>
                  {user.role === 'admin' && form.role !== 'admin' && (
                    <label className="block">
                      <span className="label">
                        Cabang <span className="text-rose-500">*</span>
                      </span>
                      <CustomSelect
                        value={form.cabang_id || ''}
                        onChange={(e) => setForm((f) => ({ ...f, cabang_id: e.target.value }))}
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
                  {form.role === 'admin' && (
                    <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      Admin pusat tidak terikat ke satu cabang.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="flex items-start gap-2.5">
                  <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <div>
                    <div className="text-xs font-black text-slate-700">Password sementara otomatis</div>
                    <div className="mt-0.5 text-xs leading-relaxed text-slate-500">
                      Ditampilkan sekali setelah akun staff dibuat.
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <ActionButton icon={X} onClick={closeAddForm} variant="secondary">
                  Batal
                </ActionButton>
                <ActionButton icon={UserPlus} onClick={add}>
                  Tambah Staff
                </ActionButton>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {edit && (
        <Modal title="Edit Staff" onClose={closeEditForm} maxWidth="max-w-3xl">
          <div className="flex flex-col md:flex-row gap-5">
            {/* Left Column: Photo Upload Container */}
            <div className="w-full md:w-48 shrink-0 flex flex-col items-center bg-slate-50 border border-slate-200/60 rounded-2xl p-5 text-center">
              <div className="text-xs font-black text-slate-400 uppercase tracking-wider mb-4">Foto Profil</div>
              <FotoUpload
                size="xl"
                url={edit.foto}
                onUpload={(file) => {
                  const url = URL.createObjectURL(file);
                  if (editFotoUrl) URL.revokeObjectURL(editFotoUrl);
                  setEditFotoFile(file);
                  setEditFotoUrl(url);
                  setEditFotoDeleted(false);
                  setEdit((e) => ({ ...e, foto: url }));
                }}
                onDelete={() => {
                  if (editFotoUrl) URL.revokeObjectURL(editFotoUrl);
                  setEditFotoFile(null);
                  setEditFotoUrl('');
                  setEditFotoDeleted(true);
                  setEdit((e) => ({ ...e, foto: null }));
                }}
              />
              <div className="text-[10px] sm:text-[11px] text-slate-400 mt-4 leading-relaxed">
                Ubah foto staff. Gunakan format JPG/PNG, maks. 2MB.
              </div>
            </div>

            {/* Right Column: compact staff account form */}
            <div className="flex-1 space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
                <div className="text-[11px] font-black text-primary uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" />
                  Data Akun Staff
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Username</div>
                  <div className="mt-0.5 font-mono text-sm font-black text-slate-700">{edit.username || '-'}</div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="label">
                      Nama Lengkap <span className="text-rose-500">*</span>
                    </span>
                    <input
                      type="text"
                      placeholder="Nama lengkap staff"
                      value={edit.display_name || ''}
                      onChange={(e) => setEdit((x) => ({ ...x, display_name: e.target.value }))}
                      className="input w-full"
                    />
                  </label>
                  <label className="block">
                    <span className="label">
                      Role / Jabatan <span className="text-rose-500">*</span>
                    </span>
                    <CustomSelect
                      value={edit.role}
                      onChange={(e) =>
                        setEdit((x) => ({
                          ...x,
                          role: e.target.value,
                          cabang_id: e.target.value === 'admin' ? '' : x.cabang_id
                        }))
                      }
                      className="input w-full"
                    >
                      {roles.map((r) => (
                        <option key={r} value={r}>
                          {r.replace('_', ' ')}
                        </option>
                      ))}
                    </CustomSelect>
                  </label>
                  {user.role === 'admin' && edit.role !== 'admin' && (
                    <label className="block">
                      <span className="label">
                        Cabang <span className="text-rose-500">*</span>
                      </span>
                      <CustomSelect
                        value={edit.cabang_id || ''}
                        onChange={(e) => setEdit((x) => ({ ...x, cabang_id: e.target.value }))}
                        className="input w-full"
                      >
                        <option value="">Pusat</option>
                        {m.cabang.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nama}
                          </option>
                        ))}
                      </CustomSelect>
                    </label>
                  )}
                  {edit.role === 'admin' && (
                    <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      Admin pusat tidak terikat ke satu cabang.
                    </div>
                  )}
                  <label className="block">
                    <span className="label">
                      Status Akun <span className="text-rose-500">*</span>
                    </span>
                    <CustomSelect
                      value={edit.status}
                      onChange={(e) => setEdit((x) => ({ ...x, status: e.target.value }))}
                      className="input w-full"
                    >
                      <option value="undangan">Undangan</option>
                      <option value="aktif">Aktif</option>
                      <option value="nonaktif">Nonaktif</option>
                    </CustomSelect>
                  </label>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <div>
                    <div className="text-xs font-black text-slate-700">Perubahan role dapat memengaruhi akses</div>
                    <div className="mt-0.5 text-xs leading-relaxed text-slate-500">
                      Jika guru dipindah cabang, assignment rombel lama akan dibersihkan oleh sistem.
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <ActionButton icon={X} onClick={closeEditForm} variant="secondary">
                  Batal
                </ActionButton>
                <ActionButton icon={Save} onClick={saveEdit}>
                  Simpan Perubahan
                </ActionButton>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {tempPw && (
        <Modal title="Password Sementara" onClose={() => setTempPw(null)}>
          <div className="space-y-4">
            <div className="text-sm text-slate-600">
              Password sementara telah dibuat. Salin dan bagikan kepada pengguna:
            </div>
            <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 text-center">
              <span className="text-2xl font-black text-text-main tracking-widest select-all">{tempPw}</span>
            </div>
            <ActionButton
              icon={Copy}
              onClick={() => {
                navigator.clipboard.writeText(tempPw);
                toast('ok', 'Password disalin ke clipboard');
              }}
              className="w-full"
            >
              Salin Password
            </ActionButton>
            <div className="text-xs text-slate-400">
              Password ini hanya ditampilkan sekali. Tutup dialog untuk menghapusnya.
            </div>
          </div>
        </Modal>
      )}

      {statusConfirm && (
        <ConfirmActionModal
          title={statusConfirm.status === 'nonaktif' ? 'Nonaktifkan Staff' : 'Aktifkan Staff'}
          entityName={statusConfirm.staff.display_name}
          affectedBranch={statusConfirm.staff.cabang_nama || 'Pusat'}
          consequence={
            statusConfirm.status === 'nonaktif'
              ? 'Menonaktifkan staff akan memblokir semua akses masuk sistem untuk staff ini.'
              : null
          }
          actionLabel={statusConfirm.status === 'nonaktif' ? 'Ya, Nonaktifkan' : 'Ya, Aktifkan'}
          actionVariant={statusConfirm.status === 'nonaktif' ? 'danger' : 'primary'}
          icon={Power}
          onClose={() => setStatusConfirm(null)}
          onSubmit={async () => {
            await setStatus(statusConfirm.staff, statusConfirm.status);
            setStatusConfirm(null);
          }}
        />
      )}

      {resetConfirm && (
        <ConfirmActionModal
          title="Reset Password Staff"
          entityName={resetConfirm.display_name}
          affectedBranch={resetConfirm.cabang_nama || 'Pusat'}
          consequence="Tindakan ini akan mengatur ulang password akun staff ini ke password sementara acak. Password sebelumnya tidak akan bisa digunakan lagi."
          actionLabel="Ya, Reset Password"
          actionVariant="danger"
          icon={RotateCcw}
          onClose={() => setResetConfirm(null)}
          onSubmit={async () => {
            await reset(resetConfirm.id);
            setResetConfirm(null);
          }}
        />
      )}

      {deleteConfirm && (
        <Modal
          title="Hapus Permanen Staff"
          onClose={() => {
            setDeleteConfirm(null);
            setDeleteConfirmText('');
          }}
          maxWidth="max-w-lg"
        >
          <div className="space-y-4">
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-xl bg-red-100 p-2 text-red-700">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-black text-red-900">Aksi ini hanya untuk data staff yang salah dibuat.</div>
                  <div className="mt-1 text-sm leading-relaxed text-red-700">
                    Sistem akan menolak penghapusan jika staff sudah punya riwayat operasional seperti daily record,
                    absensi, modul ajar, billing, atau audit tindakan.
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="text-[11px] font-black uppercase tracking-wider text-slate-400">Staff</div>
              <div className="mt-1 font-black text-text-main">{deleteConfirm.display_name}</div>
              <div className="text-xs text-slate-500">
                {deleteConfirm.username} · {deleteConfirm.role.replace('_', ' ')} ·{' '}
                {deleteConfirm.cabang_nama || 'Pusat'}
              </div>
            </div>
            <label className="block">
              <span className="label">
                Ketik username untuk konfirmasi{' '}
                <span className="font-mono text-rose-600">{deleteConfirm.username}</span>
              </span>
              <input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="input w-full font-mono"
                placeholder={deleteConfirm.username}
              />
            </label>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <ActionButton
                icon={X}
                onClick={() => {
                  setDeleteConfirm(null);
                  setDeleteConfirmText('');
                }}
                variant="secondary"
              >
                Batal
              </ActionButton>
              <ActionButton
                icon={Trash2}
                onClick={deleteStaffPermanently}
                variant="danger"
                disabled={deleteConfirmText !== deleteConfirm.username}
              >
                Hapus Permanen
              </ActionButton>
            </div>
          </div>
        </Modal>
      )}
    </Panel>
  );
}
