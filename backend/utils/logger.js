require('dotenv').config();
const pino = require('pino');

const isTest = process.env.NODE_ENV === 'test';
const isProd = process.env.NODE_ENV === 'production';

// Test harus senyap supaya output suite tetap terbaca.
const level = process.env.LOG_LEVEL || (isTest ? 'silent' : 'info');

// Pretty print hanya untuk pengembangan lokal; production tetap JSON agar bisa
// dikonsumsi agregator log. Transport tidak dipakai saat test agar tidak ada
// worker thread yang menghambat proses keluar.
let transport;
if (!isProd && !isTest && process.env.LOG_PRETTY !== '0') {
  try {
    require.resolve('pino-pretty');
    transport = {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname,service' }
    };
  } catch {
    // pino-pretty tidak terpasang (mis. instalasi production) -> pakai JSON biasa.
  }
}

const logger = pino({
  level,
  base: { service: 'siaga-backend' },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Kredensial tidak boleh pernah masuk log.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'password',
      '*.password',
      'password_hash',
      '*.password_hash'
    ],
    remove: true
  },
  ...(transport ? { transport } : {})
});

module.exports = logger;
