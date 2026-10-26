const WIB_TZ = 'Asia/Jakarta';

export function todayWIB(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: WIB_TZ }).format(date);
}

export function nowWIB(date = new Date()) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: WIB_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);
  const get = (type) => (parts.find((part) => part.type === type) || {}).value || '';
  return { h: parseInt(get('hour'), 10), m: parseInt(get('minute'), 10) };
}

// Menit sejak jam tunggu dicatat ('HH:MM'). Dipakai gerbang dan kepsek untuk
// menandai penjemput yang menunggu terlalu lama. Mengembalikan null bila jam
// belum ada — pemanggil yang memutuskan artinya, bukan fungsi ini.
export function meniTunggu(jam) {
  if (!jam) return null;
  const [h, m] = String(jam).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const now = nowWIB();
  return Math.max(0, now.h * 60 + now.m - h * 60 - m);
}
