import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";

import Attachment from "../models/Attachment.model.js";
import { extractFromImage } from "../services/vision.service.js";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

function buildStoredFilename(originalName) {
  const extension = path.extname(originalName || "").slice(0, 16);
  return `${Date.now()}-${randomUUID()}${extension}`;
}

function isImageMime(mimetype) {
  return /^image\/(png|jpe?g|webp|gif)$/i.test(String(mimetype || ""));
}

/**
 * Save a file as an Attachment for an incident.
 * If the file is an image, ALSO run Claude Vision OCR and persist the
 * extracted text + structured fields on the same document so the Detail
 * page can render them without re-running OCR.
 *
 * @param {object} params
 * @param {string} params.incidentId
 * @param {{ buffer: Buffer, originalname: string, mimetype: string, size: number }} params.file
 * @param {string} [params.uploadedBy]
 * @param {string} [params.rpaSourcePath]  Original on-disk path if file came from RPA
 */
export async function saveAttachmentForIncident({ incidentId, file, uploadedBy, rpaSourcePath = null }) {
  const filename = buildStoredFilename(file.originalname);
  const storagePath = path.join(UPLOADS_DIR, filename);

  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  await fs.writeFile(storagePath, file.buffer);

  // ── Vision OCR (image attachments only) ──────────────────────────────
  // Best-effort: a vision provider failure must not block attachment save,
  // so we wrap and continue.
  let extractedText = null;
  let extractedFields = null;
  let visionModel = null;

  if (isImageMime(file.mimetype)) {
    try {
      const ocr = await extractFromImage(file.buffer, {
        mimeType: file.mimetype,
        filename: file.originalname,
      });
      extractedText = ocr.text || null;
      extractedFields = ocr.fields || null;
      visionModel = ocr.model || null;
    } catch (err) {
      console.warn("[attachment-storage] vision OCR failed (non-fatal):", err.message);
    }
  }

  return Attachment.create({
    incidentId,
    filename,
    originalName: file.originalname,
    mimetype: file.mimetype,
    storagePath,
    size: file.size,
    uploadedBy: uploadedBy || null,
    extractedText,
    extractedFields,
    visionModel,
    rpaSourcePath,
  });
}
