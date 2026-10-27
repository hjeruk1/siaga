const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { test } = require('node:test');

// AdminView is split into per-tab modules; read them all for source-level checks.
const adminDir = 'frontend/src/views/admin';
const adminView = readdirSync(adminDir)
  .filter((f) => f.endsWith('.jsx'))
  .map((f) => readFileSync(`${adminDir}/${f}`, 'utf8'))
  .join('\n');
const appView = readFileSync('frontend/src/App.jsx', 'utf8');

// Assertion tingkat-sumber tidak boleh bergantung pada formatting. Setiap celah
// whitespace ditulis sebagai \s* supaya Prettier (atau perubahan gaya lain)
// tidak memecahkan test ini.
test('AdminView uses WIB-safe date defaults', () => {
  assert.match(adminView, /import\s*\{\s*todayWIB\s*\}\s*from\s*'(?:\.\.\/)+utils\/date';/);
  assert.doesNotMatch(adminView, /new\s+Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/);
});

test('monthly billing preview does not hardcode a fallback period', () => {
  assert.doesNotMatch(adminView, /2026-07/);
  assert.match(
    adminView,
    /const\s+payload\s*=\s*\{\s*cabang_id:\s*m\.cabangId\s*\};\s*if\s*\(form\.periode\)\s*payload\.periode\s*=\s*form\.periode;/
  );
});

test('admin all-branch Wali and Billing tabs load without selected cabang', () => {
  // Inti yang dijaga: saat admin memilih "Semua Cabang" (m.cabangId kosong),
  // kedua tab tetap memuat data. Dulu keduanya berhenti karena effect dijaga
  // `if (m.cabangId)`. Daftarnya kini lewat React Query, jadi yang diperiksa
  // adalah sifatnya — bukan bentuk tulisan `load()`:
  //   - kunci query memuat m.cabangId (berpindah cabang = memuat ulang);
  //   - tidak ada `enabled` yang mensyaratkan cabang terisi (kalau ada,
  //     "Semua Cabang" berhenti memuat — regresi yang aslinya dijaga).
  for (const [nama, berkas] of [
    ['WaliTab', 'WaliTab.jsx'],
    ['BillingTab', 'BillingTab.jsx']
  ]) {
    const sumber = readFileSync(`${adminDir}/${berkas}`, 'utf8');
    assert.match(sumber, /useQuery\(/, `${nama}: daftar harus lewat useQuery`);
    assert.match(sumber, /queryKey:\s*\[[^\]]*m\.cabangId[^\]]*\]/, `${nama}: kunci query harus ikut cabang`);
    assert.doesNotMatch(
      sumber,
      /enabled:\s*!{1,2}\s*m\.cabangId\b/,
      `${nama}: jangan berhenti saat cabang belum dipilih`
    );
  }
});

test('route views are lazy-loaded to reduce initial bundle pressure', () => {
  assert.match(appView, /const\s+AdminView\s*=\s*lazy\(\(\)\s*=>\s*import\('\.\/views\/AdminView'\)\);/);
  assert.match(appView, /<Suspense\s+fallback=/);
});
