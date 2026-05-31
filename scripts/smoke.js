const base = process.env.SMOKE_BASE || 'http://localhost:3998';
let step = 'start';

async function req(method, path, body, token, expectPdf = false) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(base + path, {
      method,
      signal: controller.signal,
      headers: {
        ...(body && !expectPdf ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let data = {};
      try { data = await res.json(); } catch {}
      throw new Error(`${method} ${path} -> ${res.status} ${data.error || res.statusText}`);
    }
    if (expectPdf) {
      const type = res.headers.get('content-type') || '';
      const buf = Buffer.from(await res.arrayBuffer());
      if (!type.includes('application/pdf') || buf.length < 1000) throw new Error(`PDF invalid for ${path}`);
      return { bytes: buf.length };
    }
    return res.json().catch(() => ({}));
  } finally {
    clearTimeout(timeout);
  }
}

async function uploadPhoto(path, token) {
  const form = new FormData();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#f59e0b"/></svg>`;
  form.append('foto', new Blob([svg], { type: 'image/svg+xml' }), 'smoke.svg');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(base + path, {
      method: 'POST',
      signal: controller.signal,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    if (!res.ok) {
      let data = {};
      try { data = await res.json(); } catch {}
      throw new Error(`POST ${path} -> ${res.status} ${data.error || res.statusText}`);
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

function pick(rows, fn, label) {
  const row = rows.find(fn);
  if (!row) throw new Error(`Missing ${label}`);
  return row;
}

async function main() {
  console.log(`Smoke target ${base}`);
  step = 'login admin';
  const login = await req('POST', '/api/auth/login', { tipe: 'staff', username: 'admin', password: 'admin123' });
  const admin = login.token;

  step = 'master data';
  const cabang = await req('GET', '/api/master/cabang', null, admin);
  const jenjang = await req('GET', '/api/master/jenjang', null, admin);
  const gdn = pick(cabang, c => c.kode === 'GDN', 'Godean');
  const ktg = pick(cabang, c => c.kode === 'KTG', 'Kentungan');
  if (cabang[0].kode !== 'GDN') throw new Error('Godean should be the default first active branch');
  const kb = pick(jenjang, j => j.nama === 'KB A', 'KB A');
  const tk = pick(jenjang, j => j.nama === 'TK A', 'TK A');
  const rombelGdn = await req('GET', `/api/master/rombel?cabang_id=${gdn.id}`, null, admin);
  const rkb = pick(rombelGdn, r => r.jenjang_id === kb.id, 'rombel KB A Godean');

  step = 'staff and rombel assignment';
  const guru = await req('POST', '/api/pengguna/staff', { display_name: 'Guru Smoke', username: 'guru.smoke', role: 'guru', cabang_id: gdn.id }, admin);
  await req('POST', `/api/master/rombel/${rkb.id}/guru`, { pengguna_id: guru.id, role: 'utama' }, admin);

  step = 'siswa profile operations';
  const siswa = await req('POST', '/api/siswa', { nama: 'Anak Smoke', nis: 'SMK001', cabang_id: gdn.id, jenjang_id: kb.id, rombel_id: rkb.id, paket: 'full_day', tanggal_mulai: '2026-07-10' }, admin);
  await req('GET', `/api/siswa/${siswa.id}`, null, admin);
  await req('PUT', `/api/siswa/${siswa.id}`, { nama: 'Anak Smoke Edit', nis: 'SMK001', status: 'aktif', status_kartu: 'aktif' }, admin);
  await req('POST', `/api/siswa/${siswa.id}/nfc/reissue`, {}, admin);
  await req('POST', `/api/siswa/${siswa.id}/penjemput`, { nama: 'Ayah Smoke', no_wa: '62811111111', relasi: 'Ayah' }, admin);

  step = 'wali account operations';
  const wali = await req('POST', '/api/pengguna/wali', { display_name: 'Wali Smoke', no_wa: '62822222222', siswa_id: siswa.id, relasi: 'Orangtua' }, admin);
  const waliReset = await req('POST', `/api/pengguna/${wali.id}/reset-password`, {}, admin);
  await req('PUT', `/api/pengguna/wali/${wali.id}`, { display_name: 'Wali Smoke', status: 'aktif' }, admin);
  const sibling = await req('POST', '/api/siswa', { nama: 'Adik Smoke', nis: 'SMK002', cabang_id: gdn.id, jenjang_id: kb.id, rombel_id: rkb.id, paket: 'reguler', tanggal_mulai: '2026-07-10' }, admin);
  const linked = await req('POST', '/api/pengguna/wali', { display_name: 'Wali Smoke', no_wa: '62822222222', siswa_id: sibling.id, relasi: 'Orangtua' }, admin);
  if (!linked.linked_existing || linked.id !== wali.id) throw new Error('Existing wali account was not linked to sibling');

  step = 'billing setup';
  for (const jenis of ['spp', 'full_day', 'kegiatan']) {
    await req('POST', '/api/billing/tarif', { cabang_id: gdn.id, tahun_ajaran: '2026/2027', jenjang_id: kb.id, jenis, nama: jenis.toUpperCase(), nominal: 100000 }, admin);
  }
  await req('POST', '/api/billing/diskon', { cabang_id: gdn.id, siswa_id: siswa.id, tahun_ajaran: '2026/2027', jenis: 'spp', tipe: 'nominal', nilai: 10000, catatan: 'Smoke' }, admin);
  await req('POST', '/api/billing/generate-bulanan', { cabang_id: gdn.id, periode: '2026-07' }, admin);
  await req('POST', '/api/billing/generate-kegiatan', { cabang_id: gdn.id, tahun_ajaran: '2026/2027' }, admin);
  const bills = await req('GET', `/api/billing/tagihan?cabang_id=${gdn.id}&siswa_id=${siswa.id}`, null, admin);
  if (bills.length < 2) throw new Error('Expected monthly and yearly bills');
  const firstBill = bills[0];
  await req('PUT', `/api/billing/tagihan/${firstBill.id}/koreksi`, { nominal_final: 80000, reason: 'Smoke koreksi' }, admin);
  const payment = await req('POST', '/api/billing/pembayaran', { cabang_id: gdn.id, siswa_id: siswa.id, nominal: 50000, metode: 'tunai', tanggal_bayar: '2026-07-15' }, admin);
  const invoice = await req('POST', '/api/billing/invoice', { tagihan_ids: [firstBill.id] }, admin);
  await req('GET', `/api/billing/invoice/${invoice.id}/pdf`, null, admin, true);
  await req('GET', `/api/billing/pembayaran/${payment.id}/pdf`, null, admin, true);

  step = 'daily record and wali feedback';
  const focusTheme = await req('POST', '/api/modul-ajar/focus-theme', {
    cabang_id: gdn.id,
    rombel_id: rkb.id,
    tanggal: '2026-07-15',
    title: 'Tema Belajar Asik',
    activity_summary: 'Bermain puzzle dan mewarnai',
    suggested_domains: ['kognitif', 'motorik_halus']
  }, admin);
  const daily = await req('POST', '/api/daily-record', {
    siswa_id: siswa.id,
    tanggal: '2026-07-15',
    mood: 'ceria',
    makan: 'habis',
    tidur: 1,
    aktivitas: ['Bermain', 'Membaca'],
    catatan: 'Smoke daily',
    focus_theme_id: focusTheme.id,
    observation_domain: 'Kognitif',
    observation_note: 'Anak mampu menyusun puzzle 12 keping secara mandiri.'
  }, admin);
  const photo = await uploadPhoto(`/api/daily-record/${daily.id}/attachments`, admin);
  await req('POST', `/api/daily-record/${daily.id}/publish`, {}, admin);
  let waliLogin = await req('POST', '/api/auth/login', { tipe: 'wali', no_wa: '62822222222', password: waliReset.temporary_password });
  await req('POST', '/api/auth/change-password', { new_password: 'waliSmoke123' }, waliLogin.token);
  waliLogin = await req('POST', '/api/auth/login', { tipe: 'wali', no_wa: '62822222222', password: 'waliSmoke123' });
  await req('GET', `/api/daily-record/${daily.id}`, null, waliLogin.token);
  await req('POST', `/api/daily-record/${daily.id}/comment`, { body: 'Terima kasih bu guru' }, waliLogin.token);

  step = 'daily record attachment delete';
  await req('DELETE', `/api/daily-record/${daily.id}/attachments/${photo.id}`, null, admin);
  const afterDelete = await req('GET', `/api/daily-record/${daily.id}`, null, admin);
  if (afterDelete.attachments.length !== 0) throw new Error('Attachment was not deleted');

  step = 'move siswa and preserve history';
  const rombelKtg = await req('GET', `/api/master/rombel?cabang_id=${ktg.id}`, null, admin);
  const target = pick(rombelKtg, r => r.jenjang_id === tk.id, 'rombel TK A Kentungan');
  await req('POST', `/api/siswa/${siswa.id}/enrollment`, { cabang_id: ktg.id, jenjang_id: tk.id, rombel_id: target.id, paket: 'reguler', tanggal_mulai: '2026-08-01', alasan: 'Smoke pindah cabang' }, admin);
  const history = await req('GET', `/api/daily-record/history/${siswa.id}`, null, admin);
  if (!history.length) throw new Error('Daily record history missing after move');
  const audit = await req('GET', '/api/master/audit-log?limit=20', null, admin);
  if (!audit.length) throw new Error('Audit log empty');

  console.log(`SMOKE OK: ${bills.length} bills, invoice ${invoice.invoice_no}, receipt ${payment.receipt_no}`);
}

main().catch(err => {
  console.error(`SMOKE FAILED at ${step}`);
  console.error(err.stack || err.message || err);
  process.exit(1);
});
