// Tab "Ringkasan" Billing: kartu aksi, empat angka utama, dan ringkasan
// tagihan terbaru. Dipisah dari BillingTab supaya berkas induk fokus pada
// state dan mutasi; komponen ini murni tampilan.
import { AlertCircle, BarChart3, ChevronDown, Clock, FilePlus, Receipt, Settings, TrendingUp } from 'lucide-react';
import { ActionCard } from './ActionCard';
import EksporKeuangan from '../EksporKeuangan';
import { StatCard } from './StatCard';
import { money } from '../../../utils/format';

export function RingkasanTab({ user, toast, m, tarif, tagihan, billingStats, setBillingSubTab, setShowPaymentModal }) {
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <StatCard
          icon={Receipt}
          label="Total Tagihan"
          value={money(billingStats.totalTagihan)}
          hint="Tagihan aktif (di luar void)"
        />
        <StatCard
          icon={TrendingUp}
          tone="emerald"
          label="Terbayar"
          value={money(billingStats.totalTerbayar)}
          hint="Koleksi terkonfirmasi"
        />
        <StatCard
          icon={Clock}
          tone="amber"
          label="Outstanding"
          value={money(billingStats.outstanding)}
          hint="Belum terbayar"
        />
        <StatCard
          icon={BarChart3}
          tone="primary"
          label="Rasio Koleksi"
          value={`${billingStats.collectionRate}%`}
          progress={billingStats.collectionRate}
        />
      </div>
      <EksporKeuangan cabangId={m.cabangId} toast={toast} />

      {billingStats.pendingCount > 0 && (
        <button
          type="button"
          onClick={() => setBillingSubTab('pembayaran')}
          className="group mb-4 flex w-full items-center gap-3 rounded-xl border border-amber-200/80 bg-amber-50 p-3 text-left transition hover:bg-amber-100/70"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5 text-amber-600" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-black text-amber-800 text-sm">
              {billingStats.pendingCount} Pembayaran Menunggu Verifikasi
            </div>
            <div className="text-xs text-amber-600/80 mt-0.5">Klik untuk mereview dan memverifikasi pembayaran</div>
          </div>
          <ChevronDown className="w-4 h-4 text-amber-400 -rotate-90 group-hover:translate-x-0.5 transition-transform shrink-0" />
        </button>
      )}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3">
        {['admin', 'admin_cabang'].includes(user.role) && (
          <ActionCard
            icon={Receipt}
            tone="primary"
            title="Catat Pembayaran"
            subtitle="Input pembayaran baru dari wali"
            onClick={() => setShowPaymentModal(true)}
          />
        )}
        <ActionCard
          icon={FilePlus}
          title="Generate Tagihan"
          subtitle="Buat tagihan bulanan atau kegiatan"
          onClick={() => setBillingSubTab('tagihan')}
        />
        <ActionCard
          icon={Settings}
          title="Kelola Tarif"
          subtitle="Atur tarif dan diskon siswa"
          onClick={() => setBillingSubTab('tarif')}
        />
      </div>
      {tarif.length === 0 && tagihan.length === 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-semibold text-amber-700">
          <AlertCircle size={16} className="shrink-0" />
          <span>Billing belum disiapkan untuk cabang ini. Mulai dengan menambahkan tarif di tab Tarif & Diskon.</span>
        </div>
      )}
    </>
  );
}
