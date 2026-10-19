// Modal pemulihan password mandiri lewat kode OTP WhatsApp.
//
// Dua langkah: minta kode -> masukkan kode + password baru. Sengaja tidak
// memakai tautan reset lewat email karena wali TIDAK punya email di sistem ini;
// satu-satunya identitas yang benar-benar dimiliki orang tua adalah nomor
// WhatsApp yang terdaftar di sekolah.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, CheckCircle2, KeyRound, Loader2, MessageCircle, ShieldAlert } from 'lucide-react';
import { Modal } from '../components/Shared';
import { api } from '../api';

const JEDA_KIRIM_ULANG = 60; // detik; sejalan dengan pembatasan di server

export default function LupaPasswordModal({ tipe = 'wali', identitas = '', onClose, onBerhasil }) {
  const [langkah, setLangkah] = useState('minta');
  const [nilai, setNilai] = useState(identitas);
  const [kode, setKode] = useState('');
  const [sandi, setSandi] = useState('');
  const [ulangi, setUlangi] = useState('');
  const [galat, setGalat] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [tunggu, setTunggu] = useState(0);
  const inputKode = useRef(null);

  const wali = tipe === 'wali';

  // Hitung mundur tombol "kirim ulang" supaya pengguna tidak menekannya
  // berulang dan malah kena batas 3 permintaan / 15 menit di server.
  useEffect(() => {
    if (tunggu <= 0) return undefined;
    const t = setTimeout(() => setTunggu((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [tunggu]);

  useEffect(() => {
    if (langkah === 'kode') inputKode.current?.focus();
  }, [langkah]);

  async function mintaKode(e) {
    e?.preventDefault?.();
    setGalat('');
    setInfo('');
    const bersih = nilai.trim();
    if (!bersih) return setGalat(wali ? 'Isi nomor WhatsApp Anda.' : 'Isi username Anda.');
    setBusy(true);
    try {
      const r = await api.lupaPassword(wali ? { tipe: 'wali', no_wa: bersih } : { tipe: 'staff', username: bersih });
      setInfo(r?.pesan || 'Jika akun terdaftar, kode sudah dikirim lewat WhatsApp.');
      setLangkah('kode');
      setTunggu(JEDA_KIRIM_ULANG);
    } catch (err) {
      // WA_NONAKTIF / GAGAL_KIRIM / TERLALU_SERING: pesan server sudah jelas,
      // jangan diganti dengan teks umum yang menyembunyikan masalahnya.
      setGalat(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function simpan(e) {
    e?.preventDefault?.();
    setGalat('');
    if (!/^\d{6}$/.test(kode.trim())) return setGalat('Kode verifikasi terdiri dari 6 angka.');
    if (sandi !== ulangi) return setGalat('Kedua password baru belum sama.');
    setBusy(true);
    try {
      await api.resetPasswordMandiri({
        ...(wali ? { tipe: 'wali', no_wa: nilai.trim() } : { tipe: 'staff', username: nilai.trim() }),
        kode: kode.trim(),
        password_baru: sandi
      });
      setLangkah('sukses');
    } catch (err) {
      setGalat(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Dirender lewat portal ke <body>: kartu login memakai `backdrop-blur`, dan
  // properti itu menjadikan kartu sebagai containing block untuk elemen
  // `position: fixed`. Tanpa portal, latar modal hanya menutupi kartu login,
  // bukan seluruh layar.
  if (langkah === 'sukses') {
    return createPortal(
      <Modal title="Password berhasil diubah" onClose={onClose}>
        <div className="space-y-4 py-2 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            Password baru sudah tersimpan. Semua perangkat yang sebelumnya masuk sudah dikeluarkan — masuk lagi dengan
            password baru Anda.
          </p>
          <button
            onClick={onBerhasil}
            className="h-11 w-full rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 text-sm font-black text-white shadow-lg shadow-amber-500/25 transition-all active:scale-[0.99]"
          >
            Masuk dengan password baru
          </button>
        </div>
      </Modal>,
      document.body
    );
  }

  return createPortal(
    <Modal title="Lupa password" onClose={onClose}>
      <form onSubmit={langkah === 'minta' ? mintaKode : simpan} className="space-y-3.5">
        {langkah === 'minta' ? (
          <>
            <p className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
              {wali
                ? 'Masukkan nomor WhatsApp yang terdaftar di sekolah. Kami kirim kode 6 angka lewat WhatsApp.'
                : 'Masukkan username Anda. Kode dikirim ke nomor WhatsApp yang tercatat di sekolah.'}
            </p>
            <label htmlFor="lupa-identitas" className="block">
              <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                {wali ? 'Nomor WhatsApp' : 'Username'}
              </span>
              <input
                id="lupa-identitas"
                value={nilai}
                onChange={(e) => setNilai(e.target.value)}
                autoComplete="username"
                inputMode={wali ? 'tel' : 'text'}
                spellCheck={false}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800/60 dark:text-white"
              />
            </label>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                setLangkah('minta');
                setGalat('');
              }}
              className="inline-flex items-center gap-1.5 text-[12px] font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Ubah {wali ? 'nomor' : 'username'}
            </button>

            {info && (
              <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-semibold text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-300">
                <MessageCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{info} Kode berlaku 5 menit.</span>
              </div>
            )}

            <label htmlFor="lupa-kode" className="block">
              <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">Kode verifikasi</span>
              <input
                id="lupa-kode"
                ref={inputKode}
                value={kode}
                onChange={(e) => setKode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-center text-xl font-black tracking-[0.5em] text-slate-900 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800/60 dark:text-white"
              />
            </label>

            <label htmlFor="lupa-sandi" className="block">
              <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">Password baru</span>
              <input
                id="lupa-sandi"
                type="password"
                value={sandi}
                onChange={(e) => setSandi(e.target.value)}
                autoComplete="new-password"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800/60 dark:text-white"
              />
              <span className="mt-1 block text-[11px] text-slate-400">
                Minimal 10 karakter, mengandung huruf dan angka.
              </span>
            </label>

            <label htmlFor="lupa-ulangi" className="block">
              <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                Ulangi password baru
              </span>
              <input
                id="lupa-ulangi"
                type="password"
                value={ulangi}
                onChange={(e) => setUlangi(e.target.value)}
                autoComplete="new-password"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800/60 dark:text-white"
              />
            </label>

            <button
              type="button"
              disabled={tunggu > 0 || busy}
              onClick={mintaKode}
              className="text-[12px] font-bold text-primary disabled:text-slate-400"
            >
              {tunggu > 0 ? `Kirim ulang kode dalam ${tunggu} detik` : 'Kirim ulang kode'}
            </button>
          </>
        )}

        {galat && (
          <div
            role="alert"
            className="flex gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700 dark:border-red-400/30 dark:bg-red-500/10 dark:text-red-300"
          >
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{galat}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 text-sm font-black text-white shadow-lg shadow-amber-500/25 transition-all active:scale-[0.99] disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          {langkah === 'minta' ? 'Kirim kode lewat WhatsApp' : 'Simpan password baru'}
        </button>

        <p className="text-center text-[11px] leading-relaxed text-slate-400">
          Tidak punya akses ke nomor terdaftar? Hubungi admin sekolah untuk mengatur ulang password Anda.
        </p>
      </form>
    </Modal>,
    document.body
  );
}
