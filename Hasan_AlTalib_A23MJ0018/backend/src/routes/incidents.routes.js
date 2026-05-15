import { Router } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import multer from "multer";

import { runPipeline } from "../agents/orchestrator.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { requireRpaAuth } from "../middleware/rpaAuth.middleware.js";
import { handleUploadError } from "../middleware/upload.middleware.js";
import AuditLog from "../models/AuditLog.model.js";
import FeedbackDatasetEntry from "../models/FeedbackDatasetEntry.model.js";
import Incident from "../models/Incident.model.js";
import OutboundEmail from "../models/OutboundEmail.model.js";
import RpaRunItem from "../models/RpaRunItem.model.js";
import TrainingCandidate from "../models/TrainingCandidate.model.js";
import { callAI } from "../config/callAI.js";
import { buildFeedbackEntry } from "../services/feedbackExport.service.js";
import { getSimilarResolvedIncidents } from "../services/caseMemory.service.js";
import { assessDamagePhoto } from "../services/damageAssessment.service.js";
import { explainClassification } from "../services/fastapi.service.js";
import * as sseService from "../services/sse.service.js";
import { sendEmail } from "../services/email.service.js";
import { deriveUncertaintyFromIncident } from "../services/uncertainty.service.js";
import { scheduleFollowUp, deriveApproach, APPROACH_LABELS } from "../services/followUp.service.js";
import { embedResolvedIncident } from "../services/autoEmbed.service.js";
import { broadcast as broadcastLive } from "../services/liveStream.service.js";
import { upsertOnIntake, getProfile } from "../services/customerProfile.service.js";
import { normalizeIncidentType } from "../utils/normalizeIncidentType.js";
import { saveAttachmentForIncident } from "../utils/attachment-storage.js";
import { linkRpaAttachmentsToIncident } from "../services/rpaAttachmentLinker.service.js";
import { broadcastIncidentUpdate } from "../services/liveStream.service.js";
import { downloadDriveFile, isDriveEnabled } from "../services/googleDrive.service.js";
import { extractTextFromBuffer } from "../utils/extractor.js";
import attachmentsRoutes from "./attachments.routes.js";

const router = Router();

router.use("/attachments", attachmentsRoutes);

const TRANSITIONS = {
  DRAFT: ["PENDING_REVIEW"],
  PENDING_REVIEW: ["UNDER_REVIEW", "DRAFT"],
  UNDER_REVIEW: ["ASSIGNED", "DRAFT"],
  ASSIGNED: ["IN_PROGRESS"],
  IN_PROGRESS: ["RESOLVED"],
  RESOLVED: ["CLOSED", "PENDING_REVIEW"],
};

const REVIEWER_ONLY = new Set([
  "PENDING_REVIEW:UNDER_REVIEW",
  "PENDING_REVIEW:DRAFT",
  "UNDER_REVIEW:ASSIGNED",
  "UNDER_REVIEW:DRAFT",
  "ASSIGNED:IN_PROGRESS",
  "IN_PROGRESS:RESOLVED",
  "RESOLVED:CLOSED",
  "RESOLVED:PENDING_REVIEW",
]);

const incidentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 2 },
  fileFilter: (req, file, cb) => {
    const allowedFileMimeTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "image/jpeg",
      "image/png",
    ];

    if (file.fieldname === "photo") {
      if (["image/jpeg", "image/png"].includes(file.mimetype)) {
        cb(null, true);
        return;
      }

      cb(
        Object.assign(new Error(`Photo type not allowed: ${file.mimetype}. Allowed: JPEG, PNG.`), {
          status: 415,
        }),
      );
      return;
    }

    if (file.fieldname === "file" && allowedFileMimeTypes.includes(file.mimetype)) {
      cb(null, true);
      return;
    }

    cb(
      Object.assign(new Error(`File type not allowed: ${file.mimetype}.`), {
        status: 415,
      }),
    );
  },
});

function requireAuthOrRpa(req, res, next) {
  if (req.get("X-API-Key")) {
    return requireRpaAuth(req, res, next);
  }

  return requireAuth(req, res, next);
}

function parseIncidentUpload(req, res, next) {
  if (!req.is("multipart/form-data")) {
    return next();
  }

  return incidentUpload.fields([
    { name: "file", maxCount: 1 },
    { name: "photo", maxCount: 1 },
  ])(req, res, (error) => {
    if (error) {
      return handleUploadError(error, req, res, next);
    }

    return next();
  });
}

