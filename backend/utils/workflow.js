const db = require('../db');

const WIB_TZ = 'Asia/Jakarta';

function nowUtc() {
  return new Date().toISOString();
}

function todayWIB(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: WIB_TZ }).format(date);
}

function nowTimeWIB() {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: WIB_TZ, hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date());
  const get = type => (parts.find(p => p.type === type) || {}).value || '';
  return `${get('hour')}:${get('minute')}`;
}

function schoolYearForDate(tanggal = todayWIB()) {
  const [year, month] = tanggal.split('-').map(Number);
  const start = month >= 7 ? year : year - 1;
  return `${start}/${start + 1}`;
}

function monthKey(tanggal = todayWIB()) {
  return tanggal.slice(0, 7);
}

function canAccessCabang(user, cabangId) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return Number(user.cabang_id) === Number(cabangId);
}

function requireCabang(req, res, cabangId) {
  if (!canAccessCabang(req.user, cabangId)) {
    res.status(403).json({ error: 'Akses cabang ditolak' });
    return false;
  }
  return true;
}

function requireActiveCabang(req, res, cabangId) {
  if (!requireCabang(req, res, cabangId)) return false;
  const cabang = db.prepare('SELECT aktif FROM cabang WHERE id=?').get(cabangId);
  if (!cabang) {
    res.status(404).json({ error: 'Cabang tidak ditemukan' });
    return false;
  }
  if (!cabang.aktif) {
    res.status(400).json({ error: 'Cabang nonaktif tidak bisa menerima transaksi baru' });
    return false;
  }
  return true;
}

function activeEnrollment(siswaId, tanggal = todayWIB()) {
  return db.prepare(`
    SELECT e.*,c.nama AS cabang_nama,c.kode AS cabang_kode,j.nama AS jenjang_nama,j.tipe AS jenjang_tipe,r.nama AS rombel_nama
    FROM siswa_enrollment e
    JOIN cabang c ON c.id=e.cabang_id
    JOIN jenjang j ON j.id=e.jenjang_id
    JOIN rombel r ON r.id=e.rombel_id
    WHERE e.siswa_id=? AND e.tanggal_mulai<=? AND (e.tanggal_selesai IS NULL OR e.tanggal_selesai>=?)
    ORDER BY e.tanggal_mulai DESC,e.id DESC LIMIT 1
  `).get(siswaId, tanggal, tanggal);
}

function latestActiveEnrollment(siswaId) {
  return db.prepare(`
    SELECT e.*,c.nama AS cabang_nama,c.kode AS cabang_kode,j.nama AS jenjang_nama,j.tipe AS jenjang_tipe,r.nama AS rombel_nama
    FROM siswa_enrollment e
    JOIN cabang c ON c.id=e.cabang_id
    JOIN jenjang j ON j.id=e.jenjang_id
    JOIN rombel r ON r.id=e.rombel_id
    WHERE e.siswa_id=? AND e.status='aktif'
    ORDER BY e.tanggal_mulai DESC,e.id DESC LIMIT 1
  `).get(siswaId);
}

function canAccessSiswa(user, siswaId, options = {}) {
  const siswa = db.prepare('SELECT * FROM siswa WHERE id=?').get(siswaId);
  if (!siswa) return null;
  const enrollment = activeEnrollment(siswaId, options.tanggal || todayWIB()) || (!options.tanggal ? latestActiveEnrollment(siswaId) : null);
  if (!enrollment) return null;
  if (user.role === 'admin') return { siswa, enrollment };
  if (['admin_cabang', 'kepsek', 'gerbang'].includes(user.role)) {
    return Number(user.cabang_id) === Number(enrollment.cabang_id) ? { siswa, enrollment } : false;
  }
  if (user.role === 'guru') {
    const assigned = db.prepare('SELECT 1 FROM guru_rombel WHERE pengguna_id=? AND rombel_id=?').get(user.id, enrollment.rombel_id);
    return assigned ? { siswa, enrollment } : false;
  }
  if (user.role === 'wali') {
    const linked = db.prepare('SELECT 1 FROM wali_siswa WHERE wali_pengguna_id=? AND siswa_id=? AND aktif=1').get(user.id, siswaId);
    return linked ? { siswa, enrollment } : false;
  }
  return false;
}

function canWaliAccessSiswa(user, siswaId) {
  if (user?.role !== 'wali') return false;
  return !!db.prepare('SELECT 1 FROM wali_siswa WHERE wali_pengguna_id=? AND siswa_id=? AND aktif=1').get(user.id, siswaId);
}

