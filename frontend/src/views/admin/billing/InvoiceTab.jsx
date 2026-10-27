// Tab Invoice Billing: daftar invoice gabungan beserta aksi PDF dan kirim WhatsApp.
import { EmptyState, IconButton } from '../../../components/Shared';
import { money } from '../../../utils/format';
import { BillingStatusBadge, MoneyCell, StudentAvatar, Table, Td } from '../AdminShared';
import { FileText, Smartphone } from 'lucide-react';

export function InvoiceTab({ invoices, siswa, openPdf, sendWhatsAppInvoice }) {
  return (
    <>
      <div className="mb-4 flex flex-col gap-1 rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm sm:p-4">
        <h3 className="font-black text-text-main text-base">Invoice Tagihan</h3>
        <p className="text-xs text-slate-400 mt-1">Daftar invoice resmi yang diterbitkan untuk wali murid</p>
      </div>
      {invoices.length === 0 ? (
        <EmptyState icon="📄" title="Belum Ada Invoice" description="Belum ada invoice tagihan yang dibuat." />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm md:block">
            <Table headers={['Nomor', 'Siswa', 'Total', 'Status', '']}>
              {invoices.map((i) => {
                const student = siswa.find((x) => x.id === i.siswa_id);
                return (
                  <tr key={i.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors">
                    <Td>
                      <code className="px-2 py-1 rounded bg-slate-100 font-mono text-[11px] text-slate-600 font-bold border border-slate-200/60">
                        {i.invoice_no}
                      </code>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-3 py-1">
                        <StudentAvatar name={i.siswa_nama} url={student?.foto} size="sm" />
                        <span className="font-semibold text-slate-800">{i.siswa_nama}</span>
                      </div>
                    </Td>
                    <MoneyCell className="text-slate-900 font-extrabold">{money(i.total)}</MoneyCell>
                    <Td>
                      <BillingStatusBadge status={i.status} />
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <IconButton
                          icon={FileText}
                          label={`PDF invoice ${i.invoice_no}`}
                          onClick={() => openPdf('invoice', i.id)}
                          size="sm"
                          className="hover:bg-slate-100 text-slate-600"
                        />
                        {i.status !== 'void' && i.wali_no_wa && (
                          <IconButton
                            icon={Smartphone}
                            label="Kirim WA"
                            onClick={() => sendWhatsAppInvoice(i)}
                            size="sm"
                            className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                          />
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </Table>
          </div>
          <div className="block md:hidden space-y-3">
            {invoices.map((i) => {
              const student = siswa.find((x) => x.id === i.siswa_id);
              const colorMap = {
                lunas: 'bg-emerald-500',
                paid: 'bg-emerald-500',
                confirmed: 'bg-emerald-500',
                sebagian: 'bg-blue-500',
                partially_paid: 'bg-blue-500',
                pending_verification: 'bg-violet-500 animate-pulse',
                issued: 'bg-sky-500',
                open: 'bg-amber-500',
                unpaid: 'bg-amber-500'
              };
              const accentColor = colorMap[(i.status || '').toLowerCase()] || 'bg-slate-400';

              return (
                <div
                  key={i.id}
                  className="relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition duration-200 hover:border-slate-300"
                >
                  <div className={`absolute top-0 left-0 w-1.5 h-full ${accentColor}`} />
                  <div className="flex flex-col gap-2.5 p-3.5 pl-4">
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="min-w-0">
                        <span className="text-[10px] text-slate-400 font-bold block">Invoice No</span>
                        <span className="inline-block mt-0.5">
                          <code className="px-1.5 py-0.5 rounded bg-slate-50 font-mono text-[9px] text-slate-500 font-bold border border-slate-200/50">
                            {i.invoice_no}
                          </code>
                        </span>
                      </div>
                      <div className="shrink-0">
                        <BillingStatusBadge status={i.status} />
                      </div>
                    </div>

                    <div className="border-t border-dashed border-slate-200 my-1" />

                    <div className="flex items-center gap-3">
                      <StudentAvatar name={i.siswa_nama} url={student?.foto} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="font-black text-sm text-slate-800 truncate">{i.siswa_nama}</div>
                        <div className="text-[10px] font-semibold text-slate-400 mt-0.5">
                          Total Tagihan:{' '}
                          <span className="font-extrabold text-slate-800 tabular-nums">{money(i.total)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
                      <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider">
                        Aksi Invoice
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => openPdf('invoice', i.id)}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-black text-slate-700 bg-white hover:bg-slate-50 active:scale-95 transition flex-1"
                        >
                          <FileText className="w-3.5 h-3.5 text-slate-500" /> Unduh PDF
                        </button>
                        {i.status !== 'void' && i.wali_no_wa && (
                          <button
                            type="button"
                            onClick={() => sendWhatsAppInvoice(i)}
                            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-200 text-xs font-black text-emerald-700 bg-emerald-50 hover:bg-emerald-100 active:scale-95 transition flex-1"
                          >
                            <Smartphone className="w-3.5 h-3.5 text-emerald-600" /> Kirim WA
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
