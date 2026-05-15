/**
 * backend/src/routes/rpaRuns.routes.js
 *
 * POST /api/v1/rpa-runs               — create run record (UiPath after each batch)
 * PATCH /api/v1/rpa-runs/:rpaRunId    — update narrative on existing run (CREATIVE-1)
 * GET /api/v1/rpa-runs                — list all runs (admin dashboard)
 * POST /api/v1/rpa-runs/items         — create per-item lineage record
 * GET /api/v1/rpa-runs/:rpaRunId/items — list items for a specific run
 *
 * Auth: X-API-Key (rpaAuth middleware) for write routes, open for reads.
 */

import express from "express";

import { requireRpaAuth } from "../middleware/rpaAuth.middleware.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import RpaRun from "../models/RpaRun.model.js";
import RpaRunItem from "../models/RpaRunItem.model.js";
import OutboundEmail from "../models/OutboundEmail.model.js";
import { sendAcknowledgement, processOutboundQueue } from "../services/email.service.js";

const router = express.Router();

// ── POST /api/v1/rpa-runs ────────────────────────────────────────────────────
// Called by UiPath after every batch completes.
// Persists a run summary including the CREATIVE-1 narrative.
router.post("/", requireRpaAuth, async (req, res) => {
  try {
    const {
      runId,
      rpaRunId,
      status,
      processedCount,
      errors,
      startedAt,
      completedAt,
      processed,
      skipped,
      failed,
      narrative,
    } = req.body;

    const normalizedRunId = runId || rpaRunId;
    const normalizedProcessedCount = processedCount ?? processed ?? 0;
    const normalizedSkippedCount   = skipped ?? 0;
    const normalizedFailedCount    = failed ?? 0;
    const normalizedErrors         = Array.isArray(errors) ? errors : [];
    const normalizedNarrative      = typeof narrative === "string" ? narrative.trim() : "";
    const normalizedStatus =
      status ||
      (normalizedFailedCount > 0
        ? normalizedProcessedCount > 0 || normalizedSkippedCount > 0
          ? "partial"
          : "failed"
        : "completed");

    if (!normalizedRunId) {
      return res.status(400).json({ error: "runId is required" });
    }

    const run = await RpaRun.create({
      runId:         normalizedRunId,
      status:        normalizedStatus,
      processedCount: normalizedProcessedCount,
      errors:        normalizedErrors,
      narrative:     normalizedNarrative,
      startedAt:     startedAt ? new Date(startedAt) : undefined,
      completedAt:   completedAt ? new Date(completedAt) : new Date(),
      source:        "uipath",
      startTime:     startedAt ? new Date(startedAt) : undefined,
      endTime:       completedAt ? new Date(completedAt) : new Date(),
      totalFiles:    normalizedProcessedCount + normalizedSkippedCount + normalizedFailedCount,
      duplicates:    normalizedSkippedCount,
      failed:        normalizedFailedCount,
    });

    return res.status(201).json(run);
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: "runId already exists" });
    }
    console.error("[rpa-runs] POST error:", error);
    return res.status(500).json({ error: "Failed to save run record" });
  }
});

// ── PATCH /api/v1/rpa-runs/:rpaRunId ────────────────────────────────────────
// CREATIVE-1: Update the narrative on an existing run (post-run enrichment).
// Also usable to update status if a run is stuck in partial.
router.patch("/:rpaRunId", requireRpaAuth, async (req, res) => {
  try {
    const { rpaRunId } = req.params;
    const updates = {};

    if (typeof req.body.narrative === "string") {
      updates.narrative = req.body.narrative.trim();
    }
    if (typeof req.body.status === "string") {
      updates.status = req.body.status;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "Nothing to update" });
    }

    const run = await RpaRun.findOneAndUpdate(
      { runId: rpaRunId },
      { $set: updates },
      { new: true }
    );

    if (!run) {
      return res.status(404).json({ error: "Run not found" });
    }

    return res.status(200).json(run);
  } catch (error) {
    console.error("[rpa-runs] PATCH error:", error);
    return res.status(500).json({ error: "Failed to update run record" });
  }
});

// ── GET /api/v1/rpa-runs ─────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const runs = await RpaRun.find({})
      .sort({ completedAt: -1, createdAt: -1 })
      .limit(50)
      .lean();

    return res.json(runs);
  } catch (error) {
    console.error("[rpa-runs] GET error:", error);
    return res.status(500).json({ error: "Failed to retrieve run history" });
  }
});

