import multer from 'multer';

const allowedMimeTypes = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/jpeg',
  'image/png',
];

const fileFilter = (req, file, cb) => {
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      Object.assign(new Error(`File type not allowed: ${file.mimetype}. Allowed: PDF, DOCX, TXT, JPEG, PNG.`), {
        status: 415,
      })
    );
  }
};

// Memory storage — buffer is available as req.file.buffer, no disk writes
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter,
});

// Call this after upload.single() to return a clean 400/415 on multer errors
export function handleUploadError(err, req, res, next) {
  if (err) {
    const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 400);
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'File is too large. Maximum size is 10 MB.'
        : err.message || 'File upload error.';
    return res.status(status).json({ error: message });
  }
  next();
}
