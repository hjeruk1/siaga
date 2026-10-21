// Panel pengumuman sekolah — dipakai admin (pusat & cabang) dan kepsek.
//
// Kenapa ada konfirmasi jumlah penerima sebelum kirim: pengumuman langsung
// masuk ke notifikasi, push, DAN WhatsApp orang tua. Salah kirim tidak bisa
// ditarik kembali; yang bisa dilakukan hanya mengirim koreksi. Menampilkan
// "akan dikirim ke 5 orang tua" sebelum tombol aktif adalah pengaman termurah.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { CustomSelect, Modal } from '../../components/Shared';
import { AlertTriangle, Loader2, Megaphone, Send, Users } from 'lucide-react';
import { useMaster } from '../admin/AdminShared';

function waktu(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function PengumumanPanel({ user, toast }) {
  const { cabang, cabangId, setCabangId } = useMaster(user);
  const adminPusat = user.role === 'admin';

  const [lingkup, setLingkup] = useState('cabang');
  const [judul, setJudul] = useState('');
  const [isi, setIsi] = useState('');
  const [penting, setPenting] = useState(false);
  const [jumlah, setJumlah] = useState(null);
  const [memuatJumlah, setMemuatJumlah] = useState(false);
  const [busy, setBusy] = useState(false);
  const [konfirmasi, setKonfirmasi] = useState(false);
  const [daftar, setDaftar] = useState([]);
  const [memuatDaftar, setMemuatDaftar] = useState(true);

  const targetCabang = lingkup === 'semua' ? null : cabangId || user.cabang_id;

  const muatDaftar = useCallback(async () => {
    setMemuatDaftar(true);
    try {
      const d = await api.daftarPengumuman({ limit: 20, cabang_id: adminPusat ? cabangId || undefined : undefined });
      setDaftar(d?.rows || []);
    } catch (e) {
      toast?.('err', e.message);
    } finally {
      setMemuatDaftar(false);
    }
  }, [cabangId, adminPusat, toast]);

  useEffect(() => {
    muatDaftar();
  }, [muatDaftar]);

  // Pratinjau jumlah penerima: dihitung server, bukan diperkirakan di browser.
  useEffect(() => {
    let batal = false;
    async function hitung() {
      if (lingkup === 'cabang' && !targetCabang) return setJumlah(null);
      setMemuatJumlah(true);
      try {
        const d = await api.pengumumanPreview({ lingkup, cabang_id: targetCabang || undefined });
        if (!batal) setJumlah(d?.jumlah ?? null);
      } catch {
        if (!batal) setJumlah(null);
      } finally {
        if (!batal) setMemuatJumlah(false);
      }
    }
    hitung();
    return () => {
      batal = true;
    };
  }, [lingkup, targetCabang]);

  const bisaKirim = judul.trim().length >= 5 && isi.trim().length >= 10 && (jumlah || 0) > 0;

  async function kirim() {
    setBusy(true);
    try {
      const r = await api.kirimPengumuman({
        judul: judul.trim(),
        isi: isi.trim(),
        penting,
        lingkup,
        cabang_id: targetCabang || undefined
      });
      toast?.('ok', `Pengumuman terkirim ke ${r?.penerima ?? jumlah} orang tua.`);
      setKonfirmasi(false);
      setJudul('');
      setIsi('');
      setPenting(false);
      await muatDaftar();
    } catch (e) {
      toast?.('err', e.message);
      setKonfirmasi(false);
    } finally {
      setBusy(false);
    }
  }

  const labelTujuan = useMemo(() => {
    if (lingkup === 'semua') return 'Semua cabang';
    const c = cabang.find((x) => Number(x.id) === Number(targetCabang));
    return c ? c.nama : 'Cabang ini';
  }, [lingkup, cabang, targetCabang]);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_18px_60px_rgba(15,23,42,.05)] sm:p-4">
        <div className="mb-3 flex items-start gap-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-container text-primary">
            <Megaphone className="h-4.5 w-4.5" />
          </span>
          <div>
            <h2 className="text-lg font-black tracking-[-0.01em] text-text-main">Pengumuman</h2>
            <p className="text-[12px] font-semibold text-slate-500">
              Satu pesan untuk semua orang tua — masuk ke notifikasi aplikasi, push, dan WhatsApp.
            </p>
          </div>
        </div>

        <div className="space-y-2.5">
          <label htmlFor="peng-judul" className="block">
            <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">Judul</span>
            <input
              id="peng-judul"
              value={judul}
              onChange={(e) => setJudul(e.target.value)}
              maxLength={120}
              placeholder="Contoh: Perubahan jam pulang"
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>

          <label htmlFor="peng-isi" className="block">
            <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">Isi</span>
            <textarea
              id="peng-isi"
              value={isi}
              onChange={(e) => setIsi(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Tulis informasi lengkapnya. Hindari singkatan agar tidak menimbulkan pertanyaan."
              className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <span className="mt-1 block text-[11px] font-semibold text-slate-400">{isi.length}/2000 karakter</span>
          </label>

          <div className="flex flex-wrap items-end gap-2">
            {adminPusat && (
              <>
                <label className="min-w-[150px] flex-1">
                  <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">Tujuan</span>
                  <CustomSelect
                    className="mt-1.5 w-full"
                    value={lingkup === 'semua' ? 'semua' : 'cabang'}
                    onChange={(e) => setLingkup(e.target.value)}
                  >
                    <option value="cabang">Satu cabang</option>
                    <option value="semua">Semua cabang</option>
                  </CustomSelect>
                </label>
                {lingkup === 'cabang' && (
                  <label className="min-w-[150px] flex-1">
                    <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">Cabang</span>
                    <CustomSelect
                      className="mt-1.5 w-full"
                      value={cabangId || ''}
                      onChange={(e) => setCabangId(e.target.value)}
                    >
                      <option value="">Pilih cabang</option>
                      {cabang.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nama}
                        </option>
                      ))}
                    </CustomSelect>
                  </label>
                )}
              </>
            )}

            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-[12px] font-bold text-slate-600">
              <input
                type="checkbox"
                checked={penting}
                onChange={(e) => setPenting(e.target.checked)}
                className="h-4 w-4 accent-amber-500"
              />
              Tandai penting
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
            <Users className="h-4 w-4 text-slate-400" />
            <span className="text-[12px] font-bold text-slate-600">
              {memuatJumlah ? (
                'Menghitung penerima…'
              ) : jumlah === null ? (
                'Pilih cabang tujuan'
              ) : (
                <>
                  Akan dikirim ke <span className="text-primary">{jumlah} orang tua</span> — {labelTujuan}
                </>
              )}
            </span>
            <button
              type="button"
              disabled={!bisaKirim || busy}
              onClick={() => setKonfirmasi(true)}
              className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-[12px] font-black text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Kirim
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
        <h3 className="mb-2 text-[13px] font-black uppercase tracking-wide text-slate-500">Riwayat pengumuman</h3>
        {memuatDaftar ? (
          <div className="flex justify-center py-8 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : daftar.length === 0 ? (
          <p className="py-8 text-center text-[12px] font-semibold text-slate-400">Belum ada pengumuman terkirim.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {daftar.map((p) => (
              <li key={p.id} className="py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-black text-text-main">{p.judul}</span>
                  {!!p.penting && (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase text-amber-700">
                      Penting
                    </span>
                  )}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase text-slate-500">
                    {p.lingkup === 'semua' ? 'Semua cabang' : p.cabang_nama || 'Cabang'}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-slate-600">{p.isi}</p>
                <p className="mt-1 text-[11px] font-semibold text-slate-400">
                  {p.jumlah_penerima} penerima · {waktu(p.sent_at || p.created_at)} · {p.pengirim || 'sekolah'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {konfirmasi && (
        <Modal title="Kirim pengumuman?" onClose={() => setKonfirmasi(false)}>
          <div className="space-y-3">
            <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Pesan langsung dikirim ke <b>{jumlah} orang tua</b> lewat notifikasi, push, dan WhatsApp. Tidak bisa
                ditarik kembali — koreksi hanya bisa dikirim sebagai pengumuman baru.
              </span>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[13px] font-black text-text-main">{judul.trim()}</div>
              <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-600">{isi.trim()}</p>
              <p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">{labelTujuan}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setKonfirmasi(false)}
                className="h-10 flex-1 rounded-xl bg-slate-100 text-sm font-black text-slate-600 hover:bg-slate-200"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={kirim}
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-black text-white hover:bg-primary-hover disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Kirim sekarang
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
