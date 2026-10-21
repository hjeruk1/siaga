// Tab "Izin": orang tua mengajukan izin/sakit dari aplikasi, bukan lewat
// WhatsApp. Setelah sekolah menyetujui, status kehadiran anak berubah otomatis
// — jadi orang tua tidak perlu menagih guru untuk mengubahnya.
import { useMemo, useState } from 'react';
import { CalendarCheck2, CalendarDays, CheckCircle2, Clock, ImagePlus, Loader2, Send, XCircle } from 'lucide-react';
import { Modal } from '../../components/Shared';
import { api } from '../../api';
import { Card, EmptyState, InfoNote, Pill, SectionTitle, Skeleton } from './ui.jsx';
import { tanggalPanjang, tanggalPendek, todayISO } from './portalHelpers.js';

const STATUS = {
  menunggu: { label: 'Menunggu keputusan', tone: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock },
  disetujui: {
    label: 'Disetujui',
    tone: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: CheckCircle2
  },
  ditolak: { label: 'Ditolak', tone: 'bg-rose-50 text-rose-700 border-rose-200', icon: XCircle },
  dibatalkan: { label: 'Dibatalkan', tone: 'bg-slate-100 text-slate-600 border-slate-200', icon: XCircle }
};

function rentang(a, b) {
  if (!a) return '-';
  return a === b ? tanggalPanjang(a) : `${tanggalPendek(a)} – ${tanggalPendek(b)}`;
}

