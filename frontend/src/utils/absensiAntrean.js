// Antrean absensi di perangkat (localStorage).
//
// Kenapa localStorage, bukan IndexedDB: isinya beberapa puluh baris kecil
// (siswa_id, tanggal, jam), ditulis dan dibaca sinkron, dan tidak perlu
// transaksi. IndexedDB baru sepadan kalau menyimpan foto.
//
// Tiga aturan yang membuat antrean ini tidak berbahaya:
//
//   1. Dikunci per pengguna. Guru bergantian memakai satu tablet tidak boleh
//      mewarisi antrean guru sebelumnya.
//   2. Setiap item punya id (uuid) yang dikirim sebagai client_id, jadi
//      pengiriman ulang tidak mencatat absensi dua kali (lihat
//      backend/utils/idempotensi.js).
//   3. Kegagalan 4xx = permanen (hari libur, hari ditutup, akses ditolak):
//      item dibuang dan dilaporkan. Kegagalan jaringan = berhenti dan coba
//      lagi nanti. Tanpa pemisahan ini, antrean bisa menggantung selamanya
//      atau — lebih buruk — hilang tanpa kabar.
import { api } from '../api';

const AWALAN = 'siaga_absensi_antrean_';
const pendengar = new Set();
let sedangSinkron = false;

function kunci(userId) {
  return `${AWALAN}${userId}`;
}

function emit() {
  for (const fn of pendengar) {
    try {
      fn();
    } catch {
      /* pendengar rusak tidak boleh memutus yang lain */
    }
  }
}

export function subscribe(fn) {
  pendengar.add(fn);
  return () => pendengar.delete(fn);
}

export function baca(userId) {
  if (!userId) return [];
  try {
    const isi = JSON.parse(localStorage.getItem(kunci(userId)) || '[]');
    return Array.isArray(isi) ? isi : [];
  } catch {
    return [];
  }
}

function tulis(userId, daftar) {
  try {
    if (!daftar.length) localStorage.removeItem(kunci(userId));
    else localStorage.setItem(kunci(userId), JSON.stringify(daftar));
  } catch {
    // Kuota penuh / mode privat: antrean gagal disimpan. Pemanggil harus tahu,
    // jadi kegagalan dilempar — bukan ditelan.
    throw new Error('Tidak bisa menyimpan antrean di perangkat ini');
  }
  emit();
}

export function tambah(userId, aksi, payload, label) {
  const item = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    aksi,
    payload,
    label: label || '',
    dibuat: new Date().toISOString()
  };
  tulis(userId, [...baca(userId), item]);
  return item;
}

export function hapus(userId, id) {
  tulis(
    userId,
    baca(userId).filter((x) => x.id !== id)
  );
}

export function jumlah(userId) {
  return baca(userId).length;
}

// Kirim semua item berurutan. Berurutan, bukan paralel: absensi satu kelas
// harus tercatat dalam urutan guru menekannya, dan server memakai jam yang
// dikirim untuk menentukan terlambat.
export async function sinkron(userId) {
  if (sedangSinkron || !userId) return null;
  sedangSinkron = true;
  const hasil = { terkirim: 0, gagal: [] };
  try {
    for (const item of baca(userId)) {
      try {
        if (item.aksi === 'checkin') await api.checkin({ ...item.payload, client_id: item.id });
        else if (item.aksi === 'keterangan') await api.setKeterangan({ ...item.payload, client_id: item.id });
        hapus(userId, item.id);
        hasil.terkirim += 1;
      } catch (e) {
        if (e?.status >= 400 && e?.status < 500) {
          hapus(userId, item.id);
          hasil.gagal.push({ label: item.label, pesan: e.message });
        } else {
          // Jaringan putus lagi di tengah jalan: sisanya tetap menunggu.
          break;
        }
      }
    }
  } finally {
    sedangSinkron = false;
    emit();
  }
  return hasil;
}
