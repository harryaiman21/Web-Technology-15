import fs from "fs";
import path from "path";

import Incident from "../models/Incident.model.js";
import { broadcast } from "./liveStream.service.js";
import { saveAttachmentForIncident } from "../utils/attachment-storage.js";

const WATCH_ATTACHMENTS_DIR = process.env.NEXUS_WATCH_FOLDER
  ? path.join(process.env.NEXUS_WATCH_FOLDER, "attachments")
  : "C:\\NEXUS_Watch\\attachments";

const ALLOWED_EXTS = new Set([".jpg", ".jpeg", ".png", ".pdf", ".docx", ".webp"]);

const MIME_BY_EXT = {
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png":  "image/png",
  ".webp": "image/webp",
  ".pdf":  "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

// Mirror of the regex `nexus_rpa.cs` uses when sanitising the email subject
// for filenames: Regex.Replace(subject, "[^a-zA-Z0-9]", "_").
function safeSubject(subject) {
  return String(subject || "").replace(/[^a-zA-Z0-9]/g, "_");
}

/**
 * Scan the RPA attachment folder for files staged with the same subject prefix
 * as this email. For each match: save as an Attachment (which auto-OCRs images
 * via Claude Vision), and append the extracted text to the incident's rawInput
 * so the AI pipeline sees the photo content.
 *
 * Best-effort: failures are logged and never throw to the caller, since this
 * runs after a 202 response has already been sent.
 */
export async function linkRpaAttachmentsToIncident({ incidentId, subject }) {
  try {
    if (!fs.existsSync(WATCH_ATTACHMENTS_DIR)) return;
    const prefix = safeSubject(subject);
    if (!prefix) return;

    const all = await fs.promises.readdir(WATCH_ATTACHMENTS_DIR);
    const matching = all.filter((name) => {
      // Files staged by nexus_rpa.cs are named `{prefix}_{timestamp}_{originalName}{ext}`
      if (!name.toLowerCase().startsWith(prefix.toLowerCase() + "_")) return false;
      const ext = path.extname(name).toLowerCase();
      return ALLOWED_EXTS.has(ext);
    });

    if (matching.length === 0) return;

    const enrichedTextChunks = [];
    let savedCount = 0;
    let skippedCount = 0;

    for (const fileName of matching) {
      const fullPath = path.join(WATCH_ATTACHMENTS_DIR, fileName);
      try {
        const stat = await fs.promises.stat(fullPath);
        if (!stat.isFile() || stat.size === 0) { skippedCount++; continue; }

        const buffer = await fs.promises.readFile(fullPath);
        const ext = path.extname(fileName).toLowerCase();
        const mimetype = MIME_BY_EXT[ext] || "application/octet-stream";

        const attachment = await saveAttachmentForIncident({
          incidentId,
          file: { buffer, originalname: fileName, mimetype, size: stat.size },
          rpaSourcePath: fullPath,
        });

        savedCount++;

        // If Vision OCR pulled structured fields, append them to the incident's
        // rawInput so the classifier picks them up.
        if (attachment.extractedText) {
          enrichedTextChunks.push(
            `\n\n=== EVIDENCE: ${fileName} (Vision OCR) ===\n${attachment.extractedText}`,
          );
        }
      } catch (innerErr) {
        console.warn(`[rpaAttachmentLinker] skipping ${fileName}: ${innerErr.message}`);
        skippedCount++;
      }
    }

    // Patch the incident's rawInput with the extracted text so the AI agents
    // re-running (or the human reviewer) see the photo content.
    if (enrichedTextChunks.length > 0) {
      const update = { $push: {} };
      const inc = await Incident.findById(incidentId).select("rawInput").lean();
      const newRaw = (inc?.rawInput || "") + enrichedTextChunks.join("");
      await Incident.findByIdAndUpdate(incidentId, { rawInput: newRaw });
    }

    broadcast({
      type: "rpa_attachments_linked",
      incidentId: String(incidentId),
      saved: savedCount,
      skipped: skippedCount,
      hasOcrText: enrichedTextChunks.length > 0,
      message: `${savedCount} attachment${savedCount !== 1 ? "s" : ""} linked to incident via Vision OCR`,
    });
  } catch (err) {
    console.error("[rpaAttachmentLinker]", err.message);
  }
}
