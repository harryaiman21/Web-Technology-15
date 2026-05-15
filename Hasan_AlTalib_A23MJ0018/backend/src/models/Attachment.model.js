import mongoose from "mongoose";

const attachmentSchema = new mongoose.Schema({
  incidentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Incident",
    required: true,
  },
  filename: {
    type: String,
    required: true,
    trim: true,
  },
  originalName: {
    type: String,
    trim: true,
  },
  mimetype: {
    type: String,
    trim: true,
  },
  storagePath: {
    type: String,
    trim: true,
  },
  size: {
    type: Number,
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
  // ── Vision OCR enrichment ──────────────────────────────────────────────
  // Populated by attachment-storage.js when an image is saved (Claude Vision).
  // Stored on the document so the Detail page can render the structured
  // breakdown without re-OCR'ing the file each time it's viewed.
  extractedText: {
    type: String,
    default: null,
  },
  extractedFields: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  visionModel: {
    type: String,
    default: null,
  },
  // For RPA-ingested attachments — the original RPA path on disk before
  // promotion into /uploads. Useful for audit and debugging.
  rpaSourcePath: {
    type: String,
    default: null,
  },
});

attachmentSchema.index({ incidentId: 1, uploadedAt: -1 });

const Attachment =
  mongoose.models.Attachment || mongoose.model("Attachment", attachmentSchema);

export default Attachment;
