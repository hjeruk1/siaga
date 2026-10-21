// Pengaturan WhatsApp: status kanal + daftar nomor per cabang.
//
// Dua bagian dalam satu layar karena saling bergantung: nomor yang ditambahkan
// di bawah langsung memengaruhi status di atas. Memisahkannya ke dua menu
// membuat admin harus menebak apakah nomor barunya sudah terpakai.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  XCircle
} from 'lucide-react';
import { api } from '../../api';
import { CustomSelect, Modal } from '../../components/Shared';
import { useMaster } from '../admin/AdminShared';

function waktu(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const TONE = {
  ok: { chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2, label: 'Siap' },
  down: { chip: 'bg-rose-50 text-rose-700 border-rose-200', icon: AlertTriangle, label: 'Terputus' },
  mati: { chip: 'bg-slate-100 text-slate-600 border-slate-200', icon: XCircle, label: 'Tidak dikonfigurasi' },
  'belum-dicek': { chip: 'bg-slate-100 text-slate-600 border-slate-200', icon: MessageCircle, label: 'Belum diperiksa' }
};

const FORM_KOSONG = {
  id: null,
  cabang_id: '',
  label: '',
  provider: 'openwa',
  nomor: '',
  api_url: 'http://127.0.0.1:8080',
  api_key: '',
  session_id: '',
  gateway_url: '',
  gateway_token: '',
  aktif: true
};

// Label provider singkat untuk tabel & daftar. Session ID terisi = open-wa
// multi-sesi (satu proses, banyak nomor); kosong = Easy API satu nomor.
function labelProvider(a) {
  if (a.provider === 'gateway') return 'gateway';
  return a.session_id ? 'open-wa · multi-sesi' : 'open-wa';
}

export default function WaSettings({ user, toast }) {
  const { cabang } = useMaster(user);
  const admin = user.role === 'admin';

  const [data, setData] = useState(null);
  const [akun, setAkun] = useState([]);
  const [memuat, setMemuat] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [form, setForm] = useState(null);

  const muat = useCallback(async () => {
    setMemuat(true);
    try {
      const [s, a] = await Promise.all([
        api.waStatus(),
        admin ? api.waAkun().catch(() => ({ rows: [] })) : Promise.resolve({ rows: [] })
      ]);
      setData(s);
      setAkun(a?.rows || []);
    } catch (e) {
      toast?.('err', e.message);
    } finally {
      setMemuat(false);
    }
  }, [admin, toast]);

  useEffect(() => {
    muat();
  }, [muat]);

  const pantau = data?.pantau || {};
  const mode = pantau.mode || (data?.aktif ? 'env' : 'none');
  const statusUtama = pantau.status || (mode === 'none' ? 'mati' : 'belum-dicek');
  const tone = TONE[statusUtama] || TONE['belum-dicek'];
  const Icon = tone.icon;

  // Gabungkan akun dengan keadaan pemantauannya. Akun yang belum pernah
  // diperiksa tidak punya baris di wa_monitor_akun — itu bukan "sehat".
  const baris = useMemo(() => {
    const peta = new Map((pantau.akun || []).map((x) => [Number(x.akun_id), x]));
    return akun.map((a) => ({ ...a, pantau: peta.get(Number(a.id)) || { status: 'belum-dicek' } }));
  }, [akun, pantau.akun]);

  async function periksa() {
    setBusy(true);
    try {
      const r = await api.waCheck();
      if (r?.pantau) setData((d) => ({ ...(d || {}), pantau: r.pantau }));
      const st = r?.pantau?.status;
      if (st === 'ok') toast?.('ok', 'Semua nomor siap.');
      else if (st === 'down') toast?.('err', 'Ada nomor yang terputus — lihat rinciannya.');
      else toast?.('info', 'Kanal WhatsApp belum dikonfigurasi.');
      await muat();
    } catch (e) {
      toast?.('err', e.message);
    } finally {
      setBusy(false);
    }
  }

  async function uji(a) {
    setBusyId(a.id);
    try {
      const r = await api.ujiWaAkun(a.id);
      if (r?.status === 'ok') toast?.('ok', `${a.label}: siap.`);
      else toast?.('err', r?.pesan || `${a.label}: terputus.`);
      await muat();
    } catch (e) {
      toast?.('err', e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function simpan(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const isi = { ...form };
      if (!isi.id) delete isi.id;
      if (form.id) await api.simpanWaAkun(isi, form.id);
      else await api.simpanWaAkun(isi);
      toast?.('ok', 'Nomor WhatsApp disimpan.');
      setForm(null);
      await muat();
    } catch (err) {
      toast?.('err', err.message);
    } finally {
      setBusy(false);
    }
  }

  async function hapus(a) {
    if (!window.confirm(`Hapus nomor "${a.label}"? Pesan untuk cabang itu akan memakai nomor pusat (jika ada).`))
      return;
    setBusyId(a.id);
    try {
      await api.hapusWaAkun(a.id);
      toast?.('ok', 'Nomor dihapus.');
      await muat();
    } catch (e) {
      toast?.('err', e.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_18px_60px_rgba(15,23,42,.05)] sm:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-container text-primary">
              <MessageCircle className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-[15px] font-black text-text-main">Status WhatsApp</h2>
              <p className="text-[11px] font-semibold text-slate-500">
                {mode === 'akun'
                  ? 'Nomor per cabang — tiap nomor diperiksa sendiri tiap 5 menit.'
                  : 'Satu nomor dari konfigurasi server — diperiksa tiap 5 menit.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black ${tone.chip}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tone.label}
            </span>
            <button
              type="button"
              onClick={periksa}
              disabled={busy || memuat}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Periksa sekarang
            </button>
          </div>
        </div>

        {memuat ? (
          <div className="flex justify-center py-8 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : mode === 'akun' ? (
          <div className="space-y-2">
            {baris.map((a) => {
              const t = TONE[a.pantau.status] || TONE['belum-dicek'];
              const I = t.icon;
              return (
                <div key={a.id} className="rounded-xl border border-slate-200 p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-black text-text-main">{a.label}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase text-slate-500">
                      {a.cabang_nama || 'Pusat'}
                    </span>
                    <span className="text-[11px] font-bold text-slate-400">
                      {labelProvider(a)}
                      {a.nomor ? ` · ${a.nomor}` : ''}
                    </span>
                    {!a.aktif && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase text-slate-500">
                        nonaktif
                      </span>
                    )}
                    <span
                      className={`ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black ${t.chip}`}
                    >
                      <I className="h-3 w-3" />
                      {t.label}
                    </span>
                  </div>
                  {a.pantau.pesan && <p className="mt-1 text-[11px] font-semibold text-rose-600">{a.pantau.pesan}</p>}
                  <p className="mt-1 text-[10px] font-semibold text-slate-400">
                    diperiksa {waktu(a.pantau.terakhir_cek)} · terakhir sehat {waktu(a.pantau.terakhir_ok)} · gagal
                    beruntun {a.pantau.gagal_beruntun ?? 0}
                  </p>
                </div>
              );
            })}
            {!baris.length && (
              <p className="py-6 text-center text-[12px] font-semibold text-slate-400">
                Belum ada nomor. Tambahkan di bawah agar pesan terkirim dari nomor cabang masing-masing.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ['Provider', data?.provider || 'none'],
                ['Terakhir diperiksa', waktu(pantau.terakhir_cek)],
                ['Terakhir sehat', waktu(pantau.terakhir_ok)],
                ['Gagal beruntun', String(pantau.gagal_beruntun ?? 0)]
              ].map(([label, nilai]) => (
                <div key={label} className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
                  <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</div>
                  <div className="mt-0.5 truncate text-[13px] font-black text-text-main">{nilai}</div>
                </div>
              ))}
            </div>
            {pantau.pesan && (
              <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{pantau.pesan}</span>
              </div>
            )}
          </div>
        )}

        {data?.statistik && (
          <p className="mt-2 text-[11px] font-semibold text-slate-400">
            Sejak server hidup: {data.statistik.terkirim} terkirim · {data.statistik.gagal} gagal ·{' '}
            {data.statistik.dilewati} dilewati · antrean {data.antrean ?? 0}
          </p>
        )}
      </section>

      {admin && (
        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_18px_60px_rgba(15,23,42,.05)] sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-[15px] font-black text-text-main">Nomor WhatsApp per cabang</h2>
              <p className="text-[11px] font-semibold text-slate-500">
                Cabang tanpa nomor memakai nomor pusat (cadangan). Tanpa cadangan, pesannya tidak dikirim.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setForm({ ...FORM_KOSONG })}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-[12px] font-black text-white hover:bg-primary-hover"
            >
              <Plus className="h-3.5 w-3.5" />
              Tambah nomor
            </button>
          </div>

          {akun.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center">
              <p className="text-[12px] font-semibold text-slate-500">
                Belum ada nomor terdaftar — pesan memakai satu nomor dari konfigurasi server.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-[12px]">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-black uppercase tracking-wide text-slate-400">
                    <th className="py-2 pr-2">Tujuan</th>
                    <th className="py-2 pr-2">Label</th>
                    <th className="py-2 pr-2">Provider</th>
                    <th className="py-2 pr-2">Nomor</th>
                    <th className="py-2 pr-2">Kredensial</th>
                    <th className="py-2 pr-2 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {akun.map((a) => (
                    <tr key={a.id} className="border-b border-slate-50">
                      <td className="py-2 pr-2 font-bold text-slate-600">{a.cabang_nama || 'Pusat (cadangan)'}</td>
                      <td className="py-2 pr-2 font-black text-text-main">{a.label}</td>
                      <td className="py-2 pr-2 text-slate-500">{labelProvider(a)}</td>
                      <td className="py-2 pr-2 text-slate-500">{a.nomor || '-'}</td>
                      <td className="py-2 pr-2">
                        {a.kredensial_terbaca ? (
                          <span className="text-emerald-600">terbaca</span>
                        ) : (
                          <span className="text-rose-600">perlu diisi ulang</span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        <div className="inline-flex gap-1">
                          <button
                            type="button"
                            onClick={() => uji(a)}
                            disabled={busyId === a.id}
                            aria-label={`Uji ${a.label}`}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                          >
                            {busyId === a.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => setForm({ ...FORM_KOSONG, ...a, api_key: '', gateway_token: '' })}
                            aria-label={`Ubah ${a.label}`}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => hapus(a)}
                            aria-label={`Hapus ${a.label}`}
                            className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {form && (
        <Modal title={form.id ? 'Ubah nomor WhatsApp' : 'Tambah nomor WhatsApp'} onClose={() => setForm(null)}>
          <form onSubmit={simpan} className="space-y-3">
            <label className="block">
              <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">Untuk cabang</span>
              <CustomSelect
                className="mt-1.5 w-full"
                value={form.cabang_id ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, cabang_id: e.target.value }))}
              >
                <option value="">Pusat (cadangan)</option>
                {cabang.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nama}
                  </option>
                ))}
              </CustomSelect>
            </label>

            <label htmlFor="wa-label" className="block">
              <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">Label</span>
              <input
                id="wa-label"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="Contoh: WA Godean"
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              {[
                ['openwa', 'open-wa'],
                ['gateway', 'Gateway']
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, provider: id }))}
                  aria-pressed={form.provider === id}
                  className={`rounded-xl border px-3 py-2 text-[12px] font-black transition-colors ${
                    form.provider === id
                      ? 'border-primary bg-primary-container/60 text-primary'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <label htmlFor="wa-nomor" className="block">
              <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                Nomor (untuk tampilan)
              </span>
              <input
                id="wa-nomor"
                value={form.nomor || ''}
                onChange={(e) => setForm((f) => ({ ...f, nomor: e.target.value }))}
                placeholder="0812xxxxxxx"
                className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>

            {form.provider === 'openwa' ? (
              <>
                <label htmlFor="wa-url" className="block">
                  <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">URL Easy API</span>
                  <input
                    id="wa-url"
                    value={form.api_url || ''}
                    onChange={(e) => setForm((f) => ({ ...f, api_url: e.target.value }))}
                    placeholder="http://127.0.0.1:8081"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </label>
                <label htmlFor="wa-key" className="block">
                  <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                    API key {form.id ? '(kosongkan bila tidak diubah)' : ''}
                  </span>
                  <input
                    id="wa-key"
                    type="password"
                    value={form.api_key || ''}
                    onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </label>
                <label htmlFor="wa-sesi" className="block">
                  <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                    Session ID <span className="font-semibold normal-case text-slate-400">(opsional — multi-sesi)</span>
                  </span>
                  <input
                    id="wa-sesi"
                    value={form.session_id || ''}
                    onChange={(e) => setForm((f) => ({ ...f, session_id: e.target.value.trim() }))}
                    placeholder="Kosongkan untuk Easy API satu nomor"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </label>
                <p className="text-[11px] leading-relaxed text-slate-400">
                  Isi Session ID kalau satu proses open-wa menangangi beberapa nomor: pesan cabang ini akan dikirim
                  lewat sesi tersebut. Session ID terlihat di dashboard OpenWA (bagian Sessions). Bila dikosongkan,
                  pesan dikirim lewat endpoint Easy API satu nomor.
                </p>
              </>
            ) : (
              <>
                <label htmlFor="wa-gw" className="block">
                  <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">URL gateway</span>
                  <input
                    id="wa-gw"
                    value={form.gateway_url || ''}
                    onChange={(e) => setForm((f) => ({ ...f, gateway_url: e.target.value }))}
                    placeholder="https://api.fonnte.com/send"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </label>
                <label htmlFor="wa-token" className="block">
                  <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                    Token {form.id ? '(kosongkan bila tidak diubah)' : ''}
                  </span>
                  <input
                    id="wa-token"
                    type="password"
                    value={form.gateway_token || ''}
                    onChange={(e) => setForm((f) => ({ ...f, gateway_token: e.target.value }))}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </label>
              </>
            )}

            <label className="inline-flex cursor-pointer items-center gap-2 text-[12px] font-bold text-slate-600">
              <input
                type="checkbox"
                checked={form.aktif !== false && form.aktif !== 0}
                onChange={(e) => setForm((f) => ({ ...f, aktif: e.target.checked }))}
                className="h-4 w-4 accent-amber-500"
              />
              Aktif (dipakai untuk mengirim)
            </label>

            <p className="text-[11px] leading-relaxed text-slate-400">
              Kredensial disimpan terenkripsi. Kunci enkripsi ada di environment server, jadi berkas backup database
              tidak memuat token yang bisa dipakai langsung.
            </p>

            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-black text-white disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Simpan
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
