const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const { nowUtc, requireCabang, audit } = require('../utils/workflow');
const multer = require('multer');
const mammoth = require('mammoth');
const { GoogleGenAI } = require('@google/genai');
const { PDFParse } = require('pdf-parse');

// Multer: memory storage, accept .doc/.docx/.pdf, max 10MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(doc|docx|pdf)$/i.test(file.originalname);
    if (!ok) return cb(new Error('Hanya file .doc, .docx, atau .pdf yang didukung'));
    cb(null, true);
  }
});

function getGeminiClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY belum dikonfigurasi di server');
  return new GoogleGenAI({ apiKey: key });
}

async function extractTextFromBuffer(buffer, originalname) {
  const ext = (originalname || '').toLowerCase().split('.').pop();
  if (ext === 'docx' || ext === 'doc') {
    const result = await mammoth.extractRawText({ buffer });
    return (result.value || '').slice(0, 40000); // cap at 40k chars
  }
  if (ext === 'pdf') {
    const parser = new PDFParse({ data: buffer });
    try {
      const data = await parser.getText();
      return (data.text || '').slice(0, 40000);
    } finally {
      await parser.destroy();
    }
  }
  throw new Error('Format file tidak didukung untuk parsing');
}


function parseJson(v, fallback = []) {
  if (Array.isArray(v)) return v;
  try {
    const parsed = JSON.parse(v || '[]');
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function parseSuggestedActivities(v) {
  let parsed = {};
  try {
    parsed = typeof v === 'string' ? JSON.parse(v || '{}') : (v || {});
  } catch {}

  if (Array.isArray(parsed)) {
    return parsed;
  }

  const result = {};
  const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
  DAYS.forEach(day => {
    const dayData = parsed[day] || {};
    result[day] = {
      opening: Array.isArray(dayData.opening) ? dayData.opening.filter(Boolean) : [],
      focus_theme: Array.isArray(dayData.focus_theme) ? dayData.focus_theme.filter(Boolean) : [],
      break: Array.isArray(dayData.break) ? dayData.break.filter(Boolean) : [],
      closing: Array.isArray(dayData.closing) ? dayData.closing.filter(Boolean) : []
    };
  });

  return result;
}

function jsonArray(v) {
  return JSON.stringify(v && typeof v === 'object' ? v : {});
}

function moduleRow(row) {
  if (!row) return null;
  return {
    ...row,
    goals: parseJson(row.goals),
    suggested_activities: parseSuggestedActivities(row.suggested_activities),
    suggested_domains: parseJson(row.suggested_domains)
  };
}

function themeRow(row) {
  if (!row) return null;
  return { ...row, suggested_domains: parseJson(row.suggested_domains) };
}

function scopeCabang(req, explicitCabangId) {
  return req.user.role === 'admin' ? explicitCabangId : req.user.cabang_id;
}

function canUseRombel(req, res, rombelId, cabangId = null) {
  const rombel = db.prepare('SELECT * FROM rombel WHERE id=?').get(rombelId);
  if (!rombel) {
    res.status(404).json({ error: 'Rombel tidak ditemukan' });
    return null;
  }
  if (cabangId !== null && cabangId !== undefined && Number(rombel.cabang_id) !== Number(cabangId)) {
    res.status(400).json({ error: 'Rombel tidak sesuai cabang' });
    return null;
  }
  if (!requireCabang(req, res, rombel.cabang_id)) return null;
  if (req.user.role === 'guru') {
    const assigned = db.prepare('SELECT 1 FROM guru_rombel WHERE pengguna_id=? AND rombel_id=?')
      .get(req.user.id, rombel.id);
    if (!assigned) {
      res.status(403).json({ error: 'Guru tidak ditugaskan di rombel ini' });
      return null;
    }
  }
  return rombel;
}

function validateModulAjarLink(res, modulAjarId, cabangId, rombelId) {
  if (!modulAjarId) return true;
  const modul = db.prepare('SELECT id,cabang_id,rombel_id FROM modul_ajar WHERE id=?').get(modulAjarId);
  if (!modul || Number(modul.cabang_id) !== Number(cabangId)) {
    res.status(400).json({ error: 'Modul ajar tidak sesuai cabang' });
    return false;
  }
  if (modul.rombel_id && Number(modul.rombel_id) !== Number(rombelId)) {
    res.status(400).json({ error: 'Modul ajar tidak sesuai rombel' });
    return false;
  }
  return true;
}

router.get('/', auth(['admin', 'admin_cabang', 'kepsek', 'guru']), (req, res) => {
  const cabangId = scopeCabang(req, req.query.cabang_id);
  if (req.user.role !== 'admin' && !cabangId) {
    return res.status(400).json({ error: 'Cabang wajib' });
  }
  if (cabangId && !requireCabang(req, res, cabangId)) return;

  const params = [];
  let where = '';
  if (cabangId) {
    where = 'WHERE m.cabang_id=?';
    params.push(cabangId);
  }
  if (req.query.tanggal) {
    if (where) {
      where += ' AND m.week_start<=? AND m.week_end>=?';
    } else {
      where = 'WHERE m.week_start<=? AND m.week_end>=?';
    }
    params.push(req.query.tanggal, req.query.tanggal);
  }

  const rows = db.prepare(`
    SELECT m.*,c.nama AS cabang_nama,j.nama AS jenjang_nama,r.nama AS rombel_nama,
           p.display_name AS created_by_name
    FROM modul_ajar m
    JOIN cabang c ON c.id=m.cabang_id
    LEFT JOIN jenjang j ON j.id=m.jenjang_id
    LEFT JOIN rombel r ON r.id=m.rombel_id
    LEFT JOIN pengguna p ON p.id=m.created_by
    ${where}
    ORDER BY m.week_start DESC,m.id DESC
  `).all(...params);
  res.json(rows.map(moduleRow));
});

router.post('/', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const d = req.body || {};
  const cabangId = scopeCabang(req, d.cabang_id);
  if (!d.title || !d.week_start || !d.week_end) return res.status(400).json({ error: 'Judul, minggu mulai, dan minggu selesai wajib' });
  if (!cabangId) return res.status(400).json({ error: 'Cabang wajib' });
  if (!requireCabang(req, res, cabangId)) return;
  if (d.rombel_id && !canUseRombel(req, res, d.rombel_id, cabangId)) return;
  if (d.jenjang_id) {
    const jenjang = db.prepare('SELECT 1 FROM jenjang WHERE id=?').get(d.jenjang_id);
    if (!jenjang) return res.status(400).json({ error: 'Jenjang tidak ditemukan' });
  }

  const now = nowUtc();
  const r = db.prepare(`
    INSERT INTO modul_ajar
      (cabang_id,jenjang_id,rombel_id,paket,title,week_start,week_end,goals,suggested_activities,suggested_domains,attachment_url,created_by,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    cabangId,
    d.jenjang_id || null,
    d.rombel_id || null,
    d.paket || null,
    d.title,
    d.week_start,
    d.week_end,
    jsonArray(d.goals),
    jsonArray(d.suggested_activities),
    jsonArray(d.suggested_domains),
    d.attachment_url || null,
    req.user.id,
    now,
    now
  );
  audit(req.user, 'create', 'modul_ajar', r.lastInsertRowid, { cabang_id: cabangId, after: d });
  res.json({ id: r.lastInsertRowid });
});

router.put('/:id', auth(['admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const before = db.prepare('SELECT * FROM modul_ajar WHERE id=?').get(req.params.id);
  if (!before) return res.status(404).json({ error: 'Modul ajar tidak ditemukan' });
  if (!requireCabang(req, res, before.cabang_id)) return;

  const d = req.body || {};
  const cabangId = scopeCabang(req, d.cabang_id || before.cabang_id);
  if (!d.title || !d.week_start || !d.week_end) return res.status(400).json({ error: 'Judul, minggu mulai, dan minggu selesai wajib' });
  if (!cabangId) return res.status(400).json({ error: 'Cabang wajib' });
  if (!requireCabang(req, res, cabangId)) return;
  if (d.rombel_id && !canUseRombel(req, res, d.rombel_id, cabangId)) return;
  if (d.jenjang_id) {
    const jenjang = db.prepare('SELECT 1 FROM jenjang WHERE id=?').get(d.jenjang_id);
    if (!jenjang) return res.status(400).json({ error: 'Jenjang tidak ditemukan' });
  }

  db.prepare(`
    UPDATE modul_ajar
    SET cabang_id=?,jenjang_id=?,rombel_id=?,paket=?,title=?,week_start=?,week_end=?,
        goals=?,suggested_activities=?,suggested_domains=?,attachment_url=?,updated_at=?
    WHERE id=?
  `).run(
    cabangId,
    d.jenjang_id || null,
    d.rombel_id || null,
    d.paket || null,
    d.title,
    d.week_start,
    d.week_end,
    jsonArray(d.goals),
    jsonArray(d.suggested_activities),
    jsonArray(d.suggested_domains),
    d.attachment_url || null,
    nowUtc(),
    before.id
  );
  audit(req.user, 'update', 'modul_ajar', before.id, { cabang_id: cabangId, before, after: d });
  res.json({ id: before.id, action: 'updated' });
});

router.get('/focus-theme', auth(['admin', 'admin_cabang', 'kepsek', 'guru']), (req, res) => {
  const { rombel_id, tanggal } = req.query;
  if (!rombel_id || !tanggal) return res.status(400).json({ error: 'Rombel dan tanggal wajib' });
  const rombel = canUseRombel(req, res, rombel_id);
  if (!rombel) return;

  const row = db.prepare(`
    SELECT ft.*,m.title AS modul_ajar_title
    FROM focus_theme ft
    LEFT JOIN modul_ajar m ON m.id=ft.modul_ajar_id
    WHERE ft.rombel_id=? AND ft.tanggal=?
  `).get(rombel_id, tanggal);
  if (!row) return res.json(null);
  if (Number(row.cabang_id) !== Number(rombel.cabang_id)) return res.status(400).json({ error: 'Tema tidak sesuai rombel' });
  res.json(themeRow(row));
});

router.post('/focus-theme', auth(['guru', 'admin', 'admin_cabang', 'kepsek']), (req, res) => {
  const d = req.body || {};
  const cabangId = scopeCabang(req, d.cabang_id);
  if (!cabangId || !d.rombel_id || !d.tanggal || !d.title) return res.status(400).json({ error: 'Cabang, rombel, tanggal, dan judul wajib' });
  const rombel = canUseRombel(req, res, d.rombel_id, cabangId);
  if (!rombel) return;
  if (!validateModulAjarLink(res, d.modul_ajar_id, cabangId, d.rombel_id)) return;

  const before = db.prepare('SELECT * FROM focus_theme WHERE rombel_id=? AND tanggal=?').get(d.rombel_id, d.tanggal);
  const now = nowUtc();
  const values = [
    d.modul_ajar_id || null,
    cabangId,
    d.rombel_id,
    d.tanggal,
    d.title,
    d.activity_summary || null,
    jsonArray(d.suggested_domains),
    d.teacher_prompt || null,
    req.user.id,
    now
  ];

  if (before) {
    db.prepare(`
      UPDATE focus_theme
      SET modul_ajar_id=?,cabang_id=?,rombel_id=?,tanggal=?,title=?,activity_summary=?,
          suggested_domains=?,teacher_prompt=?,created_by=?,updated_at=?,menu_makanan=?
      WHERE id=?
    `).run(...values, d.menu_makanan || null, before.id);
    audit(req.user, 'update', 'focus_theme', before.id, { cabang_id: cabangId, before, after: d });
    return res.json({ id: before.id, action: 'updated' });
  }

  const r = db.prepare(`
    INSERT INTO focus_theme
      (modul_ajar_id,cabang_id,rombel_id,tanggal,title,activity_summary,suggested_domains,teacher_prompt,created_by,created_at,updated_at,menu_makanan)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(...values, now, d.menu_makanan || null);
  audit(req.user, 'create', 'focus_theme', r.lastInsertRowid, { cabang_id: cabangId, after: d });
  res.json({ id: r.lastInsertRowid, action: 'created' });
});

// POST /api/modul-ajar/parse-file
// Upload .doc/.docx/.pdf modul ajar -> extract text -> Gemini AI -> return pre-filled JSON
router.post(
  '/parse-file',
  auth(['admin', 'admin_cabang', 'kepsek']),
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      next();
    });
  },
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'File tidak ditemukan dalam request' });
    try {
      // 1. Extract raw text from the uploaded file
      const rawText = await extractTextFromBuffer(req.file.buffer, req.file.originalname);
      if (!rawText || rawText.trim().length < 50) {
        return res.status(422).json({ error: 'Tidak dapat membaca teks dari file. Pastikan file tidak terproteksi.' });
      }

      // 2. Send to Gemini for structured extraction
      const ai = getGeminiClient();
      const prompt = `Kamu adalah asisten yang mengekstrak informasi dari dokumen Modul Ajar TK/PAUD Indonesia.

Dari teks dokumen berikut, ekstrak informasi secara lengkap dan kembalikan HANYA objek JSON valid (tanpa markdown, tanpa penjelasan lain):

{
  "title": "Judul tema atau sub-topik minggu ini (contoh: MEDIA SOSIAL - Konten Kreator)",
  "goals": ["tujuan pembelajaran 1", "tujuan 2"],
  "suggested_activities": {
    "Senin": {
      "opening": ["kegiatan pembuka Senin 1", "kegiatan pembuka Senin 2"],
      "focus_theme": ["kegiatan inti/utama Senin 1", "kegiatan inti/utama Senin 2"],
      "break": ["kegiatan bermain/snack Senin"],
      "closing": ["kegiatan recalling/penutup Senin"]
    },
    "Selasa": {
      "opening": ["kegiatan pembuka Selasa 1"],
      "focus_theme": ["kegiatan inti/utama Selasa 1"],
      "break": ["kegiatan bermain/snack Selasa"],
      "closing": ["kegiatan recalling/penutup Selasa"]
    },
    "Rabu": {
      "opening": ["..."],
      "focus_theme": ["..."],
      "break": ["..."],
      "closing": ["..."]
    },
    "Kamis": {
      "opening": ["..."],
      "focus_theme": ["..."],
      "break": ["..."],
      "closing": ["..."]
    },
    "Jumat": {
      "opening": ["..."],
      "focus_theme": ["..."],
      "break": ["..."],
      "closing": ["..."]
    }
  },
  "suggested_domains": ["domain atau bidang pengembangan 1", "domain 2"],
  "metadata": {
    "topik": "MEDIA SOSIAL",
    "sub_topik": "Konten Kreator",
    "kelompok": "TK Kelompok A",
    "semester": "II",
    "minggu": "17"
  }
}

Aturan Penting:
1. "title": Ambil dari gabungan Topik utama dan Sub Topik (atau Sup Topik) minggu ini. Jika keduanya ada, gabungkan dengan format "Topik - Sub Topik" (misal: "MEDIA SOSIAL - Konten Kreator"). Jika hanya salah satu yang ada, gunakan nama tersebut.
2. "goals": ambil dari Tujuan Pembelajaran/Kegiatan (maks 10).
3. "suggested_activities": Ekstrak secara DETAIL dan LENGKAP seluruh rencana kegiatan harian dari Senin sampai Jumat.
   - PENTING: Jangan meringkas atau menggabungkan kegiatan. Setiap poin kegiatan (a, b, c, d, dst. atau bullet point) harus menjadi item array tersendiri yang terpisah.
   - Kategori kegiatan untuk setiap hari:
     * "opening": ambil dari baris "Opening" atau kegiatan pembuka (misal: Circle time, Salam dan doa, Hafalan QS, Tilawati, Tepuk & Menyanyi, Apersepsi, dll.).
     * "focus_theme": ambil dari baris "Focus Theme" atau kegiatan inti/utama (misal: Guru meminta anak menyampaikan pengalaman, game medsos, meloncat, menempel huruf, dll.).
     * "break": ambil dari baris "Take a Break" (misal: Bermain bebas, membereskan mainan, makan snack, dll.).
     * "closing": ambil dari baris "Recalling and Closing" atau kegiatan penutup (misal: Recalling kegiatan, menanyakan perasaan, pesan positif, doa penutup, pulang).
4. "suggested_domains": kategori besar kemampuan (mis: Religiusitas, Literasi & STEAM, Motorik).
5. Gunakan Bahasa Indonesia secara literal sesuai teks.
6. Hapus tanda-tanda bullet seperti "a. ", "b. ", "- ", atau "• " di awal teks kegiatan agar menjadi string bersih.
7. "metadata": Ekstrak kelompok/rombel (sebagai "kelompok"), semester (sebagai "semester"), minggu/bulan (sebagai "minggu"), topik (sebagai "topik"), dan sub-topik (sebagai "sub_topik") dari informasi header halaman pertama.

TEKS DOKUMEN:
${rawText}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt
      });

      const rawOutput = response.text || '';

      // 3. Parse Gemini response as JSON
      let parsed;
      try {
        // Strip markdown code blocks if present
        const cleaned = rawOutput
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();
        parsed = JSON.parse(cleaned);
      } catch {
        // Try to find JSON object in the response
        const match = rawOutput.match(/\{[\s\S]*\}/);
        if (match) {
          try { parsed = JSON.parse(match[0]); } catch { parsed = null; }
        }
      }

      if (!parsed || typeof parsed !== 'object') {
        return res.status(422).json({
          error: 'Gemini tidak dapat mengekstrak data terstruktur dari file ini',
          raw_output: rawOutput.slice(0, 500)
        });
      }

      res.json({
        title: String(parsed.title || '').trim(),
        goals: Array.isArray(parsed.goals) ? parsed.goals.filter(Boolean).slice(0, 10) : [],
        suggested_activities: parseSuggestedActivities(parsed.suggested_activities),
        suggested_domains: Array.isArray(parsed.suggested_domains)
          ? parsed.suggested_domains.filter(Boolean).slice(0, 10)
          : [],
        metadata: {
          topik: String(parsed.metadata?.topik || '').trim(),
          sub_topik: String(parsed.metadata?.sub_topik || '').trim(),
          kelompok: String(parsed.metadata?.kelompok || '').trim(),
          semester: String(parsed.metadata?.semester || '').trim(),
          minggu: String(parsed.metadata?.minggu || '').trim()
        },
        file_name: req.file.originalname
      });
    } catch (e) {
      console.error('[parse-file]', e);
      if (e.message && e.message.includes('GEMINI_API_KEY')) {
        return res.status(503).json({ error: e.message });
      }
      res.status(500).json({ error: 'Gagal memproses file: ' + e.message });
    }
  }
);

module.exports = router;
