require('dotenv').config();
const logger = require('./logger');

// Error tracking bersifat opsional: tanpa SENTRY_DSN modul ini menjadi no-op dan
// @sentry/node tidak pernah di-require, sehingga tidak ada overhead sama sekali.
const dsn = process.env.SENTRY_DSN;

let Sentry = null;
let enabled = false;

if (dsn) {
  Sentry = require('@sentry/node');
  const environment = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development';
  Sentry.init({
    dsn,
    environment,
    ...(process.env.SENTRY_RELEASE ? { release: process.env.SENTRY_RELEASE } : {}),
    // Sistem ini menyimpan data anak dan wali. Jangan kirim PII secara default;
    // aktifkan sadar-sadar lewat SENTRY_SEND_PII=1 bila benar-benar diperlukan.
    sendDefaultPii: process.env.SENTRY_SEND_PII === '1',
    // Tracing dimatikan secara default agar tidak menambah biaya/kuota tanpa diminta.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
      return event;
    }
  });
  enabled = true;
  logger.info({ environment }, 'error tracking aktif');
} else {
  logger.info('SENTRY_DSN tidak diset — error tracking nonaktif');
}

// Dipasang setelah semua route dan sebelum error handler milik aplikasi.
function attachExpressErrorHandler(app) {
  if (enabled) Sentry.setupExpressErrorHandler(app);
}

function captureException(err, context) {
  if (!enabled) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

module.exports = { enabled, attachExpressErrorHandler, captureException };