function normalizeFieldValue(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function buildExplainText(incident) {
  const description = normalizeFieldValue(
    incident.description ||
      incident.agentResults?.intake?.fields?.description?.value ||
      incident.rawInput,
  );
  const location = normalizeFieldValue(
    incident.location ||
      incident.agentResults?.request?.location ||
      incident.agentResults?.intake?.fields?.location?.value,
  );
  const severity = normalizeFieldValue(
    incident.severity || incident.agentResults?.classifier?.fields?.severity?.value,
  );
  const date = normalizeFieldValue(incident.agentResults?.intake?.fields?.date?.value);

  return [description, location && `Location: ${location}`, severity && `Severity: ${severity}`, date && `Date: ${date}`]
    .filter(Boolean)
    .join(". ");
}

function buildResolutionNote(incident) {
  if (typeof incident?.resolutionNote === "string" && incident.resolutionNote.trim()) {
    return incident.resolutionNote.trim();
  }

  const steps = incident?.agentResults?.resolution?.steps;
  if (Array.isArray(steps) && typeof steps[0] === "string" && steps[0].trim()) {
    return steps[0].trim();
  }

  return "Our team has completed the resolution steps for this case.";
}

// ── POST /analyze-photo — standalone vision analysis, no incident created ────
// Returns pre-filled form fields from Claude Vision analysis of a damage photo.
// Used by the IntakeHub to pre-populate the incident form before submission.
router.post(
  "/analyze-photo",
  requireAuthOrRpa,
  (req, res, next) => incidentUpload.single("photo")(req, res, (err) => err ? handleUploadError(err, req, res, next) : next()),
  async (req, res) => {
    const photoFile = req.file || null;
    if (!photoFile) return res.status(400).json({ error: "No photo provided" });

    try {
      const assessment = await assessDamagePhoto({
        buffer: photoFile.buffer,
        mimetype: photoFile.mimetype,
        description: req.body?.description || "",
      });

      if (!assessment) return res.status(422).json({ error: "Vision analysis produced no result" });

      const { severityScore = 3 } = assessment.photoAnalysis || {};
      let severity = "Medium";
      if (severityScore >= 4.5) severity = "Critical";
      else if (severityScore >= 3.5) severity = "High";
      else if (severityScore <= 1.5) severity = "Low";

      const { damageType = "other", affectedAreas = [], packagingCondition = "compromised" } =
        assessment.photoAnalysis || {};
      const autoDescription = [
        `Parcel damage detected: ${damageType.replace(/_/g, " ")}.`,
        affectedAreas.length ? `Affected areas: ${affectedAreas.join(", ")}.` : "",
        `Packaging condition: ${packagingCondition}.`,
        assessment.consistencyCheck?.recommendation || "",
      ].filter(Boolean).join(" ");

      return res.json({
        type: "damaged_parcel",
        severity,
        description: autoDescription,
        damageAssessment: assessment,
      });
    } catch (err) {
      console.error("[analyze-photo]", err.message);
      if (err.message?.includes("ANTHROPIC_API_KEY")) {
        return res.status(503).json({ error: "Vision analysis requires Claude — add ANTHROPIC_API_KEY to your environment." });
      }
      return res.status(500).json({ error: "Vision analysis error" });
    }
  },
);

// ── POST /ingest-email — dedicated RPA email ingestion endpoint ───────────────
// UiPath calls this once per email read from the Gmail inbox.
// Accepts clean JSON — no multipart needed.
// Auto-creates RpaRunItem for lineage so the batch report is accurate.
//
// Body: { from, subject, body, receivedAt?, awbNumber?, language?, rpaRunId? }
// Auth: X-API-Key
router.post("/ingest-email", requireRpaAuth, async (req, res) => {
  try {
    const {
      from: fromEmail = "",
      subject         = "",
      body: emailBody = "",
      receivedAt,
      awbNumber       = "",
      language        = "en",
      rpaRunId        = null,
      attachmentRefs    = [],
      attachmentsInline = [],
    } = req.body || {};

    const allowlist = (process.env.RPA_FROM_ALLOWLIST || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (allowlist.length > 0) {
      const fromLower = (fromEmail || "").toLowerCase();
      const allowed = allowlist.some((entry) =>
        entry.startsWith("@") ? fromLower.endsWith(entry) : fromLower === entry
      );
      if (!allowed) {
        return res.status(202).json({
          skipped: true,
          reason: "from address not in allowlist",
          from: fromEmail,
        });
      }
    }

    const effectiveBody = (emailBody && emailBody.trim().length >= 10)
      ? emailBody.trim()
      : (subject && subject.trim().length >= 10 ? subject.trim() : "");
    if (!effectiveBody) {
      return res.status(400).json({
        error: "body and subject both empty or under 10 characters",
      });
    }

    // Build rawInput that preserves email metadata for the pipeline agents
    const rawInput = [
      fromEmail  ? `From: ${fromEmail}`   : null,
      subject    ? `Subject: ${subject}`  : null,
      receivedAt ? `Date: ${receivedAt}`  : null,
      "",
      effectiveBody,
    ].filter(v => v !== null).join("\n");

    const detectedLanguage = ["en", "ms"].includes(language) ? language : "en";

    const incident = await Incident.create({
      rawInput,
      description:     effectiveBody,
      status:          "DRAFT",
      source:          "rpa",
      customerEmail:   fromEmail || null,
      awbNumber:       awbNumber || null,
      detectedLanguage,
      agentResults: {
        request: {
          customerEmail: fromEmail || null,
          awbNumber:     awbNumber || null,
          emailSubject:  subject   || null,
        },
      },
    });

    // Respond immediately — pipeline runs async
    res.status(202).json({
      incidentId: incident._id.toString(),
      streamUrl:  `/api/v1/incidents/${incident._id}/stream`,
    });

    // Live-broadcast the new card so the Board can animate it into Incoming
    broadcastIncidentUpdate(incident, "incident_created");

    // Upsert customer profile KB on intake (non-blocking)
    if (fromEmail) {
      upsertOnIntake(fromEmail, incident).catch((err) =>
        console.error("[ingest-email][customer-profile]", err.message)
      );
    }

    // ── Cloud + Local enrichment, then pipeline ─────────────────────────
    // Two paths can produce attachments before the pipeline runs:
    //   1. Cloud Dispatcher (Studio Web): sends `attachmentRefs` array of
    //      Google Drive file IDs. We download each, save as Attachment,
    //      run Vision OCR on images, append extracted text to rawInput.
    //   2. Local UiPath (legacy): drops files in C:\NEXUS_Watch\attachments\
    //      with the email subject as filename prefix. linkRpaAttachmentsToIncident
    //      scans that folder and does the same enrichment. Skipped on cloud
    //      deployments where the folder doesn't exist.
    (async () => {
      try {
        // Path 1: Cloud Drive attachments
        if (Array.isArray(attachmentRefs) && attachmentRefs.length > 0 && isDriveEnabled()) {
          for (const ref of attachmentRefs) {
            if (!ref || !ref.fileId) continue;
            try {
              const downloaded = await downloadDriveFile(ref.fileId);
              if (!downloaded) continue;
              await saveAttachmentForIncident({
                incidentId: incident._id,
                file: {
                  buffer:       downloaded.buffer,
                  originalname: ref.name || downloaded.name,
                  mimetype:     ref.mimeType || downloaded.mimetype,
                  size:         downloaded.size,
                },
                rpaSourcePath: `drive://${ref.fileId}`,
              });
            } catch (innerErr) {
              console.warn(`[ingest-email][drive] skipping ${ref.fileId}: ${innerErr.message}`);
            }
          }
        }

        if (Array.isArray(attachmentsInline) && attachmentsInline.length > 0) {
          for (const att of attachmentsInline) {
            if (!att || !att.contentBase64) continue;
            try {
              const buffer = Buffer.from(att.contentBase64, "base64");
              if (!buffer.length) continue;
              await saveAttachmentForIncident({
                incidentId: incident._id,
                file: {
                  buffer,
                  originalname: att.name || `inline_${Date.now()}`,
                  mimetype:     att.mimeType || "application/octet-stream",
                  size:         buffer.length,
                },
                rpaSourcePath: `inline://${att.name || "attachment"}`,
              });
            } catch (innerErr) {
              console.warn(`[ingest-email][inline] skipping ${att.name}: ${innerErr.message}`);
            }
          }
        }

        // Path 2: Legacy local watch folder (no-op on cloud deployments)
        if (subject) {
          await linkRpaAttachmentsToIncident({
            incidentId: incident._id.toString(),
            subject,
          }).catch(() => {}); // silently skip on cloud where folder doesn't exist
        }

        // Re-fetch rawInput so the pipeline sees the OCR-augmented text.
        // saveAttachmentForIncident triggered Vision OCR on each image,
        // and the linker (if it ran) appended OCR text. Combine them.
        const fresh = await Incident.findById(incident._id).select("rawInput").lean();

        // For the cloud path we additionally append the Vision-extracted
        // text from each attachment to rawInput here, since
        // saveAttachmentForIncident persists OCR on the Attachment doc but
        // doesn't write back to Incident.rawInput.
        let finalRaw = fresh?.rawInput || rawInput;
        const hasCloudAttachments =
          (Array.isArray(attachmentRefs) && attachmentRefs.length > 0) ||
          (Array.isArray(attachmentsInline) && attachmentsInline.length > 0);
        if (hasCloudAttachments) {
          const Attachment = (await import("../models/Attachment.model.js")).default;
          const atts = await Attachment.find({
            incidentId: incident._id,
            extractedText: { $ne: null },
          }).select("originalName extractedText").lean();
          if (atts.length > 0) {
            const ocrChunks = atts.map(
              (a) => `\n\n=== EVIDENCE: ${a.originalName} (Vision OCR) ===\n${a.extractedText}`,
            );
            finalRaw = finalRaw + ocrChunks.join("");
            await Incident.findByIdAndUpdate(incident._id, { rawInput: finalRaw });
          }
        }

        await runPipeline(incident._id.toString(), finalRaw);
      } catch (err) {
        console.error("[ingest-email] enrich+pipeline crash:", err.message);
      }
    })();

    // Record lineage item so the RPA run report is accurate
    if (rpaRunId) {
      RpaRunItem.create({
        rpaRunId,
        filename:   subject || fromEmail || "email",
        incidentId: incident._id.toString(),
        outcome:    "created",
        severity:   null,
        location:   null,
      }).catch(() => {});
    }
  } catch (err) {
    console.error("[ingest-email]", err.message);
    return res.status(500).json({ error: "Failed to ingest email" });
  }
});

router.post("/", requireAuthOrRpa, parseIncidentUpload, async (req, res) => {
  const incidentFile = req.files?.file?.[0] || null;
  const photoFile = req.files?.photo?.[0] || null;
  let incidentText = typeof req.body?.text === "string" ? req.body.text.trim() : "";

  if (!incidentText && typeof req.body?.description === "string") {
    incidentText = req.body.description.trim();
  }

  try {
    const normalizedType =
      typeof req.body?.type === "string" && req.body.type.trim()
        ? normalizeIncidentType(req.body.type)
        : undefined;

    if (photoFile && photoFile.size > 5 * 1024 * 1024) {
      return res.status(413).json({ error: "Photo is too large. Maximum size is 5 MB." });
    }

    if (incidentFile) {
      incidentText = incidentText || (await extractTextFromBuffer(incidentFile)).trim();
    }

    if (!incidentText || incidentText.length < 10) {
      return res.status(400).json({ error: "Text must be at least 10 characters" });
    }

    const requestSeverity = ["Low", "Medium", "High", "Critical"].includes(req.body?.severity)
      ? req.body.severity
      : undefined;
    const requestLocation =
      typeof req.body?.location === "string" ? req.body.location.trim() : "";
    const batchDefer = String(req.body?.batchDefer || "").toLowerCase() === "true";

    // RPA v3.0 enriched metadata
    const awbNumber = typeof req.body?.awbNumber === "string" ? req.body.awbNumber.trim() : "";
    const detectedLanguage = ["en", "ms"].includes(req.body?.detectedLanguage)
      ? req.body.detectedLanguage
      : "en";
    const rawSentimentScore = parseFloat(req.body?.sentimentScore);
    const sentimentScore = !isNaN(rawSentimentScore) ? rawSentimentScore : undefined;
    const sentimentLabel = ["positive", "neutral", "frustrated", "very_frustrated"].includes(
      req.body?.sentimentLabel
    )
      ? req.body.sentimentLabel
      : undefined;
    const customerHistoryCount = parseInt(req.body?.customerHistoryCount, 10) || 0;
    const isRepeatCustomer = String(req.body?.isRepeatCustomer || "").toLowerCase() === "true";
    const lastCaseType =
      typeof req.body?.lastCaseType === "string" ? req.body.lastCaseType.trim() : "";
    const customerEmail =
      typeof req.body?.customerEmail === "string" ? req.body.customerEmail.trim() : "";

    const incident = await Incident.create({
      rawInput: incidentText,
      description: incidentText,
      status: "DRAFT",
      source: req.rpaAuth ? "rpa" : "manual",
      createdBy: req.user?.id || null,
      holdForReview: false,
      rejectionReason: null,
      ...(normalizedType ? { type: normalizedType } : {}),
      ...(requestSeverity ? { severity: requestSeverity } : {}),
      ...(customerEmail ? { customerEmail } : {}),
      ...(awbNumber ? { awbNumber } : {}),
      detectedLanguage,
      ...(sentimentScore !== undefined ? { sentimentScore } : {}),
      ...(sentimentLabel ? { sentimentLabel } : {}),
      customerHistoryCount,
      isRepeatCustomer,
      ...(lastCaseType ? { lastCaseType } : {}),
      agentResults: {
        request: {
          ...(normalizedType ? { type: normalizedType } : {}),
          ...(requestSeverity ? { severity: requestSeverity } : {}),
          ...(requestLocation ? { location: requestLocation } : {}),
          ...(batchDefer ? { batchDefer: true } : {}),
          ...(customerEmail ? { customerEmail } : {}),
          ...(awbNumber ? { awbNumber } : {}),
        },
      },
    });

    let attachment = null;

    if (incidentFile) {
      try {
        attachment = await saveAttachmentForIncident({
          incidentId: incident._id,
          file: incidentFile,
          uploadedBy: req.user?.id || null,
        });
      } catch (attachmentError) {
        await Incident.findByIdAndDelete(incident._id).catch(() => null);
        throw attachmentError;
      }
    }

    // ── Enrich rawInput with Vision-OCR text from the saved attachment ─────
    // Without this, the classifier only sees what the user typed. If the user
    // typed gibberish but uploaded a damaged-parcel photo, the AI misses the
    // damage signal and falls back to "other" / "Low". By appending the OCR
    // extraction (AWB, hub, damageVisible, rawText) to rawInput BEFORE the
    // pipeline runs, the photo content actually drives classification.
    let pipelineInput = incidentText;
    if (attachment?.extractedText) {
      pipelineInput = `${incidentText}\n\n=== IMAGE EVIDENCE (Vision OCR) ===\n${attachment.extractedText}`;
      try {
        await Incident.findByIdAndUpdate(incident._id, { rawInput: pipelineInput });
      } catch (rawErr) {
        console.warn("[upload] rawInput enrich failed (non-fatal):", rawErr.message);
      }
    }

    res.status(202).json({
      incidentId: incident._id.toString(),
      streamUrl: `/api/v1/incidents/${incident._id}/stream`,
      ...(attachment ? { attachmentId: attachment._id.toString() } : {}),
    });

    // Live-broadcast the new card so the Board can animate it into Incoming
    broadcastIncidentUpdate(incident, "incident_created");

    // Upsert customer profile KB on intake (non-blocking)
    if (customerEmail) {
      upsertOnIntake(customerEmail, incident).catch((err) =>
        console.error("[upload][customer-profile]", err.message)
      );
    }

    // Fire pipeline and damage assessment concurrently — both async
    runPipeline(incident._id.toString(), pipelineInput).catch((error) =>
      console.error("[Pipeline crash]", error.message)
    );

    // Feature 4: async damage assessment — does NOT block 202
    if (photoFile) {
      (async () => {
        try {
          const assessment = await assessDamagePhoto({
            buffer: photoFile.buffer,
            mimetype: photoFile.mimetype,
            description: incidentText,
          });

          if (!assessment) return;

          const update = {
            damageAssessment: {
              ...assessment,
              photoUrl: photoFile.originalname || photoFile.fieldname || "uploaded_photo",
            },
            // Keep agentResults copy for backward compat with existing consumers
            "agentResults.damageAssessment": {
              ...assessment,
              photoUrl: photoFile.originalname || photoFile.fieldname || "uploaded_photo",
            },
          };

          // Apply HITL gate based on new consistencyCheck shape
          if (assessment.consistencyCheck?.score < 3 || assessment.consistencyCheck?.discrepancyDetected) {
            update.holdForReview = true;
            update.rejectionReason = assessment.consistencyCheck?.discrepancyReason || "Photo-text inconsistency detected";
          }

          await Incident.findByIdAndUpdate(incident._id, update);
          console.log(`[damageAssessment] saved for incident ${incident._id}`);
        } catch (err) {
          console.error("[damageAssessment async]", err.message);
        }
      })();
    }

    return;
  } catch (error) {
    console.error("[POST /incidents]", error.message);
    return res.status(500).json({ error: "Failed to create incident" });
  }
});


router.get("/pending-count", requireAuth, async (req, res) => {
  try {
    const filter =
      req.user.role === "reporter"
        ? {
            status: "PENDING_REVIEW",
            $or: [{ createdBy: req.user.id }, { source: "rpa" }],
          }
        : { status: "PENDING_REVIEW" };

    const count = await Incident.countDocuments(filter);

    return res.status(200).json({ count });
  } catch (error) {
    console.error("[GET /incidents/pending-count]", error.message);
    return res.status(500).json({ error: "Failed to count pending incidents" });
  }
});

router.get("/pending", requireAuth, requireRole("reviewer", "admin"), async (req, res) => {
  try {
    const incidents = await Incident.find({ status: "PENDING_REVIEW" })
      .sort({ createdAt: 1 })
      .lean();

    return res.status(200).json(
      incidents.map((incident) => ({
        ...incident,
        hitlReason: incident.rejectionReason || null,
      }))
    );
  } catch (error) {
    console.error("[GET /incidents/pending]", error.message);
    return res.status(500).json({ error: "Failed to fetch pending incidents" });
  }
});

// ── Feature E: Batch Review ───────────────────────────────────────────────────
// Must be declared BEFORE /:id/review so Express doesn't treat "batch-review"
// as a literal incident ID.
router.post("/batch-review", requireAuth, requireRole("reviewer", "admin"), async (req, res) => {
  try {
    const { ids, action, note: rawNote } = req.body || {};
    const note = typeof rawNote === "string" && rawNote.trim() ? rawNote.trim() : "";

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids must be a non-empty array" });
    }
    if (ids.length > 100) {
      return res.status(400).json({ error: "Maximum 100 incidents per batch" });
    }
    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ error: "action must be 'approve' or 'reject'" });
    }

    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length !== ids.length) {
      return res.status(400).json({ error: "One or more IDs are invalid" });
    }

    // Only act on incidents that are still PENDING_REVIEW
    const pending = await Incident.find({
      _id: { $in: validIds },
      status: "PENDING_REVIEW",
    }).lean();

    if (pending.length === 0) {
      return res.status(200).json({ approved: 0, rejected: 0, skipped: ids.length, ids: [] });
    }

    const nextStatus = action === "approve" ? "ASSIGNED" : "CLOSED";
    const actedIds = pending.map((inc) => inc._id);
    const now = new Date();

    // Single bulk update — fast
    await Incident.updateMany(
      { _id: { $in: actedIds } },
      {
        $set: {
          status: nextStatus,
          holdForReview: false,
          ...(action === "reject" && note ? { rejectionReason: note } : {}),
          ...(action === "approve" ? { rejectionReason: null } : {}),
        },
      },
    );

    // Audit logs in one insert
    const auditDocs = pending.map((inc) => ({
      incidentId: inc._id,
      actor: req.user.email,
      actorType: "human",
      action: "status_change",
      field: action === "approve" ? "batch_approved" : "batch_rejected",
      oldValue: inc.status,
      newValue: { status: nextStatus, note, by: req.user.email, batchSize: pending.length },
      timestamp: now,
    }));
    await AuditLog.insertMany(auditDocs);

    // Feedback entries — non-fatal
    try {
      const feedbackDocs = pending.map((inc) => buildFeedbackEntry(inc, action, note, req.user));
      await FeedbackDatasetEntry.insertMany(feedbackDocs, { ordered: false });
    } catch (feedbackErr) {
      console.error("[batch-review] feedback capture failed (non-fatal):", feedbackErr.message);
    }

    const count = pending.length;
    const skipped = ids.length - count;
    console.log(`[batch-review] ${action} ${count} incidents by ${req.user.email}`);
    return res.status(200).json({
      approved: action === "approve" ? count : 0,
      rejected: action === "reject" ? count : 0,
      skipped,
      ids: actedIds.map(String),
    });
  } catch (error) {
    console.error("[POST /incidents/batch-review]", error.message);
    return res.status(500).json({ error: "Batch review failed" });
  }
});

