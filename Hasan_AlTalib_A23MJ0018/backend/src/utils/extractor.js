// extractor.js — all parsing operates on in-memory Buffers (req.file.buffer)
// pdf-parse (v1) and mammoth are CommonJS packages; load them safely via
// createRequire to avoid ESM "no default export" errors in "type":"module" projects.

import { createRequire } from 'module';

import { extractFromImage } from '../services/vision.service.js';

const require = createRequire(import.meta.url);

// Lazy-load so startup doesn't block if optional deps are missing
let _pdfParse;
let _mammoth;

function getPdfParse() {
  if (!_pdfParse) {
    const mod = require('pdf-parse');
    // pdf-parse v1 exports the parse function directly as module.exports
    _pdfParse = typeof mod === 'function' ? mod : mod.default;
    if (typeof _pdfParse !== 'function') {
      throw new Error('pdf-parse did not export a callable function. Check the installed version.');
    }
  }
  return _pdfParse;
}

function getMammoth() {
  if (!_mammoth) {
    _mammoth = require('mammoth');
  }
  return _mammoth;
}

/**
 * Extracts plain text from a multer memory-storage file object.
 * @param {{ buffer: Buffer, mimetype: string, originalname: string }} file
 * @returns {Promise<string>}
 */
export async function extractTextFromBuffer(file) {
  const { buffer, mimetype, originalname } = file;

  if (!buffer || buffer.length === 0) {
    const err = new Error('Received an empty file buffer — file may be corrupt or empty.');
    err.status = 400;
    throw err;
  }

  try {
    switch (mimetype) {
      case 'text/plain': {
        const text = buffer.toString('utf8').trim();
        if (!text) {
          return `[Text file "${originalname}" appears to be empty]`;
        }
        return text;
      }

      case 'application/pdf': {
        const pdfParse = getPdfParse();
        const data = await pdfParse(buffer);
        const text = (data.text || '').trim();
        if (!text) {
          return `[PDF "${originalname}" contains no selectable text — may be a scanned image]`;
        }
        return text;
      }

      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
        const mammoth = getMammoth();
        const result = await mammoth.extractRawText({ buffer });
        const text = (result.value || '').trim();
        if (!text) {
          return `[DOCX "${originalname}" appears to contain no text]`;
        }
        return text;
      }

      case 'image/jpeg':
      case 'image/png': {
        // Multimodal extraction via Gemini 2.0 Flash — pulls AWB, addresses,
        // hub, weight, declared value, damage description from parcel-label
        // photos and damage photos. Falls back to placeholder if GEMINI_API_KEY
        // is not configured.
        const result = await extractFromImage(buffer, {
          mimeType: mimetype,
          filename: originalname,
        });
        if (!result.text || result.text.startsWith('[Image ')) {
          // Either no provider configured, or extraction failed gracefully.
          return result.text;
        }
        // Compose a descriptive prefix so downstream classifiers know this
        // text came from an image, not a typed report.
        return [
          `=== IMAGE OCR (${result.model}) — ${originalname} ===`,
          result.text,
        ].join('\n');
      }

      default: {
        const err = new Error(`Unsupported MIME type: ${mimetype}`);
        err.status = 415;
        throw err;
      }
    }
  } catch (err) {
    // If we threw it ourselves (with .status), rethrow directly
    if (err.status) throw err;

    // Otherwise wrap library errors with context
    console.error(`[Extractor] Failed on "${originalname}" (${mimetype}):`, err.message);
    const wrapped = new Error(`Could not extract text from "${originalname}": ${err.message}`);
    wrapped.status = 422;
    throw wrapped;
  }
}