function siswaScopeSql(user, alias = 's', requestedCabangId) {
  if (user.role === 'admin') {
    if (requestedCabangId) {
      return {
        join: `JOIN siswa_enrollment se_scope ON se_scope.siswa_id=${alias}.id AND se_scope.status='aktif'`,
        where: 'se_scope.cabang_id=?',
        params: [requestedCabangId]
      };
    }
    return {
      join: `LEFT JOIN siswa_enrollment se_scope ON se_scope.siswa_id=${alias}.id AND se_scope.status='aktif'`,
      where: '1=1',
      params: []
    };
  }
  if (['admin_cabang', 'kepsek', 'gerbang'].includes(user.role)) {
    return {
      join: `JOIN siswa_enrollment se_scope ON se_scope.siswa_id=${alias}.id AND se_scope.status='aktif'`,
      where: 'se_scope.cabang_id=?',
      params: [user.cabang_id]
    };
  }
  if (user.role === 'guru') {
    return {
      join: `JOIN siswa_enrollment se_scope ON se_scope.siswa_id=${alias}.id AND se_scope.status='aktif' JOIN guru_rombel gr_scope ON gr_scope.rombel_id=se_scope.rombel_id`,
      where: 'gr_scope.pengguna_id=?',
      params: [user.id]
    };
  }
  return {
    join: `JOIN wali_siswa ws_scope ON ws_scope.siswa_id=${alias}.id AND ws_scope.aktif=1 JOIN siswa_enrollment se_scope ON se_scope.siswa_id=${alias}.id AND se_scope.status='aktif'`,
    where: 'ws_scope.wali_pengguna_id=?',
    params: [user.id]
  };
}

function audit(actor, action, entityType, entityId, data = {}) {
  db.prepare(`INSERT INTO audit_log(actor_pengguna_id,action,entity_type,entity_id,cabang_id,before_json,after_json,reason,created_at)
    VALUES(?,?,?,?,?,?,?,?,?)`)
    .run(
      actor?.id || null,
      action,
      entityType,
      entityId || null,
      data.cabang_id || null,
      data.before ? JSON.stringify(data.before) : null,
      data.after ? JSON.stringify(data.after) : null,
      data.reason || null,
      nowUtc()
    );
}

function notify(recipientId, tipe, title, body, entityType, entityId, cabangId) {
  db.prepare(`INSERT INTO notifikasi(recipient_pengguna_id,tipe,title,body,entity_type,entity_id,cabang_id,created_at)
    VALUES(?,?,?,?,?,?,?,?)`)
    .run(recipientId, tipe, title, body || null, entityType || null, entityId || null, cabangId || null, nowUtc());
}

function nextSequence(key) {
  const row = db.prepare('SELECT value FROM sequence_counter WHERE key=?').get(key);
  if (!row) {
    db.prepare('INSERT INTO sequence_counter(key,value) VALUES(?,1)').run(key);
    return 1;
  }
  db.prepare('UPDATE sequence_counter SET value=value+1 WHERE key=?').run(key);
  return row.value + 1;
}

function isSchoolDay(tanggal, cabangId) {
  const cabangEvent = db.prepare("SELECT * FROM kalender_event WHERE scope='cabang' AND cabang_id=? AND tanggal=?").get(cabangId, tanggal);
  if (cabangEvent) return cabangEvent.tipe === 'masuk';
  const yayasanEvent = db.prepare("SELECT * FROM kalender_event WHERE scope='yayasan' AND tanggal=?").get(tanggal);
  if (yayasanEvent) return yayasanEvent.tipe === 'masuk';
  const day = new Date(tanggal + 'T00:00:00').getDay();
  return day !== 0 && day !== 6;
}

function isDayClosed(tanggal, cabangId) {
  return !!db.prepare('SELECT 1 FROM tutup_hari WHERE cabang_id=? AND tanggal=?').get(cabangId, tanggal);
}

module.exports = {
  WIB_TZ,
  nowUtc,
  todayWIB,
  nowTimeWIB,
  schoolYearForDate,
  monthKey,
  canAccessCabang,
  requireCabang,
  requireActiveCabang,
  activeEnrollment,
  latestActiveEnrollment,
  canAccessSiswa,
  canWaliAccessSiswa,
  siswaScopeSql,
  audit,
  notify,
  nextSequence,
  isSchoolDay,
  isDayClosed
};
