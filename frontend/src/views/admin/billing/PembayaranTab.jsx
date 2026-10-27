// Tab Pembayaran Billing: daftar pembayaran beserta verifikasi, tolak, void, dan edit alokasi.
import { ActionButton, EmptyState, IconButton } from '../../../components/Shared';
import { money } from '../../../utils/format';
import { BillingStatusBadge, MethodBadge, MoneyCell, StudentAvatar, Table, Td } from '../AdminShared';
import { Ban, CheckCircle2, FileImage, FilePenLine, FileText, Receipt, X } from 'lucide-react';

export function PembayaranTab({
  user,
  siswa,
  pembayaran,
  openPdf,
  verify,
  reject,
  voidPay,
  editAlokasi,
  setShowPaymentModal
}) {
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm sm:p-4">
        <div>
          <h3 className="font-black text-text-main text-base">Riwayat Pembayaran</h3>
          <p className="text-xs text-slate-400 mt-1">Daftar penerimaan pembayaran SPP dan Kegiatan dari wali murid</p>
        </div>
        {['admin', 'admin_cabang'].includes(user.role) && (
          <ActionButton
            icon={Receipt}
            onClick={() => setShowPaymentModal(true)}
            variant="primary"
            className="bg-primary hover:bg-primary-hover shadow-sm font-black text-xs px-4 py-2 rounded-xl"
          >
            Catat Pembayaran
          </ActionButton>
        )}
      </div>
      {pembayaran.length === 0 ? (
        <EmptyState icon="💳" title="Belum Ada Pembayaran" description="Belum ada riwayat pembayaran tercatat." />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm md:block">
            <Table headers={['Siswa', 'Nominal', 'Alokasi', 'Metode', 'Status', 'Kuitansi', 'Aksi']}>
              {pembayaran.map((p) => {
                const student = siswa.find((x) => x.id === p.siswa_id);
                return (
                  <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors">
                    <Td>
                      <div className="flex items-center gap-3 py-1">
                        <StudentAvatar name={p.siswa_nama} url={student?.foto} size="sm" />
                        <span className="font-semibold text-slate-800">{p.siswa_nama}</span>
                      </div>
                    </Td>
                    <MoneyCell className="text-slate-900 font-extrabold">{money(p.nominal)}</MoneyCell>
                    <Td>
                      <div className="space-y-1 text-xs">
                        <div className="font-bold text-slate-600 tabular-nums">{money(p.allocated_amount || 0)}</div>
                        {Number(p.credit_amount || 0) > 0 && (
                          <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700">
                            Kredit {money(p.credit_amount)}
                          </span>
                        )}
                      </div>
                    </Td>
                    <Td>
                      <MethodBadge metode={p.metode} />
                    </Td>
                    <Td>
                      <BillingStatusBadge status={p.status} />
                    </Td>
                    <Td>
                      {p.receipt_no ? (
                        <code className="px-2 py-1 rounded bg-slate-100 font-mono text-[11px] text-slate-600 font-bold border border-slate-200/60">
                          {p.receipt_no}
                        </code>
                      ) : (
                        <span className="text-slate-400 font-bold">-</span>
                      )}
                    </Td>
                    <Td>
                      <div className="flex gap-1.5 justify-end">
                        {p.status === 'confirmed' && (
                          <IconButton
                            icon={FileText}
                            label={`PDF kuitansi ${p.siswa_nama}`}
                            onClick={() => openPdf('receipt', p.id)}
                            size="sm"
                            className="hover:bg-slate-100 text-slate-600"
                          />
                        )}
                        {p.status === 'pending_verification' && ['admin', 'admin_cabang'].includes(user.role) && (
                          <>
                            {p.bukti_path && (
                              <IconButton
                                icon={FileImage}
                                label={`Lihat bukti pembayaran ${p.siswa_nama}`}
                                onClick={() => window.open(p.bukti_path, '_blank', 'noopener')}
                                size="sm"
                                className="hover:bg-slate-100 text-slate-600"
                              />
                            )}
                            <IconButton
                              icon={CheckCircle2}
                              label={`Verifikasi pembayaran ${p.siswa_nama}`}
                              onClick={() => verify(p)}
                              size="sm"
                              className="text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                            />
                            <IconButton
                              icon={X}
                              label={`Tolak pembayaran ${p.siswa_nama}`}
                              onClick={() => reject(p)}
                              size="sm"
                              variant="danger"
                            />
                          </>
                        )}
                        {['confirmed', 'pending_verification'].includes(p.status) && (
                          <IconButton
                            icon={FilePenLine}
                            label={`Edit alokasi ${p.siswa_nama}`}
                            onClick={() => editAlokasi(p)}
                            size="sm"
                            className="hover:bg-slate-100 text-slate-600"
                          />
                        )}
                        {['confirmed', 'pending_verification'].includes(p.status) && (
                          <IconButton
                            icon={Ban}
                            label={`Void pembayaran ${p.siswa_nama}`}
                            onClick={() => voidPay(p)}
                            size="sm"
                            variant="danger"
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
            {pembayaran.map((p) => {
              const student = siswa.find((x) => x.id === p.siswa_id);
              const colorMap = {
                confirmed: 'bg-emerald-500',
                pending_verification: 'bg-violet-500 animate-pulse',
                rejected: 'bg-red-500',
                void: 'bg-slate-400'
              };
              const accentColor = colorMap[(p.status || '').toLowerCase()] || 'bg-slate-400';
              const dateLabel = p.tanggal_bayar
                ? new Date(p.tanggal_bayar).toLocaleDateString('id-ID', { dateStyle: 'medium' })
                : 'Tanggal -';

              return (
                <div
                  key={p.id}
                  className="relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition duration-200 hover:border-slate-300"
                >
                  <div className={`absolute top-0 left-0 w-1.5 h-full ${accentColor}`} />
                  <div className="flex flex-col gap-2.5 p-3.5 pl-4">
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="min-w-0">
                        <span className="text-[10px] text-slate-400 font-bold block">{dateLabel}</span>
                        {p.receipt_no && (
                          <span className="inline-block mt-0.5">
                            <code className="px-1.5 py-0.5 rounded bg-slate-50 font-mono text-[9px] text-slate-500 font-bold border border-slate-200/50">
                              {p.receipt_no}
                            </code>
                          </span>
                        )}
                      </div>
                      <div className="shrink-0">
                        <BillingStatusBadge status={p.status} />
                      </div>
                    </div>

                    <div className="border-t border-dashed border-slate-200 my-1" />

                    <div className="flex items-center gap-3">
                      <StudentAvatar name={p.siswa_nama} url={student?.foto} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="font-black text-sm text-slate-800 truncate">{p.siswa_nama}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] font-semibold text-slate-400">Metode:</span>
                          <MethodBadge metode={p.metode} />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between bg-slate-50/70 p-3 rounded-xl border border-slate-100">
                      <div>
                        <span className="text-slate-400 font-semibold uppercase tracking-wider text-[9px] block mb-0.5">
                          Nominal
                        </span>
                        <div className="text-base font-black text-slate-800 tabular-nums">{money(p.nominal)}</div>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-400 font-semibold uppercase tracking-wider text-[9px] block mb-0.5">
                          Terallokasi / Kredit
                        </span>
                        <div className="text-xs font-bold text-slate-700 tabular-nums">
                          {money(p.allocated_amount || 0)}
                          {Number(p.credit_amount || 0) > 0 && (
                            <span className="block text-[10px] font-black text-amber-600">
                              Kredit: {money(p.credit_amount)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 pt-1 border-t border-slate-100">
                      <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider">
                        Aksi Pembayaran
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {p.status === 'confirmed' && (
                          <button
                            type="button"
                            onClick={() => openPdf('receipt', p.id)}
                            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] font-black text-slate-600 bg-white hover:bg-slate-50 transition active:scale-95 flex-1 min-w-[90px]"
                          >
                            <FileText className="w-3.5 h-3.5" /> PDF
                          </button>
                        )}
                        {p.status === 'pending_verification' && ['admin', 'admin_cabang'].includes(user.role) && (
                          <>
                            <button
                              type="button"
                              onClick={() => verify(p)}
                              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 text-[11px] font-black text-emerald-600 bg-emerald-50 hover:bg-emerald-100 transition active:scale-95 flex-1 min-w-[90px]"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Verifikasi
                            </button>
                            <button
                              type="button"
                              onClick={() => reject(p)}
                              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-[11px] font-black text-red-600 bg-red-50 hover:bg-red-100 transition active:scale-95 flex-1 min-w-[90px]"
                            >
                              <X className="w-3.5 h-3.5" /> Tolak
                            </button>
                          </>
                        )}
                        {['confirmed', 'pending_verification'].includes(p.status) && (
                          <button
                            type="button"
                            onClick={() => editAlokasi(p)}
                            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] font-black text-slate-600 bg-white hover:bg-slate-50 transition active:scale-95 flex-1 min-w-[90px]"
                          >
                            <FilePenLine className="w-3.5 h-3.5" /> Alokasi
                          </button>
                        )}
                        {['confirmed', 'pending_verification'].includes(p.status) && (
                          <button
                            type="button"
                            onClick={() => voidPay(p)}
                            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-[11px] font-black text-red-600 bg-red-50 hover:bg-red-100 transition active:scale-95 flex-1 min-w-[90px]"
                          >
                            <Ban className="w-3.5 h-3.5" /> Void
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
