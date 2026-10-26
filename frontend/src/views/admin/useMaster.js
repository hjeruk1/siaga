// Pemuat master data (cabang, jenjang, rombel) + cabang terpilih.
//
// Dulu hook ini tinggal di dalam `AdminShared.jsx` (berkas komponen) dan
// disalin apa adanya di `KegiatanMingguanTab.jsx`. Dua salinan berarti dua
// perilaku yang bisa menyimpang — misalnya satu versi memilih cabang GDN
// sebagai bawaan dan versi lain tidak. Sekarang hanya ada satu.
//
// `load` dibungkus useCallback supaya bisa menjadi dependensi effect tanpa
// memicu pemuatan ulang setiap render (identitasnya hanya berubah ketika
// cabang terpilih benar-benar berubah).
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';

export function useMaster(user, { autoDefaultCabang = false } = {}) {
  const [cabang, setCabang] = useState([]);
  const [jenjang, setJenjang] = useState([]);
  const [rombel, setRombel] = useState([]);
  const [cabangId, setCabangId] = useState(user.role === 'admin' ? '' : user.cabang_id);

  const load = useCallback(async () => {
    const [c, j] = await Promise.all([api.cabang(), api.jenjang()]);
    setCabang(c);
    setJenjang(j);
    const preferred = c.find((x) => x.kode === 'GDN' && x.aktif) || c.find((x) => x.aktif) || c[0];
    const cid = cabangId || (autoDefaultCabang ? preferred?.id : '');
    if (user.role === 'admin' && !cabangId && cid) setCabangId(cid);
    setRombel(await api.rombel(cid));
  }, [cabangId, autoDefaultCabang, user.role]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  return { cabang, jenjang, rombel, cabangId, setCabangId, load };
}
