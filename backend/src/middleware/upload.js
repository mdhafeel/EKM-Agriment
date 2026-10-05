const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOAD_DIR = process.env.UPLOAD_DIR
  || (process.env.RENDER ? '/var/data/uploads' : path.join(__dirname, '../../uploads'));
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const subDir = req.uploadSubDir || 'misc';
    const dir = path.join(UPLOAD_DIR, subDir);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.xlsx', '.csv'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) cb(null, true);
  else cb(new Error('File type not allowed'), false);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

module.exports = upload;
