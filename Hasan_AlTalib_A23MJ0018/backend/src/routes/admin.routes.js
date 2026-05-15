import { Router } from "express";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import multer from "multer";

import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { requireRpaAuth } from "../middleware/rpaAuth.middleware.js";
import AuditLog from "../models/AuditLog.model.js";
import FeedbackDatasetEntry from "../models/FeedbackDatasetEntry.model.js";
import Incident from "../models/Incident.model.js";
import PipelineJob from "../models/PipelineJob.model.js";
import RpaRun from "../models/RpaRun.model.js";
import RetrainRun from "../models/RetrainRun.model.js";
import ProactiveSend from "../models/ProactiveSend.model.js";
import SopDraft from "../models/SopDraft.model.js";
import SopLibrary from "../models/SopLibrary.model.js";
import TrainingCandidate from "../models/TrainingCandidate.model.js";
import CascadeEvent from "../models/CascadeEvent.model.js";
import Embedding from "../models/Embedding.model.js";
import SystemConfig from "../models/SystemConfig.model.js";
import { FASTAPI_URL } from "../config/env.js";
import CustomerProfile from "../models/CustomerProfile.model.js";
import { getProfile } from "../services/customerProfile.service.js";
import {
  VALID_LABELS,
  appendRealRows,
  getRetrainJob,
  parseCsvBuffer,
  triggerRetrain,
} from "../services/retraining.service.js";
import { runPipeline } from "../agents/orchestrator.js";
import { callAI } from "../config/callAI.js";
import { getActiveClusters, predictCascadeRisk } from "../services/clusterDetection.service.js";
import { notifyClusterCustomers } from "../services/clusterNotify.service.js";
import { getFeedbackMetrics, exportFeedbackDataset } from "../services/feedbackExport.service.js";
import { getModelInfo } from "../services/fastapi.service.js";
import { deriveUncertaintyFromIncident } from "../services/uncertainty.service.js";
import { deriveApproach, APPROACH_LABELS } from "../services/followUp.service.js";
import { sendEmail } from "../services/email.service.js";
import {
  buildHubNoticeEmail,
  buildCustomerNoticeEmail,
} from "../services/proactiveEmail.service.js";

const router = Router();

const CANONICAL_TYPES = [
  "late_delivery",
  "damaged_parcel",
  "missing_parcel",
  "address_error",
  "system_error",
  "wrong_item",
  "other",
];

const SEVERITIES = ["Low", "Medium", "High", "Critical"];
const DEPARTMENTS = ["Operations", "Customer Service", "Logistics", "IT", "Finance"];
const CONFIDENCE_BUCKETS = [
  { label: "0.0-0.5", min: 0.0, max: 0.5 },
  { label: "0.5-0.7", min: 0.5, max: 0.7 },
  { label: "0.7-0.8", min: 0.7, max: 0.8 },
  { label: "0.8-0.9", min: 0.8, max: 0.9 },
  { label: "0.9-1.0", min: 0.9, max: 1.000001 },
];

function roundTo(value, decimals = 1) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function percent(part, whole) {
  if (!whole) {
    return 0;
  }

  return roundTo((part / whole) * 100, 1);
}

function createCountObject(keys) {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

function getIncidentLocation(incident) {
  return (
    incident.location ||
    incident.agentResults?.intake?.fields?.location?.value ||
    incident.agentResults?.request?.location ||
    "Unknown"
  );
}

function getResolvedTimestamp(incident) {
  return incident.resolvedAt || incident.updatedAt || null;
}

function buildRecentTrend(incidents, days = 7) {
  const today = new Date();
  const trendMap = new Map();

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setHours(0, 0, 0, 0);
    date.setDate(today.getDate() - offset);
    trendMap.set(date.toISOString().slice(0, 10), 0);
  }

  for (const incident of incidents) {
    if (!incident.createdAt) {
      continue;
    }

    const key = new Date(incident.createdAt).toISOString().slice(0, 10);
    if (trendMap.has(key)) {
      trendMap.set(key, trendMap.get(key) + 1);
    }
  }

  return [...trendMap.entries()].map(([date, count]) => ({ date, count }));
}

