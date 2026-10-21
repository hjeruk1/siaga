// Kartu pengumuman di portal wali.
//
// Hanya pengumuman TERBARU yang belum ditutup yang ditampilkan. Alasannya:
// pengumuman lama tidak boleh menutupi layar setiap kali orang tua membuka
// aplikasi — kalau begitu, kartu ini akan diabaikan seperti spanduk iklan.
// Riwayat lengkap tetap bisa dibaca lewat lonceng notifikasi.
import { useEffect, useState } from 'react';
import { Megaphone, X } from 'lucide-react';
import { Modal } from '../../components/Shared';
import { api } from '../../api';
import { tanggalPendek } from './portalHelpers.js';

const KUNCI_TUTUP = 'siaga_pengumuman_ditutup';

function sudahDitutup(id) {
  try {
    const daftar = JSON.parse(localStorage.getItem(KUNCI_TUTUP) || '[]');
    return Array.isArray(daftar) && daftar.includes(id);
  } catch {
    return false;
  }
}

function tandaiDitutup(id) {
  try {
    const daftar = JSON.parse(localStorage.getItem(KUNCI_TUTUP) || '[]');
    const baru = Array.isArray(daftar) ? [...daftar.slice(-30), id] : [id];
    localStorage.setItem(KUNCI_TUTUP, JSON.stringify(baru));
  } catch {
    /* storage diblokir: kartu akan muncul lagi, tidak fatal */
  }
}

export default function Pengumuman() {
  const [daftar, setDaftar] = useState([]);
  const [buka, setBuka] = useState(false);
  // Ditutup di sesi ini; localStorage hanya untuk mengingat antar-kunjungan.
  const [ditutup, setDitutup] = useState([]);

  useEffect(() => {
    api
      .pengumumanWali(10)
      .then((d) => setDaftar(d?.rows || []))
      .catch(() => {});
  }, []);

  const teratas = daftar.find((p) => !sudahDitutup(p.id) && !ditutup.includes(p.id));
  function tutup(id) {
    tandaiDitutup(id);
    setDitutup((d) => [...d, id]);
    setBuka(false);
  }
  if (!teratas) return null;

  return (
    <>
      <div
        className={`relative overflow-hidden rounded-2xl border p-3.5 ${
          teratas.penting ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'
        }`}
      >
        <div className="flex items-start gap-2.5">
          <span
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
              teratas.penting ? 'bg-amber-100 text-amber-700' : 'bg-primary-container text-primary'
            }`}
          >
            <Megaphone className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Pengumuman</span>
              {!!teratas.penting && (
                <span className="rounded-full bg-amber-200/70 px-1.5 py-0.5 text-[9px] font-black uppercase text-amber-800">
                  Penting
                </span>
              )}
              <span className="text-[10px] font-bold text-slate-400">{tanggalPendek(teratas.created_at)}</span>
            </div>
            <button
              type="button"
              onClick={() => setBuka(true)}
              className="mt-0.5 block w-full text-left text-[13px] font-black leading-snug text-text-main"
            >
              {teratas.judul}
            </button>
            <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-slate-600">{teratas.isi}</p>
            <button
              type="button"
              onClick={() => setBuka(true)}
              className="mt-1 text-[11px] font-black text-primary hover:underline"
            >
              Baca selengkapnya
            </button>
          </div>
          <button
            type="button"
            aria-label="Tutup pengumuman"
            onClick={() => tutup(teratas.id)}
            className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-white/70 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {buka && (
        <Modal title={teratas.judul} onClose={() => setBuka(false)}>
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
              {teratas.cabang_nama || 'Sekolah'} · {tanggalPendek(teratas.created_at)}
            </p>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{teratas.isi}</p>
            <button
              type="button"
              onClick={() => tutup(teratas.id)}
              className="mt-1 h-10 w-full rounded-xl bg-primary text-sm font-black text-white"
            >
              Mengerti
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
