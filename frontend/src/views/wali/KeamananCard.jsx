import { useEffect, useRef, useState } from 'react';
import { Delete, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { api } from '../../api';
import { Modal } from '../../components/Shared';
import { hapusPinToken, simpanPinToken } from '../../utils/pin.js';

// Kotak masuk PIN 6 angka. Dipakai dua kali: untuk verifikasi saat server
// memintanya (PIN_REQUIRED) dan untuk memasang/mengubah PIN.
function PinInput({ nilai, onChange, selesai, otomatisFokus }) {
  const refs = useRef([]);
  useEffect(() => {
    if (otomatisFokus) refs.current[0]?.focus();
  }, [otomatisFokus]);

  function isi(idx, teks) {
    const angka = teks.replace(/\D/g, '');
    if (!angka) return;
    const gabung = (nilai.slice(0, idx) + angka).slice(0, 6);
    onChange(gabung);
    refs.current[Math.min(idx + angka.length, 5)]?.focus();
    if (gabung.length === 6) selesai?.(gabung);
  }

  function hapus(idx) {
    onChange(nilai.slice(0, idx));
    refs.current[Math.max(idx - 1, 0)]?.focus();
  }

  return (
    <div className="flex justify-center gap-2">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          type="password"
          inputMode="numeric"
          maxLength={1}
          value={nilai[i] || ''}
          onChange={(e) => isi(i, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Backspace') {
              e.preventDefault();
              hapus(i);
            }
          }}
          aria-label={`Angka PIN ke-${i + 1}`}
          className="h-12 w-10 rounded-xl border border-slate-200 bg-white text-center text-lg font-black tabular-nums focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      ))}
    </div>
  );
}

/**
 * Modal minta PIN saat server menjawab PIN_REQUIRED.
 * Setelah benar, token disimpan dan aksi asli dicoba lagi.
 */
export function PinPrompt({ open, onClose, onBerhasil, alasan }) {
  const [pin, setPin] = useState('');
  const [galat, setGalat] = useState(null);
  const [kirim, setKirim] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (open) {
      setPin('');
      setGalat(null);
      api
        .pinStatus()
        .then(setStatus)
        .catch(() => {});
    }
  }, [open]);

  async function kirimPin(pinLengkap) {
    setKirim(true);
    setGalat(null);
    try {
      const r = await api.verifyPin(pinLengkap);
      simpanPinToken(r.pin_token, r.berlaku_detik);
      onBerhasil?.();
    } catch (e) {
      setGalat(e.message);
      setPin('');
    } finally {
      setKirim(false);
    }
  }

  if (!open) return null;

  return (
    <Modal onClose={onClose} title="Masukkan PIN">
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-700">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {alasan || 'Bagian ini menyangkut data keuangan. Masukkan PIN 6 angka untuk melanjutkan.'}
        </div>

        <PinInput
          nilai={pin}
          onChange={(v) => {
            setPin(v);
            if (v.length === 6) kirimPin(v);
          }}
          selesai={kirimPin}
        />

        {status?.terkunci ? (
          <p className="text-center text-[11px] font-bold text-red-600">
            PIN terkunci sementara. Coba lagi dalam beberapa menit.
          </p>
        ) : null}
        {galat ? (
          <p className="text-center text-[11px] font-bold text-red-600">{galat}</p>
        ) : kirim ? (
          <p className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Memeriksa…
          </p>
        ) : null}

        <button
          type="button"
          onClick={onClose}
          className="h-10 w-full rounded-xl border border-slate-200 text-xs font-black text-slate-600"
        >
          Batal
        </button>
      </div>
    </Modal>
  );
}

/**
 * Kartu "Keamanan akun" di portal wali: ganti password (sukarela) dan
 * pasang/ubah/hapus PIN.
 */
