import { Modal, ActionButton } from '../../../components/Shared';
import { X, Save } from 'lucide-react';
import { money, BillingStatusBadge } from '../AdminShared';

/**
 * Dialog "Koreksi Alokasi Pembayaran".
 * Menerima state `alokasiEdit` + setter dan callback `onSave` dari BillingTab.
 */
export function AlokasiEditModal({ alokasiEdit, setAlokasiEdit, siswa, onSave }) {
  if (!alokasiEdit) return null;
  return (
    <Modal title="Koreksi Alokasi Pembayaran" onClose={() => setAlokasiEdit(null)} maxWidth="max-w-3xl">
      <div className="space-y-4">
        <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Wali / Siswa</span>
            <span className="font-bold text-slate-800 dark:text-slate-200">
              {siswa.find((s) => String(s.id) === String(alokasiEdit.payment.siswa_id))?.nama || '-'}
            </span>
          </div>
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
              Nominal Pembayaran
            </span>
            <span className="font-bold text-slate-800 dark:text-slate-200 tabular-nums">
              {money(alokasiEdit.payment.nominal)}
            </span>
          </div>
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
              Belum Dialokasikan
            </span>
            <span
              className={`font-black tabular-nums ${alokasiEdit.payment.nominal - alokasiEdit.bills.reduce((sum, b) => sum + (b._alloc || 0), 0) < 0 ? 'text-red-600' : 'text-emerald-600 dark:text-emerald-400'}`}
            >
              {money(alokasiEdit.payment.nominal - alokasiEdit.bills.reduce((sum, b) => sum + (b._alloc || 0), 0))}
            </span>
          </div>
        </div>
        {alokasiEdit.payment.nominal - alokasiEdit.bills.reduce((sum, b) => sum + Number(b._alloc || 0), 0) > 0 && (
          <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Sisa dana akan disimpan sebagai saldo kredit pembayaran ini dan belum mengurangi tagihan lain.
          </div>
        )}

        <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-black">
                <th className="text-left py-2.5 px-4">Tagihan</th>
                <th className="text-left py-2.5 px-4">Periode</th>
                <th className="text-right py-2.5 px-4">Total Tagihan</th>
                <th className="text-center py-2.5 px-4">Status</th>
                <th className="text-right py-2.5 px-4 w-40">Alokasi Dana</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {alokasiEdit.bills.map((b) => {
                const current = b._alloc !== undefined ? b._alloc : 0;
                return (
                  <tr key={b.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10">
                    <td className="py-2.5 px-4 font-semibold text-slate-700 dark:text-slate-300">{b.nama}</td>
                    <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400">{b.periode || '-'}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-700 whitespace-nowrap dark:text-slate-300">
                      {money(b.nominal_final)}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      <BillingStatusBadge status={b.status} />
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="relative flex items-center w-full">
                        <span className="absolute left-2.5 text-xs text-slate-400 font-bold">Rp</span>
                        <input
                          type="number"
                          value={current || ''}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            setAlokasiEdit((ae) => ({
                              ...ae,
                              bills: ae.bills.map((x) => (x.id === b.id ? { ...x, _alloc: val } : x))
                            }));
                          }}
                          className="input pl-8 py-1 h-8 text-right text-xs font-semibold w-full tabular-nums border border-slate-200 rounded-md focus:border-primary"
                          min="0"
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <ActionButton icon={X} onClick={() => setAlokasiEdit(null)} variant="secondary">
            Batal
          </ActionButton>
          <ActionButton
            icon={Save}
            disabled={alokasiEdit.payment.nominal - alokasiEdit.bills.reduce((sum, b) => sum + (b._alloc || 0), 0) < 0}
            onClick={onSave}
          >
            Simpan Alokasi
          </ActionButton>
        </div>
      </div>
    </Modal>
  );
}
