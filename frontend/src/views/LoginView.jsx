import { useState } from 'react';
import { api } from '../api';
import {
  Eye,
  EyeOff,
  Sun,
  Moon,
  Sparkle,
  ShieldCheck,
  Building2,
  Users,
  CheckCircle2,
  ArrowLeft,
  KeyRound,
  LifeBuoy
} from 'lucide-react';
import LupaPasswordModal from './LupaPasswordModal.jsx';

export default function LoginView({ onLogin, theme, setTheme }) {
  const [tab, setTab] = useState('staff');
  const [form, setForm] = useState({ username: '', no_wa: '', password: '' });
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [lupaOpen, setLupaOpen] = useState(false);
  // Langkah kedua login staff: password benar, tapi akun punya verifikasi dua
  // faktor. Server mengirim tantangan (berlaku 5 menit) — belum ada token.
  const [tantangan, setTantangan] = useState(null);
  const [kode2fa, setKode2fa] = useState('');
  const [pakaiPemulihan, setPakaiPemulihan] = useState(false);

  function pilihTab(id) {
    setTab(id);
    setTantangan(null);
    setKode2fa('');
    setPakaiPemulihan(false);
    setErr('');
  }

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setOk('');
    setLoading(true);
    try {
      const d = await api.login(
        tab === 'wali'
          ? { tipe: 'wali', no_wa: form.no_wa.trim(), password: form.password }
          : { tipe: 'staff', username: form.username.trim(), password: form.password }
      );
      if (d.perlu_2fa) {
        setTantangan({ token: d.challenge_token, nama: d.nama, berlaku: d.berlaku_detik });
        return;
      }
      api.setToken(d.token);
      onLogin(d.user);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setLoading(false);
    }
  }

  async function submit2fa(e) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const d = pakaiPemulihan
        ? await api.pemulihanDuaFaktor(tantangan.token, kode2fa.trim().toUpperCase())
        : await api.verifikasiDuaFaktor(tantangan.token, kode2fa.trim());
      api.setToken(d.token);
      onLogin(d.user);
    } catch (e2) {
      setErr(e2.message);
      setKode2fa('');
    } finally {
      setLoading(false);
    }
  }
  const canSubmit = tab === 'wali' ? form.no_wa.trim() && form.password : form.username.trim() && form.password;
  const branchStats = ['Godean', 'Kentungan', 'Nitikan', 'Balong', 'Solo'];

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-slate-50 dark:bg-slate-950">
      <style>{`
        @keyframes siaga-aurora { 0%,100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(2%, -3%, 0) scale(1.08); } }
        @keyframes siaga-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        .siaga-aurora { animation: siaga-aurora 14s ease-in-out infinite; }
        .siaga-float { animation: siaga-float 6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .siaga-aurora, .siaga-float { animation: none; } }
      `}</style>

      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="siaga-aurora absolute -top-40 -left-20 h-[560px] w-[560px] rounded-full bg-amber-400/20 blur-3xl dark:bg-amber-500/15" />
        <div
          className="siaga-float absolute top-[-10%] right-[-12%] h-[480px] w-[480px] rounded-full bg-indigo-400/15 blur-3xl dark:bg-indigo-500/10"
          style={{ animationDelay: '1.5s' }}
        />
        <div className="absolute bottom-[-18%] left-[20%] h-[420px] w-[420px] rounded-full bg-sky-400/10 blur-3xl dark:bg-sky-500/8" />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(to right,rgba(148,163,184,0.07) 1px,transparent 1px),linear-gradient(to bottom,rgba(148,163,184,0.07) 1px,transparent 1px)',
            backgroundSize: '44px 44px'
          }}
        />
      </div>

      <div className="relative mx-auto grid min-h-[100dvh] w-full max-w-7xl grid-cols-1 items-center gap-8 px-4 py-8 sm:px-6 sm:py-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,440px)] lg:gap-12 lg:px-10 xl:gap-16">
        <section className="hidden lg:flex flex-col justify-center">
          <div className="mb-10 flex items-center gap-4">
            <div className="rounded-2xl bg-white p-3 shadow-[0_24px_80px_rgba(15,23,42,0.35)] dark:shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
              <img
                src="/tp_logo.png"
                alt="Taruna Prima Logo"
                width="224"
                height="64"
                className="w-52 xl:w-60 h-auto object-contain"
              />
            </div>
            <div className="border-l border-slate-300 dark:border-white/15 pl-5">
              <div className="text-2xl font-black tracking-wide leading-none text-slate-900 dark:text-white">SIAGA</div>
              <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-300 uppercase font-bold tracking-[0.18em]">
                Sistem Informasi
              </div>
            </div>
          </div>

          <div className="mb-6 inline-flex items-center gap-2 self-start rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-black tracking-[0.16em] text-primary uppercase backdrop-blur-md">
            <Sparkle className="size-3.5" />
            Satu server, lima cabang
          </div>

          <h1 className="text-4xl xl:text-6xl font-black leading-[1.02] tracking-[-0.03em] text-slate-900 dark:text-white">
            Operasional sekolah yang{' '}
            <span className="bg-gradient-to-r from-amber-500 via-amber-400 to-orange-500 dark:from-amber-300 dark:via-amber-200 dark:to-orange-300 bg-clip-text text-transparent">
              rapi
            </span>{' '}
            dari gerbang sampai laporan wali.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 dark:text-slate-300">
            Absensi, penitipan, billing, catatan guru, dan akses wali murid dikelola dalam satu alur kerja yang
            konsisten untuk seluruh cabang Taruna Prima.
          </p>

          <div className="mt-9 grid grid-cols-5 gap-2">
            {branchStats.map((c) => (
              <div
                key={c}
                className={`group rounded-xl border border-slate-200 bg-white/70 dark:border-white/10 dark:bg-white/5 p-3 transition-all duration-300 hover:bg-white hover:border-slate-300 dark:hover:bg-white/[0.09] dark:hover:border-white/20`}
              >
                <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Cabang</div>
                <div className="mt-1 font-black text-slate-900 dark:text-white">{c}</div>
              </div>
            ))}
          </div>

          <div className="mt-10 grid grid-cols-3 gap-4 text-sm text-slate-600 dark:text-slate-300">
            <div className="border-t border-slate-300 dark:border-white/10 pt-3">
              <span className="block text-xl font-black text-slate-900 dark:text-white">7</span>
              <span className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Peran pengguna
              </span>
            </div>
            <div className="border-t border-slate-300 dark:border-white/10 pt-3">
              <span className="block text-xl font-black text-slate-900 dark:text-white">5</span>
              <span className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Cabang aktif</span>
            </div>
            <div className="border-t border-slate-300 dark:border-white/10 pt-3">
              <span className="block text-xl font-black text-slate-900 dark:text-white">1</span>
              <span className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Portal terpadu
              </span>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center lg:hidden">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white p-2 shadow-[0_8px_32px_rgba(15,23,42,0.25)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
              <img
                src="/tp_logo.png"
                alt="Taruna Prima Logo"
                width="152"
                height="44"
                className="h-10 w-auto object-contain"
              />
            </div>
            <div className="border-l border-slate-300/60 dark:border-slate-700 pl-3">
              <div className="text-xl font-black leading-none text-slate-900 dark:text-white">SIAGA</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-[0.18em]">
                Taruna Prima
              </div>
            </div>
          </div>
        </section>

        <main className="relative flex items-center justify-center">
          <div
            className="pointer-events-none absolute inset-x-10 top-10 bottom-20 rounded-3xl bg-gradient-to-br from-amber-200/30 to-indigo-200/20 blur-2xl dark:from-amber-500/10 dark:to-indigo-500/8"
            aria-hidden="true"
          />
          <div className="relative w-full max-w-md rounded-[22px] border border-white/60 bg-white/90 backdrop-blur-xl p-6 sm:p-7 shadow-[0_24px_80px_rgba(15,23,42,0.12)] dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
            <div className="mb-6 flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-container">
                    <ShieldCheck className="size-5 text-primary" />
                  </div>
                  <div>
                    <div className="text-xl font-black text-text-main dark:text-slate-100 leading-none tracking-[-0.02em]">
                      Masuk SIAGA
                    </div>
                    <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Portal akses sekolah Taruna Prima
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 p-2.5 text-slate-600 dark:text-slate-300 transition-all duration-200 hover:scale-105 hover:bg-white dark:hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 flex-shrink-0"
                  aria-label={theme === 'dark' ? 'Mode Terang' : 'Mode Gelap'}
                >
                  {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
                </button>
              </div>
              <div className="inline-flex items-center gap-2 self-start rounded-full bg-primary-container/70 dark:bg-primary/15 dark:bg-primary/15 px-2.5 py-1 text-[11px] font-black uppercase tracking-wide text-primary dark:bg-primary/15">
                <ShieldCheck className="size-3.5" />
                Aman
              </div>
            </div>

            <div
              className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100/80 dark:bg-slate-800/60 p-1 mb-5 dark:bg-slate-800/60"
              role="tablist"
              aria-label="Tipe akses"
            >
              {[
                ['staff', 'Staff', Building2],
                ['wali', 'Wali Murid', Users]
              ].map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => pilihTab(id)}
                  className={`relative flex items-center justify-center gap-2 py-2 text-sm font-bold rounded-lg transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 ${
                    tab === id
                      ? 'bg-white text-primary shadow-sm dark:bg-slate-700 dark:text-amber-300'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              ))}
            </div>

            {!tantangan && (
              <form onSubmit={submit} className="space-y-4">
                {tab === 'staff' ? (
                  <Field
                    label="Username"
                    name="username"
                    id="siaga-username"
                    value={form.username}
                    onChange={(v) => setForm((f) => ({ ...f, username: v }))}
                    autoComplete="username"
                    spellCheck={false}
                    autoFocus
                  />
                ) : (
                  <Field
                    label="Nomor WhatsApp"
                    name="no_wa"
                    id="siaga-no-wa"
                    value={form.no_wa}
                    onChange={(v) => setForm((f) => ({ ...f, no_wa: v }))}
                    autoComplete="username"
                    spellCheck={false}
                    autoFocus
                  />
                )}
                <Field
                  label="Password"
                  name="password"
                  id="siaga-password"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(v) => setForm((f) => ({ ...f, password: v }))}
                  autoComplete="current-password"
                  trailing={
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="rounded-lg p-1.5 text-slate-400 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                      aria-label={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  }
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setLupaOpen(true)}
                    className="text-[12px] font-bold text-primary transition-colors hover:text-primary-hover"
                  >
                    Lupa password?
                  </button>
                </div>
                {ok && (
                  <div
                    className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-300"
                    role="status"
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{ok}</span>
                  </div>
                )}
                {err && (
                  <div
                    className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-400/30 dark:bg-red-500/10 dark:text-red-300"
                    role="alert"
                  >
                    {err}
                  </div>
                )}
                <button
                  disabled={loading || !canSubmit}
                  className="relative w-full h-12 overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 px-4 text-white font-bold shadow-[0_12px_32px_rgba(245,158,11,0.35)] transition-all duration-300 hover:shadow-[0_16px_40px_rgba(245,158,11,0.45)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:translate-y-0"
                >
                  <span className="relative z-10">{loading ? 'Masuk…' : 'Masuk'}</span>
                  <span
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full hover:translate-x-full transition-transform duration-700"
                    aria-hidden="true"
                  />
                </button>
              </form>
            )}

            {tantangan && (
              <form onSubmit={submit2fa} className="space-y-4">
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-700 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-300">
                  <KeyRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    Password <b>{tantangan.nama}</b> benar. Akun ini memakai verifikasi dua faktor — masukkan kode 6
                    angka dari aplikasi authenticator Anda.
                  </span>
                </div>

                {pakaiPemulihan ? (
                  <label className="block" htmlFor="siaga-recovery">
                    <span className="text-xs font-black uppercase tracking-wide text-slate-500">Kode pemulihan</span>
                    <div className="mt-1.5 flex items-center rounded-xl border border-slate-200 bg-white px-3 shadow-sm transition-all duration-200 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 dark:border-slate-700 dark:bg-slate-800/60">
                      <LifeBuoy className="mr-2 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                      <input
                        id="siaga-recovery"
                        type="text"
                        inputMode="text"
                        autoComplete="off"
                        maxLength={10}
                        autoFocus
                        value={kode2fa}
                        onChange={(e) => setKode2fa(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                        placeholder="CONTOH5XY"
                        className="min-w-0 flex-1 border-0 bg-transparent py-3 text-center text-sm font-black tracking-[0.2em] outline-none dark:text-white"
                      />
                    </div>
                    <span className="mt-1 block text-[10px] text-slate-400">
                      Satu dari delapan kode yang Anda simpan saat mengaktifkan 2FA. Kode sekali pakai.
                    </span>
                  </label>
                ) : (
                  <label className="block" htmlFor="siaga-kode-2fa">
                    <span className="text-xs font-black uppercase tracking-wide text-slate-500">
                      Kode authenticator
                    </span>
                    <div className="mt-1.5 flex items-center rounded-xl border border-slate-200 bg-white px-3 shadow-sm transition-all duration-200 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 dark:border-slate-700 dark:bg-slate-800/60">
                      <input
                        id="siaga-kode-2fa"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        autoFocus
                        value={kode2fa}
                        onChange={(e) => setKode2fa(e.target.value.replace(/\D/g, ''))}
                        placeholder="000000"
                        className="min-w-0 flex-1 border-0 bg-transparent py-3 text-center text-2xl font-black tabular-nums tracking-[0.5em] outline-none dark:text-white"
                      />
                    </div>
                  </label>
                )}

                {err && (
                  <div
                    className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-400/30 dark:bg-red-500/10 dark:text-red-300"
                    role="alert"
                  >
                    {err}
                  </div>
                )}

                <button
                  disabled={loading || kode2fa.length < (pakaiPemulihan ? 10 : 6)}
                  className="relative w-full h-12 overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 px-4 text-white font-bold shadow-[0_12px_32px_rgba(245,158,11,0.35)] transition-all duration-300 hover:shadow-[0_16px_40px_rgba(245,158,11,0.45)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:translate-y-0"
                >
                  <span className="relative z-10">{loading ? 'Memeriksa…' : 'Verifikasi & Masuk'}</span>
                  <span
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full hover:translate-x-full transition-transform duration-700"
                    aria-hidden="true"
                  />
                </button>

                <div className="flex items-center justify-between text-[12px] font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      setPakaiPemulihan((v) => !v);
                      setKode2fa('');
                      setErr('');
                    }}
                    className="text-primary transition-colors hover:text-primary-hover"
                  >
                    {pakaiPemulihan ? 'Pakai kode authenticator' : 'Masuk pakai kode pemulihan'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTantangan(null);
                      setKode2fa('');
                      setPakaiPemulihan(false);
                      setErr('');
                    }}
                    className="inline-flex items-center gap-1 text-slate-400 transition-colors hover:text-slate-600"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> Kembali
                  </button>
                </div>
              </form>
            )}

            {!tantangan && lupaOpen && (
              <LupaPasswordModal
                tipe={tab}
                identitas={tab === 'wali' ? form.no_wa : form.username}
                onClose={() => setLupaOpen(false)}
                onBerhasil={() => {
                  setLupaOpen(false);
                  setErr('');
                  setForm((f) => ({ ...f, password: '' }));
                  setOk('Password berhasil diubah. Silakan masuk dengan password baru Anda.');
                }}
              />
            )}

            <div className="mt-6 grid grid-cols-3 gap-2 text-center">
              {[
                ['Siswa', '200+'],
                ['Cabang', '5'],
                ['Terintegrasi', 'AI']
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-slate-100 bg-slate-50/60 p-2.5 dark:border-slate-800 dark:bg-slate-800/40"
                >
                  <div className="text-base font-black text-text-main dark:text-slate-100">{value}</div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
                </div>
              ))}
            </div>

            {import.meta.env.DEV && tab === 'staff' && (
              <button
                onClick={() => setForm({ username: 'admin', no_wa: '', password: 'admin123' })}
                className="mt-5 w-full text-xs font-bold text-primary hover:text-primary-hover transition-colors duration-200"
              >
                Isi akun dev admin
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  autoFocus = false,
  autoComplete,
  spellCheck,
  trailing,
  name,
  id
}) {
  const fieldId =
    id ||
    `siaga-${String(label)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <label htmlFor={fieldId} className="block">
      <span className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</span>
      <div className="mt-1.5 group flex items-center rounded-xl border border-slate-200 bg-white px-3 shadow-sm transition-all duration-200 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 focus-within:shadow-md dark:border-slate-700 dark:bg-slate-800/60 dark:focus-within:border-primary">
        <input
          id={fieldId}
          name={
            name ||
            `siaga_${String(label)
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '_')}`
          }
          type={type}
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          spellCheck={spellCheck}
          className="min-w-0 flex-1 border-0 bg-transparent py-3 text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500 dark:text-white"
        />
        {trailing}
      </div>
    </label>
  );
}
