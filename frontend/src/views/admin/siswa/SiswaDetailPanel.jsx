// Panel detail siswa: data, QR penjemput, dan aksi terkait.
// Dipisah dari SiswaTab.jsx (sebelumnya 840 baris menumpuk dalam satu file).
import { useEffect, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import { api } from '../../../api';
import { ActionButton, IconButton, LogoMark, Modal, CustomSelect, CustomDatePicker } from '../../../components/Shared';
import { todayWIB } from '../../../utils/date';
import {
  CheckCircle2,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  Pencil,
  Power,
  QrCode,
  Save,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X
} from 'lucide-react';
import { FotoUpload } from '../AdminShared';
import { money, paketLabel } from '../../../utils/format';
import { downloadQrCard } from './downloadQrCard';

export function SiswaDetailPanel({ user, m, detail, setDetail, toast, refresh, close }) {
  const emptyPickup = { id: null, nama: '', no_wa: '', relasi: '', catatan: '', aktif: 1 };
  const initialMove = () => ({
    cabang_id: detail.enrollment?.cabang_id || m.cabangId || '',
    jenjang_id: detail.enrollment?.jenjang_id || '',
    rombel_id: detail.enrollment?.rombel_id || '',
    paket: detail.enrollment?.paket || 'reguler',
    tanggal_mulai: todayWIB(),
    alasan: 'Pindah cabang/rombel'
  });
  const [move, setMove] = useState(initialMove);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveConfirmOpen, setMoveConfirmOpen] = useState(false);
  const [targetRombel, setTargetRombel] = useState(m.rombel);
  const [pickupForm, setPickupForm] = useState(emptyPickup);
  const [pickupOpen, setPickupOpen] = useState(false);
  const [qrPreview, setQrPreview] = useState(null);
  const [qrReissueConfirm, setQrReissueConfirm] = useState(null);
  const [nfcConfirmOpen, setNfcConfirmOpen] = useState(false);
  const [tagihanSiswa, setTagihanSiswa] = useState(null);
  const [showNfc, setShowNfc] = useState(false);

  // Photo states for Edit Mode
  const [selectedFotoFile, setSelectedFotoFile] = useState(null);
  const [selectedFotoUrl, setSelectedFotoUrl] = useState('');
  const [fotoDeleted, setFotoDeleted] = useState(false);
  // Daftar rombel hanya dipakai sebagai cadangan saat permintaan gagal. Dibaca
  // lewat ref supaya perubahan daftar tidak memicu pemuatan ulang.
  const rombelRef = useRef(m.rombel);
  rombelRef.current = m.rombel;

  useEffect(() => {
    return () => {
      if (selectedFotoUrl) URL.revokeObjectURL(selectedFotoUrl);
    };
  }, [selectedFotoUrl]);

  useEffect(() => {
    if (move.cabang_id)
      api
        .rombel(move.cabang_id)
        .then(setTargetRombel)
        .catch(() => setTargetRombel(rombelRef.current));
  }, [move.cabang_id]);
  useEffect(() => {
    api
      .tagihan({ siswa_id: detail.id })
      .then(setTagihanSiswa)
      .catch(() => setTagihanSiswa([]));
  }, [detail.id]);
  const moveRombel = targetRombel.filter(
    (r) =>
      (!move.jenjang_id || String(r.jenjang_id) === String(move.jenjang_id)) &&
      (!move.cabang_id || String(r.cabang_id) === String(move.cabang_id))
  );
  function d(k, v) {
    setDetail((x) => ({ ...x, [k]: v }));
  }
  async function save() {
    try {
      if (fotoDeleted) {
        await api.deleteSiswaFoto(detail.id);
      }
      if (selectedFotoFile) {
        await api.uploadSiswaFoto(detail.id, selectedFotoFile);
      }
      // foto sengaja dibuang dari payload: diunggah lewat endpoint terpisah.
      const { foto: _foto, ...payload } = detail;
      await api.updateSiswa(detail.id, payload);
      toast('ok', 'Data siswa diperbarui');
      if (selectedFotoUrl) URL.revokeObjectURL(selectedFotoUrl);
      setSelectedFotoFile(null);
      setSelectedFotoUrl('');
      setFotoDeleted(false);
      refresh();
    } catch (e) {
      toast('err', e.message);
    }
  }
  function openMove() {
    setMove(initialMove());
    setMoveOpen(true);
  }
  function cancelMove() {
    setMove(initialMove());
    setMoveConfirmOpen(false);
    setMoveOpen(false);
  }
  async function pindah() {
    try {
      await api.moveSiswa(detail.id, {
        ...move,
        cabang_id: Number(move.cabang_id),
        jenjang_id: Number(move.jenjang_id),
        rombel_id: Number(move.rombel_id)
      });
      toast('ok', 'Enrollment siswa dipindah');
      setMoveConfirmOpen(false);
      setMoveOpen(false);
      refresh();
    } catch (e) {
      toast('err', e.message);
    }
  }
  async function nfc() {
    try {
      const r = await api.reissueNfc(detail.id);
      toast('ok', 'NFC baru: ' + r.nfc_token);
      setNfcConfirmOpen(false);
      refresh();
    } catch (e) {
      toast('err', e.message);
    }
  }
  function openPickup(p = null) {
    setPickupForm(
      p
        ? {
            id: p.id,
            nama: p.nama || '',
            no_wa: p.no_wa || '',
            relasi: p.relasi || '',
            catatan: p.catatan || '',
            aktif: p.aktif === 0 ? 0 : 1
          }
        : emptyPickup
    );
    setPickupOpen(true);
  }
  async function savePickup() {
    if (!pickupForm.nama.trim()) {
      toast('err', 'Nama penjemput wajib diisi');
      return;
    }
    try {
      if (pickupForm.id) {
        await api.updatePenjemput(pickupForm.id, { ...pickupForm, nama: pickupForm.nama.trim() });
        toast('ok', 'Penjemput diperbarui');
      } else {
        const r = await api.addPenjemput(detail.id, { ...pickupForm, nama: pickupForm.nama.trim() });
        toast('ok', 'QR penjemput: ' + r.qr_code);
      }
      setPickupOpen(false);
      setPickupForm(emptyPickup);
      refresh();
    } catch (e) {
      toast('err', e.message);
    }
  }
  async function setPickupStatus(p, aktif) {
    try {
      await api.updatePenjemput(p.id, { ...p, aktif });
      toast('ok', aktif ? 'Penjemput diaktifkan' : 'Penjemput dihapus dari daftar aktif');
      refresh();
    } catch (e) {
      toast('err', e.message);
    }
  }
  async function reissuePickupQr(p) {
    try {
      const r = await api.reissuePenjemputQr(p.id, 'Reissue dari dashboard admin');
      toast('ok', 'QR baru: ' + r.qr_code);
      setQrReissueConfirm(null);
      setQrPreview((q) => (q?.id === p.id ? { ...q, qr_code: r.qr_code } : q));
      refresh();
    } catch (e) {
      toast('err', e.message);
    }
  }
  async function copyQr(qr) {
    try {
      await navigator.clipboard.writeText(qr);
      toast('ok', 'Kode QR disalin');
    } catch {
      toast('err', 'Gagal menyalin QR');
    }
  }
  async function copyNfc() {
    try {
      await navigator.clipboard.writeText(detail.nfc_token);
      toast('ok', 'NFC token disalin');
    } catch {
      toast('err', 'Gagal menyalin NFC token');
    }
  }
  async function downloadPickupCard(p) {
    try {
      await downloadQrCard({ siswa: detail, pickup: p });
      toast('ok', 'Kartu QR diunduh');
    } catch (e) {
      toast('err', e.message || 'Gagal mengunduh kartu');
    }
  }
  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-[0_18px_60px_rgba(15,23,42,.06)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-4 min-w-0">
            <FotoUpload
              size="xl"
              url={detail.foto}
              onUpload={(file) => {
                const url = URL.createObjectURL(file);
                if (selectedFotoUrl) URL.revokeObjectURL(selectedFotoUrl);
                setSelectedFotoFile(file);
                setSelectedFotoUrl(url);
                setFotoDeleted(false);
                setDetail((d) => ({ ...d, foto: url }));
              }}
              onDelete={() => {
                if (selectedFotoUrl) URL.revokeObjectURL(selectedFotoUrl);
                setSelectedFotoFile(null);
                setSelectedFotoUrl('');
                setFotoDeleted(true);
                setDetail((d) => ({ ...d, foto: null }));
              }}
            />
            <div className="min-w-0">
              <div className="font-black text-text-main text-lg truncate">{detail.nama}</div>
              <div className="text-sm text-slate-500 truncate">
                {detail.enrollment?.cabang_nama} - {detail.enrollment?.rombel_nama}
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-black">
                <span className="px-2 py-1 rounded bg-slate-100 text-slate-600">{detail.status || 'aktif'}</span>
                {detail.nis && <span className="px-2 py-1 rounded bg-slate-100 text-slate-600">NIS {detail.nis}</span>}
              </div>
            </div>
          </div>
          <IconButton icon={X} label="Tutup" onClick={close} variant="plain" />
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-6 shadow-[0_18px_60px_rgba(15,23,42,.05)]">
          {/* Section 1: Profil Dasar */}
          <div className="space-y-3">
            <div className="text-[11px] font-black text-primary uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              Profil Dasar
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
              <label className="block sm:col-span-4">
                <span className="label">
                  Nama Lengkap <span className="text-rose-500">*</span>
                </span>
                <input
                  type="text"
                  placeholder="Nama lengkap siswa"
                  value={detail.nama || ''}
                  onChange={(e) => d('nama', e.target.value)}
                  className="input w-full"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="label">Nama Panggilan</span>
                <input
                  type="text"
                  placeholder="Panggilan"
                  value={detail.nama_panggilan || ''}
                  onChange={(e) => d('nama_panggilan', e.target.value)}
                  className="input w-full"
                />
              </label>
              <label className="block sm:col-span-3">
                <span className="label">NIS (Nomor Induk Siswa)</span>
                <input
                  type="text"
                  placeholder="NIS"
                  value={detail.nis || ''}
                  onChange={(e) => d('nis', e.target.value)}
                  className="input w-full"
                />
              </label>
              <label className="block sm:col-span-3">
                <span className="label">
                  Gender <span className="text-rose-500">*</span>
                </span>
                <CustomSelect
                  value={detail.gender || ''}
                  onChange={(e) => d('gender', e.target.value)}
                  className="input w-full"
                >
                  <option value="">Pilih gender</option>
                  <option value="L">Laki-laki</option>
                  <option value="P">Perempuan</option>
                </CustomSelect>
              </label>
              <label className="block sm:col-span-3">
                <span className="label">
                  Tanggal Lahir <span className="text-rose-500">*</span>
                </span>
                <CustomDatePicker
                  value={detail.tanggal_lahir || ''}
                  onChange={(v) => d('tanggal_lahir', v)}
                  className="input w-full"
                />
              </label>
              <label className="block sm:col-span-3">
                <span className="label">
                  Status Siswa <span className="text-rose-500">*</span>
                </span>
                <CustomSelect
                  value={detail.status || 'aktif'}
                  onChange={(e) => d('status', e.target.value)}
                  className="input w-full"
                >
                  <option value="aktif">Aktif</option>
                  <option value="keluar">Keluar</option>
                  <option value="lulus">Lulus</option>
                </CustomSelect>
              </label>
            </div>
          </div>

          {/* Section 2: Alamat & Catatan */}
          <div className="space-y-3">
            <div className="text-[11px] font-black text-primary uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              Alamat & Catatan
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="label">Alamat Rumah</span>
                <textarea
                  value={detail.alamat || ''}
                  onChange={(e) => d('alamat', e.target.value)}
                  className="input w-full min-h-[50px] max-h-[100px]"
                  placeholder="Masukkan alamat lengkap rumah siswa"
                />
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="label">Catatan Medis / Khusus</span>
                  <textarea
                    value={detail.catatan_khusus || ''}
                    onChange={(e) => d('catatan_khusus', e.target.value)}
                    className="input w-full min-h-[50px] max-h-[100px]"
                    placeholder="Alergi makanan, asma, obat rutin, dll. (jika ada)"
                  />
                </label>
                <label className="block">
                  <span className="label">Catatan Sekolah Asal / Luar</span>
                  <textarea
                    value={detail.catatan_sekolah_luar || ''}
                    onChange={(e) => d('catatan_sekolah_luar', e.target.value)}
                    className="input w-full min-h-[50px] max-h-[100px]"
                    placeholder="Pindahan dari sekolah mana, raport awal, dll. (jika ada)"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Actions & NFC Token Status */}
          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <ActionButton icon={Save} onClick={save}>
                Simpan Profil
              </ActionButton>
              <ActionButton icon={UserCheck} onClick={openMove} variant="secondary">
                Pindah
              </ActionButton>
              <ActionButton icon={KeyRound} onClick={() => setNfcConfirmOpen(true)} variant="ghost">
                Reissue NFC
              </ActionButton>
            </div>
            {detail.nfc_token && (
              <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200/60 rounded-lg px-2.5 py-1.5 font-bold self-start sm:self-auto flex items-center gap-2">
                <KeyRound className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-slate-400 font-medium">NFC:</span>
                  <span className="font-mono text-slate-700 select-all truncate max-w-[120px] sm:max-w-[150px]">
                    {showNfc ? detail.nfc_token : '••••••••••••••••'}
                  </span>
                </div>
                <div className="flex items-center gap-1 border-l border-slate-200 pl-1.5 shrink-0">
                  <button
                    type="button"
                    aria-label={showNfc ? 'Sembunyikan token NFC' : 'Tampilkan token NFC'}
                    onClick={() => setShowNfc(!showNfc)}
                    className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition"
                    title={showNfc ? 'Sembunyikan' : 'Tampilkan'}
                  >
                    {showNfc ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    aria-label="Salin token NFC"
                    onClick={copyNfc}
                    className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition"
                    title="Salin Token"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section 3: Enrollment */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex items-start gap-4 shadow-[0_18px_60px_rgba(15,23,42,.05)]">
          <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200/60 flex items-center justify-center text-slate-400 shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Status Enrollment</div>
            <div className="font-black text-text-main mt-0.5 leading-snug">{detail.enrollment?.cabang_nama}</div>
            <div className="text-sm text-slate-500 mt-0.5">
              {detail.enrollment?.jenjang_nama} - {detail.enrollment?.rombel_nama}
            </div>
            {detail.enrollment?.paket && (
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200/60 text-[10px] sm:text-[11px] font-black uppercase text-slate-600">
                  Paket: {paketLabel(detail.enrollment?.paket)}
                </span>
                {detail.enrollment?.tanggal_mulai && (
                  <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200/60 text-[10px] sm:text-[11px] font-black uppercase text-slate-600">
                    Mulai: {detail.enrollment?.tanggal_mulai}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-[0_18px_60px_rgba(15,23,42,.05)]">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <div className="font-black text-text-main">Penjemput</div>
              <div className="text-xs text-slate-400">
                {(detail.penjemput || []).filter((p) => p.aktif).length} aktif
              </div>
            </div>
            <ActionButton icon={UserPlus} onClick={() => openPickup()} variant="secondary">
              Tambah
            </ActionButton>
          </div>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 overflow-hidden">
            {(detail.penjemput || []).map((p) => (
              <div key={p.id} className={`p-3 text-sm ${p.aktif ? 'bg-white' : 'bg-slate-50 opacity-70'}`}>
                <div className="grid grid-cols-[1fr_auto] gap-3 items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-black text-text-main truncate">{p.nama}</div>
                      <span
                        className={`px-2 py-1 rounded-full text-[11px] font-black ${p.aktif ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
                      >
                        {p.aktif ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 truncate">
                      {p.relasi || '-'}
                      {p.no_wa ? ` - ${p.no_wa}` : ''}
                    </div>
                    {p.catatan && <div className="mt-1 text-xs text-slate-400 truncate">{p.catatan}</div>}
                  </div>
                  <div className="flex flex-wrap justify-end gap-2 shrink-0">
                    <ActionButton
                      icon={Eye}
                      label={`Show QR ${p.nama}`}
                      onClick={() => setQrPreview(p)}
                      variant="ghost"
                      className="px-3 py-2 text-xs"
                    >
                      Show QR
                    </ActionButton>
                    <IconButton icon={Pencil} label={`Edit ${p.nama}`} onClick={() => openPickup(p)} size="sm" />
                    {p.aktif ? (
                      <IconButton
                        icon={Trash2}
                        label={`Hapus ${p.nama}`}
                        onClick={() => setPickupStatus(p, 0)}
                        size="sm"
                        variant="danger"
                      />
                    ) : (
                      <IconButton
                        icon={Power}
                        label={`Aktifkan ${p.nama}`}
                        onClick={() => setPickupStatus(p, 1)}
                        size="sm"
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}
            {(!detail.penjemput || detail.penjemput.length === 0) && (
              <div className="m-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">
                Belum ada penjemput.
              </div>
            )}
          </div>
        </div>
      </div>

      {pickupOpen && (
        <Modal
          title={pickupForm.id ? 'Edit Penjemput' : 'Tambah Penjemput'}
          onClose={() => setPickupOpen(false)}
          maxWidth="max-w-xl"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <label className="block sm:col-span-2">
                <span className="label">
                  Nama Penjemput <span className="text-rose-500">*</span>
                </span>
                <input
                  type="text"
                  placeholder="Nama lengkap penjemput"
                  value={pickupForm.nama || ''}
                  onChange={(e) => setPickupForm((x) => ({ ...x, nama: e.target.value }))}
                  className="input w-full"
                />
              </label>
              <label className="block">
                <span className="label">No. WhatsApp</span>
                <input
                  type="text"
                  placeholder="Contoh: 08123456789"
                  value={pickupForm.no_wa || ''}
                  onChange={(e) => setPickupForm((x) => ({ ...x, no_wa: e.target.value }))}
                  className="input w-full"
                />
              </label>
              <label className="block">
                <span className="label">Relasi Hubungan</span>
                <input
                  type="text"
                  placeholder="Contoh: Ayah, Ibu, Supir, Paman"
                  value={pickupForm.relasi || ''}
                  onChange={(e) => setPickupForm((x) => ({ ...x, relasi: e.target.value }))}
                  className="input w-full"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="label">Catatan Khusus</span>
                <textarea
                  placeholder="Catatan opsional (misal: hanya jemput hari Jumat, kendaraan yang digunakan, dll.)"
                  value={pickupForm.catatan || ''}
                  onChange={(e) => setPickupForm((x) => ({ ...x, catatan: e.target.value }))}
                  className="input w-full min-h-[60px] max-h-[120px]"
                />
              </label>
              {pickupForm.id && (
                <label className="block sm:col-span-2">
                  <span className="label">Status Aktif</span>
                  <CustomSelect
                    value={pickupForm.aktif ? 1 : 0}
                    onChange={(e) => setPickupForm((x) => ({ ...x, aktif: Number(e.target.value) }))}
                    className="input w-full"
                  >
                    <option value={1}>Aktif</option>
                    <option value={0}>Nonaktif</option>
                  </CustomSelect>
                </label>
              )}
            </div>
            <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
              <ActionButton icon={X} onClick={() => setPickupOpen(false)} variant="secondary">
                Batal
              </ActionButton>
              <ActionButton icon={Save} onClick={savePickup}>
                {pickupForm.id ? 'Simpan Penjemput' : 'Tambah Penjemput'}
              </ActionButton>
            </div>
          </div>
        </Modal>
      )}
      {qrPreview && (
        <Modal
          title="QR Penjemput"
          onClose={() => {
            setQrPreview(null);
            setQrReissueConfirm(null);
          }}
          maxWidth="max-w-lg"
        >
          <div className="space-y-4">
            <div className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="bg-text-main px-5 py-4 text-white">
                <div className="flex items-center gap-3">
                  <LogoMark className="w-40 h-12 rounded-xl" />
                  <div>
                    <div className="text-xs font-black uppercase tracking-wide text-primary-container">
                      Taruna Prima
                    </div>
                    <div className="text-lg font-black leading-tight">Kartu Penjemput</div>
                  </div>
                </div>
              </div>
              <div className="px-6 py-7 text-center">
                <div className="text-xs font-black text-slate-400 uppercase">Siswa</div>
                <div className="text-xl font-black text-text-main">{detail.nama}</div>
                <div className="mt-1 text-sm text-slate-500">{detail.enrollment?.rombel_nama || '-'}</div>
                <div className="my-6 flex justify-center">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <QRCode id={`pickup-qr-${qrPreview.id}`} value={qrPreview.qr_code || '-'} size={192} />
                  </div>
                </div>
                <div className="text-xs font-black text-slate-400 uppercase">Penjemput</div>
                <div className="text-lg font-black text-text-main">{qrPreview.nama}</div>
                <div className="text-sm text-slate-500">
                  {qrPreview.relasi || '-'} {qrPreview.no_wa ? `- ${qrPreview.no_wa}` : ''}
                </div>
                <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-500 break-all">
                  {qrPreview.qr_code}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              <ActionButton icon={QrCode} onClick={() => setQrReissueConfirm(qrPreview)} variant="secondary">
                Reissue QR
              </ActionButton>
              <ActionButton icon={Download} onClick={() => downloadPickupCard(qrPreview)}>
                Download Kartu
              </ActionButton>
              <ActionButton icon={Copy} onClick={() => copyQr(qrPreview.qr_code)} variant="ghost">
                Salin Kode
              </ActionButton>
            </div>
          </div>
        </Modal>
      )}
      {qrReissueConfirm && (
        <Modal title="Konfirmasi Reissue QR" onClose={() => setQrReissueConfirm(null)}>
          <div className="space-y-4">
            <div className="text-sm text-slate-600">
              Buat QR baru untuk penjemput <span className="font-black text-text-main">{qrReissueConfirm.nama}</span>?
              QR lama tidak dipakai lagi untuk scan berikutnya.
            </div>
            <div className="flex gap-2">
              <ActionButton icon={QrCode} onClick={() => reissuePickupQr(qrReissueConfirm)}>
                Ya, Reissue QR
              </ActionButton>
              <ActionButton icon={X} onClick={() => setQrReissueConfirm(null)} variant="secondary">
                Batal
              </ActionButton>
            </div>
          </div>
        </Modal>
      )}
      {nfcConfirmOpen && (
        <Modal title="Konfirmasi Reissue NFC" onClose={() => setNfcConfirmOpen(false)}>
          <div className="space-y-4">
            <div className="text-sm text-slate-600">
              Buat token NFC baru untuk <span className="font-black text-text-main">{detail.nama}</span>? Token lama
              tidak dipakai lagi untuk scan berikutnya.
            </div>
            <div className="flex gap-2">
              <ActionButton icon={KeyRound} onClick={nfc}>
                Ya, Reissue NFC
              </ActionButton>
              <ActionButton icon={X} onClick={() => setNfcConfirmOpen(false)} variant="secondary">
                Batal
              </ActionButton>
            </div>
          </div>
        </Modal>
      )}
      {moveOpen && (
        <Modal title="Pindah Cabang/Rombel" onClose={cancelMove} maxWidth="max-w-xl">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {user.role === 'admin' && (
                <label className="block">
                  <span className="label">
                    Cabang <span className="text-rose-500">*</span>
                  </span>
                  <CustomSelect
                    value={move.cabang_id}
                    onChange={(e) => setMove((x) => ({ ...x, cabang_id: e.target.value, rombel_id: '' }))}
                    className="input w-full"
                  >
                    <option value="">Pilih Cabang</option>
                    {m.cabang.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nama}
                      </option>
                    ))}
                  </CustomSelect>
                </label>
              )}
              <label className="block">
                <span className="label">
                  Jenjang <span className="text-rose-500">*</span>
                </span>
                <CustomSelect
                  value={move.jenjang_id}
                  onChange={(e) => setMove((x) => ({ ...x, jenjang_id: e.target.value, rombel_id: '' }))}
                  className="input w-full"
                >
                  <option value="">Pilih Jenjang</option>
                  {m.jenjang.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.nama}
                    </option>
                  ))}
                </CustomSelect>
              </label>
              <label className="block">
                <span className="label">
                  Rombel Tujuan <span className="text-rose-500">*</span>
                </span>
                <CustomSelect
                  value={move.rombel_id}
                  onChange={(e) => setMove((x) => ({ ...x, rombel_id: e.target.value }))}
                  className="input w-full"
                >
                  <option value="">Pilih Rombel</option>
                  {moveRombel.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.cabang_nama} - {r.nama}
                    </option>
                  ))}
                </CustomSelect>
              </label>
              <label className="block">
                <span className="label">
                  Paket Program <span className="text-rose-500">*</span>
                </span>
                <CustomSelect
                  value={move.paket}
                  onChange={(e) => setMove((x) => ({ ...x, paket: e.target.value }))}
                  className="input w-full"
                >
                  <option value="reguler">Reguler</option>
                  <option value="full_day">Full day</option>
                  <option value="care">Care</option>
                </CustomSelect>
              </label>
              <label className="block">
                <span className="label">
                  Tanggal Mulai <span className="text-rose-500">*</span>
                </span>
                <CustomDatePicker
                  value={move.tanggal_mulai}
                  onChange={(v) => setMove((x) => ({ ...x, tanggal_mulai: v }))}
                  className="input w-full"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="label">
                  Alasan Pemindahan <span className="text-rose-500">*</span>
                </span>
                <input
                  type="text"
                  placeholder="Masukkan alasan pemindahan siswa"
                  value={move.alasan || ''}
                  onChange={(e) => setMove((x) => ({ ...x, alasan: e.target.value }))}
                  className="input w-full"
                />
              </label>
            </div>
            <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
              <ActionButton icon={X} onClick={cancelMove} variant="secondary">
                Batal
              </ActionButton>
              <ActionButton icon={UserCheck} onClick={() => setMoveConfirmOpen(true)}>
                Pindahkan
              </ActionButton>
            </div>
          </div>
        </Modal>
      )}
      {moveConfirmOpen && (
        <Modal title="Konfirmasi Pindah" onClose={() => setMoveConfirmOpen(false)}>
          <div className="space-y-4">
            <div className="text-sm text-slate-600">
              Pindahkan enrollment aktif siswa ini ke rombel tujuan yang dipilih?
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm space-y-1.5">
              <div>
                <span className="font-black text-slate-400 uppercase text-xs block">Siswa</span>
                <span className="font-bold text-text-main">{detail.nama}</span>
              </div>
              <div>
                <span className="font-black text-slate-400 uppercase text-xs block">Tanggal Mulai</span>
                <span className="font-bold text-text-main">{move.tanggal_mulai}</span>
              </div>
              <div>
                <span className="font-black text-slate-400 uppercase text-xs block">Alasan</span>
                <span className="font-bold text-text-main">{move.alasan || '-'}</span>
              </div>
            </div>
            <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
              <ActionButton icon={X} onClick={() => setMoveConfirmOpen(false)} variant="secondary">
                Batal
              </ActionButton>
              <ActionButton icon={CheckCircle2} onClick={pindah}>
                Ya, Pindahkan
              </ActionButton>
            </div>
          </div>
        </Modal>
      )}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-[0_18px_60px_rgba(15,23,42,.05)]">
        <div className="font-black text-text-main mb-3">Riwayat Tagihan</div>
        {tagihanSiswa === null ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">
            Memuat...
          </div>
        ) : tagihanSiswa.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">
            Belum ada tagihan.
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar border border-slate-100 rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Cabang</th>
                  <th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Jenis</th>
                  <th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Periode</th>
                  <th className="text-right py-2 px-3 bg-slate-50 text-slate-500 font-black">Final</th>
                  <th className="text-right py-2 px-3 bg-slate-50 text-slate-500 font-black">Terbayar</th>
                  <th className="text-left py-2 px-3 bg-slate-50 text-slate-500 font-black">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tagihanSiswa.map((t) => (
                  <tr key={t.id}>
                    <td className="py-2 px-3 text-slate-700">{t.cabang_nama}</td>
                    <td className="py-2 px-3 text-slate-700">{t.nama}</td>
                    <td className="py-2 px-3 text-slate-700">{t.periode || '-'}</td>
                    <td className="py-2 px-3 text-right tabular-nums font-semibold text-slate-700">
                      {money(t.nominal_final)}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums font-semibold text-slate-700">
                      {money(t.paid_amount)}
                    </td>
                    <td className="py-2 px-3 text-slate-700">{t.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