router.get(
  "/analytics",
  requireAuth,
  requireRole("admin", "reviewer"),
  async (req, res, next) => {
    try {
      const incidents = await Incident.find({})
        .select(
          "status type severity department location createdAt updatedAt resolvedAt confidence holdForReview mlFallback clusterGroup agentResults source recoveryMessage followUp",
        )
        .lean();

      const byStatus = {
        OPEN: 0,
        IN_PROGRESS: 0,
        UNDER_REVIEW: 0,
        ASSIGNED: 0,
        PENDING_REVIEW: 0,
        RESOLVED: 0,
        BREACHED: 0,
        CLOSED: 0,
      };
      const byType = createCountObject(CANONICAL_TYPES);
      const bySeverity = createCountObject(SEVERITIES);
      const byDepartment = createCountObject(DEPARTMENTS);
      const byLocation = {};
      const resolutionHours = [];
      const uncertaintyDistribution = {
        low: 0,
        medium: 0,
        high: 0,
      };
      const uncertaintyReasonCounts = new Map();

      let hitlCount = 0;
      let duplicateCount = 0;
      let highUncertaintyCount = 0;
      let slaOnTime = 0;
      let slaTotal = 0;
      let confidenceSum = 0;
      let confidenceCount = 0;
      const SLA_HOURS_MAP = { Critical: 2, High: 4, Medium: 8, Low: 24 };

      for (const incident of incidents) {
        const status = incident.status || "OPEN";
        const type = incident.type || "other";
        const severity = incident.severity || "Medium";
        const department = incident.department || "Operations";
        const location = getIncidentLocation(incident);
        const confidence = Number(incident.confidence || 0);
        const triggeredHitl =
          Boolean(incident.holdForReview) ||
          confidence < 0.75 ||
          ["High", "Critical"].includes(severity);

        if (byStatus[status] !== undefined) {
          byStatus[status] += 1;
        } else {
          byStatus.OPEN += 1;
        }

        byType[type] = (byType[type] || 0) + 1;
        bySeverity[severity] = (bySeverity[severity] || 0) + 1;
        byDepartment[department] = (byDepartment[department] || 0) + 1;
        byLocation[location] = (byLocation[location] || 0) + 1;

        if (triggeredHitl) {
          hitlCount += 1;
        }

        if (incident?.agentResults?.dedup?.isDuplicate) {
          duplicateCount += 1;
        }

        // SLA compliance
        if (incident.createdAt) {
          const slaMs = (SLA_HOURS_MAP[severity] || 8) * 60 * 60 * 1000;
          const deadline = new Date(new Date(incident.createdAt).getTime() + slaMs);
          slaTotal++;
          if (status === "BREACHED") {
            // already breached — not on time
          } else {
            const resolvedTs = getResolvedTimestamp(incident);
            const checkTime = resolvedTs ? new Date(resolvedTs) : new Date();
            if (checkTime <= deadline) slaOnTime++;
          }
        }

        // Confidence tracking
        if (confidence > 0) {
          confidenceSum += confidence;
          confidenceCount++;
        }

        const uncertainty = deriveUncertaintyFromIncident(incident);
        if (uncertainty?.level && uncertaintyDistribution[uncertainty.level] !== undefined) {
          uncertaintyDistribution[uncertainty.level] += 1;
          if (uncertainty.level === "high") {
            highUncertaintyCount += 1;
          }
        }

        for (const reason of uncertainty?.reasons || []) {
          uncertaintyReasonCounts.set(reason, (uncertaintyReasonCounts.get(reason) || 0) + 1);
        }

        if (
          ["RESOLVED", "CLOSED"].includes(status) &&
          incident.createdAt &&
          getResolvedTimestamp(incident)
        ) {
          const hours =
            (new Date(getResolvedTimestamp(incident)).getTime() -
              new Date(incident.createdAt).getTime()) /
            (1000 * 60 * 60);

          if (Number.isFinite(hours) && hours >= 0) {
            resolutionHours.push(hours);
          }
        }
      }

      // ── Triage tier metrics ──────────────────────────────────────────────────
      let triageTiers = { tier0AutoResolved: 0, tier1BatchApproved: 0, tier2Assisted: 0, tier3Escalated: 0, totalIncoming: 0 };
      let hoursSavedToday = 0;
      let preventedThisWeek = 0;
      let preventionBreakdown = { customersContacted: 0, confirmedPrevented: 0, estimatedPrevented: 0, method: 'estimated' };
      try {
        const nowTs = Date.now();
        const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
        const oneDayAgo = nowTs - 24 * 60 * 60 * 1000;
        const sevenDaysAgo = nowTs - 7 * 24 * 60 * 60 * 1000;

        let t0 = 0, t1 = 0, t2 = 0, t3 = 0, incoming = 0, prevented = 0;

        for (const inc of incidents) {
          const status = inc.status || "OPEN";
          const conf = Number(inc.confidence || 0);
          const src = inc.source || "manual";
          const createdMs = inc.createdAt ? new Date(inc.createdAt).getTime() : 0;
          const severity = inc.severity || "Medium";

          if (createdMs && createdMs >= oneDayAgo) incoming++;

          if (status === "RESOLVED") {
            if (conf >= 0.9 || src === "auto") {
              t0++;
            } else if (createdMs && createdMs >= todayStart) {
              t1++;
            } else {
              t2++;
            }
          }

          if (["Critical", "High"].includes(severity) && !["RESOLVED", "CLOSED"].includes(status)) {
            t3++;
          }

          const recStatus = inc.recoveryMessage?.status;
          const recGenAt = inc.recoveryMessage?.generatedAt ? new Date(inc.recoveryMessage.generatedAt).getTime() : 0;
          if (["auto_sent", "approved"].includes(recStatus) && recGenAt && recGenAt >= sevenDaysAgo) {
            prevented++;
          }
        }

        triageTiers = { tier0AutoResolved: t0, tier1BatchApproved: t1, tier2Assisted: t2, tier3Escalated: t3, totalIncoming: incoming };
        hoursSavedToday = roundTo((t0 * 10 + t1 * 9.5 + t2 * 5) / 60, 1);

        // Prevention calculation — real email join if data available, else estimate
        try {
          const recentSends = await ProactiveSend.find({
            status: "sent",
            sentAt: { $gte: new Date(sevenDaysAgo) },
          }).select("customerEmailsContacted estimatedComplaintsPrevented sentAt").lean();

          let confirmedPrevented = 0;
          let totalContacted = 0;

          for (const send of recentSends) {
            const emails = send.customerEmailsContacted || [];
            totalContacted += emails.length;
            for (const email of emails) {
              const subsequent = await Incident.findOne({
                customerEmail: email,
                createdAt: { $gte: send.sentAt },
              }).select("_id").lean();
              if (!subsequent) confirmedPrevented++;
            }
          }

          const estimatedFallback = recentSends.reduce((sum, s) => sum + (s.estimatedComplaintsPrevented || 0), 0);

          if (totalContacted > 0) {
            preventedThisWeek = prevented + confirmedPrevented;
            preventionBreakdown = { customersContacted: totalContacted, confirmedPrevented, estimatedPrevented: estimatedFallback, method: 'confirmed' };
          } else {
            preventedThisWeek = prevented + estimatedFallback;
            preventionBreakdown = { customersContacted: 0, confirmedPrevented: 0, estimatedPrevented: estimatedFallback, method: 'estimated' };
          }
        } catch (_preventErr) {
          // Non-fatal — preventedThisWeek stays as is
        }
      } catch (_triageErr) {
        // Never let triage failures break the analytics response
      }

      // ── Feature D: Resolution Outcome Loop ──────────────────────────────────
      let resolutionOutcomes = {
        totalWithFollowUp: 0,
        overallSatisfactionRate: null,
        byApproach: [],
        recentFollowUps: [],
      };
      try {
        const resolvedIncidents = incidents.filter((inc) =>
          ["RESOLVED", "CLOSED", "BREACHED"].includes(inc.status)
        );

        // Aggregate by approach
        const approachMap = new Map();
        const recentFollowUps = [];

        for (const inc of resolvedIncidents) {
          const approach      = deriveApproach(inc.type || "other");
          const approachLabel = APPROACH_LABELS[approach] || "Standard Process";

          let outcome;
          if (inc.followUp?.outcome) {
            outcome = inc.followUp.outcome;
          } else if (inc.status === "BREACHED") {
            outcome = "escalated";
          } else {
            outcome = "satisfied"; // optimistic proxy for untracked resolutions
          }

          if (!approachMap.has(approach)) {
            approachMap.set(approach, { approach, label: approachLabel, satisfied: 0, total: 0 });
          }
          const bucket = approachMap.get(approach);
          bucket.total++;
          if (outcome === "satisfied") bucket.satisfied++;

          if (inc.followUp?.outcome && inc.followUp?.checkedAt) {
            recentFollowUps.push({
              id:          inc._id.toString(),
              type:        inc.type || "other",
              approach,
              approachLabel,
              outcome:     inc.followUp.outcome,
              severity:    inc.severity || "Medium",
              checkedAt:   inc.followUp.checkedAt,
            });
          }
        }

        const byApproach = [...approachMap.values()]
          .filter((b) => b.total > 0)
          .map((b) => ({
            approach:    b.approach,
            label:       b.label,
            successRate: b.total > 0 ? Math.round((b.satisfied / b.total) * 100) : null,
            count:       b.total,
          }))
          .sort((a, b) => b.count - a.count);

        const confirmedFollowUps = resolvedIncidents.filter((inc) => inc.followUp?.outcome);
        const confirmedSatisfied = confirmedFollowUps.filter((inc) => inc.followUp.outcome === "satisfied").length;
        const overallSatisfactionRate = confirmedFollowUps.length >= 3
          ? Math.round((confirmedSatisfied / confirmedFollowUps.length) * 100)
          : resolvedIncidents.length > 0
            ? Math.round(
                (resolvedIncidents.filter((i) => i.status !== "BREACHED").length / resolvedIncidents.length) * 100
              )
            : null;

        recentFollowUps.sort((a, b) => new Date(b.checkedAt) - new Date(a.checkedAt));

        resolutionOutcomes = {
          totalWithFollowUp: confirmedFollowUps.length,
          overallSatisfactionRate,
          byApproach,
          recentFollowUps: recentFollowUps.slice(0, 8),
        };
      } catch (_outcomesErr) {
        // Non-fatal
      }

      const avgResolutionHours = resolutionHours.length
        ? roundTo(
            resolutionHours.reduce((sum, hours) => sum + hours, 0) / resolutionHours.length,
            1,
          )
        : 0;

      let clustersActiveCount = 0;
      try {
        const activeClusters = await getActiveClusters();
        clustersActiveCount = Array.isArray(activeClusters) ? activeClusters.length : 0;
      } catch (_clusterErr) {
        // Non-fatal — clustersActiveCount stays 0
      }

      // Derived convenience fields expected by dashboard KPI cards
      const autoResolved = byStatus.RESOLVED + byStatus.CLOSED;
      const pendingReview = byStatus.PENDING_REVIEW + byStatus.ASSIGNED;
      const slaCompliance = percent(slaOnTime, slaTotal);
      // avgConfidence in 0-100 range (dashboard uses it without *100 in the fallback branch)
      const avgConfidence = confidenceCount > 0
        ? roundTo((confidenceSum / confidenceCount) * 100, 1)
        : 0;

      return res.status(200).json({
        totalIncidents: incidents.length,
        byStatus,
        byType,
        bySeverity,
        byDepartment,
        byLocation,
        // Resolution time — aliased under all three names the frontend may read
        avgResolutionHours,
        avgResolutionTime: avgResolutionHours,
        avgResolveTime: avgResolutionHours,
        avgResolutionMinutes: Math.round(avgResolutionHours * 60),
        // KPI card fields
        autoResolved,
        pendingReview,
        slaCompliance,
        slaOnTime: slaCompliance, // alias
        avgConfidence,
        clustersActiveCount,
        hitlRate: percent(hitlCount, incidents.length),
        hitlRouted: hitlCount,
        duplicateRate: percent(duplicateCount, incidents.length),
        recentTrend: buildRecentTrend(incidents, 7),
        highUncertaintyCount,
        uncertaintySummary: {
          distribution: uncertaintyDistribution,
          topReasons: [...uncertaintyReasonCounts.entries()]
            .map(([reason, count]) => ({ reason, count }))
            .sort((left, right) => right.count - left.count)
            .slice(0, 5),
        },
        triageTiers,
        hoursSavedToday,
        preventedThisWeek,
        preventionBreakdown,
        resolutionOutcomes,
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  "/ml-stats",
  requireAuth,
  requireRole("admin", "reviewer"),
  async (req, res, next) => {
    try {
      const incidents = await Incident.find({})
        .select("type confidence mlFallback agentResults")
        .lean();

      const classified = incidents.filter(
        (incident) => incident.type && Number.isFinite(Number(incident.confidence)),
      );
      const avgConfidence = classified.length
        ? roundTo(
            classified.reduce((sum, incident) => sum + Number(incident.confidence || 0), 0) /
              classified.length,
            3,
          )
        : 0;
      const avgRawConfidence = classified.length
        ? roundTo(
            classified.reduce(
              (sum, incident) =>
                sum + Number(incident?.agentResults?.mlService?.raw_confidence || incident.confidence || 0),
              0,
            ) / classified.length,
            3,
          )
        : 0;
      const mlFallbackCount = classified.filter((incident) => incident.mlFallback).length;
      const topMismatchMap = new Map();
      const confidenceDistribution = CONFIDENCE_BUCKETS.map((bucket) => ({
        bucket: bucket.label,
        count: 0,
      }));
      const calibrationDeltas = [];

      for (const incident of classified) {
        const confidence = Number(incident.confidence || 0);
        const rawConfidence = Number(
          incident?.agentResults?.mlService?.raw_confidence || incident.confidence || 0,
        );
        const bucket = CONFIDENCE_BUCKETS.find(
          (entry) => confidence >= entry.min && confidence < entry.max,
        );

        if (bucket) {
          const row = confidenceDistribution.find((entry) => entry.bucket === bucket.label);
          row.count += 1;
        }

        if (Number.isFinite(rawConfidence)) {
          calibrationDeltas.push(Math.abs(confidence - rawConfidence));
        }

        const explicitMismatch = incident?.agentResults?.classifier?.mlAgreement === false;
        const derivedMismatch =
          incident?.agentResults?.mlService?.type &&
          incident.type &&
          incident.agentResults.mlService.type !== incident.type;

        if (explicitMismatch || derivedMismatch) {
          const type = incident.type || "other";
          topMismatchMap.set(type, (topMismatchMap.get(type) || 0) + 1);
        }
      }

      const topMismatches = [...topMismatchMap.entries()]
        .map(([type, count]) => ({ type, count }))
        .sort((left, right) => right.count - left.count)
        .slice(0, 5);

      return res.status(200).json({
        totalClassified: classified.length,
        avgConfidence,
        avgRawConfidence,
        avgCalibrationDelta: calibrationDeltas.length
          ? roundTo(
              calibrationDeltas.reduce((sum, value) => sum + value, 0) / calibrationDeltas.length,
              3,
            )
          : 0,
        mlFallbackRate: percent(mlFallbackCount, classified.length),
        confidenceDistribution,
        topMismatches,
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  "/model-health",
  requireAuth,
  requireRole("admin", "reviewer"),
  async (req, res, next) => {
    try {
      const [modelInfo, incidents] = await Promise.all([
        getModelInfo(),
        Incident.find({ type: { $ne: null }, confidence: { $ne: null } })
          .select("type confidence")
          .lean(),
      ]);

      const confidenceByType = Object.fromEntries(
        CANONICAL_TYPES.map((type) => [type, { total: 0, count: 0 }]),
      );

      for (const incident of incidents) {
        const type = incident.type || "other";
        const confidence = Number(incident.confidence || 0);

        if (!confidenceByType[type]) {
          confidenceByType[type] = { total: 0, count: 0 };
        }

        confidenceByType[type].total += confidence;
        confidenceByType[type].count += 1;
      }

      const avgConfidenceByType = Object.fromEntries(
        Object.entries(confidenceByType).map(([type, stats]) => [
          type,
          stats.count ? roundTo(stats.total / stats.count, 3) : 0,
        ]),
      );

      // Overall average confidence across all incidents in DB
      const allConf = incidents.filter((i) => Number(i.confidence) > 0);
      const avgConfidence = allConf.length
        ? roundTo(allConf.reduce((s, i) => s + Number(i.confidence), 0) / allConf.length, 3)
        : Number(modelInfo.accuracy || 0);

      return res.status(200).json({
        modelLoaded: Boolean(modelInfo.modelLoaded),
        lastTrainedAt: modelInfo.lastTrainedAt || null,
        trainingDataSize: Number(modelInfo.trainingDataSize || 0),
        accuracy: Number(modelInfo.accuracy || 0),
        avgConfidence,
        classDistribution: modelInfo.classDistribution || {},
        avgConfidenceByType,
        calibration: modelInfo.calibration || {},
        featureEngineering: modelInfo.featureEngineering || {},
        explainability: modelInfo.explainability || {},
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.get("/clusters", requireAuth, async (req, res, next) => {
  try {
    const clusters = await getActiveClusters();

    // Cross-reference recent ProactiveSends to mark handled/draft clusters
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentSends = await ProactiveSend.find({
      generatedAt: { $gte: since24h },
    }).select('incidentType location status _id').lean();

    const sendMap = new Map();
    for (const send of recentSends) {
      const key = `${send.incidentType}::${send.location}`;
      if (!sendMap.has(key)) sendMap.set(key, send);
    }

    const annotated = clusters.map((c) => {
      const key = `${c.type}::${c.location}`;
      const send = sendMap.get(key);
      return {
        ...c,
        handled: send?.status === 'sent',
        hasDraft: send?.status === 'draft',
        draftId: send?._id?.toString() || null,
      };
    });

    return res.status(200).json(annotated);
  } catch (error) {
    return next(error);
  }
});

router.get(
  "/rpa-runs",
  requireAuth,
  requireRole("admin", "reviewer"),
  async (req, res, next) => {
    try {
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.max(parseInt(req.query.limit, 10) || 20, 1);
      const skip = (page - 1) * limit;

      const [runs, total] = await Promise.all([
        RpaRun.find({})
          .sort({ endTime: -1, createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        RpaRun.countDocuments(),
      ]);

      const normalizedRuns = runs.map((run) => ({
        ...run,
        completedAt: run.endTime || run.completedAt || run.createdAt,
      }));

      return res.status(200).json({
        runs: normalizedRuns,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.get("/audit/:incidentId", requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.incidentId)) {
      return res.status(400).json({ error: "Invalid incident ID" });
    }

    const auditLog = await AuditLog.aggregate([
      {
        $match: {
          incidentId: new mongoose.Types.ObjectId(req.params.incidentId),
        },
      },
      { $sort: { timestamp: 1 } },
      {
        $lookup: {
          from: "users",
          let: { actorValue: "$actor" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$email", "$$actorValue"] },
              },
            },
            {
              $project: {
                _id: 1,
                name: 1,
                role: 1,
                email: 1,
              },
            },
          ],
          as: "actorUser",
        },
      },
      {
        $addFields: {
          actorUser: { $arrayElemAt: ["$actorUser", 0] },
        },
      },
      {
        $addFields: {
          actorName: {
            $ifNull: ["$actorUser.name", "$actor"],
          },
          actorRole: {
            $ifNull: ["$actorUser.role", "$actorType"],
          },
        },
      },
      {
        $project: {
          actorUser: 0,
        },
      },
    ]);

    return res.status(200).json({ auditLog });
  } catch (error) {
    return next(error);
  }
});

router.get(
  "/export/training-candidates",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const candidates = await TrainingCandidate.find({})
        .populate("reviewerId", "name email role")
        .populate("incidentId", "title type severity status source")
        .sort({ timestamp: 1 })
        .lean();

      const filenameDate = new Date().toISOString().slice(0, 10);
      const lines = candidates.map((candidate) => JSON.stringify(candidate)).join("\n");

      res.setHeader("Content-Type", "application/x-ndjson");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="training_candidates_${filenameDate}.jsonl"`,
      );

      return res.status(200).send(lines);
    } catch (error) {
      return next(error);
    }
  },
);

// ── W3: Feedback loop metrics (admin dashboard) ──────────────────────────────
router.get(
  "/feedback-metrics",
  requireAuth,
  requireRole("admin", "reviewer"),
  async (req, res, next) => {
    try {
      const metrics = await getFeedbackMetrics();
      return res.status(200).json(metrics);
    } catch (error) {
      return next(error);
    }
  },
);

// ── Learning Loop: Override Rate Trend (last 4 weeks) ────────────────────────
router.get(
  "/learning-metrics",
  requireAuth,
  requireRole("admin", "reviewer"),
  async (req, res, next) => {
    try {
      const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
      const entries = await FeedbackDatasetEntry.find({
        createdAt: { $gte: fourWeeksAgo },
      }).select("overrideOccurred aiConfidence createdAt").lean();

      // Group by week (week 1 = oldest, week 4 = newest)
      const now = Date.now();
      const weekMs = 7 * 24 * 60 * 60 * 1000;
      const weeks = [
        { label: 'Week 1', start: now - 4 * weekMs, end: now - 3 * weekMs },
        { label: 'Week 2', start: now - 3 * weekMs, end: now - 2 * weekMs },
        { label: 'Week 3', start: now - 2 * weekMs, end: now - weekMs },
        { label: 'Week 4', start: now - weekMs, end: now + 1000 },
      ];

      const weeklyTrend = weeks.map(({ label, start, end }) => {
        const weekEntries = entries.filter((e) => {
          const t = new Date(e.createdAt).getTime();
          return t >= start && t < end;
        });
        const total = weekEntries.length;
        const overrides = weekEntries.filter((e) => e.overrideOccurred).length;
        return {
          week: label,
          overrideRate: total > 0 ? Math.round((overrides / total) * 100) : 0,
          total,
          overrides,
        };
      });

      const totalReviewed = entries.length;
      const totalOverrides = entries.filter((e) => e.overrideOccurred).length;
      const currentOverrideRate = totalReviewed > 0
        ? Math.round((totalOverrides / totalReviewed) * 100)
        : 0;

      // Confidence calibration: accuracy per confidence bucket
      const buckets = [
        { label: '0-50%', min: 0, max: 0.5 },
        { label: '50-70%', min: 0.5, max: 0.7 },
        { label: '70-85%', min: 0.7, max: 0.85 },
        { label: '85-100%', min: 0.85, max: 1.01 },
      ];
      const calibration = buckets.map(({ label, min, max }) => {
        const bucket = entries.filter((e) => {
          const c = e.aiConfidence ?? 0;
          return c >= min && c < max;
        });
        const total = bucket.length;
        const correct = bucket.filter((e) => !e.overrideOccurred).length;
        return {
          bucket: label,
          accuracy: total > 0 ? Math.round((correct / total) * 100) : null,
          count: total,
          avgConfidence: total > 0
            ? Math.round(bucket.reduce((s, e) => s + (e.aiConfidence ?? 0), 0) / total * 100)
            : null,
        };
      });

      const absorbedResolutions = await Incident.countDocuments({
        status: { $in: ['RESOLVED', 'CLOSED'] },
      });
      const RETRAIN_EVERY = 20;
      const nextRetrainIn = RETRAIN_EVERY - (absorbedResolutions % RETRAIN_EVERY);

      return res.status(200).json({
        weeklyTrend, totalReviewed, currentOverrideRate, calibration,
        absorption: {
          absorbedResolutions,
          nextRetrainIn: nextRetrainIn === RETRAIN_EVERY ? 0 : nextRetrainIn,
          retrainThreshold: RETRAIN_EVERY,
        },
      });
    } catch (error) {
      return next(error);
    }
  }
);

// ── W3: Export full feedback dataset as JSONL ─────────────────────────────────
// Only approved decisions are exported (clean ground-truth labels).
router.get(
  "/export/feedback-dataset",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 10000, 50000);
      const rows = await exportFeedbackDataset({ limit });
      const filenameDate = new Date().toISOString().slice(0, 10);
      const lines = rows.map((row) => JSON.stringify(row)).join("\n");

      res.setHeader("Content-Type", "application/x-ndjson");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="feedback_dataset_${filenameDate}.jsonl"`,
      );
      return res.status(200).send(lines);
    } catch (error) {
      return next(error);
    }
  },
);

// ── W2: Pipeline job retry ───────────────────────────────────────────────────
// Requeue a dead-letter or failed pipeline job.
// Resets attempt counter and re-runs the pipeline for the incident.
router.post(
  "/pipeline-jobs/:jobId/retry",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.jobId)) {
        return res.status(400).json({ error: "Invalid job ID" });
      }

      const job = await PipelineJob.findById(req.params.jobId);
      if (!job) {
        return res.status(404).json({ error: "Pipeline job not found" });
      }

      if (!['dead_letter', 'failed'].includes(job.status)) {
        return res.status(400).json({ error: `Cannot retry a job with status '${job.status}'. Only dead_letter or failed jobs can be retried.` });
      }

      const incident = await Incident.findById(job.incidentId).lean();
      if (!incident) {
        return res.status(404).json({ error: "Incident not found for this job" });
      }

      // Reset job to queued so the new run creates a fresh job
      await PipelineJob.findByIdAndUpdate(job._id, {
        status: "queued",
        attempt: job.attempt + 1,
        lastError: null,
        completedAt: null,
      });

      // Kick off a fresh pipeline run (fire-and-forget)
      const rawText = incident.rawInput || incident.description || "";
      runPipeline(incident._id.toString(), rawText).catch((err) =>
        console.error("[retry pipeline]", err.message)
      );

      await AuditLog.create({
        incidentId: incident._id,
        actor: req.user.email,
        actorType: "human",
        action: "status_change",
        field: "pipeline_retry",
        oldValue: job.status,
        newValue: { attempt: job.attempt + 1, retriedBy: req.user.email },
        timestamp: new Date(),
      });

      console.log(`[admin] pipeline retry: job=${job._id} incident=${incident._id} by=${req.user.email}`);
      return res.status(202).json({
        jobId: job._id,
        incidentId: incident._id,
        message: "Pipeline retry queued",
        attempt: job.attempt + 1,
      });
    } catch (error) {
      return next(error);
    }
  },
);

// ── W2: Bulk incident status change ───────────────────────────────────────
// Accepts { ids: string[], status: 'RESOLVED' | 'CLOSED', note?: string }
// Validates each ID, writes audit log for each, returns per-incident result.
router.post(
  "/incidents/bulk-status",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const { ids, status, note } = req.body || {};

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "ids must be a non-empty array" });
      }
      if (ids.length > 100) {
        return res.status(400).json({ error: "Maximum 100 incidents per bulk operation" });
      }
      if (!['RESOLVED', 'CLOSED'].includes(status)) {
        return res.status(400).json({ error: "status must be RESOLVED or CLOSED" });
      }

      const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
      if (validIds.length !== ids.length) {
        return res.status(400).json({ error: "One or more IDs are invalid" });
      }

      // Only move incidents that are not already in the target status
      const incidents = await Incident.find({
        _id: { $in: validIds },
        status: { $ne: status },
      }).lean();

      if (incidents.length === 0) {
        return res.status(200).json({ updated: 0, skipped: ids.length, message: "All incidents already in target status" });
      }

      const now = new Date();
      const targetIds = incidents.map((inc) => inc._id);

      await Incident.updateMany(
        { _id: { $in: targetIds } },
        {
          $set: {
            status,
            ...(status === 'RESOLVED' ? { resolvedAt: now } : {}),
          },
        },
      );

      // Write audit log for each incident (batch insert)
      const auditDocs = incidents.map((inc) => ({
        incidentId: inc._id,
        actor: req.user.email,
        actorType: "human",
        action: "status_change",
        field: "bulk_status",
        oldValue: inc.status,
        newValue: { status, note: note || null, by: req.user.email },
        timestamp: now,
      }));
      await AuditLog.insertMany(auditDocs);

      console.log(`[admin] bulk status: ${incidents.length} incidents -> ${status} by ${req.user.email}`);
      return res.status(200).json({
        updated: incidents.length,
        skipped: ids.length - incidents.length,
        status,
      });
    } catch (error) {
      return next(error);
    }
  },
);

// ── Feature 3: Cascade Risk Routes ───────────────────────────────────────────

const ALERTS_DIR = "C:\\NEXUS_Watch\\alerts";

// GET /api/v1/admin/cascade-risk
// Returns cascade risk for all active clusters that have downstream predictions.
router.get(
  "/cascade-risk",
  requireAuth,
  requireRole("admin", "reviewer"),
  async (req, res, next) => {
    try {
      const clusters = await getActiveClusters();

      // Only return clusters that have a cascade prediction with at least one downstream risk
      const cascadeData = clusters
        .filter(
          (c) =>
            c.cascadeRisk &&
            Array.isArray(c.cascadeRisk.cascadeRisk) &&
            c.cascadeRisk.cascadeRisk.length > 0,
        )
        .map((c) => ({
          clusterId:            c.clusterId,
          sourceHub:            c.location,
          incidentType:         c.type,
          clusterCount:         c.count,
          firstSeen:            c.firstSeen,
          lastSeen:             c.lastSeen,
          overallCascadeScore:  c.cascadeRisk.overallCascadeScore,
          recommendation:       c.cascadeRisk.recommendation,
          downstream:           c.cascadeRisk.cascadeRisk,
        }));

      return res.status(200).json({ cascadeRisk: cascadeData });
    } catch (error) {
      return next(error);
    }
  },
);

// POST /api/v1/admin/cascade-risk/:sourceHub/alert
// Writes a structured JSON alert file to C:\NEXUS_Watch\alerts\ so the
// UiPath bot picks it up on next run and emails the downstream hub managers.
// Returns 200 immediately (the bot handles actual email delivery asynchronously).
router.post(
  "/cascade-risk/:sourceHub/alert",
  requireAuth,
  requireRole("admin", "reviewer"),
  async (req, res, next) => {
    try {
      const { sourceHub } = req.params;

      // Find the active cluster for this hub
      const clusters = await getActiveClusters();
      const cluster = clusters.find((c) => c.location === sourceHub);

      if (!cluster) {
        return res.status(404).json({
          error: `No active cluster found for hub: ${sourceHub}`,
        });
      }

      const cascadeData = cluster.cascadeRisk || predictCascadeRisk(cluster);

      // Build the alert payload
      const alertPayload = {
        alertId:         `cascade-${Date.now()}`,
        generatedAt:     new Date().toISOString(),
        generatedBy:     req.user?.email || "admin",
        sourceHub,
        incidentType:    cluster.type,
        clusterCount:    cluster.count,
        recommendation:  cascadeData.recommendation,
        overallRisk:     cascadeData.overallCascadeScore,
        downstream:      cascadeData.cascadeRisk || [],
      };

      // Write alert file for UiPath bot pickup
      try {
        if (!fs.existsSync(ALERTS_DIR)) {
          fs.mkdirSync(ALERTS_DIR, { recursive: true });
        }
        const alertFile = path.join(
          ALERTS_DIR,
          `cascade_alert_${alertPayload.alertId}.json`,
        );
        fs.writeFileSync(alertFile, JSON.stringify(alertPayload, null, 2), "utf-8");
        console.log(`[cascade] Alert file written: ${alertFile}`);
      } catch (fsError) {
        // Non-fatal: file system may not be accessible in non-Windows environments
        console.warn("[cascade] Could not write alert file:", fsError.message);
      }

      // Log the alert as a CascadeEvent
      CascadeEvent.create({
        eventType: "alert",
        clusterId: cluster.clusterId,
        sourceHub,
        incidentType: cluster.type,
        clusterCount: cluster.count,
        overallCascadeScore: cascadeData.overallCascadeScore,
        recommendation: cascadeData.recommendation,
        alertId: alertPayload.alertId,
        triggeredBy: req.user?.email || "admin",
        downstream: (cascadeData.cascadeRisk || []).map((e) => ({
          hub: e.hub,
          riskLevel: e.riskLevel,
          baseRisk: e.baseRisk,
          delayHours: e.delayHours,
          estimatedImpactTime: e.estimatedImpactTime,
        })),
      }).catch(() => {});

      // Notify all customers affected by this cluster
      const notifyResult = await notifyClusterCustomers(cluster).catch(() => ({ notified: 0, emails: [] }));

      return res.status(200).json({
        success:             true,
        alertId:             alertPayload.alertId,
        sourceHub,
        downstream:          (cascadeData.cascadeRisk || []).length,
        customersNotified:   notifyResult.notified,
        message:             `Alert queued for UiPath bot delivery. ${notifyResult.notified} customer${notifyResult.notified !== 1 ? 's' : ''} notified.`,
        payload:             alertPayload,
      });
    } catch (error) {
      return next(error);
    }
  },
);

// GET /api/v1/admin/cascade-history
router.get(
  "/cascade-history",
  requireAuth,
  requireRole("admin", "reviewer"),
  async (req, res, next) => {
    try {
      const events = await CascadeEvent.find()
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();

      const stats = {
        totalPredictions: await CascadeEvent.countDocuments({ eventType: "prediction" }),
        totalAlerts:      await CascadeEvent.countDocuments({ eventType: "alert" }),
        resolvedAlerts:   await CascadeEvent.countDocuments({ eventType: "alert", resolved: true }),
      };

      return res.status(200).json({ events, stats });
    } catch (error) {
      return next(error);
    }
  },
);

// ── Feature 5: Executive Morning Briefing ─────────────────────────────────────
// Dual auth: accepts JWT cookie (web dashboard) OR X-API-Key header (UiPath RPA bot).
function requireBriefingAuth(req, res, next) {
  const apiKey = req.get("X-API-Key");
  const rpaKey = process.env.RPA_API_KEY;
  if (apiKey && rpaKey && apiKey === rpaKey) {
    req.rpaAuth = true;
    return next();
  }
  // Fall back to cookie auth
  return requireAuth(req, res, () => requireRole("reviewer", "admin")(req, res, next));
}

router.get(
  "/morning-briefing",
  requireBriefingAuth,
  async (req, res) => {
    try {
      const now       = new Date();
      const midnightLocal = new Date(
        now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0
      );

      // ── Overnight stats ────────────────────────────────────────────────
      const [newIncidents, resolvedIncidents, allOvernight] = await Promise.all([
        Incident.countDocuments({ createdAt: { $gte: midnightLocal } }),
        Incident.countDocuments({
          status: "RESOLVED",
          updatedAt: { $gte: midnightLocal },
        }),
        Incident.find(
          { createdAt: { $gte: midnightLocal } },
          "status holdForReview agentResults.classifier agentResults.request sla.deadlineAt sla.breachedAt createdAt"
        ).lean(),
      ]);

      // hitlRate: how many were flagged for review
      const hitlCount = allOvernight.filter((i) => i.holdForReview).length;
      const hitlRate  = allOvernight.length > 0
        ? roundTo((hitlCount / allOvernight.length) * 100, 1) : 0;

      // overrideRate: incidents where classifier type != request.type (approx)
      const overrideCount = allOvernight.filter((i) => {
        const ai  = i.agentResults?.classifier?.fields?.type?.value;
        const req = i.agentResults?.request?.type;
        return ai && req && ai !== req;
      }).length;
      const overrideRate = allOvernight.length > 0
        ? roundTo((overrideCount / allOvernight.length) * 100, 1) : 0;

      // avgResolutionHours: from resolved incidents today
      const resolvedDocs = await Incident.find(
        { status: "RESOLVED", updatedAt: { $gte: midnightLocal } },
        "createdAt updatedAt"
      ).lean();
      const avgResolutionHours = resolvedDocs.length > 0
        ? roundTo(
            resolvedDocs.reduce((sum, i) => {
              const ms = new Date(i.updatedAt) - new Date(i.createdAt);
              return sum + ms / 3600000;
            }, 0) / resolvedDocs.length, 1)
        : 0;

      // ── Needs action now: top 5 by urgency ────────────────────────────
      const activeIncidents = await Incident.find(
        {
          status: { $in: ["OPEN", "ASSIGNED", "PENDING_REVIEW", "DRAFT"] },
        },
        "_id type location severity status holdForReview sla.deadlineAt sla.breachedAt agentResults.intake.fields"
      ).lean();

      const scored = activeIncidents.map((incident) => {
        const deadlineAt = incident.sla?.deadlineAt
          || (incident.agentResults?.intake?.fields?.date
            ? null : null);
        const breachedAt = incident.sla?.breachedAt;
        const hoursUntilBreach = deadlineAt
          ? (new Date(deadlineAt) - now) / 3600000
          : (incident.severity === "Critical" ? -99 : incident.severity === "High" ? 0.5 : 8);

        let reason = hoursUntilBreach < 0
          ? `SLA breached ${Math.abs(hoursUntilBreach).toFixed(1)}h ago`
          : hoursUntilBreach < 2
            ? `SLA breach in ${hoursUntilBreach.toFixed(1)}h`
            : incident.holdForReview
              ? "Pending human review"
              : incident.severity === "Critical"
                ? "Critical severity — immediate action"
                : incident.severity === "High"
                  ? "High severity awaiting resolution"
                  : `Active ${incident.status}`;

        const location = incident.location
          || incident.agentResults?.intake?.fields?.location?.value
          || "Unknown";

        return {
          incidentId: incident._id.toString(),
          type:       incident.type || "unknown",
          location,
          severity:   incident.severity || "Unknown",
          hoursUntilBreach: roundTo(hoursUntilBreach, 1),
          reason,
          _urgencyScore: hoursUntilBreach,
        };
      });

      scored.sort((a, b) => a._urgencyScore - b._urgencyScore);
      const needsActionNow = scored.slice(0, 5).map(({ _urgencyScore, ...rest }) => rest);

      // ── Active clusters ────────────────────────────────────────────────
      let activeClusters = [];
      try {
        const raw = await getActiveClusters();
        activeClusters = (raw || []).map((c) => ({
          type:        c.type || "unknown",
          location:    c.location || "Unknown",
          count:       c.count || 0,
          firstSeen:   c.firstSeen || null,
          cascadeRisk: c.cascadeRisk?.overallRisk || "none",
        }));
      } catch (_) { /* non-critical */ }

      // ── SLA risk ───────────────────────────────────────────────────────
      const allActive = await Incident.find(
        { status: { $in: ["OPEN", "ASSIGNED", "PENDING_REVIEW"] } },
        "sla.deadlineAt sla.breachedAt severity createdAt"
      ).lean();

      const twoHoursFromNow  = new Date(now.getTime() + 2 * 3600000);
      const eightHoursFromNow = new Date(now.getTime() + 8 * 3600000);

      function getImpliedDeadline(inc) {
        if (inc.sla?.deadlineAt) return new Date(inc.sla.deadlineAt);
        const hours = { Critical: 2, High: 4, Medium: 8, Low: 24 }[inc.severity] || 8;
        return new Date(new Date(inc.createdAt).getTime() + hours * 3600000);
      }

      let breachedCount   = 0;
      let nearBreachCount = 0;
      let atRiskCount     = 0;
      for (const inc of allActive) {
        if (inc.sla?.breachedAt) { breachedCount++; continue; }
        const deadline = getImpliedDeadline(inc);
        if (deadline < now) { breachedCount++; }
        else if (deadline < twoHoursFromNow) { nearBreachCount++; }
        else if (deadline < eightHoursFromNow) { atRiskCount++; }
      }

      // ── RPA health ────────────────────────────────────────────────────
      const lastRun = await RpaRun.findOne().sort({ createdAt: -1 }).lean();
      let pendingSyncCount = 0;
      const pendingSyncDir = "C:\\NEXUS_Watch\\pending_sync";
      try {
        const { readdirSync } = await import("fs");
        pendingSyncCount = readdirSync(pendingSyncDir).length;
      } catch (_) { /* folder may not exist on this machine */ }

      const rpaHealth = {
        lastRunAt:          lastRun?.createdAt || null,
        lastRunProcessed:   lastRun?.processedCount || lastRun?.totalFiles || 0,
        lastRunFailed:      lastRun?.failed || (lastRun?.errors?.length ?? 0),
        pendingSyncCount,
      };

      // ── Recommended first action (callAI) ─────────────────────────────
      let recommendedFirstAction = "Review the needs-action queue to begin your shift.";
      try {
        const briefingSummary = [
          needsActionNow.length > 0
            ? `Top urgent: ${needsActionNow[0].severity} ${needsActionNow[0].type} at ${needsActionNow[0].location} (${needsActionNow[0].reason})`
            : "No urgent items",
          `Overnight: ${newIncidents} new, ${resolvedIncidents} resolved`,
          breachedCount > 0 ? `${breachedCount} SLA breached` : null,
          nearBreachCount > 0 ? `${nearBreachCount} near breach (2h)` : null,
          activeClusters.length > 0 ? `${activeClusters.length} active cluster(s)` : null,
        ].filter(Boolean).join(". ");

        recommendedFirstAction = await callAI({
          system: "You are a DHL operations assistant. Respond with exactly one sentence.",
          user: `Tell the ops manager the single most important action to take first this morning based on: ${briefingSummary}. Be specific. Include incident IDs or locations if relevant. One sentence only.`,
          maxTokens: 120,
        });
        recommendedFirstAction = (recommendedFirstAction || "").trim();
        if (!recommendedFirstAction) {
          recommendedFirstAction = "Review the needs-action queue to begin your shift.";
        }
      } catch (_) { /* AI failure is non-critical */ }

      return res.status(200).json({
        generatedAt: now.toISOString(),
        overnight: {
          newIncidents,
          resolvedIncidents,
          avgResolutionHours,
          hitlRate,
          overrideRate,
        },
        needsActionNow,
        activeClusters,
        slaRisk: {
          breached:   breachedCount,
          nearBreach: nearBreachCount,
          atRisk:     atRiskCount,
        },
        rpaHealth,
        recommendedFirstAction,
      });
    } catch (error) {
      console.error("[GET /admin/morning-briefing]", error.message);
      return res.status(500).json({ error: "Failed to generate morning briefing" });
    }
  }
);

// ── POST /api/v1/admin/morning-briefing/send ──────────────────────────────────
// Sends the morning briefing as a styled HTML email to the specified recipient.
router.post(
  "/morning-briefing/send",
  requireBriefingAuth,
  async (req, res) => {
    try {
      const toEmail = req.body?.email;
      if (!toEmail || !toEmail.includes("@")) {
        return res.status(400).json({ error: "Valid email address required in request body" });
      }

      // Re-use the same briefing logic by calling our own GET handler internally
      const now = new Date();
      const midnightLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

      const [newIncidents, resolvedIncidents, allOvernight] = await Promise.all([
        Incident.countDocuments({ createdAt: { $gte: midnightLocal } }),
        Incident.countDocuments({ status: "RESOLVED", updatedAt: { $gte: midnightLocal } }),
        Incident.find({ createdAt: { $gte: midnightLocal } },
          "status holdForReview agentResults.classifier agentResults.request").lean(),
      ]);

      const hitlCount = allOvernight.filter((i) => i.holdForReview).length;
      const hitlRate = allOvernight.length > 0 ? roundTo((hitlCount / allOvernight.length) * 100, 1) : 0;

      const activeIncidents = await Incident.find(
        { status: { $in: ["OPEN", "ASSIGNED", "PENDING_REVIEW", "DRAFT", "UNDER_REVIEW", "IN_PROGRESS"] } },
        "_id type location severity holdForReview agentResults.intake.fields",
      ).lean();

      const SLA_HRS = { Critical: 2, High: 4, Medium: 8, Low: 24 };
      const needsActionNow = activeIncidents
        .map((inc) => {
          const slaMs = (SLA_HRS[inc.severity] || 8) * 3600000;
          const deadline = new Date(new Date(inc.createdAt || now).getTime() + slaMs);
          const hoursUntil = roundTo((deadline - now) / 3600000, 1);
          return { inc, hoursUntil };
        })
        .filter(({ hoursUntil }) => hoursUntil < 4)
        .sort((a, b) => a.hoursUntil - b.hoursUntil)
        .slice(0, 5)
        .map(({ inc, hoursUntil }) => ({
          incidentId: inc._id.toString(),
          type: inc.type || "unknown",
          location: inc.location || inc.agentResults?.intake?.fields?.location?.value || "Unknown",
          severity: inc.severity || "Medium",
          hoursUntilBreach: hoursUntil,
          reason: hoursUntil < 0 ? `SLA breached ${Math.abs(hoursUntil).toFixed(1)}h ago` : `SLA breach in ${hoursUntil.toFixed(1)}h`,
        }));

      const { getActiveClusters: getClusters } = await import("../services/clusterDetection.service.js");
      const clusters = await getClusters().catch(() => []);

      // Build HTML email
      const dateStr = now.toLocaleDateString("en-MY", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
      const timeStr = now.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" });

      const severityBadge = (s) => {
        const colors = { Critical: "#ef4444", High: "#f97316", Medium: "#fbbf24", Low: "#22d3ee" };
        return `<span style="background:${colors[s] || "#64748b"};color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">${s || "Med"}</span>`;
      };

      const needsActionRows = needsActionNow.length > 0
        ? needsActionNow.map((item) => `
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #1e293b;color:#f1f5f9;font-size:13px;">${String(item.type).replace(/_/g, " ")}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:13px;">${item.location}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #1e293b;">${severityBadge(item.severity)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #1e293b;color:${item.hoursUntilBreach < 0 ? "#ef4444" : item.hoursUntilBreach < 2 ? "#f97316" : "#fbbf24"};font-size:13px;font-weight:600;">${item.reason}</td>
          </tr>`).join("")
        : `<tr><td colspan="4" style="padding:16px;text-align:center;color:#64748b;">No urgent incidents — all SLAs on track</td></tr>`;

      const clusterRows = clusters.slice(0, 5).map((c) => `
          <tr>
            <td style="padding:10px 12px;border-bottom:1px solid #1e293b;color:#f1f5f9;font-size:13px;">${String(c.type || "").replace(/_/g, " ")}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #1e293b;color:#94a3b8;font-size:13px;">${c.location || "—"}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #1e293b;color:#22d3ee;font-size:13px;font-weight:700;">${c.count || 0}</td>
          </tr>`).join("") || `<tr><td colspan="3" style="padding:16px;text-align:center;color:#64748b;">No active clusters</td></tr>`;

      const htmlBody = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#030712;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#030712;padding:32px 16px;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#0a0f1e;border:1px solid #1e293b;border-radius:12px;overflow:hidden;max-width:620px;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#0f172a 0%,#0a1628 100%);padding:28px 32px;border-bottom:1px solid #1e293b;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.15em;color:#22d3ee;text-transform:uppercase;">DHL NEXUS AI Platform</p>
                  <h1 style="margin:6px 0 0;font-size:22px;font-weight:800;color:#f1f5f9;">Morning Intelligence Briefing</h1>
                  <p style="margin:4px 0 0;font-size:13px;color:#64748b;">${dateStr} &bull; ${timeStr} MYT</p>
                </td>
                <td align="right" style="vertical-align:top;">
                  <div style="background:#22d3ee18;border:1px solid #22d3ee40;border-radius:8px;padding:10px 14px;text-align:center;">
                    <p style="margin:0;font-size:24px;font-weight:800;color:#22d3ee;">${newIncidents}</p>
                    <p style="margin:2px 0 0;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.1em;">Today's Cases</p>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- KPI Strip -->
        <tr>
          <td style="padding:20px 32px;border-bottom:1px solid #1e293b;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="width:25%;padding:0 8px;">
                  <p style="margin:0;font-size:22px;font-weight:800;color:#10b981;">${resolvedIncidents}</p>
                  <p style="margin:4px 0 0;font-size:10px;color:#64748b;text-transform:uppercase;">Resolved Today</p>
                </td>
                <td align="center" style="width:25%;padding:0 8px;border-left:1px solid #1e293b;">
                  <p style="margin:0;font-size:22px;font-weight:800;color:#fbbf24;">${needsActionNow.length}</p>
                  <p style="margin:4px 0 0;font-size:10px;color:#64748b;text-transform:uppercase;">Need Action Now</p>
                </td>
                <td align="center" style="width:25%;padding:0 8px;border-left:1px solid #1e293b;">
                  <p style="margin:0;font-size:22px;font-weight:800;color:#a78bfa;">${clusters.length}</p>
                  <p style="margin:4px 0 0;font-size:10px;color:#64748b;text-transform:uppercase;">Active Clusters</p>
                </td>
                <td align="center" style="width:25%;padding:0 8px;border-left:1px solid #1e293b;">
                  <p style="margin:0;font-size:22px;font-weight:800;color:#22d3ee;">${hitlRate}%</p>
                  <p style="margin:4px 0 0;font-size:10px;color:#64748b;text-transform:uppercase;">HITL Rate</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Needs Action Now -->
        <tr>
          <td style="padding:24px 32px 0;">
            <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:0.12em;color:#ef4444;text-transform:uppercase;">Needs Action Now</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #1e293b;border-radius:8px;overflow:hidden;">
              <tr style="background:#0f172a;">
                <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.08em;">Type</th>
                <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.08em;">Hub</th>
                <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.08em;">Severity</th>
                <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.08em;">SLA Status</th>
              </tr>
              ${needsActionRows}
            </table>
          </td>
        </tr>

        <!-- Active Clusters -->
        <tr>
          <td style="padding:24px 32px 0;">
            <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:0.12em;color:#a78bfa;text-transform:uppercase;">Active Incident Clusters</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #1e293b;border-radius:8px;overflow:hidden;">
              <tr style="background:#0f172a;">
                <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.08em;">Type</th>
                <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.08em;">Location</th>
                <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.08em;">Count</th>
              </tr>
              ${clusterRows}
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 32px;border-top:1px solid #1e293b;margin-top:24px;">
            <p style="margin:0;font-size:11px;color:#334155;text-align:center;">
              NEXUS AI Platform &bull; DHL Malaysia &bull; Auto-generated ${timeStr} MYT<br>
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin" style="color:#22d3ee;text-decoration:none;">Open Dashboard</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

      const { sendEmail } = await import("../services/email.service.js");
      const sent = await sendEmail(
        toEmail,
        `NEXUS Morning Briefing — ${dateStr}`,
        htmlBody,
      );

      if (!sent) {
        // Queue it even if SMTP failed — return success so caller knows it was attempted
        return res.status(200).json({
          sent: false,
          queued: true,
          reason: "SMTP unavailable — check SMTP_USER/SMTP_PASS in .env",
          briefing: { newIncidents, resolvedIncidents, hitlRate, needsActionNow, clusters: clusters.length },
        });
      }

      console.log(`[morning-briefing] Sent to ${toEmail}`);
      return res.status(200).json({
        sent: true,
        toEmail,
        subject: `NEXUS Morning Briefing — ${dateStr}`,
        briefing: { newIncidents, resolvedIncidents, hitlRate, needsActionNow, clusters: clusters.length },
      });
    } catch (error) {
      console.error("[POST /admin/morning-briefing/send]", error.message);
      return res.status(500).json({ error: "Failed to send morning briefing", detail: error.message });
    }
  },
);

// ── Feature 5: Excellence-Mode Intelligence Map ────────────────────────────────
// POST /api/v1/admin/intelligence/query
// Gathers live operational context, calls Claude, returns answer + hubAlerts for map.
router.post(
  "/intelligence/query",
  requireAuth,
  requireRole("reviewer", "admin"),
  async (req, res) => {
    try {
      const { query } = req.body || {};
      if (!query || typeof query !== "string" || !query.trim()) {
        return res.status(400).json({ error: "query is required" });
      }

      const now = new Date();
      const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

      // ── Step 1: Gather live context ──────────────────────────────────────────
      const [activeIncidents, nearBreachDocs, lastRun, recoverySentCount, clusters] =
        await Promise.all([
          Incident.find(
            { createdAt: { $gte: since24h }, status: { $nin: ["RESOLVED"] } },
            "severity type location status sla.hoursRemaining sla.breachedAt",
          ).lean(),
          Incident.find(
            {
              status: { $nin: ["RESOLVED"] },
              "sla.hoursRemaining": { $lt: 2 },
            },
            "_id location",
          ).lean(),
          RpaRun.findOne().sort({ createdAt: -1 }).lean(),
          Incident.countDocuments({
            "recoveryMessage.status": { $in: ["auto_sent", "approved"] },
            "recoveryMessage.generatedAt": { $gte: midnight },
          }),
          getActiveClusters(),
        ]);

      // Severity/type breakdown
      const severityBreakdown = { Critical: 0, High: 0, Medium: 0, Low: 0 };
      const typeBreakdown = {};
      for (const inc of activeIncidents) {
        if (inc.severity && severityBreakdown[inc.severity] !== undefined)
          severityBreakdown[inc.severity]++;
        if (inc.type) typeBreakdown[inc.type] = (typeBreakdown[inc.type] || 0) + 1;
      }
      const typeStr = Object.entries(typeBreakdown)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([t, n]) => `${t.replace(/_/g, " ")}(${n})`)
        .join(", ") || "none";

      const clusterStr = clusters.length
        ? clusters
            .map((c) => `${c.type.replace(/_/g, " ")} cluster at ${c.location} (${c.count} incidents)`)
            .join("; ")
        : "none";

      const cascadeStr = clusters
        .filter((c) => c.cascadeRisk?.overallCascadeScore > 0.3)
        .map((c) => `${c.location} → ${c.cascadeRisk.recommendation}`)
        .join("; ") || "none";

      const rpaStr = lastRun
        ? `${new Date(lastRun.completedAt || lastRun.createdAt).toLocaleTimeString("en-GB", { timeZone: "Asia/Kuala_Lumpur" })} MYT, processed ${lastRun.processedCount || lastRun.totalFiles || 0} emails, narrative: ${(lastRun.narrative || "no narrative").slice(0, 100)}`
        : "no RPA runs recorded";

      // ── Step 2: Build context string ─────────────────────────────────────────
      const contextString = [
        `Current NEXUS status at ${now.toLocaleTimeString("en-GB", { timeZone: "Asia/Kuala_Lumpur" })} MYT:`,
        `${activeIncidents.length} active incidents (${severityBreakdown.Critical} Critical, ${severityBreakdown.High} High, ${severityBreakdown.Medium} Medium, ${severityBreakdown.Low} Low)`,
        `Incident types: ${typeStr}`,
        `Clusters: ${clusterStr}`,
        `SLA near breach (<2h): ${nearBreachDocs.length} incidents`,
        `Recovery messages sent today: ${recoverySentCount}`,
        `Latest RPA run: ${rpaStr}`,
        `Cascade risk: ${cascadeStr}`,
      ].join("\n");

      // ── Step 3: Call Claude ───────────────────────────────────────────────────
      let answer = "NEXUS intelligence is processing your query.";
      try {
        answer = await callAI({
          system:
            "You are NEXUS, an AI operations intelligence system for DHL Malaysia. " +
            "Answer operational questions concisely and accurately using only the provided data. " +
            "Be specific: name hubs, counts, severities. When describing actions NEXUS took, " +
            "reference what happened automatically. Never invent data. Maximum 3 sentences.",
          user: `${query.trim()}\n\nLive system context:\n${contextString}`,
          maxTokens: 180,
        });
        answer = (answer || "").trim() || "No answer generated.";
      } catch (aiError) {
        console.error("[intelligence/query] AI error:", aiError.message);
        answer = `Based on live data: ${activeIncidents.length} active incidents (${severityBreakdown.Critical} Critical), ${clusters.length} cluster(s) active, ${nearBreachDocs.length} near SLA breach.`;
      }

      // ── Step 4: Build hubAlerts ───────────────────────────────────────────────
      // Priority: cluster (critical) > high cascade (warning) > breached (danger)
      const hubMap = new Map();

      // Breached incidents → danger
      for (const inc of activeIncidents) {
        if (inc.sla?.breachedAt && inc.location) {
          if (!hubMap.has(inc.location)) hubMap.set(inc.location, "danger");
        }
      }

      // High cascade risk → warning (overwrites danger)
      for (const cluster of clusters) {
        const cr = cluster.cascadeRisk;
        if (!cr) continue;
        for (const edge of cr.cascadeRisk || []) {
          if (edge.riskLevel === "high") {
            hubMap.set(edge.hub, "warning");
          }
        }
      }

      // Active cluster source → critical (overwrites all)
      for (const cluster of clusters) {
        hubMap.set(cluster.location, "critical");
      }

      const hubAlerts = Array.from(hubMap.entries()).map(([hub, alertLevel]) => ({
        hub,
        alertLevel,
      }));

      // ── Step 5: Return ────────────────────────────────────────────────────────
      return res.status(200).json({
        answer,
        hubAlerts,
        stats: {
          activeIncidents: activeIncidents.length,
          clustersActive:  clusters.length,
          slaAtRisk:       nearBreachDocs.length,
          recoveryMessagesSent: recoverySentCount,
        },
        queriedAt: now.toISOString(),
      });
    } catch (error) {
      console.error("[POST /admin/intelligence/query]", error.message);
      return res.status(500).json({ error: "Intelligence query failed" });
    }
  },
);

// ── ML Retraining ─────────────────────────────────────────────────────────────

// POST /api/v1/admin/retrain
// Exports real-world resolved incidents, merges with synthetic base, runs train.py.
// Returns 202 immediately — poll /retrain/status for completion.
router.post(
  "/retrain",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    try {
      const result = await triggerRetrain();
      if (result.alreadyRunning) {
        return res.status(409).json({ error: "Training already in progress", startedAt: result.startedAt });
      }
      if (result.error) {
        return res.status(500).json({ error: result.error });
      }
      return res.status(202).json({
        message: "Training job started",
        realRowsAdded: result.realRowsAdded,
        startedAt: result.startedAt,
      });
    } catch (error) {
      console.error("[POST /admin/retrain]", error.message);
      return res.status(500).json({ error: "Failed to start training job" });
    }
  },
);

// GET /api/v1/admin/retrain/status
router.get(
  "/retrain/status",
  requireAuth,
  requireRole("admin", "reviewer"),
  (req, res) => {
    return res.status(200).json(getRetrainJob());
  },
);

router.get(
  "/retrain/history",
  requireAuth,
  requireRole("admin", "reviewer"),
  async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
      const [runs, latest, total, successCount] = await Promise.all([
        RetrainRun.find({}).sort({ startedAt: -1 }).limit(limit).lean(),
        RetrainRun.findOne({ status: "done" }).sort({ finishedAt: -1 }).lean(),
        RetrainRun.countDocuments({}),
        RetrainRun.countDocuments({ status: "done" }),
      ]);
      return res.json({
        runs,
        latest,
        total,
        successCount,
        successRate: total > 0 ? Math.round((successCount / total) * 100) : 0,
      });
    } catch (error) {
      console.error("[GET /admin/retrain/history]", error.message);
      return res.status(500).json({ error: "Failed to load retrain history" });
    }
  },
);

