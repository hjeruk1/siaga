require('dotenv').config();
const db     = require('./db');
const bcrypt = require('bcryptjs');

console.log('\n========================================');
console.log(' SIAGA — Inisialisasi Database Produksi');
console.log('========================================\n');

// Reset semua tabel
['notif_log','absensi','penjemput','siswa','kelas','guru'].forEach(t => db.exec('DELETE FROM ' + t));
db.exec("DELETE FROM sqlite_sequence WHERE name IN ('guru','kelas','siswa','penjemput','absensi','notif_log')");

// ── Akun admin default ────────────────────────────────────
// PENTING: Ganti password ini lewat panel Admin setelah login!
const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
db.prepare('INSERT INTO guru (nama,no_wa,username,password_hash,role) VALUES (?,?,?,?,?)')
  .run('Administrator', '', 'admin', require('bcryptjs').hashSync(adminPassword, 10), 'admin');

console.log('Akun admin dibuat:');
console.log('  Username : admin');
console.log('  Password : ' + adminPassword);
console.log('  SEGERA GANTI PASSWORD setelah login pertama!\n');

// ── 4 Kelas kosong ────────────────────────────────────────
['KB A', 'KB B', 'TK A', 'TK B'].forEach(nama => {
  db.prepare('INSERT INTO kelas (nama) VALUES (?)').run(nama);
});

console.log('Kelas dibuat: KB A, KB B, TK A, TK B');
console.log('');
console.log('Langkah selanjutnya di panel Admin:');
console.log('  1. Login dengan admin / ' + adminPassword);
console.log('  2. Tab "Guru & Akun" → tambah akun guru, kepsek, gerbang');
console.log('  3. Tab "Assign Kelas" → assign guru ke masing-masing kelas');
console.log('  4. Tab "Siswa" → input data siswa beserta penjemputnya');
console.log('  5. Siap digunakan!');
console.log('');
