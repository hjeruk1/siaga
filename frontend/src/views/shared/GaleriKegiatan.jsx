import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { ActionButton, Modal } from '../../components/Shared';
import { Archive, Camera, ChevronLeft, ChevronRight, ImagePlus, Loader2, Trash2 } from 'lucide-react';

// Galeri foto kegiatan — dipakai wali (melihat) dan guru/admin (mengunggah).
//
// Foto dikelompokkan per (tanggal + judul + rombel) menjadi "album". Server
// mengirim daftar datar; pengelompokan dilakukan di sini supaya API tetap
// sederhana dan satu album tetap bisa dipecah per hari tanpa perubahan skema.
//
// Grid memakai thumb_url (480px), bukan berkas penuh: satu album bisa 30 foto,
// dan mengunduh 30 gambar 1280px di jaringan seluler membuat halaman wali
// terasa berat.

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function tanggalPanjang(iso) {
  const [y, m, d] = String(iso || '')
    .split('-')
    .map(Number);
  if (!y || !m || !d) return iso || '';
  return `${d} ${BULAN[m - 1]} ${y}`;
}

function hariIni() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta' }).format(new Date());
}

export default function GaleriKegiatan({ toast, bisaUnggah = false }) {
  const [rows, setRows] = useState([]);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState('');
  const [lihat, setLihat] = useState(null); // { album, index }
  const [hapusTarget, setHapusTarget] = useState(null);
  const [menghapus, setMenghapus] = useState(false);

  const [unggahOpen, setUnggahOpen] = useState(false);
  const [rombel, setRombel] = useState([]);
  const [form, setForm] = useState({ rombel_id: '', tanggal: hariIni(), judul: '', keterangan: '' });
  const [berkas, setBerkas] = useState([]);
  const [mengunggah, setMengunggah] = useState(false);

  const muat = useCallback(async () => {
    setMemuat(true);
    setGalat('');
    try {
      setRows(await api.kegiatanList({ limit: 120 }));
    } catch (e) {
      setGalat(e.message);
    } finally {
      setMemuat(false);
    }
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  const album = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const key = `${r.tanggal}|${r.judul}|${r.rombel_id}`;
      if (!map.has(key))
        map.set(key, {
          key,
          tanggal: r.tanggal,
          judul: r.judul,
          keterangan: r.keterangan,
          rombel_nama: r.rombel_nama,
          cabang_nama: r.cabang_nama,
          foto: []
        });
      map.get(key).foto.push(r);
    }
    return [...map.values()];
  }, [rows]);

  async function bukaUnggah() {
    setUnggahOpen(true);
    if (rombel.length) return;
    try {
      const r = await api.kegiatanRombel();
      setRombel(r);
      if (r.length === 1) setForm((f) => ({ ...f, rombel_id: String(r[0].id) }));
    } catch (e) {
      toast?.('err', e.message);
    }
  }

  async function kirimUnggahan(e) {
    e.preventDefault();
    if (!form.rombel_id) return toast?.('err', 'Pilih rombel dulu');
    if (form.judul.trim().length < 3) return toast?.('err', 'Judul minimal 3 karakter');
    if (!berkas.length) return toast?.('err', 'Pilih minimal satu foto');
    setMengunggah(true);
    try {
      const h = await api.kegiatanUnggah({ ...form, foto: berkas });
      toast?.('ok', `${h.dibuat.length} foto diunggah${h.gagal?.length ? `, ${h.gagal.length} gagal` : ''}`);
      setUnggahOpen(false);
      setBerkas([]);
      setForm((f) => ({ ...f, judul: '', keterangan: '' }));
      await muat();
    } catch (e2) {
      toast?.('err', e2.message);
    } finally {
      setMengunggah(false);
    }
  }

  async function hapus() {
    if (!hapusTarget) return;
    setMenghapus(true);
    try {
      await api.kegiatanHapus(hapusTarget.id);
      toast?.('ok', 'Foto dihapus');
      setHapusTarget(null);
      setLihat(null);
      await muat();
    } catch (e) {
      toast?.('err', e.message);
    } finally {
      setMenghapus(false);
    }
  }

  function geser(arah) {
    setLihat((v) => {
      if (!v) return v;
      const total = v.album.foto.length;
      return { ...v, index: (v.index + arah + total) % total };
    });
  }

  if (memuat) {
    return (
      <div className="space-y-3">
        <div className="h-28 animate-pulse rounded-2xl bg-slate-200/70" />
        <div className="h-28 animate-pulse rounded-2xl bg-slate-200/70" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-black text-text-main">
            <Camera className="h-4 w-4 text-primary" />
            Galeri kegiatan
          </h2>
          <p className="text-[11px] font-semibold text-slate-500">
            {bisaUnggah
              ? 'Foto yang Anda unggah langsung terlihat oleh wali di kelas tersebut.'
              : 'Foto kegiatan kelas anak Anda, diunggah oleh guru.'}
          </p>
        </div>
        {bisaUnggah && (
          <ActionButton icon={ImagePlus} onClick={bukaUnggah}>
            Unggah foto
          </ActionButton>
        )}
      </div>

      {galat && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-bold text-rose-700">
          {galat}
        </div>
      )}

      {album.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
          <Camera className="mx-auto h-6 w-6 text-slate-300" />
          <p className="mt-2 text-[13px] font-bold text-slate-500">Belum ada foto kegiatan</p>
          <p className="text-[11px] font-semibold text-slate-400">
            {bisaUnggah ? 'Mulai dengan tombol "Unggah foto".' : 'Foto akan muncul di sini setelah guru mengunggah.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {album.map((a) => (
            <section key={a.key} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-[13px] font-black text-text-main">{a.judul}</h3>
                  <p className="text-[11px] font-semibold text-slate-500">
                    {tanggalPanjang(a.tanggal)} · {a.rombel_nama} · {a.foto.length} foto
                  </p>
                </div>
                {a.keterangan && (
                  <p className="min-w-0 max-w-full truncate text-[11px] font-medium text-slate-500">{a.keterangan}</p>
                )}
              </div>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
                {a.foto.map((f, i) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setLihat({ album: a, index: i })}
                    className="group relative aspect-square overflow-hidden rounded-lg bg-slate-100"
                  >
                    <img
                      src={f.thumb_url}
                      alt={`${a.judul} ${i + 1}`}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                    />
                    {/* Foto yang sudah melewati batas retensi hanya menyisakan
                        thumbnail. Penandanya kecil tetapi penting: wali yang
                        membuka foto lama tidak mengira fotonya rusak. */}
                    {f.diarsipkan && (
                      <span
                        className="absolute bottom-1 right-1 inline-flex items-center gap-0.5 rounded bg-slate-900/70 px-1 py-0.5 text-[9px] font-black uppercase tracking-wide text-white"
                        title="Versi resolusi penuh sudah diarsipkan"
                      >
                        <Archive className="h-2.5 w-2.5" />
                        Arsip
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {lihat && (
        <Modal
          title={`${lihat.album.judul} · ${lihat.index + 1}/${lihat.album.foto.length}`}
          onClose={() => setLihat(null)}
          maxWidth="max-w-3xl"
        >
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-xl bg-slate-900">
              <img
                src={lihat.album.foto[lihat.index].url}
                alt={lihat.album.judul}
                className="mx-auto max-h-[65vh] w-auto object-contain"
              />
              {lihat.album.foto.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => geser(-1)}
                    aria-label="Foto sebelumnya"
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-2 text-slate-700 shadow hover:bg-white"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => geser(1)}
                    aria-label="Foto berikutnya"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-2 text-slate-700 shadow hover:bg-white"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-semibold text-slate-500">
                {tanggalPanjang(lihat.album.tanggal)} · {lihat.album.rombel_nama}
                {lihat.album.keterangan ? ` · ${lihat.album.keterangan}` : ''}
              </p>
              {lihat.album.foto[lihat.index].diarsipkan && (
                <p className="flex items-center gap-1 text-[11px] font-bold text-amber-700">
                  <Archive className="h-3 w-3" />
                  Versi resolusi penuh sudah diarsipkan — yang tersisa versi kecil.
                </p>
              )}
              {lihat.album.foto[lihat.index].boleh_hapus && (
                <ActionButton
                  icon={Trash2}
                  variant="danger"
                  onClick={() => setHapusTarget(lihat.album.foto[lihat.index])}
                >
                  Hapus foto
                </ActionButton>
              )}
            </div>
          </div>
        </Modal>
      )}

      {hapusTarget && (
        <Modal title="Hapus foto ini?" onClose={() => setHapusTarget(null)} maxWidth="max-w-md">
          <p className="text-sm font-semibold leading-relaxed text-slate-600">
            Foto akan hilang dari galeri wali dan berkasnya dihapus dari server. Tindakan ini tidak bisa dibatalkan.
          </p>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <ActionButton variant="ghost" onClick={() => setHapusTarget(null)}>
              Batal
            </ActionButton>
            <ActionButton icon={menghapus ? Loader2 : Trash2} variant="danger" onClick={hapus} disabled={menghapus}>
              {menghapus ? 'Menghapus' : 'Hapus'}
            </ActionButton>
          </div>
        </Modal>
      )}

      {unggahOpen && (
        <Modal title="Unggah foto kegiatan" onClose={() => setUnggahOpen(false)} maxWidth="max-w-lg">
          <form onSubmit={kirimUnggahan} className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">Rombel</span>
              <select
                id="galeri-rombel"
                value={form.rombel_id}
                onChange={(e) => setForm((f) => ({ ...f, rombel_id: e.target.value }))}
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold text-text-main outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="">Pilih rombel</option>
                {rombel.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nama} — {r.cabang_nama}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Tanggal kegiatan
                </span>
                <input
                  id="galeri-tanggal"
                  type="date"
                  max={hariIni()}
                  value={form.tanggal}
                  onChange={(e) => setForm((f) => ({ ...f, tanggal: e.target.value }))}
                  className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold text-text-main outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Judul album
                </span>
                <input
                  id="galeri-judul"
                  value={form.judul}
                  onChange={(e) => setForm((f) => ({ ...f, judul: e.target.value }))}
                  maxLength={80}
                  placeholder="Contoh: Menari bersama"
                  className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold text-text-main outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">
                Keterangan (opsional)
              </span>
              <textarea
                value={form.keterangan}
                onChange={(e) => setForm((f) => ({ ...f, keterangan: e.target.value }))}
                maxLength={300}
                rows={2}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-text-main outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-400">
                Foto (maks 10 sekaligus, 5 MB per foto)
              </span>
              <input
                id="galeri-berkas"
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setBerkas([...e.target.files].slice(0, 10))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-[12px] file:font-black file:text-white"
              />
            </label>
            {berkas.length > 0 && (
              <p className="text-[11px] font-bold text-emerald-700">{berkas.length} foto siap diunggah</p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <ActionButton variant="ghost" onClick={() => setUnggahOpen(false)}>
                Batal
              </ActionButton>
              <ActionButton icon={mengunggah ? Loader2 : ImagePlus} type="submit" disabled={mengunggah}>
                {mengunggah ? 'Mengunggah' : 'Unggah'}
              </ActionButton>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
