import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import {
  ActionButton,
  Chip,
  CustomSelect,
  CustomDatePicker,
  LiveClock,
  Modal,
  Spinner,
  meniTunggu
} from '../components/Shared';
import { todayWIB } from '../utils/date';
import RekapAbsensiBulanan from './shared/RekapAbsensiBulanan';
import { ChevronRight, DoorClosed, Plus, Save, X } from 'lucide-react';
const TABS = [
  { id: 'monitoring', label: 'Monitoring' },
  { id: 'laporan', label: 'Laporan' },
  { id: 'rekap', label: 'Rekap Absensi' },
  { id: 'keuangan', label: 'Keuangan' },
  { id: 'notifikasi', label: 'Notifikasi' }
];

export default function KepsekView({ user, toast, tab, syncNotif }) {
  const activeTab = TABS.some((t) => t.id === tab) ? tab : 'monitoring';
  const [tanggal, setTanggal] = useState(todayWIB());
  const [cabang, setCabang] = useState([]);
  const [cabangId, setCabangId] = useState(user.role === 'admin' ? '' : user.cabang_id);
  const [rows, setRows] = useState([]);
  const [lapMeta, setLapMeta] = useState({ tanggal: null, is_school_day: null });
  const [notif, setNotif] = useState([]);
  const [laporan, setLaporan] = useState(null);
  const [monitoring, setMonitoring] = useState(null);
  const [loadingMonitoring, setLoadingMonitoring] = useState(true);
  const [earlyReleases, setEarlyReleases] = useState([]);
  const [dayClose, setDayClose] = useState(null);
  const [earlyOpen, setEarlyOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [earlyForm, setEarlyForm] = useState({ siswa_id: '', alasan: '' });
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    api
      .cabang()
      .then(setCabang)
      .catch(() => {});
  }, []);

  async function loadSummary() {
    const [data, notifData, laporanData] = await Promise.all([
      api.dailyToday({ tanggal, cabang_id: cabangId }),
      api.notifikasi(),
      user.role === 'admin' || cabangId ? api.laporan({ cabang_id: cabangId }).catch(() => null) : Promise.resolve(null)
    ]);
    setRows(data.rows || data);
    setLapMeta({ tanggal: data.tanggal || tanggal, is_school_day: data.is_school_day });
    setNotif(notifData);
    setLaporan(laporanData);
  }
  async function loadMonitoring() {
    setLoadingMonitoring(true);
    try {
      const params = { cabang_id: cabangId };
      const [monData, erData, closeData] = await Promise.all([
        api.dashboard(params),
        api.earlyRelease(params).catch(() => null),
        api.tutupHariStatus(params).catch(() => null)
      ]);
      setMonitoring(monData);
      setEarlyReleases(monData.earlyReleases || (Array.isArray(erData) ? erData : erData?.rows || []));
      setDayClose(monData.dayCloseStatus || closeData || null);
    } finally {
      setLoadingMonitoring(false);
    }
  }
  async function createEarlyRelease() {
    if (!earlyForm.siswa_id || !earlyForm.alasan.trim()) {
      toast('err', 'Siswa dan alasan wajib diisi');
      return;
    }
    setActionBusy(true);
    try {
      await api.createEarlyRelease({
        siswa_id: earlyForm.siswa_id,
        tanggal: todayWIB(),
        alasan: earlyForm.alasan.trim()
      });
      toast('ok', 'Izin pulang dini dibuat');
      setEarlyOpen(false);
      setEarlyForm({ siswa_id: '', alasan: '' });
      await loadMonitoring();
    } catch (e) {
      toast('err', e.message);
    } finally {
      setActionBusy(false);
    }
  }
  async function closeDay() {
    if (user.role === 'admin' && !cabangId) {
      toast('err', 'Pilih cabang sebelum tutup hari');
      return;
    }
    setActionBusy(true);
    try {
      await api.tutupHari({ tanggal: todayWIB(), cabang_id: cabangId });
      toast('ok', 'Hari operasional ditutup');
      setCloseOpen(false);
      await Promise.all([loadMonitoring(), loadSummary()]);
    } catch (e) {
      toast('err', e.message);
    } finally {
      setActionBusy(false);
    }
  }

  useEffect(() => {
    loadSummary().catch((e) => toast('err', e.message));
  }, [tanggal, cabangId]);
  useEffect(() => {
    if (activeTab !== 'monitoring') return;
    loadMonitoring().catch((e) => toast('err', e.message));
    const eventSource = new EventSource('/api/absensi/stream');
    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'absensi_changed') {
          loadMonitoring().catch(() => {});
        }
      } catch {}
    };
    return () => eventSource.close();
  }, [activeTab, cabangId]);

  const stat = useMemo(
    () => ({
      total: rows.length,
      published: rows.filter((r) => r.laporan_status === 'published').length,
      draft: rows.filter((r) => r.laporan_status === 'draft').length
    }),
    [rows]
  );

  const showTopControls = activeTab !== 'monitoring' && activeTab !== 'rekap' && (user.role === 'admin' || activeTab === 'laporan');

  return (
    <div className="w-full p-3 sm:p-4 lg:p-6 2xl:p-8 space-y-4">
      {showTopControls && (
        <div className="flex justify-end">
          <div className="grid w-full grid-cols-2 gap-2 sm:w-auto">
            {user.role === 'admin' && (
              <CustomSelect
                value={cabangId}
                onChange={(e) => setCabangId(e.target.value)}
                className="input h-10 min-w-0"
              >
                <option value="">Semua cabang</option>
                {cabang.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nama}
                  </option>
                ))}
              </CustomSelect>
            )}
            {activeTab === 'laporan' && (
              <CustomDatePicker value={tanggal} onChange={setTanggal} className="input h-10 min-w-0" />
            )}
          </div>
        </div>
      )}

      {activeTab === 'monitoring' && (
        <MonitoringPanel
          data={monitoring}
          loading={loadingMonitoring}
          earlyReleases={earlyReleases}
          dayClose={dayClose}
          canCloseDay={user.role !== 'admin' || !!cabangId}
          cabang={cabang}
          cabangId={cabangId}
          isAdmin={user.role === 'admin'}
          onCabangChange={setCabangId}
          onOpenEarly={() => setEarlyOpen(true)}
          onOpenClose={() => setCloseOpen(true)}
          onDeleteER={async (id) => {
            try {
              await api.deleteEarlyRelease(id);
              toast('ok', 'Izin pulang dini dihapus');
              loadMonitoring();
            } catch (e) {
              toast('err', e.message);
            }
          }}
          toast={toast}
        />
      )}
      {activeTab === 'laporan' && <LaporanPanel rows={rows} stat={stat} meta={lapMeta} />}
      {activeTab === 'rekap' && <RekapAbsensiBulanan user={user} toast={toast} />}
      {activeTab === 'keuangan' && <KeuanganPanel laporan={laporan} cabangId={cabangId} />}
      {activeTab === 'notifikasi' && <NotifikasiPanel notif={notif} syncNotif={syncNotif} />}
      {earlyOpen && (
        <Modal title="Buat Izin Pulang Dini" onClose={() => setEarlyOpen(false)} maxWidth="max-w-lg">
          <div className="space-y-3">
            <div>
              <div className="label">Siswa</div>
              <CustomSelect
                value={earlyForm.siswa_id}
                onChange={(e) => setEarlyForm((f) => ({ ...f, siswa_id: e.target.value }))}
                className="input w-full"
              >
                <option value="">Pilih siswa</option>
                {rows.map((r) => (
                  <option key={r.siswa_id} value={r.siswa_id}>
                    {r.nama} - {r.rombel_nama} - {r.cabang_nama}
                  </option>
                ))}
              </CustomSelect>
            </div>
            <div>
              <div className="label">Tanggal</div>
              <input value={todayWIB()} readOnly className="input w-full bg-slate-50 text-slate-500" />
            </div>
            <div>
              <div className="label">Alasan</div>
              <textarea
                value={earlyForm.alasan}
                onChange={(e) => setEarlyForm((f) => ({ ...f, alasan: e.target.value }))}
                className="input w-full min-h-24 resize-none"
                placeholder="Contoh: kontrol dokter, acara keluarga, dijemput lebih awal"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <ActionButton icon={Save} onClick={createEarlyRelease} disabled={actionBusy} className="w-full sm:w-auto">
                {actionBusy ? 'Menyimpan…' : 'Simpan Izin'}
              </ActionButton>
              <ActionButton icon={X} onClick={() => setEarlyOpen(false)} variant="ghost" className="w-full sm:w-auto">
                Batal
              </ActionButton>
            </div>
          </div>
        </Modal>
      )}
      {closeOpen && (
        <Modal title="Tutup Hari Operasional" onClose={() => setCloseOpen(false)} maxWidth="max-w-lg">
          <div className="space-y-4">
            <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
              Siswa yang masih berstatus Belum akan otomatis menjadi Absen. Setelah ditutup, check-in dan perubahan
              keterangan untuk hari ini tidak bisa dilakukan.
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs font-black text-slate-400">Tanggal</div>
                <div className="font-black text-text-main">{todayWIB()}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs font-black text-slate-400">Status</div>
                <div className="font-black text-text-main">{dayClose?.closed ? 'Sudah ditutup' : 'Belum ditutup'}</div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <ActionButton
                icon={DoorClosed}
                onClick={closeDay}
                disabled={actionBusy || dayClose?.closed}
                variant="danger"
                className="w-full sm:w-auto"
              >
                {actionBusy ? 'Menutup…' : 'Tutup Hari'}
              </ActionButton>
              <ActionButton icon={X} onClick={() => setCloseOpen(false)} variant="ghost" className="w-full sm:w-auto">
                Batal
              </ActionButton>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function MonitoringPanel({
  data,
  loading,
  earlyReleases = [],
  dayClose,
  cabang = [],
  cabangId = '',
  isAdmin = false,
  onCabangChange,
  onOpenEarly,
  onOpenClose,
  canCloseDay,
  onDeleteER,
  toast
}) {
  const [detailTab, setDetailTab] = useState('kelas');
  if (loading && !data)
    return (
      <section className="bg-white border border-slate-200 rounded-2xl p-4">
        <Spinner />
      </section>
    );
  const byKelas = data?.byKelas || [];
  const siswaAktif = data?.siswaAktif || [];
  const statusRows = data?.statusRows?.length ? data.statusRows : siswaAktif;
  const totalSiswa = byKelas.reduce((s, k) => s + Number(k.total || 0), 0);
  const checkedIn = statusRows.filter((s) => ['Hadir', 'Terlambat', 'Menunggu', 'Pulang'].includes(s.status));
  const atSchool = statusRows.filter((s) => ['Hadir', 'Terlambat', 'Menunggu'].includes(s.status));
  const redFlags = statusRows.filter((s) => s.status === 'Menunggu' && meniTunggu(s.jam_tunggu) > 15);
  const waiting = statusRows.filter((s) => s.status === 'Menunggu' && meniTunggu(s.jam_tunggu) <= 15);
  const sc = data?.statusCounts || {};
  const pct = totalSiswa ? Math.round((checkedIn.length / totalSiswa) * 100) : 0;
  const tidakMasuk = (sc.izin || 0) + (sc.sakit || 0) + (sc.absen || 0);
  const tabs = [
    { id: 'kelas', label: 'Per Kelas' },
    { id: 'status', label: 'Per Status' },
    { id: 'dini', label: `Pulang Dini (${earlyReleases.length})` }
  ];
  // Mode admin pusat bisa memuat banyak cabang: kelompokkan rombel per cabang
  // agar nama kelas kembar antar cabang tetap bisa dibedakan.
  const cabangGroups = new Map();
  for (const k of byKelas) {
    const key = k.cabang || 'Tanpa cabang';
    if (!cabangGroups.has(key)) cabangGroups.set(key, []);
    cabangGroups.get(key).push(k);
  }
  const kelasGroups = [...cabangGroups.entries()].map(([cabang, rows]) => ({ cabang, rows }));
  const showCabangHeader = kelasGroups.length > 1;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-black leading-tight text-text-main">Monitoring Hari Ini</h2>
          <p className="text-[11px] sm:text-xs text-slate-500">
            {data?.hari_status?.nama || 'Status hari'} &middot; refresh 30 detik &middot;{' '}
            {dayClose?.closed ? 'hari sudah ditutup' : 'hari masih berjalan'}
          </p>
          {!canCloseDay && <p className="text-[11px] font-bold text-amber-600 mt-0.5">Pilih cabang dulu untuk menutup hari.</p>}
        </div>
        <div className="text-right flex-shrink-0">
          <LiveClock className="text-base sm:text-lg font-black tabular-nums text-text-main leading-none" />
          <div className="text-[10px] text-slate-400 mt-0.5">
            {new Date().toLocaleDateString('id-ID', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              year: 'numeric'
            })}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {isAdmin && (
          <CustomSelect
            value={cabangId}
            onChange={(e) => onCabangChange?.(e.target.value)}
            className="input h-9 w-full sm:w-auto"
          >
            <option value="">Semua cabang</option>
            {cabang.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nama}
              </option>
            ))}
          </CustomSelect>
        )}
        <ActionButton icon={Plus} onClick={onOpenEarly} className="flex-1 sm:flex-none">
          Izin Pulang Dini
        </ActionButton>
        <ActionButton
          icon={DoorClosed}
          onClick={onOpenClose}
          disabled={!canCloseDay || dayClose?.closed}
          variant={dayClose?.closed ? 'ghost' : 'secondary'}
          className="flex-1 sm:flex-none"
        >
          {dayClose?.closed ? 'Sudah Ditutup' : 'Tutup Hari'}
        </ActionButton>
      </div>

      {data?.libur && (
        <div className="rounded-xl border border-red-300 bg-red-50 text-red-700 px-3 py-2 text-xs sm:text-sm font-bold">
          Hari ini libur. Aktivitas siswa aktif tidak ditampilkan.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[330px_minmax(0,1fr)] gap-3 items-start">
        <aside className="min-w-0">
          <div className="space-y-3 lg:sticky lg:top-3">
            <CheckinCard
              pct={pct}
              checkedIn={checkedIn.length}
              totalSiswa={totalSiswa}
              atSchool={atSchool.length}
              waiting={waiting.length + redFlags.length}
              redFlags={redFlags.length}
              belum={sc.belum || 0}
              pulang={sc.pulang || 0}
              tidakMasuk={tidakMasuk}
            />
            <AttentionList redFlags={redFlags} waiting={waiting} />
          </div>
        </aside>

        <section className="min-w-0 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-[0_18px_60px_rgba(15,23,42,.05)]">
          <div className="flex border-b border-slate-100 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setDetailTab(t.id)}
                aria-pressed={detailTab === t.id}
                className={`flex-1 min-w-[110px] px-3 py-2.5 text-xs font-black whitespace-nowrap transition ${
                  detailTab === t.id
                    ? 'text-primary border-b-2 border-primary bg-primary/5'
                    : 'text-slate-500 hover:text-text-main hover:bg-slate-50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="p-3">
            {detailTab === 'kelas' && (
              <div className="space-y-2">
                {kelasGroups.map((g) => (
                  <div
                    key={g.cabang}
                    className="rounded-xl border border-slate-100 overflow-hidden"
                  >
                    {showCabangHeader && (
                      <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-slate-50 border-b border-slate-100">
                        <span className="text-[10px] font-black uppercase tracking-[.08em] text-slate-500 truncate">
                          {g.cabang}
                        </span>
                        <span className="text-[10px] font-black text-slate-400 tabular-nums shrink-0">
                          {g.rows.length} rombel
                        </span>
                      </div>
                    )}
                    <div className="divide-y divide-slate-100">
                      {g.rows.map((k) => (
                        <ClassRow
                          key={k.id}
                          item={k}
                          siswa={siswaAktif.filter((s) => Number(s.rombel_id) === Number(k.id))}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                {byKelas.length === 0 && (
                  <div className="rounded-xl border border-slate-100 p-8 text-center text-sm font-bold text-slate-400">
                    Belum ada rombel aktif untuk ditampilkan.
                  </div>
                )}
              </div>
            )}
            {detailTab === 'status' && <StatusBoard rows={statusRows} compact />}
            {detailTab === 'dini' && (
              <div className="space-y-2">
                {earlyReleases.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">
                    Belum ada izin pulang dini.
                  </div>
                )}
                {earlyReleases.map((er) => (
                  <div
                    key={er.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-violet-50 border border-violet-200"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-black text-text-main truncate">
                        {er.siswa_nama || er.nama || `Siswa #${er.siswa_id}`}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {er.cabang_nama ? `${er.cabang_nama} - ` : ''}
                        {er.kelas_nama || er.rombel_nama || ''}
                        {er.alasan ? ` - ${er.alasan}` : ''}
                      </div>
                    </div>
                    {onDeleteER && (
                      <button
                        onClick={() => onDeleteER(er.id)}
                        className="text-xs text-red-500 hover:text-red-700 font-bold flex-shrink-0 px-2 py-1 rounded hover:bg-red-50"
                        title="Hapus izin"
                      >
                        Hapus
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function CheckinCard({ pct, checkedIn, totalSiswa, atSchool, waiting, redFlags, belum, pulang, tidakMasuk }) {
  const rows = [
    { label: 'Di sekolah', value: atSchool, c: 'bg-emerald-500' },
    { label: 'Menunggu jemput', value: waiting, c: 'bg-sky-500' },
    { label: 'Red flag > 15 mnt', value: redFlags, c: 'bg-red-500', alert: redFlags > 0 },
    { label: 'Belum check-in', value: belum, c: 'bg-slate-400' },
    { label: 'Sudah pulang', value: pulang, c: 'bg-slate-300' },
    { label: 'Izin / Sakit / Absen', value: tidakMasuk, c: 'bg-violet-500' }
  ];
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-[0_18px_60px_rgba(15,23,42,.05)]">
      <div className="text-[10px] font-black uppercase tracking-[.09em] text-slate-400">Check-in hari ini</div>
      <div className="mt-1 text-5xl font-black tracking-tight leading-none text-text-main">
        {pct}
        <span className="text-2xl text-slate-400">%</span>
      </div>
      <div className="text-[13px] text-slate-500 mt-1.5">
        {checkedIn} dari {totalSiswa} siswa sudah tercatat masuk.
      </div>
      <div className="mt-3 h-2.5 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full bg-primary rounded-full" style={{ width: pct + '%' }} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 sm:grid-cols-1 sm:gap-x-0">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-center gap-2.5 py-[7px] border-t border-slate-100 [&:nth-child(-n+2)]:border-t-0 sm:border-t sm:[&:nth-child(-n+2)]:border-t"
          >
            <span className={`w-2 h-2 rounded-[3px] flex-shrink-0 ${r.c}`} />
            <span className={`text-[12px] sm:text-[13px] font-semibold truncate ${r.alert ? 'text-red-600' : 'text-slate-600'}`}>
              {r.label}
            </span>
            <span
              className={`ml-auto text-sm sm:text-base font-black tabular-nums flex-shrink-0 ${r.alert ? 'text-red-600' : 'text-text-main'}`}
            >
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AttentionList({ redFlags, waiting }) {
  if (redFlags.length === 0 && waiting.length === 0) return null;
  const renderItem = (s, isRed) => {
    const menit = meniTunggu(s.jam_tunggu);
    return (
      <div
        key={s.id}
        className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 ${
          isRed ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
        }`}
      >
        {s.foto ? (
          <img
            src={s.foto}
            alt={s.nama}
            className="w-7 h-7 rounded-full object-cover flex-shrink-0"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div
            className={`w-7 h-7 rounded-full grid place-items-center font-black text-xs flex-shrink-0 ${
              isRed ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'
            }`}
          >
            {s.nama?.[0] || 'S'}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-black text-text-main truncate">{s.nama}</div>
          <div className="text-[10px] text-slate-500 truncate">
            {s.kelas}
            {s.nama_penjemput ? ` \u00b7 ${s.nama_penjemput}` : ''}
          </div>
        </div>
        <span className={`text-xs font-black tabular-nums flex-shrink-0 ${isRed ? 'text-red-600' : 'text-amber-600'}`}>
          {menit}m
        </span>
      </div>
    );
  };
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-[0_18px_60px_rgba(15,23,42,.05)]">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-[10px] font-black uppercase tracking-[.09em] text-slate-400">Perlu perhatian</div>
        {redFlags.length > 0 && (
          <span className="text-[10px] font-black text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
            {redFlags.length} red flag
          </span>
        )}
        {waiting.length > 0 && (
          <span className="text-[10px] font-black text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
            {waiting.length} tunggu
          </span>
        )}
      </div>
      <div className="mt-2 space-y-1.5">
        {redFlags.map((s) => renderItem(s, true))}
        {waiting.map((s) => renderItem(s, false))}
      </div>
    </div>
  );
}

function ClassRow({ item, siswa }) {
  const [open, setOpen] = useState(false);
  const total = Number(item.total || 0);
  const h = Number(item.hadir || 0),
    w = Number(item.menunggu || 0),
    p = Number(item.pulang || 0);
  const belum = Math.max(total - h - w - p, 0);
  const checkin = h + w + p;
  const seg = (n) => (total ? (n / total) * 100 : 0) + '%';
  return (
    <div className={open ? 'bg-slate-50/60' : ''}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition"
      >
        <ChevronRight
          size={14}
          className={`text-slate-400 flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <span className="text-sm font-black text-text-main min-w-[62px] shrink-0">{item.kelas}</span>
        <span className="text-xs text-slate-500 min-w-[72px] truncate hidden sm:block">{item.guru || '-'}</span>
        <span className="flex-1 hidden sm:flex h-2 rounded-full bg-slate-100 overflow-hidden min-w-[80px]">
          <span className="block h-full bg-emerald-500" style={{ width: seg(h) }} />
          <span className="block h-full bg-sky-500" style={{ width: seg(w) }} />
          <span className="block h-full bg-slate-300" style={{ width: seg(p) }} />
          <span className="block h-full bg-slate-200" style={{ width: seg(belum) }} />
        </span>
        <span className="hidden xl:flex gap-3 text-[11px] font-bold text-slate-500 tabular-nums shrink-0">
          <span>
            Hadir <b className="text-text-main">{h}</b>
          </span>
          <span>
            Tunggu <b className="text-text-main">{w}</b>
          </span>
          <span>
            Belum <b className="text-text-main">{belum}</b>
          </span>
        </span>
        <span className="ml-auto text-xs font-black tabular-nums text-text-main shrink-0">
          {checkin} <span className="text-slate-400 font-bold">/ {total}</span>
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-1.5">
          {siswa.length === 0 && (
            <div className="text-xs font-bold text-slate-400 py-2">Tidak ada siswa aktif di kelas ini.</div>
          )}
          {siswa.map((s) => {
            const menit = meniTunggu(s.jam_tunggu);
            const red = s.status === 'Menunggu' && menit > 15;
            const meta = [
              s.nama_penjemput,
              s.jam_masuk ? `Masuk ${s.jam_masuk}` : null,
              s.jam_tunggu ? `Tunggu ${s.jam_tunggu}` : null
            ]
              .filter(Boolean)
              .join(' - ');
            return (
              <div
                key={s.id}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${
                  red ? 'bg-red-50 border-red-200' : 'bg-white border-slate-100'
                }`}
              >
                {s.foto ? (
                  <img
                    src={s.foto}
                    alt={s.nama}
                    className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-primary-container text-primary-active grid place-items-center font-black flex-shrink-0 text-xs">
                    {s.nama?.[0] || 'S'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-black text-text-main truncate">{s.nama}</div>
                  {meta && <div className="text-[10px] text-slate-500 truncate">{meta}</div>}
                </div>
                {red ? (
                  <span className="text-xs font-black text-red-600">{menit}m</span>
                ) : (
                  <Chip status={s.status} manual={s.manual} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusBoard({ rows = [], compact = false }) {
  const groups = [
    { title: 'Di Sekolah', tone: 'border-emerald-200 bg-emerald-50', statuses: ['Hadir', 'Terlambat'] },
    { title: 'Menunggu', tone: 'border-amber-200 bg-amber-50', statuses: ['Menunggu'] },
    { title: 'Belum Check-in', tone: 'border-slate-200 bg-slate-50', statuses: ['Belum'] },
    { title: 'Tidak Masuk', tone: 'border-red-200 bg-red-50', statuses: ['Izin', 'Sakit', 'Absen'] },
    { title: 'Sudah Pulang', tone: 'border-slate-200 bg-white', statuses: ['Pulang'] }
  ].map((g) => ({ ...g, items: rows.filter((r) => g.statuses.includes(r.status)) }));
  const groupGridClass = compact
    ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2'
    : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2';
  const itemListClass = compact
    ? 'space-y-1.5 max-h-72 overflow-y-auto overscroll-contain pr-1 custom-scrollbar'
    : 'space-y-1.5 max-h-72 overflow-y-auto overscroll-contain pr-1 custom-scrollbar';
  return (
    <section className={compact ? '' : 'bg-white border border-slate-200 rounded-2xl p-3 shadow-[0_18px_60px_rgba(15,23,42,.05)]'}>
      {!compact && (
        <div className="flex items-center justify-between gap-2 mb-2">
          <div>
            <div className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-wider">Status Board</div>
            <div className="text-xs sm:text-sm font-bold text-text-main mt-0.5">
              Detail siswa per status dan jam aktivitas.
            </div>
          </div>
        </div>
      )}
      <div className={groupGridClass}>
        {groups.map((g) => (
          <div key={g.title} className={`rounded-xl border ${g.tone} p-2 min-w-0 flex flex-col`}>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="text-xs font-black text-text-main truncate">{g.title}</div>
              <div className="text-xs font-black text-slate-500 tabular-nums">{g.items.length}</div>
            </div>
            <div className={itemListClass}>
              {g.items.map((s) => (
                <StudentStatusRow key={`${g.title}-${s.id}`} item={s} />
              ))}
              {g.items.length === 0 && (
                <div className="rounded-lg border border-dashed border-white/70 bg-white/50 px-2 py-2 text-center text-[11px] font-bold text-slate-400">
                  Kosong
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function StudentStatusRow({ item }) {
  const time =
    item.status === 'Menunggu' ? item.jam_tunggu : item.status === 'Pulang' ? item.jam_pulang : item.jam_masuk;
  const note = time ? `${item.status} ${time}` : item.catatan || item.status || 'Belum';
  return (
    <div className="rounded-lg bg-white/80 border border-white/70 px-2 py-1 min-w-0">
      <div className="text-xs font-black text-text-main truncate">{item.nama}</div>
      <div className="text-[10px] text-slate-500 truncate">
        {item.kelas || item.rombel_nama || '-'} - {note}
      </div>
    </div>
  );
}

function LaporanPanel({ rows, stat, meta }) {
  const [filter, setFilter] = useState('semua');
  const belum = stat.total - stat.published;
  const terlambat = rows.filter((r) => r.is_late).length;
  const multiCabang = new Set(rows.map((r) => r.cabang_id)).size > 1;
  const pct = stat.total > 0 ? Math.min(100, (stat.published / stat.total) * 100) : 0;
  const tanggalPanjang = meta?.tanggal
    ? new Date(`${meta.tanggal}T00:00:00`).toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
    : '';
  const filterDefs = [
    { id: 'semua', label: 'Semua', count: stat.total },
    { id: 'belum', label: 'Belum', count: belum },
    { id: 'terlambat', label: 'Terlambat', count: terlambat },
    { id: 'published', label: 'Published', count: stat.published }
  ];
  const filtered = rows
    .filter((r) => {
      if (filter === 'belum') return r.laporan_status !== 'published';
      if (filter === 'terlambat') return r.is_late;
      if (filter === 'published') return r.laporan_status === 'published';
      return true;
    })
    // Belum publish dulu (yang terlambat paling utama), published di bawah.
    .sort(
      (a, b) =>
        (a.laporan_status === 'published') - (b.laporan_status === 'published') ||
        (b.is_late === true) - (a.is_late === true) ||
        String(a.nama).localeCompare(String(b.nama))
    );
  const groups =
    multiCabang &&
    Array.from(new Map(filtered.map((r) => [r.cabang_id, r.cabang_nama])).entries()).map(([id, nama]) => ({
      id,
      nama,
      items: filtered.filter((r) => r.cabang_id === id)
    }));

  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-4 shadow-[0_18px_60px_rgba(15,23,42,.05)]">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-black leading-tight text-text-main">Laporan Harian</h2>
          <p className="text-[11px] sm:text-xs text-slate-500 capitalize">
            {tanggalPanjang || 'Progress publish daily record'} &middot; {stat.total} siswa
          </p>
        </div>
        <div className="inline-flex rounded-full bg-primary-container px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-primary flex-shrink-0">
          Daily Record
        </div>
      </div>

      {meta && meta.is_school_day === false && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] sm:text-xs font-bold text-amber-700">
          Bukan hari sekolah untuk tanggal ini. Data mengikuti tanggal di pemilih tanggal di atas.
        </div>
      )}

      {stat.total === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
          <div className="text-sm font-bold text-slate-400">Belum ada data laporan.</div>
          <div className="mt-1 text-xs text-slate-400">Pilih tanggal lain atau pilih cabang.</div>
        </div>
      ) : (
        <>
          {/* Hero: persentase publish, angka pertama yang dibaca. */}
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 sm:p-4">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
              <div className="min-w-0">
                <div className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-500">
                  Sudah Published
                </div>
                <div className="mt-0.5 text-4xl sm:text-5xl font-black leading-none tabular-nums text-emerald-600">
                  {pct.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%
                </div>
                <div className="mt-1.5 text-[11px] sm:text-xs tabular-nums text-slate-500">
                  {stat.published} dari {stat.total} laporan siswa
                </div>
              </div>
              <div className="flex shrink-0 gap-4 sm:gap-5 text-right">
                <HeroStat label="Siswa" value={stat.total} />
                <HeroStat label="Published" value={stat.published} />
                <HeroStat label="Belum" value={belum} tone={belum ? 'text-red-600' : 'text-text-main'} />
              </div>
            </div>
            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] font-semibold tabular-nums">
              <span className="text-emerald-600">Published {stat.published}</span>
              <span className="text-red-600">Belum {belum}</span>
            </div>
          </div>

          {/* Filter cepat: tombol nyata (keyboard), angka = jumlah baris. */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {filterDefs.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                  filter === f.id
                    ? 'border-transparent bg-primary-container text-primary'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                }`}
              >
                {f.label} <span className="tabular-nums opacity-70">{f.count}</span>
              </button>
            ))}
          </div>

          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
            {filtered.length === 0 && (
              <div className="p-6 text-center text-sm font-bold text-slate-400">Tidak ada siswa pada filter ini.</div>
            )}
            {(groups || [{ id: 'all', nama: null, items: filtered }]).map((g) => {
              const gBelum = g.items.filter((r) => r.laporan_status !== 'published').length;
              return (
                <div key={g.id}>
                  {g.nama && (
                    <div className="flex items-baseline gap-2 border-t border-slate-100 bg-slate-50/80 px-3 py-1.5 first:border-t-0">
                      <span className="text-xs font-black text-text-main">{g.nama}</span>
                      <span className="text-[10px] font-semibold text-slate-400 tabular-nums">
                        {g.items.length} siswa{gBelum ? ` · belum ${gBelum}` : ''}
                      </span>
                    </div>
                  )}
                  {g.items.map((r) => (
                    <LaporanRow key={r.siswa_id} item={r} />
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function StatusPill({ status }) {
  const label = status === 'published' ? 'Published' : status === 'draft' ? 'Draft' : 'Belum';
  const tone =
    status === 'published'
      ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
      : status === 'draft'
        ? 'bg-amber-100 text-amber-700 border-amber-200'
        : 'bg-slate-100 text-slate-400 border-slate-200';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${tone}`}>
      {label}
    </span>
  );
}

function LaporanRow({ item }) {
  const r = item;
  return (
    <div className="flex items-center gap-3 border-t border-slate-100 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold text-text-main">{r.nama}</div>
        <div className="truncate text-[10px] sm:text-[11px] text-slate-400 capitalize">
          {[r.rombel_nama, r.paket].filter(Boolean).join(' · ') || '-'}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {r.is_late && <span className="text-[10px] font-bold text-red-600">Terlambat</span>}
        <StatusPill status={r.laporan_status} />
      </div>
    </div>
  );
}

// Label rapi untuk rincian keuangan: jenis tagihan mentah (spp/kegiatan/care)
// dan periode 'YYYY-MM' tidak layak tampil apa adanya.
const JENIS_LABEL = { spp: 'SPP', kegiatan: 'Kegiatan', care: 'Care' };
function labelKeuangan(first, value) {
  if (first === 'jenis') return JENIS_LABEL[value] || value;
  const d = new Date(`${value}-01T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });
}

function KeuanganPanel({ laporan, cabangId }) {
  if (!laporan)
    return (
      <section className="bg-white border border-slate-200 rounded-2xl p-4 shadow-[0_18px_60px_rgba(15,23,42,.05)]">
        <Spinner />
      </section>
    );
  const s = laporan.summary || {};
  const totalNominal = Number(s.total_nominal || 0);
  const totalPaid = Number(s.total_paid || 0);
  const pct = totalNominal > 0 ? Math.min(100, (totalPaid / totalNominal) * 100) : 0;
  const adaTagihan = totalNominal > 0 || (laporan.by_jenis || []).length > 0;
  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-4 shadow-[0_18px_60px_rgba(15,23,42,.05)]">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-black leading-tight text-text-main">Laporan Keuangan</h2>
          <p className="text-[11px] sm:text-xs text-slate-500">
            {cabangId ? 'Cabang terpilih' : 'Semua cabang'} &middot; {s.total_tagihan || 0} tagihan
          </p>
        </div>
        <div className="inline-flex rounded-full bg-primary-container px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-primary flex-shrink-0">
          Keuangan
        </div>
      </div>

      {!adaTagihan ? (
        <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
          <div className="text-sm font-bold text-slate-400">Belum ada tagihan.</div>
          <div className="mt-1 text-xs text-slate-400">Tagihan dibuat admin lewat menu Billing.</div>
        </div>
      ) : (
        <>
          {/* Hero: realisasi pembayaran, angka pertama yang dibaca. */}
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 sm:p-4">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
              <div className="min-w-0">
                <div className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-500">
                  Realisasi Pembayaran
                </div>
                <div className="mt-0.5 text-4xl sm:text-5xl font-black leading-none tabular-nums text-emerald-600">
                  {pct.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%
                </div>
                <div className="mt-1.5 text-[11px] sm:text-xs tabular-nums text-slate-500">
                  {money(totalPaid)} terkumpul dari {money(totalNominal)} tagihan
                </div>
              </div>
              <div className="flex shrink-0 gap-4 sm:gap-5 text-right">
                <HeroStat label="Tagihan" value={s.total_tagihan || 0} />
                <HeroStat label="Lunas" value={s.count_lunas || 0} />
                <HeroStat label="Tunggakan" value={s.count_outstanding || 0} tone="text-red-600" />
              </div>
            </div>
            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] font-semibold tabular-nums">
              <span className="text-emerald-600">Nilai lunas {money(s.total_lunas)}</span>
              <span className="text-red-600">Sisa tagihan {money(s.total_outstanding)}</span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
            <FinanceLedger title="Per Jenis" rows={laporan.by_jenis} first="jenis" />
            <FinanceLedger title="Per Periode" rows={laporan.by_periode} first="periode" />
          </div>
        </>
      )}
    </section>
  );
}

function HeroStat({ label, value, tone }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] font-black uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-lg sm:text-xl font-black leading-tight tabular-nums ${tone || 'text-text-main'}`}>{value}</div>
    </div>
  );
}

// Ledger ringkas: baris = nama + jumlah tagihan, bar progres lunas, dan angka
// total/lunas/sisa di kanan. Mobile: bar turun ke baris penuh, tanpa scroll.
function FinanceLedger({ title, rows, first }) {
  return (
    <div>
      <h3 className="font-black text-sm sm:text-base text-text-main mb-2">{title}</h3>
      <div className="overflow-hidden rounded-xl border border-slate-200">
        {rows.length === 0 && (
          <div className="p-6 text-center text-sm font-bold text-slate-400">Belum ada data.</div>
        )}
        {rows.map((r, i) => {
          const pctBar = Number(r.total) > 0 ? Math.min(100, (Number(r.lunas) / Number(r.total)) * 100) : 0;
          return (
            <div
              key={r[first]}
              className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 ${i ? 'border-t border-slate-100' : ''}`}
            >
              <div className="min-w-0 basis-[45%] sm:basis-36">
                <div className="truncate text-sm font-bold text-text-main">{labelKeuangan(first, r[first])}</div>
                <div className="text-[10px] font-semibold tabular-nums text-slate-400">{r.count} tagihan</div>
              </div>
              <div className="order-3 w-full sm:order-none sm:w-auto sm:flex-1">
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pctBar}%` }} />
                </div>
              </div>
              <div className="order-2 ml-auto shrink-0 text-right sm:order-none sm:ml-0">
                <div className="text-sm font-black tabular-nums text-text-main">{money(r.total)}</div>
                <div className="flex items-center justify-end gap-1.5 text-[10px] font-semibold tabular-nums">
                  <span className="text-emerald-600">{money(r.lunas)}</span>
                  <span className="text-slate-300">&middot;</span>
                  <span className="text-red-600">{money(r.outstanding)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Label rapi untuk tipe notifikasi mentah (notification.tipe di backend), plus
// waktu relatif sederhana untuk kolom kanan.
const TIPE_LABEL = {
  absensi_keterangan: 'Absensi',
  early_release: 'Pulang Dini',
  pickup_waiting: 'Penjemputan',
  pickup_manual: 'Penjemputan',
  daily_published: 'Daily Record',
  wali_comment: 'Feedback Wali',
  guru_reply: 'Balasan Guru',
  payment_verified: 'Pembayaran',
  invoice_issued: 'Tagihan'
};
function tipeLabel(t) {
  return TIPE_LABEL[t] || String(t || '').replace(/_/g, ' ');
}
function relTime(iso) {
  if (!iso) return '';
  const d = new Date(String(iso).includes(' ') ? String(iso).replace(' ', 'T') + 'Z' : iso);
  if (Number.isNaN(d.getTime())) return '';
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 60) return 'baru saja';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const day = Math.floor(h / 24);
  if (day < 30) return `${day} hari lalu`;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function NotifikasiPanel({ notif, syncNotif }) {
  const [filter, setFilter] = useState('semua');
  const [items, setItems] = useState(notif);
  useEffect(() => setItems(notif), [notif]);
  const unread = items.filter((n) => !n.read_at);
  const list = filter === 'belum' ? unread : items;

  // Setelah tulis read di backend, tarik ulang lalu selaraskan header App
  // (ikon lonceng) supaya angka badge tidak telat.
  async function refreshHeader() {
    try {
      const fresh = await api.notifikasi();
      setItems(fresh);
      if (syncNotif) syncNotif(fresh);
    } catch {}
  }
  async function markOne(n) {
    if (n.read_at) return;
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
    await api.readNotif(n.id).catch(() => {});
    await refreshHeader();
  }
  async function markAll() {
    setItems((prev) => prev.map((x) => (x.read_at ? x : { ...x, read_at: new Date().toISOString() })));
    await api.readAllNotif().catch(() => {});
    await refreshHeader();
  }

  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-4 shadow-[0_18px_60px_rgba(15,23,42,.05)]">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-black leading-tight text-text-main">Notifikasi</h2>
          <p className="text-[11px] sm:text-xs text-slate-500">
            {unread.length} belum dibaca &middot; {items.length} notifikasi
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {unread.length > 0 && (
            <button
              type="button"
              onClick={markAll}
              className="rounded-lg px-2 py-1 text-[11px] font-bold text-primary hover:bg-primary-container transition-colors"
            >
              Tandai dibaca semua
            </button>
          )}
          <div className="inline-flex rounded-full bg-primary-container px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-primary">
            Inbox
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {[
          { id: 'semua', label: 'Semua', count: items.length },
          { id: 'belum', label: 'Belum dibaca', count: unread.length }
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${
              filter === f.id
                ? 'border-transparent bg-primary-container text-primary'
                : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
            }`}
          >
            {f.label} <span className="tabular-nums opacity-70">{f.count}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
        {list.length === 0 ? (
          <div className="p-6 text-center text-sm font-bold text-slate-400">
            {filter === 'belum' ? 'Semua sudah dibaca.' : 'Belum ada notifikasi.'}
          </div>
        ) : (
          list.map((n) => <NotifRow key={n.id} item={n} onRead={markOne} />)
        )}
      </div>
    </section>
  );
}

function NotifRow({ item, onRead }) {
  const unread = !item.read_at;
  return (
    <button
      type="button"
      onClick={() => onRead(item)}
      title={unread ? 'Tandai dibaca' : undefined}
      className={`flex w-full items-start gap-2.5 border-t border-slate-100 px-3 py-2.5 text-left first:border-t-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
        unread ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/40'
      }`}
    >
      <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${unread ? 'bg-primary' : 'bg-slate-300'}`} />
      {!unread && <span className="sr-only">Sudah dibaca</span>}
      {unread && <span className="sr-only">Belum dibaca</span>}
      <div className="min-w-0 flex-1">
        <div className={`text-sm leading-snug ${unread ? 'font-black text-text-main' : 'font-semibold text-slate-400'}`}>
          <span className="line-clamp-2 break-words">{item.title}</span>
        </div>
        {item.body && <div className="mt-0.5 line-clamp-2 text-[11px] sm:text-xs text-slate-500">{item.body}</div>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">
          {tipeLabel(item.tipe)}
        </span>
        <span className="text-[10px] tabular-nums text-slate-400">{relTime(item.created_at)}</span>
      </div>
    </button>
  );
}

function CompactStat({ label, value }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 sm:px-3">
      <div className="truncate text-[9px] font-black uppercase tracking-wider text-slate-500 sm:text-[10px]">
        {label}
      </div>
      <div className="mt-0.5 truncate text-xl font-black tabular-nums text-text-main sm:text-2xl">{value}</div>
    </div>
  );
}
function money(v) {
  return 'Rp ' + Number(v || 0).toLocaleString('id-ID');
}
