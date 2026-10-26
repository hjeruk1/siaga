const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs');

const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, f, cb) => cb(null, f.mimetype.startsWith('image/'))
});

async function saveSquareJpeg(buffer, outPath) {
  await sharp(buffer).resize(400, 400, { fit: 'cover', position: 'centre' }).jpeg({ quality: 85 }).toFile(outPath);
}

// Foto kegiatan TIDAK dipotong persegi: isinya sering suasana kelas, dan
// memotong tengah bisa membuang separuh anak di tepi frame. Rasio asli
// dipertahankan, hanya sisi terpanjang yang dibatasi.
// rotate() tanpa argumen membaca orientasi EXIF — foto dari HP miring kalau
// tidak diputar lebih dulu.
async function saveFotoKegiatan(buffer, outPath, { width = 1280, quality = 82 } = {}) {
  await sharp(buffer)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toFile(outPath);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

module.exports = { uploadImage, saveSquareJpeg, saveFotoKegiatan, ensureDir };
