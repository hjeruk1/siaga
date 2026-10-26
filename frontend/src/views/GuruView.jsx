import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import FocusThemeCalendar from './guru/FocusThemeCalendar';
import { ConfirmActionModal, Modal, CustomSelect } from '../components/Shared';
import { todayWIB } from '../utils/date';
import KegiatanMingguanTab from './KegiatanMingguanTab';
import IzinPanel from './shared/IzinPanel';
import GaleriKegiatan from './shared/GaleriKegiatan';
import AntreanAbsensi from './guru/AntreanAbsensi';
import { tambah as tambahAntrean } from '../utils/absensiAntrean';

// Helper murni, komponen absensi, dan sub-view dipisah agar file ini fokus pada
// view induk. Impor lucide-react yang sebelumnya ada di sini ternyata tidak
// pernah dipakai dan sudah dihapus.
import {
  sections,
  themeDomains,
  activityLinesFromText,
  matchesClassModule,
  moduleScopeLabel,
  completeness,
  normalizeActivities,
  getIndonesianDayName
} from './guru/helpers';
import { CompleteBadge, StatusBadge, AbsensiActions, AbsensiCard } from './guru/AbsensiComponents';
import { HistoryModal } from './guru/HistoryModal';
import { Editor } from './guru/Editor';

export default function GuruView({ user, toast, tab }) {
  const tabs = ['daily', 'absensi', 'modulAjar', 'izin', 'galeri'];
  const activeTab = tabs.includes(tab) ? tab : 'daily';
  const [tanggal, setTanggal] = useState(() => todayWIB());

  const [absenMode, setAbsenMode] = useState('masuk');
  // Default tampilan absensi mengikuti lebar layar: di HP guru mengabsen
  // belasan siswa, dan kartu (dengan foto besar) memaksa scroll jauh lebih
  // panjang daripada daftar. Pilihan manual pengguna diingat supaya tidak
  // "berubah sendiri" saat ia sudah terbiasa dengan satu mode.
  const [absenView, setAbsenView] = useState(() => {
    try {
      const tersimpan = localStorage.getItem('siaga_absen_view');
      if (tersimpan === 'card' || tersimpan === 'list') return tersimpan;
    } catch {
      /* storage diblokir: jatuh ke default */
    }
    if (typeof window === 'undefined') return 'card';
    return window.matchMedia('(max-width: 639px)').matches ? 'list' : 'card';
  });
  function ubahAbsenView(v) {
    setAbsenView(v);
    try {
      localStorage.setItem('siaga_absen_view', v);
    } catch {
      /* diabaikan */
    }
  }
  const [absenSearch, setAbsenSearch] = useState('');
  const [absenStatus, setAbsenStatus] = useState('all');
  const [dailySearch, setDailySearch] = useState('');
  const [dailyFilter, setDailyFilter] = useState('all');
  const [selectedAbsensi, setSelectedAbsensi] = useState([]);
  const [pulangConfirm, setPulangConfirm] = useState(null);
  const [nfcToken, setNfcToken] = useState('');
  const [nfcBusy, setNfcBusy] = useState(false);
  const [nfcMsg, setNfcMsg] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [historyFor, setHistoryFor] = useState(null);
  const [reminder, setReminder] = useState(null);
  const [dayClosed, setDayClosed] = useState(false);
  const [tutupHariLoading, setTutupHariLoading] = useState(false);
  const [showTutupHariConfirm, setShowTutupHariConfirm] = useState(false);
  const [ketModal, setKetModal] = useState(null);
  const [ketCatatan, setKetCatatan] = useState('');
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [classThemeOpen, setClassThemeOpen] = useState(false);
  const [classThemeCalendarOpen, setClassThemeCalendarOpen] = useState(false);
  const [classThemeStep, setClassThemeStep] = useState(1);
  const [classThemeRombelId, setClassThemeRombelId] = useState('');
  const [classThemeExists, setClassThemeExists] = useState(false);
  const [classThemeForm, setClassThemeForm] = useState({
    rombel_id: '',
    modul_ajar_id: '',
    title: '',
    activity_summary: '',
    suggested_domains: '',
    menu_makanan: ''
  });
  const [classModules, setClassModules] = useState([]);
  const [masterRombels, setMasterRombels] = useState([]);

  // Tutup hari hanya boleh oleh role yang diizinkan backend (absensi.js).
  const canTutupHari = ['admin', 'admin_cabang', 'kepsek'].includes(user.role);
  // Web NFC hanya ada di browser pendukung (Chrome Android); tombolnya
  // disembunyikan daripada selalu berujung pesan galat.
  const webNfcSupported = typeof window !== 'undefined' && 'NDEFReader' in window;

  const [exportScope, setExportScope] = useState('class');
  const [exportSiswaId, setExportSiswaId] = useState('');
  const [exportPeriod, setExportPeriod] = useState('current_month');
  const [exportStartDate, setExportStartDate] = useState(() => `${todayWIB().slice(0, 7)}-01`);
  const [exportEndDate, setExportEndDate] = useState(() => todayWIB());
  const [exportBusy, setExportBusy] = useState(false);

  const getDatesForPeriod = (period) => {
    const today = todayWIB();
    const [year, month] = today.split('-').map(Number);
    let start = '',
      end = '';
    if (period === 'current_month') {
      start = `${today.slice(0, 7)}-01`;
      end = today;
    } else if (period === 'prev_month') {
      const previousMonth = new Date(Date.UTC(year, month - 2, 15, 12));
      const previousPrefix = todayWIB(previousMonth).slice(0, 7);
      const previousLastDay = new Date(Date.UTC(year, month - 1, 0, 12));
      start = `${previousPrefix}-01`;
      end = todayWIB(previousLastDay);
    } else if (period === 'current_year') {
      const startYear = month >= 7 ? year : year - 1;
      start = `${startYear}-07-01`;
      end = today;
    } else {
      return { start: exportStartDate, end: exportEndDate };
    }
    return { start, end };
  };

  async function handleExport(format) {
    if (exportBusy) return;
    const activeRombelId = list[0]?.rombel_id;
    if (!activeRombelId) {
      toast('err', 'Tidak ada rombel aktif untuk diekspor');
      return;
    }
    const { start, end } = getDatesForPeriod(exportPeriod);
    const params = {
      format,
      start_date: start,
      end_date: end
    };
    if (exportScope === 'siswa') {
      if (!exportSiswaId) {
        toast('err', 'Pilih siswa terlebih dahulu');
        return;
      }
      params.siswa_id = exportSiswaId;
    } else {
      params.rombel_id = activeRombelId;
    }
    setExportBusy(true);
    try {
      const blobData = await api.exportRekap(params);
      const url = window.URL.createObjectURL(blobData);
      const a = document.createElement('a');
      a.href = url;
      const filename =
        exportScope === 'siswa'
          ? `rekap_absensi_siswa_${exportSiswaId}_${start}_to_${end}.${format === 'excel' ? 'csv' : 'pdf'}`
          : `rekap_absensi_kelas_${activeRombelId}_${start}_to_${end}.${format === 'excel' ? 'csv' : 'pdf'}`;
      a.setAttribute('download', filename);
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast('ok', 'Ekspor berhasil diunduh');
    } catch (e) {
      toast('err', e.message || 'Gagal mengekspor data');
    } finally {
      setExportBusy(false);
    }
  }

  const harianQ = useQuery({
    queryKey: ['guru-harian', tanggal],
    queryFn: async () => {
      const data = await api.dailyToday({ tanggal });
      return { rows: data.rows || data, isSchoolDay: data.is_school_day };
    }
  });
  const absensiQ = useQuery({
    queryKey: ['guru-absensi', tanggal],
    queryFn: async () => {
      const data = await api.absensiToday({ tanggal });
      return { rows: data.rows || data, isSchoolDay: data.is_school_day };
    },
    // Tab absensi saja yang memuatnya; tab daily record tidak perlu.
    enabled: activeTab === 'absensi'
  });
  const list = useMemo(() => harianQ.data?.rows ?? [], [harianQ.data]);
  // `list` dibaca di dalam effect focus theme hanya untuk mencari satu siswa
  // contoh. Memasukkannya ke dependensi akan mengulang effect (dan menimpa
  // isian form) setiap daftar absensi dimuat ulang, jadi dibaca lewat ref.
  // Penugasan ref harus SETELAH `list` ada — `list` kini const turunan query,
  // bukan state di atas, dan membacanya lebih awal melempar ReferenceError.
  const listRef = useRef(list);
  listRef.current = list;
  const absensi = useMemo(() => absensiQ.data?.rows ?? [], [absensiQ.data]);
  // Dua endpoint sama-sama mengirim is_school_day; yang lebih spesifik menang.
  const isSchoolDay = absensiQ.data?.isSchoolDay ?? harianQ.data?.isSchoolDay ?? null;
  const loadReminder = useCallback(async () => {
    try {
      const cfg = await api.operasionalConfig(user.cabang_id);
      if (cfg[0]) setReminder({ aktif: !!cfg[0].daily_record_wajib, jam: cfg[0].daily_record_due_time || '18:00' });
    } catch {}
  }, [user.cabang_id]);
  const loadTutupHari = useCallback(async () => {
    try {
      const s = await api.tutupHariStatus({ cabang_id: user.cabang_id, tanggal });
      setDayClosed(s.closed);
    } catch {}
  }, [user.cabang_id, tanggal]);
  // Pengingat daily record dan status tutup hari tetap imperatif: keduanya
  // pembacaan kecil yang hasilnya juga diubah lokal (setDayClosed), bukan daftar
  // yang perlu cache.
  useEffect(() => {
    loadReminder();
  }, [loadReminder]);
  useEffect(() => {
    if (activeTab === 'absensi') loadTutupHari();
  }, [loadTutupHari, activeTab]);
  useEffect(() => {
    let alive = true;
    api
      .rombel()
      .then((res) => {
        if (alive) setMasterRombels(res || []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user?.cabang_id]);
  async function open(row) {
    setSelected(row);
    const seed = {
      siswa_id: row.siswa_id,
      tanggal,
      mood: null,
      makan: null,
      tidur: null,
      aktivitas: [],
      catatan: '',
      observation_domain: row.observation_domain || '',
      observation_note: row.observation_note || '',
      parent_note: row.parent_note || '',
      focus_theme_id: row.focus_theme_id || null,
      focus_theme_title: row.focus_theme_title || '',
      focus_theme_activity_summary: row.focus_theme_activity_summary || '',
      focus_theme_domains: row.focus_theme_domains || [],
      attachments: [],
      comments: [],
      id: null
    };
    if (row.laporan_id) {
      const d = await api.dailyDetail(row.laporan_id);
      setDetail({
        ...seed,
        ...d,
        focus_theme_id: d.focus_theme_id || row.focus_theme_id || null,
        focus_theme_title: d.focus_theme_title || row.focus_theme_title || '',
        focus_theme_activity_summary: d.focus_theme_activity_summary || row.focus_theme_activity_summary || '',
        focus_theme_domains: d.focus_theme_domains?.length ? d.focus_theme_domains : row.focus_theme_domains || []
      });
    } else setDetail(seed);
  }
  // Buka editor langsung dari baris riwayat: tanggal ikut dipindah supaya
  // daftar di kiri dan date picker konsisten dengan catatan yang dibuka.
  function openFromHistory(l) {
    if (!historyFor) return;
    const row = {
      siswa_id: l.siswa_id,
      nama: historyFor.nama,
      rombel_nama: historyFor.rombel_nama,
      foto: historyFor.foto,
      paket: l.paket || historyFor.paket,
      cabang_id: l.cabang_id,
      jenjang_id: l.jenjang_id,
      rombel_id: l.rombel_id,
      tanggal: l.tanggal,
      laporan_id: l.id,
      laporan_status: l.status
    };
    setHistoryFor(null);
    setTanggal(l.tanggal);
    open(row);
  }
  function namaSiswa(id) {
    return absensi.find((a) => Number(a.siswa_id) === Number(id))?.nama || `Siswa #${id}`;
  }
  // Jam saat guru benar-benar menekan tombol, bukan jam saat antrean terkirim.
  // Server memvalidasi (hari ini, tidak di masa depan, maks 8 jam mundur).
  function jamSekarang() {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date());
  }

  async function checkin(siswaId) {
    if (isSchoolDay === false) return toast('err', 'Hari libur, tidak bisa check-in');
    const payload = { siswa_id: siswaId, tanggal, jam: jamSekarang() };
    if (!navigator.onLine) {
      tambahAntrean(user.id, 'checkin', payload, namaSiswa(siswaId));
      return toast('ok', 'Tanpa sinyal — absensi disimpan di perangkat');
    }
    try {
      await api.checkin(payload);
      toast('ok', 'Check-in berhasil');
      absensiQ.refetch();
    } catch (e) {
      // Tanpa status berarti gagal jaringan (fetch melempar TypeError), bukan
      // penolakan server. Yang pertama disimpan ke antrean; yang kedua
      // ditampilkan apa adanya supaya guru tahu alasannya.
      if (!e.status) {
        tambahAntrean(user.id, 'checkin', payload, namaSiswa(siswaId));
        return toast('ok', 'Sinyal terputus — absensi disimpan di perangkat');
      }
      toast('err', e.message);
    }
  }
  function setKeterangan(siswaId, status) {
    setKetModal({ siswaId, status });
    setKetCatatan('');
  }
  async function submitKeterangan() {
    if (!ketModal) return;
    if (isSchoolDay === false) {
      setKetModal(null);
      return toast('err', 'Hari libur, tidak bisa mengubah keterangan');
    }
    const { siswaId, status } = ketModal;
    setKetModal(null);
    const payload = { siswa_id: siswaId, tanggal, status, catatan: ketCatatan.trim() };
    if (!navigator.onLine) {
      tambahAntrean(user.id, 'keterangan', payload, `${namaSiswa(siswaId)} (${status})`);
      return toast('ok', 'Tanpa sinyal — status disimpan di perangkat');
    }
    try {
      await api.setKeterangan(payload);
      toast('ok', 'Status: ' + status);
      absensiQ.refetch();
    } catch (e) {
      if (!e.status) {
        tambahAntrean(user.id, 'keterangan', payload, `${namaSiswa(siswaId)} (${status})`);
        return toast('ok', 'Sinyal terputus — status disimpan di perangkat');
      }
      toast('err', e.message);
    }
  }
  function pulangkan(ids) {
    setPulangConfirm({ ids });
  }
  const pulangTargets = (pulangConfirm?.ids || []).map(
    (id) => absensi.find((a) => Number(a.siswa_id) === Number(id)) || { siswa_id: id, nama: `Siswa #${id}` }
  );
  async function pulangNow() {
    const ids = pulangConfirm?.ids || [];
    if (!ids.length) return setPulangConfirm(null);
    if (isSchoolDay === false) {
      setPulangConfirm(null);
      return toast('err', 'Hari libur, tidak bisa memulangkan siswa');
    }
    try {
      await api.pulangkan(ids);
      toast('ok', ids.length > 1 ? `${ids.length} siswa dipulangkan` : 'Siswa dipulangkan');
      setSelectedAbsensi([]);
      absensiQ.refetch();
    } catch (e) {
      toast('err', e.message);
    } finally {
      setPulangConfirm(null);
    }
  }
  function doTutupHari() {
    if (isSchoolDay === false) return toast('err', 'Hari libur, tidak bisa tutup hari');
    setShowTutupHariConfirm(true);
  }
  async function confirmTutupHari() {
    setShowTutupHariConfirm(false);
    setTutupHariLoading(true);
    try {
      const r = await api.tutupHari({ cabang_id: user.cabang_id, tanggal });
      toast(
        'ok',
        `Hari ditutup. ${r.remaining_count} siswa tersisa (${r.details?.filter((d) => d.status === 'Belum').length || 0} jadi Absen).`
      );
      setDayClosed(true);
      absensiQ.refetch();
    } catch (e) {
      toast('err', e.message);
    } finally {
      setTutupHariLoading(false);
    }
  }
  function toggleAbsensi(id) {
    setSelectedAbsensi((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  }
  async function processNfc(raw) {
    const token = String(raw || '').trim();
    if (!token) return;
    if (isSchoolDay === false) {
      setNfcMsg({ type: 'err', text: 'Hari libur, absensi tidak diaktifkan.' });
      return;
    }
    if (!/^SIAGA-STU-[A-F0-9]{10}$/i.test(token)) {
      setNfcMsg({ type: 'err', text: 'Format token tidak valid. Format: SIAGA-STU-XXXXXXXXXX' });
      return;
    }
    setNfcBusy(true);
    setNfcMsg(null);
    try {
      const action = absenMode === 'pulang' ? 'pulang' : 'checkin';
      const r = await api.nfcScan({ token, tanggal, action, tab: absenMode });
      setNfcMsg({
        type: 'ok',
        text: `${r.siswa?.nama || 'Siswa'}: ${action === 'pulang' ? 'Pulang' : 'Check-in'} berhasil`
      });
      setNfcToken('');
      absensiQ.refetch();
    } catch (e) {
      setNfcMsg({ type: 'err', text: e.message });
      toast('err', e.message);
    } finally {
      setNfcBusy(false);
    }
  }
  async function startWebNfc() {
    if (!('NDEFReader' in window)) {
      toast('err', 'Web NFC belum didukung browser ini. Pakai input scanner/manual.');
      return;
    }
    try {
      const reader = new window.NDEFReader();
      await reader.scan();
      toast('ok', 'NFC aktif. Tempel kartu siswa.');
      reader.onreading = (e) => {
        let value = '';
        for (const record of e.message.records) {
          if (record.recordType === 'text') {
            value = new TextDecoder(record.encoding || 'utf-8').decode(record.data);
            break;
          }
          if (record.recordType === 'url' || record.recordType === 'mime') {
            value = new TextDecoder().decode(record.data);
            break;
          }
        }
        processNfc(value);
      };
    } catch (e) {
      toast('err', e.message || 'Gagal mengaktifkan NFC');
    }
  }
  const filteredAbsensi = useMemo(
    () =>
      absensi.filter((a) => {
        const q = absenSearch.trim().toLowerCase();
        const matchText =
          !q || [a.nama, a.rombel_nama, a.nis].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
        const matchStatus = absenStatus === 'all' || a.status === absenStatus;
        return matchText && matchStatus;
      }),
    [absensi, absenSearch, absenStatus]
  );
  const absenStats = useMemo(
    () =>
      ['Belum', 'Hadir', 'Terlambat', 'Menunggu', 'Pulang', 'Izin', 'Sakit', 'Absen'].map((s) => ({
        s,
        n: absensi.filter((a) => a.status === s).length
      })),
    [absensi]
  );
  const done = list.filter((r) => completeness(r) === 100).length;
  const dailyCounts = useMemo(
    () =>
      list.reduce(
        (acc, r) => {
          const pct = completeness(r);
          acc.all++;
          if (pct === 100) acc.lengkap++;
          else if (pct > 0) acc.sebagian++;
          else acc.belum++;
          return acc;
        },
        { all: 0, belum: 0, sebagian: 0, lengkap: 0 }
      ),
    [list]
  );
  const filteredDaily = useMemo(
    () =>
      list.filter((r) => {
        const q = dailySearch.trim().toLowerCase();
        const pct = completeness(r);
        const status = pct === 100 ? 'lengkap' : pct > 0 ? 'sebagian' : 'belum';
        const matchText =
          !q || [r.nama, r.rombel_nama, r.paket].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
        const matchStatus = dailyFilter === 'all' || dailyFilter === status;
        return matchText && matchStatus;
      }),
    [list, dailySearch, dailyFilter]
  );
  const rombels = useMemo(() => {
    const sorted = [...masterRombels].sort((a, b) => String(a.nama).localeCompare(String(b.nama), 'id'));
    const mapped = sorted.map((r) => ({ id: r.id, name: r.nama, jenjang_id: r.jenjang_id, gurus: r.gurus }));

    if (user.role === 'admin' || user.role === 'admin_cabang' || user.role === 'kepsek') {
      return mapped;
    }

    // Find rombels where current user is assigned
    const assignedRombels = mapped.filter((r) => r.gurus?.some((g) => String(g.id) === String(user.id)));

    // Find jenjangs where current user is 'utama'
    const leadJenjangIds = mapped
      .filter((r) => r.gurus?.some((g) => String(g.id) === String(user.id) && g.role === 'utama'))
      .map((r) => String(r.jenjang_id));

    // Filter masterRombels: must be assigned OR be lead in the same jenjang
    return mapped.filter(
      (r) =>
        assignedRombels.some((ar) => String(ar.id) === String(r.id)) || leadJenjangIds.includes(String(r.jenjang_id))
    );
  }, [user?.id, user?.role, masterRombels]);

  useEffect(() => {
    if (classThemeOpen && rombels.length > 0) {
      if (!classThemeRombelId || !rombels.some((r) => String(r.id) === String(classThemeRombelId))) {
        setClassThemeRombelId(String(rombels[0].id));
      }
    }
  }, [classThemeOpen, rombels, classThemeRombelId]);

  useEffect(() => {
    if (classThemeOpen) {
      api
        .modulAjar({ cabang_id: user.cabang_id, tanggal })
        .then(setClassModules)
        .catch(() => {});
    }
  }, [classThemeOpen, tanggal, user.cabang_id]);

  const selectedClassStudent = useMemo(() => {
    if (!classThemeRombelId) return null;
    return list.find((s) => String(s.rombel_id) === String(classThemeRombelId)) || null;
  }, [list, classThemeRombelId]);

  const scopedClassModules = useMemo(() => {
    if (!classThemeRombelId || !selectedClassStudent) return [];
    return classModules.filter((m) => matchesClassModule(m, classThemeRombelId, selectedClassStudent));
  }, [classModules, classThemeRombelId, selectedClassStudent]);

  const selectedClassModule = useMemo(() => {
    return scopedClassModules.find((x) => String(x.id) === String(classThemeForm.modul_ajar_id));
  }, [scopedClassModules, classThemeForm.modul_ajar_id]);

  const classTodayDayName = useMemo(() => getIndonesianDayName(tanggal), [tanggal]);

  const classSuggestedActivities = useMemo(() => {
    const norm = normalizeActivities(selectedClassModule?.suggested_activities);
    return norm[classTodayDayName] || { opening: [], focus_theme: [], break: [], closing: [] };
  }, [selectedClassModule, classTodayDayName]);

  const handleClassActivityCheckboxChange = (activityName, checked) => {
    const currentLines = classThemeForm.activity_summary
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
    let updatedLines;
    const formatted = `- ${activityName}`;
    if (checked) {
      if (!currentLines.includes(formatted) && !currentLines.includes(activityName)) {
        updatedLines = [...currentLines, formatted];
      } else {
        updatedLines = currentLines;
      }
    } else {
      updatedLines = currentLines.filter((line) => line !== formatted && line !== activityName);
    }
    setClassThemeForm((prev) => ({ ...prev, activity_summary: updatedLines.join('\n') }));
  };

  useEffect(() => {
    if (!classThemeOpen || !classThemeRombelId) return;

    let alive = true;
    async function loadClassFocusTheme() {
      try {
        const [mods, theme] = await Promise.all([
          api.modulAjar({ cabang_id: user.cabang_id, tanggal }).catch(() => []),
          api.focusTheme({ rombel_id: classThemeRombelId, tanggal }).catch(() => null)
        ]);
        if (!alive) return;

        const source = theme;
        setClassThemeExists(!!theme);
        let defaultModulAjarId = source?.modul_ajar_id || '';
        let defaultTitle = source?.title || '';
        let defaultDomains = themeDomains(source?.suggested_domains).join(', ');

        if (!defaultModulAjarId && Array.isArray(mods)) {
          const sampleStudent = listRef.current.find((s) => String(s.rombel_id) === String(classThemeRombelId));
          if (sampleStudent) {
            const matched = mods.find((m) => matchesClassModule(m, classThemeRombelId, sampleStudent));
            if (matched) {
              defaultModulAjarId = matched.id;
              if (!defaultTitle) defaultTitle = matched.title;
              if (!defaultDomains) defaultDomains = themeDomains(matched.suggested_domains).join(', ');
            }
          }
        }

        setClassThemeForm({
          rombel_id: classThemeRombelId,
          modul_ajar_id: defaultModulAjarId,
          title: defaultTitle,
          activity_summary: source?.activity_summary || '',
          suggested_domains: defaultDomains,
          menu_makanan: source?.menu_makanan || ''
        });
      } catch (e) {
        toast('err', e.message);
      }
    }

    loadClassFocusTheme();
    return () => {
      alive = false;
    };
  }, [classThemeOpen, classThemeRombelId, tanggal, user.cabang_id, toast]);

  async function saveClassThemeToNextDay() {
    const title = classThemeForm.title.trim();
    if (!title) {
      toast('err', 'Judul Focus Theme wajib diisi');
      return;
    }
    if (!classThemeRombelId) return;
    // Urai sebagai UTC supaya penambahan hari tidak tergeser zona waktu
    // (parsing lokal WIB + toISOString membuat "besok" malah jadi hari ini).
    const d0 = new Date(tanggal + 'T00:00:00Z');
    d0.setUTCDate(d0.getUTCDate() + 1);
    const next = d0.toISOString().slice(0, 10);
    try {
      const payload = {
        cabang_id: user.cabang_id,
        rombel_id: classThemeRombelId,
        tanggal: next,
        modul_ajar_id: classThemeForm.modul_ajar_id || null,
        title,
        activity_summary: classThemeForm.activity_summary.trim(),
        suggested_domains: themeDomains(classThemeForm.suggested_domains),
        menu_makanan: classThemeForm.menu_makanan.trim()
      };
      await api.saveFocusTheme(payload);
      toast('ok', `Tema disalin ke ${next}`);
    } catch (e) {
      toast('err', e.message);
    }
  }

  async function saveClassTheme() {
    const title = classThemeForm.title.trim();
    if (!title) {
      toast('err', 'Judul Focus Theme wajib diisi');
      return;
    }
    try {
      const payload = {
        cabang_id: user.cabang_id,
        rombel_id: classThemeRombelId,
        tanggal,
        modul_ajar_id: classThemeForm.modul_ajar_id || null,
        title,
        activity_summary: classThemeForm.activity_summary.trim(),
        suggested_domains: themeDomains(classThemeForm.suggested_domains),
        menu_makanan: classThemeForm.menu_makanan.trim()
      };
      await api.saveFocusTheme(payload);
      toast('ok', 'Focus Theme kelas berhasil disimpan');
      setClassThemeOpen(false);
      harianQ.refetch();
    } catch (e) {
      toast('err', e.message);
    }
  }

  const showReminder =
    reminder?.aktif &&
    isSchoolDay !== false &&
    tanggal === todayWIB() &&
    (() => {
      const now = new Date();
      const [h, m] = reminder.jam.split(':').map(Number);
      const t = new Date();
      t.setHours(h, m, 0, 0);
      return now >= t && done < list.length;
    })();

  async function hapusClassTheme() {
    const judul = classThemeForm.title || 'tema ini';
    if (
      !window.confirm(
        `Hapus Focus Theme "${judul}" untuk ${tanggal}? Laporan yang menunjuknya hanya dilepas temanya, isian lain tetap utuh.`
      )
    )
      return;
    try {
      await api.deleteFocusTheme({ rombel_id: classThemeRombelId, tanggal });
      toast('ok', 'Focus Theme dihapus');
      setClassThemeExists(false);
      setClassThemeForm((prev) => ({ ...prev, modul_ajar_id: '', title: '', activity_summary: '', menu_makanan: '' }));
      harianQ.refetch();
    } catch (e) {
      toast('err', e.message);
    }
  }
  return (
    <div className="w-full p-3 sm:p-4 lg:p-6 2xl:p-8 space-y-4">
      {activeTab === 'daily' && (
        <div className="w-full space-y-4 lg:h-[calc(100vh-132px)] lg:min-h-0 lg:flex lg:flex-col">
          {showReminder && (
            <div className="bg-primary-container border-2 border-primary rounded-2xl px-4 py-3 flex items-center gap-3">
              <span className="text-2xl">⏰</span>
              <div className="flex-1">
                <p className="font-black text-primary-active text-sm">Pengingat Laporan Harian</p>
                <p className="text-primary-active opacity-90 text-xs">
                  {list.length - done} siswa belum dilaporkan — selesaikan sebelum akhir hari.
                </p>
              </div>
            </div>
          )}
          <section className="grid lg:grid-cols-[390px_minmax(0,1fr)] 2xl:grid-cols-[430px_minmax(0,1fr)] gap-4 lg:flex-1 lg:min-h-0">
            <aside
              className={`${selected ? 'hidden lg:flex' : 'flex'} w-full min-w-0 bg-white border border-slate-200 rounded-2xl p-4 flex-col min-h-0 h-full`}
            >
              <div className="flex flex-row items-center justify-between gap-3 mb-4">
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-xl font-black text-text-main truncate">Daily Record</h1>
                  <p className="text-xs sm:text-sm text-slate-500 truncate">
                    {isSchoolDay === false && <span className="text-red-500 font-black">Hari Libur</span>}
                    {isSchoolDay === true && <span className="text-emerald-500 font-black">Hari Masuk</span>}
                    {isSchoolDay === null && 'Draft & feedback'}
                  </p>
                </div>
                <input
                  type="date"
                  value={tanggal}
                  onChange={(e) => {
                    setTanggal(e.target.value);
                    setSelected(null);
                    setDetail(null);
                  }}
                  className="input w-[130px] sm:w-auto flex-shrink-0"
                />
              </div>
              <div className="space-y-3 mb-4">
                <input
                  value={dailySearch}
                  onChange={(e) => setDailySearch(e.target.value)}
                  autoComplete="off"
                  className="input w-full"
                  placeholder="Cari siswa atau rombel"
                />
                <div className="grid grid-cols-2 min-[350px]:grid-cols-4 gap-2">
                  {[
                    { id: 'all', label: 'Semua', count: dailyCounts.all },
                    { id: 'belum', label: 'Belum', count: dailyCounts.belum },
                    { id: 'sebagian', label: 'Sebagian', count: dailyCounts.sebagian },
                    { id: 'lengkap', label: 'Lengkap', count: dailyCounts.lengkap }
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setDailyFilter(f.id)}
                      className={`px-2 py-2 rounded-lg text-[10px] xs:text-xs font-medium transition-all duration-200 active:scale-95 ${dailyFilter === f.id ? 'bg-text-main text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                      <span className="block truncate">{f.label}</span>
                      <span
                        className={`block text-xs sm:text-base leading-tight ${dailyFilter === f.id ? 'text-white' : 'text-text-main font-semibold'}`}
                      >
                        {f.count}
                      </span>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => {
                    if (rombels.length > 0) {
                      setClassThemeRombelId(rombels[0].id);
                    }
                    setClassThemeStep(1);
                    setClassThemeOpen(true);
                  }}
                  className="w-full h-10 rounded-xl bg-primary hover:bg-primary-hover text-white font-black text-xs transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 shadow-sm"
                >
                  🎯 Atur Tema & Kegiatan Kelas
                </button>
                <button
                  onClick={() => {
                    if (rombels.length > 0 && !classThemeRombelId) {
                      setClassThemeRombelId(rombels[0].id);
                    }
                    setClassThemeCalendarOpen(true);
                  }}
                  className="w-full h-9 rounded-xl border border-primary/30 bg-white hover:bg-primary-container text-primary font-black text-xs transition-all active:scale-[0.98] flex items-center justify-center gap-1.5"
                >
                  📅 Kalender Tema Bulanan
                </button>
              </div>
              <div className="space-y-2 overflow-y-auto pr-1 lg:flex-1 lg:min-h-0">
                {filteredDaily.map((r) => {
                  const pct = completeness(r);
                  const active = selected?.siswa_id === r.siswa_id;
                  return (
                    <div
                      key={r.siswa_id}
                      onClick={() => open(r)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') open(r);
                      }}
                      className={`text-left border rounded-2xl p-3 cursor-pointer flex gap-3 items-center transition-all active:scale-[0.98] ${active ? 'bg-primary-container border-primary/40' : 'bg-white border-slate-200 hover:border-primary/30'}`}
                    >
                      {r.foto ? (
                        <img
                          src={r.foto}
                          className="w-14 h-14 rounded-xl object-cover flex-shrink-0"
                          alt={r.nama}
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-xl bg-slate-200 flex items-center justify-center text-slate-400 text-2xl flex-shrink-0">
                          👤
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-black text-text-main text-sm truncate">
                          {r.nama}
                          {r.is_late && isSchoolDay !== false && (
                            <span className="ml-2 text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-black align-middle">
                              Terlambat
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 truncate">
                          {r.rombel_nama} · {r.paket}
                        </div>
                        {r.focus_theme_title ? (
                          <div className="mt-1.5">
                            <span className="inline-flex items-center gap-1 max-w-full px-2 py-0.5 rounded-full text-[10px] font-black text-primary bg-gradient-to-r from-primary-container to-white border border-primary/30 shadow-sm truncate">
                              <span className="shrink-0">🎯</span>
                              <span className="truncate">{r.focus_theme_title}</span>
                            </span>
                          </div>
                        ) : null}
                        <div className="flex items-center justify-between mt-1">
                          {isSchoolDay === false ? (
                            <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">Libur</span>
                          ) : (
                            <CompleteBadge pct={pct} />
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setHistoryFor(r);
                            }}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors"
                            title="Riwayat"
                          >
                            <span className="text-xs">📖</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {filteredDaily.length === 0 && (
                  <div className="text-center py-10 text-sm text-slate-400">Tidak ada siswa sesuai filter.</div>
                )}
              </div>
            </aside>
            <div
              className={`${selected && detail ? 'fixed inset-0 z-50 bg-white lg:static lg:z-auto lg:bg-transparent lg:p-0 lg:overflow-y-auto lg:h-full' : 'hidden lg:flex'} min-w-0 lg:min-h-0`}
            >
              {selected && detail ? (
                <Editor
                  row={selected}
                  detail={detail}
                  setDetail={setDetail}
                  onClose={() => {
                    setSelected(null);
                    setDetail(null);
                    harianQ.refetch();
                  }}
                  // "Lanjut" mengisi kelas tanpa bolak-balik ke daftar: simpan
                  // isian siswa ini, lalu buka siswa berikutnya sesuai urutan
                  // daftar yang sedang tampil (termasuk filter/pencarian).
                  onLanjut={(() => {
                    const idx = filteredDaily.findIndex((r) => r.siswa_id === selected?.siswa_id);
                    const berikut = idx >= 0 ? filteredDaily[idx + 1] : null;
                    return berikut ? () => open(berikut) : null;
                  })()}
                  user={user}
                  toast={toast}
                />
              ) : (
                <div className="hidden h-full w-full flex-col items-center justify-center gap-4 rounded-2xl border border-slate-200 bg-white p-8 text-center lg:flex">
                  <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary-container text-2xl">📝</div>
                  <div>
                    <div className="text-lg font-black text-text-main">Pilih siswa untuk mulai mengisi</div>
                    <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-slate-500">
                      Klik siswa di kiri untuk mengisi mood, makan, kegiatan, penilaian, dan observasi. Editor muncul di
                      sini.
                    </p>
                  </div>
                  <div className="grid w-full max-w-sm grid-cols-3 gap-2">
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                      <div className="text-lg font-black tabular-nums text-text-main">{dailyCounts.belum}</div>
                      <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Belum</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                      <div className="text-lg font-black tabular-nums text-text-main">{dailyCounts.sebagian}</div>
                      <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Sebagian</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                      <div className="text-lg font-black tabular-nums text-text-main">{dailyCounts.lengkap}</div>
                      <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Lengkap</div>
                    </div>
                  </div>
                  {filteredDaily[0] && isSchoolDay !== false ? (
                    <button
                      type="button"
                      onClick={() => open(filteredDaily[0])}
                      className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-black text-white transition-all hover:bg-primary-hover active:scale-[0.98]"
                    >
                      Isi {filteredDaily[0].nama}
                    </button>
                  ) : null}
                  {isSchoolDay === false ? (
                    <p className="text-xs font-bold text-red-500">Hari libur — catatan harian tidak dibuat hari ini.</p>
                  ) : null}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
      {activeTab === 'absensi' && (
        <section className="space-y-4 w-full max-w-full">
          <AntreanAbsensi user={user} toast={toast} onTersinkron={() => absensiQ.refetch()} />
          <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 min-w-0 w-full max-w-full">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-black text-text-main">Absensi Kelas</h1>
                  {isSchoolDay !== null && (
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${
                        isSchoolDay
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-red-200 bg-red-50 text-red-600'
                      }`}
                    >
                      {isSchoolDay ? 'Hari Masuk' : 'Hari Libur'}
                    </span>
                  )}
                </div>
                <p
                  className="text-xs text-slate-500 truncate"
                  title="Check-in pagi, keterangan, NFC, dan pulang setelah gerbang validasi penjemput."
                >
                  {isSchoolDay === false
                    ? 'Tidak ada absensi pada tanggal ini.'
                    : 'Check-in pagi, keterangan, NFC, lalu pulang.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={tanggal}
                  onChange={(e) => setTanggal(e.target.value)}
                  className="input flex-1 min-w-[8.25rem] max-w-[10rem]"
                />
                <button onClick={() => absensiQ.refetch()} className="btn-secondary">
                  Refresh
                </button>
                <div
                  className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 ml-auto"
                  role="group"
                  aria-label="Tampilan daftar absensi"
                >
                  {[
                    {
                      id: 'card',
                      label: 'Tampilan kartu',
                      icon: (
                        <>
                          <rect x="3" y="3" width="7" height="7" rx="1.5" />
                          <rect x="14" y="3" width="7" height="7" rx="1.5" />
                          <rect x="3" y="14" width="7" height="7" rx="1.5" />
                          <rect x="14" y="14" width="7" height="7" rx="1.5" />
                        </>
                      )
                    },
                    {
                      id: 'list',
                      label: 'Tampilan daftar',
                      icon: (
                        <>
                          <line x1="8" y1="6" x2="21" y2="6" />
                          <line x1="8" y1="12" x2="21" y2="12" />
                          <line x1="8" y1="18" x2="21" y2="18" />
                          <line x1="3" y1="6" x2="3.01" y2="6" />
                          <line x1="3" y1="12" x2="3.01" y2="12" />
                          <line x1="3" y1="18" x2="3.01" y2="18" />
                        </>
                      )
                    }
                  ].map((v) => (
                    <button
                      key={v.id}
                      onClick={() => ubahAbsenView(v.id)}
                      aria-pressed={absenView === v.id}
                      aria-label={v.label}
                      title={v.label}
                      className={`p-1.5 rounded-md transition-all duration-200 active:scale-95 ${
                        absenView === v.id ? 'bg-white text-text-main shadow-sm' : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        {v.icon}
                      </svg>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {isSchoolDay === false ? null : (
              <div className="flex gap-2 mt-4 overflow-x-auto scrollbar-none">
                {absenStats.map((x) => (
                  <button
                    key={x.s}
                    onClick={() => setAbsenStatus(x.s)}
                    className={`text-left rounded-lg border px-2.5 py-1.5 shrink-0 grow basis-0 min-w-[74px] transition-all duration-200 active:scale-95 ${absenStatus === x.s ? 'border-primary bg-primary-container' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'}`}
                  >
                    <div className="text-[9px] sm:text-[10px] font-black text-slate-500 truncate">{x.s}</div>
                    <div className="text-base sm:text-lg font-black text-text-main leading-tight">{x.n}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] 2xl:grid-cols-[380px_minmax(0,1fr)] gap-4 w-full max-w-full">
            <div className="flex flex-col gap-2 xl:gap-0">
              <button
                onClick={() => setSidebarExpanded(!sidebarExpanded)}
                className="xl:hidden flex items-center justify-between w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 font-black text-text-main text-sm active:scale-[0.99] transition-all duration-200"
              >
                <div className="flex items-center gap-2">
                  <span>{isSchoolDay === false ? '📊' : '📟'}</span>
                  <span>{isSchoolDay === false ? 'Panel Kontrol' : 'NFC & Kontrol Absensi'}</span>
                  {isSchoolDay !== false && (
                    <span className="text-[10px] bg-primary-container text-primary-active px-2 py-0.5 rounded-md uppercase font-bold">
                      {absenMode}
                    </span>
                  )}
                </div>
                <span
                  className={`text-slate-400 transition-transform duration-200 ${sidebarExpanded ? 'rotate-180' : ''}`}
                >
                  ▼
                </span>
              </button>
              <aside
                className={`${sidebarExpanded ? 'block' : 'hidden'} xl:block bg-white border border-slate-200 rounded-2xl p-4 space-y-4`}
              >
                {isSchoolDay !== false && (
                  <>
                    <div>
                      <div className="label">Mode NFC</div>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: 'masuk', label: 'Masuk' },
                          { id: 'pulang', label: 'Pulang' }
                        ].map((m) => (
                          <button
                            key={m.id}
                            onClick={() => setAbsenMode(m.id)}
                            className={`py-2 rounded-lg text-sm font-medium border transition-all duration-200 active:scale-95 ${absenMode === m.id ? 'bg-text-main text-white border-text-main' : 'bg-white text-slate-600 border-slate-200 hover:border-primary/40'}`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        processNfc(nfcToken);
                      }}
                      className="space-y-2"
                    >
                      <label className="label">Tap / input token NFC</label>
                      <input
                        value={nfcToken}
                        onChange={(e) => setNfcToken(e.target.value.toUpperCase())}
                        autoComplete="off"
                        spellCheck={false}
                        className="input w-full font-mono"
                        placeholder="SIAGA-STU-XXXXXXXXXX"
                        disabled={nfcBusy}
                      />
                      <div className={`grid gap-2 ${webNfcSupported ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        <button className="btn" disabled={nfcBusy}>
                          {nfcBusy ? 'Proses…' : 'Proses'}
                        </button>
                        {webNfcSupported && (
                          <button type="button" onClick={startWebNfc} className="btn-secondary">
                            Web NFC
                          </button>
                        )}
                      </div>
                    </form>
                    {nfcMsg && (
                      <div
                        className={`rounded-lg p-3 text-sm font-bold ${nfcMsg.type === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}
                      >
                        {nfcMsg.text}
                      </div>
                    )}
                    <div className="border-t border-slate-100 pt-4 space-y-2">
                      <div className="label">Bulk pulang</div>
                      <p className="text-xs text-slate-500">Pilih siswa berstatus Menunggu, lalu konfirmasi pulang.</p>
                      <button
                        onClick={() => pulangkan(selectedAbsensi)}
                        disabled={!selectedAbsensi.length}
                        className="btn w-full"
                      >
                        Pulangkan ({selectedAbsensi.length})
                      </button>
                    </div>
                  </>
                )}
                {canTutupHari && isSchoolDay !== false && (
                  <div className="border-t border-slate-100 pt-4 space-y-2">
                    <div className="label">Tutup Hari</div>
                    <p className="text-xs text-slate-500">
                      {dayClosed
                        ? 'Hari sudah ditutup. Tidak ada perubahan absensi yang bisa dilakukan.'
                        : 'Kunci absensi hari ini. Siswa Belum → Absen.'}
                    </p>
                    <button
                      onClick={doTutupHari}
                      disabled={dayClosed || tutupHariLoading}
                      className={`w-full py-2 rounded-lg text-sm font-medium border transition-all duration-200 active:scale-[0.98] ${dayClosed ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'}`}
                    >
                      {dayClosed ? '✓ Hari Ditutup' : tutupHariLoading ? 'Menutup…' : 'Tutup Hari'}
                    </button>
                  </div>
                )}
                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <div className="label flex items-center gap-1.5">
                    <span>📊</span>
                    <span>Ekspor Rekap Absensi</span>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">
                      Cakupan
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setExportScope('class');
                          setExportSiswaId('');
                        }}
                        className={`py-1.5 rounded-lg text-xs font-bold border transition-all duration-150 active:scale-95 ${exportScope === 'class' ? 'bg-primary text-white border-transparent' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                      >
                        Satu Kelas
                      </button>
                      <button
                        type="button"
                        onClick={() => setExportScope('siswa')}
                        className={`py-1.5 rounded-lg text-xs font-bold border transition-all duration-150 active:scale-95 ${exportScope === 'siswa' ? 'bg-primary text-white border-transparent' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                      >
                        Perorangan
                      </button>
                    </div>
                  </div>

                  {exportScope === 'siswa' && (
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">
                        Pilih Siswa
                      </label>
                      <CustomSelect
                        value={exportSiswaId}
                        onChange={(e) => setExportSiswaId(e.target.value)}
                        className="input w-full text-xs"
                      >
                        <option value="">Pilih siswa…</option>
                        {absensi.map((a) => (
                          <option key={a.siswa_id} value={a.siswa_id}>
                            {a.nama}
                          </option>
                        ))}
                      </CustomSelect>
                    </div>
                  )}

                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">
                      Periode
                    </label>
                    <CustomSelect
                      value={exportPeriod}
                      onChange={(e) => setExportPeriod(e.target.value)}
                      className="input w-full text-xs"
                    >
                      <option value="current_month">Bulan Ini</option>
                      <option value="prev_month">Bulan Lalu</option>
                      <option value="current_year">Tahun Ajaran Ini</option>
                      <option value="custom">Kustom (Rentang Tanggal)</option>
                    </CustomSelect>
                  </div>

                  {exportPeriod === 'custom' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Mulai</label>
                        <input
                          type="date"
                          value={exportStartDate}
                          onChange={(e) => setExportStartDate(e.target.value)}
                          className="input w-full text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Selesai</label>
                        <input
                          type="date"
                          value={exportEndDate}
                          onChange={(e) => setExportEndDate(e.target.value)}
                          className="input w-full text-xs"
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      disabled={exportBusy}
                      onClick={() => handleExport('pdf')}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 transition-all active:scale-[0.98] disabled:opacity-50 shadow-sm"
                    >
                      Unduh PDF
                    </button>
                    <button
                      type="button"
                      disabled={exportBusy}
                      onClick={() => handleExport('excel')}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white transition-all active:scale-[0.98] disabled:opacity-50 shadow-sm"
                    >
                      Unduh Excel
                    </button>
                  </div>
                </div>
              </aside>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 min-w-0 w-full max-w-full">
              {isSchoolDay === false ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                  <div className="text-3xl">🌙</div>
                  <div className="mt-1 text-sm font-black text-slate-600">Hari Libur</div>
                  <p className="mx-auto mt-0.5 max-w-sm text-xs text-slate-500">
                    Ganti tanggal untuk melihat hari masuk.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex flex-col lg:flex-row gap-2 lg:items-center justify-between mb-4">
                    <div className="flex flex-col xs:flex-row flex-1 gap-2">
                      <input
                        value={absenSearch}
                        onChange={(e) => setAbsenSearch(e.target.value)}
                        autoComplete="off"
                        className="input flex-1"
                        placeholder="Cari siswa atau rombel"
                      />
                      <CustomSelect
                        value={absenStatus}
                        onChange={(e) => setAbsenStatus(e.target.value)}
                        className="input w-full xs:w-40"
                      >
                        <option value="all">Semua</option>
                        {absenStats.map((x) => (
                          <option key={x.s} value={x.s}>
                            {x.s}
                          </option>
                        ))}
                      </CustomSelect>
                    </div>
                  </div>
                  {absenView === 'card' ? (
                    <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2 sm:gap-3">
                      {filteredAbsensi.map((a) => (
                        <AbsensiCard
                          key={a.siswa_id}
                          row={a}
                          selected={selectedAbsensi.includes(a.siswa_id)}
                          onSelect={() => toggleAbsensi(a.siswa_id)}
                          onCheckin={() => checkin(a.siswa_id)}
                          onKet={setKeterangan}
                          onPulang={() => pulangkan([a.siswa_id])}
                          disabled={isSchoolDay === false}
                        />
                      ))}
                    </div>
                  ) : (
                    <>
                      {/* Mobile/Tablet List View (< lg) */}
                      <div className="lg:hidden space-y-3">
                        {filteredAbsensi.map((a) => (
                          <div
                            key={a.siswa_id}
                            className={`flex flex-col p-3 rounded-2xl border transition-all duration-200 ${selectedAbsensi.includes(a.siswa_id) ? 'border-primary bg-primary-container' : 'border-slate-200 bg-white'}`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={selectedAbsensi.includes(a.siswa_id)}
                                  onChange={() => toggleAbsensi(a.siswa_id)}
                                  disabled={a.status !== 'Menunggu'}
                                  className="w-4 h-4 rounded accent-primary flex-shrink-0 disabled:opacity-30"
                                />
                                <div className="min-w-0">
                                  <h4 className="font-black text-text-main text-sm truncate">{a.nama}</h4>
                                  <p className="text-[10px] text-slate-500 truncate">{a.rombel_nama}</p>
                                </div>
                              </div>
                              <StatusBadge status={a.status} />
                            </div>

                            <div className="grid grid-cols-3 gap-2 text-center text-[10px] xs:text-xs text-slate-500 bg-slate-50/70 rounded-xl px-2 py-1.5 my-2">
                              <div>
                                <div className="text-[8px] xs:text-[9px] font-semibold text-slate-400 uppercase">
                                  Masuk
                                </div>
                                <div className="font-bold text-slate-700">{a.jam_masuk || '-'}</div>
                              </div>
                              <div>
                                <div className="text-[8px] xs:text-[9px] font-semibold text-slate-400 uppercase">
                                  Tunggu
                                </div>
                                <div className="font-bold text-slate-700">{a.jam_tunggu || '-'}</div>
                              </div>
                              <div>
                                <div className="text-[8px] xs:text-[9px] font-semibold text-slate-400 uppercase">
                                  Pulang
                                </div>
                                <div className="font-bold text-slate-700">{a.jam_pulang || '-'}</div>
                              </div>
                            </div>

                            <div className="w-full">
                              <AbsensiActions
                                row={a}
                                onCheckin={() => checkin(a.siswa_id)}
                                onKet={setKeterangan}
                                onPulang={() => pulangkan([a.siswa_id])}
                                compact={true}
                                disabled={isSchoolDay === false}
                              />
                            </div>
                          </div>
                        ))}
                        {filteredAbsensi.length === 0 && (
                          <div className="text-center py-10 text-sm text-slate-400">Tidak ada siswa sesuai filter.</div>
                        )}
                      </div>

                      {/* Desktop List View (>= lg) */}
                      <div className="hidden lg:block overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr>
                              {['', 'Siswa', 'Rombel', 'Status', 'Masuk', 'Tunggu', 'Pulang', 'Aksi'].map((h) => (
                                <th key={h} className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {filteredAbsensi.map((a) => (
                              <tr key={a.siswa_id}>
                                <td className="py-2 px-3">
                                  <input
                                    type="checkbox"
                                    checked={selectedAbsensi.includes(a.siswa_id)}
                                    onChange={() => toggleAbsensi(a.siswa_id)}
                                    disabled={a.status !== 'Menunggu'}
                                  />
                                </td>
                                <td className="py-2 px-3 font-black text-text-main">{a.nama}</td>
                                <td className="py-2 px-3 text-slate-600">{a.rombel_nama}</td>
                                <td className="py-2 px-3">
                                  <StatusBadge status={a.status} />
                                </td>
                                <td className="py-2 px-3">{a.jam_masuk || '-'}</td>
                                <td className="py-2 px-3">{a.jam_tunggu || '-'}</td>
                                <td className="py-2 px-3">{a.jam_pulang || '-'}</td>
                                <td className="py-2 px-3">
                                  <AbsensiActions
                                    row={a}
                                    onCheckin={() => checkin(a.siswa_id)}
                                    onKet={setKeterangan}
                                    onPulang={() => pulangkan([a.siswa_id])}
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {filteredAbsensi.length === 0 && (
                          <div className="text-center py-10 text-sm text-slate-400">Tidak ada siswa sesuai filter.</div>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </section>
      )}
      {activeTab === 'modulAjar' && <KegiatanMingguanTab user={user} toast={toast} />}
      {activeTab === 'izin' && <IzinPanel user={user} toast={toast} />}
      {activeTab === 'galeri' && <GaleriKegiatan toast={toast} bisaUnggah />}
      {historyFor && (
        <HistoryModal siswa={historyFor} onClose={() => setHistoryFor(null)} onOpenDate={openFromHistory} />
      )}
      {showTutupHariConfirm && (
        <ConfirmActionModal
          title="Tutup Hari Absensi"
          entityName={`Absensi Tanggal ${tanggal}`}
          affectedBranch={user.cabang_nama}
          consequence="Siswa dengan status Belum akan otomatis menjadi Absen. Tindakan ini tidak bisa dibatalkan."
          actionLabel="Tutup Hari"
          actionVariant="danger"
          onClose={() => setShowTutupHariConfirm(false)}
          onSubmit={confirmTutupHari}
        />
      )}
      {ketModal && (
        <Modal title={`Keterangan ${ketModal.status}`} onClose={() => setKetModal(null)}>
          <div className="space-y-3">
            <div>
              <label className="label">Catatan (opsional)</label>
              <textarea
                value={ketCatatan}
                onChange={(e) => setKetCatatan(e.target.value)}
                rows={3}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="Tulis alasan izin/sakit/absen…"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setKetModal(null)} className="btn-secondary">
                Batal
              </button>
              <button onClick={submitKeterangan} className="btn">
                Simpan
              </button>
            </div>
          </div>
        </Modal>
      )}
      {classThemeOpen && (
        <Modal
          title="Atur Tema & Kegiatan Kelas"
          onClose={() => setClassThemeOpen(false)}
          footer={
            <div className="flex items-center justify-between gap-2">
              <div>
                {classThemeExists && (
                  <button
                    onClick={hapusClassTheme}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    Hapus
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {classThemeStep === 2 && (
                  <button
                    onClick={() => setClassThemeStep(1)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    ← Kembali
                  </button>
                )}
                {classThemeStep === 1 && classThemeRombelId && (
                  <button
                    onClick={() => setClassThemeStep(2)}
                    disabled={!classThemeForm.title.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-all active:scale-[0.98]"
                  >
                    Lanjut →
                  </button>
                )}
                {classThemeStep === 2 && (
                  <>
                    <button
                      onClick={saveClassThemeToNextDay}
                      disabled={!classThemeRombelId || !classThemeForm.title.trim()}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                    >
                      Salin ke Besok
                    </button>
                    <button
                      onClick={saveClassTheme}
                      disabled={!classThemeRombelId}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-all active:scale-[0.98]"
                    >
                      Simpan & Terapkan
                    </button>
                  </>
                )}
                {classThemeStep === 1 && !classThemeRombelId && (
                  <button
                    onClick={() => setClassThemeOpen(false)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    Batal
                  </button>
                )}
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-full text-xs font-black transition-all ${classThemeStep === 1 ? 'bg-primary text-white shadow-sm' : 'bg-emerald-50 text-emerald-600'}`}
              >
                <span
                  className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-black ${classThemeStep === 1 ? 'bg-white/25 text-white' : 'bg-emerald-500 text-white'}`}
                >
                  {classThemeStep === 1 ? '1' : '✓'}
                </span>
                Identitas
              </div>
              <div className="h-px flex-1 bg-slate-200" />
              <div
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-full text-xs font-black transition-all ${classThemeStep === 2 ? 'bg-primary text-white shadow-sm' : 'bg-slate-100 text-slate-400'}`}
              >
                <span
                  className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-black ${classThemeStep === 2 ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-500'}`}
                >
                  2
                </span>
                Kegiatan
              </div>
            </div>
            <div>
              <label className="label">Pilih Rombel / Kelas</label>
              <CustomSelect
                value={classThemeRombelId}
                onChange={(e) => setClassThemeRombelId(e.target.value)}
                className="input w-full"
              >
                <option value="">Pilih rombel</option>
                {rombels.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </CustomSelect>
            </div>

            {classThemeRombelId ? (
              <>
                {classThemeStep === 1 && (
                  <>
                    <div>
                      <label className="label">Kegiatan Mingguan</label>
                      <CustomSelect
                        value={classThemeForm.modul_ajar_id || ''}
                        onChange={(e) => {
                          const id = e.target.value;
                          const m = scopedClassModules.find((x) => String(x.id) === String(id));
                          const domains = themeDomains(m?.suggested_domains).join(', ');

                          // Auto-fill all activities of the selected week day by default
                          const norm = normalizeActivities(m?.suggested_activities);
                          const dayActs = norm[classTodayDayName] || {
                            opening: [],
                            focus_theme: [],
                            break: [],
                            closing: []
                          };
                          const allActs = [
                            ...dayActs.opening,
                            ...dayActs.focus_theme,
                            ...dayActs.break,
                            ...dayActs.closing
                          ];
                          const activitySummary = allActs.map((a) => `- ${a}`).join('\n');

                          setClassThemeForm((f) => ({
                            ...f,
                            modul_ajar_id: id,
                            title: m?.title || f.title || '',
                            suggested_domains: domains || f.suggested_domains,
                            activity_summary: activitySummary
                          }));
                        }}
                        className="input w-full"
                      >
                        <option value="">Tanpa modul</option>
                        {scopedClassModules.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.title} - {moduleScopeLabel(m)}
                          </option>
                        ))}
                      </CustomSelect>
                      {scopedClassModules.length === 0 && (
                        <div className="mt-1 text-[11px] font-bold text-slate-400">
                          Belum ada Focus Theme mingguan yang cocok untuk rombel, jenjang, dan paket kelas ini.
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="label">Judul Tema Hari Ini</label>
                      <input
                        value={classThemeForm.title}
                        onChange={(e) => setClassThemeForm((f) => ({ ...f, title: e.target.value }))}
                        autoComplete="off"
                        className="input w-full"
                        placeholder="Contoh: Membuat konten baik"
                      />
                    </div>

                    <div>
                      <label className="label">Menu Makanan Hari Ini</label>
                      <input
                        value={classThemeForm.menu_makanan}
                        onChange={(e) => setClassThemeForm((f) => ({ ...f, menu_makanan: e.target.value }))}
                        autoComplete="off"
                        className="input w-full"
                        placeholder="Contoh: Nasi kuning + ayam goreng"
                      />
                    </div>
                  </>
                )}
                {classThemeStep === 2 && (
                  <>
                    {classThemeForm.modul_ajar_id && (
                      <div className="space-y-3 bg-slate-50 rounded-xl p-3 border border-slate-200">
                        <div className="text-xs font-black text-slate-500 uppercase tracking-wider font-bold">
                          Pilih Rangkaian Kegiatan ({classTodayDayName})
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {Object.entries(sections).map(([sectionKey, sectionLabel]) => {
                            const list = classSuggestedActivities[sectionKey] || [];
                            if (list.length === 0) return null;
                            return (
                              <div key={sectionKey} className="bg-white rounded-lg p-2.5 border border-slate-100">
                                <div className="mb-2 text-[10px] font-black uppercase text-slate-400 font-bold">
                                  {sectionLabel}
                                </div>
                                <div className="space-y-1">
                                  {list.map((act, idx) => {
                                    const isSelected = activityLinesFromText(classThemeForm.activity_summary).includes(
                                      act
                                    );
                                    return (
                                      <label
                                        key={idx}
                                        className="flex items-start gap-2 cursor-pointer text-xs font-semibold text-slate-700"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={(e) => handleClassActivityCheckboxChange(act, e.target.checked)}
                                          className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-primary focus:ring-primary/45"
                                        />
                                        <span className="leading-snug">{act}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="label">Ringkasan Aktivitas</label>
                      <textarea
                        value={classThemeForm.activity_summary}
                        onChange={(e) => setClassThemeForm((f) => ({ ...f, activity_summary: e.target.value }))}
                        rows={3}
                        className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                        placeholder="Daftar kegiatan harian (satu per baris)..."
                      />
                    </div>

                    <div>
                      <label className="label">Domain Observasi yang Disarankan</label>
                      <input
                        value={classThemeForm.suggested_domains}
                        onChange={(e) => setClassThemeForm((f) => ({ ...f, suggested_domains: e.target.value }))}
                        autoComplete="off"
                        className="input w-full"
                        placeholder="Literasi, Numerasi, dll"
                      />
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="text-center py-6 text-slate-400 text-xs italic">
                Pilih rombel terlebih dahulu untuk melihat tema.
              </div>
            )}
          </div>
        </Modal>
      )}

      {classThemeCalendarOpen && (
        <FocusThemeCalendar
          open={classThemeCalendarOpen}
          onClose={() => setClassThemeCalendarOpen(false)}
          rombelId={classThemeRombelId}
          tanggal={tanggal}
          onSelectDay={(ds) => {
            setTanggal(ds);
            setSelected(null);
            setDetail(null);
            setClassThemeStep(1);
            setClassThemeOpen(true);
          }}
        />
      )}

      {pulangConfirm && (
        <Modal title="Konfirmasi Serah Terima" onClose={() => setPulangConfirm(null)}>
          <div className="space-y-3">
            <div>
              <span className="text-xs font-black text-slate-400 uppercase block mb-1">
                Siswa yang akan dipulangkan
              </span>
              <div className="space-y-1">
                {pulangTargets.map((t) => (
                  <div key={t.siswa_id} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px]">
                    <span className="font-bold text-text-main">{t.nama}</span>
                    {t.penjemput_nama && <span className="text-slate-500"> - dijemput {t.penjemput_nama}</span>}
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-800">
              Pastikan anak sudah bertemu penjemput yang valid sebelum menekan Pulang.
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button onClick={() => setPulangConfirm(null)} className="btn-secondary">
                Batal
              </button>
              <button onClick={pulangNow} className="btn">
                {pulangTargets.length > 1 ? `Pulangkan (${pulangTargets.length})` : 'Pulangkan'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
