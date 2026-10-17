// Portal Wali (redesign): hero anak, tab catatan/kehadiran/tagihan/laporan,
// dan sheet kabar. Semua data tetap berasal dari API utama SIAGA; scope wali
// (anak yang terhubung) dijaga oleh backend.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { CalendarDays, FileText, Receipt } from 'lucide-react';
import HeroAnak from './wali/HeroAnak.jsx';
import HariIni from './wali/HariIni.jsx';
import CatatanTimeline from './wali/CatatanTimeline.jsx';
import Kehadiran from './wali/Kehadiran.jsx';
import Tagihan from './wali/Tagihan.jsx';
import Laporan from './wali/Laporan.jsx';
import { SegmentedTabs, Sheet } from './wali/ui.jsx';
import {
  bulanIni,
  jumlahBelumDibaca,
  namaPanggilan,
  petaBulan,
  ringkasAnak,
  ringkasTagihan,
  sapaanSekarang,
  statusHariIni,
  tautanKabar
} from './wali/portalHelpers.js';

const TABS = [
  { id: 'catatan', label: 'Catatan', icon: FileText },
  { id: 'kehadiran', label: 'Kehadiran', icon: CalendarDays },
  { id: 'tagihan', label: 'Tagihan', icon: Receipt },
  { id: 'laporan', label: 'Laporan', icon: FileText }
];

