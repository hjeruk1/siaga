// Tab Tarif & Diskon Billing: daftar tarif per jenjang dan diskon per siswa.
import { CustomSelect, EmptyState, IconButton } from '../../../components/Shared';
import { money } from '../../../utils/format';
import { StudentAvatar } from '../AdminShared';
import { Pencil, Plus } from 'lucide-react';

export function TarifTab({
  user,
  m,
  blankTarifForm,
  tarif,
  diskon,
  siswa,
  groupedTarif,
  groupedDiskon,
  filterTahunAjaran,
  setFilterTahunAjaran,
  setShowTarifModal,
  setShowDiskonModal,
  setTarifForm,
  openEditTarif,
  openEditDiskon
}) {
  return (
    <>
      {/* Toolbar / Configuration Selector */}
      <div className="mb-4 flex flex-col justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:p-4">
        <div className="flex flex-col w-full sm:w-auto">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Tahun Ajaran</span>
          <CustomSelect
            value={filterTahunAjaran}
            onChange={(e) => setFilterTahunAjaran(e.target.value)}
            className="w-full sm:max-w-[150px] shadow-sm"
          >
            <option value="2025/2026">2025/2026</option>
            <option value="2026/2027">2026/2027</option>
            {filterTahunAjaran !== '2025/2026' && filterTahunAjaran !== '2026/2027' && (
              <option value={filterTahunAjaran}>{filterTahunAjaran}</option>
            )}
          </CustomSelect>
        </div>
        <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:items-center">
          {user.role === 'admin' && (
            <button
              type="button"
              onClick={() => {
                setTarifForm({ ...blankTarifForm(), cabang_id: m.cabangId || '' });
                setShowTarifModal(true);
              }}
              className="flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-black text-slate-700 shadow-sm transition active:scale-95"
            >
              <Plus className="w-4 h-4 text-slate-500" /> Tarif
            </button>
          )}
          {['admin', 'admin_cabang'].includes(user.role) && (
            <button
              type="button"
              onClick={() => setShowDiskonModal(true)}
              className="flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-black text-slate-700 shadow-sm transition active:scale-95"
            >
              <Plus className="w-4 h-4 text-slate-500" /> Diskon
            </button>
          )}
        </div>
      </div>

      <div className="mb-6">
        <h3 className="mb-3 text-[13px] font-black uppercase tracking-wide text-slate-400">Daftar Tarif Biaya</h3>
        {tarif.length === 0 ? (
          <EmptyState icon="📋" title="Belum Ada Tarif" description="Silakan buat tarif baru terlebih dahulu." />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Object.entries(groupedTarif).map(([groupName, items]) => (
              <div
                key={groupName}
                className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md sm:p-4"
              >
                <div>
                  <div className="flex items-center gap-2.5 mb-4 border-b border-slate-100 pb-3">
                    <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center font-black text-sm shrink-0">
                      {groupName === 'Global' ? 'G' : groupName.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-black text-slate-800 leading-tight">
                        {groupName === 'Global' ? 'Tarif Global / Umum' : groupName}
                      </h4>
                      <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider mt-0.5">
                        {items.length} Tipe Tarif
                      </p>
                    </div>
                  </div>
                  <div className="max-h-56 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                    {items.map((t) => {
                      const isActive = t.aktif !== 0;
                      return (
                        <div
                          key={t.id}
                          className={`rounded-lg border p-2.5 transition duration-150 ${!isActive ? 'border-dashed border-slate-300 bg-slate-50/50 opacity-75' : 'border-slate-100 bg-white hover:border-slate-200'}`}
                        >
                          <div className="flex justify-between items-start gap-2.5">
                            <div className="min-w-0">
                              <div className="font-bold text-xs text-slate-800 truncate" title={t.nama}>
                                {t.nama}
                              </div>
                              <div className="flex items-center gap-1.5 mt-1.5">
                                <span className="inline-block px-1.5 py-0.5 rounded text-[8px] font-black bg-slate-100 text-slate-500 uppercase tracking-wider">
                                  {t.jenis}
                                </span>
                                {!isActive && (
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[8px] font-black bg-red-50 text-red-600 uppercase tracking-wider">
                                    Nonaktif
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1.5 shrink-0">
                              <div className="text-xs font-black text-slate-800 tabular-nums">{money(t.nominal)}</div>
                              {user.role === 'admin' && (
                                <IconButton
                                  icon={Pencil}
                                  label={`Edit tarif ${t.nama}`}
                                  onClick={() => openEditTarif(t)}
                                  size="sm"
                                  className="hover:bg-slate-100 text-slate-500"
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-[13px] font-black uppercase tracking-wide text-slate-400">
          Diskon & Keringanan Siswa
        </h3>
        {diskon.length === 0 ? (
          <EmptyState
            icon="%"
            title="Belum Ada Diskon"
            description="Tambahkan keringanan siswa jika ada potongan khusus."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {groupedDiskon.map((group) => {
              const student = siswa.find((x) => x.id === group.siswa_id);
              const adaAktif = group.items.some((d) => d.aktif !== 0);

              return (
                <div
                  key={group.siswa_id}
                  className={`relative flex flex-col overflow-hidden rounded-2xl border bg-white p-4 shadow-sm transition-all duration-300 hover:border-emerald-200 hover:shadow-md ${!adaAktif ? 'border-dashed border-slate-300 bg-slate-50/50 opacity-75' : 'border-slate-200/80 bg-white'}`}
                >
                  {/* Visual Left Ticket Border Highlight */}
                  <div
                    className={`absolute top-0 left-0 w-1.5 h-full ${adaAktif ? 'bg-emerald-500' : 'bg-slate-400'}`}
                  />

                  <div className="pl-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <StudentAvatar name={group.siswa_nama} url={student?.foto} size="sm" />
                      <div className="min-w-0">
                        <h4 className="font-black text-sm text-slate-800 truncate">{group.siswa_nama}</h4>
                        <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[8px] font-black bg-slate-100 text-slate-500 uppercase tracking-wider">
                          {group.items.length} diskon{group.items.length > 1 ? ' · menumpuk' : ''}
                        </span>
                      </div>
                    </div>

                    {/* Voucher Ticket Dashed Divider */}
                    <div className="my-3 border-t border-dashed border-slate-200" />

                    <div className="space-y-2">
                      {group.items.map((d) => {
                        const isActive = d.aktif !== 0;
                        return (
                          <div
                            key={d.id}
                            className="rounded-xl border border-emerald-100/50 bg-emerald-50/70 p-3 transition-colors hover:bg-emerald-100/50"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-slate-100 text-slate-500 uppercase tracking-wider">
                                    Diskon {d.jenis}
                                  </span>
                                  {isActive ? (
                                    <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 text-[8px] font-black uppercase tracking-wider">
                                      Kupon Aktif
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-lg bg-red-100 text-red-700 text-[8px] font-black uppercase tracking-wider">
                                      Nonaktif
                                    </span>
                                  )}
                                </div>
                                <div className="mt-1.5 flex items-baseline gap-2">
                                  <span className="text-[9px] font-black text-emerald-600/80 uppercase tracking-wider">
                                    Nilai Potongan
                                  </span>
                                  <span className="text-base sm:text-lg font-black text-emerald-700 tabular-nums">
                                    {d.tipe === 'persen' ? `${d.nilai}%` : money(d.nilai)}
                                  </span>
                                </div>
                                {d.catatan && (
                                  <p className="mt-2 rounded-lg border border-emerald-100/60 bg-white/60 p-2 text-xs font-medium italic text-slate-500">
                                    &ldquo;{d.catatan}&rdquo;
                                  </p>
                                )}
                              </div>
                              {['admin', 'admin_cabang'].includes(user.role) && (
                                <IconButton
                                  icon={Pencil}
                                  label={`Edit diskon ${d.siswa_nama} ${d.jenis}`}
                                  onClick={() => openEditDiskon(d)}
                                  size="sm"
                                  className="shrink-0 text-slate-500 hover:bg-white/70"
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
