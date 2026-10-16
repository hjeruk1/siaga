// Modal riwayat laporan harian siswa. Dipisah dari GuruView.jsx.
import { useEffect, useState } from 'react';
import { api } from '../../api';

export function HistoryModal({ siswa, onClose }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const MOOD = { ceria: '😊', biasa: '😐', rewel: '😢' };
  const MAKAN = { habis: 'Habis', setengah: 'Setengah', tidak: 'Tidak' };
  useEffect(() => {
    api.dailyHistory(siswa.siswa_id, 60).then((d) => {
      setRows(d);
      setLoading(false);
    });
  }, [siswa.siswa_id]);
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={onClose}>
      <div className="bg-white rounded-t-3xl w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <div className="font-black text-text-main">Riwayat Laporan</div>
            <div className="text-xs text-slate-400">
              {siswa.nama} · {siswa.rombel_nama}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 text-xl">
            ✕
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-4 border-primary-container border-t-primary rounded-full animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-10 text-slate-400">Belum ada laporan tersimpan.</div>
          ) : (
            <div className="space-y-3">
              {rows.map((l, i) => (
                <div key={i} className="bg-slate-50 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-bold text-slate-700">{l.tanggal}</div>
                    <div className="text-xs text-slate-400">{l.updated_at?.slice(0, 16).replace('T', ' ')}</div>
                  </div>
                  <div className="flex gap-3 flex-wrap text-sm">
                    {l.mood && (
                      <span className="px-2 py-1 bg-white rounded-lg border border-slate-200">
                        {MOOD[l.mood]} {l.mood}
                      </span>
                    )}
                    {l.makan && (
                      <span className="px-2 py-1 bg-white rounded-lg border border-slate-200">{MAKAN[l.makan]}</span>
                    )}
                    {l.tidur === 1 && (
                      <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-lg border border-blue-200">
                        💤 Tidur
                      </span>
                    )}
                    {l.tidur === 0 && (
                      <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg border border-slate-200">
                        🙅 Tdk tidur
                      </span>
                    )}
                  </div>
                  {l.aktivitas?.length > 0 && (
                    <div className="text-xs text-slate-500 mt-2">
                      {Array.isArray(l.aktivitas) ? l.aktivitas.join(' · ') : l.aktivitas}
                    </div>
                  )}
                  {l.catatan && <div className="text-xs text-slate-600 mt-2 italic">"{l.catatan}"</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