// ── Bulk CSV Training Data Upload ─────────────────────────────────────────────

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV files are accepted"));
    }
  },
});

// POST /api/v1/admin/upload-training-data
// Accepts a CSV with description,label columns. Validates + appends to training_real.csv.
// Does NOT trigger retraining — admin clicks Retrain separately.
router.post(
  "/upload-training-data",
  requireAuth,
  requireRole("admin"),
  csvUpload.single("csv"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No CSV file uploaded. Use field name 'csv'." });
      }

      const content = req.file.buffer.toString("utf-8");
      const allRows = parseCsvBuffer(content);

      if (allRows.length < 2) {
        return res.status(400).json({ error: "CSV appears empty or has no data rows." });
      }

      const header = allRows[0].map((h) => h.toLowerCase().trim());
      const descIdx = header.indexOf("description");
      const labelIdx = header.indexOf("label");

      if (descIdx === -1 || labelIdx === -1) {
        return res.status(400).json({
          error: `CSV must have 'description' and 'label' columns. Found: ${header.join(", ")}`,
        });
      }

      const valid = [];
      const skipped = [];
      const labelCounts = {};

      for (let i = 1; i < allRows.length; i++) {
        const row = allRows[i];
        const description = (row[descIdx] || "").trim();
        const label = (row[labelIdx] || "").trim().toLowerCase();

        if (!description) { skipped.push({ row: i + 1, reason: "empty description" }); continue; }
        if (!VALID_LABELS.includes(label)) { skipped.push({ row: i + 1, reason: `invalid label '${label}'` }); continue; }

        valid.push({ description, label });
        labelCounts[label] = (labelCounts[label] || 0) + 1;
      }

      if (valid.length === 0) {
        return res.status(400).json({
          error: "No valid rows found.",
          skipped: skipped.slice(0, 10),
          validLabels: VALID_LABELS,
        });
      }

      appendRealRows(valid);

      console.log(`[upload-training-data] ${valid.length} rows appended by ${req.user.email}`);
      return res.status(200).json({
        rowsAdded: valid.length,
        skipped: skipped.length,
        labelCounts,
        skippedSamples: skipped.slice(0, 5),
        message: `${valid.length} rows added. Click Retrain to rebuild the model.`,
      });
    } catch (error) {
      console.error("[POST /admin/upload-training-data]", error.message);
      return res.status(500).json({ error: error.message || "Upload failed" });
    }
  },
);

