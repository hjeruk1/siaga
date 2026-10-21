import { useEffect, useState } from 'react';
import {
  ShieldCheck,
  ShieldOff,
  KeyRound,
  LifeBuoy,
  Copy,
  Check,
  Download,
  Loader2,
  RefreshCw,
  Info
} from 'lucide-react';
// react-qr-code v2 hanya punya named export (QRCode), bukan default.
import { QRCode } from 'react-qr-code';
import { api } from '../../api';
import { Modal } from '../../components/Shared';

// Kartu "Keamanan akun" untuk staff (admin/kepsek/guru): verifikasi dua faktor
// TOTP. Pasangannya untuk wali adalah KeamananCard (PIN 6 angka) — dua jalur,
// pola yang sama: langkah kedua yang tidak bergantung pada satu password.
//
// Alur pendaftaran sengaja dua langkah dengan halaman perantara (QR):
//   1. setup   -> server membuat secret, tampilkan QR + secret
//   2. enable  -> kode dari aplikasi authenticator membuktikan HP benar-benar
//                 bisa membuat kode; server lalu menerbitkan kode pemulihan
// Tanpa langkah 2, secret bisa terlanjur terpasang di HP yang salah dan
// pengguna mengira sudah aman padahal tidak.
const inputCls = 'mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm';

function salinTeks(teks) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(teks);
  // Fallback untuk browser tanpa clipboard API (atau http non-localhost).
  const ta = document.createElement('textarea');
  ta.value = teks;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
  } catch {
    /* diabaikan */
  }
  document.body.removeChild(ta);
  return Promise.resolve();
}

