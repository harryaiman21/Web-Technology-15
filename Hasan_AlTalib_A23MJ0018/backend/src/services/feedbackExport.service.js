// backend/src/services/feedbackExport.service.js
// Queries feedback entries and computes metrics for the admin dashboard and export.

import FeedbackDatasetEntry from "../models/FeedbackDatasetEntry.model.js";

/**
 * Build a feedback entry from an incident + review decision.
 * Called from the review route immediately after a decision is saved.
 */
export function buildFeedbackEntry(incident, action, reviewerNote, reviewer) {
  const aiType =
    incident.agentResults?.classifier?.decision ||
    incident.agentResults?.mlService?.type ||
    incident.type ||
    null;
  const aiSeverity =
    incident.agentResults?.classifier?.severity ||
    incident.agentResults?.classifier?.fields?.severity?.value ||
    incident.severity ||
    null;

  // Determine final values — after any field overrides already saved on the incident
  const finalType = incident.type || aiType || "other";
  const finalSeverity = incident.severity || aiSeverity || "Medium";
  const finalDepartment = incident.department || "Operations";

  const correctedFields = [];
  if (aiType && aiType !== finalType) correctedFields.push("type");
  if (aiSeverity && aiSeverity !== finalSeverity) correctedFields.push("severity");

  const overrideOccurred = correctedFields.length > 0;

  return {
    incidentId: incident._id,
    incidentText:
      incident.rawInput ||
      incident.description ||
      incident.agentResults?.intake?.fields?.description?.value ||
      "",
    finalType,
    finalSeverity,
    finalDepartment,
    aiType,
    aiSeverity,
    aiConfidence: incident.confidence ?? null,
    reviewAction: action,
    reviewerNote: reviewerNote || null,
    reviewerId: reviewer?._id || reviewer?.id || null,
    reviewerEmail: reviewer?.email || null,
    source: incident.source || "unknown",
    hitlFired: Boolean(incident.holdForReview),
    overrideOccurred,
    correctedFields,
    finalResolutionOutcome: incident.resolutionNote || null,
  };
}

/**
 * Compute feedback loop metrics for the admin dashboard.
 * Returns 4 key metrics:
 *  - totalReviewed
 *  - overrideRate (%)
 *  - hitlTrend (last 7 days counts)
 *  - topCorrectedFields (ranked list)
 *  - trainingSampleCount (approved decisions = clean training signal)
 */
export async function getFeedbackMetrics() {
  const [all, approvals, overrides, recent] = await Promise.all([
    FeedbackDatasetEntry.countDocuments(),
    FeedbackDatasetEntry.countDocuments({ reviewAction: "approve" }),
    FeedbackDatasetEntry.countDocuments({ overrideOccurred: true }),
    FeedbackDatasetEntry.find({})
      .sort({ createdAt: -1 })
      .limit(500)
      .select("reviewAction overrideOccurred correctedFields createdAt hitlFired")
      .lean(),
  ]);

  // HITL trend — last 7 days
  const today = new Date();
  const trendMap = new Map();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    d.setHours(0, 0, 0, 0);
    trendMap.set(d.toISOString().slice(0, 10), { reviews: 0, hitl: 0 });
  }
  for (const entry of recent) {
    const key = new Date(entry.createdAt).toISOString().slice(0, 10);
    if (trendMap.has(key)) {
      trendMap.get(key).reviews += 1;
      if (entry.hitlFired) trendMap.get(key).hitl += 1;
    }
  }
  const hitlTrend = [...trendMap.entries()].map(([date, counts]) => ({
    date,
    ...counts,
  }));

  // Top corrected fields
  const fieldCounts = {};
  for (const entry of recent) {
    for (const field of entry.correctedFields || []) {
      fieldCounts[field] = (fieldCounts[field] || 0) + 1;
    }
  }
  const topCorrectedFields = Object.entries(fieldCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([field, count]) => ({ field, count }));

  return {
    totalReviewed: all,
    approvalCount: approvals,
    rejectionCount: all - approvals,
    overrideRate: all > 0 ? Math.round((overrides / all) * 1000) / 10 : 0,
    trainingSampleCount: approvals, // approved decisions = clean ground-truth
    hitlTrend,
    topCorrectedFields,
  };
}

/**
 * Export all feedback entries as an array of ML-ready records.
 * Each record maps directly to a training row: (text, label).
 */
export async function exportFeedbackDataset({ limit = 10000 } = {}) {
  const entries = await FeedbackDatasetEntry.find({ reviewAction: "approve" })
    .sort({ createdAt: 1 })
    .limit(limit)
    .lean();

  return entries.map((entry) => ({
    text: entry.incidentText,
    label: entry.finalType,
    severity: entry.finalSeverity,
    department: entry.finalDepartment,
    ai_type: entry.aiType,
    ai_confidence: entry.aiConfidence,
    override_occurred: entry.overrideOccurred,
    corrected_fields: entry.correctedFields,
    source: entry.source,
    created_at: entry.createdAt,
    incident_id: entry.incidentId,
  }));
}