export default function Izin({ siswa, daftar = [], memuat = false, onMuatUlang, toast }) {
  const [buka, setBuka] = useState(false);
  const [jenis, setJenis] = useState('izin');
  const [mulai, setMulai] = useState(todayISO());
  const [selesai, setSelesai] = useState(todayISO());
  const [alasan, setAlasan] = useState('');
  const [berkas, setBerkas] = useState(null);
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState('');

  const jumlahHari = useMemo(() => {
    if (!mulai || !selesai || selesai < mulai) return 0;
    const a = Date.parse(`${mulai}T00:00:00Z`);
    const b = Date.parse(`${selesai}T00:00:00Z`);
    return Math.round((b - a) / 86400000) + 1;
  }, [mulai, selesai]);

  function bukaForm() {
    setJenis('izin');
    setMulai(todayISO());
    setSelesai(todayISO());
    setAlasan('');
    setBerkas(null);
    setGalat('');
    setBuka(true);
  }

  async function kirim(e) {
    e.preventDefault();
    setGalat('');
    if (!mulai || !selesai) return setGalat('Tanggal mulai dan selesai wajib diisi.');
    if (selesai < mulai) return setGalat('Tanggal selesai tidak boleh sebelum tanggal mulai.');
    if (alasan.trim().length < 5) return setGalat('Tuliskan alasan minimal 5 karakter.');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('siswa_id', String(siswa.id));
      fd.append('jenis', jenis);
      fd.append('tanggal_mulai', mulai);
      fd.append('tanggal_selesai', selesai);
      fd.append('alasan', alasan.trim());
      if (berkas) fd.append('lampiran', berkas);
      await api.ajukanIzin(fd);
      setBuka(false);
      toast?.('ok', 'Pengajuan izin terkirim. Sekolah akan memutuskan.');
      onMuatUlang?.();
    } catch (err) {
      setGalat(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function batalkan(item) {
    try {
      await api.batalIzin(item.id);
      toast?.('ok', 'Pengajuan dibatalkan.');
      onMuatUlang?.();
    } catch (err) {
      toast?.('err', err.message);
    }
  }

  if (!siswa) return null;

  return (
    <div className="space-y-4">
      <SectionTitle
        icon={CalendarDays}
        hint="Ajukan izin atau sakit; status kehadiran diperbarui otomatis setelah disetujui."
        action={
          <button
            type="button"
            onClick={bukaForm}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-[12px] font-black text-white shadow-sm transition-all hover:bg-primary-hover active:scale-[0.98]"
          >
            <Send className="h-3.5 w-3.5" />
            Ajukan izin
          </button>
        }
      >
        Izin & sakit
      </SectionTitle>

      <InfoNote icon={CalendarCheck2}>
        Ajukan sebelum anak berangkat sekolah. Izin yang disetujui mengubah status kehadiran pada hari-hari sekolah di
        rentang tanggal tersebut, dan tidak menimpa hari yang sudah tercatat hadir.
      </InfoNote>

      {memuat ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : daftar.length === 0 ? (
        <EmptyState
          icon={CalendarCheck2}
          title="Belum ada pengajuan izin"
          desc="Kalau anak sakit atau ada acara keluarga, ajukan dari sini supaya kehadirannya tercatat benar."
        />
      ) : (
        <div className="space-y-2.5">
          {daftar.map((item) => {
            const ui = STATUS[item.status] || STATUS.menunggu;
            const Icon = ui.icon;
            return (
              <Card key={item.id} className="p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Pill
                        tone={
                          item.jenis === 'sakit'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-sky-50 text-sky-700 border-sky-200'
                        }
                      >
                        {item.jenis === 'sakit' ? 'Sakit' : 'Izin'}
                      </Pill>
                      <span className="text-[13px] font-black text-text-main">
                        {rentang(item.tanggal_mulai, item.tanggal_selesai)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-slate-600">{item.alasan}</p>
                  </div>
                  <Pill tone={ui.tone} icon={Icon}>
                    {ui.label}
                  </Pill>
                </div>

                {item.catatan_verifikator && (
                  <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] font-semibold text-slate-600">
                    Catatan sekolah: {item.catatan_verifikator}
                  </p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] font-bold text-slate-400">
                  <span>{Number(item.jumlah_hari) || 1} hari</span>
                  {item.lampiran_url && (
                    <a
                      href={item.lampiran_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      Lihat lampiran
                    </a>
                  )}
                  {item.status === 'menunggu' && (
                    <button
                      type="button"
                      onClick={() => batalkan(item)}
                      className="ml-auto text-slate-500 hover:text-rose-600"
                    >
                      Batalkan pengajuan
                    </button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {buka && (
        <Modal title="Ajukan izin / sakit" onClose={() => setBuka(false)}>
          <form onSubmit={kirim} className="space-y-3.5">
            <div className="grid grid-cols-2 gap-2">
              {[
                ['izin', 'Izin', 'Acara keluarga, urusan mendesak'],
                ['sakit', 'Sakit', 'Demam, flu, perlu istirahat']
              ].map(([id, label, ket]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setJenis(id)}
                  aria-pressed={jenis === id}
                  className={`rounded-xl border px-3 py-2.5 text-left transition-all ${
                    jenis === id
                      ? 'border-primary bg-primary-container/60 text-primary'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <div className="text-[13px] font-black">{label}</div>
                  <div className="mt-0.5 text-[10px] font-semibold text-slate-500">{ket}</div>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label htmlFor="izin-mulai" className="block">
                <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">Dari tanggal</span>
                <input
                  id="izin-mulai"
                  type="date"
                  value={mulai}
                  onChange={(e) => {
                    setMulai(e.target.value);
                    if (!selesai || selesai < e.target.value) setSelesai(e.target.value);
                  }}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>
              <label htmlFor="izin-selesai" className="block">
                <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">Sampai tanggal</span>
                <input
                  id="izin-selesai"
                  type="date"
                  value={selesai}
                  min={mulai}
                  onChange={(e) => setSelesai(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>
            </div>
            <p className="-mt-2 text-[11px] font-semibold text-slate-400">
              {jumlahHari > 0 ? `${jumlahHari} hari kalender (maksimal 30)` : 'Periksa kembali rentang tanggalnya'}
            </p>

            <label htmlFor="izin-alasan" className="block">
              <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">Alasan</span>
              <textarea
                id="izin-alasan"
                value={alasan}
                onChange={(e) => setAlasan(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Contoh: demam sejak semalam, ada surat dokter."
                className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>

            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 text-[12px] font-bold text-slate-600">
              <ImagePlus className="h-4 w-4 text-slate-400" />
              {berkas ? berkas.name : 'Lampirkan surat dokter (opsional)'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setBerkas(e.target.files?.[0] || null)}
              />
            </label>

            {galat && (
              <div
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700"
              >
                {galat}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-black text-white transition-all active:scale-[0.99] disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Kirim pengajuan
            </button>
            <p className="text-center text-[11px] text-slate-400">
              Sekolah akan memutuskan. Anda akan menerima kabar lewat notifikasi.
            </p>
          </form>
        </Modal>
      )}
    </div>
  );
}