// ── SOP Library CRUD ──────────────────────────────────────────────────────────

// GET /api/v1/admin/sops
router.get(
  "/sops",
  requireAuth,
  requireRole("admin", "reviewer"),
  async (req, res, next) => {
    try {
      const sops = await SopLibrary.find({}).sort({ incidentType: 1, code: 1 }).lean();
      return res.status(200).json(sops);
    } catch (error) {
      return next(error);
    }
  },
);

// POST /api/v1/admin/sops
router.post(
  "/sops",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const { code, title, incidentType, steps, keywords } = req.body || {};

      if (!code || !title || !incidentType || !Array.isArray(steps) || steps.length === 0) {
        return res.status(400).json({ error: "code, title, incidentType, and steps (array) are required" });
      }
      if (!VALID_LABELS.includes(incidentType) && incidentType !== "other") {
        return res.status(400).json({ error: `incidentType must be one of: ${VALID_LABELS.join(", ")}` });
      }

      const now = new Date();
      const actor = req.user?.email || 'Admin';
      const sop = await SopLibrary.create({
        code: code.trim().toUpperCase(),
        title: title.trim(),
        incidentType,
        steps: steps.map((s) => String(s).trim()).filter(Boolean),
        keywords: Array.isArray(keywords) ? keywords.map((k) => k.trim()).filter(Boolean) : [],
        source: 'manual',
        publishedBy: actor,
        publishedAt: now,
        reviewedBy: actor,
        reviewedAt: now,
        statusHistory: [
          { status: 'draft', date: now, by: actor, note: 'SOP manually created' },
          { status: 'reviewed', date: now, by: actor, note: 'Reviewed and approved by admin' },
          { status: 'published', date: now, by: actor, note: 'Published to knowledge library' },
        ],
      });

      console.log(`[sops] created ${sop.code} by ${actor}`);
      return res.status(201).json(sop);
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({ error: `SOP code '${req.body?.code}' already exists` });
      }
      return next(error);
    }
  },
);

