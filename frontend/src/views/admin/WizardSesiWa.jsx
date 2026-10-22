// Wizard "hubungkan nomor mandiri": admin cabang menghubungkan nomor
// WhatsApp cabangnya lewat SIAGA, tanpa membuka dashboard OpenWA di server.
//
// Alur: buat sesi (atau pakai sesi yang sudah ada) -> QR/kode pairing tampil
// di sini -> cabang memindai dari HP-nya -> sesi 'ready' -> simpan sebagai
// nomor pengirim cabang. Kredensial instance (URL + API key) tidak pernah
// sampai ke komponen ini; semua lewat proxy di server.
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, QrCode, RefreshCw, Smartphone, MessageSquare } from 'lucide-react';
import { api } from '../../api';
import { Modal } from '../../components/Shared';

const POLL_MS = 5000; // sama seperti dashboard OpenWA

const LABEL_STATUS = {
  created: 'baru dibuat — perlu dinyalakan',
  initializing: 'menyiapkan…',
  qr_ready: 'siap dipindai',
  authenticating: 'memverifikasi…',
  ready: 'terhubung',
  disconnected: 'terputus',
  failed: 'gagal'
};

function labelStatus(s) {
  return LABEL_STATUS[s] || s || '-';
}

export default function WizardSesiWa({ user, cabang, onSelesai, onClose }) {
  const adminCabang = user.role === 'admin_cabang';
  const cabangTerpakai = adminCabang ? String(user.cabang_id) : null;

  // langkah: 'pilih' -> 'hubungkan' -> 'selesai'
  const [langkah, setLangkah] = useState('pilih');
  const [mode, setMode] = useState('baru'); // 'baru' | 'ada'
  const [daftar, setDaftar] = useState(null);
  const [cabangId, setCabangId] = useState(cabangTerpakai || '');
  const [nama, setNama] = useState('');
  const [sesi, setSesi] = useState(null);
  const [qr, setQr] = useState(null);
  const [tab, setTab] = useState('qr');
  const [nomor, setNomor] = useState('');
  const [pairing, setPairing] = useState(null);
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [label, setLabel] = useState('');

  // Nama default mengikuti cabang terpilih.
  useEffect(() => {
    if (mode !== 'baru' || nama) return;
    const c = cabang.find((x) => String(x.id) === String(cabangId));
    if (c) setNama('wa-' + c.nama.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  }, [cabangId, cabang, mode, nama]);

  // Muat daftar sesi saat tab "pakai sesi yang ada" dibuka.
  useEffect(() => {
    if (mode !== 'ada' || daftar) return;
    api
      .waSesi()
      .then((r) => setDaftar(r.rows || []))
      .catch((e) => setGalat(e.message));
  }, [mode, daftar]);

  const muatStatus = useCallback(async () => {
    if (!sesi) return;
    try {
      const s = await api.waDetailSesi(sesi.id);
      setSesi(s);
      if (s.status === 'ready' && langkah === 'hubungkan') {
        setLangkah('selesai');
        setLabel(s.name || '');
      }
    } catch {
      // sengaja diabaikan: poll berikutnya mencoba lagi
    }
  }, [sesi, langkah]);

  // Poll status sesi selama wizard terbuka.
  useEffect(() => {
    if (!sesi || langkah === 'selesai') return;
    const t = setInterval(muatStatus, POLL_MS);
    return () => clearInterval(t);
  }, [sesi, langkah, muatStatus]);

  // Poll QR selama tab QR aktif dan sesi SUDAH siap dipindai. Saat masih
  // 'initializing', instance membalas 400 ("Session is not started") — tidak
  // ada gunanya menembak, dan errornya mengotori konsol.
  useEffect(() => {
    if (!sesi || tab !== 'qr' || langkah !== 'hubungkan' || sesi.status !== 'qr_ready') return;
    let berhenti = false;
    async function ambil() {
      try {
        const r = await api.waQrSesi(sesi.id);
        if (berhenti) return;
        setQr(r.qrCode || null);
        if (r.status === 'ready') setLangkah('selesai');
      } catch {
        /* QR mungkin belum siap (initializing); poll berikutnya mencoba lagi */
      }
    }
    ambil();
    const t = setInterval(ambil, POLL_MS);
    return () => {
      berhenti = true;
      clearInterval(t);
    };
  }, [sesi, tab, langkah]);

  async function buatSesiBaru(e) {
    e.preventDefault();
    setGalat('');
    setSibuk(true);
    try {
      const s = await api.waBuatSesi({ nama, cabang_id: cabangId || null });
      setSesi(s);
      setLangkah('hubungkan');
      setTab('qr');
    } catch (e2) {
      setGalat(e2.message);
    } finally {
      setSibuk(false);
    }
  }

  async function mintaPairing(e) {
    e.preventDefault();
    setGalat('');
    setSibuk(true);
    try {
      const r = await api.waKodePairing(sesi.id, nomor);
      setPairing(r);
    } catch (e2) {
      setGalat(e2.message);
    } finally {
      setSibuk(false);
    }
  }

  async function simpan(e) {
    e.preventDefault();
    setGalat('');
    setSibuk(true);
    try {
      await api.waSimpanSesi(sesi.id, { cabang_id: cabangId || null, label });
      onSelesai?.();
    } catch (e2) {
      setGalat(e2.message);
    } finally {
      setSibuk(false);
    }
  }

  return (
    <Modal title="Hubungkan nomor WhatsApp" onClose={onClose} maxWidth="max-w-lg">
      {langkah === 'pilih' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {[
              ['baru', 'Buat sesi baru', QrCode],
              ['ada', 'Pakai sesi yang sudah ada', Smartphone]
            ].map(([id, teks, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                aria-pressed={mode === id}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-[12px] font-black transition-colors ${
                  mode === id
                    ? 'border-primary bg-primary-container/60 text-primary'
                    : 'border-slate-200 text-slate-600'
                }`}
              >
                <Icon className="h-4 w-4" />
                {teks}
              </button>
            ))}
          </div>

          <label className="block">
            <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">Untuk cabang</span>
            <select
              value={cabangId}
              disabled={adminCabang}
              onChange={(e) => setCabangId(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-slate-50"
            >
              {adminCabang ? (
                <option value={cabangId}>{cabang.find((c) => String(c.id) === cabangId)?.nama || 'Cabang Anda'}</option>
              ) : (
                cabang.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nama}
                  </option>
                ))
              )}
            </select>
            {adminCabang && (
              <span className="mt-1 block text-[10px] text-slate-400">
                Admin cabang hanya dapat menghubungkan nomor untuk cabangnya sendiri.
              </span>
            )}
          </label>

          {mode === 'baru' ? (
            <form onSubmit={buatSesiBaru} className="space-y-3">
              <label htmlFor="wiz-nama" className="block">
                <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">Nama sesi</span>
                <input
                  id="wiz-nama"
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                  placeholder="wa-godean"
                  required
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>
              <p className="text-[11px] leading-relaxed text-slate-400">
                Sesi baru akan dibuat di OpenWA dan langsung dinyalakan. Setelah itu QR atau kode pairing muncul di
                layar berikutnya — HP cabang yang perlu memindai, bukan server.
              </p>
              {galat && <p className="text-xs font-bold text-red-600">{galat}</p>}
              <button
                type="submit"
                disabled={sibuk || !nama.trim()}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-black text-white disabled:opacity-60"
              >
                {sibuk ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                Buat sesi &amp; lanjut
              </button>
            </form>
          ) : daftar === null ? (
            <div className="flex items-center justify-center gap-2 py-6 text-xs font-bold text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Memuat daftar sesi…
            </div>
          ) : (
            <div className="space-y-2">
              {daftar.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setSesi(s);
                    setLabel(s.name || '');
                    setLangkah(s.status === 'ready' ? 'selesai' : 'hubungkan');
                    setTab('qr');
                  }}
                  className="flex w-full items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-black text-text-main">{s.name}</span>
                    <span className="block text-[11px] font-bold text-slate-400">
                      {labelStatus(s.status)}
                      {s.phone ? ` · ${s.phone}` : ''}
                    </span>
                  </span>
                  {s.status === 'ready' && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                </button>
              ))}
              {!daftar.length && (
                <p className="py-4 text-center text-[12px] font-semibold text-slate-400">
                  Belum ada sesi di instance OpenWA.
                </p>
              )}
              {galat && <p className="text-xs font-bold text-red-600">{galat}</p>}
            </div>
          )}
        </div>
      )}

      {langkah === 'hubungkan' && sesi && (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="min-w-0">
              <div className="text-[13px] font-black text-text-main">{sesi.name}</div>
              <div className="text-[11px] font-bold text-slate-400">
                Status: {labelStatus(sesi.status)}
                {sesi.pushName ? ` · ${sesi.pushName}` : ''}
              </div>
            </div>
            {sesi.status === 'created' && (
              <button
                type="button"
                onClick={async () => {
                  setSibuk(true);
                  try {
                    setSesi(await api.waStartSesi(sesi.id));
                  } catch (e) {
                    setGalat(e.message);
                  } finally {
                    setSibuk(false);
                  }
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-black text-slate-600 hover:bg-white"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Nyalakan
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {[
              ['qr', 'Pindai QR', QrCode],
              ['pairing', 'Kode pairing', Smartphone]
            ].map(([id, teks, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                aria-pressed={tab === id}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-[12px] font-black transition-colors ${
                  tab === id ? 'border-primary bg-primary-container/60 text-primary' : 'border-slate-200 text-slate-600'
                }`}
              >
                <Icon className="h-4 w-4" />
                {teks}
              </button>
            ))}
          </div>

          {tab === 'qr' ? (
            <div className="space-y-2">
              {qr ? (
                <img
                  src={qr}
                  alt="QR WhatsApp"
                  className="mx-auto h-52 w-52 rounded-xl border border-slate-200 bg-white p-2"
                />
              ) : (
                <div className="flex h-52 items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 text-xs font-bold text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Menunggu QR…
                </div>
              )}
              <p className="text-center text-[11px] leading-relaxed text-slate-400">
                Di HP cabang: <b>WhatsApp → Perangkat Tertaut → Tautkan Perangkat</b>, lalu pindai QR ini. Layar ini
                menyegarkan QR sendiri setiap 5 detik dan lanjut otomatis setelah berhasil.
              </p>
            </div>
          ) : (
            <form onSubmit={mintaPairing} className="space-y-2">
              <label htmlFor="wiz-nomor" className="block">
                <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">Nomor HP cabang</span>
                <input
                  id="wiz-nomor"
                  value={nomor}
                  onChange={(e) => setNomor(e.target.value)}
                  placeholder="08xxxxxxxxxx"
                  inputMode="tel"
                  required
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>
              <button
                type="submit"
                disabled={sibuk || nomor.replace(/\D/g, '').length < 10}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary text-xs font-black text-white disabled:opacity-60"
              >
                {sibuk ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
                Minta kode pairing
              </button>
              {pairing?.pairingCode && (
                <div className="space-y-1.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
                  <div className="font-mono text-2xl font-black tracking-[0.3em] text-emerald-700">
                    {pairing.pairingCode}
                  </div>
                  <p className="text-[11px] leading-relaxed text-emerald-700">
                    Di HP {pairing.nomor}: <b>WhatsApp → Perangkat Tertaut → Tautkan dengan nomor telepon</b>, lalu
                    masukkan kode ini. Kode kedaluwarsa sendiri; minta lagi bila perlu (maks 1x per menit).
                  </p>
                </div>
              )}
            </form>
          )}

          {galat && <p className="text-xs font-bold text-red-600">{galat}</p>}

          <button
            type="button"
            onClick={() => {
              setLangkah('pilih');
              setSesi(null);
              setQr(null);
              setPairing(null);
              setGalat('');
            }}
            className="w-full text-[12px] font-bold text-slate-400 hover:text-slate-600"
          >
            ← Ganti sesi
          </button>
        </div>
      )}

      {langkah === 'selesai' && sesi && (
        <form onSubmit={simpan} className="space-y-3">
          <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[12px] font-semibold text-emerald-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Terhubung sebagai <b>{sesi.pushName || sesi.name}</b>
              {sesi.phone ? ` (${sesi.phone})` : ''}. Simpan untuk menjadikan sesi ini nomor pengirim cabang.
            </span>
          </div>
          <label htmlFor="wiz-label" className="block">
            <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">Label nomor</span>
            <input
              id="wiz-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="WA Godean"
              required
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          {galat && <p className="text-xs font-bold text-red-600">{galat}</p>}
          <button
            type="submit"
            disabled={sibuk || !label.trim()}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-black text-white disabled:opacity-60"
          >
            {sibuk ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Simpan sebagai nomor cabang
          </button>
        </form>
      )}
    </Modal>
  );
}
