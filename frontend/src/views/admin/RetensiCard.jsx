import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { ActionButton, Modal } from '../../components/Shared';
import { Archive, HardDriveDownload, Loader2, Play, RefreshCw, Save, TriangleAlert } from 'lucide-react';

// Kartu kebijakan retensi galeri.
//
// Bentuknya sengaja dua angka, bukan satu slider: "arsipkan setelah N bulan"
// dan "hapus setelah N bulan". Arsip hanya membuang berkas penuh (thumbnail
// tetap ada, album wali tetap bisa dibuka), hapus membuang barisnya. Tanpa
// pemisahan itu, satu-satunya pilihan admin adalah menunggu disk penuh lalu
// menghapus foto secara manual.
//
// Semua angka di layar dihitung server dengan fungsi yang sama yang dipakai
// saat tombol "Jalankan" ditekan — pratinjau tidak boleh beda dari kenyataan.

function ukuran(bytes) {
  const n = Number(bytes || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function waktu(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(d);
}

// Batas retensi datang sebagai YYYY-MM-DD. Menampilkannya apa adanya membuat
// admin membaca "2025-10-27" alih-alih "27 Okt 2025".
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
function tanggal(ymd) {
  if (!ymd) return '—';
  const [y, m, d] = String(ymd).split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return `${d} ${BULAN[m - 1]} ${y}`;
}

export default function RetensiCard({ toast }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [memuat, setMemuat] = useState(true);
  const [menyimpan, setMenyimpan] = useState(false);
  const [menjalankan, setMenjalankan] = useState(false);
  const [konfirmasi, setKonfirmasi] = useState(false);
  // `toast` dibuat ulang setiap App render; menyimpannya di ref menjaga muat()
  // stabil dan mencegah efek memuat ulang menimpa isian form.
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const muat = useCallback(async () => {
    setMemuat(true);
    try {
      const r = await api.retensi();
      setData(r);
      setForm({
        aktif: !!r.setelan?.aktif,
        arsipBulan: r.setelan?.arsipBulan ?? 12,
        hapusBulan: r.setelan?.hapusBulan ?? 0
      });
    } catch (e) {
      toastRef.current?.('err', e.message);
    } finally {
      setMemuat(false);
    }
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  async function simpan() {
    setMenyimpan(true);
    try {
      const r = await api.retensiSimpan(form);
      setData(r);
      setForm({
        aktif: !!r.setelan?.aktif,
        arsipBulan: r.setelan?.arsipBulan ?? 12,
        hapusBulan: r.setelan?.hapusBulan ?? 0
      });
      toastRef.current?.('ok', 'Kebijakan retensi disimpan');
    } catch (e) {
      toastRef.current?.('err', e.message);
    } finally {
      setMenyimpan(false);
    }
  }

  async function jalankan() {
    setMenjalankan(true);
    try {
      const r = await api.retensiJalankan();
      const h = r.hasil || {};
      const bagian = [];
      if (h.diarsip?.foto) bagian.push(`${h.diarsip.foto} diarsipkan (${ukuran(h.diarsip.bytes)})`);
      if (h.dihapus?.foto) bagian.push(`${h.dihapus.foto} dihapus (${ukuran(h.dihapus.bytes)})`);
      if (h.yatim?.berkas) bagian.push(`${h.yatim.berkas} berkas yatim dibersihkan`);
      toastRef.current?.('ok', bagian.length ? bagian.join(', ') : 'Tidak ada foto yang perlu diproses');
      setKonfirmasi(false);
      await muat();
    } catch (e) {
      toastRef.current?.('err', e.message);
    } finally {
      setMenjalankan(false);
    }
  }

  if (memuat && !form) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 text-sm font-black text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Membaca kebijakan retensi
        </div>
      </section>
    );
  }
  if (!form || !data) return null;

  const akanArsip = data.akan_arsip || { foto: 0, bytes: 0 };
  const akanHapus = data.akan_hapus || { foto: 0, bytes: 0 };
  const yatim = data.yatim || { berkas: 0, bytes: 0 };
  const adaKerja = akanArsip.foto + akanHapus.foto + yatim.berkas > 0;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_18px_60px_rgba(15,23,42,.05)] sm:p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[15px] font-black text-text-main">
            <Archive className="h-4 w-4 text-primary" />
            Retensi galeri
          </h2>
          <p className="text-[11px] font-semibold text-slate-500">
            Foto lama berhenti memakan disk tanpa hilang dari galeri wali. Diarsipkan = berkas penuh dibuang, thumbnail
            tetap ada. Dihapus = albumnya ikut hilang.
          </p>
        </div>
        <button
          type="button"
          onClick={muat}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-100 px-3 text-[12px] font-black text-slate-700 hover:bg-slate-200"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Segarkan
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
        <label className="block">
          <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">
            Arsipkan setelah (bulan)
          </span>
          <input
            type="number"
            min="0"
            max="60"
            value={form.arsipBulan}
            onChange={(e) => setForm((f) => ({ ...f, arsipBulan: Number(e.target.value) }))}
            className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-black text-text-main outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <span className="mt-1 block text-[10px] font-semibold text-slate-400">0 = jangan pernah diarsipkan</span>
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">
            Hapus setelah (bulan)
          </span>
          <input
            type="number"
            min="0"
            max="120"
            value={form.hapusBulan}
            onChange={(e) => setForm((f) => ({ ...f, hapusBulan: Number(e.target.value) }))}
            className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-black text-text-main outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <span className="mt-1 block text-[10px] font-semibold text-slate-400">
            0 = simpan selamanya (harus lebih lama dari arsip)
          </span>
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, aktif: !f.aktif }))}
            className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-[12px] font-black transition-all ${
              form.aktif
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 bg-white text-slate-500'
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${form.aktif ? 'bg-emerald-500' : 'bg-slate-300'}`}
              aria-hidden="true"
            />
            {form.aktif ? 'Aktif' : 'Mati'}
          </button>
          <ActionButton icon={menyimpan ? Loader2 : Save} onClick={simpan} disabled={menyimpan}>
            {menyimpan ? 'Menyimpan' : 'Simpan'}
          </ActionButton>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Akan diarsipkan</div>
          <div className="mt-1 text-lg font-black text-text-main">{akanArsip.foto} foto</div>
          <div className="mt-1 text-[11px] font-semibold text-slate-500">
            {akanArsip.foto ? `${ukuran(akanArsip.bytes)} kembali` : 'belum ada'} · sebelum{' '}
            {tanggal(data.setelan?.batas_arsip)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Akan dihapus</div>
          <div className="mt-1 text-lg font-black text-text-main">{akanHapus.foto} foto</div>
          <div className="mt-1 text-[11px] font-semibold text-slate-500">
            {akanHapus.foto ? ukuran(akanHapus.bytes) : 'belum ada'} · sebelum {tanggal(data.setelan?.batas_hapus)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Berkas tanpa data</div>
          <div className="mt-1 text-lg font-black text-text-main">{yatim.berkas} berkas</div>
          <div className="mt-1 text-[11px] font-semibold text-slate-500">
            {yatim.berkas ? `${ukuran(yatim.bytes)} bisa dibersihkan` : 'tidak ada sisa berkas'}
          </div>
        </div>
      </div>

      {form.aktif ? (
        <p className="mt-2 text-[11px] font-semibold text-slate-500">
          Job berjalan otomatis sekali sehari. Terakhir: {waktu(data.setelan?.terakhirJalan)}.
        </p>
      ) : (
        <p className="mt-2 text-[11px] font-semibold text-amber-700">
          Otomatis mati — foto hanya diproses bila Anda menekan tombol di bawah.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ActionButton icon={menjalankan ? Loader2 : Play} variant="secondary" onClick={() => setKonfirmasi(true)}>
          Jalankan sekarang
        </ActionButton>
        {!adaKerja && (
          <span className="text-[11px] font-semibold text-slate-500">Tidak ada foto yang melewati batas saat ini.</span>
        )}
      </div>

      {(data.riwayat || []).length > 0 && (
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-left text-[12px]">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-2 font-black">Dijalankan</th>
                <th className="px-3 py-2 font-black">Mode</th>
                <th className="px-3 py-2 font-black">Arsip</th>
                <th className="px-3 py-2 font-black">Hapus</th>
                <th className="px-3 py-2 text-right font-black">Yatim</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.riwayat.slice(0, 6).map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-bold text-text-main">{waktu(r.dijalankan_at)}</td>
                  <td className="px-3 py-2 font-semibold text-slate-500">
                    {r.mode === 'otomatis' ? 'Otomatis' : 'Manual'}
                  </td>
                  <td className="px-3 py-2 font-semibold text-slate-500">
                    {r.foto_diarsip} foto · {ukuran(r.byte_diarsip)}
                  </td>
                  <td className="px-3 py-2 font-semibold text-slate-500">
                    {r.foto_dihapus} foto · {ukuran(r.byte_dihapus)}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-500">{r.berkas_yatim}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {konfirmasi && (
        <Modal title="Jalankan retensi sekarang?" onClose={() => setKonfirmasi(false)} maxWidth="max-w-md">
          <div className="space-y-3">
            <p className="text-sm font-semibold leading-relaxed text-slate-600">
              Kebijakan yang tersimpan akan diterapkan pada foto yang sudah melewati batas umurnya.
            </p>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[12px] font-bold text-slate-700">
              <div className="flex items-center gap-2">
                <HardDriveDownload className="h-3.5 w-3.5 text-slate-400" />
                {akanArsip.foto} foto diarsipkan ({ukuran(akanArsip.bytes)})
              </div>
              <div className="mt-1 flex items-center gap-2">
                <Archive className="h-3.5 w-3.5 text-slate-400" />
                {akanHapus.foto} foto dihapus permanen ({ukuran(akanHapus.bytes)})
              </div>
              <div className="mt-1 flex items-center gap-2">
                <RefreshCw className="h-3.5 w-3.5 text-slate-400" />
                {yatim.berkas} berkas tanpa data dibersihkan
              </div>
            </div>
            {akanHapus.foto > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                <p className="text-[12px] font-bold leading-relaxed text-rose-700">
                  {akanHapus.foto} album foto akan hilang dari galeri wali dan tidak bisa dipulihkan.
                </p>
              </div>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <ActionButton variant="ghost" onClick={() => setKonfirmasi(false)}>
                Batal
              </ActionButton>
              <ActionButton icon={menjalankan ? Loader2 : Play} onClick={jalankan} disabled={menjalankan}>
                {menjalankan ? 'Menjalankan' : 'Jalankan'}
              </ActionButton>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