// PATCH /api/v1/admin/sops/:code
router.patch(
  "/sops/:code",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const { title, incidentType, steps, keywords, publishedBy, publishedAt, reviewedBy, reviewedAt, source, statusHistory } = req.body || {};
      const updates = {};

      if (title) updates.title = title.trim();
      if (incidentType) {
        if (!VALID_LABELS.includes(incidentType)) {
          return res.status(400).json({ error: `Invalid incidentType` });
        }
        updates.incidentType = incidentType;
      }
      if (Array.isArray(steps) && steps.length > 0) {
        updates.steps = steps.map((s) => String(s).trim()).filter(Boolean);
      }
      if (Array.isArray(keywords)) {
        updates.keywords = keywords.map((k) => k.trim()).filter(Boolean);
      }
      if (publishedBy) updates.publishedBy = String(publishedBy).trim();
      if (publishedAt) updates.publishedAt = new Date(publishedAt);
      if (reviewedBy) updates.reviewedBy = String(reviewedBy).trim();
      if (reviewedAt) updates.reviewedAt = new Date(reviewedAt);
      if (source && ['ai_generated', 'manual', 'imported'].includes(source)) updates.source = source;
      if (Array.isArray(statusHistory)) updates.statusHistory = statusHistory;

      const sop = await SopLibrary.findOneAndUpdate(
        { code: req.params.code.toUpperCase() },
        { $set: updates },
        { new: true },
      );
      if (!sop) return res.status(404).json({ error: "SOP not found" });

      return res.status(200).json(sop);
    } catch (error) {
      return next(error);
    }
  },
);

