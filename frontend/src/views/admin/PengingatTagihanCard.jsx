import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { ActionButton, Modal } from '../../components/Shared';
import {
  BellRing,
  ChevronDown,
  FileText,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  TriangleAlert
} from 'lucide-react';

// Kartu kebijakan pengingat tagihan.
//
// Dua angka ditampilkan terpisah dan itu disengaja: "hari ini" adalah yang akan
// dikirim job otomatis, sedangkan "tunggakan" mencakup tagihan yang jatuh tempo
// sebelum pengingat diaktifkan. Admin harus melihat bedanya sebelum menekan
// tombol kirim — mengirim 60 pesan "sudah lewat jatuh tempo" tanpa sadar adalah
// cara tercepat membuat orang tua memblokir nomor sekolah.
const rupiah = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

const TAHAP = [
  { kunci: 'h_sebelum', label: 'H- sebelum jatuh tempo' },
  { kunci: 'jatuh_tempo', label: 'Hari jatuh tempo' },
  { kunci: 'terlambat', label: 'Lewat jatuh tempo' }
];

// Data contoh untuk pratinjau di layar. Nilai sebenarnya tetap dihitung server;
// pratinjau ini hanya supaya admin melihat bentuk kalimatnya sebelum menyimpan.
const CONTOH = {
  nama_anak: 'Aisyah',
  tagihan: 'SPP Oktober 2026',
  nominal: 'Rp 350.000',
  jatuh_tempo: '18 Okt 2026',
  hari: '3'
};

function isiContoh(teks) {
  return String(teks || '').replace(/\{([a-z_]+)\}/g, (utuh, nama) =>
    Object.prototype.hasOwnProperty.call(CONTOH, nama) ? CONTOH[nama] : utuh
  );
}

