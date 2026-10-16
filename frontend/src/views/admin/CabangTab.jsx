import { useEffect, useState } from 'react';
import { api } from '../../api';
import { ActionButton, ConfirmActionModal, IconButton, Modal, CustomSelect } from '../../components/Shared';
import { Pencil, Plus, Power, PowerOff, Save, X } from 'lucide-react';
import { BranchMetricRow, Panel, Input } from './shared';

export default function CabangTab({ user, toast }) {
  const empty = { nama: '', kode: '', alamat: '', kontak: '', aktif: 1 };
  const [list, setList] = useState([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [openForm, setOpenForm] = useState(false);
  const [cabangConfirm, setCabangConfirm] = useState(null);
  async function load() {
    setList(await api.cabang());
  }
  useEffect(() => {
    load().catch((e) => toast('err', e.message));
  }, []);
  async function add() {
    try {
      await api.createCabang(form);
      toast('ok', 'Cabang dibuat');
      setForm(empty);
      setOpenForm(false);
      load();
    } catch (e) {
      toast('err', e.message);
    }
  }
  async function saveEdit() {
    try {
      await api.updateCabang(editing.id, editing);
      toast('ok', 'Cabang diperbarui');
      setEditing(null);
      load();
    } catch (e) {
      toast('err', e.message);
    }
  }
  async function toggle(c) {
    setCabangConfirm({
      cabang: c,
      onSubmit: async () => {
        try {
          await api.updateCabang(c.id, { ...c, aktif: c.aktif ? 0 : 1 });
          toast('ok', c.aktif ? 'Cabang dinonaktifkan' : 'Cabang diaktifkan');
          load();
        } catch (e) {
          toast('err', e.message);
        }
        setCabangConfirm(null);
      }
    });
  }
  const right =
    user.role === 'admin' ? (
      <ActionButton
        icon={Plus}
        onClick={() => {
          setForm(empty);
          setOpenForm(true);
        }}
      >
        Tambah Cabang
      </ActionButton>
    ) : null;
  return (
    <Panel title="Cabang Taruna Prima" right={right}>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start">
        {list.map((c) => (
          <div key={c.id} className="bg-white border border-slate-200 rounded-2xl p-3 space-y-2.5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="font-black text-text-main truncate">{c.nama}</div>
                  <span className="px-2 py-1 rounded bg-slate-100 text-[11px] font-black text-slate-500">{c.kode}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500 truncate" title={c.alamat || ''}>
                  {c.alamat || 'Alamat belum diisi'}
                </div>
              </div>
              <span
                className={`px-2 py-1 rounded-full text-[11px] font-black ${c.aktif ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}
              >
                {c.aktif ? 'Aktif' : 'Nonaktif'}
              </span>
            </div>
            <div className="grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1 text-xs">
              <div className="font-black text-slate-400 uppercase">Kepsek</div>
              <div className="font-bold text-slate-700 truncate">{c.kepsek_nama || 'Belum diatur'}</div>
              <div className="font-black text-slate-400 uppercase">Kontak</div>
              <div className="font-bold text-slate-700 truncate">{c.kontak || '-'}</div>
            </div>
            <div className="pt-2 border-t border-slate-100 space-y-1.5">
              <BranchMetricRow
                title="Siswa"
                total={c.siswa_aktif_count || 0}
                items={[
                  ['KB', c.kb_count || 0],
                  ['TK', c.tk_count || 0],
                  ['Care', c.care_count || 0]
                ]}
              />
              <BranchMetricRow
                title="Staff"
                total={c.staff_aktif_count || 0}
                items={[
                  ['Admin', c.admin_count || 0],
                  ['Kepsek', c.kepsek_count || 0],
                  ['Guru', c.guru_count || 0],
                  ['Gerbang', c.gerbang_count || 0]
                ]}
              />
            </div>
            {user.role === 'admin' && (
              <div className="flex justify-end gap-2 pt-1 border-t border-slate-100">
                <IconButton icon={Pencil} label={`Edit ${c.nama}`} onClick={() => setEditing(c)} size="sm" />
                <IconButton
                  icon={c.aktif ? PowerOff : Power}
                  label={c.aktif ? 'Nonaktifkan' : 'Aktifkan'}
                  onClick={() => toggle(c)}
                  size="sm"
                  variant={c.aktif ? 'danger' : 'ghost'}
                />
              </div>
            )}
          </div>
        ))}
      </div>
      {list.length === 0 && (
        <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-bold text-slate-400">
          Belum ada cabang terdaftar.
        </div>
      )}
      {openForm && (
        <CabangModal
          title="Tambah Cabang"
          form={form}
          setForm={setForm}
          onClose={() => setOpenForm(false)}
          onSubmit={add}
          submitLabel="Tambah Cabang"
        />
      )}
      {editing && (
        <CabangModal
          title="Edit Cabang"
          form={editing}
          setForm={setEditing}
          onClose={() => setEditing(null)}
          onSubmit={saveEdit}
          submitLabel="Simpan Perubahan"
          showStatus
        />
      )}
      {cabangConfirm && (
        <ConfirmActionModal
          title={cabangConfirm.cabang.aktif ? 'Nonaktifkan Cabang' : 'Aktifkan Cabang'}
          entityName={cabangConfirm.cabang.nama}
          affectedBranch={cabangConfirm.cabang.nama}
          consequence={
            cabangConfirm.cabang.aktif
              ? 'Menonaktifkan cabang akan memblokir semua transaksi operasional baru untuk cabang ini.'
              : null
          }
          actionLabel={cabangConfirm.cabang.aktif ? 'Ya, Nonaktifkan' : 'Ya, Aktifkan'}
          actionVariant={cabangConfirm.cabang.aktif ? 'danger' : 'primary'}
          icon={Power}
          onClose={() => setCabangConfirm(null)}
          onSubmit={cabangConfirm.onSubmit}
        />
      )}
    </Panel>
  );
}

export function CabangModal({ title, form, setForm, onClose, onSubmit, submitLabel, showStatus = false }) {
  const canSubmit = String(form.nama || '').trim() && String(form.kode || '').trim();
  return (
    <Modal title={title} onClose={onClose} maxWidth="max-w-xl">
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-black uppercase tracking-wider text-slate-400">Identitas Cabang</div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_8rem] gap-3">
            <label className="block">
              <span className="label">
                Nama Cabang <span className="text-rose-500">*</span>
              </span>
              <Input
                placeholder="Contoh: Godean"
                value={form.nama || ''}
                onChange={(v) => setForm((f) => ({ ...f, nama: v }))}
              />
            </label>
            <label className="block">
              <span className="label">
                Kode <span className="text-rose-500">*</span>
              </span>
              <Input
                placeholder="GDN"
                value={form.kode || ''}
                onChange={(v) => setForm((f) => ({ ...f, kode: v.toUpperCase().replace(/\s+/g, '') }))}
              />
            </label>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Kode dipakai sebagai penanda cepat di dashboard dan laporan.
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-xs font-black uppercase tracking-wider text-slate-400">Operasional</div>
          <div className="mt-3 space-y-3">
            <label className="block">
              <span className="label">Alamat</span>
              <textarea
                value={form.alamat || ''}
                onChange={(e) => setForm((f) => ({ ...f, alamat: e.target.value }))}
                placeholder="Alamat lengkap cabang"
                rows={3}
                className="input w-full min-h-20 resize-none"
              />
            </label>
            <label className="block">
              <span className="label">Kontak</span>
              <Input
                placeholder="Nomor telepon atau WhatsApp cabang"
                value={form.kontak || ''}
                onChange={(v) => setForm((f) => ({ ...f, kontak: v }))}
              />
            </label>
            {showStatus && (
              <label className="block">
                <span className="label">Status Cabang</span>
                <CustomSelect
                  value={form.aktif ? 1 : 0}
                  onChange={(e) => setForm((f) => ({ ...f, aktif: Number(e.target.value) }))}
                  className="input w-full"
                >
                  <option value={1}>Aktif</option>
                  <option value={0}>Nonaktif</option>
                </CustomSelect>
              </label>
            )}
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-slate-100 pt-4">
          <ActionButton icon={X} onClick={onClose} variant="ghost" className="w-full sm:w-auto">
            Batal
          </ActionButton>
          <ActionButton icon={Save} onClick={onSubmit} disabled={!canSubmit} className="w-full sm:w-auto">
            {submitLabel}
          </ActionButton>
        </div>
      </div>
    </Modal>
  );
}