// DELETE /api/v1/admin/sops/:code
router.delete(
  "/sops/:code",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const sop = await SopLibrary.findOneAndDelete({
        code: { $regex: `^${req.params.code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
      });
      if (!sop) return res.status(404).json({ error: "SOP not found" });
      console.log(`[sops] deleted ${sop.code} by ${req.user.email}`);
      return res.status(200).json({ deleted: true, code: sop.code });
    } catch (error) {
      return next(error);
    }
  },
);

// ── Feature G: Proactive Communications ──────────────────────────────────────

function buildDocPrompt(docType, typeLabel, location, count, caseLines) {
  const noCase = "(No resolved cases on record yet — use general DHL best practice)";
  const cases = caseLines || noCase;

  switch (docType) {
    case "hubNotice":
      return {
        system:
          "You are a DHL operations manager writing an internal memo to a hub manager. " +
          "Be specific, formal, and action-oriented. Name the hub and the incident pattern explicitly. " +
          "Do not use placeholders. Write as if this is a real memo being sent today.",
        user:
          `Write a formal internal notice to the manager of ${location} about a ${typeLabel} incident cluster.\n` +
          `${count} incidents observed. Real customer complaint descriptions:\n${cases}\n\n` +
          `Format: 2-3 focused paragraphs.\n` +
          `Paragraph 1 — What was observed: describe the specific pattern and its operational impact.\n` +
          `Paragraph 2 — Recommended immediate action: specific steps the hub manager should take today.\n` +
          `Paragraph 3 — Expected timeline and monitoring: when to expect improvement, what to watch.\n` +
          `Tone: formal internal memo. Specific to ${location} and ${typeLabel}.`,
        maxTokens: 550,
      };

    case "customerEmail":
      return {
        system:
          "You are writing on behalf of DHL Customer Service. " +
          "Your tone is empathetic, reassuring, and specific. " +
          "Do not make promises you cannot keep. Never use 'Dear Customer' — use a warm greeting. " +
          "Always end with a clear next step. Write a real email, not a template.",
        user:
          `Write a proactive customer email about ${typeLabel} issues affecting shipments through ${location}.\n` +
          `${count} customers may be affected. Real complaint context:\n${cases}\n\n` +
          `Format: First line must be "Subject: [subject line]", then blank line, then email body.\n` +
          `Body must include: (1) warm acknowledgment that we're reaching out before they had to contact us, ` +
          `(2) honest brief explanation of what's happening at ${location}, ` +
          `(3) what DHL is actively doing to resolve it, ` +
          `(4) what the customer should expect and when, ` +
          `(5) how to get help if needed.\n` +
          `Keep under 200 words. Empathetic, specific, professional.`,
        maxTokens: 550,
      };

    case "faqUpdate":
      return {
        system:
          "You write concise, helpful FAQ entries for a courier company's help center. " +
          "Answer the real question customers ask, not the question you wish they asked. " +
          "Be honest about limitations. Write one question and one answer.",
        user:
          `Write one FAQ entry for the DHL help center about ${typeLabel} issues involving shipments from ${location}.\n` +
          `Real customer complaint context:\n${cases}\n\n` +
          `Format:\nQ: [The exact question a customer would type into the search bar — specific, not generic]\n` +
          `A: [Clear, specific answer. Under 90 words. Tell the customer: what's happening, ` +
          `what DHL is doing, what they should do if affected, and how long to wait before escalating.]\n\n` +
          `Do not give generic advice. Reference ${location} specifically.`,
        maxTokens: 350,
      };

    case "pccPlaybook":
      return {
        system:
          "You write PCC (Parcel Care Centre) playbook entries for DHL customer service agents. " +
          "Be direct, practical, and bullet-pointed. Agents read this during a live call — " +
          "every word must count. No preamble, no filler.",
        user:
          `Write a PCC playbook entry for handling customer calls about ${typeLabel} issues from ${location}.\n` +
          `Real complaint context:\n${cases}\n\n` +
          `Format exactly as follows:\n` +
          `## How to identify this call\n` +
          `[3 bullet points — what the customer says that signals this pattern]\n\n` +
          `## What to tell the customer\n` +
          `[4 bullet points — specific scripted responses, use "I" language, be reassuring]\n\n` +
          `## System action\n` +
          `[3 bullet points — what to do in NEXUS/the system: status to set, note to add, team to notify]\n\n` +
          `## Escalate when\n` +
          `[2 bullet points — specific escalation triggers]\n\n` +
          `Specific to ${typeLabel} at ${location}. No generic advice.`,
        maxTokens: 600,
      };

    default:
      return { system: "You are a helpful assistant.", user: "Write a brief note.", maxTokens: 200 };
  }
}

async function fetchCaseLines(incidentType, location) {
  const locationEscaped = location.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const locationRegex = new RegExp(locationEscaped, "i");
  const incidents = await Incident.find({
    type: incidentType,
    status: { $in: ["RESOLVED", "CLOSED"] },
    $or: [
      { location: locationRegex },
      { "agentResults.intake.fields.location.value": locationRegex },
    ],
  })
    .select("rawInput description")
    .sort({ createdAt: -1 })
    .limit(6)
    .lean();

  return incidents
    .map((inc) => (inc.rawInput || inc.description || "").trim())
    .filter((t) => t.length > 10)
    .map((t) => `- "${t}"`)
    .join("\n");
}

// POST /api/v1/admin/proactive/generate
router.post(
  "/proactive/generate",
  requireAuth,
  requireRole("admin", "reviewer"),
  async (req, res) => {
    try {
      const { incidentType, location, clusterId, clusterCount } = req.body || {};
      if (!incidentType || !location) {
        return res.status(400).json({ error: "incidentType and location are required" });
      }

      const caseLines = await fetchCaseLines(incidentType, location);
      const typeLabel = incidentType.replace(/_/g, " ");
      const count = clusterCount || 3;

      const [hubNotice, customerEmail, faqUpdate, pccPlaybook] = await Promise.all([
        callAI(buildDocPrompt("hubNotice", typeLabel, location, count, caseLines)),
        callAI(buildDocPrompt("customerEmail", typeLabel, location, count, caseLines)),
        callAI(buildDocPrompt("faqUpdate", typeLabel, location, count, caseLines)),
        callAI(buildDocPrompt("pccPlaybook", typeLabel, location, count, caseLines)),
      ]);

      const estimatedComplaintsPrevented = Math.round(count * 1.8);

      const send = await ProactiveSend.create({
        incidentType,
        location,
        clusterId: clusterId || null,
        documents: { hubNotice, customerEmail, faqUpdate, pccPlaybook },
        estimatedComplaintsPrevented,
      });

      console.log(`[proactive] generated for ${incidentType} @ ${location} by ${req.user.email}`);
      return res.status(201).json(send);
    } catch (error) {
      console.error("[POST /admin/proactive/generate]", error.message);
      return res.status(500).json({ error: error.message || "Generation failed" });
    }
  },
);

// GET /api/v1/admin/proactive
router.get(
  "/proactive",
  requireAuth,
  requireRole("admin", "reviewer"),
  async (req, res) => {
    try {
      const sends = await ProactiveSend.find({}).sort({ generatedAt: -1 }).limit(50).lean();
      return res.status(200).json(sends);
    } catch (error) {
      console.error("[GET /admin/proactive]", error.message);
      return res.status(500).json({ error: "Failed to load" });
    }
  },
);

// GET /api/v1/admin/proactive/pending-count
router.get(
  "/proactive/pending-count",
  requireAuth,
  requireRole("admin", "reviewer"),
  async (req, res) => {
    try {
      const count = await ProactiveSend.countDocuments({ status: "draft" });
      return res.status(200).json({ count });
    } catch (error) {
      return res.status(500).json({ count: 0 });
    }
  },
);

// PATCH /api/v1/admin/proactive/:id/documents — save edits
router.patch(
  "/proactive/:id/documents",
  requireAuth,
  requireRole("admin", "reviewer"),
  async (req, res) => {
    try {
      const { hubNotice, customerEmail, faqUpdate, pccPlaybook } = req.body || {};
      const updates = {};
      if (hubNotice !== undefined) updates["documents.hubNotice"] = hubNotice;
      if (customerEmail !== undefined) updates["documents.customerEmail"] = customerEmail;
      if (faqUpdate !== undefined) updates["documents.faqUpdate"] = faqUpdate;
      if (pccPlaybook !== undefined) updates["documents.pccPlaybook"] = pccPlaybook;

      const send = await ProactiveSend.findByIdAndUpdate(
        req.params.id,
        { $set: updates },
        { new: true },
      ).lean();
      if (!send) return res.status(404).json({ error: "Not found" });
      return res.status(200).json(send);
    } catch (error) {
      console.error("[PATCH /admin/proactive/:id/documents]", error.message);
      return res.status(500).json({ error: "Update failed" });
    }
  },
);

// POST /api/v1/admin/proactive/:id/regenerate/:docType — regenerate one doc
router.post(
  "/proactive/:id/regenerate/:docType",
  requireAuth,
  requireRole("admin", "reviewer"),
  async (req, res) => {
    try {
      const { id, docType } = req.params;
      const validTypes = ["hubNotice", "customerEmail", "faqUpdate", "pccPlaybook"];
      if (!validTypes.includes(docType)) {
        return res.status(400).json({ error: `Invalid docType: ${docType}` });
      }

      const send = await ProactiveSend.findById(id).lean();
      if (!send) return res.status(404).json({ error: "Not found" });

      const caseLines = await fetchCaseLines(send.incidentType, send.location);
      const typeLabel = send.incidentType.replace(/_/g, " ");
      const count = send.estimatedComplaintsPrevented
        ? Math.round(send.estimatedComplaintsPrevented / 1.8)
        : 3;

      const newText = await callAI(buildDocPrompt(docType, typeLabel, send.location, count, caseLines));

      const updated = await ProactiveSend.findByIdAndUpdate(
        id,
        { $set: { [`documents.${docType}`]: newText } },
        { new: true },
      ).lean();

      return res.status(200).json(updated);
    } catch (error) {
      console.error("[POST /admin/proactive/:id/regenerate/:docType]", error.message);
      return res.status(500).json({ error: "Regeneration failed" });
    }
  },
);

// POST /api/v1/admin/proactive/:id/send — mark sent
router.post(
  "/proactive/:id/send",
  requireAuth,
  requireRole("admin", "reviewer"),
  async (req, res) => {
    try {
      const { documents } = req.body || {};
      if (!Array.isArray(documents) || documents.length === 0) {
        return res.status(400).json({ error: "documents array is required" });
      }

      const send = await ProactiveSend.findByIdAndUpdate(
        req.params.id,
        { $set: { status: "sent", sentDocuments: documents, sentAt: new Date(), sentBy: req.user.email } },
        { new: true },
      ).lean();
      if (!send) return res.status(404).json({ error: "Not found" });

      // Fire side effects after response — emails + SopLibrary upsert
      setImmediate(async () => {
        try {
          const OPS_EMAIL = process.env.OPS_EMAIL || process.env.SMTP_USER || '';
          const typeLabel = (send.incidentType || '').replace(/_/g, ' ');
          const locationEsc = (send.location || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const locationRx = new RegExp(locationEsc, 'i');
          const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000);

          // Hub notice → ops manager email (rendered as enterprise HTML)
          if (documents.includes('hubNotice') && OPS_EMAIL && send.documents?.hubNotice) {
            const incidentCount = Array.isArray(send.affectedIncidentIds)
              ? send.affectedIncidentIds.length
              : null;
            const hubHtml = buildHubNoticeEmail({
              hubNotice:     send.documents.hubNotice,
              location:      send.location,
              incidentType:  send.incidentType,
              incidentCount,
            });
            await sendEmail(
              OPS_EMAIL,
              `[NEXUS] Hub Cluster Alert — ${typeLabel} at ${send.location}`,
              hubHtml,
            ).catch(() => {});
          }

          // Customer email → all affected incident customers (enterprise HTML)
          if (documents.includes('customerEmail') && send.documents?.customerEmail) {
            const affectedIncidents = await Incident.find({
              type: send.incidentType,
              createdAt: { $gte: cutoff },
              $or: [
                { location: locationRx },
                { 'agentResults.intake.fields.location.value': locationRx },
              ],
            }).select('customerEmail agentResults').lean();

            const emails = [...new Set(
              affectedIncidents
                .map((inc) => (
                  inc.customerEmail ||
                  inc.agentResults?.intake?.fields?.customerEmail?.value ||
                  null
                ))
                .filter(Boolean),
            )];

            const customerHtml = buildCustomerNoticeEmail({
              customerEmailContent: send.documents.customerEmail,
              location:             send.location,
              incidentType:         send.incidentType,
            });
            for (const email of emails) {
              await sendEmail(
                email,
                `DHL Service Notice — ${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)} at ${send.location}`,
                customerHtml,
              ).catch(() => {});
            }

            if (emails.length > 0) {
              await ProactiveSend.findByIdAndUpdate(send._id, {
                customerEmailsContacted: emails,
              }).catch(() => {});
            }
          }

          // PCC Playbook → auto-publish to SopLibrary
          if (documents.includes('pccPlaybook') && send.documents?.pccPlaybook) {
            const sopCode = `DHL-PROACTIVE-${(send.incidentType || 'incident').toUpperCase().replace(/_/g, '-')}-${(send.location || '').toUpperCase().replace(/\s+/g, '-')}`;
            const steps = send.documents.pccPlaybook
              .split('\n')
              .map((l) => l.trim())
              .filter((l) => l.length > 0);

            await SopLibrary.findOneAndUpdate(
              { code: sopCode },
              {
                code: sopCode,
                title: `${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)} Cluster Response — ${send.location}`,
                incidentType: send.incidentType,
                steps: steps.length > 0 ? steps : ['Refer to cluster alert for resolution steps'],
                keywords: [send.incidentType, send.location, 'proactive', 'cluster'],
                source: 'ai_generated',
                publishedBy: send.sentBy || 'NEXUS AI',
                publishedAt: new Date(),
              },
              { upsert: true, new: true, setDefaultsOnInsert: true },
            ).catch(() => {});
          }
        } catch (sideEffectErr) {
          console.error('[proactive/send] side-effect error:', sideEffectErr.message);
        }
      });

      console.log(`[proactive] sent ${documents.length} docs for ${send.incidentType}@${send.location} by ${req.user.email}`);
      return res.status(200).json(send);
    } catch (error) {
      console.error("[POST /admin/proactive/:id/send]", error.message);
      return res.status(500).json({ error: "Send failed" });
    }
  },
);

// ── Feature F: Self-Writing SOP ───────────────────────────────────────────────

function generateSopCode(incidentType, location) {
  const typeSlug = incidentType.slice(0, 3).toUpperCase();
  const locSlug = (location || "UNK").replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase();
  const ts = Date.now().toString(36).toUpperCase().slice(-4);
  return `AI-${typeSlug}-${locSlug}-${ts}`;
}

function parseStepsFromAction(text) {
  if (!text) return ["Follow standard procedure"];
  return text
    .split("\n")
    .map((s) => s.trim().replace(/^(\d+[.)]\s*)/, ""))
    .filter(Boolean);
}

// POST /api/v1/admin/generate-sop
// { incidentType, location, clusterId? }
router.post(
  "/generate-sop",
  requireAuth,
  requireRole("admin", "reviewer"),
  async (req, res) => {
    try {
      const { incidentType, location, clusterId } = req.body || {};

      if (!incidentType || !location) {
        return res.status(400).json({ error: "incidentType and location are required" });
      }

      // Dedup: block if a pending draft exists for same type+location in last 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const existingDraft = await SopDraft.findOne({
        incidentType,
        location,
        status: "pending",
        generatedAt: { $gte: sevenDaysAgo },
      }).lean();

      if (existingDraft) {
        return res.status(200).json({ draft: existingDraft, alreadyExists: true });
      }

      // Pull resolved incidents matching type + location (check both location fields)
      const locationEscaped = location.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const locationRegex = new RegExp(locationEscaped, "i");

      const resolvedIncidents = await Incident.find({
        type: incidentType,
        status: { $in: ["RESOLVED", "CLOSED"] },
        $or: [
          { location: locationRegex },
          { "agentResults.intake.fields.location.value": locationRegex },
        ],
      })
        .select("_id rawInput description type status")
        .sort({ createdAt: -1 })
        .limit(8)
        .lean();

      if (resolvedIncidents.length < 3) {
        return res.status(422).json({
          error: `Need at least 3 resolved ${incidentType} incidents at ${location}. Found: ${resolvedIncidents.length}.`,
        });
      }

      // Build prompt with real incident text
      const caseLines = resolvedIncidents
        .map((inc, i) => {
          const text = (inc.rawInput || inc.description || "").trim();
          return text.length > 10 ? `Case ${i + 1}: "${text}"` : null;
        })
        .filter(Boolean)
        .join("\n");

      const typeLabel = incidentType.replace(/_/g, " ");

      const systemPrompt = `You are a senior DHL operations manager with 15 years of experience at the Malaysia Parcel Care Centre. You write Standard Operating Procedures for the NEXUS incident management system. Your procedures are specific, actionable, and grounded in real incident data. You write for PCC agents who need to handle incidents confidently and independently. Do not produce generic advice — every sentence should be specific to the incident type and hub location provided.`;

      const userPrompt = `Write a Standard Operating Procedure based on ${resolvedIncidents.length} resolved "${typeLabel}" incidents at ${location}.

These are the actual customer complaint texts from resolved cases:

${caseLines}

These cases were all resolved successfully. Based on the specific language, patterns, and recurring issues in these real cases, write a Standard Operating Procedure that a PCC agent can follow for future incidents of this type at this hub.

Return a JSON object with EXACTLY these seven fields. No markdown fences, no explanation, only the JSON:
{
  "title": "Specific procedure title naming the hub and incident type, e.g. '${location} — ${typeLabel.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')} Response Protocol'",
  "whenToApply": "2-3 sentences describing the exact trigger — what signals tell a PCC to apply this procedure. Reference specific patterns you see in the cases above.",
  "rootCause": "1-2 sentences on the typical root cause observed in these specific cases. Be precise — reference the hub, the incident pattern, and what operationally causes this.",
  "recommendedAction": "Numbered step-by-step action plan. Use a newline between each step. Be specific: name the system to check, the team to contact, the message to send. Minimum 4 steps.",
  "expectedOutcome": "1-2 sentences on what a successful resolution looks like if this procedure is followed correctly.",
  "estimatedResolutionTime": "A specific time estimate based on the patterns in these cases, e.g. '4-8 hours', '1 business day'.",
  "evidenceCount": ${resolvedIncidents.length}
}`;

      const raw = await callAI({ system: systemPrompt, user: userPrompt, maxTokens: 900 });

      // Parse JSON — strip any accidental fences
      let content;
      try {
        const cleaned = raw.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
        content = JSON.parse(cleaned);
      } catch {
        return res.status(502).json({ error: "AI returned unparseable response. Try again." });
      }

      const draft = await SopDraft.create({
        incidentType,
        location,
        clusterId: clusterId || null,
        status: "pending",
        generatedContent: {
          title: content.title || `${location} — ${typeLabel} Protocol`,
          whenToApply: content.whenToApply || "",
          rootCause: content.rootCause || "",
          recommendedAction: content.recommendedAction || "",
          expectedOutcome: content.expectedOutcome || "",
          estimatedResolutionTime: content.estimatedResolutionTime || "TBD",
          evidenceCount: resolvedIncidents.length,
        },
        evidenceIds: resolvedIncidents.map((inc) => inc._id),
      });

      console.log(`[sop-draft] generated for ${incidentType} @ ${location} by ${req.user.email}`);
      return res.status(201).json({ draft, alreadyExists: false });
    } catch (error) {
      console.error("[POST /admin/generate-sop]", error.message);
      return res.status(500).json({ error: error.message || "SOP generation failed" });
    }
  },
);

// GET /api/v1/admin/sop-drafts
// Returns all non-rejected drafts + pending count
router.get(
  "/sop-drafts",
  requireAuth,
  requireRole("admin", "reviewer"),
  async (req, res) => {
    try {
      const drafts = await SopDraft.find({ status: { $ne: "rejected" } })
        .sort({ generatedAt: -1 })
        .lean();

      const pendingCount = drafts.filter((d) => d.status === "pending").length;
      return res.status(200).json({ drafts, pendingCount });
    } catch (error) {
      console.error("[GET /admin/sop-drafts]", error.message);
      return res.status(500).json({ error: "Failed to load drafts" });
    }
  },
);

