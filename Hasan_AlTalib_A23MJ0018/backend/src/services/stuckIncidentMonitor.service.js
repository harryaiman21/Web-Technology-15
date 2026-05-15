// ─────────────────────────────────────────────────────────────────────────────
// stuckIncidentMonitor.service.js
//
// The AI pipeline normally transitions DRAFT → PENDING_REVIEW or DRAFT →
// ASSIGNED within a few seconds. If the pipeline crashes mid-run, or the
// classifier never returned, an incident can sit in DRAFT forever — visible
// in the Board's "Incoming" column with no progress.
//
// This monitor runs every 60 seconds. It finds DRAFT incidents older than the
// configured grace period and either:
//   1. RETRIES the pipeline (preferred) if rawInput is intact
//   2. Falls back to PENDING_REVIEW + holdForReview=true with a "stuck" reason,
//      so the case lands on a reviewer's desk instead of disappearing.
// ─────────────────────────────────────────────────────────────────────────────

import Incident from "../models/Incident.model.js";
import { runPipeline } from "../agents/orchestrator.js";
import { broadcastIncidentUpdate } from "./liveStream.service.js";

const SCAN_INTERVAL_MS = 60 * 1000;     // scan every 60 seconds
const GRACE_PERIOD_MS  = 3 * 60 * 1000; // DRAFT must be ≥ 3 min old to be considered stuck
const HARD_FAIL_MS     = 10 * 60 * 1000; // After 10 min, give up retrying and route to PENDING_REVIEW

let scanInProgress = false;

async function scanOnce() {
  if (scanInProgress) return;
  scanInProgress = true;

  try {
    const cutoffSoft = new Date(Date.now() - GRACE_PERIOD_MS);
    const cutoffHard = new Date(Date.now() - HARD_FAIL_MS);

    const stuck = await Incident.find({
      status: "DRAFT",
      createdAt: { $lte: cutoffSoft },
    })
      .select("_id rawInput description createdAt pipelineError pipelineRetries")
      .lean();

    if (stuck.length === 0) return;

    console.log(`[stuckIncidentMonitor] found ${stuck.length} stuck DRAFT incident(s)`);

    for (const inc of stuck) {
      const ageMs = Date.now() - new Date(inc.createdAt).getTime();
      const retries = Number(inc.pipelineRetries || 0);

      // ── Hard fail: > 10 min old, route to PENDING_REVIEW with a flag ────
      if (ageMs >= HARD_FAIL_MS || retries >= 2) {
        try {
          const updated = await Incident.findByIdAndUpdate(
            inc._id,
            {
              status: "PENDING_REVIEW",
              holdForReview: true,
              rejectionReason: "Pipeline did not complete — routed for human review.",
              pipelineError: true,
            },
            { new: true },
          ).lean();
          if (updated) broadcastIncidentUpdate(updated, "incident_updated");
          console.log(`[stuckIncidentMonitor] HARD-ROUTED ${inc._id} to PENDING_REVIEW (retries=${retries}, age=${Math.round(ageMs / 1000)}s)`);
        } catch (err) {
          console.error(`[stuckIncidentMonitor] hard-route ${inc._id} failed:`, err.message);
        }
        continue;
      }

      // ── Soft retry: within grace window, retry the pipeline ──────────────
      const rawText = inc.rawInput || inc.description || "";
      if (!rawText.trim()) {
        // Nothing to classify — route to PENDING_REVIEW immediately
        try {
          const updated = await Incident.findByIdAndUpdate(
            inc._id,
            {
              status: "PENDING_REVIEW",
              holdForReview: true,
              rejectionReason: "Empty rawInput — manual classification required.",
            },
            { new: true },
          ).lean();
          if (updated) broadcastIncidentUpdate(updated, "incident_updated");
        } catch (err) {
          console.error(`[stuckIncidentMonitor] empty-route ${inc._id} failed:`, err.message);
        }
        continue;
      }

      try {
        // Increment retry counter so we eventually hard-fail
        await Incident.findByIdAndUpdate(inc._id, { $inc: { pipelineRetries: 1 } });
        console.log(`[stuckIncidentMonitor] retrying pipeline for ${inc._id} (retry ${retries + 1})`);
        // Fire-and-forget — orchestrator handles its own broadcasts on success
        runPipeline(inc._id.toString(), rawText).catch((err) =>
          console.error(`[stuckIncidentMonitor] retry pipeline for ${inc._id} crashed:`, err.message),
        );
      } catch (err) {
        console.error(`[stuckIncidentMonitor] retry kickoff for ${inc._id} failed:`, err.message);
      }
    }
  } catch (err) {
    console.error("[stuckIncidentMonitor] scan error:", err.message);
  } finally {
    scanInProgress = false;
  }
}

export function startStuckIncidentMonitor() {
  // Run once at startup (after a 30s warmup so the AI service has time to wake)
  setTimeout(() => scanOnce().catch(() => {}), 30 * 1000);
  // Then every minute
  setInterval(() => scanOnce().catch(() => {}), SCAN_INTERVAL_MS);
  console.log(`[stuckIncidentMonitor] started — every 60s, grace ${GRACE_PERIOD_MS / 1000}s, hard-fail ${HARD_FAIL_MS / 1000}s`);
}

// Manual trigger (admin endpoint can call this for "Cleanup Stuck Now")
export async function cleanupStuckNow() {
  await scanOnce();
  return { ok: true };
}
