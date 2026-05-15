import fs from "fs";
import path from "path";

import { Router } from "express";
import mongoose from "mongoose";

import { requireAuth } from "../middleware/auth.middleware.js";
import { upload, handleUploadError } from "../middleware/upload.middleware.js";
import Attachment from "../models/Attachment.model.js";
import Incident from "../models/Incident.model.js";
import { saveAttachmentForIncident } from "../utils/attachment-storage.js";
import { extractTextFromBuffer } from "../utils/extractor.js";

const router = Router();

function parseSingleFile(req, res, next) {
  return upload.single("file")(req, res, (error) => {
    if (error) {
      return handleUploadError(error, req, res, next);
    }

    return next();
  });
}

router.post("/extract", requireAuth, parseSingleFile, async (req, res) => {
  if (!req.file) {
    return res
      .status(400)
      .json({ error: 'No file was uploaded. Include the file as multipart field "file".' });
  }

  try {
    const text = await extractTextFromBuffer(req.file);

    return res.status(200).json({
      text,
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
    });
  } catch (error) {
    console.error("[POST /attachments/extract]", error.message);
    return res
      .status(error.status || 500)
      .json({ error: error.message || "Failed to extract text from file." });
  }
});

// ── GET /api/v1/incidents/attachments/by-incident/:incidentId ─────────────
// List all attachments for a given incident (metadata + OCR fields, no bytes).
router.get("/by-incident/:incidentId", requireAuth, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.incidentId)) {
    return res.status(400).json({ error: "Invalid incident ID." });
  }
  try {
    const attachments = await Attachment.find({ incidentId: req.params.incidentId })
      .sort({ uploadedAt: -1 })
      .lean();
    return res.status(200).json({
      attachments: attachments.map((a) => ({
        id: String(a._id),
        filename: a.filename,
        originalName: a.originalName,
        mimetype: a.mimetype,
        size: a.size,
        uploadedAt: a.uploadedAt,
        extractedText: a.extractedText || null,
        extractedFields: a.extractedFields || null,
        visionModel: a.visionModel || null,
        // URL the frontend can use to render the actual image bytes
        fileUrl: `/api/v1/incidents/attachments/${a._id}/file`,
        rpaSourcePath: a.rpaSourcePath || null,
      })),
    });
  } catch (error) {
    console.error("[GET /attachments/by-incident]", error.message);
    return res.status(500).json({ error: "Failed to list attachments." });
  }
});

// ── GET /api/v1/incidents/attachments/:id/file ────────────────────────────
// Stream the raw bytes of a saved attachment. NO auth — files are referenced
// by an unguessable MongoDB ObjectId, and the endpoint must be reachable from
// <img> tags which can't carry the SameSite=strict auth cookie cross-origin.
// Add signed-URL or session-token auth before deploying to prod.
router.get("/:id/file", async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid attachment ID." });
  }
  try {
    const attachment = await Attachment.findById(req.params.id).lean();
    if (!attachment) {
      return res.status(404).json({ error: "Attachment not found." });
    }
    const onDisk = attachment.storagePath;
    if (!onDisk || !fs.existsSync(onDisk)) {
      return res.status(404).json({ error: "Attachment file is missing on disk." });
    }
    const safeMime = attachment.mimetype || "application/octet-stream";
    res.setHeader("Content-Type", safeMime);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${path.basename(attachment.originalName || attachment.filename)}"`,
    );
    // Override Helmet's default `same-origin` CORP so cross-port <img> tags
    // from the dev frontend (localhost:5173) can load the bytes from the API
    // (localhost:3001) without ERR_BLOCKED_BY_RESPONSE.NotSameOrigin.
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    return fs.createReadStream(onDisk).pipe(res);
  } catch (error) {
    console.error("[GET /attachments/:id/file]", error.message);
    return res.status(500).json({ error: "Failed to stream attachment." });
  }
});

router.post("/:id", requireAuth, parseSingleFile, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: "Invalid incident ID." });
  }

  if (!req.file) {
    return res.status(400).json({ error: "No file was uploaded." });
  }

  try {
    const incident = await Incident.findById(req.params.id);

    if (!incident) {
      return res.status(404).json({ error: "Incident not found." });
    }

    const attachment = await saveAttachmentForIncident({
      incidentId: incident._id,
      file: req.file,
      uploadedBy: req.user.id,
    });

    return res.status(201).json({ attachment });
  } catch (error) {
    console.error("[POST /attachments/:id]", error.message);
    return res.status(500).json({ error: "Failed to save attachment." });
  }
});

export default router;
