const BASE = process.env.UAT_BASE || 'http://localhost:3001';
const ADMIN_PASSWORD = process.env.UAT_ADMIN_PASSWORD || process.env.TEST_ADMIN_PASSWORD || 'admin123';
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const uatDate = process.env.UAT_DATE || '2026-05-18';
const period = uatDate.slice(0, 7);
const tahunAjaran = '2025/2026';
const results = [];

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` :: ${detail}` : ''}`);
}

async function req(method, path, body, token, expected = 200) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  const ok = Array.isArray(expected) ? expected.includes(res.status) : res.status === expected;
  if (!ok) {
    const err = new Error(`${method} ${path} -> ${res.status} ${data.error || res.statusText}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return { status: res.status, body: data };
}

async function check(name, fn) {
  try {
    const detail = await fn();
    record(name, true, typeof detail === 'string' ? detail : '');
    return detail;
  } catch (e) {
    record(name, false, e.message || String(e));
    return null;
  }
}

async function loginStaff(username, password) {
  const r = await req('POST', '/api/auth/login', { tipe: 'staff', username, password });
  return r.body.token;
}

async function loginWali(noWa, password) {
  const r = await req('POST', '/api/auth/login', { tipe: 'wali', no_wa: noWa, password });
  return r.body.token;
}

function pick(rows, fn, label) {
  const row = rows.find(fn);
  if (!row) throw new Error(`Missing ${label}`);
  return row;
}

