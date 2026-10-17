import { Modal, ActionButton, CustomSelect, SearchableSelect } from '../../../components/Shared';

// Input ringkas milik modul ini: onChange menerima nilai, bukan event,
// mengikuti pola komponen Shared lainnya.
function Input({ value, onChange, className = '', ...props }) {
  return (
    <input
      {...props}
      value={value ?? ''}
      onChange={(e) => onChange?.(e.target.value)}
      className={`w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-text-main outline-none focus:border-primary ${className}`}
    />
  );
}
import { Receipt, X, CheckCircle2, Loader2 } from 'lucide-react';
import { money } from '../AdminShared';

/**
 * Dialog "Catat Pembayaran Siswa".
 * Semua state & handler tetap di BillingTab — komponen ini murni presentasi
 * yang menerima props + callback, supaya BillingTab tidak bengkak.
 */
export function PaymentModal({
  user,
  m,
  localCabangIdPayment,
  setLocalCabangIdPayment,
  payForm,
  setPayForm,
  filteredSiswaForPayment,
  alokasiPreview,
  submitting,
  onClose,
  onPay
}) {
  return (
    <Modal title="Catat Pembayaran Siswa" onClose={onClose} maxWidth="max-w-4xl">
      <div className="grid gap-4 md:grid-cols-12 md:gap-5">
        <div className="space-y-3 md:col-span-5">
          {user.role === 'admin' && !m.cabangId && (
            <div>
              <label className="label font-bold text-slate-700 dark:text-slate-300">Filter Cabang Siswa</label>
              <CustomSelect
                value={localCabangIdPayment}
                onChange={(e) => {
                  setLocalCabangIdPayment(e.target.value);
                  setPayForm((f) => ({ ...f, siswa_id: '' }));
                }}
                className="input w-full"
              >
                <option value="">Semua Cabang</option>
                {m.cabang.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nama}
                  </option>
                ))}
              </CustomSelect>
            </div>
          )}
          <div>
            <label className="label font-bold text-slate-700 dark:text-slate-300">
              Siswa <span className="text-red-500">*</span>
            </label>
            <SearchableSelect
              value={payForm.siswa_id}
              onChange={(e) => setPayForm((f) => ({ ...f, siswa_id: e.target.value }))}
              className="input w-full"
              placeholder="Pilih Siswa"
              searchPlaceholder="Cari nama siswa…"
            >
              <option value="">Pilih Siswa</option>
              {filteredSiswaForPayment.map((s) => (
                <option
                  key={s.id}
                  value={s.id}
                >{`${s.nama}${s.rombel_nama ? ' - ' + s.rombel_nama : ''}${!m.cabangId && s.cabang_nama ? ' (' + s.cabang_nama + ')' : ''}`}</option>
              ))}
            </SearchableSelect>
          </div>
          <div>
            <label className="label font-bold text-slate-700 dark:text-slate-300">
              Nominal Pembayaran <span className="text-red-500">*</span>
            </label>
            <div className="relative flex items-stretch w-full">
              <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-slate-200 bg-slate-50 text-slate-500 text-sm font-bold dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 shrink-0">
                Rp
              </span>
              <input
                type="number"
                placeholder="Nominal pembayaran"
                value={payForm.nominal}
                onChange={(e) => setPayForm((f) => ({ ...f, nominal: e.target.value }))}
                className="input rounded-l-none w-full"
              />
            </div>
          </div>
          <div>
            <label className="label font-bold text-slate-700 dark:text-slate-300">
              Metode Pembayaran <span className="text-red-500">*</span>
            </label>
            <CustomSelect
              value={payForm.metode}
              onChange={(e) => setPayForm((f) => ({ ...f, metode: e.target.value }))}
              className="input w-full"
            >
              {['tunai', 'transfer', 'qris', 'lainnya'].map((x) => (
                <option key={x} value={x}>
                  {x.toUpperCase()}
                </option>
              ))}
            </CustomSelect>
          </div>
          <div>
            <label className="label font-bold text-slate-700 dark:text-slate-300">
              Tanggal Bayar <span className="text-red-500">*</span>
            </label>
            <Input
              type="date"
              value={payForm.tanggal}
              onChange={(v) => setPayForm((f) => ({ ...f, tanggal: v }))}
            />
          </div>
          <div>
            <label className="label font-bold text-slate-700 dark:text-slate-300">Referensi / Bukti</label>
            <Input
              placeholder="Nomor referensi / note"
              value={payForm.reference}
              onChange={(v) => setPayForm((f) => ({ ...f, reference: v }))}
            />
          </div>
          <div>
            <label className="label font-bold text-slate-700 dark:text-slate-300">Catatan Tambahan</label>
            <Input
              placeholder="Catatan internal"
              value={payForm.catatan}
              onChange={(v) => setPayForm((f) => ({ ...f, catatan: v }))}
            />
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-slate-100 bg-slate-50/50 p-3.5 md:col-span-7 dark:border-slate-800">
          <div>
            <h4 className="mb-2.5 flex items-center gap-1.5 text-sm font-black text-text-main dark:text-slate-200">
              <Receipt size={16} />
              Pratinjau Alokasi Pembayaran (FIFO)
            </h4>

            {!payForm.siswa_id || !payForm.nominal || Number(payForm.nominal) <= 0 ? (
              <div className="flex flex-col items-center justify-center px-2 py-9 text-center text-sm text-slate-400">
                <p>Masukkan siswa dan nominal pembayaran</p>
                <p className="mt-1 text-xs">untuk melihat simulasi alokasi FIFO tagihan</p>
              </div>
            ) : alokasiPreview ? (
              <div className="space-y-3.5">
                {alokasiPreview.allocations && alokasiPreview.allocations.length > 0 ? (
                  <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-xl">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-black">
                          <th className="text-left py-2 px-3">Tagihan</th>
                          <th className="text-left py-2 px-3">Periode</th>
                          <th className="text-right py-2 px-3">Total</th>
                          <th className="text-right py-2 px-3">Sisa</th>
                          <th className="px-3 py-2 text-right text-emerald-600 whitespace-nowrap dark:text-emerald-400">
                            Dialokasi
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {alokasiPreview.allocations.map((a, i) => (
                          <tr key={i} className="text-slate-700 dark:text-slate-300">
                            <td className="py-2 px-3 font-semibold">{a.nama}</td>
                            <td className="py-2 px-3">{a.periode || '-'}</td>
                            <td className="px-3 py-2 text-right font-semibold tabular-nums whitespace-nowrap">
                              {money(a.nominal_final)}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold tabular-nums whitespace-nowrap">
                              {money(a.unpaid)}
                            </td>
                            <td className="px-3 py-2 text-right font-black tabular-nums text-emerald-600 whitespace-nowrap dark:text-emerald-400">
                              {money(a.allocated)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex items-center justify-center px-2 py-8 text-center text-xs text-slate-400">
                    Tidak ada tagihan aktif (open/sebagian) untuk siswa ini.
                  </div>
                )}

                {alokasiPreview.remaining_unallocated > 0 && (
                  <div className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/50 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-300">
                    Sisa dana belum dialokasikan:{' '}
                    <strong className="tabular-nums">{money(alokasiPreview.remaining_unallocated)}</strong>. Nominal
                    tetap tercatat di pembayaran, tapi belum menjadi pelunasan tagihan mana pun.
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center py-9 text-sm text-slate-400">
                Memuat simulasi alokasi…
              </div>
            )}
          </div>

          <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <ActionButton icon={X} onClick={onClose} variant="secondary">
              Batal
            </ActionButton>
            <ActionButton
              icon={submitting ? undefined : CheckCircle2}
              disabled={submitting || !payForm.siswa_id || !payForm.nominal}
              onClick={onPay}
            >
              {submitting ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Menyimpan…
                </span>
              ) : (
                'Simpan & Catat Pembayaran'
              )}
            </ActionButton>
          </div>
        </div>
      </div>
    </Modal>
  );
}
