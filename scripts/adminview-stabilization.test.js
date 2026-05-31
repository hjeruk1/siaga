const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');

const adminView = readFileSync('frontend/src/views/AdminView.jsx', 'utf8');
const appView = readFileSync('frontend/src/App.jsx', 'utf8');

test('AdminView uses WIB-safe date defaults', () => {
  assert.match(adminView, /import\{todayWIB\}from'\.\.\/utils\/date';/);
  assert.doesNotMatch(adminView, /new Date\(\)\.toISOString\(\)\.slice\(0,10\)/);
});

test('monthly billing preview does not hardcode a fallback period', () => {
  assert.doesNotMatch(adminView, /2026-07/);
  assert.match(adminView, /const payload=\{cabang_id:m\.cabangId\};\s*if\(form\.periode\)payload\.periode=form\.periode;/);
});

test('admin all-branch Wali and Billing tabs load without selected cabang', () => {
  assert.match(adminView, /useEffect\(\(\)=>\{load\(\)\.catch\(e=>toast\('err',e\.message\)\);\},\[m\.cabangId\]\);/);
  assert.match(adminView, /useEffect\(\(\)=>\{load\(\);\},\[m\.cabangId,filterTahunAjaran\]\);/);
});

test('route views are lazy-loaded to reduce initial bundle pressure', () => {
  assert.match(appView, /const AdminView=lazy\(\(\)=>import\('\.\/views\/AdminView'\)\);/);
  assert.match(appView, /<Suspense fallback=/);
});
