import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import {
  ActionButton,
  ConfirmActionModal,
  IconButton,
  Modal,
  CustomSelect,
  SearchableSelect
} from '../../components/Shared';
import {
  AlertCircle,
  Check,
  Copy,
  Pencil,
  Plus,
  Power,
  PowerOff,
  RotateCcw,
  Save,
  Search,
  Settings,
  Users,
  X
} from 'lucide-react';
import { useMaster, WaliStatusBadge, WaliCard, Panel, Input, Table, Td } from './AdminShared';

export default function WaliTab({ user, toast }) {
  const m = useMaster(user);
  const [siswa, setSiswa] = useState([]);
  const [wali, setWali] = useState([]);
  const [form, setForm] = useState({ display_name: '', no_wa: '', siswa_id: '', relasi: '' });
  const [tempPw, setTempPw] = useState(null);
  const [editing, setEditing] = useState(null);
  const [openForm, setOpenForm] = useState(false);
  const [statusConfirm, setStatusConfirm] = useState(null);
  const [resetConfirm, setResetConfirm] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);

  async function load() {
    const [siswaData, waliData] = await Promise.all([
      api.siswa({ cabang_id: m.cabangId, status: 'semua' }),
      api.wali(m.cabangId)
    ]);
    setSiswa(siswaData);
    setWali(waliData);
  }
  useEffect(() => {
    load().catch((e) => toast('err', e.message));
  }, [m.cabangId]);
  async function add() {
    if (!form.display_name.trim() || !form.no_wa.trim() || !form.siswa_id) {
      toast('err', 'Nama wali, nomor WA, dan siswa wajib diisi');
      return;
    }
    try {
      const r = await api.createWali({ ...form, display_name: form.display_name.trim(), no_wa: form.no_wa.trim() });
      if (r.temporary_password) {
        setTempPw(r.temporary_password);
      } else {
        toast('ok', 'Akun wali yang sudah ada dikaitkan ke siswa');
      }
      setForm({ display_name: '', no_wa: '', siswa_id: '', relasi: '' });
      setOpenForm(false);
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
  async function setStatus(w, status) {
    try {
      await api.updateWali(w.id, { display_name: w.display_name, no_wa: w.no_wa, status });
      toast('ok', status === 'nonaktif' ? 'Akun wali dinonaktifkan' : 'Akun wali diaktifkan');
      load();
    } catch (e) {
      toast('err', e.message);
    }
  }
  async function saveEdit() {
    try {
      await api.updateWali(editing.id, {
        display_name: editing.display_name,
        no_wa: editing.no_wa,
        status: editing.status
      });
      toast('ok', 'Akun wali diperbarui');
      setEditing(null);
      load();
    } catch (e) {
      toast('err', e.message);
    }
  }
  const filteredWali = useMemo(() => {
    return wali.filter((w) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        if (
          ![w.display_name, w.no_wa, w.siswa_nama, w.cabang_nama].some((val) =>
            String(val || '')
              .toLowerCase()
              .includes(q)
          )
        )
          return false;
      }
      return !(filterStatus && w.status !== filterStatus);
    });
  }, [wali, searchQuery, filterStatus]);
  const selectedSiswa = siswa.find((s) => String(s.id) === String(form.siswa_id));
  const right = (
    <div className="flex w-full items-center gap-2 sm:w-auto">
      <ActionButton
        icon={Plus}
        onClick={() => {
          setForm({ display_name: '', no_wa: '', siswa_id: '', relasi: '' });
          setOpenForm(true);
        }}
        className="w-full sm:hidden"
      >
        Tambah Wali
      </ActionButton>
      <ActionButton
        icon={Plus}
        onClick={() => {
          setForm({ display_name: '', no_wa: '', siswa_id: '', relasi: '' });
          setOpenForm(true);
        }}
        className="hidden sm:inline-flex"
      >
        Tambah Wali
      </ActionButton>
    </div>
  );
  return (
    <Panel title="Akun Wali" right={right} className="overflow-visible md:overflow-hidden">
      <div className="space-y-4">
        <div className="sticky top-[64px] z-20 -mx-1 rounded-xl border border-slate-200 bg-slate-50/95 p-3 shadow-sm backdrop-blur md:static md:z-auto md:mx-0 md:bg-slate-50 md:shadow-none md:backdrop-blur-0">
          <div className="md:grid md:grid-cols-[minmax(18rem,1fr)_auto] md:items-start md:gap-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Search className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  placeholder="Cari wali, nomor WA, siswa, atau cabang…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoComplete="off"
                  className="input pl-10 w-full font-bold"
                />
                {searchQuery && (
                  <button
                    type="button"
                    aria-label="Hapus pencarian wali"
                    onClick={() => setSearchQuery('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button
                type="button"
                aria-label="Buka filter wali"
                onClick={() => setFilterOpen((v) => !v)}
                className={`md:hidden relative flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-black transition-colors ${filterOpen || filterStatus || (user.role === 'admin' && m.cabangId) ? 'border-primary bg-primary/10 text-primary' : 'border-slate-200 bg-white text-slate-500'}`}
              >
                <Settings className="w-3.5 h-3.5" />
                Filter
                {(() => {
                  const count = [filterStatus, user.role === 'admin' && m.cabangId].filter(Boolean).length;
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
                    {m.cabang.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.nama}
                      </option>
                    ))}
                  </CustomSelect>
                )}
                <CustomSelect
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="input w-full md:w-40 text-xs sm:text-sm"
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
        <div className="hidden md:block">
          <Table headers={['Nama', 'WA', 'Siswa', 'Cabang', 'Status', 'Aksi']}>
            {filteredWali.map((v) => (
              <tr key={v.id}>
                <Td>
                  <span className="font-bold text-slate-800">{v.display_name}</span>
                </Td>
                <Td>
                  <span className="font-mono text-slate-700 font-bold">{v.no_wa}</span>
                </Td>
                <Td>{v.siswa_nama || '-'}</Td>
                <Td>{v.cabang_nama || 'Pusat'}</Td>
                <Td>
                  <WaliStatusBadge status={v.status} />
                </Td>
                <Td>
                  <div className="flex gap-2">
                    <IconButton
                      icon={Pencil}
                      label={`Edit ${v.display_name}`}
                      onClick={() => setEditing(v)}
                      size="sm"
                    />
                    <IconButton icon={RotateCcw} label="Reset password" onClick={() => setResetConfirm(v)} size="sm" />
                    {v.status === 'nonaktif' ? (
                      <IconButton
                        icon={Check}
                        label="Aktifkan"
                        onClick={() => setStatusConfirm({ wali: v, status: 'aktif' })}
                        size="sm"
                      />
                    ) : (
                      <IconButton
                        icon={Power}
                        label="Nonaktifkan"
                        onClick={() => setStatusConfirm({ wali: v, status: 'nonaktif' })}
                        size="sm"
                        variant="danger"
                      />
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
          {filteredWali.length === 0 && (
            <div className="mt-3 bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-sm font-bold">
              Tidak ada akun wali yang ditemukan.
            </div>
          )}
        </div>
        <div className="block md:hidden space-y-3">
          {filteredWali.map((v) => (
            <WaliCard
              key={v.id}
              wali={v}
              onEdit={setEditing}
              onReset={setResetConfirm}
              onStatusToggle={setStatusConfirm}
            />
          ))}
          {filteredWali.length === 0 && (
            <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-sm font-bold">
              Tidak ada akun wali yang ditemukan.
            </div>
          )}
        </div>
      </div>
      {openForm && (
        <Modal title="Tambah Wali" onClose={() => setOpenForm(false)} maxWidth="max-w-3xl">
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
              <div className="text-[11px] font-black text-primary uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                Data Akun Wali
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="label">
                    Nama Wali <span className="text-rose-500">*</span>
                  </span>
                  <Input
                    placeholder="Nama lengkap wali"
                    value={form.display_name}
                    onChange={(v) => setForm((f) => ({ ...f, display_name: v }))}
                  />
                </label>
                <label className="block">
                  <span className="label">
                    Nomor WhatsApp Login <span className="text-rose-500">*</span>
                  </span>
                  <Input
                    placeholder="08xxxxxxxxxx"
                    value={form.no_wa}
                    onChange={(v) => setForm((f) => ({ ...f, no_wa: v }))}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="label">
                    Siswa Terhubung <span className="text-rose-500">*</span>
                  </span>
                  <SearchableSelect
                    value={form.siswa_id}
                    onChange={(e) => setForm((f) => ({ ...f, siswa_id: e.target.value }))}
                    className="input w-full"
                    placeholder="Pilih siswa"
                    searchPlaceholder="Cari nama siswa…"
                  >
                    <option value="">Pilih siswa</option>
                    {siswa.map((v) => (
                      <option
                        key={v.id}
                        value={v.id}
                      >{`${v.nama}${v.rombel_nama ? ' - ' + v.rombel_nama : ''}`}</option>
                    ))}
                  </SearchableSelect>
                </label>
                <label className="block">
                  <span className="label">Relasi</span>
                  <Input
                    placeholder="Ayah, Ibu, Wali"
                    value={form.relasi}
                    onChange={(v) => setForm((f) => ({ ...f, relasi: v }))}
                  />
                </label>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Cabang Siswa</div>
                  <div className="mt-0.5 text-sm font-black text-slate-700">
                    {selectedSiswa?.cabang_nama ||
                      m.cabang.find((v) => String(v.id) === String(m.cabangId))?.nama ||
                      '-'}
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div>
                  <div className="text-xs font-black text-slate-700">Nomor WA menjadi identitas login</div>
                  <div className="mt-0.5 text-xs leading-relaxed text-slate-500">
                    Jika nomor sudah terdaftar, sistem akan menghubungkan akun wali yang sama ke siswa ini.
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <ActionButton icon={X} onClick={() => setOpenForm(false)} variant="secondary">
                Batal
              </ActionButton>
              <ActionButton icon={Plus} onClick={add}>
                Tambah Wali
              </ActionButton>
            </div>
          </div>
        </Modal>
      )}
      {editing && (
        <Modal title="Edit Akun Wali" onClose={() => setEditing(null)} maxWidth="max-w-2xl">
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
              <div className="text-[11px] font-black text-primary uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                Data Akun Wali
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Siswa Terhubung</div>
                <div className="mt-0.5 text-sm font-black text-slate-700">{editing.siswa_nama || '-'}</div>
                <div className="text-xs text-slate-500">
                  {editing.cabang_nama || m.cabang.find((v) => String(v.id) === String(m.cabangId))?.nama || 'Pusat'}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="label">
                    Nama Wali <span className="text-rose-500">*</span>
                  </span>
                  <Input
                    placeholder="Nama wali"
                    value={editing.display_name || ''}
                    onChange={(v) => setEditing((e) => ({ ...e, display_name: v }))}
                  />
                </label>
                <label className="block">
                  <span className="label">
                    Nomor WhatsApp Login <span className="text-rose-500">*</span>
                  </span>
                  <Input
                    placeholder="08xxxxxxxxxx"
                    value={editing.no_wa || ''}
                    onChange={(v) => setEditing((e) => ({ ...e, no_wa: v }))}
                  />
                </label>
                <label className="block">
                  <span className="label">
                    Status Akun <span className="text-rose-500">*</span>
                  </span>
                  <CustomSelect
                    value={editing.status || 'aktif'}
                    onChange={(e) => setEditing((prev) => ({ ...prev, status: e.target.value }))}
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
                  <div className="text-xs font-black text-slate-700">Edit ini hanya mengubah akun login wali</div>
                  <div className="mt-0.5 text-xs leading-relaxed text-slate-500">
                    Penggantian siswa/wali aktif tetap lewat form tambah/kaitkan wali agar aturan satu siswa satu wali
                    aktif tetap terjaga.
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <ActionButton icon={X} onClick={() => setEditing(null)} variant="secondary">
                Batal
              </ActionButton>
              <ActionButton icon={Save} onClick={saveEdit}>
                Simpan Perubahan
              </ActionButton>
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
          title={statusConfirm.status === 'nonaktif' ? 'Nonaktifkan Wali' : 'Aktifkan Wali'}
          entityName={statusConfirm.wali.display_name}
          affectedBranch={statusConfirm.wali.cabang_nama || m.cabang.find((v) => v.id === m.cabangId)?.nama || 'Pusat'}
          consequence={
            statusConfirm.status === 'nonaktif'
              ? 'Menonaktifkan wali akan memblokir akses ke application wali untuk akun ini.'
              : null
          }
          actionLabel={statusConfirm.status === 'nonaktif' ? 'Ya, Nonaktifkan' : 'Ya, Aktifkan'}
          actionVariant={statusConfirm.status === 'nonaktif' ? 'danger' : 'primary'}
          icon={statusConfirm.status === 'nonaktif' ? PowerOff : Check}
          onClose={() => setStatusConfirm(null)}
          onSubmit={async () => {
            await setStatus(statusConfirm.wali, statusConfirm.status);
            setStatusConfirm(null);
          }}
        />
      )}
      {resetConfirm && (
        <ConfirmActionModal
          title="Reset Password Wali"
          entityName={resetConfirm.display_name}
          affectedBranch={resetConfirm.cabang_nama || m.cabang.find((v) => v.id === m.cabangId)?.nama || 'Pusat'}
          consequence="Tindakan ini akan mengatur ulang password akun wali ini ke password sementara acak. Password sebelumnya tidak akan bisa digunakan lagi."
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
    </Panel>
  );
}