async function main() {
  console.log(`UAT target ${BASE}`);
  console.log(`UAT suffix ${suffix}`);

  const admin = await check('Admin login', async () => loginStaff('admin', ADMIN_PASSWORD));
  if (!admin) throw new Error('Admin login failed; cannot continue UAT');

  const ctx = {};
  await check('Admin reads master data', async () => {
    ctx.cabang = (await req('GET', '/api/master/cabang', undefined, admin)).body;
    ctx.jenjang = (await req('GET', '/api/master/jenjang', undefined, admin)).body;
    ctx.gdn = pick(ctx.cabang, c => c.kode === 'GDN', 'Godean');
    ctx.otherCabang = ctx.cabang.find(c => c.id !== ctx.gdn.id) || ctx.gdn;
    ctx.kb = pick(ctx.jenjang, j => j.nama === 'KB A', 'KB A');
    ctx.tk = pick(ctx.jenjang, j => j.nama === 'TK A', 'TK A');
    ctx.rombel = (await req('GET', `/api/master/rombel?cabang_id=${ctx.gdn.id}`, undefined, admin)).body;
    ctx.rkb = pick(ctx.rombel, r => r.jenjang_id === ctx.kb.id, 'GDN KB A rombel');
    return `${ctx.cabang.length} cabang, ${ctx.jenjang.length} jenjang`;
  });

  await check('Admin manages calendar exception', async () => {
    const created = await req('POST', '/api/master/kalender', { scope: 'cabang', cabang_id: ctx.gdn.id, tanggal: uatDate, tipe: 'masuk', nama: `UAT Masuk ${suffix}` }, admin);
    await req('PUT', `/api/master/kalender/${created.body.id}`, { tanggal: uatDate, tipe: 'masuk', nama: `UAT Masuk Updated ${suffix}` }, admin);
    const rows = (await req('GET', `/api/master/kalender?cabang_id=${ctx.gdn.id}&tahun=2026`, undefined, admin)).body;
    if (!rows.some(r => r.id === created.body.id)) throw new Error('Kalender event not visible');
    return `event ${created.body.id}`;
  });

  await check('Admin creates role accounts', async () => {
    ctx.adminCabangUser = await req('POST', '/api/pengguna/staff', { display_name: `UAT Admin Cabang ${suffix}`, username: `uat.ac.${suffix}`, role: 'admin_cabang', cabang_id: ctx.gdn.id }, admin);
    ctx.kepsekUser = await req('POST', '/api/pengguna/staff', { display_name: `UAT Kepsek ${suffix}`, username: `uat.ks.${suffix}`, role: 'kepsek', cabang_id: ctx.gdn.id }, admin);
    ctx.guruUser = await req('POST', '/api/pengguna/staff', { display_name: `UAT Guru ${suffix}`, username: `uat.gr.${suffix}`, role: 'guru', cabang_id: ctx.gdn.id }, admin);
    ctx.gerbangUser = await req('POST', '/api/pengguna/staff', { display_name: `UAT Gerbang ${suffix}`, username: `uat.gb.${suffix}`, role: 'gerbang', cabang_id: ctx.gdn.id }, admin);
    await req('POST', `/api/master/rombel/${ctx.rkb.id}/guru`, { pengguna_id: ctx.guruUser.body.id, role: 'utama' }, admin);
    ctx.adminCabang = await loginStaff(`uat.ac.${suffix}`, ctx.adminCabangUser.body.temporary_password);
    ctx.kepsek = await loginStaff(`uat.ks.${suffix}`, ctx.kepsekUser.body.temporary_password);
    ctx.guru = await loginStaff(`uat.gr.${suffix}`, ctx.guruUser.body.temporary_password);
    ctx.gerbang = await loginStaff(`uat.gb.${suffix}`, ctx.gerbangUser.body.temporary_password);
    return 'admin_cabang, kepsek, guru, gerbang';
  });

  await check('Admin creates siswa, NFC, penjemput, wali', async () => {
    const base = { cabang_id: ctx.gdn.id, jenjang_id: ctx.kb.id, rombel_id: ctx.rkb.id, paket: 'reguler', tanggal_mulai: '2026-01-01' };
    ctx.siswaA = await req('POST', '/api/siswa', { ...base, nama: `UAT Anak A ${suffix}`, nis: `UATA${suffix}` }, admin);
    ctx.siswaB = await req('POST', '/api/siswa', { ...base, nama: `UAT Anak B ${suffix}`, nis: `UATB${suffix}` }, admin);
    ctx.siswaC = await req('POST', '/api/siswa', { ...base, nama: `UAT Anak C ${suffix}`, nis: `UATC${suffix}` }, admin);
    ctx.nfcA = (await req('POST', `/api/siswa/${ctx.siswaA.body.id}/nfc/reissue`, {}, admin)).body.nfc_token;
    ctx.nfcC = (await req('POST', `/api/siswa/${ctx.siswaC.body.id}/nfc/reissue`, {}, admin)).body.nfc_token;
    ctx.pickupA = (await req('POST', `/api/siswa/${ctx.siswaA.body.id}/penjemput`, { nama: `Ayah UAT ${suffix}`, no_wa: `6281${suffix.slice(0, 8)}`, relasi: 'Ayah' }, admin)).body;
    ctx.pickupC = (await req('POST', `/api/siswa/${ctx.siswaC.body.id}/penjemput`, { nama: `Ibu UAT ${suffix}`, no_wa: `6282${suffix.slice(0, 8)}`, relasi: 'Ibu' }, admin)).body;
    const wali = await req('POST', '/api/pengguna/wali', { display_name: `UAT Wali ${suffix}`, no_wa: `628${Date.now().toString().slice(-10)}`, siswa_id: ctx.siswaA.body.id, relasi: 'Orangtua' }, admin);
    ctx.waliNo = `628${Date.now().toString().slice(-10)}`;
    if (!wali.body.temporary_password) throw new Error('Wali temp password missing');
    ctx.waliUser = wali.body;
    return `siswa ${ctx.siswaA.body.id}/${ctx.siswaB.body.id}/${ctx.siswaC.body.id}`;
  });

  await check('Admin resets wali and wali login works', async () => {
    const detail = (await req('GET', `/api/siswa/${ctx.siswaA.body.id}`, undefined, admin)).body;
    const waliId = detail.wali.id;
    const reset = await req('POST', `/api/pengguna/${waliId}/reset-password`, {}, admin);
    ctx.wali = await loginWali(detail.wali.no_wa, reset.body.temporary_password);
    await req('POST', '/api/auth/change-password', { new_password: `wali${suffix}123` }, ctx.wali);
    ctx.wali = await loginWali(detail.wali.no_wa, `wali${suffix}123`);
    return `wali ${waliId}`;
  });

  await check('Admin cabang permission boundaries', async () => {
    await req('GET', '/api/pengguna', undefined, ctx.adminCabang);
    await req('POST', '/api/pengguna/staff', { display_name: `Blocked Admin ${suffix}`, username: `blocked.${suffix}`, role: 'admin', cabang_id: ctx.gdn.id }, ctx.adminCabang, 403);
    const siswa = await req('POST', '/api/siswa', { nama: `UAT AC Siswa ${suffix}`, nis: `UATAC${suffix}`, cabang_id: ctx.otherCabang.id, jenjang_id: ctx.kb.id, rombel_id: ctx.rkb.id, paket: 'reguler', tanggal_mulai: '2026-01-01' }, ctx.adminCabang);
    const detail = await req('GET', `/api/siswa/${siswa.body.id}`, undefined, ctx.adminCabang);
    if (Number(detail.body.enrollment.cabang_id) !== Number(ctx.gdn.id)) throw new Error('admin_cabang created outside own cabang');
    await req('POST', '/api/billing/tarif', { cabang_id: ctx.gdn.id, tahun_ajaran: tahunAjaran, jenjang_id: ctx.kb.id, jenis: 'spp', nama: `blocked ${suffix}`, nominal: 1 }, ctx.adminCabang, 403);
    return 'own cabang enforced';
  });

  await check('Kepsek read-only boundaries', async () => {
    await req('GET', `/api/absensi/today?cabang_id=${ctx.gdn.id}&tanggal=${uatDate}`, undefined, ctx.kepsek);
    await req('GET', `/api/daily-record/today?cabang_id=${ctx.gdn.id}&tanggal=${uatDate}`, undefined, ctx.kepsek);
    await req('GET', `/api/billing/laporan?cabang_id=${ctx.gdn.id}`, undefined, ctx.kepsek);
    await req('GET', '/api/master/audit-log?limit=5', undefined, ctx.kepsek);
    await req('POST', '/api/absensi/checkin', { siswa_id: ctx.siswaA.body.id, tanggal: uatDate }, ctx.kepsek, 403);
    await req('POST', '/api/pengguna/staff', { display_name: `Blocked ${suffix}`, username: `blocked.ks.${suffix}`, role: 'guru', cabang_id: ctx.gdn.id }, ctx.kepsek, 403);
    return 'read-only ok';
  });

  await check('Guru daily record workflow', async () => {
    const today = await req('GET', `/api/daily-record/today?tanggal=${uatDate}`, undefined, ctx.guru);
    if (!today.body.rows.some(r => r.siswa_id === ctx.siswaA.body.id)) throw new Error('assigned siswa missing from guru daily today');
    const focusTheme = await req('POST', '/api/modul-ajar/focus-theme', {
      cabang_id: ctx.gdn.id,
      rombel_id: ctx.rkb.id,
      tanggal: uatDate,
      title: 'Tema Belajar Asik',
      activity_summary: 'Bermain puzzle dan mewarnai',
      suggested_domains: ['kognitif', 'motorik_halus']
    }, ctx.guru);
    const daily = await req('POST', '/api/daily-record', {
      siswa_id: ctx.siswaA.body.id,
      tanggal: uatDate,
      mood: 'ceria',
      makan: 'habis',
      tidur: 1,
      aktivitas: ['Membaca'],
      catatan: `UAT daily ${suffix}`,
      focus_theme_id: focusTheme.body.id,
      observation_domain: 'Kognitif',
      observation_note: 'Anak mampu menyusun puzzle 12 keping secara mandiri.'
    }, ctx.guru);
    ctx.dailyId = daily.body.id;
    await req('POST', `/api/daily-record/${ctx.dailyId}/publish`, {}, ctx.guru);
    await req('POST', '/api/daily-record', {
      siswa_id: ctx.siswaA.body.id,
      tanggal: uatDate,
      mood: 'biasa',
      makan: 'setengah',
      tidur: 0,
      aktivitas: ['Membaca', 'Bermain'],
      catatan: `UAT daily updated ${suffix}`,
      focus_theme_id: focusTheme.body.id,
      observation_domain: 'Kognitif',
      observation_note: 'Anak mampu menyusun puzzle 12 keping secara mandiri.'
    }, ctx.guru);
    const edits = await req('GET', `/api/daily-record/${ctx.dailyId}/edits`, undefined, admin);
    if (!edits.body.length) throw new Error('daily edit log missing');
    return `daily ${ctx.dailyId}`;
  });

  await check('Wali portal workflow', async () => {
    const own = await req('GET', '/api/siswa?status=semua', undefined, ctx.wali);
    if (!own.body.some(s => s.id === ctx.siswaA.body.id)) throw new Error('wali cannot see linked child');
    if (own.body.some(s => s.id === ctx.siswaB.body.id)) throw new Error('wali can see unrelated child');
    const history = await req('GET', `/api/daily-record/history/${ctx.siswaA.body.id}`, undefined, ctx.wali);
    if (!history.body.some(h => h.id === ctx.dailyId)) throw new Error('published daily missing from wali history');
    await req('GET', `/api/daily-record/${ctx.dailyId}`, undefined, ctx.wali);
    await req('POST', `/api/daily-record/${ctx.dailyId}/comment`, { body: `Terima kasih ${suffix}` }, ctx.wali);
    await req('POST', `/api/daily-record/${ctx.dailyId}/comment`, { body: `Balasan guru ${suffix}` }, ctx.guru);
    return 'history/read/comment ok';
  });

  await check('Absensi state machine and NFC check-in', async () => {
    await req('POST', '/api/absensi/checkin', { siswa_id: ctx.siswaA.body.id, tanggal: uatDate }, ctx.guru);
    await req('POST', '/api/absensi/keterangan', { siswa_id: ctx.siswaA.body.id, tanggal: uatDate, status: 'Izin' }, ctx.guru, 400);
    await req('POST', '/api/absensi/keterangan', { siswa_id: ctx.siswaB.body.id, tanggal: uatDate, status: 'Izin', catatan: 'UAT izin' }, ctx.guru);
    await req('POST', '/api/absensi/checkin', { siswa_id: ctx.siswaB.body.id, tanggal: uatDate }, ctx.guru, 400);
    await req('POST', '/api/absensi/nfc-scan', { token: ctx.nfcC, tanggal: uatDate, action: 'checkin', tab: 'masuk' }, ctx.guru);
    await req('POST', '/api/absensi/nfc-scan', { token: 'BAD-TOKEN', tanggal: uatDate, action: 'checkin' }, ctx.guru, 400);
    return 'guards ok';
  });

  await check('Gerbang QR pickup and duplicate handling', async () => {
    await req('POST', '/api/absensi/early-release', { siswa_id: ctx.siswaA.body.id, tanggal: uatDate, alasan: 'UAT early release' }, admin);
    const scan = await req('POST', '/api/penjemputan/scan', { qr_code: ctx.pickupA.qr_code, tanggal: uatDate }, ctx.gerbang);
    if (scan.body.siswa.id !== ctx.siswaA.body.id) throw new Error('QR scan returned wrong siswa');
    const dup = await req('POST', '/api/penjemputan/scan', { qr_code: ctx.pickupA.qr_code, tanggal: uatDate }, ctx.gerbang, 400);
    if (dup.body.code !== 'ALREADY_WAITING') throw new Error(`duplicate code mismatch: ${dup.body.code}`);
    await req('POST', '/api/absensi/nfc-scan', { token: ctx.nfcA, tanggal: uatDate, action: 'pulang', tab: 'pulang' }, ctx.guru);
    const left = await req('POST', '/api/penjemputan/scan', { qr_code: ctx.pickupA.qr_code, tanggal: uatDate }, ctx.gerbang, 400);
    if (left.body.code !== 'ALREADY_LEFT') throw new Error(`left code mismatch: ${left.body.code}`);
    return 'waiting/left states ok';
  });

  await check('Guru manual pulang batch after gerbang scan', async () => {
    await req('POST', '/api/absensi/early-release', { siswa_id: ctx.siswaC.body.id, tanggal: uatDate, alasan: 'UAT batch pulang' }, admin);
    await req('POST', '/api/penjemputan/scan', { qr_code: ctx.pickupC.qr_code, tanggal: uatDate }, ctx.gerbang);
    await req('POST', '/api/penjemputan/pulang', { siswa_ids: [ctx.siswaC.body.id], tanggal: uatDate }, ctx.guru);
    const rows = await req('GET', `/api/absensi/today?tanggal=${uatDate}&cabang_id=${ctx.gdn.id}`, undefined, admin);
    const c = rows.body.rows.find(r => r.siswa_id === ctx.siswaC.body.id);
    if (c?.status !== 'Pulang') throw new Error(`expected Pulang, got ${c?.status}`);
    return 'manual pulang ok';
  });

  await check('Gerbang can finalize pulang directly', async () => {
    const siswaD = await req('POST', '/api/siswa', { nama: `UAT Anak D ${suffix}`, nis: `UATD${suffix}`, cabang_id: ctx.gdn.id, jenjang_id: ctx.kb.id, rombel_id: ctx.rkb.id, paket: 'reguler', tanggal_mulai: '2026-01-01' }, admin);
    const pickupD = (await req('POST', `/api/siswa/${siswaD.body.id}/penjemput`, { nama: `Kakak UAT ${suffix}`, relasi: 'Kakak' }, admin)).body;
    await req('POST', '/api/absensi/checkin', { siswa_id: siswaD.body.id, tanggal: uatDate }, ctx.guru);
    await req('POST', '/api/absensi/early-release', { siswa_id: siswaD.body.id, tanggal: uatDate, alasan: 'UAT auth boundary' }, admin);
    await req('POST', '/api/penjemputan/scan', { qr_code: pickupD.qr_code, tanggal: uatDate }, ctx.gerbang);
    await req('POST', '/api/penjemputan/pulang', { siswa_ids: [siswaD.body.id], tanggal: uatDate }, ctx.gerbang);
    return 'gerbang handoff ok';
  });

  await check('Billing non-payment workflow', async () => {
    await req('POST', '/api/billing/tarif', { cabang_id: ctx.gdn.id, tahun_ajaran: tahunAjaran, jenjang_id: ctx.kb.id, jenis: 'spp', nama: `UAT SPP ${suffix}`, nominal: 100000 }, admin);
    await req('POST', '/api/billing/tarif', { cabang_id: ctx.gdn.id, tahun_ajaran: tahunAjaran, jenjang_id: ctx.kb.id, jenis: 'kegiatan', nama: `UAT Kegiatan ${suffix}`, nominal: 250000 }, admin);
    await req('POST', '/api/billing/diskon', { cabang_id: ctx.gdn.id, siswa_id: ctx.siswaA.body.id, tahun_ajaran: tahunAjaran, jenis: 'spp', tipe: 'nominal', nilai: 10000, catatan: `UAT ${suffix}` }, admin);
    await req('POST', '/api/billing/generate-bulanan/preview', { cabang_id: ctx.gdn.id, periode: period }, admin);
    await req('POST', '/api/billing/generate-bulanan', { cabang_id: ctx.gdn.id, periode: period }, admin);
    await req('POST', '/api/billing/generate-kegiatan/preview', { cabang_id: ctx.gdn.id, tahun_ajaran: tahunAjaran }, admin);
    await req('POST', '/api/billing/generate-kegiatan', { cabang_id: ctx.gdn.id, tahun_ajaran: tahunAjaran }, admin);
    const bills = await req('GET', `/api/billing/tagihan?cabang_id=${ctx.gdn.id}&siswa_id=${ctx.siswaA.body.id}`, undefined, admin);
    if (!bills.body.length) throw new Error('tagihan not generated');
    await req('PUT', `/api/billing/tagihan/${bills.body[0].id}/koreksi`, { nominal_final: Math.max(0, Number(bills.body[0].nominal_final || 0) - 1000), reason: `UAT koreksi ${suffix}` }, admin);
    await req('POST', '/api/billing/invoice', { tagihan_ids: [bills.body[0].id] }, admin);
    await req('GET', `/api/billing/laporan?cabang_id=${ctx.gdn.id}`, undefined, ctx.kepsek);
    return `${bills.body.length} tagihan`;
  });

  const failed = results.filter(r => !r.ok);
  console.log('\nUAT SUMMARY');
  console.log(JSON.stringify({ total: results.length, passed: results.length - failed.length, failed: failed.length, failedItems: failed }, null, 2));
  if (failed.length) process.exit(1);
}

main().catch(e => {
  console.error(e.stack || e.message || e);
  process.exit(1);
});
