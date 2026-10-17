// Tab Tagihan: ringkasan, daftar tagihan aktif, invoice, riwayat pembayaran,
// dan tautan WhatsApp untuk berbagi kuitansi.
import { useState } from 'react';
import { CreditCard, Download, MessageCircle, Receipt } from 'lucide-react';
import { Card, CopyButton, EmptyState, ErrorState, InfoNote, Pill, SectionTitle, Skeleton } from './ui.jsx';
import {
  labelPeriode,
  ringkasTagihan,
  rupiah,
  sisaTagihan,
  tautanInvoice,
  tautanKuitansi,
  teksBagikanKuitansi,
  totalTerbayar,
  waUrl
} from './portalHelpers.js';

export default function Tagihan({ siswa, billing, memuat = false, galat, onMuatUlang, toast }) {
  const [tab, setTab] = useState('tagihan');
  const ringkas = ringkasTagihan(billing?.tagihan || []);
  const terbayar = totalTerbayar(billing?.pembayaran || []);

  if (galat) return <Card className="p-4"><ErrorState desc={galat} onRetry={onMuatUlang} /></Card>;
  if (memuat && !billing) {
    return (
      <div className="space-y-3">
        <Card className="space-y-2 p-4"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></Card>
      </div>
    );
  }
  if (!billing) return null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="relative overflow-hidden p-4">
          <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-amber-100/60 blur-2xl" aria-hidden="true" />
          <div className="relative flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600">
              <Receipt className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Tagihan tertunda</div>
              <div className="mt-0.5 text-2xl font-black tabular-nums text-amber-600">{rupiah(ringkas.totalSisa)}</div>
              <p className="text-[11px] font-semibold text-slate-500">
                {ringkas.jumlahBelum} tagihan belum lunas
                {ringkas.jumlahLunas ? ` • ${ringkas.jumlahLunas} lunas` : ''}
              </p>
            </div>
          </div>
        </Card>
        <Card className="relative overflow-hidden p-4">
          <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-emerald-100/60 blur-2xl" aria-hidden="true" />
          <div className="relative flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
              <CreditCard className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total terbayar</div>
              <div className="mt-0.5 text-2xl font-black tabular-nums text-emerald-600">{rupiah(terbayar)}</div>
              <p className="text-[11px] font-semibold text-slate-500">
                {billing.pembayaran?.length || 0} riwayat pembayaran
              </p>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex gap-1.5 rounded-2xl border border-slate-200 bg-white p-1.5" role="tablist" aria-label="Bagian tagihan">
        {[
          { id: 'tagihan', label: 'Tagihan' },
          { id: 'invoice', label: 'Invoice' },
          { id: 'riwayat', label: 'Riwayat' }
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-xl px-3 py-2 text-xs font-black transition-colors duration-200 ${
              tab === t.id ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'tagihan' ? (
        <Card className="space-y-3 p-4">
          <SectionTitle icon={Receipt} hint={siswa ? `Anak: ${siswa.nama}` : ''}>
            Tagihan aktif
          </SectionTitle>
          {ringkas.kosong ? (
            <EmptyState icon={Receipt} title="Belum ada tagihan" desc="Tagihan yang diterbitkan akan tampil di sini." />
          ) : ringkas.semuaLunas ? (
            <EmptyState
              icon={CreditCard}
              title="Semua tagihan lunas"
              desc="Terima kasih atas kerja sama Anda. Tagihan baru akan muncul bila diterbitkan."
              tone="text-emerald-400"
            />
          ) : (
            <ul className="space-y-2.5">
              {ringkas.belum.map((t) => {
                const total = Number(t.nominal_final || 0);
                const dibayar = Number(t.paid_amount || 0);
                const persen = total > 0 ? Math.min(100, Math.round((dibayar / total) * 100)) : 0;
                return (
                  <li
                    key={t.id}
                    className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-[0_4px_14px_rgba(15,23,42,.04)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600">
                            <Receipt className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-black text-text-main">{t.nama}</div>
                            <div className="text-[11px] font-semibold text-slate-500">
                              {labelPeriode(t.periode)} • <span className="uppercase">{t.jenis}</span>
                            </div>
                          </div>
                        </div>
                        <div className="mt-2.5">
                          <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
                            <span>Terbayar {rupiah(dibayar)}</span>
                            <span className="tabular-nums">{persen}%</span>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 motion-safe:transition-[width] motion-safe:duration-500"
                              style={{ width: `${persen}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-black tabular-nums text-text-main">{rupiah(sisaTagihan(t))}</div>
                        <div className="text-[10px] font-semibold text-slate-400">sisa</div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {ringkas.lunas.length ? (
            <details className="rounded-xl border border-slate-200 bg-white p-3">
              <summary className="cursor-pointer text-xs font-black text-slate-600">
                {ringkas.lunas.length} tagihan lunas
              </summary>
              <ul className="mt-2 space-y-1.5">
                {ringkas.lunas.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="truncate text-slate-600">{t.nama}</span>
                    <Pill tone="bg-emerald-50 text-emerald-700 border-emerald-200">Lunas</Pill>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </Card>
      ) : null}

      {tab === 'invoice' ? (
        <Card className="space-y-3 p-4">
          <SectionTitle icon={Receipt}>Dokumen invoice resmi</SectionTitle>
          {(billing.invoices || []).length === 0 ? (
            <EmptyState icon={Receipt} title="Belum ada invoice" desc="Invoice yang diterbitkan akan tampil di sini." />
          ) : (
            <ul className="space-y-2.5">
              {(billing.invoices || []).map((inv) => {
                const tautan = tautanInvoice(inv);
                return (
                  <li key={inv.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5">
                    <div className="min-w-0">
                      <div className="font-mono text-xs font-black text-text-main">{inv.invoice_no}</div>
                      <div className="mt-0.5 text-[11px] font-semibold text-slate-500">
                        Tahun ajaran {inv.tahun_ajaran} • Total {rupiah(inv.total)}
                      </div>
                    </div>
                    {tautan ? (
                      <a
                        href={tautan}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 hover:bg-slate-50"
                      >
                        <Download className="w-3.5 h-3.5" aria-hidden="true" /> Unduh
                      </a>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ) : null}

      {tab === 'riwayat' ? (
        <Card className="space-y-3 p-4">
          <SectionTitle icon={CreditCard}>Riwayat pembayaran</SectionTitle>
          {(billing.pembayaran || []).length === 0 ? (
            <EmptyState icon={CreditCard} title="Belum ada pembayaran" desc="Pembayaran yang tercatat akan tampil di sini." />
          ) : (
            <ul className="space-y-2.5">
              {(billing.pembayaran || []).map((p) => {
                const tautan = tautanKuitansi(p);
                const teks = teksBagikanKuitansi(siswa?.nama, p);
                return (
                  <li key={p.id} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-mono text-xs font-black text-text-main">{p.receipt_no || 'Menunggu verifikasi'}</div>
                        <div className="mt-0.5 text-[11px] font-semibold text-slate-500">
                          {p.tanggal_bayar} • {String(p.metode || '').toUpperCase()}
                        </div>
                        <div className="mt-1">
                          <Pill tone={p.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}>
                            {p.status === 'confirmed' ? 'Dikonfirmasi' : 'Verifikasi'}
                          </Pill>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-black tabular-nums text-text-main">{rupiah(p.nominal)}</div>
                        {p.status === 'confirmed' && tautan ? (
                          <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                            <a
                              href={tautan}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-[11px] font-black text-slate-600 hover:bg-slate-50"
                            >
                              <Download className="w-3.5 h-3.5" aria-hidden="true" /> Kuitansi
                            </a>
                            <a
                              href={waUrl(null, teks)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 text-[11px] font-black text-emerald-700 hover:bg-emerald-100"
                            >
                              <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" /> WA
                            </a>
                            <CopyButton teks={teks} label="Salin" toast={toast} className="h-8 px-2.5 text-[11px]" />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ) : null}

      <InfoNote>
        Nomor WhatsApp guru kelas ada di hero. Kuitansi yang sudah terverifikasi dapat diunduh dan dibagikan ke keluarga.
      </InfoNote>
    </div>
  );
}
