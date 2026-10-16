require('dotenv').config();
// Error tracking harus di-init SEBELUM express di-require, kalau tidak
// instrumentasi otomatis Sentry tidak terpasang dan hanya error yang dilempar
// manual yang tertangkap. Jangan pindahkan baris ini ke bawah.
const errorTracking = require('./utils/error-tracking');
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const pinoHttp = require('pino-http');
const compression = require('compression');
const logger = require('./utils/logger');
const { runMigrations, pendingMigrations } = require('./migrate');
const db = require('./db');

// Terapkan migrasi skema sebelum route dimuat. Bila migrasi gagal, proses
// dihentikan: menjalankan server dengan skema setengah jadi lebih berbahaya
// daripada tidak jalan sama sekali. Set MIGRATE_ON_START=0 untuk melewatinya.
if (process.env.MIGRATE_ON_START !== '0') {
  try {
    runMigrations();
  } catch (error) {
    logger.error({ err: error }, 'migrasi database gagal, server dihentikan');
    process.exit(1);
  }
}

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : process.env.TRUST_PROXY);
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
if (process.env.NODE_ENV === 'production' && allowedOrigins.length) {
  // CORS hanya untuk API. Aset statis tidak perlu CORS: browser mengirim Origin
  // pada modul/CSS ber-atribut crossorigin, dan allowlist sempit membuat request
  // aset gagal 500 saat origin deployment tidak cocok.
  app.use('/api', (req, res, next) => {
    const origin = req.headers.origin;
    if (!origin || allowedOrigins.includes(origin)) return next();
    return res.status(403).json({ error: 'Origin tidak diizinkan' });
  });
} else if (process.env.NODE_ENV !== 'production') {
  app.use('/api', cors({ origin: '*' }));
}
app.use((req, res, next) => {
  // Satu id per request, dipakai untuk header respons sekaligus korelasi log.
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    );
  }
  next();
});
// Kompresi respons. Hanya menguntungkan teks (JSON, CSV); gambar dan PDF
// diabaikan oleh filter default karena sudah terkompresi sendiri.
//
// Stream SSE dikecualikan secara eksplisit: mengompresi stream berarti menunggu
// buffer penuh, dan itu mematikan aliran real-time absensi.
//
// PENTING: gunakan originalUrl, bukan url. Filter ini dievaluasi saat header
// respons ditulis, yang terjadi DI DALAM handler route. Pada titik itu Express
// sudah memangkas url menjadi '/stream' (sisa baseUrl-nya ada di req.baseUrl),
// sehingga pengecekan '/api/absensi/stream' tidak akan pernah cocok dan stream
// ikut terkompresi.
app.use(
  compression({
    filter: (req, res) => {
      if ((req.originalUrl || req.url).startsWith('/api/absensi/stream')) return false;
      return compression.filter(req, res);
    }
  })
);
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => req.id || crypto.randomUUID(),
    // Default pino-http menulis seluruh header req/res. Header respons di sini
    // memuat CSP panjang (~500 byte) sehingga log membengkak tanpa manfaat.
    // Simpan hanya field yang berguna untuk investigasi.
    serializers: {
      req: (req) => ({
        id: req.id,
        method: req.method,
        url: req.url,
        remoteAddress: req.remoteAddress
      }),
      res: (res) => ({ statusCode: res.statusCode })
    },
    // Health check dan stream SSE tidak perlu memenuhi log akses.
    autoLogging: {
      ignore: (req) => req.url.startsWith('/api/health') || req.url.startsWith('/api/absensi/stream')
    },
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    }
  })
);
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

// Liveness di atas hanya membuktikan prosesnya hidup. Endpoint ini memeriksa
// dependensi nyata (database bisa dibaca, migrasi sudah diterapkan) sehingga
// cocok dipakai sebagai health check deployment / load balancer.
app.get('/api/health/ready', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const checks = { database: 'ok', migrations: 'ok' };
  let ready = true;

  try {
    db.prepare('SELECT 1').get();
  } catch (error) {
    checks.database = 'error';
    ready = false;
    logger.error({ err: error }, 'readiness: database tidak dapat dibaca');
  }

  try {
    const pending = pendingMigrations();
    if (pending.length) {
      checks.migrations = 'pending';
      checks.pending = pending;
      ready = false;
    }
  } catch (error) {
    checks.migrations = 'error';
    ready = false;
    logger.error({ err: error }, 'readiness: status migrasi tidak dapat dibaca');
  }

  res
    .status(ready ? 200 : 503)
    .json({ status: ready ? 'ready' : 'unavailable', checks, time: new Date().toISOString() });
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

// 404 JSON untuk endpoint API yang tidak dikenal. Tanpa ini Express mengirim
// halaman HTML default, yang membingungkan klien API.
app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan' }));

if (process.env.NODE_ENV === 'production') {
  const dist = path.join(__dirname, '../frontend/dist');
  app.use(express.static(dist));
  // SPA fallback. Express 5 (path-to-regexp v8) tidak lagi menerima '*' sebagai
  // pola route, jadi dipakai middleware biasa. Hanya GET/HEAD non-API yang
  // dilayani index.html; /api/* dan /uploads/* yang tidak dikenal tetap 404.
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

// Sentry menangkap error lebih dulu (bila aktif), lalu meneruskannya ke handler
// di bawah ini yang menyusun respons untuk klien.
errorTracking.attachExpressErrorHandler(app);

app.use((err, req, res, _next) => {
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
  logger.error({ err, requestId: req.id }, 'unhandled request error');
  res.status(500).json({ error: 'Internal server error' });
});

const port = process.env.PORT || 3001;
const server = app.listen(port, '0.0.0.0', () => {
  logger.info(`SIAGA Backend listening on http://localhost:${port} [${process.env.NODE_ENV || 'development'}]`);
});
server.requestTimeout = 30_000;
server.headersTimeout = 35_000;
server.keepAliveTimeout = 5_000;

function shutdown(signal) {
  logger.info({ signal }, 'menutup server');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
