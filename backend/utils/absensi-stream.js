// Registry klien SSE absensi.
//
// Dipisah dari routes/absensi.js karena sekarang ada DUA sumber perubahan
// status absensi: petugas di lapangan (check-in, keterangan manual) dan
// persetujuan izin online dari portal wali. Keduanya harus menyegarkan layar
// guru/gerbang yang sedang terbuka; kalau registry-nya tetap lokal di satu
// route, jalur kedua tidak bisa memberi tahu apa pun.
const klien = new Set();

function tambahKlien(client) {
  klien.add(client);
}

function hapusKlien(client) {
  klien.delete(client);
}

function broadcastAbsensi(cabangId) {
  const payload = JSON.stringify({ type: 'absensi_changed' });
  for (const client of klien) {
    if (Number(client.cabangId) === Number(cabangId)) {
      try {
        client.res.write(`data: ${payload}\n\n`);
      } catch {
        // Koneksi sudah mati: buang supaya tidak dicoba lagi.
        klien.delete(client);
      }
    }
  }
}

module.exports = { tambahKlien, hapusKlien, broadcastAbsensi };
