import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';
import { ActionButton, Modal, CustomSelect, SearchableSelect } from '../../components/Shared';
import { todayWIB } from '../../utils/date';
import { BarChart3, CreditCard, FileText, Loader2, Receipt, Save, Settings, X } from 'lucide-react';
import { CabangFilter, Panel, Input, Toggle } from './AdminShared';
import { useMaster } from './useMaster';
import { ConfirmModal } from './billing/ConfirmModal';
import { PaymentModal } from './billing/PaymentModal';
import { AlokasiEditModal } from './billing/AlokasiEditModal';
import { PreviewGenerateModal } from './billing/PreviewGenerateModal';
import { RingkasanTab } from './billing/RingkasanTab';
import { InvoiceTab } from './billing/InvoiceTab';
import { TarifTab } from './billing/TarifTab';
import { PembayaranTab } from './billing/PembayaranTab';
import { TagihanTab } from './billing/TagihanTab';

export default function BillingTab({ user, toast }) {
  const m = useMaster(user);
  const currentSchoolYear = (() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const start = month >= 7 ? year : year - 1;
    return `${start}/${start + 1}`;
  })();

  const [selectedBills, setSelectedBills] = useState([]);
  const [preview, setPreview] = useState(null);
  const [alokasiPreview, setAlokasiPreview] = useState(null);
  const [alokasiEdit, setAlokasiEdit] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [localCabangIdDiskon, setLocalCabangIdDiskon] = useState('');
  const [localCabangIdPayment, setLocalCabangIdPayment] = useState('');

  const [filterTahunAjaran, setFilterTahunAjaran] = useState(currentSchoolYear);

  // Lima sumber data billing dimuat bersama: semuanya digambar di layar yang
  // sama dan saling bergantung (tagihan butuh tarif, pembayaran butuh tagihan).
  // Siswa dipisah karena endpoint-nya sama dengan tab Siswa — kunci `siswa`
  // dipakai bersama, jadi berpindah tab tidak memuat ulang daftar yang sama.
  const billingQ = useQuery({
    queryKey: ['billing', m.cabangId || '', filterTahunAjaran],
    queryFn: async () => {
      const [tarifData, diskonData, tagihanData, pembayaranData, invoicesData] = await Promise.all([
        api.tarif({ cabang_id: m.cabangId, tahun_ajaran: filterTahunAjaran }),
        api.diskon({ cabang_id: m.cabangId, tahun_ajaran: filterTahunAjaran }),
        api.tagihan({ cabang_id: m.cabangId }),
        api.pembayaran({ cabang_id: m.cabangId }),
        api.invoice({ cabang_id: m.cabangId })
      ]);
      return {
        tarif: tarifData,
        diskon: diskonData,
        tagihan: tagihanData,
        pembayaran: pembayaranData,
        invoices: invoicesData
      };
    }
  });
  const siswaQ = useQuery({
    queryKey: ['siswa', m.cabangId || ''],
    queryFn: () => api.siswa({ cabang_id: m.cabangId, status: 'semua' })
  });

  const tarif = useMemo(() => billingQ.data?.tarif ?? [], [billingQ.data]);
  const diskon = useMemo(() => billingQ.data?.diskon ?? [], [billingQ.data]);
  const tagihan = useMemo(() => billingQ.data?.tagihan ?? [], [billingQ.data]);
  const pembayaran = useMemo(() => billingQ.data?.pembayaran ?? [], [billingQ.data]);
  const invoices = useMemo(() => billingQ.data?.invoices ?? [], [billingQ.data]);
  const siswa = useMemo(() => siswaQ.data ?? [], [siswaQ.data]);

  // Setiap mutasi memuat ulang kedua kunci — satu nama supaya pemanggil tidak
  // perlu tahu bahwa daftar siswa punya kunci sendiri.
  const muatUlang = useCallback(() => {
    billingQ.refetch();
    siswaQ.refetch();
  }, [billingQ, siswaQ]);

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
          .catch(() => {
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
      muatUlang();
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
      muatUlang();
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
      muatUlang();
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
      muatUlang();
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
      muatUlang();
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
      muatUlang();
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
      muatUlang();
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
          muatUlang();
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
          muatUlang();
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
      muatUlang();
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
          muatUlang();
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
          muatUlang();
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
      muatUlang();
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

  const renderModals = () => (
    <>
      <PreviewGenerateModal
        preview={preview}
        newItems={newItems}
        existingItems={existingItems}
        cabang={m.cabang}
        onKonfirmasi={confirmGenerate}
        onTutup={() => setPreview(null)}
      />

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

      {/* Dulu modal ini dirender TANPA syarat, sehingga setiap kali tab Billing
          dibuka, dialog "Catat Pembayaran" langsung menutupi seluruh halaman.
          Flag showPaymentModal sudah ada sejak awal (dipakai ActionCard untuk
          membukanya) tetapi tidak pernah dipakai sebagai gerbang render. */}
      {showPaymentModal && (
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
      )}
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
      {billingSubTab === 'ringkasan' && (
        <RingkasanTab
          user={user}
          toast={toast}
          m={m}
          tarif={tarif}
          tagihan={tagihan}
          billingStats={billingStats}
          setBillingSubTab={setBillingSubTab}
          setShowPaymentModal={setShowPaymentModal}
        />
      )}
      {billingSubTab === 'tagihan' && (
        <TagihanTab
          user={user}
          m={m}
          billingStats={billingStats}
          siswa={siswa}
          filteredTagihan={filteredTagihan}
          totals={totals}
          selectedBills={selectedBills}
          canSelectBill={canSelectBill}
          toggleBill={toggleBill}
          invoice={invoice}
          correctBill={correctBill}
          voidBill={voidBill}
          filterPeriode={filterPeriode}
          setFilterPeriode={setFilterPeriode}
          filterTahunAjaran={filterTahunAjaran}
          setFilterTahunAjaran={setFilterTahunAjaran}
          showGenerate={showGenerate}
          setShowGenerate={setShowGenerate}
          form={form}
          setForm={setForm}
          generateCabangId={generateCabangId}
          setGenerateCabangId={setGenerateCabangId}
          previewBulanan={previewBulanan}
          previewKegiatan={previewKegiatan}
        />
      )}
      {billingSubTab === 'pembayaran' && (
        <PembayaranTab
          user={user}
          siswa={siswa}
          pembayaran={pembayaran}
          openPdf={openPdf}
          verify={verify}
          reject={reject}
          voidPay={voidPay}
          editAlokasi={editAlokasi}
          setShowPaymentModal={setShowPaymentModal}
        />
      )}
      {billingSubTab === 'tarif' && (
        <TarifTab
          user={user}
          m={m}
          blankTarifForm={blankTarifForm}
          tarif={tarif}
          diskon={diskon}
          siswa={siswa}
          groupedTarif={groupedTarif}
          groupedDiskon={groupedDiskon}
          filterTahunAjaran={filterTahunAjaran}
          setFilterTahunAjaran={setFilterTahunAjaran}
          setShowTarifModal={setShowTarifModal}
          setShowDiskonModal={setShowDiskonModal}
          setTarifForm={setTarifForm}
          openEditTarif={openEditTarif}
          openEditDiskon={openEditDiskon}
        />
      )}
      {billingSubTab === 'invoice' && (
        <InvoiceTab invoices={invoices} siswa={siswa} openPdf={openPdf} sendWhatsAppInvoice={sendWhatsAppInvoice} />
      )}

      {/* ═══ MODALS & DIALOGS ═══ */}
      {renderModals()}
    </Panel>
  );
}
