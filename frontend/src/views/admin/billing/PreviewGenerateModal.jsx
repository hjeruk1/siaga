// Modal pratinjau "Generate Tagihan": menampilkan apa yang AKAN dibuat sebelum
// admin menekan konfirmasi. Dipisah dari BillingTab karena isinya murni
// tampilan — hanya membaca hasil pratinjau server dan dua callback.
import { Modal, ActionButton } from '../../../components/Shared';
import { CheckCircle2, X } from 'lucide-react';
import { money } from '../../../utils/format';

export function PreviewGenerateModal({ preview, newItems, existingItems, cabang, onKonfirmasi, onTutup }) {
  if (!preview) return null;
  return (
    <Modal
      title={`Preview Generate ${preview.kind === 'bulanan' ? 'Bulanan' : 'Kegiatan'}`}
      onClose={onTutup}
      maxWidth="max-w-4xl"
    >
      <div className="space-y-3.5">
        <div className="text-xs text-slate-600 sm:text-sm">
          {preview.kind === 'bulanan'
            ? `Periode: ${preview.period} | Tahun ajaran: ${preview.tahun_ajaran}`
            : `Tahun ajaran: ${preview.tahun_ajaran}`}
          {' | '}Cabang: {cabang.find((c) => String(c.id) === String(preview.cabang_id))?.nama || preview.cabang_id}
        </div>
        {preview.errors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
            <div className="font-black mb-1">Error ({preview.errors.length}):</div>
            {preview.errors.map((e, i) => (
              <div key={i}>{e}</div>
            ))}
          </div>
        )}
        {newItems.length > 0 && (
          <>
            <div className="font-black text-text-main">Tagihan baru ({newItems.length})</div>
            <div className="max-h-72 overflow-x-auto">
              <table className="w-full min-w-[46rem] text-sm">
                <thead>
                  <tr>
                    <th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Siswa</th>
                    <th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Jenis</th>
                    <th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Jenjang</th>
                    <th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Paket</th>
                    <th className="bg-slate-50 px-3 py-2 text-right font-black text-slate-500 whitespace-nowrap">
                      Awal
                    </th>
                    <th className="bg-slate-50 px-3 py-2 text-right font-black text-slate-500 whitespace-nowrap">
                      Diskon
                    </th>
                    <th className="bg-slate-50 px-3 py-2 text-right font-black text-slate-500 whitespace-nowrap">
                      Final
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {newItems.map((p, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{p.siswa_nama}</td>
                      <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{p.nama}</td>
                      <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{p.jenjang_nama}</td>
                      <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{p.paket}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-700 whitespace-nowrap">
                        {money(p.nominal_awal)}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-700 whitespace-nowrap">
                        {money(p.diskon_amount)}
                      </td>
                      <td className="px-3 py-2 text-right font-black tabular-nums text-slate-900 whitespace-nowrap">
                        {money(p.nominal_final)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {existingItems.length > 0 && (
          <div className="rounded-xl border border-primary/20 bg-primary-container px-3 py-2 text-sm font-bold text-primary-active">
            {existingItems.length} tagihan sudah ada dan akan dilewati.
          </div>
        )}
        {newItems.length === 0 && existingItems.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">
            Tidak ada tagihan yang akan dibuat.
          </div>
        )}
        <div className="flex gap-2">
          <ActionButton icon={CheckCircle2} onClick={onKonfirmasi} disabled={newItems.length === 0}>
            Konfirmasi Generate
          </ActionButton>
          <ActionButton icon={X} onClick={onTutup} variant="secondary">
            Batal
          </ActionButton>
        </div>
      </div>
    </Modal>
  );
}