export function KeamananCard({ toast, onPinBerubah }) {
  const [status, setStatus] = useState(null);
  const [menu, setMenu] = useState(null); // 'password' | 'pin' | 'hapus'
  const [form, setForm] = useState({ password: '', pin: '', konfirmasi: '' });
  const [galat, setGalat] = useState(null);
  const [kirim, setKirim] = useState(false);

  useEffect(() => {
    api
      .pinStatus()
      .then(setStatus)
      .catch(() => {});
  }, []);

  function buka(nama) {
    setMenu(nama);
    setForm({ password: '', pin: '', konfirmasi: '' });
    setGalat(null);
  }

  async function gantiPassword() {
    setGalat(null);
    if (form.pin !== form.konfirmasi) return setGalat('Konfirmasi password tidak sama');
    setKirim(true);
    try {
      await api.changePassword(form.pin, form.password);
      toast?.('ok', 'Password berhasil diganti. Silakan masuk kembali.');
      setMenu(null);
    } catch (e) {
      setGalat(e.message);
    } finally {
      setKirim(false);
    }
  }

  async function pasangPin() {
    setGalat(null);
    if (form.pin !== form.konfirmasi) return setGalat('Konfirmasi PIN tidak sama');
    setKirim(true);
    try {
      await api.setPin(form.pin, form.password);
      const s = await api.pinStatus();
      setStatus(s);
      toast?.('ok', 'PIN aktif. Tagihan dan konfirmasi pembayaran kini butuh PIN.');
      setMenu(null);
      // Penting: data tagihan yang sudah ada di memori sesi ini harus dibuang.
      // Kalau tidak, orang tua yang baru memasang PIN tetap bisa melihat rincian
      // keuangan di tab Tagihan sampai aplikasi dimuat ulang.
      onPinBerubah?.();
    } catch (e) {
      setGalat(e.message);
    } finally {
      setKirim(false);
    }
  }

  async function hapusPin() {
    setGalat(null);
    setKirim(true);
    try {
      await api.deletePin(form.password);
      hapusPinToken();
      const s = await api.pinStatus();
      setStatus(s);
      toast?.('ok', 'PIN dimatikan.');
      setMenu(null);
      onPinBerubah?.();
    } catch (e) {
      setGalat(e.message);
    } finally {
      setKirim(false);
    }
  }

  const inputCls = 'mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">
          <ShieldCheck className="h-4.5 w-4.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-black text-text-main">Keamanan akun</div>
          <p className="text-[11px] text-slate-500">Password dan PIN untuk data keuangan anak Anda.</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => buka('password')}
          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 transition-colors hover:bg-slate-50"
        >
          Ganti password
        </button>
        {status?.punyaPin ? (
          <>
            <span className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">PIN aktif</span>
            <button
              type="button"
              onClick={() => buka('hapus')}
              className="inline-flex items-center gap-1 rounded-xl px-2.5 py-2 text-xs font-black text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <Delete className="h-3.5 w-3.5" /> Matikan
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => buka('pin')}
            className="rounded-xl bg-primary px-3.5 py-2 text-xs font-black text-white transition-colors hover:bg-primary-hover"
          >
            Pasang PIN
          </button>
        )}
      </div>

      <p className="mt-2.5 text-[10px] leading-relaxed text-slate-400">
        PIN dibutuhkan sebelum membuka tagihan, riwayat pembayaran, dan mengirim konfirmasi pembayaran. Berguna kalau HP
        Anda dipinjam keluarga. PIN tidak bisa memulihkan akun — kalau lupa, masuk pakai password lalu matikan PIN.
      </p>

      {menu === 'password' ? (
        <Modal onClose={() => setMenu(null)} title="Ganti Password">
          <div className="space-y-3">
            <label className="block text-xs font-black text-text-main" htmlFor="kp-lama">
              Password baru
              <input
                id="kp-lama"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className={inputCls}
                placeholder="Minimal 10 karakter, huruf + angka"
              />
            </label>
            <label className="block text-xs font-black text-text-main" htmlFor="kp-ulang">
              Ulangi password baru
              <input
                id="kp-ulang"
                type="password"
                value={form.konfirmasi}
                onChange={(e) => setForm({ ...form, konfirmasi: e.target.value })}
                className={inputCls}
              />
            </label>
            {galat ? <p className="text-xs font-bold text-red-600">{galat}</p> : null}
            <button
              type="button"
              onClick={gantiPassword}
              disabled={kirim}
              className="h-10 w-full rounded-xl bg-primary text-xs font-black text-white disabled:opacity-60"
            >
              {kirim ? 'Menyimpan…' : 'Simpan password baru'}
            </button>
          </div>
        </Modal>
      ) : null}

      {menu === 'pin' ? (
        <Modal onClose={() => setMenu(null)} title="Pasang PIN Keamanan">
          <div className="space-y-3">
            <label className="block text-xs font-black text-text-main" htmlFor="pin-baru">
              PIN 6 angka
              <input
                id="pin-baru"
                inputMode="numeric"
                maxLength={6}
                value={form.pin}
                onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })}
                className={inputCls}
                placeholder="Contoh: 482913"
              />
            </label>
            <label className="block text-xs font-black text-text-main" htmlFor="pin-ulang">
              Ulangi PIN
              <input
                id="pin-ulang"
                inputMode="numeric"
                maxLength={6}
                value={form.konfirmasi}
                onChange={(e) => setForm({ ...form, konfirmasi: e.target.value.replace(/\D/g, '') })}
                className={inputCls}
              />
            </label>
            <label className="block text-xs font-black text-text-main" htmlFor="pin-pass">
              Password akun (untuk memastikan Anda pemiliknya)
              <input
                id="pin-pass"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className={inputCls}
              />
            </label>
            {galat ? <p className="text-xs font-bold text-red-600">{galat}</p> : null}
            <button
              type="button"
              onClick={pasangPin}
              disabled={kirim}
              className="h-10 w-full rounded-xl bg-primary text-xs font-black text-white disabled:opacity-60"
            >
              {kirim ? 'Menyimpan…' : 'Aktifkan PIN'}
            </button>
          </div>
        </Modal>
      ) : null}

      {menu === 'hapus' ? (
        <Modal onClose={() => setMenu(null)} title="Matikan PIN">
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-slate-500">
              Setelah dimatikan, tagihan dan konfirmasi pembayaran bisa dibuka tanpa PIN.
            </p>
            <label className="block text-xs font-black text-text-main" htmlFor="hapus-pass">
              Password akun
              <input
                id="hapus-pass"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className={inputCls}
              />
            </label>
            {galat ? <p className="text-xs font-bold text-red-600">{galat}</p> : null}
            <button
              type="button"
              onClick={hapusPin}
              disabled={kirim}
              className="h-10 w-full rounded-xl bg-red-600 text-xs font-black text-white disabled:opacity-60"
            >
              {kirim ? 'Memproses…' : 'Matikan PIN'}
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
