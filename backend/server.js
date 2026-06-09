require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : process.env.TRUST_PROXY);
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
if (process.env.NODE_ENV === 'production' && allowedOrigins.length) {
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Origin tidak diizinkan'));
    }
  }));
} else if (process.env.NODE_ENV !== 'production') {
  app.use(cors({ origin: '*' }));
}
app.use((_req, res, next) => {
  res.setHeader('X-Request-Id', _req.headers['x-request-id'] || crypto.randomUUID());
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  }
  next();
});
app.use(express.json({ limit: '2mb' }));

const requestBuckets = new Map();
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_MAX = Number(process.env.RATE_LIMIT_MAX) || 1000;
app.use('/api', (req, res, next) => {
  if (req.path === '/health' || req.path === '/absensi/stream') return next();
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  let bucket = requestBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) bucket = { count: 0, resetAt: now + RATE_WINDOW_MS };
  bucket.count += 1;
  requestBuckets.set(key, bucket);
  res.setHeader('RateLimit-Limit', RATE_MAX);
  res.setHeader('RateLimit-Remaining', Math.max(0, RATE_MAX - bucket.count));
  res.setHeader('RateLimit-Reset', Math.ceil(bucket.resetAt / 1000));
  if (bucket.count > RATE_MAX) {
    res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
    return res.status(429).json({ error: 'Terlalu banyak request. Coba lagi beberapa menit.' });
  }
  next();
});
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of requestBuckets) if (bucket.resetAt <= now) requestBuckets.delete(key);
}, RATE_WINDOW_MS).unref();

app.use('/uploads', require('./routes/media'));

app.get('/api/health', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ status: 'ok', time: new Date().toISOString() });
});

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
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Ukuran file melebihi batas yang diizinkan' });
  }
  if (err?.name === 'MulterError') {
    return res.status(400).json({ error: 'Upload tidak valid' });
  }
  if (err?.code === 'Input buffer contains unsupported image format') {
    return res.status(400).json({ error: 'Format gambar tidak didukung' });
  }
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'JSON tidak valid' });
  }
  console.error(err.stack || err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = process.env.PORT || 3001;
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`\nSIAGA Backend -> http://localhost:${port} [${process.env.NODE_ENV || 'development'}]\n`);
});
server.requestTimeout = 30_000;
server.headersTimeout = 35_000;
server.keepAliveTimeout = 5_000;

function shutdown(signal) {
  console.log(`${signal} diterima, menutup server...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