function unduhBerkas(nama, isi) {
  const blob = new Blob([isi], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nama;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Daftar kode pemulihan monospace + tombol salin & unduh.
function KotakKodePemulihan({ kode, onTutup }) {
  const [tersalin, setTersalin] = useState(false);
  const teks = ['Kode pemulihan SIAGA (simpan baik-baik, sekali pakai masing-masing):', '', ...kode].join('\n');
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-700">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        Kode ini hanya ditampilkan SEKARANG. Simpan di tempat yang aman (pengelola password atau brankas). Dipakai kalau
        HP dengan aplikasi authenticator hilang.
      </div>
      <ul className="grid grid-cols-2 gap-1.5 rounded-xl bg-slate-900 p-3 font-mono text-xs text-emerald-300">
        {kode.map((k) => (
          <li key={k} className="text-center tracking-widest">
            {k}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={async () => {
            await salinTeks(teks);
            setTersalin(true);
          }}
          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 text-xs font-black text-slate-700 hover:bg-slate-50"
        >
          {tersalin ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {tersalin ? 'Tersalin' : 'Salin'}
        </button>
        <button
          type="button"
          onClick={() => unduhBerkas('siaga-kode-pemulihan.txt', teks)}
          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 text-xs font-black text-slate-700 hover:bg-slate-50"
        >
          <Download className="h-3.5 w-3.5" /> Unduh .txt
        </button>
      </div>
      <button
        type="button"
        onClick={onTutup}
        className="h-10 w-full rounded-xl bg-primary text-xs font-black text-white hover:bg-primary-hover"
      >
        Selesai — kode sudah saya simpan
      </button>
    </div>
  );
}

export default function KeamananStaffCard({ toast }) {
  const [status, setStatus] = useState(null);
  const [menu, setMenu] = useState(null); // 'pasang' | 'matikan' | 'pemulihan-baru'
  const [password, setPassword] = useState('');
  const [kode, setKode] = useState('');
  const [siap, setSiap] = useState(null); // hasil setup: { secret, uri }
  const [kodeBaru, setKodeBaru] = useState(null); // kode pemulihan yang baru diterbitkan
  const [galat, setGalat] = useState('');
  const [kirim, setKirim] = useState(false);

  useEffect(() => {
    api
      .statusDuaFaktor()
      .then(setStatus)
      .catch(() => {});
  }, []);

  function buka(nama) {
    setMenu(nama);
    setPassword('');
    setKode('');
    setSiap(null);
    setKodeBaru(null);
    setGalat('');
  }

  async function mulaiPasang() {
    setKirim(true);
    setGalat('');
    try {
      const d = await api.setupDuaFaktor();
      setSiap(d);
    } catch (e) {
      setGalat(e.message);
    } finally {
      setKirim(false);
    }
  }

  async function aktifkan() {
    setKirim(true);
    setGalat('');
    try {
      const d = await api.aktifkanDuaFaktor(kode);
      setKodeBaru(d.recovery);
      setSiap(null);
      setMenu('kode-baru');
      const s = await api.statusDuaFaktor();
      setStatus(s);
      toast?.('ok', 'Verifikasi dua faktor aktif.');
    } catch (e) {
      setGalat(e.message);
      setKode('');
    } finally {
      setKirim(false);
    }
  }

  async function matikan() {
    setKirim(true);
    setGalat('');
    try {
      await api.matikanDuaFaktor(password);
      setMenu(null);
      setStatus(await api.statusDuaFaktor());
      toast?.('ok', 'Verifikasi dua faktor dimatikan.');
    } catch (e) {
      setGalat(e.message);
    } finally {
      setKirim(false);
    }
  }

  async function perbaruiPemulihan() {
    setKirim(true);
    setGalat('');
    try {
      const d = await api.kodePemulihanBaru(password);
      setKodeBaru(d.recovery);
      setMenu('kode-baru');
      setStatus(await api.statusDuaFaktor());
      toast?.('ok', 'Kode pemulihan lama sudah tidak berlaku.');
    } catch (e) {
      setGalat(e.message);
    } finally {
      setKirim(false);
    }
  }

  const aktif = !!status?.aktif;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">
          <ShieldCheck className="h-4.5 w-4.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-black text-text-main">Keamanan akun</div>
          <p className="text-[11px] text-slate-500">
            Verifikasi dua faktor (kode 6 angka dari aplikasi authenticator) sebelum masuk.
          </p>
        </div>
      </div>

      {status?.perluDiaktifkan && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed font-semibold text-amber-700">
          Akun Anda mengelola data seluruh sekolah. Password saja tidak cukup — aktifkan verifikasi dua faktor sekarang.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {aktif ? (
          <>
            <span className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
              2FA aktif{status?.recoverySisa != null ? ` · ${status.recoverySisa} kode pemulihan` : ''}
            </span>
            <button
              type="button"
              onClick={() => buka('pemulihan-baru')}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 transition-colors hover:bg-slate-50"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Kode pemulihan baru
            </button>
            <button
              type="button"
              onClick={() => buka('matikan')}
              className="inline-flex items-center gap-1 rounded-xl px-2.5 py-2 text-xs font-black text-red-600 transition-colors hover:bg-red-50"
            >
              <ShieldOff className="h-3.5 w-3.5" /> Matikan
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => {
              buka('pasang');
              mulaiPasang();
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-black text-white transition-colors hover:bg-primary-hover"
          >
            <KeyRound className="h-3.5 w-3.5" /> Aktifkan verifikasi dua faktor
          </button>
        )}
      </div>

      <p className="mt-2.5 text-[10px] leading-relaxed text-slate-400">
        Buka Google Authenticator / Authy / aplikasi bank, pindai QR, lalu masukkan kode 6 angka. Aplikasi bekerja
        offline — tidak bergantung pada WhatsApp. Wali murid memakai PIN 6 angka sebagai gerbang kedua untuk data
        keuangan.
      </p>

      {menu === 'pasang' && (
        <Modal onClose={() => setMenu(null)} title="Aktifkan Verifikasi Dua Faktor" maxWidth="max-w-sm">
          {siap ? (
            <div className="space-y-3">
              <p className="text-[11px] leading-relaxed text-slate-500">
                1. Pindai QR ini dengan aplikasi authenticator.
                <br />
                2. Masukkan kode 6 angka yang muncul di layar.
              </p>
              <div className="mx-auto w-fit rounded-xl bg-white p-3 ring-1 ring-slate-200">
                <QRCode value={siap.uri} size={180} />
              </div>
              <details className="rounded-xl border border-slate-200 px-3 py-2 text-[11px]">
                <summary className="cursor-pointer font-bold text-slate-600">
                  Tidak bisa pindai? Ketik secret manual
                </summary>
                <p className="mt-2 break-all font-mono text-xs font-bold tracking-widest text-text-main">
                  {siap.secret}
                </p>
              </details>
              <label className="block text-xs font-black text-text-main" htmlFor="kode-authenticator">
                Kode dari aplikasi
                <input
                  id="kode-authenticator"
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  value={kode}
                  onChange={(e) => setKode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className={`${inputCls} text-center text-lg font-black tabular-nums tracking-[0.4em]`}
                />
              </label>
              {galat ? <p className="text-xs font-bold text-red-600">{galat}</p> : null}
              <button
                type="button"
                onClick={aktifkan}
                disabled={kirim || kode.length < 6}
                className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-primary text-xs font-black text-white disabled:opacity-60"
              >
                {kirim ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Aktifkan
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 py-6 text-xs font-bold text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Menyiapkan…
            </div>
          )}
        </Modal>
      )}

      {menu === 'kode-baru' && kodeBaru && (
        <Modal onClose={() => setMenu(null)} title="Kode Pemulihan" maxWidth="max-w-sm">
          <KotakKodePemulihan kode={kodeBaru} onTutup={() => setMenu(null)} />
        </Modal>
      )}

      {menu === 'pemulihan-baru' && (
        <Modal onClose={() => setMenu(null)} title="Kode Pemulihan Baru">
          <div className="space-y-3">
            <p className="text-[11px] leading-relaxed text-slate-500">
              Kode pemulihan lama langsung tidak berlaku. Gunakan ini setelah ponsel dengan aplikasi authenticator
              diganti.
            </p>
            <label className="block text-xs font-black text-text-main" htmlFor="2fa-pass">
              Password akun
              <input
                id="2fa-pass"
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
              />
            </label>
            {galat ? <p className="text-xs font-bold text-red-600">{galat}</p> : null}
            <button
              type="button"
              onClick={perbaruiPemulihan}
              disabled={kirim || !password}
              className="h-10 w-full rounded-xl bg-primary text-xs font-black text-white disabled:opacity-60"
            >
              {kirim ? 'Memproses…' : 'Terbitkan kode baru'}
            </button>
          </div>
        </Modal>
      )}

      {menu === 'matikan' && (
        <Modal onClose={() => setMenu(null)} title="Matikan Verifikasi Dua Faktor">
          <div className="space-y-3">
            <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-[11px] leading-relaxed text-red-700">
              <ShieldOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Setelah dimatikan, masuk hanya membutuhkan password. Kode pemulihan juga hangus.
            </div>
            <label className="block text-xs font-black text-text-main" htmlFor="2fa-pass-off">
              Password akun
              <input
                id="2fa-pass-off"
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
              />
            </label>
            {galat ? <p className="text-xs font-bold text-red-600">{galat}</p> : null}
            <button
              type="button"
              onClick={matikan}
              disabled={kirim || !password}
              className="h-10 w-full rounded-xl bg-red-600 text-xs font-black text-white disabled:opacity-60"
            >
              {kirim ? (
                'Memproses…'
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <LifeBuoy className="h-3.5 w-3.5" /> Matikan 2FA
                </span>
              )}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
