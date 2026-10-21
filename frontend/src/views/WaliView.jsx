// Portal Wali (redesign): hero anak, tab catatan/kehadiran/tagihan/laporan,
// dan sheet kabar. Semua data tetap berasal dari API utama SIAGA; scope wali
// (anak yang terhubung) dijaga oleh backend.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { CalendarCheck2, CalendarDays, FileText, Receipt } from 'lucide-react';
import HeroAnak from './wali/HeroAnak.jsx';
import HariIni from './wali/HariIni.jsx';
import CatatanTimeline from './wali/CatatanTimeline.jsx';
import Kehadiran from './wali/Kehadiran.jsx';
import Tagihan from './wali/Tagihan.jsx';
import Laporan from './wali/Laporan.jsx';
import Izin from './wali/Izin.jsx';
import Pengumuman from './wali/Pengumuman.jsx';
import { PushCard } from './wali/PushCard.jsx';
import { KeamananCard, PinPrompt } from './wali/KeamananCard.jsx';
import { hapusPinToken } from '../utils/pin.js';
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
  { id: 'izin', label: 'Izin', icon: CalendarCheck2 },
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
  // Tab bisa datang dari URL (notifikasi push, shortcut manifest) supaya
  // orang tua langsung mendarat di bagian yang dimaksud.
  const [activeTab, setActiveTab] = useState(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    return ['catatan', 'kehadiran', 'tagihan', 'laporan'].includes(t) ? t : 'catatan';
  });
  const [billing, setBilling] = useState(null);
  // Izin/sakit: pengajuan milik anak yang sedang dipilih.
  const [daftarIzin, setDaftarIzin] = useState([]);
  const [loadingIzin, setLoadingIzin] = useState(false);
  // Apakah wali memasang PIN. Dipakai untuk TIDAK menarik data tagihan saat
  // aplikasi dibuka: kalau di-prefetch, dialog PIN langsung muncul di halaman
  // depan hanya karena orang tua membuka catatan harian anak. Data keuangan
  // baru diminta saat tab Tagihan benar-benar dibuka.
  // null = belum tahu (status PIN masih dimuat). Selama belum tahu, jangan
  // menarik data tagihan: kalau ternyata wali punya PIN, dialog akan muncul di
  // halaman depan hanya karena orang tua membuka catatan harian.
  const [waliPunyaPin, setWaliPunyaPin] = useState(null);
  // Dialog PIN muncul otomatis saat server menjawab PIN_REQUIRED (wali sudah
  // memasang PIN). Aksi asli dicoba lagi setelah PIN benar.
  const [pinDibutuhkan, setPinDibutuhkan] = useState(false);
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
    async (siswaId, denganPin = true) => {
      if (!siswaId) return;
      setLoadingBilling(true);
      try {
        const data = await api.waliBilling(siswaId);
        setBilling(data);
      } catch (e) {
        // PIN_REQUIRED: jangan tampilkan toast merah yang menakutkan. Buka
        // dialog PIN; kalau wali memasang PIN, ia memang diminta memasukkan.
        if (denganPin && (e.code === 'PIN_REQUIRED' || e.status === 403)) {
          hapusPinToken();
          setPinDibutuhkan(true);
          return;
        }
        toast?.('err', e.message);
      } finally {
        setLoadingBilling(false);
      }
    },
    [toast]
  );

  const loadIzin = useCallback(
    async (siswaId) => {
      if (!siswaId) return;
      setLoadingIzin(true);
      try {
        const d = await api.izinSaya(siswaId);
        setDaftarIzin(d?.rows || []);
      } catch (e) {
        toast?.('err', e.message);
      } finally {
        setLoadingIzin(false);
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
    api
      .pinStatus()
      .then((s) => setWaliPunyaPin(!!s?.punyaPin))
      .catch(() => {});
  }, []);

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
    if (waliPunyaPin === false) loadBilling(selected.id);
    loadRekap(bulan);
    loadIzin(selected.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, waliPunyaPin]);

  // Buka tab Tagihan tanpa data (mis. dialog PIN tadi dibatalkan, atau PIN baru
  // dimatikan/dipasang): minta lagi. Penjaga !pinDibutuhkan mencegah loop
  // tak berujung ketika server terus menolak dengan PIN_REQUIRED — dialog PIN
  // yang menunggu jawaban, bukan permintaan berulang.
  useEffect(() => {
    if (activeTab !== 'tagihan') return;
    if (billing || loadingBilling || pinDibutuhkan || !selected) return;
    loadBilling(selected.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, billing, loadingBilling, pinDibutuhkan, selected?.id, waliPunyaPin]);

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

  const izinMenunggu = useMemo(() => (daftarIzin || []).filter((x) => x.status === 'menunggu').length, [daftarIzin]);

  const tabs = useMemo(
    () =>
      TABS.map((t) => ({
        ...t,
        badge:
          t.id === 'tagihan' && ringkasTag.jumlahBelum > 0
            ? ringkasTag.jumlahBelum
            : t.id === 'catatan' && unread > 0
              ? unread
              : t.id === 'izin' && izinMenunggu > 0
                ? izinMenunggu
                : undefined
      })),
    [ringkasTag.jumlahBelum, unread, izinMenunggu]
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

        {/* Pengumuman sekolah tampil di semua tab: orang tua yang hanya
            membuka catatan harian tetap melihat informasi penting. */}
        <Pengumuman />

        <KeamananCard
          toast={toast}
          onPinBerubah={() => {
            // Buang data keuangan dari memori, lalu muat ulang: kalau PIN baru
            // dipasang, permintaan ini akan ditolak PIN_REQUIRED dan dialog PIN
            // muncul — sesi yang sama ikut terkunci, tidak menunggu reload.
            setBilling(null);
            if (selected) loadBilling(selected.id);
          }}
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
                if (selected)
                  api
                    .dailyHistory(selected.id, historyLimit)
                    .then(setHistory)
                    .catch(() => {});
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

        {activeTab === 'izin' ? (
          <Izin
            siswa={selected}
            daftar={daftarIzin}
            memuat={loadingIzin}
            onMuatUlang={() => selected && loadIzin(selected.id)}
            toast={toast}
          />
        ) : null}

        {activeTab === 'tagihan' ? (
          <Tagihan
            siswa={selected}
            billing={billing}
            // Kalau dialog PIN tadi dibatalkan, data keuangan sengaja tidak
            // tersimpan. Buka tab lagi berarti memintanya lagi.
            memuat={loadingBilling || (!billing && !!selected)}
            galat={null}
            onMuatUlang={() => selected && loadBilling(selected.id, false)}
            toast={toast}
            onPerluPin={() => {
              hapusPinToken();
              setPinDibutuhkan(true);
            }}
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
          <div className="mb-3">
            <PushCard toast={toast} />
          </div>
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
                      n.read_at
                        ? 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                        : 'border-primary/20 bg-primary-container hover:border-primary/30'
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

      {/* Dialog PIN: muncul saat server menolak karena data keuangan butuh PIN.
          Setelah PIN benar, tagihan dimuat ulang otomatis. */}
      <PinPrompt
        open={pinDibutuhkan}
        onClose={() => setPinDibutuhkan(false)}
        onBerhasil={() => {
          setPinDibutuhkan(false);
          if (selected) loadBilling(selected.id, false);
        }}
      />
    </div>
  );
}
