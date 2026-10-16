// Perawatan database terjadwal: potong baris lama, segarkan statistik planner,
// dan opsional rapikan file.
//
// Jalankan:
//   node scripts/maintenance.js                # potong + ANALYZE
//   node scripts/maintenance.js --dry-run      # lihat saja, tidak menghapus
//   MAINTENANCE_VACUUM=1 node scripts/maintenance.js
//
// Dijadwalkan lewat deploy/systemd/siaga-maintenance.timer (bulanan).
// Backup harian (siaga-backup.timer) berjalan lebih dulu, jadi selalu ada
// cadangan sebelum pemotongan dijalankan.
const path = require('path');

// dotenv hanya terpasang di backend/node_modules, jadi diambil dari sana
// (pola yang sama dipakai scripts/backup.js).
const dotenv = require(path.join(__dirname, '..', 'backend', 'node_modules', 'dotenv'));
dotenv.config({ path: path.join(__dirname, '..', 'backend', '.env') });

const db = require('../backend/db');

// Tabel yang tumbuh terus beserta batas retensinya (hari).
//
// penjemputan_log SENGAJA dinonaktifkan secara default: itu data bisnis
// (riwayat penjemputan siswa), bukan log teknis, dan sekolah bisa
// memerlukannya untuk audit. Aktifkan sadar-sadar lewat env bila memang
// tidak dibutuhkan setelah sekian lama.
const DEFAULT_RETENTION = {
  audit_log: 730,
  nfc_scan_log: 180,
  penjemputan_log: 0
};

const ENV_KEY = {
  audit_log: 'RETENTION_AUDIT_LOG_DAYS',
  nfc_scan_log: 'RETENTION_NFC_SCAN_LOG_DAYS',
  penjemputan_log: 'RETENTION_PENJEMPUTAN_LOG_DAYS'
};

function retentionDays(table) {
  const raw = process.env[ENV_KEY[table]];
  if (raw === undefined || raw === '') return DEFAULT_RETENTION[table];
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : DEFAULT_RETENTION[table];
}

function cutoffFor(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

// Menghapus baris lebih tua dari batas. Mengembalikan jumlah baris yang dihapus
// (atau yang akan dihapus pada dry-run).
function prune(table, days, { dryRun }) {
  if (!Number.isInteger(days) || days <= 0) {
    return { table, days, deleted: 0, skipped: true };
  }
  const cutoff = cutoffFor(days);

  if (dryRun) {
    const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE created_at < ?`).get(cutoff);
    return { table, days, deleted: row.c, skipped: false };
  }

  const tx = db.transaction(() => {
    const info = db.prepare(`DELETE FROM ${table} WHERE created_at < ?`).run(cutoff);
    return info.changes;
  });
  return { table, days, deleted: tx(), skipped: false };
}

// Statistik planner jadi basi setelah pemotongan, jadi ANALYZE selalu dijalankan.
function analyze({ dryRun }) {
  if (!dryRun) db.exec('ANALYZE');
  return true;
}

// VACUUM menulis ulang SELURUH file database dan butuh ruang kosong sekitar
// seukuran database. Karena itu opt-in, bukan bawaan.
function vacuum() {
  if (process.env.MAINTENANCE_VACUUM !== '1') return false;
  db.exec('VACUUM');
  return true;
}

function runMaintenance({ dryRun = false } = {}) {
  const results = [];
  for (const table of Object.keys(DEFAULT_RETENTION)) {
    results.push(prune(table, retentionDays(table), { dryRun }));
  }
  analyze({ dryRun });
  const vacuumed = dryRun ? false : vacuum();
  return { results, vacuumed };
}

function formatReport(report, dryRun) {
  const verb = dryRun ? 'akan dihapus' : 'dihapus';
  const lines = [`${dryRun ? '[DRY-RUN] ' : ''}Perawatan database`];
  for (const r of report.results) {
    if (r.skipped) lines.push(`  ${r.table}: dilewati (retensi ${r.days} hari)`);
    else lines.push(`  ${r.table}: ${r.deleted} baris ${verb} (retensi ${r.days} hari)`);
  }
  lines.push(`  ANALYZE: ${dryRun ? 'akan dijalankan' : 'selesai'}`);
  lines.push(`  VACUUM: ${report.vacuumed ? 'selesai' : 'dilewati (set MAINTENANCE_VACUUM=1 untuk mengaktifkan)'}`);
  return lines.join('\n');
}

module.exports = { runMaintenance, retentionDays, DEFAULT_RETENTION, formatReport };

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  try {
    const report = runMaintenance({ dryRun });
    console.log(formatReport(report, dryRun));
    process.exit(0);
  } catch (error) {
    console.error(`[Maintenance] GAGAL: ${error.message}`);
    process.exit(1);
  }
}