export default function PengingatTagihanCard({ user, toast }) {
  const admin = user.role === 'admin';
  const [ringkas, setRingkas] = useState(null);
  const [form, setForm] = useState(null);
  const [memuat, setMemuat] = useState(true);
  const [menyimpan, setMenyimpan] = useState(false);
  const [mengirim, setMengirim] = useState(false);
  const [konfirmasi, setKonfirmasi] = useState(null);
  const [pratinjau, setPratinjau] = useState(null);
  const [bukaTemplate, setBukaTemplate] = useState(false);
  const [tahapAktif, setTahapAktif] = useState('h_sebelum');
  // Kolom terakhir yang disentuh (judul/isi) — penentu tempat penyisipan
  // placeholder. Ref, bukan state: nilainya tidak perlu memicu render.
  const kolomTerakhir = useRef('isi');
  const elemen = useRef({});

  // `toast` dibuat ulang setiap App render (fungsi biasa, bukan useCallback).
  // Kalau ia jadi dependensi muat(), efek akan jalan terus dan menimpa isian
  // form — gejalanya: sakelar Aktif/Mati langsung kembali sendiri setelah
  // diklik. Simpan di ref supaya identitas muat() stabil.
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const muat = useCallback(async () => {
    setMemuat(true);
    try {
      const r = await api.pengingatSetelan();
      setRingkas(r);
      setForm({
        aktif: !!r.setelan?.aktif,
        tanggal: r.setelan?.tanggal || 10,
        hariSebelum: r.setelan?.hariSebelum ?? 3,
        jam: r.setelan?.jam || '08:00',
        template: {
          h_sebelum: { ...(r.template?.h_sebelum || { judul: '', isi: '' }) },
          jatuh_tempo: { ...(r.template?.jatuh_tempo || { judul: '', isi: '' }) },
          terlambat: { ...(r.template?.terlambat || { judul: '', isi: '' }) }
        }
      });
    } catch (e) {
      toastRef.current?.('err', e.message);
    } finally {
      setMemuat(false);
    }
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  async function simpan() {
    setMenyimpan(true);
    try {
      await api.simpanPengingatSetelan(form);
      toastRef.current?.('ok', `Pengaturan pengingat disimpan — pengingat ${form.aktif ? 'aktif' : 'mati'}`);
      await muat();
    } catch (e) {
      toastRef.current?.('err', e.message);
    } finally {
      setMenyimpan(false);
    }
  }

  async function bukaKonfirmasi(mode) {
    try {
      const p = await api.pengingatPratinjau(mode === 'semua' ? 'manual' : undefined);
      if (p.total === 0) {
        toastRef.current?.('ok', 'Tidak ada tagihan yang perlu diingatkan saat ini');
        return;
      }
      setPratinjau(p);
      setKonfirmasi(mode);
    } catch (e) {
      toastRef.current?.('err', e.message);
    }
  }

  async function kirim() {
    setMengirim(true);
    try {
      const h = await api.kirimPengingat(konfirmasi === 'semua' ? { mode: 'semua' } : {});
      toastRef.current?.(
        h.terkirim > 0 ? 'ok' : 'err',
        `${h.terkirim} pengingat dikirim${h.tanpa_wali ? `, ${h.tanpa_wali} tanpa wali` : ''}${h.gagal ? `, ${h.gagal} gagal` : ''}`
      );
      setKonfirmasi(null);
      await muat();
    } catch (e) {
      toastRef.current?.('err', e.message);
    } finally {
      setMengirim(false);
    }
  }

  function ubahTemplate(kolom, nilai) {
    setForm((f) => ({
      ...f,
      template: { ...f.template, [tahapAktif]: { ...f.template[tahapAktif], [kolom]: nilai } }
    }));
  }

  // Menyisipkan placeholder di posisi kursor kolom yang terakhir disentuh.
  // Admin biasanya sedang menulis kalimat lalu butuh menyelipkan {nominal} —
  // menempel di akhir teks akan memaksa mereka memindahkan sendiri.
  function sisipPlaceholder(nama) {
    const kolom = kolomTerakhir.current;
    const el = elemen.current[`${tahapAktif}-${kolom}`];
    const teks = `{${nama}}`;
    const pos = el && typeof el.selectionStart === 'number' ? el.selectionStart : null;
    setForm((f) => {
      const lama = f.template[tahapAktif]?.[kolom] || '';
      const titik = pos === null ? lama.length : pos;
      const baru = lama.slice(0, titik) + teks + lama.slice(titik);
      return { ...f, template: { ...f.template, [tahapAktif]: { ...f.template[tahapAktif], [kolom]: baru } } };
    });
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const titik = (pos === null ? 0 : pos) + teks.length;
      el.setSelectionRange(titik, titik);
    });
  }

  function kembalikanBawaan(tahap) {
    const b = ringkas?.template_bawaan?.[tahap];
    if (!b) return;
    setForm((f) => ({ ...f, template: { ...f.template, [tahap]: { judul: b.judul, isi: b.isi } } }));
  }

  function disesuaikan(tahap) {
    const b = ringkas?.template_bawaan?.[tahap];
    const t = form?.template?.[tahap];
    if (!b || !t) return false;
    return t.judul !== b.judul || t.isi !== b.isi;
  }

  if (memuat || !form) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_60px_rgba(15,23,42,.05)]">
        <div className="flex items-center gap-2 text-sm font-black text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Memuat pengingat tagihan
        </div>
      </section>
    );
  }

  const hariIni = ringkas?.hari_ini || { total: 0, h_sebelum: 0, jatuh_tempo: 0, terlambat: 0 };
  const tunggakan = ringkas?.tunggakan || { total: 0, nilai: 0 };
  const mulai = ringkas?.setelan?.mulai;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_18px_60px_rgba(15,23,42,.05)] sm:p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[15px] font-black text-text-main">
            <BellRing className="h-4 w-4 text-primary" />
            Pengingat tagihan
          </h2>
          <p className="text-[11px] font-semibold text-slate-500">
            Kirim pesan otomatis ke wali saat tagihan mendekati dan melewati jatuh tempo — lewat notifikasi aplikasi,
            push, dan WhatsApp dari nomor cabang masing-masing.
          </p>
        </div>
        <button
          type="button"
          onClick={muat}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-100 px-3 text-[12px] font-black text-slate-700 hover:bg-slate-200"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Segarkan
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
        <label className="block">
          <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">
            Tanggal jatuh tempo
          </span>
          <input
            type="number"
            min="1"
            max="28"
            value={form.tanggal}
            onChange={(e) => setForm((f) => ({ ...f, tanggal: Number(e.target.value) }))}
            disabled={!admin}
            className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-black text-text-main outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-slate-100"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">
            Ingatkan H- (hari)
          </span>
          <input
            type="number"
            min="0"
            max="14"
            value={form.hariSebelum}
            onChange={(e) => setForm((f) => ({ ...f, hariSebelum: Number(e.target.value) }))}
            disabled={!admin}
            className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-black text-text-main outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-slate-100"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">Jam kirim</span>
          <input
            type="time"
            value={form.jam}
            onChange={(e) => setForm((f) => ({ ...f, jam: e.target.value }))}
            disabled={!admin}
            className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-black text-text-main outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-slate-100"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, aktif: !f.aktif }))}
            disabled={!admin}
            className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-[12px] font-black transition-all ${
              form.aktif
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 bg-white text-slate-500'
            } disabled:opacity-60`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${form.aktif ? 'bg-emerald-500' : 'bg-slate-300'}`}
              aria-hidden="true"
            />
            {form.aktif ? 'Aktif' : 'Mati'}
          </button>
          {admin && (
            <ActionButton icon={menyimpan ? Loader2 : Save} onClick={simpan} disabled={menyimpan}>
              {menyimpan ? 'Menyimpan' : 'Simpan'}
            </ActionButton>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Akan dikirim hari ini</div>
          <div className="mt-1 text-lg font-black text-text-main">{hariIni.total} pesan</div>
          <div className="mt-1 text-[11px] font-semibold text-slate-500">
            H-{form.hariSebelum}: {hariIni.h_sebelum} · jatuh tempo: {hariIni.jatuh_tempo} · terlambat:{' '}
            {hariIni.terlambat}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Tunggakan lama</div>
          <div className="mt-1 text-lg font-black text-text-main">{tunggakan.total} tagihan</div>
          <div className="mt-1 text-[11px] font-semibold text-slate-500">
            {rupiah(tunggakan.nilai)} · sebelum {mulai || '—'}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Sudah terkirim</div>
          <div className="mt-1 text-lg font-black text-text-main">
            {(ringkas?.riwayat?.h_sebelum || 0) +
              (ringkas?.riwayat?.jatuh_tempo || 0) +
              (ringkas?.riwayat?.terlambat || 0)}{' '}
            pesan
          </div>
          <div className="mt-1 text-[11px] font-semibold text-slate-500">
            H-{ringkas?.riwayat?.h_sebelum || 0} · jatuh tempo {ringkas?.riwayat?.jatuh_tempo || 0} · terlambat{' '}
            {ringkas?.riwayat?.terlambat || 0}
          </div>
        </div>
      </div>

      {ringkas?.contoh && (
        <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-3">
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Contoh pesan hari ini</div>
          <div className="mt-1 text-[13px] font-black text-text-main">{ringkas.contoh.title}</div>
          <div className="mt-1 text-[12px] font-medium leading-relaxed text-slate-600">{ringkas.contoh.body}</div>
        </div>
      )}

      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
        <button
          type="button"
          onClick={() => setBukaTemplate((v) => !v)}
          className="flex w-full items-center justify-between gap-2 bg-slate-50 px-3 py-2.5 text-left"
        >
          <span className="flex items-center gap-2 text-[12px] font-black text-text-main">
            <FileText className="h-3.5 w-3.5 text-primary" />
            Template pesan
            {TAHAP.some((t) => disesuaikan(t.kunci)) && (
              <span className="rounded-full bg-primary-container px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-primary-active">
                disesuaikan
              </span>
            )}
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${bukaTemplate ? 'rotate-180' : ''}`}
          />
        </button>

        {bukaTemplate && (
          <div className="space-y-3 border-t border-slate-100 p-3">
            <div className="flex flex-wrap gap-1.5">
              {TAHAP.map((t) => (
                <button
                  key={t.kunci}
                  type="button"
                  onClick={() => setTahapAktif(t.kunci)}
                  className={`rounded-lg px-2.5 py-1.5 text-[11px] font-black transition-colors ${
                    tahapAktif === t.kunci ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {t.label}
                  {disesuaikan(t.kunci) ? ' •' : ''}
                </button>
              ))}
            </div>

            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">
                Judul (dipakai juga untuk notifikasi aplikasi & push)
              </span>
              <input
                id={`tpl-judul-${tahapAktif}`}
                value={form.template[tahapAktif]?.judul || ''}
                onChange={(e) => ubahTemplate('judul', e.target.value)}
                onFocus={() => {
                  kolomTerakhir.current = 'judul';
                }}
                ref={(el) => {
                  elemen.current[`${tahapAktif}-judul`] = el;
                }}
                maxLength={120}
                disabled={!admin}
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-text-main outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-slate-100"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">
                Isi pesan
              </span>
              <textarea
                id={`tpl-isi-${tahapAktif}`}
                rows={3}
                value={form.template[tahapAktif]?.isi || ''}
                onChange={(e) => ubahTemplate('isi', e.target.value)}
                onFocus={() => {
                  kolomTerakhir.current = 'isi';
                }}
                ref={(el) => {
                  elemen.current[`${tahapAktif}-isi`] = el;
                }}
                maxLength={800}
                disabled={!admin}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium leading-relaxed text-text-main outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-slate-100"
              />
            </label>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Sisipkan</span>
              {(ringkas?.placeholder || []).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => sisipPlaceholder(p)}
                  disabled={!admin}
                  className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[11px] font-bold text-primary-active hover:border-primary/40 disabled:opacity-50"
                >
                  {`{${p}}`}
                </button>
              ))}
            </div>

            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-2.5">
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Pratinjau</div>
              <div className="mt-1 text-[12px] font-black text-text-main">
                {isiContoh(form.template[tahapAktif]?.judul)}
              </div>
              <div className="mt-1 whitespace-pre-wrap text-[12px] font-medium leading-relaxed text-slate-600">
                {isiContoh(form.template[tahapAktif]?.isi)}
              </div>
            </div>

            {admin && (
              <div className="flex justify-end">
                <ActionButton icon={RotateCcw} variant="ghost" onClick={() => kembalikanBawaan(tahapAktif)}>
                  Kembalikan ke bawaan
                </ActionButton>
              </div>
            )}
          </div>
        )}
      </div>

      {admin && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          <ActionButton icon={Send} onClick={() => bukaKonfirmasi('otomatis')}>
            Kirim pengingat hari ini
          </ActionButton>
          {tunggakan.total > 0 && (
            <ActionButton icon={TriangleAlert} variant="ghost" onClick={() => bukaKonfirmasi('semua')}>
              Kirim termasuk {tunggakan.total} tunggakan
            </ActionButton>
          )}
        </div>
      )}

      {konfirmasi && pratinjau && (
        <Modal title="Kirim pengingat sekarang" onClose={() => setKonfirmasi(null)} maxWidth="max-w-lg">
          <div className="space-y-3">
            <p className="text-sm font-semibold leading-relaxed text-slate-600">
              {konfirmasi === 'semua'
                ? `Akan dikirim ke ${pratinjau.total} tagihan, termasuk tunggakan sebelum ${mulai || 'pengingat diaktifkan'}.`
                : `Akan dikirim ke ${pratinjau.total} tagihan yang jatuh tempo dalam ${form.hariSebelum} hari ke depan atau sudah lewat.`}{' '}
              Total nilai {rupiah(pratinjau.total_nilai)}.
              {pratinjau.tanpa_wali > 0 && ` ${pratinjau.tanpa_wali} tagihan tidak punya wali aktif dan akan dilewati.`}
            </p>
            {pratinjau.contoh && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[13px] font-black text-text-main">{pratinjau.contoh.title}</div>
                <div className="mt-1 text-[12px] font-medium leading-relaxed text-slate-600">
                  {pratinjau.contoh.body}
                </div>
              </div>
            )}
            <p className="text-[11px] font-semibold text-slate-500">
              Pesan yang tahapnya sudah pernah terkirim tidak dikirim ulang, jadi menekan tombol ini dua kali tidak
              membuat wali menerima pesan ganda.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <ActionButton icon={Loader2} variant="ghost" onClick={() => setKonfirmasi(null)}>
                Batal
              </ActionButton>
              <ActionButton icon={mengirim ? Loader2 : Send} onClick={kirim} disabled={mengirim}>
                {mengirim ? 'Mengirim' : `Kirim ${pratinjau.total} pesan`}
              </ActionButton>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
