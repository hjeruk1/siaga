import { useState } from 'react';
import { api } from '../../api';
import { Download, FileSpreadsheet, Loader2 } from 'lucide-react';

// Ekspor keuangan untuk pembukuan.
//
// Dua tombol, bukan satu dengan pilihan: bendahara biasanya butuh salah satu
// saja — "uang yang seharusnya masuk" (tagihan) atau "uang yang benar-benar
// masuk" (pembayaran). Menyatukannya dalam satu dropdown hanya menambah klik.
//
// CSV, bukan PDF: datanya perlu dijumlah dan disaring di Excel. Formatnya
// memakai BOM + `sep=,` sehingga Excel di Windows langsung memisahkan kolom.

function bulanIni() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(new Date()).slice(0, 7);
}

export default function EksporKeuangan({ cabangId, toast }) {
  const [periode, setPeriode] = useState(bulanIni);
  const [semua, setSemua] = useState(false);
  const [sibuk, setSibuk] = useState(null);

  async function unduh(jenis) {
    setSibuk(jenis);
    try {
      const b = await api.eksporKeuangan({
        jenis,
        cabang_id: cabangId || undefined,
        periode: semua ? undefined : periode
      });
      const url = URL.createObjectURL(b);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Keuangan_${jenis === 'pembayaran' ? 'Pembayaran' : 'Tagihan'}_${semua ? 'semua' : periode}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      toast?.('ok', 'Berkas CSV diunduh');
    } catch (e) {
      toast?.('err', e.message);
    } finally {
      setSibuk(null);
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[12px] font-black text-text-main">
            <FileSpreadsheet className="h-3.5 w-3.5 text-primary" />
            Ekspor untuk pembukuan
          </p>
          <p className="text-[11px] font-semibold text-slate-500">
            CSV siap dibuka Excel. Tagihan = yang seharusnya masuk; pembayaran = yang benar-benar masuk.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">Periode</span>
            <input
              id="ekspor-periode"
              type="month"
              value={periode}
              onChange={(e) => setPeriode(e.target.value)}
              disabled={semua}
              className="h-9 rounded-lg border border-slate-200 px-2 text-[12px] font-bold text-text-main outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-slate-100 disabled:text-slate-400"
            />
          </label>
          <label className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
            <input
              type="checkbox"
              checked={semua}
              onChange={(e) => setSemua(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300"
            />
            Semua periode
          </label>
          <button
            type="button"
            onClick={() => unduh('tagihan')}
            disabled={!!sibuk}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-100 px-3 text-[12px] font-black text-slate-700 hover:bg-slate-200 disabled:opacity-50"
          >
            {sibuk === 'tagihan' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Tagihan
          </button>
          <button
            type="button"
            onClick={() => unduh('pembayaran')}
            disabled={!!sibuk}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-[12px] font-black text-white hover:bg-primary-hover disabled:opacity-50"
          >
            {sibuk === 'pembayaran' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Pembayaran
          </button>
        </div>
      </div>
    </div>
  );
}
