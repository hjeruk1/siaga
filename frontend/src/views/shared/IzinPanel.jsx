// Layar sekolah untuk memutuskan izin/sakit yang diajukan orang tua.
//
// Dipakai bersama admin, kepsek, dan guru: notifikasi pengajuan dikirim ke
// ketiganya, jadi ketiganya harus punya layar untuk memutuskan. Isi daftar
// dibatasi server (siswaScopeSql), bukan oleh komponen ini — guru hanya melihat
// rombel yang diampu, kepsek hanya cabangnya, admin bisa memfilter cabang.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { Modal } from '../../components/Shared';
import { CheckCircle2, Clock, ExternalLink, Loader2, Paperclip, XCircle } from 'lucide-react';
import { CabangFilter, Panel, StudentAvatar } from '../admin/AdminShared';
import { useMaster } from '../admin/useMaster';

const STATUS_TABS = [
  { id: 'menunggu', label: 'Menunggu' },
  { id: 'disetujui', label: 'Disetujui' },
  { id: 'ditolak', label: 'Ditolak' }
];

function rentang(a, b) {
  if (!a) return '-';
  const fmt = (s) => {
    const [y, m, d] = String(s).split('-');
    return `${d}/${m}/${y.slice(2)}`;
  };
  return a === b ? fmt(a) : `${fmt(a)} – ${fmt(b)}`;
}

export default function IzinTab({ user, toast }) {
  const { cabang, cabangId, setCabangId } = useMaster(user);
  const [status, setStatus] = useState('menunggu');
  const [rows, setRows] = useState([]);
  const [memuat, setMemuat] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [tolak, setTolak] = useState(null); // { id, nama }
  const [alasanTolak, setAlasanTolak] = useState('');

  const muat = useCallback(async () => {
    setMemuat(true);
    try {
      const d = await api.izinSekolah({ status, cabang_id: cabangId || undefined });
      setRows(d?.rows || []);
    } catch (e) {
      toast?.('err', e.message);
      setRows([]);
    } finally {
      setMemuat(false);
    }
  }, [status, cabangId, toast]);

  useEffect(() => {
    muat();
  }, [muat]);

  async function setujui(item) {
    setBusyId(item.id);
    try {
      const r = await api.setujuiIzin(item.id, null);
      const bagian = [];
      if (r?.diterapkan) bagian.push(`${r.diterapkan} hari dicatat`);
      if (r?.sudahHadir) bagian.push(`${r.sudahHadir} hari sudah hadir (tidak diubah)`);
      if (r?.hariLibur) bagian.push(`${r.hariLibur} hari libur`);
      if (r?.hariDitutup) bagian.push(`${r.hariDitutup} hari sudah ditutup`);
      toast?.('ok', `Izin ${item.siswa_nama} disetujui${bagian.length ? ` — ${bagian.join(', ')}` : ''}.`);
      await muat();
    } catch (e) {
      toast?.('err', e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function kirimTolak(e) {
    e.preventDefault();
    if (alasanTolak.trim().length < 3) return;
    setBusyId(tolak.id);
    try {
      await api.tolakIzin(tolak.id, alasanTolak.trim());
      toast?.('ok', `Pengajuan ${tolak.nama} ditolak.`);
      setTolak(null);
      setAlasanTolak('');
      await muat();
    } catch (err) {
      toast?.('err', err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Panel
      title="Izin & sakit"
      right={<CabangFilter user={user} cabang={cabang} cabangId={cabangId} setCabangId={setCabangId} />}
    >
      <div className="mb-3 flex flex-wrap gap-1.5">
        {STATUS_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setStatus(t.id)}
            aria-pressed={status === t.id}
            className={`rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-wide transition-colors ${
              status === t.id
                ? 'bg-primary text-white'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
        <button
          type="button"
          onClick={muat}
          className="ml-auto rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-slate-500 hover:bg-slate-200"
        >
          Muat ulang
        </button>
      </div>

      {memuat ? (
        <div className="flex items-center justify-center py-14 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-12 text-center">
          <Clock className="mx-auto h-6 w-6 text-slate-300" />
          <p className="mt-2 text-sm font-black text-slate-500">
            {status === 'menunggu' ? 'Tidak ada pengajuan menunggu' : `Belum ada izin ${status}`}
          </p>
          <p className="mt-1 text-[12px] text-slate-400">Pengajuan dari portal wali akan muncul di sini.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:border-slate-300"
            >
              <div className="flex flex-wrap items-start gap-3">
                <StudentAvatar name={item.siswa_nama} url={item.siswa_foto} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-black text-text-main">{item.siswa_nama}</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${
                        item.jenis === 'sakit'
                          ? 'border-rose-200 bg-rose-50 text-rose-700'
                          : 'border-sky-200 bg-sky-50 text-sky-700'
                      }`}
                    >
                      {item.jenis}
                    </span>
                    <span className="text-[11px] font-bold text-slate-400">
                      {[item.rombel_nama, item.cabang_nama].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <div className="mt-1 text-[12px] font-bold text-slate-600">
                    {rentang(item.tanggal_mulai, item.tanggal_selesai)}
                    <span className="ml-1.5 font-semibold text-slate-400">({Number(item.jumlah_hari) || 1} hari)</span>
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-slate-600">{item.alasan}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] font-semibold text-slate-400">
                    <span>Diajukan: {item.wali_nama || 'wali'}</span>
                    {item.lampiran_url && (
                      <a
                        href={item.lampiran_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <Paperclip className="h-3 w-3" />
                        Lihat surat
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {item.catatan_verifikator && <span>Catatan: {item.catatan_verifikator}</span>}
                  </div>
                </div>

                {item.status === 'menunggu' && (
                  <div className="flex w-full gap-2 sm:w-auto">
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => setujui(item)}
                      aria-label={`Setujui pengajuan ${item.siswa_nama}`}
                      className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-[12px] font-black text-white transition-colors hover:bg-emerald-700 disabled:opacity-50 sm:flex-none"
                    >
                      {busyId === item.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )}
                      Setujui
                    </button>
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => {
                        setTolak({ id: item.id, nama: item.siswa_nama });
                        setAlasanTolak('');
                      }}
                      aria-label={`Tolak pengajuan ${item.siswa_nama}`}
                      className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 text-[12px] font-black text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50 sm:flex-none"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Tolak
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tolak && (
        <Modal title={`Tolak pengajuan ${tolak.nama}`} onClose={() => setTolak(null)}>
          <form onSubmit={kirimTolak} className="space-y-3">
            <p className="text-[12px] leading-relaxed text-slate-600">
              Alasan wajib diisi: orang tua menerima alasan ini lewat notifikasi, dan tanpa penjelasan mereka akan
              mengirim pengajuan yang sama berulang kali.
            </p>
            <label htmlFor="alasan-tolak" className="block">
              <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">Alasan penolakan</span>
              <textarea
                id="alasan-tolak"
                rows={3}
                maxLength={500}
                value={alasanTolak}
                onChange={(e) => setAlasanTolak(e.target.value)}
                placeholder="Contoh: tanggal bertepatan dengan penilaian tengah semester."
                className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <button
              type="submit"
              disabled={alasanTolak.trim().length < 3 || busyId === tolak.id}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-rose-600 text-sm font-black text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
            >
              {busyId === tolak.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Tolak pengajuan
            </button>
          </form>
        </Modal>
      )}
    </Panel>
  );
}
