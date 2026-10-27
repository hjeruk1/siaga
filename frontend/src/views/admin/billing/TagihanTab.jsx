// Tab Tagihan Billing: filter periode, ringkasan angka, tabel tagihan, panel generate, dan aksi koreksi/void.
import { ActionButton, CustomMonthPicker, CustomSelect, EmptyState, IconButton } from '../../../components/Shared';
import { money } from '../../../utils/format';
import { BillingStatusBadge, StudentAvatar } from '../AdminShared';
import { StatCard } from './StatCard';
import { Ban, BarChart3, ChevronDown, Clock, FilePenLine, FilePlus, Receipt, TrendingUp } from 'lucide-react';

export function TagihanTab({
  user,
  m,
  billingStats,
  siswa,
  filteredTagihan,
  totals,
  selectedBills,
  canSelectBill,
  toggleBill,
  invoice,
  correctBill,
  voidBill,
  filterPeriode,
  setFilterPeriode,
  filterTahunAjaran,
  setFilterTahunAjaran,
  showGenerate,
  setShowGenerate,
  form,
  setForm,
  generateCabangId,
  setGenerateCabangId,
  previewBulanan,
  previewKegiatan
}) {
  return (
    <>
      {/* Control Panel / Toolbar */}
      <div className="mb-4 rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm sm:p-4">
        {/* Row 1: Filters */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid grid-cols-2 gap-3 sm:flex sm:items-end">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Tahun Ajaran</span>
              <CustomSelect
                value={filterTahunAjaran}
                onChange={(e) => setFilterTahunAjaran(e.target.value)}
                className="w-full sm:w-40 shadow-sm"
              >
                <option value="2025/2026">2025/2026</option>
                <option value="2026/2027">2026/2027</option>
                {filterTahunAjaran !== '2025/2026' && filterTahunAjaran !== '2026/2027' && (
                  <option value={filterTahunAjaran}>{filterTahunAjaran}</option>
                )}
              </CustomSelect>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                Filter Periode
              </span>
              <CustomSelect
                value={filterPeriode}
                onChange={(e) => setFilterPeriode(e.target.value)}
                className="w-full sm:w-48 shadow-sm"
              >
                <option value="">Semua Periode</option>
                {billingStats.uniquePeriods.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </CustomSelect>
            </div>
          </div>

          {/* Generate Tagihan Button & Collapsible Panel */}
          <button
            type="button"
            onClick={() => setShowGenerate(!showGenerate)}
            className="flex h-10 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-black text-slate-600 shadow-sm transition duration-150 hover:bg-slate-100 active:scale-[0.99] sm:w-auto sm:min-w-[18rem]"
          >
            <span className="flex items-center gap-2">
              <FilePlus className="w-4 h-4 text-slate-500" />
              Generate Tagihan
            </span>
            <ChevronDown
              className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${showGenerate ? 'rotate-180' : ''}`}
            />
          </button>
        </div>

        {showGenerate && (
          <div className="mt-3 grid w-full animate-slide-up gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 lg:ml-auto lg:w-fit lg:grid-cols-[13rem_12rem_auto] lg:items-end">
            {user.role === 'admin' && (
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                  Pilih Cabang
                </span>
                <CustomSelect
                  value={generateCabangId}
                  onChange={(e) => setGenerateCabangId(e.target.value)}
                  className="w-full shadow-sm bg-white"
                >
                  <option value="">Pilih Cabang...</option>
                  {m.cabang.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nama}
                    </option>
                  ))}
                </CustomSelect>
              </div>
            )}
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                Pilih Bulan Tagihan
              </span>
              <CustomMonthPicker
                value={form.periode || ''}
                onChange={(v) => setForm((f) => ({ ...f, periode: v }))}
                className="input w-full shadow-sm"
              />
            </div>
            <div className={`flex flex-col ${user.role === 'admin' ? 'sm:col-span-2 lg:col-span-1' : ''}`}>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                Aksi Pembuatan
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={previewBulanan}
                  className="flex-1 sm:flex-initial h-9 px-4 rounded-xl text-xs font-black bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 shadow-sm flex items-center justify-center gap-1.5 active:scale-95 transition"
                >
                  <FilePlus className="w-3.5 h-3.5 text-slate-500" />
                  Bulanan
                </button>
                <button
                  type="button"
                  onClick={previewKegiatan}
                  className="flex-1 sm:flex-initial h-9 px-4 rounded-xl text-xs font-black bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 shadow-sm flex items-center justify-center gap-1.5 active:scale-95 transition"
                >
                  <FilePlus className="w-3.5 h-3.5 text-slate-500" />
                  Kegiatan
                </button>
              </div>
            </div>
          </div>
        )}

        {selectedBills.length > 0 && (
          <div className="mt-3 flex animate-bounce-in items-center gap-2 border-t border-slate-100 pt-3">
            <ActionButton
              icon={Receipt}
              onClick={invoice}
              variant="primary"
              className="bg-primary hover:bg-primary-hover shadow-md font-black text-xs px-4 py-2 rounded-xl"
            >
              Buat Invoice ({selectedBills.length} Terpilih)
            </ActionButton>
          </div>
        )}
      </div>

      {/* Dynamic Mini-Dashboard for Filtered Tagihan */}
      {filteredTagihan.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          <StatCard
            size="sm"
            icon={Receipt}
            label="Total Tagihan"
            value={money(totals.totalFinal)}
            hint="Berdasarkan filter aktif"
          />
          <StatCard
            size="sm"
            icon={TrendingUp}
            tone="emerald"
            label="Terbayar"
            value={money(totals.totalPaid)}
            hint="Koleksi terverifikasi"
          />
          <StatCard
            size="sm"
            icon={Clock}
            tone="amber"
            label="Outstanding"
            value={money(totals.totalOutstanding)}
            hint="Belum terbayar"
          />
          <StatCard
            size="sm"
            icon={BarChart3}
            tone="primary"
            label="Rasio Koleksi"
            value={`${totals.collectionRate}%`}
            progress={totals.collectionRate}
          />
        </div>
      )}

      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-black text-[13px] uppercase tracking-wide text-slate-400">Tagihan Siswa</h3>
      </div>

      {filteredTagihan.length === 0 ? (
        <EmptyState
          icon="💸"
          title="Belum Ada Tagihan"
          description="Silakan generate tagihan bulanan atau kegiatan terlebih dahulu."
        />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm md:block">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full min-w-[1040px] table-fixed text-sm">
                <colgroup>
                  <col className="w-12" />
                  <col className="w-[260px]" />
                  <col className="w-[190px]" />
                  <col className="w-28" />
                  <col className="w-36" />
                  <col className="w-36" />
                  <col className="w-36" />
                  <col className="w-24" />
                </colgroup>
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="bg-slate-50 px-3 py-2.5 text-left text-[11px] font-black uppercase tracking-wide text-slate-400"></th>
                    <th className="bg-slate-50 px-3 py-2.5 text-left text-[11px] font-black uppercase tracking-wide text-slate-500">
                      Siswa
                    </th>
                    <th className="bg-slate-50 px-3 py-2.5 text-left text-[11px] font-black uppercase tracking-wide text-slate-500">
                      Jenis
                    </th>
                    <th className="bg-slate-50 px-3 py-2.5 text-left text-[11px] font-black uppercase tracking-wide text-slate-500">
                      Periode
                    </th>
                    <th className="bg-slate-50 px-3 py-2.5 text-right text-[11px] font-black uppercase tracking-wide text-slate-500">
                      Final
                    </th>
                    <th className="bg-slate-50 px-3 py-2.5 text-right text-[11px] font-black uppercase tracking-wide text-slate-500">
                      Terbayar
                    </th>
                    <th className="bg-slate-50 px-3 py-2.5 text-center text-[11px] font-black uppercase tracking-wide text-slate-500">
                      Status
                    </th>
                    <th className="sticky right-0 z-10 border-l border-slate-200/80 bg-slate-50 px-3 py-2.5 text-right text-[11px] font-black uppercase tracking-wide text-slate-500">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTagihan.map((t) => {
                    const student = siswa.find((x) => x.id === t.siswa_id);
                    return (
                      <tr
                        key={t.id}
                        className={
                          selectedBills.includes(t.id) ? 'bg-primary-container/55' : 'bg-white hover:bg-slate-50/70'
                        }
                      >
                        <td className="px-3 py-2.5 align-middle">
                          <input
                            type="checkbox"
                            checked={selectedBills.includes(t.id)}
                            onChange={() => toggleBill(t.id)}
                            disabled={!canSelectBill(t)}
                            className="rounded border-slate-300 text-primary focus:ring-primary disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                          />
                        </td>
                        <td className="px-3 py-2.5 align-middle">
                          <div className="flex min-w-0 items-center gap-3">
                            <StudentAvatar name={t.siswa_nama} url={student?.foto} size="sm" />
                            <div className="min-w-0">
                              <div className="truncate font-black text-text-main" title={t.siswa_nama}>
                                {t.siswa_nama}
                              </div>
                              <div
                                className="mt-0.5 truncate text-[11px] font-semibold text-slate-400"
                                title={t.cabang_nama || ''}
                              >
                                {t.cabang_nama || 'Cabang'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 align-middle">
                          <div className="truncate font-bold text-slate-700" title={t.nama}>
                            {t.nama}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 align-middle font-bold text-slate-500">{t.periode || '-'}</td>
                        <td className="px-3 py-2.5 text-right align-middle font-black tabular-nums text-slate-900">
                          {money(t.nominal_final)}
                        </td>
                        <td className="px-3 py-2.5 text-right align-middle font-black tabular-nums text-emerald-600">
                          {money(t.paid_amount)}
                        </td>
                        <td className="px-3 py-2.5 text-center align-middle">
                          <BillingStatusBadge status={t.status} />
                        </td>
                        <td className="sticky right-0 z-10 border-l border-slate-200/80 bg-inherit px-3 py-2.5 align-middle">
                          <div className="flex justify-end gap-1.5">
                            <IconButton
                              icon={FilePenLine}
                              label={`Koreksi tagihan ${t.siswa_nama}`}
                              onClick={() => correctBill(t)}
                              size="sm"
                              className="hover:bg-slate-100 text-slate-600"
                            />
                            <IconButton
                              icon={Ban}
                              label={`Void tagihan ${t.siswa_nama}`}
                              onClick={() => voidBill(t)}
                              size="sm"
                              variant="danger"
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50">
                    <td className="px-3 py-2.5"></td>
                    <td colSpan={3} className="px-3 py-2.5 text-xs font-black uppercase tracking-wide text-slate-500">
                      Total ringkasan
                    </td>
                    <td className="px-3 py-2.5 text-right font-black tabular-nums text-slate-900">
                      {money(totals.totalFinal)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-black tabular-nums text-emerald-600">
                      {money(totals.totalPaid)}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="inline-flex items-center rounded-full bg-primary-container px-2.5 py-0.5 text-xs font-black text-primary">
                        {totals.collectionRate}% Terkoleksi
                      </span>
                    </td>
                    <td className="sticky right-0 z-10 border-l border-slate-200/80 bg-slate-50 px-3 py-2.5"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          <div className="block md:hidden space-y-3">
            {filteredTagihan.map((t) => {
              const student = siswa.find((x) => x.id === t.siswa_id);
              const colorMap = {
                lunas: 'bg-emerald-500',
                paid: 'bg-emerald-500',
                confirmed: 'bg-emerald-500',
                sebagian: 'bg-blue-500',
                partially_paid: 'bg-blue-500',
                pending_verification: 'bg-violet-500',
                issued: 'bg-sky-500',
                open: 'bg-amber-500',
                unpaid: 'bg-amber-500'
              };
              const accentColor = colorMap[(t.status || '').toLowerCase()] || 'bg-slate-400';

              return (
                <div
                  key={t.id}
                  className="relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition duration-200 hover:border-slate-300"
                >
                  {/* Decorative side accent color bar indicating status */}
                  <div className={`absolute top-0 left-0 w-1.5 h-full ${accentColor}`} />
                  <div className="flex flex-col gap-2.5 p-3.5 pl-4">
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="flex items-center h-5 mt-0.5">
                          <input
                            type="checkbox"
                            checked={selectedBills.includes(t.id)}
                            onChange={() => toggleBill(t.id)}
                            disabled={!canSelectBill(t)}
                            className="rounded border-slate-300 text-primary focus:ring-primary cursor-pointer disabled:opacity-40"
                          />
                        </div>
                        <div className="flex gap-2.5 items-center min-w-0">
                          <StudentAvatar name={t.siswa_nama} url={student?.foto} size="sm" />
                          <div className="min-w-0">
                            <div className="font-black text-sm text-slate-800 truncate">{t.siswa_nama}</div>
                            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mt-0.5">
                              {t.nama}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0">
                        <BillingStatusBadge status={t.status} />
                      </div>
                    </div>

                    {/* Receipt-style dashed separator line */}
                    <div className="border-t border-dashed border-slate-200 my-1" />

                    <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50/70 p-3 rounded-xl border border-slate-100">
                      <div>
                        <span className="text-slate-400 font-semibold uppercase tracking-wider text-[9px] block mb-0.5">
                          Periode
                        </span>
                        <span className="font-bold text-slate-700">{t.periode || '-'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-semibold uppercase tracking-wider text-[9px] block mb-0.5">
                          Telah Terbayar
                        </span>
                        <span className="font-bold text-emerald-600 tabular-nums">{money(t.paid_amount)}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-slate-400 font-semibold uppercase tracking-wider text-[9px] block mb-0.5">
                          Nominal Tagihan
                        </span>
                        <span className="font-black text-slate-800 text-sm tabular-nums">{money(t.nominal_final)}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Aksi</span>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => correctBill(t)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] font-black text-slate-600 bg-white hover:bg-slate-50 transition active:scale-95"
                        >
                          <FilePenLine className="w-3.5 h-3.5" /> Koreksi
                        </button>
                        <button
                          type="button"
                          onClick={() => voidBill(t)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-[11px] font-black text-red-600 bg-red-50 hover:bg-red-100 transition active:scale-95"
                        >
                          <Ban className="w-3.5 h-3.5" /> Void
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Mobile Summary Slip */}
            <div className="relative space-y-2.5 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3.5 shadow-sm">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-amber-500" />
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                Ringkasan Total Filtered
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 font-medium block mb-0.5">Total Tagihan:</span>
                  <span className="font-extrabold text-sm text-slate-800 tabular-nums">{money(totals.totalFinal)}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-medium block mb-0.5">Total Terbayar:</span>
                  <span className="font-extrabold text-sm text-emerald-600 tabular-nums">
                    {money(totals.totalPaid)}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200/80 pt-2.5 mt-1">
                <div className="flex flex-col">
                  <span className="text-[9px] text-slate-400 font-black uppercase tracking-wide">Outstanding</span>
                  <span className="text-xs text-amber-600 font-black tabular-nums">
                    {money(totals.totalOutstanding)}
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-primary-container text-primary">
                  {totals.collectionRate}% Terkoleksi
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