// POST /api/v1/admin/sop-drafts/:id/approve
// Creates SopLibrary entry from draft, marks approved
router.post(
  "/sop-drafts/:id/approve",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    try {
      const draft = await SopDraft.findById(req.params.id).lean();
      if (!draft) return res.status(404).json({ error: "Draft not found" });
      if (draft.status !== "pending") {
        return res.status(409).json({ error: `Draft is already ${draft.status}` });
      }

      const c = draft.generatedContent || {};
      const code = generateSopCode(draft.incidentType, draft.location);
      const steps = parseStepsFromAction(c.recommendedAction);

      const now = new Date();
      const actor = req.user?.email || 'Admin';
      const generatedAt = draft.generatedAt ? new Date(draft.generatedAt) : now;
      const sop = await SopLibrary.create({
        code,
        title: c.title || `${draft.location} — ${draft.incidentType.replace(/_/g, " ")} Protocol`,
        incidentType: draft.incidentType,
        steps,
        keywords: [
          draft.incidentType,
          draft.location.toLowerCase(),
          "ai-generated",
        ].filter(Boolean),
        source: 'ai_generated',
        publishedBy: actor,
        publishedAt: now,
        reviewedBy: actor,
        reviewedAt: now,
        statusHistory: [
          { status: 'draft', date: generatedAt, by: 'NEXUS AI', note: 'AI-generated from resolved incident cluster' },
          { status: 'reviewed', date: now, by: actor, note: 'Human reviewer approved content' },
          { status: 'published', date: now, by: actor, note: 'Published to knowledge library' },
        ],
      });

      await SopDraft.findByIdAndUpdate(draft._id, {
        status: "approved",
        reviewedAt: now,
        reviewedBy: actor,
        publishedSopCode: code,
      });

      console.log(`[sop-draft] approved → published as ${code} by ${req.user.email}`);
      return res.status(200).json({ sop, publishedSopCode: code });
    } catch (error) {
      console.error("[POST /admin/sop-drafts/:id/approve]", error.message);
      return res.status(500).json({ error: error.message || "Approval failed" });
    }
  },
);

// POST /api/v1/admin/sop-drafts/:id/reject
router.post(
  "/sop-drafts/:id/reject",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    try {
      const draft = await SopDraft.findByIdAndUpdate(
        req.params.id,
        { status: "rejected", reviewedAt: new Date(), reviewedBy: req.user.email },
        { new: true },
      ).lean();

      if (!draft) return res.status(404).json({ error: "Draft not found" });
      console.log(`[sop-draft] rejected ${req.params.id} by ${req.user.email}`);
      return res.status(200).json({ rejected: true, id: req.params.id });
    } catch (error) {
      console.error("[POST /admin/sop-drafts/:id/reject]", error.message);
      return res.status(500).json({ error: "Rejection failed" });
    }
  },
);

router.get(
  "/audit-log",
  requireAuth,
  requireRole("admin", "reviewer"),
  async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
      const actorType = req.query.actorType;
      const action = req.query.action;
      const search = (req.query.search || "").trim();

      const query = {};
      if (actorType) query.actorType = actorType;
      if (action) query.action = action;
      if (search) {
        query.$or = [
          { actor: { $regex: search, $options: "i" } },
          { action: { $regex: search, $options: "i" } },
          { field: { $regex: search, $options: "i" } },
        ];
      }

      const [logs, total, actorBreakdown] = await Promise.all([
        AuditLog.find(query)
          .populate("incidentId", "title type severity status")
          .sort({ timestamp: -1 })
          .limit(limit)
          .lean(),
        AuditLog.countDocuments(query),
        AuditLog.aggregate([
          { $group: { _id: "$actorType", count: { $sum: 1 } } },
        ]),
      ]);

      return res.json({
        logs,
        total,
        actorBreakdown: actorBreakdown.reduce((acc, item) => {
          acc[item._id || "unknown"] = item.count;
          return acc;
        }, {}),
      });
    } catch (error) {
      console.error("[GET /admin/audit-log]", error.message);
      return res.status(500).json({ error: "Failed to load audit log" });
    }
  },
);

router.get(
  "/outbound-emails",
  requireAuth,
  requireRole("admin", "reviewer"),
  async (req, res) => {
    try {
      const OutboundEmail = (await import("../models/OutboundEmail.model.js")).default;
      const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
      const status = req.query.status;
      const search = (req.query.search || "").trim();

      const query = {};
      if (status) query.status = status;
      if (search) {
        query.$or = [
          { to: { $regex: search, $options: "i" } },
          { subject: { $regex: search, $options: "i" } },
        ];
      }

      const [emails, statusBreakdown] = await Promise.all([
        OutboundEmail.find(query)
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean(),
        OutboundEmail.aggregate([
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),
      ]);

      return res.json({
        emails,
        statusBreakdown: statusBreakdown.reduce((acc, item) => {
          acc[item._id || "unknown"] = item.count;
          return acc;
        }, {}),
      });
    } catch (error) {
      console.error("[GET /admin/outbound-emails]", error.message);
      return res.status(500).json({ error: "Failed to load emails" });
    }
  },
);

router.get(
  "/export/audit-log",
  requireAuth,
  requireRole("admin", "reviewer"),
  async (req, res, next) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 5000, 10000);
      const since = req.query.since ? new Date(req.query.since) : undefined;

      const query = since ? { timestamp: { $gte: since } } : {};
      const logs = await AuditLog.find(query)
        .populate("incidentId", "title type severity status")
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();

      const escape = (v) => {
        if (v == null) return '';
        const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
        return `"${s.replace(/"/g, '""')}"`;
      };

      const header = ['timestamp', 'incident_id', 'incident_title', 'incident_type', 'incident_severity', 'incident_status', 'actor', 'actor_type', 'action', 'field', 'old_value', 'new_value', 'confidence'];
      const rows = logs.map((log) => [
        log.timestamp ? new Date(log.timestamp).toISOString() : '',
        log.incidentId?._id?.toString() || log.incidentId?.toString() || '',
        log.incidentId?.title || '',
        log.incidentId?.type || '',
        log.incidentId?.severity || '',
        log.incidentId?.status || '',
        log.actor || '',
        log.actorType || '',
        log.action || '',
        log.field || '',
        log.oldValue != null ? (typeof log.oldValue === 'object' ? JSON.stringify(log.oldValue) : String(log.oldValue)) : '',
        log.newValue != null ? (typeof log.newValue === 'object' ? JSON.stringify(log.newValue) : String(log.newValue)) : '',
        log.confidence != null ? log.confidence : '',
      ].map(escape).join(','));

      const csv = [header.map(escape).join(','), ...rows].join('\n');
      const date = new Date().toISOString().slice(0, 10);

      res.setHeader('Content-Type', 'text/csv;charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="nexus_audit_log_${date}.csv"`);
      return res.status(200).send(csv);
    } catch (error) {
      return next(error);
    }
  },
);

// POST /api/v1/admin/proactive/:id/acknowledge
router.post(
  "/proactive/:id/acknowledge",
  requireAuth,
  requireRole("admin", "reviewer", "reporter"),
  async (req, res) => {
    try {
      const { note } = req.body || {};
      const updated = await ProactiveSend.findByIdAndUpdate(
        req.params.id,
        {
          acknowledgedAt: new Date(),
          acknowledgedBy: req.user?.email || req.user?.name || "unknown",
          acknowledgedNote: note || null,
        },
        { new: true }
      );
      if (!updated) return res.status(404).json({ error: "Alert not found" });
      return res.status(200).json({ ok: true, alert: updated });
    } catch (error) {
      console.error("[POST /admin/proactive/:id/acknowledge]", error.message);
      return res.status(500).json({ error: "Failed to acknowledge alert" });
    }
  }
);

// ── Live ROI Counter ─────────────────────────────────────────────────────────
router.get(
  "/roi-live",
  requireAuth,
  async (req, res, next) => {
    try {
      const incidents = await Incident.find({})
        .select("status confidence source severity createdAt updatedAt recoveryMessage")
        .lean();

      const now = Date.now();
      const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).getTime();

      let autoResolved = 0;
      let assisted = 0;
      let totalResolved = 0;
      let totalMinutesSaved = 0;

      for (const inc of incidents) {
        const status = inc.status || "OPEN";
        const conf = Number(inc.confidence || 0);
        const src = inc.source || "manual";

        if (["RESOLVED", "CLOSED"].includes(status)) {
          totalResolved++;
          if (conf >= 0.9 || src === "auto") {
            autoResolved++;
            totalMinutesSaved += 10;
          } else if (conf >= 0.7) {
            assisted++;
            totalMinutesSaved += 7;
          } else {
            totalMinutesSaved += 3;
          }
        }
      }

      const hoursSaved = roundTo(totalMinutesSaved / 60, 1);
      const laborRatePerHour = 25;
      const costSaved = Math.round(hoursSaved * laborRatePerHour);

      const proactiveSends = await ProactiveSend.countDocuments({ status: "sent" });

      return res.json({
        hoursSaved,
        costSaved,
        currency: "RM",
        autoResolved,
        assisted,
        totalResolved,
        preventedComplaints: proactiveSends,
        incidentsProcessed: incidents.length,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      return next(error);
    }
  },
);

/* ── Autonomous Actions Kill Switch ─────────────────────────────────────────── */

router.get(
  "/autonomous-config",
  requireAuth,
  requireRole("admin"),
  async (_req, res, next) => {
    try {
      const enabled = await SystemConfig.getValue("autonomous_actions_enabled", true);
      res.json({ enabled });
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  "/autonomous-config",
  requireAuth,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const { enabled } = req.body;
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ error: "enabled must be a boolean" });
      }
      await SystemConfig.setValue(
        "autonomous_actions_enabled",
        enabled,
        req.user?.email || "admin",
      );
      await AuditLog.create({
        actor: req.user?.email || "admin",
        actorType: "user",
        action: enabled ? "autonomous_enabled" : "autonomous_disabled",
        newValue: { enabled },
        timestamp: new Date(),
      });
      res.json({ enabled, updatedAt: new Date().toISOString() });
    } catch (error) {
      next(error);
    }
  },
);

// ── Customer Profile KB endpoints ──────────────────────────────────────────────
router.get(
  "/customers/:email",
  requireAuth,
  requireRole("admin", "reviewer"),
  async (req, res) => {
    try {
      const email = decodeURIComponent(req.params.email).toLowerCase().trim();
      const profile = await getProfile(email);
      if (!profile) {
        return res.status(404).json({ error: "Customer profile not found" });
      }

      const incidents = await Incident.find({ customerEmail: email })
        .select("_id title type status severity location createdAt resolvedAt followUp chatEscalatedAt")
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

      return res.json({ profile, incidents });
    } catch (error) {
      console.error("[GET /admin/customers/:email]", error.message);
      return res.status(500).json({ error: "Failed to fetch customer profile" });
    }
  },
);

router.get(
  "/customers",
  requireAuth,
  requireRole("admin", "reviewer"),
  async (req, res) => {
    try {
      const { tag, trend, limit: rawLimit = "50" } = req.query;
      const queryLimit = Math.min(parseInt(rawLimit, 10) || 50, 200);

      const filter = {};
      if (tag) filter.tags = tag;
      if (trend) filter.frustrationTrend = trend;

      const profiles = await CustomerProfile.find(filter)
        .select("email name totalCases averageSentiment frustrationTrend tags totalEscalations lastSeenAt")
        .sort({ lastSeenAt: -1 })
        .limit(queryLimit)
        .lean();

      return res.json({ profiles, total: profiles.length });
    } catch (error) {
      console.error("[GET /admin/customers]", error.message);
      return res.status(500).json({ error: "Failed to fetch customer profiles" });
    }
  },
);

// ── Knowledge Graph Edges ─────────────────────────────────────────────────────
router.get(
  "/knowledge-graph-edges",
  requireAuth,
  requireRole("admin", "reviewer"),
  async (req, res, next) => {
    try {
      const embeddings = await Embedding.find(
        {},
        { incidentId: 1, vector: 1 },
      ).lean();

      if (embeddings.length < 2) {
        return res.json({ edges: [] });
      }

      const incidentIds = embeddings.map((e) => String(e.incidentId));
      const incidents = await Incident.find(
        { _id: { $in: embeddings.map((e) => e.incidentId) } },
        {
          type: 1,
          location: 1,
          status: 1,
          createdAt: 1,
          resolutionNote: 1,
          "agentResults.resolution": 1,
        },
      ).lean();

      const incMap = new Map();
      for (const inc of incidents) {
        incMap.set(String(inc._id), inc);
      }

      function dot(a, b) {
        let sum = 0;
        for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
        return sum;
      }
      function norm(v) {
        return Math.sqrt(dot(v, v));
      }
      function cosSim(a, b) {
        const d = norm(a) * norm(b);
        return d === 0 ? 0 : dot(a, b) / d;
      }

      const edges = [];
      const edgeSet = new Set();
      function addEdge(srcId, tgtId, weight, edgeType) {
        const key = srcId < tgtId
          ? `${srcId}:${tgtId}:${edgeType}`
          : `${tgtId}:${srcId}:${edgeType}`;
        if (edgeSet.has(key)) return;
        edgeSet.add(key);
        edges.push({ source: srcId, target: tgtId, weight, edgeType });
      }

      // Similar edges: top-5 nearest neighbors by cosine similarity > 0.72
      for (let i = 0; i < embeddings.length; i++) {
        const ranked = [];
        for (let j = 0; j < embeddings.length; j++) {
          if (i === j) continue;
          const sim = cosSim(embeddings[i].vector, embeddings[j].vector);
          if (sim > 0.72) ranked.push({ j, sim });
        }
        ranked.sort((a, b) => b.sim - a.sim);
        for (let k = 0; k < Math.min(5, ranked.length); k++) {
          addEdge(
            incidentIds[i],
            incidentIds[ranked[k].j],
            ranked[k].sim,
            "similar",
          );
        }
      }

      // Cascade edges: same hub, same type, within 2-hour window
      for (let i = 0; i < incidentIds.length; i++) {
        const incA = incMap.get(incidentIds[i]);
        if (!incA?.location || !incA?.type || !incA?.createdAt) continue;
        for (let j = i + 1; j < incidentIds.length; j++) {
          const incB = incMap.get(incidentIds[j]);
          if (!incB?.location || !incB?.type || !incB?.createdAt) continue;
          if (incA.location !== incB.location || incA.type !== incB.type) continue;
          const diff = Math.abs(
            new Date(incA.createdAt).getTime() - new Date(incB.createdAt).getTime(),
          );
          if (diff <= 2 * 60 * 60 * 1000) {
            const weight = 1 - diff / (2 * 60 * 60 * 1000);
            addEdge(incidentIds[i], incidentIds[j], weight, "cascade");
          }
        }
      }

      // Resolved-by edges: resolved incidents grouped by similar resolution text
      const resolvedIncs = [];
      for (let i = 0; i < incidentIds.length; i++) {
        const inc = incMap.get(incidentIds[i]);
        if (!inc || inc.status !== "RESOLVED") continue;
        const resText =
          inc.resolutionNote ||
          inc.agentResults?.resolution?.steps?.join(" ") ||
          "";
        if (resText.length < 10) continue;
        const emb = embeddings[i];
        resolvedIncs.push({ id: incidentIds[i], resText, vector: emb.vector });
      }
      for (let i = 0; i < resolvedIncs.length; i++) {
        for (let j = i + 1; j < resolvedIncs.length; j++) {
          const sim = cosSim(resolvedIncs[i].vector, resolvedIncs[j].vector);
          if (sim > 0.85) {
            addEdge(resolvedIncs[i].id, resolvedIncs[j].id, sim, "resolved_by");
          }
        }
      }

      edges.sort((a, b) => b.weight - a.weight);
      return res.json({ edges: edges.slice(0, 300) });
    } catch (error) {
      return next(error);
    }
  },
);

