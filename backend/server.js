require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors({ origin: process.env.NODE_ENV === 'production' ? (process.env.FRONTEND_URL || '*') : '*' }));
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: '1d', etag: true }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/master', require('./routes/master'));
app.use('/api/modul-ajar', require('./routes/modul-ajar'));
app.use('/api/pengguna', require('./routes/pengguna'));
app.use('/api/siswa', require('./routes/siswa'));
app.use('/api/absensi', require('./routes/absensi'));
app.use('/api/penjemputan', require('./routes/penjemputan'));
app.use('/api/daily-record', require('./routes/daily-record'));
app.use('/api/notifikasi', require('./routes/notifikasi'));
app.use('/api/billing', require('./routes/billing'));
app.use('/api/rekap', require('./routes/rekap'));

if (process.env.NODE_ENV === 'production') {
  const dist = path.join(__dirname, '../frontend/dist');
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'JSON tidak valid' });
  }
  console.error(err.stack || err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = process.env.PORT || 3001;
app.listen(port, '0.0.0.0', () => {
  console.log(`\nSIAGA Backend -> http://localhost:${port} [${process.env.NODE_ENV || 'development'}]\n`);
});
