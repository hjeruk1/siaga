// Token desain: DESIGN.md (niat) dan src/index.css (nilai) tidak boleh menyimpang.
//
// Kenapa perlu tes: sampai sekarang ada tiga tempat untuk angka yang sama —
// DESIGN.md, tailwind.theme.json hasil `export-design.js`, dan blok `@theme` di
// index.css. Yang ketiga yang benar-benar dipakai Tailwind v4; dua lainnya bisa
// berubah tanpa ada yang gagal. Perantara JSON-nya sudah dihapus, dan tes ini
// menutup celah sisanya: mengubah warna di CSS tanpa memperbarui dokumen (atau
// sebaliknya) akan langsung merah.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const DESIGN = path.join(import.meta.dirname, '..', 'DESIGN.md');
const CSS = path.join(import.meta.dirname, 'index.css');

// Front-matter di DESIGN.md sangat sederhana (dua tingkat, nilai berkutip),
// jadi diurai apa adanya daripada menambah dependensi YAML.
function bacaFrontMatter(teks) {
  const cocok = /^---\r?\n([\s\S]*?)\r?\n---/.exec(teks);
  if (!cocok) throw new Error('DESIGN.md tidak punya front-matter');
  const hasil = {};
  // Tumpukan induk per tingkat indentasi: front-matter ini punya tiga tingkat
  // (typography → sans → fontFamily), jadi satu variabel `induk` tidak cukup.
  const tumpukan = [{ indent: -1, obj: hasil }];
  for (const baris of cocok[1].split(/\r?\n/)) {
    if (!baris.trim() || baris.trim().startsWith('#')) continue;
    const indent = baris.length - baris.trimStart().length;
    const isi = baris.trim();
    const pisah = isi.indexOf(':');
    if (pisah < 0) continue;
    const kunci = isi.slice(0, pisah).trim();
    const nilai = isi
      .slice(pisah + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');

    while (tumpukan.length > 1 && indent <= tumpukan[tumpukan.length - 1].indent) tumpukan.pop();
    const induk = tumpukan[tumpukan.length - 1].obj;
    if (!nilai) {
      induk[kunci] = {};
      tumpukan.push({ indent, obj: induk[kunci] });
    } else {
      induk[kunci] = nilai;
    }
  }
  return hasil;
}

function bacaTema(css) {
  const blok = /@theme\s*\{([\s\S]*?)\n\}/.exec(css);
  if (!blok) throw new Error('index.css tidak punya blok @theme');
  const token = {};
  for (const m of blok[1].matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    token[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return token;
}

describe('token desain', () => {
  const desain = bacaFrontMatter(fs.readFileSync(DESIGN, 'utf8'));
  const tema = bacaTema(fs.readFileSync(CSS, 'utf8'));

  it('setiap warna di DESIGN.md sama dengan --color-* di index.css', () => {
    const warna = desain.colors || {};
    assert.ok(Object.keys(warna).length > 0, 'DESIGN.md harus mendaftar warna');
    for (const [nama, nilai] of Object.entries(warna)) {
      assert.equal(
        tema[`color-${nama}`],
        nilai.toLowerCase(),
        `warna "${nama}" berbeda antara DESIGN.md (${nilai}) dan index.css (${tema[`color-${nama}`]})`
      );
    }
  });

  it('setiap radius di DESIGN.md sama dengan --radius-* di index.css', () => {
    const radius = desain.rounded || {};
    assert.ok(Object.keys(radius).length > 0, 'DESIGN.md harus mendaftar radius');
    for (const [nama, nilai] of Object.entries(radius)) {
      assert.equal(tema[`radius-${nama}`], nilai, `radius "${nama}" berbeda`);
    }
  });

  it('tipografi memakai DM Sans di kedua tempat', () => {
    assert.match(desain.typography.sans.fontFamily, /DM Sans/);
    assert.match(tema['font-sans'], /DM Sans/);
  });

  // Ini bukan detail gaya: `--spacing-sm` pernah membuat `max-w-sm` menjadi 4px
  // dan seluruh EmptyState runtuh jadi satu kata per baris. Tes ini menjaga
  // supaya tidak ada yang menambahkannya kembali "supaya lengkap".
  it('tidak mendefinisikan --spacing-sm', () => {
    assert.equal(tema['spacing-sm'], undefined);
    assert.ok(!/--spacing-sm\s*:/.test(fs.readFileSync(CSS, 'utf8')));
  });
});
