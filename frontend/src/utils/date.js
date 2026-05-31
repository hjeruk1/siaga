const WIB_TZ = 'Asia/Jakarta';

export function todayWIB(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: WIB_TZ }).format(date);
}

export function nowWIB(date = new Date()) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: WIB_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = type => (parts.find(part => part.type === type) || {}).value || '';
  return { h: parseInt(get('hour'), 10), m: parseInt(get('minute'), 10) };
}
