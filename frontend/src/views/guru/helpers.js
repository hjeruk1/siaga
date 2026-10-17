// Helper murni dan konstanta GuruView.
// Dipisahkan dari GuruView.jsx agar bisa dibaca dan diuji tanpa menelusuri
// komponen 1300 baris. Tidak ada state atau efek di sini.

export function generatePedagogicalNote(nama, activities, mood) {
  const sentences = [];
  if (activities && activities.length > 0) {
    sentences.push(`${nama} aktif mengikuti kegiatan ${activities.join(' dan ')} dengan baik.`);
  }
  if (mood) {
    const moodMap = {
      ceria: 'Anak tampak sangat ceria, bersemangat, dan antusias sepanjang hari.',
      tenang: 'Anak tenang dan mengikuti seluruh kegiatan dengan nyaman.',
      biasa: 'Kondisi anak stabil dan mengikuti seluruh rutinitas kelas dengan tenang.',
      mengantuk: 'Anak tampak mengantuk, tetapi tetap mengikuti kegiatan dengan pendampingan guru.',
      manja: 'Anak membutuhkan perhatian ekstra hari ini dan nyaman saat didampingi guru.',
      rewel: 'Anak memerlukan perhatian lebih karena tampak kurang nyaman atau rewel hari ini.'
    };
    if (moodMap[mood]) sentences.push(moodMap[mood]);
  }
  return sentences.length > 0 ? sentences.join(' ') : 'Silakan pilih aktivitas atau mood anak terlebih dahulu.';
}

export const AKTIVITAS = [
  'Mewarnai',
  'Bernyanyi & Menari',
  'Bermain Bebas',
  'Membaca & Menulis',
  'Motorik Halus',
  'Motorik Kasar',
  'Ibadah / Doa',
  'Seni & Kerajinan',
  'Bercerita',
  'Bermain Peran'
];
export const MOOD_OPT = [
  { v: 'ceria', l: '😊 Ceria', c: 'bg-emerald-500' },
  { v: 'tenang', l: '😌 Tenang', c: 'bg-sky-500' },
  { v: 'biasa', l: '😐 Biasa', c: 'bg-primary' },
  { v: 'mengantuk', l: '😪 Mengantuk', c: 'bg-blue-500' },
  { v: 'manja', l: '🥺 Manja', c: 'bg-violet-500' },
  { v: 'rewel', l: '😢 Rewel', c: 'bg-red-500' }
];
export const MAKAN_OPT = [
  { v: 'habis', l: '🍽️ Habis', c: 'bg-emerald-500' },
  { v: 'setengah', l: '🍱 Setengah', c: 'bg-primary' },
  { v: 'tidak', l: '❌ Tidak Dimakan', c: 'bg-red-500' }
];
export const TIDUR_OPT = [
  { v: 1, l: '💤 Ya', c: 'bg-blue-500' },
  { v: 0, l: '🙅 Tidak', c: 'bg-slate-500' }
];

export const OBSERVATION_DOMAINS = [
  'Agama & Budi Pekerti',
  'Jati Diri',
  'Literasi',
  'Numerasi',
  'Sains & Teknologi',
  'Motorik',
  'Sosial Emosional',
  'Seni'
];
export const sections = { opening: 'Pembuka', focus_theme: 'Inti', break: 'Istirahat', closing: 'Penutup' };

export function noteOk(v) {
  return String(v || '').trim().length >= 12;
}