router.post("/:id/review", requireAuth, requireRole("reviewer", "admin"), async (req, res) => {
  try {
    const incident = await Incident.findById(req.params.id);

    if (!incident) {
      return res.status(404).json({ error: "Incident not found" });
    }

    if (incident.status !== "PENDING_REVIEW") {
      return res.status(400).json({ error: "Incident is not pending review" });
    }

    const action = req.body?.action;
    const note =
      typeof req.body?.note === "string" && req.body.note.trim() ? req.body.note.trim() : "";

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ error: "Action must be approve or reject" });
    }

    const nextStatus = action === "approve" ? "ASSIGNED" : "CLOSED";
    const updated = await Incident.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          status: nextStatus,
          holdForReview: false,
          rejectionReason: action === "approve" ? null : note || incident.rejectionReason || null,
        },
      },
      { new: true }
    )
      .populate("createdBy", "name email role")
      .populate("assignedTo", "name email role")
      .lean();

    await AuditLog.create({
      incidentId: incident._id,
      actor: req.user.email,
      actorType: "human",
      action: "status_change",
      field: action === "approve" ? "review_approved" : "review_rejected",
      oldValue: incident.status,
      newValue: {
        status: nextStatus,
        note,
        by: req.user.id,
      },
      timestamp: new Date(),
    });

    // W3: Capture feedback entry (non-fatal)
    try {
      const feedbackEntry = buildFeedbackEntry(incident, action, note, req.user);
      await FeedbackDatasetEntry.create(feedbackEntry);
    } catch (feedbackErr) {
      console.error("[review] feedback capture failed (non-fatal):", feedbackErr.message);
    }

    // Schedule follow-up when reviewer approves (ASSIGNED path)
    if (action === 'approve') {
      scheduleFollowUp(req.params.id).catch((err) =>
        console.error('[followUp][review] schedule failed (non-fatal):', err.message)
      );
    }

    // Embed CLOSED incidents into learning corpus (rejected HITL = valid training signal)
    if (action === 'reject' && updated) {
      embedResolvedIncident(req.params.id, updated).catch((err) =>
        console.error('[auto-embed][review-reject] non-fatal:', err.message)
      );
      broadcastLive({
        type: 'learning_event',
        action: 'absorbed',
        incidentId: req.params.id,
        incidentType: updated.type,
        location: updated.location || null,
        message: `NEXUS absorbed closed HITL incident — ${(updated.type || 'incident').replace(/_/g, ' ')}${updated.location ? ` at ${updated.location}` : ''} embedded into corpus`,
      });
    }

    return res.status(200).json({
      ...updated,
      hitlReason: updated.rejectionReason || null,
    });
  } catch (error) {
    console.error("[POST /incidents/:id/review]", error.message);
    return res.status(500).json({ error: "Failed to review incident" });
  }
});

