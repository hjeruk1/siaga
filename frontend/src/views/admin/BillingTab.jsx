import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api';
import {
  ActionButton,
  IconButton,
  Modal,
  CustomSelect,
  CustomMonthPicker,
  SearchableSelect,
  EmptyState
} from '../../components/Shared';
import { todayWIB } from '../../utils/date';
import {
  AlertCircle,
  Ban,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Clock,
  CreditCard,
  FileImage,
  FilePenLine,
  FilePlus,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Receipt,
  Save,
  Settings,
  Smartphone,
  TrendingUp,
  X
} from 'lucide-react';
import {
  useMaster,
  StudentAvatar,
  CabangFilter,
  Panel,
  Input,
  Table,
  Td,
  Toggle,
  money,
  BillingStatusBadge,
  MethodBadge,
  MoneyCell
} from './AdminShared';
import { StatCard } from './billing/StatCard';
import { ActionCard } from './billing/ActionCard';
import { ConfirmModal } from './billing/ConfirmModal';
import { PaymentModal } from './billing/PaymentModal';
import { AlokasiEditModal } from './billing/AlokasiEditModal';

export default function BillingTab({ user, toast }) {
  const m = useMaster(user);
  const currentSchoolYear = (() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const start = month >= 7 ? year : year - 1;
    return `${start}/${start + 1}`;
  })();
  const [tarif, setTarif] = useState([]);
  const [diskon, setDiskon] = useState([]);
  const [tagihan, setTagihan] = useState([]);
  const [pembayaran, setPembayaran] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [siswa, setSiswa] = useState([]);
  const [selectedBills, setSelectedBills] = useState([]);
  const [preview, setPreview] = useState(null);
  const [alokasiPreview, setAlokasiPreview] = useState(null);
  const [alokasiEdit, setAlokasiEdit] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [localCabangIdDiskon, setLocalCabangIdDiskon] = useState('');
  const [localCabangIdPayment, setLocalCabangIdPayment] = useState('');

  const filteredSiswaForPayment = useMemo(() => {
    if (!localCabangIdPayment) return siswa;
    return siswa.filter((s) => String(s.cabang_id) === String(localCabangIdPayment));
  }, [siswa, localCabangIdPayment]);

  const filteredSiswaForDiskon = useMemo(() => {
    if (!localCabangIdDiskon) return siswa;
    return siswa.filter((s) => String(s.cabang_id) === String(localCabangIdDiskon));
  }, [siswa, localCabangIdDiskon]);

  // Diskon dikelompokkan per siswa: satu siswa boleh punya beberapa diskon
  // (mis. SPP 10% + SPP Rp 50.000), dan menampilkannya sebagai satu kartu per
  // baris membuat diskon yang sama terlihat seperti beberapa diskon terpisah.
  // Urutan mengikuti data masuk (created_at DESC), jadi diskon terbaru di atas.
  const groupedDiskon = useMemo(() => {
    const bySiswa = new Map();
    for (const d of diskon) {
      if (!bySiswa.has(d.siswa_id)) {
        bySiswa.set(d.siswa_id, { siswa_id: d.siswa_id, siswa_nama: d.siswa_nama, items: [] });
      }
      bySiswa.get(d.siswa_id).items.push(d);
    }
    return [...bySiswa.values()];
  }, [diskon]);

  // Modal visibility states
  const [showTarifModal, setShowTarifModal] = useState(false);
  const [showDiskonModal, setShowDiskonModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [editingTarif, setEditingTarif] = useState(null);
  const [editingDiskon, setEditingDiskon] = useState(null);

  // Filter state
  const [filterTahunAjaran, setFilterTahunAjaran] = useState(currentSchoolYear);
  const [filterPeriode, setFilterPeriode] = useState('');
  const [billingSubTab, setBillingSubTab] = useState('ringkasan');
  const [showGenerate, setShowGenerate] = useState(false);
  const [form, setForm] = useState({ periode: '' });
  const [generateCabangId, setGenerateCabangId] = useState('');

  useEffect(() => {
    if (m.cabangId) {
      setGenerateCabangId(m.cabangId);
    } else {
      setGenerateCabangId('');
    }
  }, [m.cabangId]);

  // Form states
  const [tarifForm, setTarifForm] = useState({
    cabang_id: '',
    tahun_ajaran: currentSchoolYear,
    jenjang_id: '',
    jenis: 'spp',
    nama: 'SPP',
    nominal: ''
  });
  const [diskonForm, setDiskonForm] = useState({ siswa_id: '', jenis: 'spp', tipe: 'nominal', nilai: '', catatan: '' });
  const [payForm, setPayForm] = useState({
    siswa_id: '',
    nominal: '',
    metode: 'tunai',
    tanggal: todayWIB(),
    reference: '',
    catatan: ''
  });

  // ═══ GUARD ISIAN BELUM TERSIMPAN ═══
  // Modal input tidak boleh menyisakan isian setelah ditutup: sisa data
  // pembayaran mudah terbaca sebagai transaksi setengah jalan dan memicu
  // pencatatan ganda (apalagi dengan tanggal yang sudah basi). Semua jalur
  // tutup — X, klik backdrop, Escape, dan Batal — lewat guard di bawah;
  // kalau sudah ada isian, pengguna dikonfirmasi dulu.
  const blankTarifForm = () => ({
    cabang_id: '',
    tahun_ajaran: currentSchoolYear,
    jenjang_id: '',
    jenis: 'spp',
    nama: 'SPP',
    nominal: ''
  });
  const blankDiskonForm = () => ({ siswa_id: '', jenis: 'spp', tipe: 'nominal', nilai: '', catatan: '' });
  const blankPayForm = () => ({
    siswa_id: '',
    nominal: '',
    metode: 'tunai',
    tanggal: todayWIB(),
    reference: '',
    catatan: ''
  });

  // Field yang di-prefill otomatis saat modal dibuka (cabang & tanggal) sengaja
  // tidak dihitung sebagai perubahan, supaya dialog tidak muncul tanpa sebab.
  const tarifFormDirty = useMemo(
    () => Boolean(tarifForm.jenjang_id || tarifForm.nominal || tarifForm.nama !== 'SPP' || tarifForm.jenis !== 'spp'),
    [tarifForm]
  );
  const diskonFormDirty = useMemo(
    () =>
      Boolean(
        diskonForm.siswa_id ||
        diskonForm.nilai ||
        diskonForm.catatan.trim() ||
        diskonForm.tipe !== 'nominal' ||
        diskonForm.jenis !== 'spp'
      ),
    [diskonForm]
  );
  const payFormDirty = useMemo(
    () =>
      Boolean(
        payForm.siswa_id ||
        payForm.nominal ||
        payForm.reference.trim() ||
        payForm.catatan.trim() ||
        payForm.metode !== 'tunai'
      ),
    [payForm]
  );

  function confirmDiscard(onDiscard) {
    setConfirmAction({
      title: 'Buang perubahan?',
      message: 'Isian yang belum disimpan akan hilang.',
      confirmLabel: 'Buang',
      confirmVariant: 'danger',
      fields: [],
      onSubmit: () => {
        onDiscard();
        setConfirmAction(null);
      }
    });
  }

  function closeTarifModal() {
    setShowTarifModal(false);
    setTarifForm(blankTarifForm());
  }
  function requestCloseTarif() {
    if (tarifFormDirty) return confirmDiscard(closeTarifModal);
    closeTarifModal();
  }

  function closeDiskonModal() {
    setShowDiskonModal(false);
    setLocalCabangIdDiskon('');
    setDiskonForm(blankDiskonForm());
  }
  function requestCloseDiskon() {
    if (diskonFormDirty) return confirmDiscard(closeDiskonModal);
    closeDiskonModal();
  }

  function closePaymentModal() {
    setShowPaymentModal(false);
    setAlokasiPreview(null);
    setLocalCabangIdPayment('');
    setPayForm(blankPayForm());
  }
  function requestClosePayment() {
    if (payFormDirty) return confirmDiscard(closePaymentModal);
    closePaymentModal();
  }

  // Computed billing summary stats
  const billingStats = useMemo(() => {
    const activeTagihan = tagihan.filter((t) => t.status !== 'void');
    const totalTagihan = activeTagihan.reduce((s, t) => s + Number(t.nominal_final || 0), 0);
    const totalTerbayar = activeTagihan.reduce((s, t) => s + Number(t.paid_amount || 0), 0);
    const outstanding = totalTagihan - totalTerbayar;
    const collectionRate = totalTagihan > 0 ? Math.round((totalTerbayar / totalTagihan) * 100) : 0;
    const pendingCount = pembayaran.filter((p) => p.status === 'pending_verification').length;
    const uniquePeriods = [...new Set(tagihan.map((t) => t.periode).filter(Boolean))].sort();
    return { totalTagihan, totalTerbayar, outstanding, collectionRate, pendingCount, uniquePeriods };
  }, [tagihan, pembayaran]);

  // Filtered tagihan by period
  const filteredTagihan = useMemo(() => {
    if (!filterPeriode) return tagihan;
    return tagihan.filter((t) => t.periode === filterPeriode);
  }, [tagihan, filterPeriode]);

  // Grouped tarif by jenjang/global
  const groupedTarif = useMemo(() => {
    const groups = {};
    tarif.forEach((t) => {
      const key = t.jenjang_nama || 'Global';
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });
    return groups;
  }, [tarif]);
  const selectedPaymentStudent = siswa.find((s) => String(s.id) === String(payForm.siswa_id));
  const paymentCabangId = m.cabangId || selectedPaymentStudent?.cabang_id || '';

  async function load() {
    try {
      const [tarifData, diskonData, tagihanData, pembayaranData, invoicesData, siswaData] = await Promise.all([
        api.tarif({ cabang_id: m.cabangId, tahun_ajaran: filterTahunAjaran }),
        api.diskon({ cabang_id: m.cabangId, tahun_ajaran: filterTahunAjaran }),
        api.tagihan({ cabang_id: m.cabangId }),
        api.pembayaran({ cabang_id: m.cabangId }),
        api.invoice({ cabang_id: m.cabangId }),
        api.siswa({ cabang_id: m.cabangId, status: 'semua' })
      ]);

      setTarif(tarifData);
      setDiskon(diskonData);
      setTagihan(tagihanData);
      setPembayaran(pembayaranData);
      setInvoices(invoicesData);
      setSiswa(siswaData);
    } catch (e) {
      setTarif([]);
      setDiskon([]);
      setTagihan([]);
      setPembayaran([]);
      setInvoices([]);
      setSiswa([]);
      toast('err', e.message);
    }
  }

  useEffect(() => {
    load();
  }, [m.cabangId, filterTahunAjaran]);

  // Debounced auto-fetch for payment allocation preview
  useEffect(() => {
    if (showPaymentModal && paymentCabangId && payForm.siswa_id && payForm.nominal && Number(payForm.nominal) > 0) {
      const delayDebounceFn = setTimeout(() => {
        api
          .previewAlokasi({
            cabang_id: paymentCabangId,
            siswa_id: Number(payForm.siswa_id),
            nominal: Number(payForm.nominal)
          })
          .then(setAlokasiPreview)
          .catch((e) => {
            setAlokasiPreview(null);
          });
      }, 500);
      return () => clearTimeout(delayDebounceFn);
    } else {
      setAlokasiPreview(null);
    }
  }, [showPaymentModal, payForm.siswa_id, payForm.nominal, paymentCabangId]);

  async function addTarif() {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (!tarifForm.jenjang_id || !tarifForm.nominal || !tarifForm.nama) {
        setSubmitting(false);
        return toast('err', 'Semua data tarif wajib diisi');
      }
      const targetCabangId = user.role === 'admin' ? tarifForm.cabang_id || m.cabangId : user.cabang_id;
      if (!targetCabangId) {
        setSubmitting(false);
        return toast('err', 'Pilih cabang sekolah terlebih dahulu');
      }
      await api.createTarif({
        ...tarifForm,
        cabang_id: targetCabangId,
        jenjang_id: Number(tarifForm.jenjang_id),
        nominal: Number(tarifForm.nominal)
      });
      toast('ok', 'Tarif tersimpan');
      closeTarifModal();
      load();
    } catch (e) {
      toast('err', e.message);
    } finally {
      setSubmitting(false);
    }
  }

  function openEditTarif(t) {
    setEditingTarif({ ...t, nominal: String(t.nominal), aktif: t.aktif === 0 ? 0 : 1 });
  }

  async function saveTarifEdit() {
    if (!editingTarif) return;
    if (submitting) return;
    setSubmitting(true);
    try {
      await api.updateTarif(editingTarif.id, {
        nama: editingTarif.nama,
        nominal: Number(editingTarif.nominal),
        aktif: editingTarif.aktif === 0 ? 0 : 1
      });
      toast('ok', 'Tarif diperbarui');
      setEditingTarif(null);
      load();
    } catch (e) {
      toast('err', e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function addDiskon() {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (!diskonForm.siswa_id || !diskonForm.nilai) {
        setSubmitting(false);
        return toast('err', 'Siswa dan nilai diskon wajib diisi');
      }
      const selectedStudent = siswa.find((s) => String(s.id) === String(diskonForm.siswa_id));
      const targetCabangId = selectedStudent?.cabang_id || m.cabangId;
      if (!targetCabangId) {
        setSubmitting(false);
        return toast('err', 'Siswa terpilih tidak terhubung ke cabang aktif');
      }
      await api.createDiskon({
        cabang_id: targetCabangId,
        siswa_id: Number(diskonForm.siswa_id),
        tahun_ajaran: filterTahunAjaran,
        jenis: diskonForm.jenis || 'spp',
        tipe: diskonForm.tipe,
        nilai: Number(diskonForm.nilai),
        catatan: diskonForm.catatan
      });
      toast('ok', 'Diskon tersimpan');
      closeDiskonModal();
      load();
    } catch (e) {
      toast('err', e.message);
    } finally {
      setSubmitting(false);
    }
  }

  function openEditDiskon(d) {
    setEditingDiskon({ ...d, nilai: String(d.nilai), aktif: d.aktif === 0 ? 0 : 1 });
  }

  async function saveDiskonEdit() {
    if (!editingDiskon) return;
    if (submitting) return;
    setSubmitting(true);
    try {
      await api.updateDiskon(editingDiskon.id, {
        tipe: editingDiskon.tipe,
        nilai: Number(editingDiskon.nilai),
        catatan: editingDiskon.catatan,
        aktif: editingDiskon.aktif === 0 ? 0 : 1
      });
      toast('ok', 'Diskon diperbarui');
      setEditingDiskon(null);
      load();
    } catch (e) {
      toast('err', e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function previewBulanan() {
    const targetCabangId = user.role === 'admin' ? generateCabangId : m.cabangId;
    if (!targetCabangId) {
      toast('err', 'Pilih cabang dulu untuk generate tagihan');
      return;
    }
    try {
      const payload = { cabang_id: m.cabangId };
      if (form.periode) payload.periode = form.periode;
      payload.cabang_id = targetCabangId;
      const r = await api.generateBulananPreview(payload);
      setPreview({ ...r, kind: 'bulanan', cabang_id: targetCabangId });
    } catch (e) {
      toast('err', e.message);
    }
  }

  async function previewKegiatan() {
    const targetCabangId = user.role === 'admin' ? generateCabangId : m.cabangId;
    if (!targetCabangId) {
      toast('err', 'Pilih cabang dulu untuk generate tagihan');
      return;
    }
    try {
      const r = await api.generateKegiatanPreview({ cabang_id: targetCabangId, tahun_ajaran: filterTahunAjaran });
      setPreview({ ...r, kind: 'kegiatan', cabang_id: targetCabangId });
    } catch (e) {
      toast('err', e.message);
    }
  }

  async function confirmGenerate() {
    try {
      if (preview.kind === 'bulanan') {
        const r = await api.generateBulanan({ cabang_id: preview.cabang_id, periode: preview.period });
        toast('ok', r.created_count + ' tagihan dibuat');
      } else {
        const r = await api.generateKegiatan({ cabang_id: preview.cabang_id, tahun_ajaran: preview.tahun_ajaran });
        toast('ok', r.created_count + ' tagihan kegiatan dibuat');
      }
      setPreview(null);
      load();
    } catch (e) {
      toast('err', e.message);
    }
  }

  async function pay() {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (!payForm.siswa_id || !payForm.nominal) {
        setSubmitting(false);
        return toast('err', 'Pilih siswa and nominal dulu');
      }
      if (!paymentCabangId) {
        setSubmitting(false);
        return toast('err', 'Pilih cabang atau siswa dengan cabang aktif dulu');
      }
      const alokasi =
        alokasiPreview?.allocations?.map((a) => ({ tagihan_id: a.tagihan_id, nominal: a.allocated })) || undefined;
      const r = await api.createPembayaran({
        cabang_id: paymentCabangId,
        siswa_id: Number(payForm.siswa_id),
        nominal: Number(payForm.nominal),
        metode: payForm.metode || 'tunai',
        tanggal_bayar: payForm.tanggal || todayWIB(),
        reference: payForm.reference,
        catatan: payForm.catatan,
        alokasi
      });
      toast('ok', 'Pembayaran: ' + (r.receipt_no || r.status));
      closePaymentModal();
      load();
    } catch (e) {
      toast('err', e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function editAlokasi(p) {
    try {
      const detail = await api.alokasiPembayaran(p.id);
      setAlokasiEdit({
        payment: detail.payment,
        bills: detail.bills.map((b) => ({ ...b, _alloc: b.allocated_amount || 0 }))
      });
    } catch (e) {
      toast('err', e.message);
    }
  }

  async function saveAlokasi() {
    try {
      const total = alokasiEdit.bills.reduce((s, b) => s + Number(b._alloc || 0), 0);
      if (total > alokasiEdit.payment.nominal) {
        toast('err', 'Total alokasi melebihi nominal pembayaran');
        return;
      }
      const alokasi = alokasiEdit.bills
        .filter((b) => Number(b._alloc) > 0)
        .map((b) => ({ tagihan_id: b.id, nominal: Number(b._alloc) }));
      await api.updateAlokasi(alokasiEdit.payment.id, { alokasi });
      toast('ok', 'Alokasi diperbarui');
      setAlokasiEdit(null);
      load();
    } catch (e) {
      toast('err', e.message);
    }
  }

  async function correctBill(t) {
    setConfirmAction({
      title: 'Koreksi Tagihan',
      fields: [
        { label: 'Nominal final baru', key: 'nominal', value: String(t.nominal_final) },
        { label: 'Alasan koreksi', key: 'reason', value: '' }
      ],
      onSubmit: async (v) => {
        try {
          await api.correctTagihan(t.id, { nominal_final: Number(v.nominal), reason: v.reason });
          toast('ok', 'Tagihan dikoreksi');
          load();
        } catch (e) {
          toast('err', e.message);
        }
        setConfirmAction(null);
      }
    });
  }

  async function voidBill(t) {
    setConfirmAction({
      title: 'Void Tagihan',
      fields: [{ label: 'Alasan void', key: 'reason', value: '' }],
      onSubmit: async (v) => {
        try {
          await api.voidTagihan(t.id, v.reason);
          toast('ok', 'Tagihan void');
          load();
        } catch (e) {
          toast('err', e.message);
        }
        setConfirmAction(null);
      }
    });
  }

  async function verify(p) {
    try {
      const r = await api.verifyPembayaran(p.id);
      toast('ok', 'Terverifikasi: ' + r.receipt_no);
      load();
    } catch (e) {
      toast('err', e.message);
    }
  }

  async function reject(p) {
    setConfirmAction({
      title: 'Tolak Pembayaran',
      fields: [{ label: 'Alasan penolakan', key: 'reason', value: '' }],
      onSubmit: async (v) => {
        try {
          await api.rejectPembayaran(p.id, v.reason);
          toast('ok', 'Pembayaran ditolak');
          load();
        } catch (e) {
          toast('err', e.message);
        }
        setConfirmAction(null);
      }
    });
  }

  async function voidPay(p) {
    setConfirmAction({
      title: 'Void Pembayaran',
      fields: [{ label: 'Alasan void', key: 'reason', value: '' }],
      onSubmit: async (v) => {
        try {
          await api.voidPembayaran(p.id, v.reason);
          toast('ok', 'Pembayaran void');
          load();
        } catch (e) {
          toast('err', e.message);
        }
        setConfirmAction(null);
      }
    });
  }

  async function invoice() {
    try {
      const r = await api.createInvoice(selectedBills);
      toast('ok', 'Invoice dibuat: ' + r.invoice_no);
      setSelectedBills([]);
      load();
    } catch (e) {
      toast('err', e.message);
    }
  }

  async function openPdf(kind, id) {
    try {
      const b = kind === 'invoice' ? await api.invoicePdf(id) : await api.receiptPdf(id);
      const url = URL.createObjectURL(b);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      toast('err', e.message);
    }
  }

  function formatWhatsAppNumber(phone) {
    if (!phone) return '';
    let sanitized = phone.replace(/[^0-9]/g, '');
    if (sanitized.startsWith('0')) {
      sanitized = '62' + sanitized.slice(1);
    }
    return sanitized;
  }

  function sendWhatsAppInvoice(i) {
    const phone = formatWhatsAppNumber(i.wali_no_wa);
    if (!phone) {
      toast('err', 'Nomor WhatsApp wali tidak ditemukan');
      return;
    }
    const formattedTotal = 'Rp ' + Number(i.total || 0).toLocaleString('id-ID');
    const pdfUrl = `${window.location.origin}/api/billing/public/invoice/${i.id}/pdf?key=${i.public_key}`;
    const message = `Halo Bunda/Ayah dari ${i.siswa_nama},\n\nBerikut kami kirimkan rincian tagihan Invoice ${i.invoice_no} sebesar ${formattedTotal} untuk Tahun Ajaran ${i.tahun_ajaran}.\n\nAnda dapat melihat dan mengunduh berkas PDF Invoice resmi melalui tautan di bawah ini:\n${pdfUrl}\n\nTerima kasih atas perhatiannya.`;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  }

  function toggleBill(id) {
    const bill = tagihan.find((t) => t.id === id);
    if (!bill || bill.status === 'void') return;
    setSelectedBills((v) => {
      if (v.includes(id)) return v.filter((x) => x !== id);
      const first = tagihan.find((t) => t.id === v[0]);
      if (first && first.siswa_id !== bill.siswa_id) {
        toast('err', 'Invoice hanya bisa dibuat untuk satu siswa dalam satu waktu');
        return v;
      }
      return [...v, id];
    });
  }
  function canSelectBill(t) {
    if (t.status === 'void') return false;
    if (selectedBills.length === 0 || selectedBills.includes(t.id)) return true;
    const first = tagihan.find((x) => x.id === selectedBills[0]);
    return !first || first.siswa_id === t.siswa_id;
  }

  const newItems = preview ? preview.preview.filter((p) => !p.already_exists) : [];
  const existingItems = preview ? preview.preview.filter((p) => p.already_exists) : [];

  const totals = useMemo(() => {
    const active = filteredTagihan.filter((t) => t.status !== 'void');
    const totalFinal = active.reduce((sum, t) => sum + (t.nominal_final || 0), 0);
    const totalPaid = active.reduce((sum, t) => sum + (t.paid_amount || 0), 0);
    const totalOutstanding = totalFinal - totalPaid;
    const collectionRate = totalFinal > 0 ? Math.round((totalPaid / totalFinal) * 100) : 0;
    return { totalFinal, totalPaid, totalOutstanding, collectionRate };
  }, [filteredTagihan]);

  // ═══ TAB RENDERING HELPERS ═══

  const renderRingkasanTab = () => (
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

  const renderTagihanTab = () => (
    <>
      {/* Control Panel / Toolbar */}
      <div className="mb-4 rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm sm:p-4">
        {/* Row 1: Filters */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid grid-cols-2 gap-3 sm:flex sm:items-end">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Tahun Ajaran</span>
              <CustomSelect
                value={filterTahunAjaran}
                onChange={(e) => setFilterTahunAjaran(e.target.value)}
                className="w-full sm:w-40 shadow-sm"
              >
                <option value="2025/2026">2025/2026</option>
                <option value="2026/2027">2026/2027</option>
                {filterTahunAjaran !== '2025/2026' && filterTahunAjaran !== '2026/2027' && (
                  <option value={filterTahunAjaran}>{filterTahunAjaran}</option>
                )}
              </CustomSelect>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                Filter Periode
              </span>
              <CustomSelect
                value={filterPeriode}
                onChange={(e) => setFilterPeriode(e.target.value)}
                className="w-full sm:w-48 shadow-sm"
              >
                <option value="">Semua Periode</option>
                {billingStats.uniquePeriods.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </CustomSelect>
            </div>
          </div>

          {/* Generate Tagihan Button & Collapsible Panel */}
          <button
            type="button"
            onClick={() => setShowGenerate(!showGenerate)}
            className="flex h-10 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-black text-slate-600 shadow-sm transition duration-150 hover:bg-slate-100 active:scale-[0.99] sm:w-auto sm:min-w-[18rem]"
          >
            <span className="flex items-center gap-2">
              <FilePlus className="w-4 h-4 text-slate-500" />
              Generate Tagihan
            </span>
            <ChevronDown
              className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${showGenerate ? 'rotate-180' : ''}`}
            />
          </button>
        </div>

        {showGenerate && (
          <div className="mt-3 grid w-full animate-slide-up gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 lg:ml-auto lg:w-fit lg:grid-cols-[13rem_12rem_auto] lg:items-end">
            {user.role === 'admin' && (
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                  Pilih Cabang
                </span>
                <CustomSelect
                  value={generateCabangId}
                  onChange={(e) => setGenerateCabangId(e.target.value)}
                  className="w-full shadow-sm bg-white"
                >
                  <option value="">Pilih Cabang...</option>
                  {m.cabang.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nama}
                    </option>
                  ))}
                </CustomSelect>
              </div>
            )}
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                Pilih Bulan Tagihan
              </span>
              <CustomMonthPicker
                value={form.periode || ''}
                onChange={(v) => setForm((f) => ({ ...f, periode: v }))}
                className="input w-full shadow-sm"
              />
            </div>
            <div className={`flex flex-col ${user.role === 'admin' ? 'sm:col-span-2 lg:col-span-1' : ''}`}>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
                Aksi Pembuatan
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={previewBulanan}
                  className="flex-1 sm:flex-initial h-9 px-4 rounded-xl text-xs font-black bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 shadow-sm flex items-center justify-center gap-1.5 active:scale-95 transition"
                >
                  <FilePlus className="w-3.5 h-3.5 text-slate-500" />
                  Bulanan
                </button>
                <button
                  type="button"
                  onClick={previewKegiatan}
                  className="flex-1 sm:flex-initial h-9 px-4 rounded-xl text-xs font-black bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 shadow-sm flex items-center justify-center gap-1.5 active:scale-95 transition"
                >
                  <FilePlus className="w-3.5 h-3.5 text-slate-500" />
                  Kegiatan
                </button>
              </div>
            </div>
          </div>
        )}

        {selectedBills.length > 0 && (
          <div className="mt-3 flex animate-bounce-in items-center gap-2 border-t border-slate-100 pt-3">
            <ActionButton
              icon={Receipt}
              onClick={invoice}
              variant="primary"
              className="bg-primary hover:bg-primary-hover shadow-md font-black text-xs px-4 py-2 rounded-xl"
            >
              Buat Invoice ({selectedBills.length} Terpilih)
            </ActionButton>
          </div>
        )}
      </div>

      {/* Dynamic Mini-Dashboard for Filtered Tagihan */}
      {filteredTagihan.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          <StatCard
            size="sm"
            icon={Receipt}
            label="Total Tagihan"
            value={money(totals.totalFinal)}
            hint="Berdasarkan filter aktif"
          />
          <StatCard
            size="sm"
            icon={TrendingUp}
            tone="emerald"
            label="Terbayar"
            value={money(totals.totalPaid)}
            hint="Koleksi terverifikasi"
          />
          <StatCard
            size="sm"
            icon={Clock}
            tone="amber"
            label="Outstanding"
            value={money(totals.totalOutstanding)}
            hint="Belum terbayar"
          />
          <StatCard
            size="sm"
            icon={BarChart3}
            tone="primary"
            label="Rasio Koleksi"
            value={`${totals.collectionRate}%`}
            progress={totals.collectionRate}
          />
        </div>
      )}

      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-black text-[13px] uppercase tracking-wide text-slate-400">Tagihan Siswa</h3>
      </div>

      {filteredTagihan.length === 0 ? (
        <EmptyState
          icon="💸"
          title="Belum Ada Tagihan"
          description="Silakan generate tagihan bulanan atau kegiatan terlebih dahulu."
        />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm md:block">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full min-w-[1040px] table-fixed text-sm">
                <colgroup>
                  <col className="w-12" />
                  <col className="w-[260px]" />
                  <col className="w-[190px]" />
                  <col className="w-28" />
                  <col className="w-36" />
                  <col className="w-36" />
                  <col className="w-36" />
                  <col className="w-24" />
                </colgroup>
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="bg-slate-50 px-3 py-2.5 text-left text-[11px] font-black uppercase tracking-wide text-slate-400"></th>
                    <th className="bg-slate-50 px-3 py-2.5 text-left text-[11px] font-black uppercase tracking-wide text-slate-500">
                      Siswa
                    </th>
                    <th className="bg-slate-50 px-3 py-2.5 text-left text-[11px] font-black uppercase tracking-wide text-slate-500">
                      Jenis
                    </th>
                    <th className="bg-slate-50 px-3 py-2.5 text-left text-[11px] font-black uppercase tracking-wide text-slate-500">
                      Periode
                    </th>
                    <th className="bg-slate-50 px-3 py-2.5 text-right text-[11px] font-black uppercase tracking-wide text-slate-500">
                      Final
                    </th>
                    <th className="bg-slate-50 px-3 py-2.5 text-right text-[11px] font-black uppercase tracking-wide text-slate-500">
                      Terbayar
                    </th>
                    <th className="bg-slate-50 px-3 py-2.5 text-center text-[11px] font-black uppercase tracking-wide text-slate-500">
                      Status
                    </th>
                    <th className="sticky right-0 z-10 border-l border-slate-200/80 bg-slate-50 px-3 py-2.5 text-right text-[11px] font-black uppercase tracking-wide text-slate-500">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTagihan.map((t) => {
                    const student = siswa.find((x) => x.id === t.siswa_id);
                    return (
                      <tr
                        key={t.id}
                        className={
                          selectedBills.includes(t.id) ? 'bg-primary-container/55' : 'bg-white hover:bg-slate-50/70'
                        }
                      >
                        <td className="px-3 py-2.5 align-middle">
                          <input
                            type="checkbox"
                            checked={selectedBills.includes(t.id)}
                            onChange={() => toggleBill(t.id)}
                            disabled={!canSelectBill(t)}
                            className="rounded border-slate-300 text-primary focus:ring-primary disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                          />
                        </td>
                        <td className="px-3 py-2.5 align-middle">
                          <div className="flex min-w-0 items-center gap-3">
                            <StudentAvatar name={t.siswa_nama} url={student?.foto} size="sm" />
                            <div className="min-w-0">
                              <div className="truncate font-black text-text-main" title={t.siswa_nama}>
                                {t.siswa_nama}
                              </div>
                              <div
                                className="mt-0.5 truncate text-[11px] font-semibold text-slate-400"
                                title={t.cabang_nama || ''}
                              >
                                {t.cabang_nama || 'Cabang'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 align-middle">
                          <div className="truncate font-bold text-slate-700" title={t.nama}>
                            {t.nama}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 align-middle font-bold text-slate-500">{t.periode || '-'}</td>
                        <td className="px-3 py-2.5 text-right align-middle font-black tabular-nums text-slate-900">
                          {money(t.nominal_final)}
                        </td>
                        <td className="px-3 py-2.5 text-right align-middle font-black tabular-nums text-emerald-600">
                          {money(t.paid_amount)}
                        </td>
                        <td className="px-3 py-2.5 text-center align-middle">
                          <BillingStatusBadge status={t.status} />
                        </td>
                        <td className="sticky right-0 z-10 border-l border-slate-200/80 bg-inherit px-3 py-2.5 align-middle">
                          <div className="flex justify-end gap-1.5">
                            <IconButton
                              icon={FilePenLine}
                              label={`Koreksi tagihan ${t.siswa_nama}`}
                              onClick={() => correctBill(t)}
                              size="sm"
                              className="hover:bg-slate-100 text-slate-600"
                            />
                            <IconButton
                              icon={Ban}
                              label={`Void tagihan ${t.siswa_nama}`}
                              onClick={() => voidBill(t)}
                              size="sm"
                              variant="danger"
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50">
                    <td className="px-3 py-2.5"></td>
                    <td colSpan={3} className="px-3 py-2.5 text-xs font-black uppercase tracking-wide text-slate-500">
                      Total ringkasan
                    </td>
                    <td className="px-3 py-2.5 text-right font-black tabular-nums text-slate-900">
                      {money(totals.totalFinal)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-black tabular-nums text-emerald-600">
                      {money(totals.totalPaid)}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="inline-flex items-center rounded-full bg-primary-container px-2.5 py-0.5 text-xs font-black text-primary">
                        {totals.collectionRate}% Terkoleksi
                      </span>
                    </td>
                    <td className="sticky right-0 z-10 border-l border-slate-200/80 bg-slate-50 px-3 py-2.5"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          <div className="block md:hidden space-y-3">
            {filteredTagihan.map((t) => {
              const student = siswa.find((x) => x.id === t.siswa_id);
              const colorMap = {
                lunas: 'bg-emerald-500',
                paid: 'bg-emerald-500',
                confirmed: 'bg-emerald-500',
                sebagian: 'bg-blue-500',
                partially_paid: 'bg-blue-500',
                pending_verification: 'bg-violet-500',
                issued: 'bg-sky-500',
                open: 'bg-amber-500',
                unpaid: 'bg-amber-500'
              };
              const accentColor = colorMap[(t.status || '').toLowerCase()] || 'bg-slate-400';

              return (
                <div
                  key={t.id}
                  className="relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition duration-200 hover:border-slate-300"
                >
                  {/* Decorative side accent color bar indicating status */}
                  <div className={`absolute top-0 left-0 w-1.5 h-full ${accentColor}`} />
                  <div className="flex flex-col gap-2.5 p-3.5 pl-4">
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="flex items-center h-5 mt-0.5">
                          <input
                            type="checkbox"
                            checked={selectedBills.includes(t.id)}
                            onChange={() => toggleBill(t.id)}
                            disabled={!canSelectBill(t)}
                            className="rounded border-slate-300 text-primary focus:ring-primary cursor-pointer disabled:opacity-40"
                          />
                        </div>
                        <div className="flex gap-2.5 items-center min-w-0">
                          <StudentAvatar name={t.siswa_nama} url={student?.foto} size="sm" />
                          <div className="min-w-0">
                            <div className="font-black text-sm text-slate-800 truncate">{t.siswa_nama}</div>
                            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mt-0.5">
                              {t.nama}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0">
                        <BillingStatusBadge status={t.status} />
                      </div>
                    </div>

                    {/* Receipt-style dashed separator line */}
                    <div className="border-t border-dashed border-slate-200 my-1" />

                    <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50/70 p-3 rounded-xl border border-slate-100">
                      <div>
                        <span className="text-slate-400 font-semibold uppercase tracking-wider text-[9px] block mb-0.5">
                          Periode
                        </span>
                        <span className="font-bold text-slate-700">{t.periode || '-'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-semibold uppercase tracking-wider text-[9px] block mb-0.5">
                          Telah Terbayar
                        </span>
                        <span className="font-bold text-emerald-600 tabular-nums">{money(t.paid_amount)}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-slate-400 font-semibold uppercase tracking-wider text-[9px] block mb-0.5">
                          Nominal Tagihan
                        </span>
                        <span className="font-black text-slate-800 text-sm tabular-nums">{money(t.nominal_final)}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Aksi</span>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => correctBill(t)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] font-black text-slate-600 bg-white hover:bg-slate-50 transition active:scale-95"
                        >
                          <FilePenLine className="w-3.5 h-3.5" /> Koreksi
                        </button>
                        <button
                          type="button"
                          onClick={() => voidBill(t)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-[11px] font-black text-red-600 bg-red-50 hover:bg-red-100 transition active:scale-95"
                        >
                          <Ban className="w-3.5 h-3.5" /> Void
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Mobile Summary Slip */}
            <div className="relative space-y-2.5 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3.5 shadow-sm">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-amber-500" />
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                Ringkasan Total Filtered
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 font-medium block mb-0.5">Total Tagihan:</span>
                  <span className="font-extrabold text-sm text-slate-800 tabular-nums">{money(totals.totalFinal)}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-medium block mb-0.5">Total Terbayar:</span>
                  <span className="font-extrabold text-sm text-emerald-600 tabular-nums">
                    {money(totals.totalPaid)}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200/80 pt-2.5 mt-1">
                <div className="flex flex-col">
                  <span className="text-[9px] text-slate-400 font-black uppercase tracking-wide">Outstanding</span>
                  <span className="text-xs text-amber-600 font-black tabular-nums">
                    {money(totals.totalOutstanding)}
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-primary-container text-primary">
                  {totals.collectionRate}% Terkoleksi
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );

  const renderPembayaranTab = () => (
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

  const renderTarifTab = () => (
    <>
      {/* Toolbar / Configuration Selector */}
      <div className="mb-4 flex flex-col justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:p-4">
        <div className="flex flex-col w-full sm:w-auto">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Tahun Ajaran</span>
          <CustomSelect
            value={filterTahunAjaran}
            onChange={(e) => setFilterTahunAjaran(e.target.value)}
            className="w-full sm:max-w-[150px] shadow-sm"
          >
            <option value="2025/2026">2025/2026</option>
            <option value="2026/2027">2026/2027</option>
            {filterTahunAjaran !== '2025/2026' && filterTahunAjaran !== '2026/2027' && (
              <option value={filterTahunAjaran}>{filterTahunAjaran}</option>
            )}
          </CustomSelect>
        </div>
        <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:items-center">
          {user.role === 'admin' && (
            <button
              type="button"
              onClick={() => {
                setTarifForm({ ...blankTarifForm(), cabang_id: m.cabangId || '' });
                setShowTarifModal(true);
              }}
              className="flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-black text-slate-700 shadow-sm transition active:scale-95"
            >
              <Plus className="w-4 h-4 text-slate-500" /> Tarif
            </button>
          )}
          {['admin', 'admin_cabang'].includes(user.role) && (
            <button
              type="button"
              onClick={() => setShowDiskonModal(true)}
              className="flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-black text-slate-700 shadow-sm transition active:scale-95"
            >
              <Plus className="w-4 h-4 text-slate-500" /> Diskon
            </button>
          )}
        </div>
      </div>

      <div className="mb-6">
        <h3 className="mb-3 text-[13px] font-black uppercase tracking-wide text-slate-400">Daftar Tarif Biaya</h3>
        {tarif.length === 0 ? (
          <EmptyState icon="📋" title="Belum Ada Tarif" description="Silakan buat tarif baru terlebih dahulu." />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Object.entries(groupedTarif).map(([groupName, items]) => (
              <div
                key={groupName}
                className="flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md sm:p-4"
              >
                <div>
                  <div className="flex items-center gap-2.5 mb-4 border-b border-slate-100 pb-3">
                    <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center font-black text-sm shrink-0">
                      {groupName === 'Global' ? 'G' : groupName.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="font-black text-slate-800 leading-tight">
                        {groupName === 'Global' ? 'Tarif Global / Umum' : groupName}
                      </h4>
                      <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider mt-0.5">
                        {items.length} Tipe Tarif
                      </p>
                    </div>
                  </div>
                  <div className="max-h-56 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                    {items.map((t) => {
                      const isActive = t.aktif !== 0;
                      return (
                        <div
                          key={t.id}
                          className={`rounded-lg border p-2.5 transition duration-150 ${!isActive ? 'border-dashed border-slate-300 bg-slate-50/50 opacity-75' : 'border-slate-100 bg-white hover:border-slate-200'}`}
                        >
                          <div className="flex justify-between items-start gap-2.5">
                            <div className="min-w-0">
                              <div className="font-bold text-xs text-slate-800 truncate" title={t.nama}>
                                {t.nama}
                              </div>
                              <div className="flex items-center gap-1.5 mt-1.5">
                                <span className="inline-block px-1.5 py-0.5 rounded text-[8px] font-black bg-slate-100 text-slate-500 uppercase tracking-wider">
                                  {t.jenis}
                                </span>
                                {!isActive && (
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[8px] font-black bg-red-50 text-red-600 uppercase tracking-wider">
                                    Nonaktif
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1.5 shrink-0">
                              <div className="text-xs font-black text-slate-800 tabular-nums">{money(t.nominal)}</div>
                              {user.role === 'admin' && (
                                <IconButton
                                  icon={Pencil}
                                  label={`Edit tarif ${t.nama}`}
                                  onClick={() => openEditTarif(t)}
                                  size="sm"
                                  className="hover:bg-slate-100 text-slate-500"
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-[13px] font-black uppercase tracking-wide text-slate-400">
          Diskon & Keringanan Siswa
        </h3>
        {diskon.length === 0 ? (
          <EmptyState
            icon="%"
            title="Belum Ada Diskon"
            description="Tambahkan keringanan siswa jika ada potongan khusus."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {groupedDiskon.map((group) => {
              const student = siswa.find((x) => x.id === group.siswa_id);
              const adaAktif = group.items.some((d) => d.aktif !== 0);

              return (
                <div
                  key={group.siswa_id}
                  className={`relative flex flex-col overflow-hidden rounded-2xl border bg-white p-4 shadow-sm transition-all duration-300 hover:border-emerald-200 hover:shadow-md ${!adaAktif ? 'border-dashed border-slate-300 bg-slate-50/50 opacity-75' : 'border-slate-200/80 bg-white'}`}
                >
                  {/* Visual Left Ticket Border Highlight */}
                  <div
                    className={`absolute top-0 left-0 w-1.5 h-full ${adaAktif ? 'bg-emerald-500' : 'bg-slate-400'}`}
                  />

                  <div className="pl-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <StudentAvatar name={group.siswa_nama} url={student?.foto} size="sm" />
                      <div className="min-w-0">
                        <h4 className="font-black text-sm text-slate-800 truncate">{group.siswa_nama}</h4>
                        <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[8px] font-black bg-slate-100 text-slate-500 uppercase tracking-wider">
                          {group.items.length} diskon{group.items.length > 1 ? ' · menumpuk' : ''}
                        </span>
                      </div>
                    </div>

                    {/* Voucher Ticket Dashed Divider */}
                    <div className="my-3 border-t border-dashed border-slate-200" />

                    <div className="space-y-2">
                      {group.items.map((d) => {
                        const isActive = d.aktif !== 0;
                        return (
                          <div
                            key={d.id}
                            className="rounded-xl border border-emerald-100/50 bg-emerald-50/70 p-3 transition-colors hover:bg-emerald-100/50"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-slate-100 text-slate-500 uppercase tracking-wider">
                                    Diskon {d.jenis}
                                  </span>
                                  {isActive ? (
                                    <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 text-[8px] font-black uppercase tracking-wider">
                                      Kupon Aktif
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-lg bg-red-100 text-red-700 text-[8px] font-black uppercase tracking-wider">
                                      Nonaktif
                                    </span>
                                  )}
                                </div>
                                <div className="mt-1.5 flex items-baseline gap-2">
                                  <span className="text-[9px] font-black text-emerald-600/80 uppercase tracking-wider">
                                    Nilai Potongan
                                  </span>
                                  <span className="text-base sm:text-lg font-black text-emerald-700 tabular-nums">
                                    {d.tipe === 'persen' ? `${d.nilai}%` : money(d.nilai)}
                                  </span>
                                </div>
                                {d.catatan && (
                                  <p className="mt-2 rounded-lg border border-emerald-100/60 bg-white/60 p-2 text-xs font-medium italic text-slate-500">
                                    "{d.catatan}"
                                  </p>
                                )}
                              </div>
                              {['admin', 'admin_cabang'].includes(user.role) && (
                                <IconButton
                                  icon={Pencil}
                                  label={`Edit diskon ${d.siswa_nama} ${d.jenis}`}
                                  onClick={() => openEditDiskon(d)}
                                  size="sm"
                                  className="shrink-0 text-slate-500 hover:bg-white/70"
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );

  const renderInvoiceTab = () => (
    <>
      <div className="mb-4 flex flex-col gap-1 rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm sm:p-4">
        <h3 className="font-black text-text-main text-base">Invoice Tagihan</h3>
        <p className="text-xs text-slate-400 mt-1">Daftar invoice resmi yang diterbitkan untuk wali murid</p>
      </div>
      {invoices.length === 0 ? (
        <EmptyState icon="📄" title="Belum Ada Invoice" description="Belum ada invoice tagihan yang dibuat." />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm md:block">
            <Table headers={['Nomor', 'Siswa', 'Total', 'Status', '']}>
              {invoices.map((i) => {
                const student = siswa.find((x) => x.id === i.siswa_id);
                return (
                  <tr key={i.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors">
                    <Td>
                      <code className="px-2 py-1 rounded bg-slate-100 font-mono text-[11px] text-slate-600 font-bold border border-slate-200/60">
                        {i.invoice_no}
                      </code>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-3 py-1">
                        <StudentAvatar name={i.siswa_nama} url={student?.foto} size="sm" />
                        <span className="font-semibold text-slate-800">{i.siswa_nama}</span>
                      </div>
                    </Td>
                    <MoneyCell className="text-slate-900 font-extrabold">{money(i.total)}</MoneyCell>
                    <Td>
                      <BillingStatusBadge status={i.status} />
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <IconButton
                          icon={FileText}
                          label={`PDF invoice ${i.invoice_no}`}
                          onClick={() => openPdf('invoice', i.id)}
                          size="sm"
                          className="hover:bg-slate-100 text-slate-600"
                        />
                        {i.status !== 'void' && i.wali_no_wa && (
                          <IconButton
                            icon={Smartphone}
                            label="Kirim WA"
                            onClick={() => sendWhatsAppInvoice(i)}
                            size="sm"
                            className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
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
            {invoices.map((i) => {
              const student = siswa.find((x) => x.id === i.siswa_id);
              const colorMap = {
                lunas: 'bg-emerald-500',
                paid: 'bg-emerald-500',
                confirmed: 'bg-emerald-500',
                sebagian: 'bg-blue-500',
                partially_paid: 'bg-blue-500',
                pending_verification: 'bg-violet-500 animate-pulse',
                issued: 'bg-sky-500',
                open: 'bg-amber-500',
                unpaid: 'bg-amber-500'
              };
              const accentColor = colorMap[(i.status || '').toLowerCase()] || 'bg-slate-400';

              return (
                <div
                  key={i.id}
                  className="relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition duration-200 hover:border-slate-300"
                >
                  <div className={`absolute top-0 left-0 w-1.5 h-full ${accentColor}`} />
                  <div className="flex flex-col gap-2.5 p-3.5 pl-4">
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="min-w-0">
                        <span className="text-[10px] text-slate-400 font-bold block">Invoice No</span>
                        <span className="inline-block mt-0.5">
                          <code className="px-1.5 py-0.5 rounded bg-slate-50 font-mono text-[9px] text-slate-500 font-bold border border-slate-200/50">
                            {i.invoice_no}
                          </code>
                        </span>
                      </div>
                      <div className="shrink-0">
                        <BillingStatusBadge status={i.status} />
                      </div>
                    </div>

                    <div className="border-t border-dashed border-slate-200 my-1" />

                    <div className="flex items-center gap-3">
                      <StudentAvatar name={i.siswa_nama} url={student?.foto} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="font-black text-sm text-slate-800 truncate">{i.siswa_nama}</div>
                        <div className="text-[10px] font-semibold text-slate-400 mt-0.5">
                          Total Tagihan:{' '}
                          <span className="font-extrabold text-slate-800 tabular-nums">{money(i.total)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
                      <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider">
                        Aksi Invoice
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => openPdf('invoice', i.id)}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-black text-slate-700 bg-white hover:bg-slate-50 active:scale-95 transition flex-1"
                        >
                          <FileText className="w-3.5 h-3.5 text-slate-500" /> Unduh PDF
                        </button>
                        {i.status !== 'void' && i.wali_no_wa && (
                          <button
                            type="button"
                            onClick={() => sendWhatsAppInvoice(i)}
                            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-200 text-xs font-black text-emerald-700 bg-emerald-50 hover:bg-emerald-100 active:scale-95 transition flex-1"
                          >
                            <Smartphone className="w-3.5 h-3.5 text-emerald-600" /> Kirim WA
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

  const renderModals = () => (
    <>
      {preview && (
        <Modal
          title={`Preview Generate ${preview.kind === 'bulanan' ? 'Bulanan' : 'Kegiatan'}`}
          onClose={() => setPreview(null)}
          maxWidth="max-w-4xl"
        >
          <div className="space-y-3.5">
            <div className="text-xs text-slate-600 sm:text-sm">
              {preview.kind === 'bulanan'
                ? `Periode: ${preview.period} | Tahun ajaran: ${preview.tahun_ajaran}`
                : `Tahun ajaran: ${preview.tahun_ajaran}`}
              {' | '}Cabang:{' '}
              {m.cabang.find((c) => String(c.id) === String(preview.cabang_id))?.nama || preview.cabang_id}
            </div>
            {preview.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                <div className="font-black mb-1">Error ({preview.errors.length}):</div>
                {preview.errors.map((e, i) => (
                  <div key={i}>{e}</div>
                ))}
              </div>
            )}
            {newItems.length > 0 && (
              <>
                <div className="font-black text-text-main">Tagihan baru ({newItems.length})</div>
                <div className="max-h-72 overflow-x-auto">
                  <table className="w-full min-w-[46rem] text-sm">
                    <thead>
                      <tr>
                        <th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Siswa</th>
                        <th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Jenis</th>
                        <th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Jenjang</th>
                        <th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Paket</th>
                        <th className="bg-slate-50 px-3 py-2 text-right font-black text-slate-500 whitespace-nowrap">
                          Awal
                        </th>
                        <th className="bg-slate-50 px-3 py-2 text-right font-black text-slate-500 whitespace-nowrap">
                          Diskon
                        </th>
                        <th className="bg-slate-50 px-3 py-2 text-right font-black text-slate-500 whitespace-nowrap">
                          Final
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {newItems.map((p, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{p.siswa_nama}</td>
                          <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{p.nama}</td>
                          <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{p.jenjang_nama}</td>
                          <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{p.paket}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-700 whitespace-nowrap">
                            {money(p.nominal_awal)}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-700 whitespace-nowrap">
                            {money(p.diskon_amount)}
                          </td>
                          <td className="px-3 py-2 text-right font-black tabular-nums text-slate-900 whitespace-nowrap">
                            {money(p.nominal_final)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {existingItems.length > 0 && (
              <div className="rounded-xl border border-primary/20 bg-primary-container px-3 py-2 text-sm font-bold text-primary-active">
                {existingItems.length} tagihan sudah ada dan akan dilewati.
              </div>
            )}
            {newItems.length === 0 && existingItems.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">
                Tidak ada tagihan yang akan dibuat.
              </div>
            )}
            <div className="flex gap-2">
              <ActionButton icon={CheckCircle2} onClick={confirmGenerate} disabled={newItems.length === 0}>
                Konfirmasi Generate
              </ActionButton>
              <ActionButton icon={X} onClick={() => setPreview(null)} variant="secondary">
                Batal
              </ActionButton>
            </div>
          </div>
        </Modal>
      )}

      {showTarifModal && (
        <Modal title="Tambah Tarif Baru" onClose={requestCloseTarif}>
          <div className="space-y-3.5">
            <div className="grid sm:grid-cols-2 gap-3.5">
              {user.role === 'admin' && (
                <div className="sm:col-span-2">
                  <label className="label font-bold text-slate-700 dark:text-slate-300">
                    Cabang Sekolah <span className="text-red-500">*</span>
                  </label>
                  <CustomSelect
                    value={tarifForm.cabang_id}
                    onChange={(e) => setTarifForm((f) => ({ ...f, cabang_id: e.target.value }))}
                    className="input w-full"
                  >
                    <option value="">Pilih Cabang</option>
                    {m.cabang.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nama}
                      </option>
                    ))}
                  </CustomSelect>
                </div>
              )}
              <div>
                <label className="label font-bold text-slate-700 dark:text-slate-300">
                  Tahun Ajaran <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="Tahun ajaran"
                  value={tarifForm.tahun_ajaran}
                  onChange={(v) => setTarifForm((f) => ({ ...f, tahun_ajaran: v }))}
                />
              </div>
              <div>
                <label className="label font-bold text-slate-700 dark:text-slate-300">
                  Jenjang <span className="text-red-500">*</span>
                </label>
                <CustomSelect
                  value={tarifForm.jenjang_id}
                  onChange={(e) => setTarifForm((f) => ({ ...f, jenjang_id: e.target.value }))}
                  className="input w-full"
                >
                  <option value="">Pilih Jenjang</option>
                  {m.jenjang.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.nama}
                    </option>
                  ))}
                </CustomSelect>
              </div>
              <div>
                <label className="label font-bold text-slate-700 dark:text-slate-300">
                  Jenis Tarif <span className="text-red-500">*</span>
                </label>
                <CustomSelect
                  value={tarifForm.jenis}
                  onChange={(e) =>
                    setTarifForm((f) => ({ ...f, jenis: e.target.value, nama: e.target.value.toUpperCase() }))
                  }
                  className="input w-full"
                >
                  {['spp', 'full_day', 'care', 'kegiatan'].map((x) => (
                    <option key={x} value={x}>
                      {x.toUpperCase()}
                    </option>
                  ))}
                </CustomSelect>
              </div>
              <div>
                <label className="label font-bold text-slate-700 dark:text-slate-300">
                  Nama Tarif <span className="text-red-500">*</span>
                </label>
                <Input
                  placeholder="Nama tarif (cth: SPP KB A)"
                  value={tarifForm.nama}
                  onChange={(v) => setTarifForm((f) => ({ ...f, nama: v }))}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label font-bold text-slate-700 dark:text-slate-300">
                  Nominal <span className="text-red-500">*</span>
                </label>
                <div className="relative flex items-stretch w-full">
                  <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-slate-200 bg-slate-50 text-slate-500 text-sm font-bold dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 shrink-0">
                    Rp
                  </span>
                  <input
                    type="number"
                    placeholder="Nominal tarif"
                    value={tarifForm.nominal}
                    onChange={(e) => setTarifForm((f) => ({ ...f, nominal: e.target.value }))}
                    className="input rounded-l-none w-full"
                  />
                </div>
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <ActionButton icon={X} onClick={requestCloseTarif} variant="secondary">
                Batal
              </ActionButton>
              <ActionButton icon={submitting ? undefined : Save} disabled={submitting} onClick={addTarif}>
                {submitting ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Menyimpan…
                  </span>
                ) : (
                  'Simpan Tarif'
                )}
              </ActionButton>
            </div>
          </div>
        </Modal>
      )}

      {showDiskonModal && (
        <Modal title="Tambah Diskon / Keringanan Siswa" onClose={requestCloseDiskon}>
          <div className="space-y-3.5">
            <div className="grid sm:grid-cols-2 gap-3.5">
              {user.role === 'admin' && !m.cabangId && (
                <div className="sm:col-span-2">
                  <label className="label font-bold text-slate-700 dark:text-slate-300">Filter Cabang Siswa</label>
                  <CustomSelect
                    value={localCabangIdDiskon}
                    onChange={(e) => {
                      setLocalCabangIdDiskon(e.target.value);
                      setDiskonForm((f) => ({ ...f, siswa_id: '' }));
                    }}
                    className="input w-full"
                  >
                    <option value="">Semua Cabang</option>
                    {m.cabang.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nama}
                      </option>
                    ))}
                  </CustomSelect>
                </div>
              )}
              <div className="sm:col-span-2">
                <label className="label font-bold text-slate-700 dark:text-slate-300">
                  Siswa <span className="text-red-500">*</span>
                </label>
                <SearchableSelect
                  value={diskonForm.siswa_id}
                  onChange={(e) => setDiskonForm((f) => ({ ...f, siswa_id: e.target.value }))}
                  className="input w-full"
                  placeholder="Pilih Siswa"
                  searchPlaceholder="Cari nama siswa…"
                >
                  <option value="">Pilih Siswa</option>
                  {filteredSiswaForDiskon.map((s) => (
                    <option
                      key={s.id}
                      value={s.id}
                    >{`${s.nama}${s.rombel_nama ? ' - ' + s.rombel_nama : ''}${!m.cabangId && s.cabang_nama ? ' (' + s.cabang_nama + ')' : ''}`}</option>
                  ))}
                </SearchableSelect>
              </div>
              <div>
                <label className="label font-bold text-slate-700 dark:text-slate-300">
                  Jenis Biaya <span className="text-red-500">*</span>
                </label>
                <CustomSelect
                  value={diskonForm.jenis}
                  onChange={(e) => setDiskonForm((f) => ({ ...f, jenis: e.target.value }))}
                  className="input w-full"
                >
                  {['spp', 'full_day', 'care', 'kegiatan'].map((x) => (
                    <option key={x} value={x}>
                      {x.toUpperCase()}
                    </option>
                  ))}
                </CustomSelect>
              </div>
              <div>
                <label className="label font-bold text-slate-700 dark:text-slate-300">
                  Tipe Diskon <span className="text-red-500">*</span>
                </label>
                <CustomSelect
                  value={diskonForm.tipe}
                  onChange={(e) => setDiskonForm((f) => ({ ...f, tipe: e.target.value }))}
                  className="input w-full"
                >
                  <option value="nominal">Nominal (Rp)</option>
                  <option value="persen">Persen (%)</option>
                </CustomSelect>
              </div>
              <div>
                <label className="label font-bold text-slate-700 dark:text-slate-300">
                  Nilai Diskon <span className="text-red-500">*</span>
                </label>
                <div className="relative flex items-stretch w-full">
                  {diskonForm.tipe === 'nominal' && (
                    <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-slate-200 bg-slate-50 text-slate-500 text-sm font-bold dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 shrink-0">
                      Rp
                    </span>
                  )}
                  <input
                    type="number"
                    placeholder={diskonForm.tipe === 'nominal' ? 'Nominal diskon' : 'Persen diskon'}
                    value={diskonForm.nilai}
                    onChange={(e) => setDiskonForm((f) => ({ ...f, nilai: e.target.value }))}
                    className={`input w-full ${diskonForm.tipe === 'nominal' ? 'rounded-l-none' : 'rounded-r-none'}`}
                  />
                  {diskonForm.tipe === 'persen' && (
                    <span className="inline-flex items-center px-3 rounded-r-lg border border-l-0 border-slate-200 bg-slate-50 text-slate-500 text-sm font-bold dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 shrink-0">
                      %
                    </span>
                  )}
                </div>
              </div>
              <div>
                <label className="label font-bold text-slate-700 dark:text-slate-300">Catatan</label>
                <Input
                  placeholder="Keterangan diskon"
                  value={diskonForm.catatan}
                  onChange={(v) => setDiskonForm((f) => ({ ...f, catatan: v }))}
                />
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <ActionButton icon={X} onClick={requestCloseDiskon} variant="secondary">
                Batal
              </ActionButton>
              <ActionButton icon={submitting ? undefined : Save} disabled={submitting} onClick={addDiskon}>
                {submitting ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Menyimpan…
                  </span>
                ) : (
                  'Simpan Diskon'
                )}
              </ActionButton>
            </div>
          </div>
        </Modal>
      )}

      {editingTarif && (
        <Modal title="Edit Tarif" onClose={() => setEditingTarif(null)}>
          <div className="space-y-3.5">
            <div className="grid sm:grid-cols-2 gap-3.5">
              <div className="sm:col-span-2">
                <label className="label font-bold text-slate-700 dark:text-slate-300">Nama Tarif</label>
                <Input
                  value={editingTarif.nama || ''}
                  onChange={(v) => setEditingTarif((t) => ({ ...t, nama: v }))}
                  placeholder="Nama tarif"
                />
              </div>
              <div>
                <label className="label font-bold text-slate-700 dark:text-slate-300">Nominal</label>
                <div className="relative flex items-stretch w-full">
                  <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-slate-200 bg-slate-50 text-slate-500 text-sm font-bold dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 shrink-0">
                    Rp
                  </span>
                  <input
                    type="number"
                    value={editingTarif.nominal || ''}
                    onChange={(e) => setEditingTarif((t) => ({ ...t, nominal: e.target.value }))}
                    className="input rounded-l-none w-full"
                    min="0"
                  />
                </div>
              </div>
              <div className="flex items-end">
                <Toggle
                  label={editingTarif.aktif === 0 ? 'Nonaktif' : 'Aktif'}
                  checked={editingTarif.aktif !== 0}
                  onChange={(checked) => setEditingTarif((t) => ({ ...t, aktif: checked ? 1 : 0 }))}
                />
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-500">
              {editingTarif.jenjang_nama || 'Jenjang'} · {String(editingTarif.jenis || '').toUpperCase()} ·{' '}
              {editingTarif.tahun_ajaran}
            </div>{' '}
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <ActionButton icon={X} onClick={() => setEditingTarif(null)} variant="secondary">
                Batal
              </ActionButton>
              <ActionButton icon={submitting ? undefined : Save} disabled={submitting} onClick={saveTarifEdit}>
                {submitting ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Menyimpan…
                  </span>
                ) : (
                  'Simpan Tarif'
                )}
              </ActionButton>
            </div>
          </div>
        </Modal>
      )}

      {editingDiskon && (
        <Modal title="Edit Diskon / Keringanan" onClose={() => setEditingDiskon(null)}>
          <div className="space-y-3.5">
            <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
              <div className="text-[10px] font-black text-slate-400 uppercase text-slate-500">Siswa</div>
              <div className="font-black text-slate-800">{editingDiskon.siswa_nama}</div>
              <div className="text-xs text-slate-500">
                {String(editingDiskon.jenis || '').toUpperCase()} · {editingDiskon.tahun_ajaran}
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3.5">
              <div>
                <label className="label font-bold text-slate-700 dark:text-slate-300">Tipe Diskon</label>
                <CustomSelect
                  value={editingDiskon.tipe}
                  onChange={(e) => setEditingDiskon((d) => ({ ...d, tipe: e.target.value }))}
                  className="input w-full"
                >
                  <option value="nominal">Nominal (Rp)</option>
                  <option value="persen">Persen (%)</option>
                </CustomSelect>
              </div>
              <div>
                <label className="label font-bold text-slate-700 dark:text-slate-300">Nilai</label>
                <div className="relative flex items-stretch w-full">
                  {editingDiskon.tipe === 'nominal' && (
                    <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-slate-200 bg-slate-50 text-slate-500 text-sm font-bold dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 shrink-0">
                      Rp
                    </span>
                  )}
                  <input
                    type="number"
                    value={editingDiskon.nilai || ''}
                    onChange={(e) => setEditingDiskon((d) => ({ ...d, nilai: e.target.value }))}
                    className={`input w-full ${editingDiskon.tipe === 'nominal' ? 'rounded-l-none' : 'rounded-r-none'}`}
                    min="0"
                  />
                  {editingDiskon.tipe === 'persen' && (
                    <span className="inline-flex items-center px-3 rounded-r-lg border border-l-0 border-slate-200 bg-slate-50 text-slate-500 text-sm font-bold dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 shrink-0">
                      %
                    </span>
                  )}
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="label font-bold text-slate-700 dark:text-slate-300">Catatan</label>
                <Input
                  value={editingDiskon.catatan || ''}
                  onChange={(v) => setEditingDiskon((d) => ({ ...d, catatan: v }))}
                  placeholder="Catatan diskon"
                />
              </div>
              <div className="sm:col-span-2">
                <Toggle
                  label={editingDiskon.aktif === 0 ? 'Nonaktif' : 'Aktif'}
                  checked={editingDiskon.aktif !== 0}
                  onChange={(checked) => setEditingDiskon((d) => ({ ...d, aktif: checked ? 1 : 0 }))}
                />
              </div>
            </div>{' '}
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <ActionButton icon={X} onClick={() => setEditingDiskon(null)} variant="secondary">
                Batal
              </ActionButton>
              <ActionButton icon={submitting ? undefined : Save} disabled={submitting} onClick={saveDiskonEdit}>
                {submitting ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Menyimpan…
                  </span>
                ) : (
                  'Simpan Diskon'
                )}
              </ActionButton>
            </div>
          </div>
        </Modal>
      )}

      <PaymentModal
        user={user}
        m={m}
        localCabangIdPayment={localCabangIdPayment}
        setLocalCabangIdPayment={setLocalCabangIdPayment}
        payForm={payForm}
        setPayForm={setPayForm}
        filteredSiswaForPayment={filteredSiswaForPayment}
        alokasiPreview={alokasiPreview}
        submitting={submitting}
        onClose={requestClosePayment}
        onPay={pay}
      />
      <AlokasiEditModal alokasiEdit={alokasiEdit} setAlokasiEdit={setAlokasiEdit} siswa={siswa} onSave={saveAlokasi} />
      {confirmAction && <ConfirmModal action={confirmAction} onClose={() => setConfirmAction(null)} />}
    </>
  );

  const billingTabs = [
    { key: 'ringkasan', label: 'Ringkasan', icon: BarChart3 },
    { key: 'tagihan', label: 'Tagihan', icon: Receipt },
    { key: 'pembayaran', label: 'Pembayaran', icon: CreditCard, badge: billingStats.pendingCount || 0 },
    { key: 'tarif', label: 'Tarif & Diskon', icon: Settings },
    { key: 'invoice', label: 'Invoice', icon: FileText }
  ];
  const tabRefs = useRef({});
  const [tabPill, setTabPill] = useState({ left: 0, width: 0 });
  useLayoutEffect(() => {
    const el = tabRefs.current[billingSubTab];
    if (!el) return;
    const next = { left: el.offsetLeft, width: el.offsetWidth };
    setTabPill((prev) => (prev.left === next.left && prev.width === next.width ? prev : next));
  }, [billingSubTab, billingStats.pendingCount]);

  return (
    <Panel title="Billing" right={<CabangFilter user={user} {...m} />}>
      <div className="relative mb-4 flex gap-1 overflow-x-auto scrollbar-none rounded-xl bg-slate-100/70 p-1">
        <div
          className="pointer-events-none absolute top-1 bottom-1 z-0 rounded-lg bg-white shadow-sm ring-1 ring-slate-900/5 transition-[left,width] duration-300 ease-out"
          style={{ left: tabPill.left, width: tabPill.width }}
        />
        {billingTabs.map((tab) => (
          <button
            key={tab.key}
            ref={(el) => {
              tabRefs.current[tab.key] = el;
            }}
            onClick={() => setBillingSubTab(tab.key)}
            type="button"
            className={`relative z-10 flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-black transition-colors sm:px-3 sm:text-xs ${
              billingSubTab === tab.key ? 'text-text-main' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
            {tab.badge > 0 && (
              <span className="ml-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-amber-500 text-white text-[9px] font-black leading-none">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ═══ TAB CONTENT ═══ */}
      {billingSubTab === 'ringkasan' && renderRingkasanTab()}
      {billingSubTab === 'tagihan' && renderTagihanTab()}
      {billingSubTab === 'pembayaran' && renderPembayaranTab()}
      {billingSubTab === 'tarif' && renderTarifTab()}
      {billingSubTab === 'invoice' && renderInvoiceTab()}

      {/* ═══ MODALS & DIALOGS ═══ */}
      {renderModals()}
    </Panel>
  );
}
