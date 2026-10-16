// Test unit untuk helper murni GuruView.
// Fungsi-fungsi ini sengaja dipisahkan dari komponen (Fase 5.1) supaya bisa
// diuji tanpa DOM maupun render React.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  generatePedagogicalNote,
  noteOk,
  themeDomains,
  activityLinesFromText,
  domainOptions,
  matchesClassModule,
  moduleScopeLabel,
  formalText,
  completeness,
  normalizeActivities,
  getIndonesianDayName,
  OBSERVATION_DOMAINS,
  sections
} from './helpers.js';

describe('generatePedagogicalNote', () => {
  it('meminta memilih aktivitas bila tidak ada masukan', () => {
    assert.match(generatePedagogicalNote('Aisyah', [], null), /Silakan pilih/);
  });

  it('menggabungkan aktivitas dan mood', () => {
    const note = generatePedagogicalNote('Aisyah', ['Mewarnai', 'Bernyanyi'], 'ceria');
    assert.match(note, /Aisyah aktif mengikuti kegiatan Mewarnai dan Bernyanyi/);
    assert.match(note, /sangat ceria/);
  });

  it('mengabaikan mood yang tidak dikenal', () => {
    const note = generatePedagogicalNote('Budi', ['Membaca'], 'kabur');
    assert.equal(note, 'Budi aktif mengikuti kegiatan Membaca dengan baik.');
  });
});

describe('noteOk', () => {
  it('menolak catatan kosong dan yang kurang dari 12 karakter', () => {
    assert.equal(noteOk(''), false);
    assert.equal(noteOk(undefined), false);
    assert.equal(noteOk('12345678901'), false);
  });

  it('menerima catatan 12 karakter atau lebih, mengabaikan spasi di tepi', () => {
    assert.equal(noteOk('123456789012'), true);
    assert.equal(noteOk('  123456789012  '), true);
  });
});

describe('themeDomains', () => {
  it('meneruskan array apa adanya', () => {
    assert.deepEqual(themeDomains(['Literasi', 'Numerasi']), ['Literasi', 'Numerasi']);
  });

  it('memecah string berkoma dan membuang entri kosong', () => {
    assert.deepEqual(themeDomains('Literasi, Numerasi ,, Seni'), ['Literasi', 'Numerasi', 'Seni']);
  });

  it('mengembalikan array kosong untuk nilai kosong', () => {
    assert.deepEqual(themeDomains(null), []);
    assert.deepEqual(themeDomains(''), []);
  });
});

describe('activityLinesFromText', () => {
  it('membuang penanda daftar dan baris kosong', () => {
    assert.deepEqual(activityLinesFromText('  - Mewarnai\n* Bernyanyi\n\u2022 Menari\n\n'), [
      'Mewarnai',
      'Bernyanyi',
      'Menari'
    ]);
  });

  it('mengembalikan array kosong untuk nilai kosong', () => {
    assert.deepEqual(activityLinesFromText(undefined), []);
  });
});

describe('domainOptions', () => {
  it('menggabungkan domain dari detail dengan daftar baku, tanpa duplikat', () => {
    const opts = domainOptions({ focus_theme_domains: ['Literasi', 'Domain Khusus'] });
    assert.ok(opts.includes('Domain Khusus'));
    assert.equal(opts.filter((d) => d === 'Literasi').length, 1);
    assert.equal(opts.length, OBSERVATION_DOMAINS.length + 1);
  });

  it('aman saat detail tidak punya domain', () => {
    assert.deepEqual(domainOptions({}), OBSERVATION_DOMAINS);
    assert.deepEqual(domainOptions(undefined), OBSERVATION_DOMAINS);
  });
});

describe('matchesClassModule', () => {
  const student = { paket: 'reguler', jenjang_id: 3 };

  it('menolak bila modul atau siswa tidak ada', () => {
    assert.equal(matchesClassModule(null, 1, student), false);
    assert.equal(matchesClassModule({}, 1, null), false);
  });

  it('menerima modul tanpa scope (berlaku semua kelas)', () => {
    assert.equal(matchesClassModule({ paket: 'reguler' }, 9, student), true);
  });

  it('mencocokkan berdasarkan rombel', () => {
    assert.equal(matchesClassModule({ paket: 'reguler', rombel_id: 9 }, 9, student), true);
    assert.equal(matchesClassModule({ paket: 'reguler', rombel_id: 8 }, 9, student), false);
  });

  it('mencocokkan berdasarkan jenjang bila rombel tidak ditentukan', () => {
    assert.equal(matchesClassModule({ paket: 'reguler', jenjang_id: 3 }, 9, student), true);
    assert.equal(matchesClassModule({ paket: 'reguler', jenjang_id: 4 }, 9, student), false);
  });

  it('menolak bila paket berbeda', () => {
    assert.equal(matchesClassModule({ paket: 'care', rombel_id: 9 }, 9, student), false);
  });
});