export default function WaliView({ user, toast }) {
  const [siswa, setSiswa] = useState([]);
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLimit, setHistoryLimit] = useState(30);
  const [historyHabis, setHistoryHabis] = useState(false);
  const [memuatLagi, setMemuatLagi] = useState(false);
  const [detail, setDetail] = useState(null);
  const [comment, setComment] = useState('');
  const [mengirim, setMengirim] = useState(false);
  const [notif, setNotif] = useState([]);
  const [activeTab, setActiveTab] = useState('catatan');
  const [billing, setBilling] = useState(null);
  const [loadingBilling, setLoadingBilling] = useState(false);
  const [rekap, setRekap] = useState(null);
  const [bulan, setBulan] = useState(bulanIni());
  const [loadingRekap, setLoadingRekap] = useState(false);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState(null);
  const [kabarOpen, setKabarOpen] = useState(false);

  const sapaan = useMemo(() => sapaanSekarang(), []);

  async function loadChildren() {
    try {
      const s = await api.waliChildren();
      setSiswa(s || []);
      if (!selected && s?.length) setSelected(s[0]);
    } catch (e) {
      setGalat(e.message);
      toast?.('err', e.message);
    } finally {
      setMemuat(false);
    }
  }

  useEffect(() => {
    loadChildren();
    api
      .notifikasi()
      .then((n) => setNotif(n || []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadBilling = useCallback(
    async (siswaId) => {
      if (!siswaId) return;
      setLoadingBilling(true);
      try {
        const data = await api.waliBilling(siswaId);
        setBilling(data);
      } catch (e) {
        toast?.('err', e.message);
      } finally {
        setLoadingBilling(false);
      }
    },
    [toast]
  );

  const loadRekap = useCallback(
    async (b) => {
      const [y, m] = String(b).split('-');
      setLoadingRekap(true);
      try {
        const data = await api.rekapBulanan({ tahun: y, bulan: m });
        setRekap(data);
      } catch (e) {
        toast?.('err', e.message);
      } finally {
        setLoadingRekap(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    if (!selected) return;
    setDetail(null);
    setComment('');
    setHistoryLimit(30);
    setHistoryHabis(false);
    api
      .dailyHistory(selected.id, 30)
      .then((h) => {
        setHistory(h || []);
        setHistoryHabis((h || []).length < 30);
      })
      .catch((e) => toast?.('err', e.message));
    loadBilling(selected.id);
    loadRekap(bulan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  // Muat catatan lebih lama: endpoint memakai `limit` (maks 120), jadi tambah
  // 30 per klik. Kalau hasilnya kurang dari limit, berarti sudah habis.
  async function muatCatatanLagi() {
    if (!selected || memuatLagi) return;
    const berikut = Math.min(historyLimit + 30, 120);
    setMemuatLagi(true);
    try {
      const h = await api.dailyHistory(selected.id, berikut);
      setHistory(h || []);
      setHistoryLimit(berikut);
      setHistoryHabis((h || []).length < berikut);
    } catch (e) {
      toast?.('err', e.message);
    } finally {
      setMemuatLagi(false);
    }
  }

  const bisaMuatLagi = !historyHabis && historyLimit < 120 && history.length >= historyLimit;

  useEffect(() => {
    loadRekap(bulan);
  }, [bulan, loadRekap]);

  async function open(id) {
    try {
      const d = await api.dailyDetail(id);
      setDetail(d);
      setComment('');
      if (d?.read === null) {
        api
          .notifikasi()
          .then((n) => setNotif(n || []))
          .catch(() => {});
      }
    } catch (e) {
      toast?.('err', e.message);
    }
  }

  async function send() {
    if (!detail?.id || !comment.trim()) return;
    setMengirim(true);
    try {
      await api.commentDaily(detail.id, comment);
      setComment('');
      const d = await api.dailyDetail(detail.id);
      setDetail(d);
      toast?.('ok', 'Tanggapan terkirim');
    } catch (e) {
      toast?.('err', e.message);
    } finally {
      setMengirim(false);
    }
  }

  async function markRead(id) {
    try {
      await api.readNotif(id);
      setNotif((n) => n.map((x) => (x.id === id ? { ...x, read_at: new Date().toISOString() } : x)));
    } catch {}
  }

  function openFromNotif(n) {
    const tautan = tautanKabar(n);
    if (!tautan) return;
    markRead(n.id);
    setKabarOpen(false);
    setActiveTab(tautan.tab);
    if (tautan.laporanId) open(tautan.laporanId);
    if (tautan.siswaId && siswa.some((s) => String(s.id) === String(tautan.siswaId))) {
      const s = siswa.find((s) => String(s.id) === String(tautan.siswaId));
      if (s) setSelected(s);
    }
  }

  const unread = jumlahBelumDibaca(notif);
  const ringkas = useMemo(() => ringkasAnak(rekap, selected?.id), [rekap, selected?.id]);
  const hariIni = useMemo(() => statusHariIni(rekap, selected?.id), [rekap, selected?.id]);
  const peta = useMemo(() => petaBulan(rekap, selected?.id), [rekap, selected?.id]);
  const ringkasTag = ringkasTagihan(billing?.tagihan || []);

  const catatanHariIni = useMemo(() => {
    const wib = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
    if (detail && detail.tanggal === wib) return detail;
    return null;
  }, [detail]);

  const catatanTerakhir = useMemo(() => {
    if (!history.length) return null;
    return [...history].sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)))[0];
  }, [history]);

  const tabs = useMemo(
    () =>
      TABS.map((t) => ({
        ...t,
        badge:
          t.id === 'tagihan' && ringkasTag.jumlahBelum > 0
            ? ringkasTag.jumlahBelum
            : t.id === 'catatan' && unread > 0
            ? unread
            : undefined
      })),
    [ringkasTag.jumlahBelum, unread]
  );

  if (memuat) {
    return (
      <div className="w-full max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
        <div className="h-40 animate-pulse rounded-3xl bg-slate-200/70" />
        <div className="h-24 animate-pulse rounded-2xl bg-slate-200/70" />
      </div>
    );
  }

  if (galat && !siswa.length) {
    return (
      <div className="w-full max-w-6xl mx-auto p-4 sm:p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-black text-red-700">{galat}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(70%_100%_at_50%_0%,rgba(245,158,11,.12),transparent_72%)]"
      />
      <div className="relative mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
        <HeroAnak
        user={user}
        siswa={siswa}
        selected={selected}
        rekap={rekap}
        ringkas={ringkas}
        statusHariIni={hariIni}
        sapaan={sapaan}
        unread={unread}
        onSelect={setSelected}
        onOpenKabar={() => setKabarOpen(true)}
        muatKehadiran={loadingRekap}
        peta={peta}
        tagihanRingkas={ringkasTag}
        catatanTerakhir={catatanTerakhir}
      />

      <SegmentedTabs tabs={tabs} value={activeTab} onChange={setActiveTab} ariaLabel="Bagian portal wali" />

      {activeTab === 'catatan' ? (
        <div className="space-y-4">
          <HariIni
            siswa={selected}
            hariIni={hariIni}
            todayInfo={null}
            catatanHariIni={catatanHariIni}
            memuat={loadingRekap && !rekap}
            galat={null}
            onMuatUlang={() => loadRekap(bulan)}
            komentar={comment}
            setKomentar={setComment}
            onKirimKomentar={send}
            mengirim={mengirim}
          />
          <CatatanTimeline
            riwayat={history}
            detail={detail}
            pratinjau={catatanTerakhir}
            memuat={false}
            galat={null}
            onMuatUlang={() => {
              if (selected) api.dailyHistory(selected.id, historyLimit).then(setHistory).catch(() => {});
            }}
            onBuka={(r) => open(r.id)}
            onTutupDetail={() => setDetail(null)}
            komentar={comment}
            setKomentar={setComment}
            onKirimKomentar={send}
            mengirim={mengirim}
            onMuatLagi={muatCatatanLagi}
            bisaMuatLagi={bisaMuatLagi}
            memuatLagi={memuatLagi}
          />
        </div>
      ) : null}

      {activeTab === 'kehadiran' ? (
        <Kehadiran
          siswa={selected}
          rekap={rekap}
          bulan={bulan}
          onGantiBulan={setBulan}
          memuat={loadingRekap}
          galat={null}
          onMuatUlang={() => loadRekap(bulan)}
          onBukaLaporan={() => setActiveTab('laporan')}
        />
      ) : null}

      {activeTab === 'tagihan' ? (
        <Tagihan
          siswa={selected}
          billing={billing}
          memuat={loadingBilling}
          galat={null}
          onMuatUlang={() => selected && loadBilling(selected.id)}
          toast={toast}
        />
      ) : null}

      {activeTab === 'laporan' ? (
        <Laporan
          siswa={selected}
          bulan={bulan}
          onGantiBulan={setBulan}
          rekap={rekap}
          memuat={loadingRekap}
          toast={toast}
        />
      ) : null}

      <Sheet
        open={kabarOpen}
        onClose={() => setKabarOpen(false)}
        title="Kabar terbaru"
        subtitle={selected ? `Untuk ${namaPanggilan(selected)}` : 'Notifikasi keluarga'}
      >
        {notif.length === 0 ? (
          <div className="py-8 text-center text-xs font-semibold text-slate-400">Belum ada kabar.</div>
        ) : (
          <ul className="space-y-2">
            {notif.slice(0, 30).map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => openFromNotif(n)}
                  className={`w-full rounded-2xl border p-3 text-left transition-colors duration-200 ${
                    n.read_at ? 'border-slate-200 bg-slate-50 hover:bg-slate-100' : 'border-primary/20 bg-primary-container hover:border-primary/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-black text-text-main">{n.title}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{n.body || n.tipe}</div>
                    </div>
                    {!n.read_at ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" /> : null}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        </Sheet>
      </div>
    </div>
  );
}