// ── POST /api/v1/rpa-runs/items ──────────────────────────────────────────────
// Per-item lineage record — called by nexus_rpa.cs for every processed file.
// Non-critical: nexus_rpa.cs never throws on PostRunItem failure.
router.post("/items", requireRpaAuth, async (req, res) => {
  try {
    const {
      rpaRunId,
      filename,
      fileHash,
      incidentId,
      outcome,
      skipReason,
      severity,
      location,
      errorMessage,
    } = req.body;

    if (!rpaRunId || !filename || !outcome) {
      return res.status(400).json({ error: "rpaRunId, filename, and outcome are required" });
    }

    const item = await RpaRunItem.create({
      rpaRunId,
      filename,
      fileHash:     fileHash     || undefined,
      incidentId:   incidentId   || undefined,
      outcome,
      skipReason:   skipReason   || undefined,
      severity:     severity     || undefined,
      location:     location     || undefined,
      errorMessage: errorMessage || undefined,
    });

    return res.status(201).json(item);
  } catch (error) {
    console.error("[rpa-runs/items] POST error:", error);
    return res.status(500).json({ error: "Failed to save run item" });
  }
});

// ── GET /api/v1/rpa-runs/:rpaRunId/items ─────────────────────────────────────
// Returns all per-item lineage records for a specific run. Admin only.
router.get("/:rpaRunId/items", requireAuth, requireRole("admin", "reviewer"), async (req, res) => {
  try {
    const items = await RpaRunItem.find({ rpaRunId: req.params.rpaRunId })
      .sort({ processedAt: 1 })
      .lean();

    return res.json(items);
  } catch (error) {
    console.error("[rpa-runs/items] GET error:", error);
    return res.status(500).json({ error: "Failed to retrieve run items" });
  }
});

// GET /api/v1/rpa-runs/outbound-queue — RPA polls this to get emails to send
router.get("/outbound-queue", requireRpaAuth, async (req, res) => {
  try {
    const emails = await OutboundEmail.find({ status: "queued" })
      .populate("incidentId", "title type location")
      .sort({ createdAt: 1 })
      .limit(50)
      .lean();
    return res.json({ emails, count: emails.length });
  } catch (error) {
    console.error("[outbound-queue] GET error:", error);
    return res.status(500).json({ error: "Failed to retrieve outbound queue" });
  }
});

// PATCH /api/v1/rpa-runs/outbound-queue/:id — RPA marks email as sent or failed
router.patch("/outbound-queue/:id", requireRpaAuth, async (req, res) => {
  try {
    const { status, error: sendError } = req.body;
    if (!["sent", "failed"].includes(status)) {
      return res.status(400).json({ error: "status must be sent or failed" });
    }
    const updated = await OutboundEmail.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          status,
          sentAt: status === "sent" ? new Date() : null,
          error: sendError || null,
        },
      },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: "Email record not found" });
    return res.json({ success: true, email: updated });
  } catch (error) {
    console.error("[outbound-queue] PATCH error:", error);
    return res.status(500).json({ error: "Failed to update outbound email" });
  }
});

// GET /api/v1/rpa-runs/outbound-history — admin view of sent emails
router.get("/outbound-history", requireAuth, requireRole("admin", "reviewer"), async (req, res) => {
  try {
    const emails = await OutboundEmail.find()
      .populate("incidentId", "title type location status")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return res.json({ emails, count: emails.length });
  } catch (error) {
    console.error("[outbound-history] GET error:", error);
    return res.status(500).json({ error: "Failed to retrieve outbound history" });
  }
});

// POST /api/v1/rpa-runs/send-ack/:incidentId — manually trigger acknowledgement email
router.post("/send-ack/:incidentId", requireRpaAuth, async (req, res) => {
  try {
    const result = await sendAcknowledgement(req.params.incidentId);
    return res.json(result);
  } catch (error) {
    console.error("[send-ack] error:", error);
    return res.status(500).json({ error: "Failed to send acknowledgement" });
  }
});

// POST /api/v1/rpa-runs/flush-outbound — send all queued emails via SMTP
router.post("/flush-outbound", requireRpaAuth, async (req, res) => {
  try {
    const result = await processOutboundQueue();
    return res.json(result);
  } catch (error) {
    console.error("[flush-outbound] error:", error);
    return res.status(500).json({ error: "Failed to flush outbound queue" });
  }
});

export default router;
