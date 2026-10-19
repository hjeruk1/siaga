// Penyimpanan token PIN (step-up auth) di sisi browser.
//
// Sengaja di sessionStorage, BUKAN localStorage: token ini bukti "orang tua
// baru saja memasukkan PIN". Kalau ditempatkan di localStorage, ia hidup
// selama password tersimpan dan orang yang meminjam HP bisa memakainya
// berhari-hari. sessionStorage hilang saat tab ditutup — dan token sendiri
// hanya berlaku 10 menit di server, jadi keduanya searah.

const KUNCI = 'siaga_pin_token';

export function simpanPinToken(token, detik) {
  try {
    sessionStorage.setItem(KUNCI, JSON.stringify({ token, exp: Date.now() + detik * 1000 }));
  } catch {
    // mode privat dengan storage penuh: lebih baik tidak menyimpan daripada gagal total
  }
}

export function pinToken() {
  try {
    const raw = sessionStorage.getItem(KUNCI);
    if (!raw) return null;
    const { token, exp } = JSON.parse(raw);
    if (!token || !exp || Date.now() > exp) {
      sessionStorage.removeItem(KUNCI);
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export function hapusPinToken() {
  try {
    sessionStorage.removeItem(KUNCI);
  } catch {
    /* diabaikan */
  }
}

// Pesan galat dari server yang menandakan PIN dibutuhkan.
export function perluPin(error) {
  return error && (error.code === 'PIN_REQUIRED' || error.status === 403);
}
