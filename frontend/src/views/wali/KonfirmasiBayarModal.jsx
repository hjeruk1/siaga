import { useMemo, useRef, useState } from 'react';
import { Clock, ImagePlus, Loader2, Upload, X, XCircle } from 'lucide-react';
import { api } from '../../api';
import { Modal } from '../../components/Shared';
import { rupiah } from './portalHelpers.js';

// Modal "Konfirmasi Pembayaran" untuk orang tua: pilih tagihan, isi nominal
// (default = sisa total pilihan), unggah foto bukti transfer, kirim.
//
// Bukti bersifat wajib: tanpa foto, bendahara tidak bisa memverifikasi dan
// pengajuan hampir pasti ditolak. Pesan error dari server ditampilkan apa
// adanya supaya orang tua tahu apa yang harus diperbaiki.
export function KonfirmasiBayarModal({ open, onClose, siswaId, billing, onSukses }) {
  const tagihan = useMemo(
    () => (billing?.tagihan || []).filter((t) => t.nominal_final - t.paid_amount > 0),
    [billing]
  );
  const [pilihan, setPilihan] = useState([]);
  const [nominal, setNominal] = useState('');
  const [metode, setMetode] = useState('transfer');
  const [catatan, setCatatan] = useState('');
  const [file, setFile] = useState(null);
  const [pratinjau, setPratinjau] = useState(null);
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState(null);
  const inputRef = useRef(null);

  const sisaPilihan = tagihan
    .filter((t) => pilihan.includes(t.id))
    .reduce((a, t) => a + (t.nominal_final - t.paid_amount), 0);

  function pilih(id) {
    setPilihan((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  function pilihFile(f) {
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      setGalat('Berkas harus berupa foto (JPG/PNG).');
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setGalat('Ukuran foto maksimal 5 MB.');
      return;
    }
    setGalat(null);
    setFile(f);
    setPratinjau(URL.createObjectURL(f));
  }

  function tutup() {
    if (pratinjau) URL.revokeObjectURL(pratinjau);
    setPilihan([]);
    setNominal('');
    setMetode('transfer');
    setCatatan('');
    setFile(null);
    setPratinjau(null);
    setGalat(null);
    onClose();
  }

  async function kirimKonfirmasi() {
    setGalat(null);
    if (!pilihan.length) return setGalat('Pilih minimal satu tagihan.');
    const angka = Number(String(nominal).replace(/[^\d]/g, ''));
    if (!angka || angka <= 0) return setGalat('Nominal pembayaran wajib diisi.');
    if (!file) return setGalat('Foto bukti pembayaran wajib diunggah.');
    setKirim(true);
    try {
      const fd = new FormData();
      fd.append('siswa_id', String(siswaId));
      fd.append('tagihan_ids', JSON.stringify(pilihan));
      fd.append('nominal', String(angka));
      fd.append('metode', metode);
      fd.append('catatan', catatan);
      fd.append('bukti', file);
      await api.konfirmasiBayar(fd);
      onSukses?.();
      // reset lewat tutup() agar URL pratinjau dilepas
      if (pratinjau) URL.revokeObjectURL(pratinjau);
      setPilihan([]);
      setNominal('');
      setCatatan('');
      setFile(null);
      setPratinjau(null);
      onClose();
    } catch (e) {
      setGalat(e.message);
    } finally {
      setKirim(false);
    }
  }

  if (!open) return null;
  return (
    <Modal onClose={tutup} title="Konfirmasi Pembayaran">
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
          Pilih tagihan, isi nominal yang Anda bayar, lalu unggah <b>foto bukti transfer</b>. Bendahara akan
          memeriksa dan mengonfirmasi — Anda mendapat notifikasi begitu diterima atau perlu diperbaiki.
        </div>

        <div>
          <div className="text-xs font-black text-text-main">Tagihan</div>
          <div className="mt-2 space-y-2">
            {tagihan.map((t) => {
              const sisa = t.nominal_final - t.paid_amount;
              const on = pilihan.includes(t.id);
              return (
                <label
                  key={t.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 transition-colors ${
                    on ? 'border-primary bg-primary-container' : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => pilih(t.id)}
                    className="h-4 w-4 accent-[var(--color-primary)]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-black text-text-main">{t.nama}</div>
                    <div className="text-[10px] font-semibold text-slate-400">Periode {t.periode}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-black tabular-nums text-text-main">{rupiah(sisa)}</div>
                    <div className="text-[10px] font-semibold text-slate-400">sisa</div>
                  </div>
                </label>
              );
            })}
            {!tagihan.length ? (
              <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-center text-xs font-semibold text-slate-400">
                Tidak ada tagihan yang menunggu pembayaran.
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-black text-text-main" htmlFor="konf-nominal">
              Nominal dibayar
            </label>
            <input
              id="konf-nominal"
              inputMode="numeric"
              value={nominal}
              onChange={(e) => setNominal(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="0"
              className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold tabular-nums"
            />
            {sisaPilihan > 0 ? (
              <button
                type="button"
                onClick={() => setNominal(String(sisaPilihan))}
                className="mt-1 text-[10px] font-black text-primary hover:underline"
              >
                Bayar penuh ({rupiah(sisaPilihan)})
              </button>
            ) : null}
          </div>
          <div>
            <span className="text-xs font-black text-text-main">Metode</span>
            <div className="mt-1 flex gap-1.5">
              {[
                { v: 'transfer', l: 'Transfer' },
                { v: 'qris', l: 'QRIS' },
                { v: 'lainnya', l: 'Lainnya' }
              ].map((m) => (
                <button
                  key={m.v}
                  type="button"
                  onClick={() => setMetode(m.v)}
                  className={`h-10 flex-1 rounded-xl border text-xs font-black transition-colors ${
                    metode === m.v ? 'border-primary bg-primary-container text-primary' : 'border-slate-200 text-slate-500'
                  }`}
                >
                  {m.l}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className="text-xs font-black text-text-main" htmlFor="konf-catatan">
            Catatan (opsional)
          </label>
          <input
            id="konf-catatan"
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            placeholder="Mis. transfer BCA 15 Okt pukul 09.30"
            className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
          />
        </div>

        <div>
          <span className="text-xs font-black text-text-main">Foto bukti transfer</span>
          <div className="mt-1.5 flex items-center gap-3">
            {pratinjau ? (
              <div className="relative">
                <img src={pratinjau} alt="Pratinjau bukti" className="h-20 w-20 rounded-xl object-cover" />
                <button
                  type="button"
                  aria-label="Hapus foto"
                  onClick={() => {
                    setFile(null);
                    setPratinjau(null);
                  }}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-white p-0.5 shadow"
                >
                  <X className="h-3.5 w-3.5 text-slate-500" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 text-slate-400 transition-colors hover:border-primary hover:text-primary"
              >
                <ImagePlus className="h-5 w-5" />
                <span className="text-[9px] font-black uppercase">Pilih foto</span>
              </button>
            )}
            <p className="text-[10px] leading-relaxed text-slate-400">
              Format JPG/PNG, maksimal 5 MB. Pastikan nominal, tanggal, dan nama pengirim terbaca jelas.
            </p>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => pilihFile(e.target.files?.[0])}
            />
          </div>
        </div>

        {galat ? (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {galat}
          </div>
        ) : null}

        <div className="flex gap-2 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={tutup}
            className="h-10 flex-1 rounded-xl border border-slate-200 text-xs font-black text-slate-600"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={kirimKonfirmasi}
            disabled={kirim}
            className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary text-xs font-black text-white transition-opacity disabled:opacity-60"
          >
            {kirim ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {kirim ? 'Mengirim…' : 'Kirim Konfirmasi'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Kartu status klaim milik orang tua (menunggu / perlu diperbaiki) supaya tidak
// bertanya-tanya setelah mengirim bukti.
export function StatusKlaim({ pembayaran }) {
  const klaim = (pembayaran || []).filter((p) => p.status === 'pending_verification' || p.status === 'rejected');
  if (!klaim.length) return null;
  return (
    <div className="space-y-2">
      <div className="text-xs font-black text-text-main">Status konfirmasi Anda</div>
      {klaim.map((p) => (
        <div key={p.id} className="flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-white p-3">
          {p.status === 'pending_verification' ? (
            <Clock className="h-4 w-4 shrink-0 text-amber-500" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0 text-red-500" />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-xs font-black text-text-main">
              {p.status === 'pending_verification' ? 'Menunggu verifikasi bendahara' : 'Perlu diperbaiki'}
            </div>
            <div className="truncate text-[10px] font-semibold text-slate-500">
              {rupiah(p.nominal)} · {p.metode}
              {p.void_reason ? ` · ${p.void_reason}` : ''}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
