const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs');

const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, f, cb) => cb(null, f.mimetype.startsWith('image/'))
});

async function saveSquareJpeg(buffer, outPath) {
  await sharp(buffer)
    .resize(400, 400, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 85 })
    .toFile(outPath);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

module.exports = { uploadImage, saveSquareJpeg, ensureDir };
