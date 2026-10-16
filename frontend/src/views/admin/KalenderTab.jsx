import { useEffect, useState } from 'react';
import { api } from '../../api';
import { ActionButton, ConfirmActionModal, IconButton, Modal, CustomSelect } from '../../components/Shared';
import { AlertCircle, CalendarPlus, ChevronDown, Trash2, X } from 'lucide-react';
import { useMaster, Panel, Input } from './shared';

export default function KalenderTab({ user, toast }) {
  const m = useMaster(user);
  const [tahun, setTahun] = useState(new Date().getFullYear().toString());
  const [events, setEvents] = useState([]);
  const [collapsedMonths, setCollapsedMonths] = useState(new Set());
  const [form, setForm] = useState({ tanggal: '', tipe: 'libur', nama: '', scope: 'yayasan', cabang_id: '' });
  const [openForm, setOpenForm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  useEffect(() => {
    if (m.cabangId || user.role === 'admin')
      api
        .kalender({ cabang_id: m.cabangId, tahun })
        .then(setEvents)
        .catch((e) => toast('err', e.message));
  }, [m.cabangId, tahun]);
  async function add() {
    if (!form.tanggal || !form.nama.trim()) {
      toast('err', 'Tanggal dan nama event wajib diisi');
      return;
    }
    const scope = user.role === 'admin' ? form.scope : 'cabang';
    const targetCabangId = scope === 'cabang' ? (user.role === 'admin' ? form.cabang_id : user.cabang_id) : null;
    if (scope === 'cabang' && !targetCabangId) {
      toast('err', 'Pilih cabang terlebih dahulu untuk event cabang');
      return;
    }
    try {
      await api.createKalender({ ...form, nama: form.nama.trim(), cabang_id: targetCabangId, scope });
      toast('ok', 'Event ditambahkan');
      setForm({ tanggal: '', tipe: 'libur', nama: '', scope: 'yayasan', cabang_id: '' });
      setOpenForm(false);
      const r = await api.kalender({ cabang_id: m.cabangId, tahun });
      setEvents(r);
    } catch (e) {
      toast('err', e.message);
    }
  }
  async function remove(id) {
    try {
      await api.deleteKalender(id);
      toast('ok', 'Event dihapus');
      setEvents(events.filter((e) => e.id !== id));
    } catch (e) {
      toast('err', e.message);
    }
  }
  const toggleMonth = (key) => {
    setCollapsedMonths((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(key)) newSet.delete(key);
      else newSet.add(key);
      return newSet;
    });
  };
  const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  const totalLibur = events.filter((e) => e.tipe === 'libur').length;
  const totalMasuk = events.filter((e) => e.tipe !== 'libur').length;
  const openAddForm = () => {
    setForm({ tanggal: '', tipe: 'libur', nama: '', scope: 'yayasan', cabang_id: m.cabangId || '' });
    setOpenForm(true);
  };
  const right = (
    <div className="calendar-toolbar">
      <Input
        type="number"
        value={tahun}
        onChange={(v) => setTahun(v)}
        placeholder="Tahun"
        className="calendar-year-input"
      />
      {user.role === 'admin' ? (
        <CustomSelect
          value={m.cabangId}
          onChange={(e) => m.setCabangId(e.target.value)}
          className="input calendar-branch-select"
        >
          <option value="">Pilih cabang</option>
          {m.cabang.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nama}
            </option>
          ))}
        </CustomSelect>
      ) : (
        <div className="calendar-branch-spacer" />
      )}
      <IconButton
        icon={CalendarPlus}
        label="Tambah event"
        onClick={openAddForm}
        variant="primary"
        className="calendar-add-icon"
      />
      <ActionButton icon={CalendarPlus} onClick={openAddForm} className="calendar-add-button">
        Tambah Event
      </ActionButton>
    </div>
  );
  return (
    <Panel title="Kalender Akademik" right={right}>
      <div className="calendar-compact-stats mb-3">
        <div className="calendar-compact-stat">
          <span>Event</span>
          <b>{events.length}</b>
        </div>
        <div className="calendar-compact-stat">
          <span>Libur</span>
          <b>{totalLibur}</b>
        </div>
        <div className="calendar-compact-stat">
          <span>Masuk</span>
          <b>{totalMasuk}</b>
        </div>
      </div>
      <div className="calendar-scroll custom-scrollbar">
        <div className="calendar-board grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
          {months.map((m) => {
            const prefix = `${tahun}-${m}`;
            const monthEvents = events.filter((e) => e.tanggal.startsWith(prefix));
            const monthName = new Date(Number(tahun), Number(m) - 1, 1).toLocaleString('id-ID', { month: 'long' });
            const monthKey = `${tahun}-${m}`;
            const isOpen = !collapsedMonths.has(monthKey);
            const liburCount = monthEvents.filter((e) => e.tipe === 'libur').length;
            const masukCount = monthEvents.length - liburCount;
            return (
              <div key={m} className={`calendar-month ${monthEvents.length ? 'has-events' : ''}`}>
                <button type="button" className="calendar-month-head" onClick={() => toggleMonth(monthKey)}>
                  <div className="calendar-month-code">{m}</div>
                  <div className="min-w-0">
                    <div className="calendar-month-name">{monthName}</div>
                    <div className="calendar-month-meta">
                      {tahun} · {liburCount} libur · {masukCount} masuk
                    </div>
                  </div>
                  <div className="calendar-month-tools">
                    <span className="calendar-count">{monthEvents.length}</span>
                    <ChevronDown className={`chevron-rotate ${isOpen ? 'open' : ''}`} size={16} />
                  </div>
                </button>
                {isOpen &&
                  (monthEvents.length === 0 ? (
                    <div className="calendar-empty">Tidak ada event</div>
                  ) : (
                    <div className="calendar-event-list custom-scrollbar">
                      {monthEvents.map((e) => (
                        <div
                          key={e.id}
                          className={`calendar-event ${e.tipe === 'libur' ? 'is-holiday' : 'is-schoolday'}`}
                        >
                          <div className="calendar-event-date">
                            <span>{e.tanggal.slice(8)}</span>
                          </div>
                          <div className="calendar-event-main">
                            <div className="min-w-0">
                              <div className="calendar-event-title">{e.nama}</div>
                              <div className="calendar-event-tags">
                                <span>{e.tipe === 'libur' ? 'Libur' : 'Masuk Khusus'}</span>
                                <span>{e.cabang_nama || 'Taruna Prima'}</span>
                              </div>
                            </div>
                            <div className="calendar-event-action">
                              <IconButton
                                icon={Trash2}
                                label={`Hapus ${e.nama}`}
                                onClick={() => setDeleteConfirm(e)}
                                size="sm"
                                variant="danger"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
      </div>
      {openForm && (
        <Modal title="Tambah Event Kalender" onClose={() => setOpenForm(false)} maxWidth="max-w-xl">
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
              <div className="text-[11px] font-black text-primary uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                <CalendarPlus className="w-3.5 h-3.5" />
                Data Event
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="label">
                    Tanggal <span className="text-rose-500">*</span>
                  </span>
                  <Input type="date" value={form.tanggal} onChange={(v) => setForm((f) => ({ ...f, tanggal: v }))} />
                </label>
                <label className="block">
                  <span className="label">
                    Tipe Event <span className="text-rose-500">*</span>
                  </span>
                  <CustomSelect
                    value={form.tipe}
                    onChange={(e) => setForm((f) => ({ ...f, tipe: e.target.value }))}
                    className="input w-full"
                  >
                    <option value="libur">Libur</option>
                    <option value="masuk">Masuk Khusus</option>
                  </CustomSelect>
                </label>
                <label className="block sm:col-span-2">
                  <span className="label">
                    Nama Event <span className="text-rose-500">*</span>
                  </span>
                  <Input
                    placeholder="Contoh: Libur Idul Fitri"
                    value={form.nama}
                    onChange={(v) => setForm((f) => ({ ...f, nama: v }))}
                  />
                </label>
                {user.role === 'admin' && (
                  <label className="block sm:col-span-2">
                    <span className="label">Scope</span>
                    <CustomSelect
                      value={form.scope}
                      onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}
                      className="input w-full"
                    >
                      <option value="yayasan">Semua cabang</option>
                      <option value="cabang">Cabang</option>
                    </CustomSelect>
                  </label>
                )}
                {user.role === 'admin' && form.scope === 'cabang' && (
                  <label className="block sm:col-span-2">
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
                )}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div>
                  <div className="text-xs font-black text-slate-700">Event memengaruhi absensi dan daily record</div>
                  <div className="mt-0.5 text-xs leading-relaxed text-slate-500">
                    Gunakan semua cabang untuk event Taruna Prima, atau scope cabang untuk event khusus cabang yang
                    sedang dipilih.
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
              <ActionButton icon={X} onClick={() => setOpenForm(false)} variant="secondary">
                Batal
              </ActionButton>
              <ActionButton icon={CalendarPlus} onClick={add}>
                Tambah Event
              </ActionButton>
            </div>
          </div>
        </Modal>
      )}
      {deleteConfirm && (
        <ConfirmActionModal
          title="Hapus Event Kalender"
          entityName={`${deleteConfirm.tanggal} - ${deleteConfirm.nama}`}
          affectedBranch={deleteConfirm.cabang_nama || 'Semua Cabang'}
          consequence="Tindakan ini akan menghapus event dari kalender akademik dan tidak dapat dibatalkan."
          actionLabel="Ya, Hapus Event"
          actionVariant="danger"
          icon={Trash2}
          onClose={() => setDeleteConfirm(null)}
          onSubmit={async () => {
            await remove(deleteConfirm.id);
            setDeleteConfirm(null);
          }}
        />
      )}
    </Panel>
  );
}

export function CalendarStat({ label, value, tone = 'slate' }) {
  const tones = {
    slate: 'text-slate-900 bg-white border-slate-200',
    red: 'text-red-700 bg-red-50 border-red-100',
    emerald: 'text-emerald-700 bg-emerald-50 border-emerald-100'
  };
  return (
    <div className={`rounded-xl border px-3 py-2 ${tones[tone] || tones.slate}`}>
      <div className="text-[10px] font-black uppercase opacity-60">{label}</div>
      <div className="text-xl font-black leading-tight">{value}</div>
    </div>
  );
}