describe('moduleScopeLabel', () => {
  it('memprioritaskan nama rombel', () => {
    assert.equal(moduleScopeLabel({ rombel_nama: 'TK A', jenjang_nama: 'TK' }), 'TK A');
  });

  it('memakai nama jenjang bila rombel kosong', () => {
    assert.equal(moduleScopeLabel({ jenjang_nama: 'TK' }), 'Jenjang TK');
  });

  it('menyebut semua kelas bila keduanya kosong', () => {
    assert.equal(moduleScopeLabel({}), 'Semua kelas');
    assert.equal(moduleScopeLabel(null), 'Semua kelas');
  });
});

describe('formalText', () => {
  it('mengembalikan null bila tidak ada isi', () => {
    assert.equal(formalText(null, 'Aisyah'), null);
    assert.equal(formalText({}, 'Aisyah'), null);
    assert.equal(formalText({ aktivitas: [] }, 'Aisyah'), null);
  });

  it('menyusun kalimat dari mood, makan, dan tidur', () => {
    const text = formalText({ mood: 'ceria', makan: 'habis', tidur: 1 }, 'Aisyah');
    assert.match(text, /Aisyah hari ini terlihat ceria dan bersemangat\./);
    assert.match(text, /Makan siang habis dengan porsi penuh\./);
    assert.match(text, /Anak tidur siang dengan baik\./);
  });

  it('membedakan tidak tidur dari tidur', () => {
    assert.match(formalText({ tidur: 0 }, 'Budi'), /tidak tidur siang/);
  });

  it('menyertakan tema, observasi, dan catatan bila ada', () => {
    const text = formalText(
      {
        focus_theme_title: 'Kebun Binatang',
        observation_domain: 'Literasi',
        observation_note: 'Sudah bisa menulis namanya',
        catatan: 'Bawa bekal'
      },
      'Aisyah'
    );
    assert.match(text, /Tema hari ini: Kebun Binatang\./);
    assert.match(text, /Observasi literasi: Sudah bisa menulis namanya/);
    assert.match(text, /Catatan: Bawa bekal/);
  });
});

describe('completeness', () => {
  it('menghitung nol untuk laporan kosong', () => {
    assert.equal(completeness(null), 0);
    assert.equal(completeness({}), 0);
  });

  it('menghitung satu dari enam kriteria sebagai 17 persen', () => {
    assert.equal(completeness({ mood: 'ceria' }), 17);
  });

  it('mencapai 100 persen saat semua kriteria terpenuhi', () => {
    assert.equal(
      completeness({
        mood: 'ceria',
        makan: 'habis',
        tidur: 1,
        focus_theme_id: 5,
        observation_domain: 'Literasi',
        observation_note: 'Sudah bisa menulis namanya'
      }),
      100
    );
  });

  it('tidak menghitung catatan observasi yang terlalu pendek', () => {
    assert.equal(completeness({ observation_note: 'pendek' }), 0);
  });

  it('menghitung tidur 0 sebagai terisi', () => {
    assert.equal(completeness({ tidur: 0 }), 17);
  });
});

describe('normalizeActivities', () => {
  const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

  it('selalu mengembalikan tujuh hari dengan empat bagian', () => {
    const result = normalizeActivities(null);
    assert.deepEqual(Object.keys(result), DAYS);
    for (const day of DAYS) {
      assert.deepEqual(Object.keys(result[day]), ['opening', 'focus_theme', 'break', 'closing']);
      assert.deepEqual(result[day].opening, []);
    }
  });

  it('menerima string JSON', () => {
    const result = normalizeActivities(JSON.stringify({ Senin: { opening: ['Doa'] } }));
    assert.deepEqual(result.Senin.opening, ['Doa']);
  });

  it('menerima objek langsung', () => {
    const result = normalizeActivities({ Rabu: { closing: ['Refleksi'] } });
    assert.deepEqual(result.Rabu.closing, ['Refleksi']);
  });

  it('kembali ke struktur kosong saat JSON rusak', () => {
    const result = normalizeActivities('{bukan json');
    assert.deepEqual(result.Senin.opening, []);
  });

  it('membuang entri kosong dari daftar', () => {
    const result = normalizeActivities({ Jumat: { break: ['Istirahat', '', null] } });
    assert.deepEqual(result.Jumat.break, ['Istirahat']);
  });
});

describe('getIndonesianDayName', () => {
  it('memetakan tanggal ke nama hari', () => {
    assert.equal(getIndonesianDayName('2026-10-16'), 'Jumat');
    assert.equal(getIndonesianDayName('2026-10-18'), 'Minggu');
    assert.equal(getIndonesianDayName('2026-10-19'), 'Senin');
  });

  it('kembali ke Senin untuk masukan tidak valid', () => {
    assert.equal(getIndonesianDayName(''), 'Senin');
    assert.equal(getIndonesianDayName(null), 'Senin');
    assert.equal(getIndonesianDayName('2026-10'), 'Senin');
  });
});

describe('sections', () => {
  it('memetakan kunci bagian ke label Indonesia', () => {
    assert.deepEqual(sections, { opening: 'Pembuka', focus_theme: 'Inti', break: 'Istirahat', closing: 'Penutup' });
  });
});
