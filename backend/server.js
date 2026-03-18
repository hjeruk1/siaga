require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const app     = express();

app.use(cors({ origin: process.env.NODE_ENV === 'production' ? (process.env.FRONTEND_URL || '*') : '*' }));
app.use(express.json());

app.use('/api/auth',        require('./routes/auth'));
app.use('/api/guru',        require('./routes/guru'));
app.use('/api/kelas',       require('./routes/kelas'));
app.use('/api/siswa',       require('./routes/siswa'));
app.use('/api/absensi',     require('./routes/absensi'));
app.use('/api/penjemputan', require('./routes/penjemputan'));
app.use('/api/notifikasi',  require('./routes/notifikasi'));
app.use('/api/rekap',       require('./routes/rekap'));

// Serve frontend build di production
if (process.env.NODE_ENV === 'production') {
  const DIST = path.join(__dirname, '../frontend/dist');
  app.use(express.static(DIST));
  app.get('*', (req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

app.use((err, req, res, _n) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Auto-init database jika belum ada data ────────────────
function autoInit() {
  const db     = require('./db');
  const bcrypt = require('bcryptjs');

  const adminAda = db.prepare("SELECT COUNT(*) as c FROM guru").get().c;
  if (adminAda > 0) {
    console.log('Database sudah ada data, skip init.');
    return;
  }

  console.log('Database kosong — menjalankan inisialisasi pertama...');

  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  db.prepare('INSERT INTO guru (nama,no_wa,username,password_hash,role) VALUES (?,?,?,?,?)')
    .run('Administrator', '', 'admin', bcrypt.hashSync(adminPassword, 10), 'admin');

  ['KB A', 'KB B', 'TK A', 'TK B'].forEach(nama => {
    db.prepare('INSERT INTO kelas (nama) VALUES (?)').run(nama);
  });

  console.log('Init selesai!');
  console.log('  Login  : admin / ' + adminPassword);
  console.log('  Segera ganti password setelah login pertama!');
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log('\nSIAGA Backend -> http://localhost:' + PORT + ' [' + (process.env.NODE_ENV || 'development') + ']');
  autoInit();
});