router.post(
  "/:id/draft-message",
  requireAuth,
  requireRole("reviewer", "admin"),
  async (req, res) => {
    try {
      const incident = await Incident.findById(req.params.id).lean();

      if (!incident) {
        return res.status(404).json({ error: "Incident not found" });
      }

      const incidentId = incident._id.toString();
      const location =
        incident.location ||
        incident.agentResults?.request?.location ||
        incident.agentResults?.intake?.fields?.location?.value ||
        "Unknown location";
      const resolutionNote = buildResolutionNote(incident);
      const predictedClass =
        incident.agentResults?.shap?.predicted_class ||
        incident.agentResults?.shap?.predictedClass ||
        incident.type ||
        "other";
      const fallbackDraft = `Dear customer, your DHL case ${incidentId} has been resolved. Please contact us at 1300-888-DHL if you need assistance.`;

      try {
        const draft = await Promise.race([
          callAI({
            system: `You are a DHL customer service assistant.
Write a short, friendly, professional SMS/WhatsApp message
to send to a customer about their resolved incident.
Rules:
- Maximum 3 sentences
- Plain English, no technical jargon
- Do not promise specific dates or amounts
- Do not mention internal system names (NEXUS, LightGBM etc)
- Always include the incident reference number
- End with DHL contact if they need more help: 1300-888-DHL
- Tone: warm, helpful, reassuring
Respond with the message text only. No preamble.`,
            user: `Incident: ${predictedClass} at ${location}
Severity: ${incident.severity || "Medium"}
Resolution: ${resolutionNote}
Reference: ${incidentId}
Draft the customer message.`,
            maxTokens: 220,
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Draft message timeout")), 8000),
          ),
        ]);

        return res.status(200).json({
          draft: String(draft || "").trim() || fallbackDraft,
          incidentId,
        });
      } catch (error) {
        console.error("[POST /incidents/:id/draft-message]", error.message);
        return res.status(200).json({
          draft: fallbackDraft,
          incidentId,
        });
      }
    } catch (error) {
      console.error("[POST /incidents/:id/draft-message]", error.message);
      return res.status(500).json({ error: "Failed to draft customer message" });
    }
  },
);

// Notes route — see consolidated handler below (line ~1194)

router.get("/:id/similar", requireAuth, async (req, res) => {
  try {
    const incident = await Incident.findById(req.params.id).lean();

    if (!incident) {
      return res.status(404).json({ error: "Incident not found" });
    }

      const similar = await getSimilarResolvedIncidents(incident);
      return res.status(200).json(similar);
  } catch (error) {
    console.error("[GET /incidents/:id/similar]", error.message);
    return res.status(200).json([]);
  }
});

router.get("/:id/explain", requireAuthOrRpa, async (req, res) => {
  try {
    const incident = await Incident.findById(req.params.id).lean();

    if (!incident) {
      return res.status(404).json({ error: "Incident not found" });
    }

    const text = buildExplainText(incident);
    if (!text || text.length < 5) {
      return res.status(200).json({
        supported: false,
        predictedClass: incident.type || null,
        confidence: Number(incident.confidence || 0),
        topPositive: [],
        topNegative: [],
      });
    }

    const explanation = await explainClassification(text, 6);
    return res.status(200).json(explanation);
  } catch (error) {
    console.error("[GET /incidents/:id/explain]", error.message);
    return res.status(200).json({
      supported: false,
      predictedClass: null,
      confidence: 0,
      topPositive: [],
      topNegative: [],
    });
  }
});

// ── Feature D: Resolution outcome history ────────────────────────────────────
// Returns aggregate outcomes for resolved incidents of the same type, used by
// the OutcomeValidationCard on the Detail page before a reviewer approves.
router.get("/:id/outcome-history", requireAuth, async (req, res) => {
  try {
    const incident = await Incident.findById(req.params.id)
      .select("type severity location")
      .lean();

    if (!incident) {
      return res.status(404).json({ error: "Incident not found" });
    }

    const { type, severity } = incident;
    if (!type) {
      return res.status(200).json({ insufficient: true, reason: "Incident type not yet classified" });
    }

    const approach      = deriveApproach(type);
    const approachLabel = APPROACH_LABELS[approach] || "Standard Process";

    const similar = await Incident.find({
      _id:    { $ne: incident._id },
      type,
      status: { $in: ["RESOLVED", "CLOSED", "BREACHED"] },
    })
      .select("status severity followUp recoveryMessage updatedAt")
      .sort({ updatedAt: -1 })
      .limit(60)
      .lean();

    const sampleSize = similar.length;

    if (sampleSize < 3) {
      return res.status(200).json({
        insufficient:  true,
        sampleSize,
        approach,
        approachLabel,
        reason: `Only ${sampleSize} similar case${sampleSize !== 1 ? "s" : ""} found — insufficient history. Use your judgement.`,
      });
    }

    let satisfied = 0;
    let escalated = 0;
    let noResponse = 0;
    const recentCases = [];

    for (const s of similar) {
      let outcome;
      if (s.followUp?.outcome) {
        outcome = s.followUp.outcome;
      } else if (s.status === "BREACHED") {
        outcome = "escalated";
      } else if (s.status === "RESOLVED" || s.status === "CLOSED") {
        outcome = "satisfied";
      } else {
        outcome = "no_response";
      }

      if (outcome === "satisfied")   satisfied++;
      else if (outcome === "escalated") escalated++;
      else noResponse++;

      if (recentCases.length < 5) {
        recentCases.push({
          id:         s._id.toString(),
          outcome,
          severity:   s.severity || "Medium",
          resolvedAt: s.updatedAt,
          confirmed:  Boolean(s.followUp?.outcome),
        });
      }
    }

    const successRate = Math.round((satisfied / sampleSize) * 100);
    const confirmedCount = similar.filter((s) => s.followUp?.outcome).length;

    // Build warnings — check if current severity has a disproportionate failure rate
    const warnings = [];
    if (severity) {
      const sevSubset = similar.filter((s) => s.severity === severity);
      if (sevSubset.length >= 2) {
        const sevFailed = sevSubset.filter((s) => {
          const o = s.followUp?.outcome;
          return o === "escalated" || s.status === "BREACHED";
        }).length;
        const sevFailRate = Math.round((sevFailed / sevSubset.length) * 100);
        if (sevFailRate > 30) {
          warnings.push(
            `${severity} severity cases have a ${sevFailRate}% failure rate — consider prioritising follow-up`
          );
        }
      }
    }

    if (successRate < 70) {
      warnings.push(
        `Overall success rate is below 70% — this resolution approach may need review`
      );
    }

    return res.status(200).json({
      insufficient:   false,
      sampleSize,
      successRate,
      approach,
      approachLabel,
      confirmedCount,
      outcomes:       { satisfied, escalated, noResponse },
      warnings,
      recentCases,
    });
  } catch (error) {
    console.error("[GET /incidents/:id/outcome-history]", error.message);
    return res.status(200).json({ insufficient: true, reason: "Unable to load history" });
  }
});

router.get("/:id/customer-profile", requireAuth, async (req, res) => {
  try {
    const incident = await Incident.findById(req.params.id)
      .select("customerEmail")
      .lean();
    if (!incident?.customerEmail) {
      return res.status(200).json({ profile: null });
    }
    const profile = await getProfile(incident.customerEmail);
    return res.status(200).json({ profile });
  } catch (error) {
    console.error("[GET /incidents/:id/customer-profile]", error.message);
    return res.status(200).json({ profile: null });
  }
});

router.get("/:id/stream", requireAuth, async (req, res) => {
  try {
    const incident = await Incident.findById(req.params.id);

    if (!incident) {
      return res.status(404).json({ error: "Incident not found" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    sseService.register(req.params.id, res);
    req.on("close", () => sseService.cleanup(req.params.id));
  } catch (error) {
    console.error("[GET /incidents/:id/stream]", error.message);
    return res.status(500).json({ error: "Failed to open stream" });
  }
});

router.get("/:id/audit", requireAuth, async (req, res) => {
  try {
    const incident = await Incident.findById(req.params.id);

    if (!incident) {
      return res.status(404).json({ error: "Incident not found" });
    }

    const auditLog = await AuditLog.find({ incidentId: req.params.id })
      .sort({ timestamp: -1 })
      .lean();

    return res.status(200).json({ auditLog });
  } catch (error) {
    console.error("[GET /incidents/:id/audit]", error.message);
    return res.status(500).json({ error: "Failed to fetch audit log" });
  }
});

router.get("/:id", requireAuthOrRpa, async (req, res) => {
  try {
    const incident = await Incident.findById(req.params.id)
      .populate("createdBy", "name email role")
      .populate("assignedTo", "name email role");

    if (!incident) {
      return res.status(404).json({ error: "Incident not found" });
    }

    return res.status(200).json({
      incident: {
        ...incident.toJSON(),
        agentResults: {
          ...(incident.toJSON().agentResults || {}),
          uncertainty: deriveUncertaintyFromIncident(incident.toJSON()),
        },
        hitlReason: incident.rejectionReason || null,
      },
    });
  } catch (error) {
    console.error("[GET /incidents/:id]", error.message);
    return res.status(500).json({ error: "Failed to fetch incident" });
  }
});

router.patch("/:id", requireAuthOrRpa, async (req, res) => {
  try {
    const incident = await Incident.findById(req.params.id);

    if (!incident) {
      return res.status(404).json({ error: "Incident not found" });
    }

    const updates = {};
    const role = req.user?.role;
    const actor = req.user?.email || "rpa-service";

    if (req.body.status) {
      const from = incident.status;
      const to = req.body.status;
      const allowed = TRANSITIONS[from] || [];

      if (!allowed.includes(to)) {
        return res.status(400).json({ error: `Invalid transition: ${from} -> ${to}` });
      }

      const transitionKey = `${from}:${to}`;

      if (
        REVIEWER_ONLY.has(transitionKey) &&
        !req.rpaAuth &&
        !["reviewer", "admin"].includes(role)
      ) {
        return res
          .status(403)
          .json({ error: "Insufficient permissions for this transition" });
      }

      if (["RESOLVED:CLOSED", "RESOLVED:PENDING_REVIEW"].includes(transitionKey)) {
        if (!req.rpaAuth && role !== "admin") {
          return res.status(403).json({ error: "Admin only" });
        }
      }

      await AuditLog.create({
        incidentId: incident._id,
        actor,
        actorType: "human",
        action: "status_change",
        oldValue: from,
        newValue: to,
        timestamp: new Date(),
      });

      updates.status = to;

      // Feature D: schedule follow-up when incident is resolved
      if (to === "RESOLVED") {
        scheduleFollowUp(req.params.id).catch((err) =>
          console.error("[followUp] schedule failed (non-fatal):", err.message)
        );
      }
    }

    if (req.body.fieldOverrides && typeof req.body.fieldOverrides === "object") {
      for (const [fieldName, newValue] of Object.entries(req.body.fieldOverrides)) {
        const aiValue =
          incident.agentResults?.classifier?.fields?.[fieldName]?.value ||
          incident[fieldName] ||
          null;

        await TrainingCandidate.create({
          incidentId: incident._id,
          field: fieldName,
          aiValue,
          humanValue: newValue,
          reviewerId: req.user?.id || null,
          timestamp: new Date(),
        });

        await AuditLog.create({
          incidentId: incident._id,
          actor,
          actorType: "human",
          action: "field_override",
          field: fieldName,
          oldValue: aiValue,
          newValue,
          timestamp: new Date(),
        });

        updates[fieldName] = newValue;
      }
    }

    if (req.body.rejectionReason) {
      updates.rejectionReason = req.body.rejectionReason;
    }

    const updated = await Incident.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    )
      .populate("createdBy", "name email role")
      .populate("assignedTo", "name email role")
      .lean();

    const EMBED_FIELDS = new Set(['type', 'location', 'severity', 'department', 'description']);
    const isNowResolved = updates.status === "RESOLVED";
    const wasAlreadyResolved = !isNowResolved
      && ['RESOLVED', 'CLOSED'].includes(updated?.status)
      && req.body.fieldOverrides
      && Object.keys(req.body.fieldOverrides).some((f) => EMBED_FIELDS.has(f));

    if ((isNowResolved || wasAlreadyResolved) && updated) {
      embedResolvedIncident(req.params.id, updated).catch((err) =>
        console.error("[auto-embed] non-fatal:", err.message)
      );
      broadcastLive({
        type: "learning_event",
        action: wasAlreadyResolved ? "corrected" : "absorbed",
        incidentId: req.params.id,
        incidentType: updated.type,
        location: updated.location || null,
        message: wasAlreadyResolved
          ? `NEXUS re-embedded corrected incident — ${(updated.type || "incident").replace(/_/g, " ")}${updated.location ? ` at ${updated.location}` : ""}`
          : `NEXUS absorbed resolution — ${(updated.type || "incident").replace(/_/g, " ")}${updated.location ? ` at ${updated.location}` : ""} embedded into corpus`,
      });
    }

    // Live-broadcast for the Board so cards animate to the new column.
    try { broadcastIncidentUpdate(updated, "incident_updated"); } catch { /* non-fatal */ }

    return res.status(200).json({ incident: updated });
  } catch (error) {
    console.error("[PATCH /incidents/:id]", error.message);
    return res.status(500).json({ error: "Failed to update incident" });
  }
});

router.get("/", requireAuthOrRpa, async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = (page - 1) * limit;
    const filter = {};

    if (req.query.status) filter.status = req.query.status;
    if (req.query.type) filter.type = req.query.type;
    if (req.query.severity) filter.severity = req.query.severity;
    if (req.query.source) filter.source = req.query.source;
    if (req.query.department) filter.department = req.query.department;
    // RPA v3.0: Customer DNA lookup — filter by sender email
    if (req.query.reporterEmail) filter.customerEmail = req.query.reporterEmail;

    if (req.query.q) {
      filter.$text = { $search: req.query.q };
    }

    if (req.query.dateFrom || req.query.dateTo) {
      filter.createdAt = {};
      if (req.query.dateFrom) filter.createdAt.$gte = new Date(req.query.dateFrom);
      if (req.query.dateTo) filter.createdAt.$lte = new Date(req.query.dateTo);
    }

    if (req.query.confidenceBand === "high") {
      filter.confidence = { $gte: 0.85 };
    } else if (req.query.confidenceBand === "medium") {
      filter.confidence = { $gte: 0.65, $lt: 0.85 };
    } else if (req.query.confidenceBand === "low") {
      filter.confidence = { $lt: 0.65 };
    }

    if (req.user?.role === "reporter") {
      filter.$or = [{ createdBy: req.user.id }, { source: "rpa" }];
    }

    const [incidents, total] = await Promise.all([
      Incident.find(filter)
        .populate("createdBy", "name email role")
        .sort(req.query.q ? { score: { $meta: "textScore" } } : { createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Incident.countDocuments(filter),
    ]);

    return res.status(200).json({
      incidents: incidents.map((incident) => incident.toJSON()),
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error("[GET /incidents]", error.message);
    return res.status(500).json({ error: "Failed to list incidents" });
  }
});

// ── CX-3: Escalation Call Brief ──────────────────────────────────────────
router.post("/:id/call-brief", requireAuth, async (req, res) => {
  const incidentId = req.params.id;
  try {
    const incident = await Incident.findById(incidentId).lean();
    if (!incident) {
      return res.status(404).json({ error: "Incident not found" });
    }

    const { severity } = incident;
    if (!["High", "Critical"].includes(severity)) {
      return res.status(400).json({
        error: "Call brief only available for High/Critical incidents",
      });
    }

    const type = incident.type || "unknown";
    const location = incident.location || incident.agentResults?.request?.location || "DHL facility";
    const status = incident.status || "UNDER_REVIEW";
    const description = incident.description || "";
    const steps = incident.agentResults?.resolution?.steps || [];
    const sopCode = incident.agentResults?.resolution?.sopCode || incident.agentResults?.sop?.match || null;

    const fallbackBrief =
      "CUSTOMER SITUATION\n" +
      `Customer reported a ${type.replace(/_/g, " ")} incident at ${location}.\n\n` +
      "WHAT WE ARE DOING\n" +
      `Following standard DHL procedure ${sopCode || "SOP-STD"}.\n` +
      "Team is actively reviewing the case.\n\n" +
      "SUGGESTED OPENING LINE\n" +
      "Hello, I'm calling from DHL regarding your recent report. " +
      "I want to personally update you on our progress.\n\n" +
      "KEY TALKING POINTS\n" +
      "- We have received and logged your report\n" +
      "- Our team is prioritising your case\n" +
      "- We will keep you updated on progress\n\n" +
      "DO NOT SAY\n" +
      "- Do not promise specific dates or timelines\n" +
      "- Do not discuss compensation amounts\n\n" +
      "ESTIMATED RESOLUTION\n" +
      "Subject to investigation findings.";

    try {
      const systemPrompt =
        "You are a DHL operations manager briefing assistant. " +
        "Generate a concise call brief for a manager who needs to phone a customer about their incident. " +
        "Use plain English. No technical jargon. Maximum 250 words total. " +
        "Format with these exact section headers on their own lines:\n" +
        "CUSTOMER SITUATION\n" +
        "WHAT WE ARE DOING\n" +
        "SUGGESTED OPENING LINE\n" +
        "KEY TALKING POINTS\n" +
        "DO NOT SAY\n" +
        "ESTIMATED RESOLUTION";

      const userMessage =
        `Incident type: ${type.replace(/_/g, " ")}\n` +
        `Location: ${location}\n` +
        `Severity: ${severity}\n` +
        `Status: ${status}\n` +
        `Description: ${description}\n` +
        `Resolution steps in progress:\n` +
        (steps.length ? steps.map((s, i) => `${i + 1}. ${s}`).join("\n") : "None yet") + "\n" +
        `SOP code: ${sopCode || "Standard procedure"}\n\n` +
        "Generate the call brief.";

      const brief = await Promise.race([
        callAI({ system: systemPrompt, user: userMessage, maxTokens: 400 }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("AI timeout")), 12000)
        ),
      ]);

      return res.status(200).json({
        brief: String(brief || "").trim() || fallbackBrief,
        incidentId,
        fallback: false,
      });
    } catch (aiError) {
      console.error("[POST /incidents/:id/call-brief] AI error:", aiError.message);
      return res.status(200).json({ brief: fallbackBrief, incidentId, fallback: true });
    }
  } catch (error) {
    console.error("[POST /incidents/:id/call-brief]", error.message);
    return res.status(500).json({ error: "Failed to generate call brief" });
  }
});

// ── OPS-3: Shift Handover Note ────────────────────────────────────────────
router.post("/:id/handover", requireAuth, async (req, res) => {
  const incidentId = req.params.id;
  try {
    const incident = await Incident.findById(incidentId).lean();
    if (!incident) {
      return res.status(404).json({ error: "Incident not found" });
    }

    if (["RESOLVED", "CLOSED"].includes(incident.status)) {
      return res.status(400).json({
        error: "Handover note not needed for resolved incidents",
      });
    }

    const type = (incident.type || "unknown").replace(/_/g, " ");
    const location = incident.location || incident.agentResults?.request?.location || "DHL facility";
    const { severity, status, department, description } = incident;

    // Compute SLA time remaining / breached
    const slaHours = { Critical: 2, High: 4, Medium: 8, Low: 24 };
    const hours = slaHours[severity] || 8;
    const deadline = incident.createdAt
      ? new Date(new Date(incident.createdAt).getTime() + hours * 60 * 60 * 1000)
      : null;
    let slaText = "Unknown SLA";
    if (deadline) {
      const diffMs = deadline - new Date();
      const diffH = Math.abs(Math.round(diffMs / 3600000));
      slaText = diffMs > 0 ? `${diffH} hours remaining` : `BREACHED ${diffH} hours ago`;
    }

    // Fetch last 3 audit entries
    const recentAudit = await AuditLog.find({ incidentId: incident._id })
      .sort({ timestamp: -1 })
      .limit(3)
      .lean();
    const recentAuditSummary = recentAudit.length
      ? recentAudit
          .map((e) => `${e.action} — ${e.newValue || ""}`)
          .join(", ")
      : "No actions logged yet";

    const fallbackNote =
      "SITUATION\n" +
      `${type} incident at ${location}. Severity: ${severity}.\n\n` +
      "ACTIONS TAKEN\n" +
      `- Case logged and assigned to ${department || "Operations"}\n` +
      "- Standard DHL procedure initiated\n\n" +
      "NEXT ACTION NEEDED\n" +
      "Review incident details and follow up with customer.\n\n" +
      "SLA STATUS\n" +
      slaText;

    try {
      const systemPrompt =
        "You are a DHL operations shift handover assistant. " +
        "Generate a brief handover note for the incoming shift. " +
        "Plain English. No technical jargon. Maximum 150 words. " +
        "Format with these exact section headers on their own lines:\n" +
        "SITUATION\n" +
        "ACTIONS TAKEN\n" +
        "NEXT ACTION NEEDED\n" +
        "SLA STATUS";

      const userMessage =
        `Incident: ${type} at ${location}\n` +
        `Severity: ${severity}\n` +
        `Department: ${department || "Operations"}\n` +
        `Current status: ${status}\n` +
        `Description: ${description}\n` +
        `Recent actions: ${recentAuditSummary}\n` +
        `SLA: ${slaText}\n\n` +
        "Generate handover note.";

      const note = await Promise.race([
        callAI({ system: systemPrompt, user: userMessage, maxTokens: 300 }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("AI timeout")), 10000)
        ),
      ]);

      return res.status(200).json({
        note: String(note || "").trim() || fallbackNote,
        incidentId,
        fallback: false,
      });
    } catch (aiError) {
      console.error("[POST /incidents/:id/handover] AI error:", aiError.message);
      return res.status(200).json({ note: fallbackNote, incidentId, fallback: true });
    }
  } catch (error) {
    console.error("[POST /incidents/:id/handover]", error.message);
    return res.status(500).json({ error: "Failed to generate handover note" });
  }
});

// ── P0-2 FIX: POST /:id/notes ─────────────────────────────────────────────────
// Used by nexus_rpa.cs/HandleReply() to thread reply emails onto an incident.
// Auth: RPA API key OR a logged-in user.
router.post("/:id/notes", async (req, res, next) => {
  try {
    // Accept both authentication modes
    const apiKey = req.headers["x-api-key"];
    const isRpa  = apiKey && apiKey === process.env.RPA_API_KEY;
    if (!isRpa && !req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const incident = await Incident.findById(req.params.id);
    if (!incident) {
      return res.status(404).json({ error: "Incident not found" });
    }

    const note   = typeof req.body?.note   === "string" ? req.body.note.trim()   : "";
    const source = typeof req.body?.source === "string" ? req.body.source.trim() : "rpa";

    if (!note) {
      return res.status(400).json({ error: "note is required" });
    }

    // Append note to agentResults.notes array (stored in Mixed field)
    const existingNotes = Array.isArray(incident.agentResults?.notes)
      ? incident.agentResults.notes
      : [];

    await Incident.findByIdAndUpdate(req.params.id, {
      $set: {
        "agentResults.notes": [
          ...existingNotes,
          { text: note, source, addedAt: new Date() },
        ],
      },
    });

    await AuditLog.create({
      incidentId: incident._id,
      actor:      isRpa ? "rpa" : req.user?.id,
      actorType:  isRpa ? "system" : "human",
      action:     "note_added",
      newValue:   { note: note.substring(0, 200), source },
      timestamp:  new Date(),
    });

    return res.status(200).json({ success: true, noteCount: existingNotes.length + 1 });
  } catch (error) {
    console.error("[POST /incidents/:id/notes]", error.message);
    return next(error);
  }
});

// ── Feature 1: Service Recovery routes ─────────────────────────────────────────

// GET /:id/recovery — return the current recoveryMessage for an incident
router.get("/:id/recovery", requireAuth, async (req, res, next) => {
  try {
    const incident = await Incident.findById(req.params.id)
      .select("recoveryMessage agentResults.recovery")
      .lean();

    if (!incident) {
      return res.status(404).json({ error: "Incident not found" });
    }

    if (!incident.recoveryMessage?.generatedAt) {
      return res.status(404).json({ error: "No recovery message for this incident" });
    }

    return res.status(200).json({
      ...incident.recoveryMessage,
      meta: incident.agentResults?.recovery || null,
    });
  } catch (error) {
    console.error("[GET /incidents/:id/recovery]", error.message);
    return next(error);
  }
});

// POST /:id/recovery/approve — approve a hitl_required recovery message for sending
router.post(
  "/:id/recovery/approve",
  requireAuth,
  requireRole("reviewer", "admin"),
  async (req, res, next) => {
    try {
      const incident = await Incident.findById(req.params.id);
      if (!incident) {
        return res.status(404).json({ error: "Incident not found" });
      }

      const current = incident.recoveryMessage?.status;
      if (!["hitl_required", "pending_send"].includes(current)) {
        return res.status(400).json({
          error: `Recovery message is not pending review (current status: ${current || "none"})`
        });
      }

      const approver = req.user?.email || req.user?.id || "reviewer";

      // 1. Mark recovery message as approved and move incident to IN_PROGRESS
      await Incident.findByIdAndUpdate(req.params.id, {
        $set: {
          "recoveryMessage.status":     "approved",
          "recoveryMessage.approvedBy": approver,
          "recoveryMessage.approvedAt": new Date(),
          // Only advance status if it's still in a pre-resolution stage
          ...(["PENDING_REVIEW", "UNDER_REVIEW", "ASSIGNED"].includes(incident.status)
            ? { status: "IN_PROGRESS" }
            : {}),
        },
      });

      // 2. Queue outbound email so RPA can pick it up and send via Outlook
      const toEmail =
        incident.customerEmail ||
        incident.agentResults?.intake?.fields?.email?.value ||
        incident.agentResults?.request?.customerEmail ||
        null;

      let emailQueued = false;
      let emailSent   = false;
      if (toEmail) {
        const typeLabel = String(incident.type || "incident").replace(/_/g, " ");
        const caseRef   = `INC-${String(incident._id).slice(-6).toUpperCase()}`;
        const subject   = `DHL Service Update — ${caseRef} ${typeLabel} update`;

        // Generate the HTML enterprise email with CTA button for the chat link.
        const { buildRecoveryCustomerEmail } = await import("../services/proactiveEmail.service.js");
        const { generateChatToken }          = await import("../services/email.service.js");
        const FRONTEND = process.env.FRONTEND_URL || "http://localhost:5173";
        const chatUrl  = `${FRONTEND}/chat/${generateChatToken(incident)}`;

        const body = buildRecoveryCustomerEmail({
          recoveryText: incident.recoveryMessage?.text || "",
          caseRef,
          incidentType: incident.type,
          chatUrl,
          language:     incident.recoveryMessage?.language || "en",
        });

        const emailRecord = await OutboundEmail.create({
          incidentId: incident._id,
          toEmail,
          subject,
          body,
          language:   incident.recoveryMessage?.language || "en",
          status:     "queued",
          approvedBy: approver,
        });
        emailQueued = true;

        // Attempt immediate send — don't wait for the auto-flush interval
        try {
          emailSent = await sendEmail(toEmail, subject, body);
          if (emailSent) {
            await OutboundEmail.findByIdAndUpdate(emailRecord._id, {
              status: "sent",
              sentAt: new Date(),
            });
          }
        } catch (sendErr) {
          console.error("[recovery/approve] immediate send failed:", sendErr.message);
        }
      }

      // 3. Audit trail
      await AuditLog.create({
        incidentId: incident._id,
        actor:      req.user?.id,
        actorType:  "human",
        action:     "recovery_approved",
        newValue: {
          approvedBy: approver,
          language:   incident.recoveryMessage?.language,
          emailQueued,
          emailSent,
          toEmail:    toEmail || null,
          statusAdvanced: ["PENDING_REVIEW", "UNDER_REVIEW", "ASSIGNED"].includes(incident.status),
        },
        timestamp: new Date(),
      });

      return res.status(200).json({
        success: true,
        status: "approved",
        emailQueued,
        emailSent,
        toEmail: toEmail || null,
        incidentStatus: "IN_PROGRESS",
      });
    } catch (error) {
      console.error("[POST /incidents/:id/recovery/approve]", error.message);
      return next(error);
    }
  }
);

// POST /:id/recovery/reject — reject a hitl_required recovery message
router.post(
  "/:id/recovery/reject",
  requireAuth,
  requireRole("reviewer", "admin"),
  async (req, res, next) => {
    try {
      const incident = await Incident.findById(req.params.id);
      if (!incident) {
        return res.status(404).json({ error: "Incident not found" });
      }

      const current = incident.recoveryMessage?.status;
      if (!current || ["approved", "rejected"].includes(current)) {
        return res.status(400).json({
          error: `Cannot reject recovery message with status: ${current || "none"}`
        });
      }

      await Incident.findByIdAndUpdate(req.params.id, {
        $set: { "recoveryMessage.status": "rejected" },
      });

      await AuditLog.create({
        incidentId: incident._id,
        actor:      req.user?.id,
        actorType:  "human",
        action:     "recovery_rejected",
        newValue:   { rejectedBy: req.user?.email || req.user?.id },
        timestamp:  new Date(),
      });

      return res.status(200).json({ success: true, status: "rejected" });
    } catch (error) {
      console.error("[POST /incidents/:id/recovery/reject]", error.message);
      return next(error);
    }
  }
);

// GET /:id/chat-link — generate customer chat link
router.get(
  "/:id/chat-link",
  requireAuth,
  requireRole("reviewer", "admin"),
  async (req, res, next) => {
    try {
      const incident = await Incident.findById(req.params.id).lean();
      if (!incident) return res.status(404).json({ error: "Incident not found" });
      const payload = {
        incidentId:     incident._id.toString(),
        type:           incident.type,
        location:       incident.location,
        severity:       incident.severity,
        status:         incident.status,
        description:    incident.description,
        resolutionSteps: incident.agentResults?.resolution?.steps || [],
        sopCode:        incident.agentResults?.resolution?.sopCode || null,
        reporterEmail:  incident.customerEmail || null,
        createdAt:      incident.createdAt,
      };
      const token    = jwt.sign(payload, (process.env.JWT_SECRET || "fallback_secret") + "chat", { expiresIn: "72h" });
      const chatUrl  = `${process.env.FRONTEND_URL || "http://localhost:5173"}/chat/${token}`;
      return res.json({ chatUrl, token });
    } catch (e) { return next(e); }
  }
);

// POST /:id/reply — agent sends a message to the customer
router.post(
  "/:id/reply",
  requireAuth,
  requireRole("reviewer", "admin"),
  async (req, res, next) => {
    try {
      const { message } = req.body || {};
      if (!message || typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ error: "message is required" });
      }
      const incident = await Incident.findById(req.params.id);
      if (!incident) return res.status(404).json({ error: "Incident not found" });

      const entry = {
        role:    "agent",
        text:    message.trim(),
        sentBy:  req.user?.name || req.user?.email || "Agent",
        channel: "email",
        ts:      new Date(),
      };

      await Incident.findByIdAndUpdate(req.params.id, {
        $push: { conversationThread: entry },
      });

      const toEmail = incident.customerEmail || null;
      let emailQueued = false;
      let emailSent   = false;
      if (toEmail) {
        const typeLabel = String(incident.type || "incident").replace(/_/g, " ");
        const subject   = `DHL Service Update — Your ${typeLabel} report`;
        const body      = message.trim();

        const emailRecord = await OutboundEmail.create({
          incidentId: incident._id,
          toEmail,
          subject,
          body,
          language:   incident.detectedLanguage || "en",
          status:     "queued",
          approvedBy: req.user?.email || String(req.user?.id),
        });
        emailQueued = true;

        try {
          emailSent = await sendEmail(toEmail, subject, body);
          if (emailSent) {
            await OutboundEmail.findByIdAndUpdate(emailRecord._id, {
              status: "sent",
              sentAt: new Date(),
            });
          }
        } catch (sendErr) {
          console.error("[reply] immediate send failed:", sendErr.message);
        }
      }

      await AuditLog.create({
        incidentId: incident._id,
        actor:      req.user?.id,
        actorType:  "human",
        action:     "agent_reply",
        newValue:   { preview: message.trim().slice(0, 200), emailQueued, emailSent, toEmail },
        timestamp:  new Date(),
      });

      const updated = await Incident.findById(req.params.id).lean();
      return res.status(200).json({ success: true, emailQueued, emailSent, toEmail, incident: updated });
    } catch (error) {
      console.error("[POST /incidents/:id/reply]", error.message);
      return next(error);
    }
  }
);

export default router;
