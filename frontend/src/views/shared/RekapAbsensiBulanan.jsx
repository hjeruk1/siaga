import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api';
import { CustomMonthPicker, CustomSelect, EmptyState, Modal, SS, Spinner } from '../../components/Shared';
import { todayWIB } from '../../utils/date';
import { ChevronRight, CalendarDays, FileSpreadsheet, FileText, Search, Users } from 'lucide-react';
import {
  RINGKAS_ORDER,
  STATUS_LABEL,
  STATUS_LETTER,
  STATUS_ORDER,
  buildMatrix,
  dayColumns,
  filterRows,
  groupByRombel,
  monthLabel,
  monthRange,
  summarize
} from './rekapHelpers';

// Layar rekap absensi bulanan untuk Admin dan Kepsek. Datanya dari
// GET /api/rekap (matriks harian + hari sekolah), ekspornya dari
// GET /api/rekap/export (PDF atau CSV).
export default function RekapAbsensiBulanan({ user, toast }) {
  const isAdmin = user.role === 'admin';
  const [bulan, setBulan] = useState(todayWIB().slice(0, 7));
  const [cabangId, setCabangId] = useState(isAdmin ? '' : user.cabang_id || '');
  const [rombelId, setRombelId] = useState('');
  const [q, setQ] = useState('');
  const [cabang, setCabang] = useState([]);
  const [rombels, setRombels] = useState([]);
  const [rows, setRows] = useState([]);
  const [hariSekolah, setHariSekolah] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [detail, setDetail] = useState(null);

  const range = useMemo(() => monthRange(bulan), [bulan]);
  // toast disimpan di ref supaya efek pemuatan tidak ikut terjalankan saat
  // identitas fungsi toast berubah dari parent.
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  useEffect(() => {
    api
      .cabang()
      .then((res) => setCabang(res || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    api
      .rombel(cabangId || undefined)
      .then((res) => setRombels(res || []))
      .catch(() => {});
  }, [cabangId]);

  useEffect(() => {
    let hidup = true;
    setLoading(true);
    api
      .rekapBulanan({
        tahun: range.tahun,
        bulan: range.bulan,
        cabang_id: cabangId || undefined,
        rombel_id: rombelId || undefined
      })
      .then((res) => {
        if (!hidup) return;
        setRows(res.data || []);
        setHariSekolah(res.hari_sekolah || []);
      })
      .catch((e) => toastRef.current('err', e.message || 'Gagal memuat rekap bulanan'))
      .finally(() => {
        if (hidup) setLoading(false);
      });
    return () => {
      hidup = false;
    };
  }, [range, cabangId, rombelId]);

  const terfilter = useMemo(() => filterRows(rows, q), [rows, q]);
  const ringkas = useMemo(() => summarize(terfilter, hariSekolah), [terfilter, hariSekolah]);
  const matriks = useMemo(() => buildMatrix(terfilter, hariSekolah), [terfilter, hariSekolah]);
  const perRombel = useMemo(() => groupByRombel(terfilter, hariSekolah), [terfilter, hariSekolah]);
  const kolom = useMemo(() => dayColumns(hariSekolah), [hariSekolah]);

  // Nama berkas dibuat dari nama siswa/rombel, bukan id internal, supaya
  // dokumen yang dibagikan ke orang tua langsung jelas isinya.
  function slug(nama) {
    return String(nama || 'siswa')
      .normalize('NFKD')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40);
  }

  async function ekspor(format, siswa, opts = {}) {
    const siswaId = siswa?.id || null;
    if (!rombelId && !siswaId) {
      toast('err', 'Pilih satu rombel dulu, baru ekspor PDF/CSV');
      return;
    }
    const kunci = `${format}-${opts.perAnak ? 'anak' : siswaId || rombelId}`;
    setBusy(kunci);
    try {
      const params = { format, start_date: range.start, end_date: range.end };
      if (siswaId) params.siswa_id = siswaId;
      else params.rombel_id = rombelId;
      if (opts.perAnak) params.per_anak = 1;
      const blobData = await api.exportRekap(params);
      const url = window.URL.createObjectURL(blobData);
      const a = document.createElement('a');
      const namaRombel = rombels.find((r) => String(r.id) === String(rombelId))?.nama || 'Kelas';
      const label = monthLabel(bulan).replace(/\s+/g, '-');
      const namaBerkas = siswaId
        ? `Absensi_${slug(siswa?.nama)}`
        : opts.perAnak
          ? `Absensi_Per-Anak_${slug(namaRombel)}`
          : `Rekap_${slug(namaRombel)}`;
      a.href = url;
      a.setAttribute('download', `${namaBerkas}_${label}.${format === 'excel' ? 'csv' : 'pdf'}`);
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast('ok', 'Ekspor diunduh');
    } catch (e) {
      toast('err', e.message || 'Gagal mengekspor data');
    } finally {
      setBusy('');
    }
  }

  const adaData = !loading && rows.length > 0;
  // siswa = null berarti ekspor tingkat kelas. Tombol Per Anak hanya muncul
  // saat satu rombel dipilih, karena dokumennya satu halaman per siswa.
  const tombolEkspor = (siswa) => {
    const daftar = [
      { format: 'pdf', label: 'PDF', icon: FileText },
      { format: 'excel', label: 'CSV', icon: FileSpreadsheet }
    ];
    if (!siswa && rombelId) daftar.push({ format: 'pdf', label: 'Per Anak', icon: Users, perAnak: true });
    return (
      <div className="flex gap-2">
        {daftar.map((f) => {
          const Icon = f.icon;
          const kunci = `${f.format}-${f.perAnak ? 'anak' : siswa?.id || rombelId}`;
          const sibuk = busy === kunci;
          const mati = !!busy || (!rombelId && !siswa);
          return (
            <button
              key={f.label}
              onClick={() => ekspor(f.format, siswa, { perAnak: f.perAnak })}
              disabled={mati}
              title={
                mati
                  ? 'Pilih satu rombel dulu'
                  : f.perAnak
                    ? 'Unduh PDF per anak (satu halaman tiap siswa)'
                    : `Unduh ${f.label}`
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-600 transition-all duration-200 hover:bg-slate-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden="true" />
              {sibuk ? '...' : f.label}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0 xl:min-w-[13rem]">
            <h2 className="text-base font-black text-text-main sm:text-lg">Rekap Absensi Bulanan</h2>
            <p className="truncate text-xs text-slate-500" title="Matriks harian per hari sekolah. Klik siswa untuk detail per hari.">
              Klik siswa untuk detail.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CustomMonthPicker value={bulan} onChange={setBulan} className="input h-10 w-[10.5rem]" />
            {isAdmin && (
              <CustomSelect
                value={cabangId}
                onChange={(e) => {
                  setCabangId(e.target.value);
                  setRombelId('');
                }}
                className="input h-10 w-full xs:w-44"
              >
                <option value="">Semua cabang</option>
                {cabang.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nama}
                  </option>
                ))}
              </CustomSelect>
            )}
            <CustomSelect
              value={rombelId}
              onChange={(e) => setRombelId(e.target.value)}
              className="input h-10 w-full xs:w-44"
            >
              <option value="">Semua rombel</option>
              {rombels.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nama}
                </option>
              ))}
            </CustomSelect>
            <div className="relative flex-1 min-w-[9rem]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                autoComplete="off"
                placeholder="Cari siswa atau kelas"
                className="input h-10 w-full pl-9"
              />
            </div>
            {tombolEkspor(null)}
          </div>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          {rombelId
            ? 'PDF/CSV berisi seluruh kelas. Tombol Per Anak membuat satu halaman tiap siswa untuk dibagikan ke orang tua.'
            : 'Pilih satu rombel dulu untuk mengunduh PDF atau CSV.'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[330px_minmax(0,1fr)] xl:gap-4">
        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Kehadiran {monthLabel(bulan)}</div>
            <div className="mt-1 flex items-end gap-2">
              <div className="text-3xl font-black text-text-main leading-none">{ringkas.persen}%</div>
              <div className="pb-0.5 text-xs text-slate-500">
                {ringkas.hari} hari sekolah
              </div>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${Math.min(100, ringkas.persen)}%` }}
              />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[...STATUS_ORDER, 'Belum'].map((s) => (
                <div key={s} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                  <div className="text-[9px] font-black uppercase text-slate-400">{s}</div>
                  <div className="text-sm font-black text-text-main leading-tight">{ringkas.counts[s] || 0}</div>
                </div>
              ))}
            </div>
            <div className="mt-2 text-[11px] text-slate-500">
              {ringkas.siswa} siswa terfilter, {ringkas.terisi} catatan status terisi
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-2 text-[10px] font-black uppercase tracking-wide text-slate-400">
              Per rombel ({perRombel.length})
            </div>
            {perRombel.length ? (
              <div className="max-h-[320px] space-y-1.5 overflow-y-auto custom-scrollbar pr-1">
                {perRombel.map((g) => {
                  const aktif = String(rombelId) === String(g.rombel_id);
                  return (
                    <button
                      key={g.rombel_id ?? g.nama}
                      onClick={() => setRombelId(aktif ? '' : String(g.rombel_id))}
                      aria-pressed={aktif}
                      className={`w-full rounded-xl border px-2.5 py-2 text-left transition-all duration-200 active:scale-[0.99] ${
                        aktif ? 'border-primary bg-primary-container' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-bold text-text-main">{g.nama}</span>
                        <span className="shrink-0 text-xs font-black text-text-main">{g.ringkas.persen}%</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, g.ringkas.persen)}%` }} />
                        </div>
                        <span className="shrink-0 text-[10px] text-slate-500">{g.ringkas.siswa} siswa</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-slate-500">Tidak ada rombel pada filter ini.</div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <div className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-slate-400">Legenda</div>
            <div className="flex flex-wrap gap-1.5">
              {[...STATUS_ORDER, 'Pulang', 'Menunggu', 'Libur', 'Belum'].map((s) => (
                <span key={s} className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${SS[s]}`}>
                  <span className="font-black">{STATUS_LETTER[s] || '-'}</span>
                  {STATUS_LABEL[s] || s}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-slate-400">
              Tanpa catatan berarti hari sekolah yang belum ada keterangan. Pulang dihitung hadir (siswa terekam lalu
              dijemput), Menunggu belum divalidasi kampus. Persentase = (Hadir + Terlambat + Pulang) dibagi hari sekolah
              berjalan.
            </p>
          </div>
        </div>

        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5 sm:px-4">
            <div className="min-w-0">
              <div className="truncate text-xs font-black text-text-main sm:text-sm">
                {rombelId ? rombels.find((r) => String(r.id) === String(rombelId))?.nama || 'Rombel' : 'Semua rombel'}
              </div>
              <div className="text-[11px] text-slate-500">
                {monthLabel(bulan)} - {kolom.length} hari sekolah - {terfilter.length} siswa
              </div>
            </div>
            {loading && <Spinner />}
          </div>

          {!adaData ? (
            <div className="p-3 sm:p-4">
              {loading ? (
                <div className="py-10 text-center text-sm text-slate-500">Memuat rekap...</div>
              ) : !rows.length ? (
                <EmptyState
                  icon="clipboard"
                  title="Belum ada siswa"
                  description="Tidak ada siswa aktif pada cabang atau rombel yang dipilih."
                />
              ) : (
                <EmptyState
                  icon={CalendarDays}
                  title="Belum ada hari sekolah"
                  description={`Belum ada hari sekolah yang berjalan pada ${monthLabel(bulan)} untuk cabang ini.`}
                />
              )}
            </div>
          ) : (
            <>
              {kolom.length === 0 ? (
                <div className="px-3 py-6 text-xs text-slate-500">Belum ada hari sekolah berjalan pada bulan ini.</div>
              ) : (
                <>
                  <div className="hidden overflow-x-auto scrollbar-none xl:block">
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500">
                          <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left font-black">Siswa</th>
                          {kolom.map((c) => (
                            <th key={c.iso} className="px-1 py-2 text-center font-bold" title={c.iso}>
                              {c.hari}
                            </th>
                          ))}
                          <th className="px-2 py-2 text-center font-black" title="Hadir">H</th>
                          <th className="px-2 py-2 text-center font-black" title="Terlambat">T</th>
                          <th className="px-2 py-2 text-center font-black" title="Pulang (dijemput)">P</th>
                          <th className="px-2 py-2 text-center font-black" title="Izin">I</th>
                          <th className="px-2 py-2 text-center font-black" title="Sakit">S</th>
                          <th className="px-2 py-2 text-center font-black" title="Absen">A</th>
                          <th className="px-2 py-2 text-center font-black" title="Persentase kehadiran">%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {matriks.map((row) => (
                          <tr
                            key={row.id}
                            onClick={() => setDetail(row)}
                            className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                          >
                            <td className="sticky left-0 z-10 bg-white px-3 py-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate text-xs font-bold text-text-main">{row.nama}</span>
                                <ChevronRight className="h-3 w-3 shrink-0 text-slate-300" aria-hidden="true" />
                              </div>
                              <div className="truncate text-[10px] text-slate-400">{row.kelas_nama}</div>
                            </td>
                            {row.cells.map((cell) => (
                              <td key={cell.iso} className="px-1 py-1.5 text-center">
                                <span
                                  title={`${row.nama} - ${cell.iso}: ${cell.status}`}
                                  aria-label={`${cell.iso}: ${cell.status}`}
                                  className={`inline-grid h-6 w-6 place-items-center rounded-md border text-[10px] font-black ${
                                    SS[cell.status] || 'border-slate-200 bg-slate-50 text-slate-300'
                                  }`}
                                >
                                  {STATUS_LETTER[cell.status] || '-'}
                                </span>
                              </td>
                            ))}
                            <td className="px-2 py-1.5 text-center font-bold text-emerald-600">{row.ringkas.counts.Hadir}</td>
                            <td className="px-2 py-1.5 text-center font-bold text-orange-600">{row.ringkas.counts.Terlambat}</td>
                            <td className="px-2 py-1.5 text-center font-bold text-slate-500">{row.ringkas.counts.Pulang}</td>
                            <td className="px-2 py-1.5 text-center font-bold text-sky-600">{row.ringkas.counts.Izin}</td>
                            <td className="px-2 py-1.5 text-center font-bold text-purple-600">{row.ringkas.counts.Sakit}</td>
                            <td className="px-2 py-1.5 text-center font-bold text-red-600">{row.ringkas.counts.Absen}</td>
                            <td className="px-2 py-1.5 text-center font-black text-text-main">{row.ringkas.persen}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-2 p-2.5 xl:hidden">
                    {matriks.map((row) => (
                      <button
                        key={row.id}
                        onClick={() => setDetail(row)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left transition-all duration-200 active:scale-[0.99]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-black text-text-main">{row.nama}</div>
                            <div className="truncate text-[10px] text-slate-500">{row.kelas_nama}</div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-sm font-black text-text-main">{row.ringkas.persen}%</div>
                            <div className="text-[10px] text-slate-500">{row.ringkas.hari} hari</div>
                          </div>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{ width: `${Math.min(100, row.ringkas.persen)}%` }}
                            />
                          </div>
                          <div className="flex shrink-0 gap-1">
                            {RINGKAS_ORDER.map((s) => (
                              <span
                                key={s}
                                title={`${STATUS_LABEL[s]}: ${row.ringkas.counts[s] || 0}`}
                                className={`rounded-md border px-1 text-[10px] font-black ${SS[s]}`}
                              >
                                {STATUS_LETTER[s]}
                                {row.ringkas.counts[s] || 0}
                              </span>
                            ))}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {detail && (
        <Modal
          title={detail.nama}
          onClose={() => setDetail(null)}
          maxWidth="max-w-2xl"
          footer={tombolEkspor({ id: detail.id, nama: detail.nama })}
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-bold text-slate-600">{detail.kelas_nama}</span>
              <span>{monthLabel(bulan)}</span>
              <span>{detail.ringkas.hari} hari sekolah</span>
              <span className="font-black text-text-main">{detail.ringkas.persen}% kehadiran</span>
            </div>
            <p className="text-[11px] text-slate-400">
              PDF berisi rincian harian dan ringkasan bulan ini, siap dibagikan ke orang tua. CSV untuk diolah lagi di
              Excel.
            </p>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {detail.cells.map((cell) => (
                <div
                  key={cell.iso}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5"
                >
                  <span className="text-[11px] font-bold text-slate-500">{cell.iso}</span>
                  <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${SS[cell.status] || 'border-slate-200 bg-slate-50 text-slate-400'}`}>
                    <span className="font-black">{STATUS_LETTER[cell.status] || '-'}</span>
                    {cell.status}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[...RINGKAS_ORDER, 'Menunggu', 'Belum'].map((s) => (
                <span key={s} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                  {STATUS_LABEL[s] || s}: {detail.ringkas.counts[s] || 0}
                </span>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