export function themeDomains(v) {
  if (Array.isArray(v)) return v;
  if (!v) return [];
  return String(v)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

export function activityLinesFromText(v) {
  return String(v || '')
    .split('\n')
    .map((line) => line.replace(/^[\s\-*\u2022]+/, '').trim())
    .filter(Boolean);
}

export function domainOptions(detail) {
  return Array.from(new Set([...(detail?.focus_theme_domains || []), ...OBSERVATION_DOMAINS].filter(Boolean)));
}

export function matchesClassModule(module, rombelId, sampleStudent) {
  if (!module || !sampleStudent) return false;
  const paketOk = !module.paket || !sampleStudent.paket || String(module.paket) === String(sampleStudent.paket);
  const scopeOk =
    (!module.rombel_id && !module.jenjang_id) ||
    (module.rombel_id && String(module.rombel_id) === String(rombelId)) ||
    (!module.rombel_id && module.jenjang_id && String(module.jenjang_id) === String(sampleStudent.jenjang_id));
  return paketOk && scopeOk;
}

export function moduleScopeLabel(module) {
  if (module?.rombel_nama) return module.rombel_nama;
  if (module?.jenjang_nama) return `Jenjang ${module.jenjang_nama}`;
  return 'Semua kelas';
}

export function formalText(l, nama) {
  if (
    !l ||
    (!l.mood &&
      !l.makan &&
      (l.tidur === null || l.tidur === undefined) &&
      !l.aktivitas?.length &&
      !l.catatan &&
      !l.observation_note)
  )
    return null;
  const moodMap = {
    ceria: 'terlihat ceria dan bersemangat',
    biasa: 'terlihat biasa saja',
    rewel: 'terlihat sedikit rewel'
  };
  const makanMap = {
    habis: 'Makan siang habis dengan porsi penuh.',
    setengah: 'Makan siang hanya setengah porsi.',
    tidak: 'Anak tidak mau makan siang.'
  };
  const tidurText = l.tidur === 1 ? 'Anak tidur siang dengan baik.' : 'Anak tidak tidur siang hari ini.';
  const aktList =
    (l.aktivitas || []).length > 0 ? 'Aktivitas yang dilakukan: ' + (l.aktivitas || []).join(', ') + '.' : '';
  const catatan = l.catatan ? 'Catatan: ' + l.catatan : '';
  const focus = l.focus_theme_title ? 'Tema hari ini: ' + l.focus_theme_title + '.' : '';
  const observasi = l.observation_note
    ? 'Observasi ' + (l.observation_domain ? l.observation_domain.toLowerCase() : 'anak') + ': ' + l.observation_note
    : '';
  return [
    focus,
    l.mood ? nama + ' hari ini ' + moodMap[l.mood] + '.' : '',
    l.makan ? makanMap[l.makan] : '',
    l.tidur !== null && l.tidur !== undefined ? tidurText : '',
    aktList,
    observasi,
    catatan
  ]
    .filter(Boolean)
    .join(' ');
}

export function completeness(l) {
  if (!l) return 0;
  let s = 0;
  if (l.mood) s++;
  if (l.makan) s++;
  if (l.tidur !== null && l.tidur !== undefined) s++;
  if (l.focus_theme_id) s++;
  if (l.observation_domain) s++;
  if (noteOk(l.observation_note)) s++;
  return Math.round((s / 6) * 100);
}

// Sebelumnya fungsi ini disalin persis di dua tempat: GuruView.jsx dan
// KegiatanMingguanTab.jsx. Keduanya byte-identik, jadi disatukan di sini.
export const normalizeActivities = (v) => {
  const result = {};
  const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

  let parsed = {};
  if (v && typeof v === 'object') {
    parsed = v;
  } else if (v && typeof v === 'string') {
    try {
      parsed = JSON.parse(v || '{}');
    } catch {}
  }

  DAYS.forEach((day) => {
    const dayData = parsed[day] || {};
    result[day] = {
      opening: Array.isArray(dayData.opening) ? dayData.opening.filter(Boolean) : [],
      focus_theme: Array.isArray(dayData.focus_theme) ? dayData.focus_theme.filter(Boolean) : [],
      break: Array.isArray(dayData.break) ? dayData.break.filter(Boolean) : [],
      closing: Array.isArray(dayData.closing) ? dayData.closing.filter(Boolean) : []
    };
  });

  return result;
};

export const getIndonesianDayName = (dateStr) => {
  if (!dateStr) return 'Senin';
  const parts = dateStr.split('-');
  if (parts.length < 3) return 'Senin';
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  const date = new Date(y, m, d);
  const day = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const map = {
    1: 'Senin',
    2: 'Selasa',
    3: 'Rabu',
    4: 'Kamis',
    5: 'Jumat',
    6: 'Sabtu',
    0: 'Minggu'
  };
  return map[day] || 'Senin';
};