export default router;

router.post(
  "/ops-chat",
  requireAuth,
  requireRole("admin", "reviewer"),
  async (req, res) => {
    try {
      const { message, conversationHistory = [] } = req.body;
      if (!message || typeof message !== "string") {
        return res.status(400).json({ reply: "Message is required.", contextUsed: [] });
      }

      // Step 1 — Detect if message mentions a specific incident ID
      const match = message.match(/INC-([A-Za-z0-9]+)/i);
      let matchedIncident = null;
      if (match) {
        const shortId = match[1].toLowerCase();
        matchedIncident = await Incident.findOne({
          $expr: {
            $regexMatch: {
              input: { $toString: "$_id" },
              regex: shortId,
              options: "i",
            },
          },
        }).lean();
      }

      // Step 2 — Gather live context
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [
        recentIncidents,
        activeClusters,
        rpaRuns,
        auditLogs,
        reviewQueueCount,
        recoveryCount,
        sopLibrary,
      ] = await Promise.all([
        Incident.find({ status: { $nin: ["RESOLVED", "BREACHED", "CLOSED"] } })
          .select("_id type severity location status customerEmail awbNumber title description sla department confidence recoveryMessage createdAt updatedAt")
          .sort({ createdAt: -1 })
          .limit(60)
          .lean(),
        getActiveClusters(),
        RpaRun.find().sort({ completedAt: -1 }).limit(3).lean(),
        AuditLog.find()
          .sort({ createdAt: -1 })
          .limit(5)
          .select("action incidentId createdAt actorType newValue")
          .lean(),
        Incident.countDocuments({ status: "PENDING_REVIEW" }),
        Incident.countDocuments({
          "recoveryMessage.status": { $in: ["auto_sent", "approved"] },
          "recoveryMessage.generatedAt": { $gte: today },
        }),
        SopLibrary.find({}).select("code incidentType title steps").limit(30).lean(),
      ]);

      // Step 2b — Semantic search via ML service (non-blocking)
      let semanticHits = [];
      try {
        const mlRes = await fetch(`${FASTAPI_URL}/embeddings/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: message, top_k: 5 }),
          signal: AbortSignal.timeout(3000),
        });
        if (mlRes.ok) {
          const mlData = await mlRes.json();
          semanticHits = mlData.candidates || [];
        }
      } catch (_) {
        // ML service unavailable — context still rich without semantic hits
      }

      // Step 3 — Build context string
      const typeCounts = recentIncidents.reduce((acc, inc) => {
        acc[inc.type] = (acc[inc.type] || 0) + 1;
        return acc;
      }, {});
      const typeCountStr = Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => `${type}: ${count}`)
        .join(", ");

      const severityCounts = recentIncidents.reduce(
        (acc, inc) => {
          const sev = inc.severity || "Unknown";
          acc[sev] = (acc[sev] || 0) + 1;
          return acc;
        },
        { Critical: 0, High: 0, Medium: 0, Low: 0 }
      );

      const locationCounts = recentIncidents.reduce((acc, inc) => {
        const loc = inc.location || "Unknown";
        acc[loc] = (acc[loc] || 0) + 1;
        return acc;
      }, {});
      const locationCountStr = Object.entries(locationCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([loc, count]) => `${loc}: ${count}`)
        .join(", ");

      const clustersStr =
        activeClusters && activeClusters.length > 0
          ? activeClusters
              .map((c) => `${c.type} at ${c.location} (${c.count} incidents)`)
              .join("; ")
          : "none";

      let rpaStr = "none";
      let rpaNarrative = "none";
      if (rpaRuns && rpaRuns.length > 0) {
        const latest = rpaRuns[0];
        const runTime = latest.completedAt || latest.endTime || latest.createdAt;
        rpaStr = `completed at ${runTime ? new Date(runTime).toLocaleString() : 'unknown time'}, processed ${
          latest.processedCount || latest.totalFiles || 0
        } emails, failed ${latest.failed || 0}`;
        rpaNarrative = latest.narrative && latest.narrative.trim() !== ""
          ? latest.narrative.substring(0, 120)
          : "none";
      }

      const auditStr =
        auditLogs && auditLogs.length > 0
          ? auditLogs
              .map((a) => `${a.action} on INC-${String(a.incidentId).slice(-6).toUpperCase()} by ${a.actorType}`)
              .join("\n")
          : "none";

      // Top 20 incidents with full INC-IDs for the model to cite
      const SEV_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 };
      const topIncidents = [...recentIncidents]
        .sort((a, b) => (SEV_ORDER[a.severity] ?? 4) - (SEV_ORDER[b.severity] ?? 4))
        .slice(0, 20);

      const incidentListStr = topIncidents
        .map((inc) => {
          const ref = `INC-${String(inc._id).slice(-6).toUpperCase()}`;
          const needsReview = inc.status === "PENDING_REVIEW" ? " ⚠ NEEDS REVIEW" : "";
          const hasRecovery = inc.recoveryMessage?.status === "hitl_required" ? " 🔔 AWAITING APPROVAL" : "";
          return `${ref} | ${inc.severity || "?"} | ${(inc.type || "unknown").replace(/_/g, " ")} | ${inc.location || "Unknown"} | ${inc.status}${needsReview}${hasRecovery}`;
        })
        .join("\n");

      // SOP library summary
      const sopStr = sopLibrary && sopLibrary.length > 0
        ? sopLibrary.map((s) => `${s.code} (${s.incidentType}): ${s.title || s.steps?.[0]?.slice(0, 60) || "—"}`).join("\n")
        : "No SOPs in library";

      let contextString = `NEXUS Live Context at ${new Date().toISOString()}:
Active incidents: ${recentIncidents.length} total — ${severityCounts.Critical} Critical, ${severityCounts.High} High, ${severityCounts.Medium} Medium, ${severityCounts.Low} Low
Incident types (by volume): ${typeCountStr}
Incident locations (by volume): ${locationCountStr}
Review queue: ${reviewQueueCount} awaiting human review
Recovery messages sent today: ${recoveryCount}

Active clusters: ${clustersStr}

Latest RPA run: ${rpaStr}
RPA narrative: ${rpaNarrative}

Recent audit actions:
${auditStr}

TOP INCIDENTS (cite these IDs in your responses):
${incidentListStr}

SOP KNOWLEDGE BASE:
${sopStr}`;

      if (semanticHits.length > 0) {
        contextString += `\n\nSEMANTICALLY SIMILAR PAST INCIDENTS (vector KB — most relevant to this query):
${semanticHits.map((h, i) => `${i + 1}. [${Math.round((h.similarity || h.rrfScore || 0) * 100)}% match] ${(h.incidentText || "").substring(0, 150)}`).join("\n")}`;
      }

      if (matchedIncident) {
        const ref = `INC-${String(matchedIncident._id).slice(-6).toUpperCase()}`;
        contextString += `\n\nFull record for ${ref}:\n${JSON.stringify(matchedIncident, null, 2)}`;
      }

      // Step 4 — Formatting and Calling callAI()
      let historyCopy = [...conversationHistory];
      let historyString = "";
      if (historyCopy.length > 0) {
        historyString = historyCopy
          .map((m) => `[${m.role === "assistant" ? "NEXUS" : "Staff"}]: ${m.content}`)
          .join("\n");

        while (historyString.length > 1800 && historyCopy.length > 2) {
          historyCopy.shift();
          historyString = historyCopy
            .map((m) => `[${m.role === "assistant" ? "NEXUS" : "Staff"}]: ${m.content}`)
            .join("\n");
        }
        historyString += "\n\n";
      }

      const systemPrompt = `You are NEXUS Ops Intelligence, an internal AI assistant for DHL Malaysia 
operations staff. You have access to live incident data, cluster detections, 
RPA run history, and audit logs provided in the context below.

Rules:
- Formatting: Use Markdown. Bold important numbers and hub names. Use bullet points for lists of 2 or more items. Avoid dense paragraph blocks.
- Answer specifically: cite incident IDs, hub names, counts, times when relevant
- If asked about a specific incident by ID, reference its exact fields
- When describing what NEXUS did automatically, be specific (recovery messages sent, clusters detected, escalations triggered)
- Keep it very concise (Maximum 4 sentences if not using bullet points).
- Never invent data. If the context does not contain the answer, say exactly: 'That information is not in the current context window.'
- Be direct and operational, not conversational`;

      const userPrompt = `${historyString}[Staff]: ${message}\n\n---\n${contextString}`;

      const aiResponse = await callAI({
        system: systemPrompt,
        user: userPrompt,
        maxTokens: 500,
      });

      // Step 5 — Determine contextUsed
      const contextUsed = ["incidents"];
      if (activeClusters && activeClusters.length > 0) contextUsed.push("clusters");
      if (matchedIncident) contextUsed.push("incident_detail");
      if (auditLogs && auditLogs.length > 0) contextUsed.push("audit");
      if (rpaRuns && rpaRuns.length > 0) contextUsed.push("rpa");
      if (sopLibrary && sopLibrary.length > 0) contextUsed.push("sop_kb");
      if (semanticHits.length > 0) contextUsed.push("semantic");

      // Step 6 — Build structured cards for any INC-IDs mentioned in the reply
      const mentionedRefs = [...(aiResponse.matchAll(/INC-([A-Z0-9]{6})/g))].map((m) => m[0]);
      const referencedCards = mentionedRefs.length > 0
        ? topIncidents
            .filter((inc) => mentionedRefs.includes(`INC-${String(inc._id).slice(-6).toUpperCase()}`))
            .map((inc) => ({
              id: inc._id,
              ref: `INC-${String(inc._id).slice(-6).toUpperCase()}`,
              type: inc.type,
              severity: inc.severity,
              location: inc.location,
              status: inc.status,
              customerEmail: inc.customerEmail,
              awbNumber: inc.awbNumber,
              needsReview: inc.status === "PENDING_REVIEW",
              hasHITL: inc.recoveryMessage?.status === "hitl_required",
            }))
        : [];

      // Step 7 — Build chart data based on query context
      const chartData = {};
      const lowerMsg = message.toLowerCase();

      const hubChartData = Object.entries(locationCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([hub, count]) => ({ name: hub.split(' ')[0], count }));
      const typeChartData = Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => ({ name: type.replace(/_/g, ' '), count }));
      const sevChartData = Object.entries(severityCounts)
        .filter(([, v]) => v > 0)
        .map(([name, count]) => ({ name, count }));

      if (lowerMsg.includes('hub') || lowerMsg.includes('location') || lowerMsg.includes('breakdown')) {
        chartData.hubBreakdown = hubChartData;
      }
      if (lowerMsg.includes('type') || lowerMsg.includes('categor') || lowerMsg.includes('report') || lowerMsg.includes('summary') || lowerMsg.includes('overview')) {
        chartData.typeBreakdown = typeChartData;
        chartData.severityBreakdown = sevChartData;
      }
      if (lowerMsg.includes('cluster') || lowerMsg.includes('alert')) {
        chartData.hubBreakdown = hubChartData;
      }
      if (lowerMsg.includes('critical') || lowerMsg.includes('severity') || lowerMsg.includes('sever')) {
        chartData.severityBreakdown = sevChartData;
      }
      if (lowerMsg.includes('status') || lowerMsg.includes('summar') || lowerMsg.includes('report') || lowerMsg.includes('overview')) {
        chartData.typeBreakdown = typeChartData;
        chartData.severityBreakdown = sevChartData;
        chartData.hubBreakdown = hubChartData;
      }

      // Step 8 — Return
      return res.json({
        reply: aiResponse,
        contextUsed,
        referencedCards,
        semanticHits,
        clusters: activeClusters || [],
        reviewCount: reviewQueueCount,
        chartData: Object.keys(chartData).length > 0 ? chartData : undefined,
      });
    } catch (error) {
      console.error("[POST /admin/ops-chat]", error.message);
      return res.status(500).json({
        reply: "NEXUS ops intelligence is temporarily unavailable.",
        contextUsed: [],
      });
    }
  }
);

// ── KB Health ─────────────────────────────────────────────────────────────────
router.get(
  "/kb-health",
  requireAuth,
  requireRole("admin", "reviewer"),
  async (req, res, next) => {
    try {
      const [embeddingCount, sopCount, sopsByType, recentEmb] = await Promise.all([
        Embedding.countDocuments({}),
        SopLibrary.countDocuments({}),
        SopLibrary.aggregate([{ $group: { _id: "$incidentType", count: { $sum: 1 } } }]),
        Embedding.find({}).sort({ createdAt: -1 }).limit(1).select("createdAt").lean(),
      ]);
      return res.json({
        embeddingCount,
        sopCount,
        sopsByType: sopsByType.reduce((acc, r) => { acc[r._id] = r.count; return acc; }, {}),
        lastEmbeddingAt: recentEmb[0]?.createdAt || null,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// ── KB Semantic Search (test panel) ──────────────────────────────────────────
router.post(
  "/kb-search",
  requireAuth,
  requireRole("admin", "reviewer"),
  async (req, res, next) => {
    const { query } = req.body;
    if (!query?.trim()) return res.status(400).json({ error: "query required" });
    try {
      const mlRes = await fetch(`${FASTAPI_URL}/embeddings/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: query.trim(), top_k: 8 }),
        signal: AbortSignal.timeout(6000),
      });
      if (!mlRes.ok) throw new Error("ML service unavailable");
      const mlData = await mlRes.json();
      const candidates = mlData.candidates || [];
      const incidentIds = candidates.map((c) => c.incidentId).filter(Boolean);
      const incidents = incidentIds.length
        ? await Incident.find({ _id: { $in: incidentIds } })
            .select("_id type severity status location createdAt")
            .lean()
        : [];
      const incMap = Object.fromEntries(incidents.map((i) => [i._id.toString(), i]));
      const results = candidates.map((c) => ({
        ...c,
        ref: c.incidentId ? `INC-${String(c.incidentId).slice(-6).toUpperCase()}` : null,
        incident: incMap[c.incidentId] || null,
      }));
      return res.json({ results, query: query.trim() });
    } catch (error) {
      return next(error);
    }
  }
);
