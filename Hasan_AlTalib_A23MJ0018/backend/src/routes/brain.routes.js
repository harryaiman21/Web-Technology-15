import { Router } from "express";

import { callAI } from "../config/callAI.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import AuditLog from "../models/AuditLog.model.js";
import CustomerProfile from "../models/CustomerProfile.model.js";
import Embedding from "../models/Embedding.model.js";
import FeedbackDatasetEntry from "../models/FeedbackDatasetEntry.model.js";
import Incident from "../models/Incident.model.js";
import PipelineEvent from "../models/PipelineEvent.model.js";
import ProactiveSend from "../models/ProactiveSend.model.js";
import RpaRun from "../models/RpaRun.model.js";
import RpaRunItem from "../models/RpaRunItem.model.js";
import SopDraft from "../models/SopDraft.model.js";
import SopLibrary from "../models/SopLibrary.model.js";
import { getActiveClusters } from "../services/clusterDetection.service.js";
import { searchEmbeddings } from "../services/fastapi.service.js";

const router = Router();

const BRAIN_ANALYST_SYSTEM_PROMPT = `You are NEXUS Brain — a Staff-level operations analyst for DHL Asia Pacific.
Your job is to turn raw incident data into decisions the Head of Ops can act on within 24 hours.

NON-NEGOTIABLE RULES
1. Every claim must be backed by a specific number or incident ID from the evidence pack. If you can't quantify it, drop it.
2. Never list generic SOPs as "actions". An action names a person/role, a deadline, and a measurable success criterion.
3. Distinguish symptom from cause. "Penang has system errors" is a symptom. "Penang's tracking system has a stale scan-event sync" is a hypothesis.
4. If the evidence is thin, say exactly what extra data you'd need and how to get it. Don't pad with platitudes.
5. Cite incident IDs by their short form (e.g. INC-A1B2C3) so the operator can click through.

OUTPUT JSON (strict shape):
{
  "headline": "ONE punchy sentence stating the most important finding, with a number.",
  "answer": "Multi-paragraph deep analysis. Use the section structure below.",
  "summary": "30-word executive summary for a TL;DR badge.",
  "confidence": 0.0 to 1.0,
  "reasoningStages": ["short labels for the analytical steps you took, 4-7 items"],
  "actions": [
    {
      "id": "act-1",
      "label": "Imperative verb phrase, max 60 chars",
      "description": "Specific concrete step. Names a role. Names a deadline. Names a success metric.",
      "priority": "critical|high|normal",
      "target": "/board" or "/audit" or other route,
      "operation": "create_sop" | "fire_proactive_notice" | "flag_customer_account" | null,
      "payload": { ... operation-specific fields ... } | null
    }
  ]
}

EXECUTABLE OPERATIONS — when an action maps to one of these, populate operation + payload so the human can one-click execute it:

1. operation: "create_sop"
   When to use: a needed SOP is missing for a specific incident type + hub combination
   payload shape:
   {
     "code": "SOP-{TYPE-IN-CAPS}-{HUB-SLUG}-2026",
     "title": "Human-readable title, mention the type and hub",
     "incidentType": "system_error|damaged_parcel|late_delivery|missing_parcel|address_error|wrong_item|other",
     "location": "Penang Hub" | "Shah Alam Hub" | "KLIA Cargo" | "Subang Jaya Depot" | "JB Distribution",
     "steps": ["6-10 numbered procedure steps grounded in the evidence pack's incidents"],
     "description": "1-sentence purpose statement"
   }

2. operation: "fire_proactive_notice"
   When to use: a cascade or cluster needs immediate hub-manager alerting
   payload shape:
   {
     "location": "the hub name",
     "incidentType": "the incident type",
     "summary": "1-sentence reason for the alert",
     "recommendedSteps": ["3-5 specific steps for the hub manager"]
   }

3. operation: "flag_customer_account"
   When to use: a churn-risk account needs explicit tagging for senior retention
   payload shape:
   {
     "email": "the customer email",
     "tags": ["churn_risk", "premium", "high_value"],
     "reason": "1-sentence justification with incident IDs"
   }

When the action ISN'T directly executable as above, set operation: null. Don't fabricate operations.

ANSWER SECTION STRUCTURE (inside the "answer" field, use these literal headers):

**Bottom line**
One paragraph. The single most important thing the Head of Ops needs to know, plus a quantified impact ("MYR ~X exposed", "Y customers at churn risk", "Z hours/week of manual rework").

**Root cause hypothesis**
Distinguish symptom from cause. State your hypothesis explicitly with confidence ("High confidence — supported by N of M incidents at the same hub" / "Speculative — only Y signals point this way"). If multiple causes are plausible, list them in priority order with evidence per cause.

**Quantified impact (next 7 days if unaddressed)**
- Customers affected:
- Estimated SLA breaches:
- Recovery email volume:
- Estimated operator hours of manual rework:
- Estimated revenue at risk (MYR):
Each line MUST have a number derived from the evidence pack. Show your math in parens.

**Pattern signal**
Cross-reference: have we seen this pattern before? Cite specific cluster IDs or past incident IDs. If novel, say so.

**Recommended action plan**
Numbered list. For each:
1. **Action** (imperative): who does it, by when (24h / this week / this month), what success looks like (numeric KPI).
Prioritize by impact-per-hour-of-effort. Maximum 5 actions.

**Trade-offs and risks**
If your recommendation has downsides, name them. If there's an alternative approach, briefly say why you chose this one.

**What we don't know yet**
Honest gaps. What evidence would sharpen this analysis. How to get it.

WRITING STYLE
- No filler ("It's important to note...", "Going forward...").
- Numbers in parentheses where they back a claim. Example: "76 of 256 incidents (30%) are late delivery — Shah Alam Hub accounts for 31 of those (41% of all late deliveries)."
- Active voice. Imperative for actions.
- No emoji. No "—" em dashes. Use hyphens or restructure.

ANCHOR EXAMPLE OF DEEP VS SHALLOW
SHALLOW (don't do this): "There's a high breach rate and Penang has system errors. Recommend reviewing SOPs."
DEEP (do this): "Penang Hub has 3 system_error incidents in the last 4 hours (INC-X, INC-Y, INC-Z) — all reporting tracking stuck at 'Out for delivery' for 9-72 hours. Likely cause: tracking-scan sync between handheld scanners and the central tracking DB is stalled. Confidence: medium-high (3 different reporters, same symptom, same hub). Action: page Penang IT lead within 1 hour to verify scan-event queue depth; if queue > 500 events, restart the sync worker. Success metric: tracking status updates within 15 min of physical scan for the next 24 hours."

If the evidence is sparse, you can still be valuable: state what's missing, propose how to instrument the gap, and give the safest interim action.`;

const HUBS = [
  "Shah Alam Hub",
  "KLIA Cargo",
  "Subang Jaya Depot",
  "Penang Hub",
  "JB Distribution",
];

const INCIDENT_TYPES = [
  "late_delivery",
  "damaged_parcel",
  "missing_parcel",
  "address_error",
  "system_error",
  "wrong_item",
  "other",
];

const TYPE_LABELS = {
  late_delivery: "Late Delivery",
  damaged_parcel: "Damaged Parcel",
  missing_parcel: "Missing Parcel",
  address_error: "Address Error",
  system_error: "System Error",
  wrong_item: "Wrong Item",
  other: "Other",
};

const STATUS_FOLDERS = {
  "incidents/breached-sla": "BREACHED",
  "incidents/pending-review": "PENDING_REVIEW",
  "incidents/resolved": "RESOLVED",
};

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function round(value, decimals = 1) {
  if (!Number.isFinite(Number(value))) return 0;
  const factor = 10 ** decimals;
  return Math.round(Number(value) * factor) / factor;
}

function pct(part, total) {
  if (!total) return 0;
  return round((part / total) * 100, 1);
}

function getFolderLabel(folderId) {
  if (!folderId || folderId === "root") return "All NEXUS knowledge";
  if (folderId.startsWith("hubs/")) {
    const hub = HUBS.find((item) => slugify(item) === folderId.split("/")[1]);
    return hub || "Hub intelligence";
  }
  if (folderId.startsWith("types/")) {
    const type = folderId.split("/")[1];
    return TYPE_LABELS[type] || type;
  }
  const labels = {
    "incidents/all": "All incidents",
    "incidents/breached-sla": "Breached SLA",
    "incidents/pending-review": "Pending review",
    "incidents/resolved": "Resolved incidents",
    "customers/repeat": "Repeat customers",
    "customers/frustrated": "Frustrated customers",
    "sops/published": "Published SOPs",
    "sops/drafts": "Draft SOPs",
    "sops/gaps": "Missing SOP coverage",
    "rpa/runs": "RPA runs",
    "rpa/items": "Processed RPA items",
    "rpa/duplicates": "Skipped duplicates",
    "rpa/failures": "Failed RPA files",
    "ai/classifications": "AI classifications",
    "ai/hitl": "HITL reviews",
    "ai/corrections": "Human corrections",
    "insights/active-clusters": "Active clusters",
    "insights/sla-risk": "SLA breach risks",
    "insights/proactive": "Proactive alerts",
  };
  return labels[folderId] || folderId;
}

function buildQueryRegex(query) {
  const stop = new Set([
    "why", "what", "which", "show", "tell", "about", "having", "recently",
    "shipment", "delayed", "delay", "problems", "problem", "issue", "issues",
    "the", "and", "for", "with", "from", "this", "that", "hub",
  ]);
  const tokens = String(query || "")
    .toLowerCase()
    .split(/[^a-z0-9@._-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !stop.has(token))
    .slice(0, 8);

  if (tokens.length === 0) return null;
  return new RegExp(tokens.map(escapeRegex).join("|"), "i");
}

function inferQueryFilters(query) {
  const text = String(query || "").toLowerCase();
  const match = {};

  const hub = HUBS.find((item) => text.includes(item.toLowerCase().replace(/\s+(hub|cargo|depot|distribution)$/i, "").trim().toLowerCase()));
  if (hub) match.location = new RegExp(escapeRegex(hub.replace(/\s+(Hub|Cargo|Depot|Distribution)$/i, "").trim()), "i");

  for (const type of INCIDENT_TYPES) {
    const plain = type.replace(/_/g, " ");
    if (text.includes(plain) || text.includes(type)) {
      match.type = type;
      break;
    }
  }

  if (text.includes("breach") || text.includes("sla")) match.status = "BREACHED";
  if (text.includes("review")) match.status = "PENDING_REVIEW";
  if (text.includes("resolved")) match.status = "RESOLVED";

  return match;
}

function getFolderMatch(folderId) {
  if (!folderId || folderId === "root") return {};

  if (folderId.startsWith("hubs/")) {
    const hub = HUBS.find((item) => slugify(item) === folderId.split("/")[1]);
    if (hub) return { location: new RegExp(escapeRegex(hub.replace(/\s+(Hub|Cargo|Depot|Distribution)$/i, "").trim()), "i") };
  }

  if (folderId.startsWith("types/")) {
    const type = folderId.split("/")[1];
    if (INCIDENT_TYPES.includes(type)) return { type };
  }

  if (STATUS_FOLDERS[folderId]) return { status: STATUS_FOLDERS[folderId] };
  if (folderId === "customers/repeat") return { isRepeatCustomer: true };
  if (folderId === "customers/frustrated") return { sentimentScore: { $lte: 0.35 } };
  if (folderId === "insights/sla-risk") return { status: { $in: ["BREACHED", "PENDING_REVIEW", "ASSIGNED", "IN_PROGRESS"] } };

  return {};
}

function mergeMatches(...matches) {
  return matches.reduce((acc, match) => ({ ...acc, ...match }), {});
}

function addTextSearch(match, query) {
  const regex = buildQueryRegex(query);
  if (!regex) return match;

  return {
    ...match,
    $or: [
      { title: regex },
      { description: regex },
      { rawInput: regex },
      { customerEmail: regex },
      { awbNumber: regex },
      { location: regex },
    ],
  };
}

function compactIncident(incident) {
  return {
    id: String(incident._id),
    ref: `INC-${String(incident._id).slice(-6).toUpperCase()}`,
    title: incident.title || incident.description?.slice(0, 90) || "Incident",
    type: incident.type || "other",
    severity: incident.severity || "Medium",
    status: incident.status || "DRAFT",
    location: incident.location || "Unknown",
    confidence: round(Number(incident.confidence || 0) * 100, 1),
    customerEmail: incident.customerEmail || null,
    awbNumber: incident.awbNumber || null,
    sentimentScore: incident.sentimentScore ?? null,
    createdAt: incident.createdAt,
    updatedAt: incident.updatedAt,
    description: incident.description?.slice(0, 220) || "",
  };
}

function evidenceItem(type, title, detail, meta = {}, link = null) {
  return {
    id: `${type}-${Math.random().toString(36).slice(2, 10)}`,
    type,
    title,
    detail,
    meta,
    link,
  };
}

function recordItem(type, title, detail, meta = {}, link = null, raw = null) {
  return {
    id: `${type}-${raw?._id || raw?.id || Math.random().toString(36).slice(2, 10)}`,
    type,
    title,
    detail,
    meta,
    link,
    raw,
  };
}

function countMap(rows) {
  return Object.fromEntries(rows.map((row) => [String(row._id || "Unknown"), row.count || 0]));
}

async function buildFolderTree() {
  const [
    totalIncidents,
    byHub,
    byType,
    byStatus,
    repeatCustomers,
    frustratedCustomers,
    publishedSops,
    draftSops,
    totalRuns,
    totalItems,
    duplicateItems,
    failedItems,
    feedbackCorrections,
    totalEmbeddings,
    proactiveAlerts,
    clusters,
  ] = await Promise.all([
    Incident.countDocuments({}),
    Incident.aggregate([{ $group: { _id: "$location", count: { $sum: 1 } } }]),
    Incident.aggregate([{ $group: { _id: "$type", count: { $sum: 1 } } }]),
    Incident.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    CustomerProfile.countDocuments({ "cases.1": { $exists: true } }),
    CustomerProfile.countDocuments({ averageSentiment: { $lte: 0.35 } }),
    SopLibrary.countDocuments({}),
    SopDraft.countDocuments({ status: { $ne: "rejected" } }),
    RpaRun.countDocuments({}),
    RpaRunItem.countDocuments({}),
    RpaRunItem.countDocuments({ outcome: "duplicate" }),
    RpaRunItem.countDocuments({ outcome: "failed" }),
    FeedbackDatasetEntry.countDocuments({ overrideOccurred: true }),
    Embedding.countDocuments({}),
    ProactiveSend.countDocuments({}),
    getActiveClusters().catch(() => []),
  ]);

  const hubCounts = countMap(byHub);
  const typeCounts = countMap(byType);
  const statusCounts = countMap(byStatus);

  const hubChildren = HUBS.map((hub) => ({
    id: `hubs/${slugify(hub)}`,
    label: hub,
    kind: "hub",
    count: Object.entries(hubCounts)
      .filter(([key]) => key.toLowerCase().includes(hub.replace(/\s+(Hub|Cargo|Depot|Distribution)$/i, "").toLowerCase()))
      .reduce((sum, [, count]) => sum + count, 0),
    children: [
      { id: `hubs/${slugify(hub)}/incidents`, label: "Incidents", kind: "incidents" },
      { id: `hubs/${slugify(hub)}/clusters`, label: "Active Clusters", kind: "clusters" },
      { id: `hubs/${slugify(hub)}/sla`, label: "Breached SLA", kind: "sla" },
      { id: `hubs/${slugify(hub)}/sop-coverage`, label: "SOP Coverage", kind: "sop" },
      { id: `hubs/${slugify(hub)}/actions`, label: "Recommended Actions", kind: "actions" },
    ],
  }));

  return {
    generatedAt: new Date().toISOString(),
    stats: {
      totalIncidents,
      totalEmbeddings,
      publishedSops,
      draftSops,
      totalRuns,
      totalItems,
      activeClusters: clusters.length,
      proactiveAlerts,
    },
    tree: [
      {
        id: "hubs",
        label: "Hubs",
        kind: "root",
        count: totalIncidents,
        children: hubChildren,
      },
      {
        id: "incidents",
        label: "Incidents",
        kind: "root",
        count: totalIncidents,
        children: [
          { id: "incidents/all", label: "All Incidents", kind: "incidents", count: totalIncidents },
          { id: "incidents/breached-sla", label: "Breached SLA", kind: "sla", count: statusCounts.BREACHED || 0 },
          { id: "incidents/pending-review", label: "Pending Review", kind: "review", count: statusCounts.PENDING_REVIEW || 0 },
          { id: "incidents/resolved", label: "Resolved", kind: "resolved", count: statusCounts.RESOLVED || 0 },
        ],
      },
      {
        id: "types",
        label: "Incident Types",
        kind: "root",
        count: totalIncidents,
        children: INCIDENT_TYPES.map((type) => ({
          id: `types/${type}`,
          label: TYPE_LABELS[type],
          kind: "type",
          count: typeCounts[type] || 0,
        })),
      },
      {
        id: "customers",
        label: "Customers",
        kind: "root",
        count: repeatCustomers + frustratedCustomers,
        children: [
          { id: "customers/repeat", label: "Repeat Customers", kind: "customer", count: repeatCustomers },
          { id: "customers/frustrated", label: "Frustrated Customers", kind: "sentiment", count: frustratedCustomers },
          { id: "customers/recovery", label: "Recovery Required", kind: "recovery" },
          { id: "customers/chat-followups", label: "Chat Follow-ups", kind: "chat" },
        ],
      },
      {
        id: "sops",
        label: "SOP Library",
        kind: "root",
        count: publishedSops + draftSops,
        children: [
          { id: "sops/published", label: "Published SOPs", kind: "sop", count: publishedSops },
          { id: "sops/drafts", label: "Draft SOPs", kind: "draft", count: draftSops },
          { id: "sops/gaps", label: "Missing SOP Coverage", kind: "gap" },
          { id: "sops/stale", label: "Stale SOPs", kind: "stale" },
        ],
      },
      {
        id: "rpa",
        label: "RPA Intelligence",
        kind: "root",
        count: totalItems,
        children: [
          { id: "rpa/runs", label: "All Runs", kind: "rpa", count: totalRuns },
          { id: "rpa/items", label: "Processed Emails", kind: "rpa", count: totalItems },
          { id: "rpa/duplicates", label: "Skipped Duplicates", kind: "duplicate", count: duplicateItems },
          { id: "rpa/failures", label: "Failed Files", kind: "failure", count: failedItems },
        ],
      },
      {
        id: "ai",
        label: "AI Decisions",
        kind: "root",
        count: totalIncidents,
        children: [
          { id: "ai/classifications", label: "Agent Classifications", kind: "ai", count: totalIncidents },
          { id: "ai/hitl", label: "HITL Reviews", kind: "review", count: statusCounts.PENDING_REVIEW || 0 },
          { id: "ai/corrections", label: "Human Corrections", kind: "correction", count: feedbackCorrections },
          { id: "ai/shap", label: "SHAP Evidence", kind: "evidence" },
        ],
      },
      {
        id: "insights",
        label: "Operational Insights",
        kind: "root",
        count: clusters.length + proactiveAlerts,
        children: [
          { id: "insights/active-clusters", label: "Active Clusters", kind: "cluster", count: clusters.length },
          { id: "insights/sla-risk", label: "SLA Breach Risks", kind: "sla", count: statusCounts.BREACHED || 0 },
          { id: "insights/proactive", label: "Prevention Opportunities", kind: "proactive", count: proactiveAlerts },
          { id: "insights/roi", label: "ROI / Hours Saved", kind: "roi" },
        ],
      },
    ],
  };
}

async function buildFolderRecords(folderId, limit = 50) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const folderLabel = getFolderLabel(folderId);

  // ─────────────────────────────────────────────────────────────────────────
  // EXACT FOLDER-ID HANDLERS — must run before prefix-based catch-alls below.
  // Each handler returns records semantically appropriate to the folder
  // (e.g., FeedbackDatasetEntry records for "Human Corrections", not Incidents).
  // ─────────────────────────────────────────────────────────────────────────

  // ── AI Decisions / Human Corrections ────────────────────────────────────
  if (folderId === "ai/corrections") {
    const entries = await FeedbackDatasetEntry.find({ overrideOccurred: true })
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .lean();
    return {
      folderId,
      folderLabel,
      records: entries.map((entry) =>
        recordItem(
          "human_correction",
          `${entry.aiType || "—"} → ${entry.finalType}`,
          `${entry.reviewerEmail || "Reviewer"} corrected ${entry.correctedFields?.join(", ") || "label"}.` +
            (entry.reviewerNote ? ` Note: ${entry.reviewerNote}` : ""),
          {
            status: entry.reviewAction,
            aiType: entry.aiType,
            finalType: entry.finalType,
            aiConfidence: entry.aiConfidence != null ? round(entry.aiConfidence * 100, 1) : null,
            correctedFields: entry.correctedFields?.join(", ") || null,
          },
          entry.incidentId ? `/incidents/${entry.incidentId}` : null,
          entry,
        ),
      ),
    };
  }

  // ── AI Decisions / Agent Classifications ────────────────────────────────
  if (folderId === "ai/classifications") {
    const incidents = await Incident.find({ "agentResults.classifier": { $exists: true, $ne: null } })
      .select("title description type severity status confidence agentResults customerEmail location createdAt")
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .lean();
    return {
      folderId,
      folderLabel,
      records: incidents.map((incident) => {
        const cls = incident.agentResults?.classifier || {};
        const reasoning = typeof cls.reasoning === "string" ? cls.reasoning.slice(0, 220) : null;
        return recordItem(
          "ai_classification",
          incident.title || `INC-${String(incident._id).slice(-6).toUpperCase()}`,
          reasoning ||
            `Classified as ${String(incident.type || "?").replace(/_/g, " ")} · severity ${incident.severity || "?"} · confidence ${round(Number(incident.confidence || 0) * 100, 1)}%`,
          {
            status: incident.status,
            type: incident.type,
            severity: incident.severity,
            confidence: round(Number(incident.confidence || 0) * 100, 1),
            location: incident.location,
          },
          `/incidents/${incident._id}`,
          incident,
        );
      }),
    };
  }

  // ── AI Decisions / HITL Reviews ─────────────────────────────────────────
  if (folderId === "ai/hitl") {
    const incidents = await Incident.find({
      $or: [
        { holdForReview: true },
        { "recoveryMessage.status": "hitl_required" },
        { status: "PENDING_REVIEW" },
      ],
    })
      .select("title type severity status confidence customerEmail location holdForReview recoveryMessage createdAt")
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .lean();
    return {
      folderId,
      folderLabel,
      records: incidents.map((incident) => {
        const reason = incident.holdForReview
          ? "Held for human review — uncertainty score above auto-approve threshold."
          : incident.recoveryMessage?.status === "hitl_required"
          ? "Recovery message awaiting human approval before customer send."
          : "Pending review queue — awaiting reviewer decision.";
        return recordItem(
          "hitl_review",
          incident.title || `INC-${String(incident._id).slice(-6).toUpperCase()}`,
          reason,
          {
            status: incident.status,
            severity: incident.severity,
            type: incident.type,
            recoveryStatus: incident.recoveryMessage?.status || "—",
            holdForReview: incident.holdForReview ? "yes" : "no",
          },
          `/incidents/${incident._id}`,
          incident,
        );
      }),
    };
  }

  // ── AI Decisions / SHAP Evidence ────────────────────────────────────────
  if (folderId === "ai/shap") {
    const incidents = await Incident.find({ "agentResults.shap": { $exists: true, $ne: null } })
      .select("title type severity status confidence agentResults location createdAt")
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .lean();
    return {
      folderId,
      folderLabel,
      records: incidents.map((incident) => {
        const shap = incident.agentResults?.shap || {};
        const features = Array.isArray(shap.features)
          ? shap.features
          : Array.isArray(shap.topFeatures)
          ? shap.topFeatures
          : [];
        const topNames = features.slice(0, 3).map((f) => f.feature || f.name).filter(Boolean);
        return recordItem(
          "shap_evidence",
          incident.title || `INC-${String(incident._id).slice(-6).toUpperCase()}`,
          topNames.length
            ? `Top features driving the classifier: ${topNames.join(", ")}`
            : "SHAP feature importances captured at classification time.",
          {
            status: incident.status,
            type: incident.type,
            confidence: round(Number(incident.confidence || 0) * 100, 1),
            featureCount: features.length,
          },
          `/incidents/${incident._id}`,
          incident,
        );
      }),
    };
  }

  // ── Operational Insights / ROI · Hours Saved ────────────────────────────
  // Returns a synthesized summary record + the resolved incidents that
  // contributed to the savings. Mirrors /admin/roi-live computation.
  if (folderId === "insights/roi") {
    const incidents = await Incident.find({ status: { $in: ["RESOLVED", "CLOSED"] } })
      .select("title type severity status confidence source createdAt updatedAt customerEmail location")
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(safeLimit)
      .lean();

    let totalMinutesSaved = 0;
    let autoResolved = 0;
    let assisted = 0;
    for (const inc of incidents) {
      const conf = Number(inc.confidence || 0);
      const src = inc.source || "manual";
      if (conf >= 0.9 || src === "auto") { totalMinutesSaved += 10; autoResolved++; }
      else if (conf >= 0.7) { totalMinutesSaved += 7; assisted++; }
      else { totalMinutesSaved += 3; }
    }
    const hoursSaved = round(totalMinutesSaved / 60, 1);
    const costSaved = Math.round(hoursSaved * 25);

    const summary = recordItem(
      "roi_summary",
      `RM ${costSaved.toLocaleString()} saved · ${hoursSaved}h of manual work avoided`,
      `Across ${incidents.length} resolved cases · ${autoResolved} auto-resolved (≥90% conf), ${assisted} AI-assisted (70-89%), rest manual review.`,
      {
        status: "summary",
        hoursSaved,
        costSaved,
        currency: "RM",
        autoResolved,
        assisted,
        total: incidents.length,
      },
      "/admin",
    );

    const records = [
      summary,
      ...incidents.map((incident) => {
        const conf = Number(incident.confidence || 0);
        const minutesSaved = conf >= 0.9 ? 10 : conf >= 0.7 ? 7 : 3;
        const tier = conf >= 0.9 ? "Auto-resolved" : conf >= 0.7 ? "AI-assisted" : "Manual review";
        return recordItem(
          "roi_contribution",
          incident.title || `INC-${String(incident._id).slice(-6).toUpperCase()}`,
          `${minutesSaved} min saved · ${tier} · ${incident.location || "Unknown hub"}`,
          {
            status: incident.status,
            confidence: round(conf * 100, 1),
            minutesSaved,
            tier,
            type: incident.type,
          },
          `/incidents/${incident._id}`,
          incident,
        );
      }),
    ];
    return { folderId, folderLabel, records };
  }

  // ── Customers / Recovery Required ───────────────────────────────────────
  if (folderId === "customers/recovery") {
    const incidents = await Incident.find({
      "recoveryMessage.body": { $exists: true, $ne: null },
    })
      .select("title type severity status customerEmail recoveryMessage location createdAt")
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .lean();
    return {
      folderId,
      folderLabel,
      records: incidents.map((incident) =>
        recordItem(
          "recovery_pending",
          incident.customerEmail || incident.title || "Recovery required",
          (incident.recoveryMessage?.body || "Recovery message drafted.").slice(0, 220),
          {
            status: incident.recoveryMessage?.status || incident.status,
            severity: incident.severity,
            type: incident.type,
            customerEmail: incident.customerEmail,
            location: incident.location,
          },
          `/incidents/${incident._id}`,
          incident,
        ),
      ),
    };
  }

  // ── Customers / Chat Follow-ups ─────────────────────────────────────────
  if (folderId === "customers/chat-followups") {
    const incidents = await Incident.find({
      "customerSatisfaction.respondedAt": { $exists: true, $ne: null },
    })
      .select("title type severity status customerEmail customerSatisfaction location createdAt")
      .sort({ "customerSatisfaction.respondedAt": -1 })
      .limit(safeLimit)
      .lean();
    return {
      folderId,
      folderLabel,
      records: incidents.map((incident) => {
        const sat = incident.customerSatisfaction || {};
        const isSatisfied = sat.satisfied === true;
        const detail = sat.comment
          ? `"${String(sat.comment).slice(0, 180)}"`
          : isSatisfied
          ? "Customer confirmed satisfied via chat."
          : "Customer reopened — not satisfied with resolution.";
        return recordItem(
          "chat_followup",
          incident.customerEmail || incident.title || "Customer chat",
          detail,
          {
            status: isSatisfied ? "satisfied" : "escalated",
            severity: incident.severity,
            type: incident.type,
            customerEmail: incident.customerEmail,
            respondedAt: sat.respondedAt,
          },
          `/incidents/${incident._id}`,
          incident,
        );
      }),
    };
  }

  // ── SOPs / Missing SOP Coverage ─────────────────────────────────────────
  // For each incident type, check whether a SopLibrary entry exists.
  // Surface the GAPS — incident types that have no SOP yet.
  if (folderId === "sops/gaps") {
    const [allSops, typeCounts] = await Promise.all([
      SopLibrary.find({}).select("incidentType").lean(),
      Incident.aggregate([
        { $match: { type: { $in: INCIDENT_TYPES } } },
        { $group: { _id: "$type", count: { $sum: 1 } } },
      ]),
    ]);
    const coveredTypes = new Set(allSops.map((s) => s.incidentType).filter(Boolean));
    const gaps = typeCounts
      .filter((row) => !coveredTypes.has(row._id))
      .sort((a, b) => b.count - a.count);
    return {
      folderId,
      folderLabel,
      records: gaps.map((gap) =>
        recordItem(
          "sop_gap",
          TYPE_LABELS[gap._id] || gap._id,
          `${gap.count} incident${gap.count !== 1 ? "s" : ""} of this type · No SOP exists. Reviewers handle each case from scratch — high inconsistency risk.`,
          {
            status: "missing",
            incidentType: gap._id,
            incidentCount: gap.count,
          },
          "/knowledge",
        ),
      ),
    };
  }

  // ── SOPs / Stale SOPs ───────────────────────────────────────────────────
  if (folderId === "sops/stale") {
    const STALE_DAYS = 30;
    const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);
    const sops = await SopLibrary.find({
      $or: [{ updatedAt: { $lt: cutoff } }, { updatedAt: { $exists: false }, createdAt: { $lt: cutoff } }],
    })
      .sort({ updatedAt: 1, createdAt: 1 })
      .limit(safeLimit)
      .lean();
    return {
      folderId,
      folderLabel,
      records: sops.map((sop) => {
        const lastTouched = sop.updatedAt || sop.createdAt;
        const ageDays = lastTouched
          ? Math.round((Date.now() - new Date(lastTouched).getTime()) / (24 * 60 * 60 * 1000))
          : null;
        return recordItem(
          "sop_stale",
          sop.title || sop.code || "SOP",
          ageDays != null
            ? `Last updated ${ageDays} days ago. May be out of date with current operations.`
            : "Last update timestamp missing — review for currency.",
          {
            status: "stale",
            ageDays,
            code: sop.code,
            incidentType: sop.incidentType,
          },
          "/knowledge",
          sop,
        );
      }),
    };
  }

  // ── Hubs / <slug> / Breached SLA ────────────────────────────────────────
  if (folderId?.startsWith("hubs/") && folderId.endsWith("/sla")) {
    const hubSlug = folderId.split("/")[1];
    const hub = HUBS.find((h) => slugify(h) === hubSlug);
    if (!hub) return { folderId, folderLabel, records: [] };
    const hubNameCore = hub.replace(/\s+(Hub|Cargo|Depot|Distribution)$/i, "").trim();
    const incidents = await Incident.find({
      location: new RegExp(escapeRegex(hubNameCore), "i"),
      $or: [{ status: "BREACHED" }, { "sla.breachedAt": { $exists: true, $ne: null } }],
    })
      .select("title type severity status customerEmail location sla createdAt")
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .lean();
    return {
      folderId,
      folderLabel: `${hub} · Breached SLA`,
      records: incidents.map((incident) =>
        recordItem(
          "sla_breach",
          incident.title || `INC-${String(incident._id).slice(-6).toUpperCase()}`,
          incident.sla?.breachedAt
            ? `Breached at ${new Date(incident.sla.breachedAt).toLocaleString()}.`
            : `Breached SLA — ${incident.severity} severity ${String(incident.type || "incident").replace(/_/g, " ")}.`,
          {
            status: incident.status,
            severity: incident.severity,
            type: incident.type,
            customerEmail: incident.customerEmail,
          },
          `/incidents/${incident._id}`,
          incident,
        ),
      ),
    };
  }

  // ── Hubs / <slug> / SOP Coverage ────────────────────────────────────────
  if (folderId?.startsWith("hubs/") && folderId.endsWith("/sop-coverage")) {
    const hubSlug = folderId.split("/")[1];
    const hub = HUBS.find((h) => slugify(h) === hubSlug);
    if (!hub) return { folderId, folderLabel, records: [] };
    const hubNameCore = hub.replace(/\s+(Hub|Cargo|Depot|Distribution)$/i, "").trim();
    const types = await Incident.aggregate([
      { $match: { location: new RegExp(escapeRegex(hubNameCore), "i"), type: { $in: INCIDENT_TYPES } } },
      { $group: { _id: "$type", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    const sops = await SopLibrary.find({ incidentType: { $in: types.map((t) => t._id) } })
      .sort({ updatedAt: -1 })
      .lean();
    const coveredTypes = new Set(sops.map((s) => s.incidentType).filter(Boolean));
    const gapRecords = types
      .filter((t) => !coveredTypes.has(t._id))
      .map((t) =>
        recordItem(
          "sop_gap",
          `Missing: ${TYPE_LABELS[t._id] || t._id}`,
          `${t.count} incident${t.count !== 1 ? "s" : ""} at ${hub} · no SOP for this type yet.`,
          { status: "missing", incidentCount: t.count, incidentType: t._id },
          "/knowledge",
        ),
      );
    const sopRecords = sops.map((sop) =>
      recordItem(
        "sop",
        sop.title || sop.code,
        `Covers ${String(sop.incidentType || "").replace(/_/g, " ")} · ${sop.steps?.length || 0} step${(sop.steps?.length || 0) !== 1 ? "s" : ""}.`,
        { status: "covered", code: sop.code, incidentType: sop.incidentType },
        "/knowledge",
        sop,
      ),
    );
    return {
      folderId,
      folderLabel: `${hub} · SOP Coverage`,
      records: [...gapRecords, ...sopRecords].slice(0, safeLimit),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PREFIX-BASED HANDLERS — match broader folder families.
  // ─────────────────────────────────────────────────────────────────────────

  if (folderId === "sops/drafts") {
    const drafts = await SopDraft.find({ status: { $ne: "rejected" } }).sort({ generatedAt: -1 }).limit(safeLimit).lean();
    return {
      folderId,
      folderLabel,
      records: drafts.map((draft) =>
        recordItem(
          "sop_draft",
          draft.generatedContent?.title || `${draft.incidentType} SOP draft`,
          draft.generatedContent?.recommendedAction || draft.generatedContent?.rootCause || "Draft awaiting review.",
          {
            status: draft.status,
            incidentType: draft.incidentType,
            location: draft.location,
            evidenceCount: draft.generatedContent?.evidenceCount,
          },
          "/knowledge",
          draft,
        ),
      ),
    };
  }

  if (folderId?.startsWith("sops")) {
    const sops = await SopLibrary.find({}).sort({ updatedAt: -1, createdAt: -1 }).limit(safeLimit).lean();
    return {
      folderId,
      folderLabel,
      records: sops.map((sop) =>
        recordItem(
          "sop",
          sop.title || sop.code,
          Array.isArray(sop.steps) ? sop.steps.slice(0, 3).join(" ") : sop.description || "Published SOP.",
          {
            code: sop.code,
            incidentType: sop.incidentType,
            stepCount: sop.steps?.length || 0,
            version: sop.version,
          },
          "/knowledge",
          sop,
        ),
      ),
    };
  }

  if (folderId === "rpa/runs") {
    const runs = await RpaRun.find({}).sort({ createdAt: -1, startTime: -1 }).limit(safeLimit).lean();
    return {
      folderId,
      folderLabel,
      records: runs.map((run) =>
        recordItem(
          "rpa_run",
          run.runId || "RPA run",
          run.narrative || `${run.processedCount || run.totalFiles || 0} files processed.`,
          {
            status: run.status,
            processed: run.processedCount || run.totalFiles || 0,
            skipped: run.skipped || 0,
            failed: run.failed || 0,
          },
          "/rpa",
          run,
        ),
      ),
    };
  }

  if (folderId?.startsWith("rpa")) {
    const match = {};
    if (folderId === "rpa/duplicates") match.outcome = "duplicate";
    if (folderId === "rpa/failures") match.outcome = { $in: ["failed", "error"] };
    const items = await RpaRunItem.find(match).sort({ createdAt: -1 }).limit(safeLimit).lean();
    return {
      folderId,
      folderLabel,
      records: items.map((item) =>
        recordItem(
          "rpa_item",
          item.filename || "Processed email",
          item.error || `${item.outcome || "processed"} at ${item.location || "Unknown location"}.`,
          {
            outcome: item.outcome,
            severity: item.severity,
            location: item.location,
            incidentId: item.incidentId,
          },
          item.incidentId ? `/incidents/${item.incidentId}` : "/rpa",
          item,
        ),
      ),
    };
  }

  if (folderId?.startsWith("customers")) {
    const match = {};
    if (folderId === "customers/frustrated") match.averageSentiment = { $lte: 0.35 };
    if (folderId === "customers/repeat") match["cases.1"] = { $exists: true };
    const profiles = await CustomerProfile.find(match).sort({ updatedAt: -1 }).limit(safeLimit).lean();
    return {
      folderId,
      folderLabel,
      records: profiles.map((profile) =>
        recordItem(
          "customer",
          profile.email || "Customer profile",
          `${profile.cases?.length || 0} linked cases. Sentiment: ${profile.averageSentiment ?? "unknown"}.`,
          {
            averageSentiment: profile.averageSentiment,
            frustrationTrend: profile.frustrationTrend,
            caseCount: profile.cases?.length || 0,
            tags: profile.tags?.join(", "),
          },
          "/board",
          profile,
        ),
      ),
    };
  }

  if (folderId?.includes("clusters") || folderId === "insights/active-clusters") {
    let clusters = await getActiveClusters().catch(() => []);

    // Hub-scoped: filter to clusters whose location matches this hub.
    let scopedHub = null;
    if (folderId?.startsWith("hubs/") && folderId.endsWith("/clusters")) {
      const hubSlug = folderId.split("/")[1];
      const hub = HUBS.find((h) => slugify(h) === hubSlug);
      if (hub) {
        scopedHub = hub;
        const hubNameCore = hub.replace(/\s+(Hub|Cargo|Depot|Distribution)$/i, "").trim();
        const re = new RegExp(escapeRegex(hubNameCore), "i");
        clusters = clusters.filter((c) => c.location && re.test(c.location));
      }
    }

    return {
      folderId,
      folderLabel: scopedHub ? `${scopedHub} · Active Clusters` : folderLabel,
      records: clusters.slice(0, safeLimit).map((cluster) =>
        recordItem(
          "cluster",
          `${cluster.location} ${String(cluster.type || "incident").replace(/_/g, " ")} cluster`,
          `${cluster.count} incidents detected between ${new Date(cluster.firstSeen).toLocaleString()} and ${new Date(cluster.lastSeen).toLocaleString()}.`,
          {
            status: cluster.count >= 5 ? "critical" : cluster.count >= 3 ? "high" : "active",
            clusterId: cluster.clusterId,
            count: cluster.count,
            cascadeScore: cluster.overallCascadeScore,
            location: cluster.location,
          },
          "/proactive",
          cluster,
        ),
      ),
    };
  }

  if (folderId === "insights/proactive") {
    const sends = await ProactiveSend.find({}).sort({ generatedAt: -1 }).limit(safeLimit).lean();
    return {
      folderId,
      folderLabel,
      records: sends.map((send) =>
        recordItem(
          "proactive",
          `${send.location} ${String(send.incidentType || "incident").replace(/_/g, " ")}`,
          send.documents?.hubNotice || send.documents?.customerEmail || "Proactive communication draft.",
          {
            status: send.status,
            prevented: send.estimatedComplaintsPrevented,
            sentAt: send.sentAt,
          },
          "/proactive",
          send,
        ),
      ),
    };
  }

  // ── Hub Recommended Actions ───────────────────────────────────────────────────
  if (folderId?.endsWith('/actions')) {
    const parts = folderId.split('/');
    const hubSlug = parts[1];
    const hub = HUBS.find((h) => slugify(h) === hubSlug);
    if (!hub) {
      return { folderId, folderLabel, isActionPlan: true, hub: hubSlug, actions: [], records: [] };
    }

    const hubNameCore = hub.replace(/\s+(Hub|Cargo|Depot|Distribution)$/i, '').trim();
    const hubMatch = { location: new RegExp(escapeRegex(hubNameCore), 'i') };
    const since72h = new Date(Date.now() - 72 * 60 * 60 * 1000);

    const [recentIncidents, allClusters, sopCoverage, proactiveSends, rpaItems] =
      await Promise.all([
        Incident.find({ ...hubMatch, createdAt: { $gte: since72h } })
          .select('type severity status confidence sentimentScore customerEmail awbNumber createdAt')
          .sort({ createdAt: -1 })
          .lean(),
        getActiveClusters().catch(() => []),
        SopLibrary.find({}).select('incidentType code title').lean(),
        ProactiveSend.find({ location: hub }).sort({ generatedAt: -1 }).limit(5).lean(),
        RpaRunItem.find(hubMatch)
          .select('outcome filename error createdAt')
          .sort({ createdAt: -1 })
          .limit(30)
          .lean()
          .catch(() => []),
      ]);

    const hubClusters = allClusters.filter(
      (c) => c.location && new RegExp(escapeRegex(hubNameCore), 'i').test(c.location),
    );

    // Build incident breakdown
    const typeBreakdown = {};
    const severityBreakdown = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    let breachedCount = 0;
    let pendingReviewCount = 0;
    const affectedEmails = new Set();

    for (const inc of recentIncidents) {
      if (inc.type) typeBreakdown[inc.type] = (typeBreakdown[inc.type] || 0) + 1;
      if (inc.severity) severityBreakdown[inc.severity] = (severityBreakdown[inc.severity] || 0) + 1;
      if (inc.status === 'BREACHED') breachedCount++;
      if (inc.status === 'PENDING_REVIEW') pendingReviewCount++;
      if (inc.customerEmail) affectedEmails.add(inc.customerEmail);
    }

    const sortedTypes = Object.entries(typeBreakdown).sort((a, b) => b[1] - a[1]);
    const dominantType = sortedTypes[0]?.[0] || 'other';
    const dominantCount = sortedTypes[0]?.[1] || 0;

    // Fetch customer profiles for affected emails
    const emailList = [...affectedEmails];
    const matchingProfiles = emailList.length > 0
      ? await CustomerProfile.find({ email: { $in: emailList } })
          .select('email cases averageSentiment frustrationTrend')
          .lean()
      : [];
    const repeatCustomers = matchingProfiles.filter((p) => (p.cases?.length || 0) >= 2);
    const frustratedCustomers = matchingProfiles.filter(
      (p) => p.averageSentiment != null && p.averageSentiment <= 0.35,
    );

    // SOP and proactive state
    const hasSopForDominant = sopCoverage.some((s) => s.incidentType === dominantType);
    const latestProactive = proactiveSends[0] || null;
    const proactiveStatus = latestProactive?.status || 'none';

    // Top cluster
    const topCluster = hubClusters.sort(
      (a, b) => (b.overallCascadeScore || 0) - (a.overallCascadeScore || 0),
    )[0] || null;

    const rpaFailures = rpaItems.filter((r) => r.outcome === 'failed' || r.outcome === 'error').length;
    const rpaDuplicates = rpaItems.filter((r) => r.outcome === 'duplicate').length;

    // Data snapshot for Claude
    const dataSummary = {
      hub,
      analysisWindow: '72 hours',
      recentIncidentCount: recentIncidents.length,
      typeBreakdown,
      dominantType: dominantType.replace(/_/g, ' '),
      dominantTypeCount: dominantCount,
      severityBreakdown,
      breachedSLA: breachedCount,
      pendingReview: pendingReviewCount,
      affectedCustomers: emailList.length,
      repeatCustomers: repeatCustomers.length,
      repeatCustomerSample: repeatCustomers.slice(0, 2).map((p) => p.email),
      frustratedCustomers: frustratedCustomers.length,
      activeHubClusters: hubClusters.length,
      topCluster: topCluster
        ? {
            type: (topCluster.type || 'unknown').replace(/_/g, ' '),
            incidentsInCluster: topCluster.count,
            cascadeScore: round(topCluster.overallCascadeScore || 0, 2),
            ageHours: Math.round(
              (Date.now() - new Date(topCluster.firstSeen).getTime()) / 3600000,
            ),
          }
        : null,
      sopCoverageForDominantType: hasSopForDominant ? 'exists' : 'MISSING',
      proactiveCommunicationStatus: proactiveStatus,
      rpaProcessingFailures: rpaFailures,
      rpaSkippedDuplicates: rpaDuplicates,
    };

    // Call Claude for cross-signal synthesis
    let aiActions = [];
    try {
      const raw = await callAI({
        system:
          'You are NEXUS, a superhuman DHL Malaysia operations intelligence system. ' +
          'You synthesize multiple real-time data streams simultaneously and produce grounded, specific, non-generic action recommendations. ' +
          'Return ONLY a valid JSON array — no markdown, no explanation, no code fences.',
        user:
          `Analyze this 72-hour operational snapshot for ${hub} and produce exactly 3 recommendations ordered by urgency.\n\n` +
          `DATA:\n${JSON.stringify(dataSummary, null, 2)}\n\n` +
          `REQUIREMENTS:\n` +
          `- Each recommendation must synthesize signals from AT LEAST 3 different data fields above\n` +
          `- Reference SPECIFIC numbers from the data (incident counts, cascade scores, emails, percentages)\n` +
          `- causalChain must show cause-effect: "X → causes Y → demands action Z"\n` +
          `- estimatedImpact must be derived from the actual counts in the data\n` +
          `- signals must be SHORT human-readable chips like "10 late deliveries" or "cascade score 0.87" or "3 frustrated customers" — NEVER use JSON key names like "topCluster.count"\n` +
          `- Do NOT give generic DHL advice — every word must be specific to ${hub} and these exact numbers\n` +
          `- Skip recommendations for fields that are 0 or null\n\n` +
          `Return this exact JSON shape (array of 3 objects):\n` +
          `[{"priority":"critical|high|medium","title":"Short imperative title under 10 words","headline":"One sentence cross-signal finding under 30 words","signals":["e.g. 10 late deliveries","e.g. 3 frustrated customers","e.g. 12 SLA breaches"],"causalChain":"A → B → C (under 25 words)","action":"Specific step to take right now (one sentence)","estimatedImpact":"e.g. ~12 escalations prevented","timeframe":"Act within 2 hours|Act today|Act this week","confidence":0.88,"linkTo":"/proactive|/review|/inbox|/knowledge|/board|/rpa"}]`,
        maxTokens: 1400,
      });

      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) aiActions = parsed.slice(0, 5);
      }
    } catch (err) {
      console.error('[brain] hub actions AI synthesis error:', err.message);
    }

    // Static fallback if Claude failed or returned nothing
    if (aiActions.length === 0) {
      if (topCluster) {
        const ageH = Math.round(
          (Date.now() - new Date(topCluster.firstSeen).getTime()) / 3600000,
        );
        aiActions.push({
          priority: 'critical',
          title: 'Deploy proactive communications now',
          headline:
            `Active ${(topCluster.type || '').replace(/_/g, ' ')} cluster (cascade ${round(topCluster.overallCascadeScore || 0, 2)}) at ${hub} — communication window is closing.`,
          signals: [
            `${topCluster.count} incidents in cluster`,
            `Cascade score: ${round(topCluster.overallCascadeScore || 0, 2)}`,
            `Cluster age: ${ageH}h`,
          ],
          causalChain: `Cluster forming ${ageH}h ago → SLA pressure building → customer escalation imminent`,
          action: 'Open Proactive page and send the hub notice + customer email bundle immediately.',
          estimatedImpact: `~${Math.round((topCluster.count || 3) * 1.8)} escalations prevented`,
          timeframe: 'Act within 2 hours',
          confidence: 0.84,
          linkTo: '/proactive',
        });
      }
      if (breachedCount > 0) {
        aiActions.push({
          priority: 'high',
          title: 'Clear SLA breach backlog',
          headline:
            `${breachedCount} incidents already BREACHED — ${repeatCustomers.length} are repeat customers with frustration history.`,
          signals: [
            `${breachedCount} SLA breached`,
            `${repeatCustomers.length} repeat customers`,
            `${pendingReviewCount} pending review`,
          ],
          causalChain: `SLA breach + repeat customer → formal complaint filing → NPS damage`,
          action: 'Open Review Queue, filter BREACHED + Critical/High, approve all within this session.',
          estimatedImpact: `${breachedCount} cases resolved before formal escalation`,
          timeframe: 'Act today',
          confidence: 0.91,
          linkTo: '/review',
        });
      }
      if (!hasSopForDominant && dominantCount >= 2) {
        aiActions.push({
          priority: 'medium',
          title: `Generate SOP for ${dominantType.replace(/_/g, ' ')}`,
          headline:
            `No SOP exists for ${dominantType.replace(/_/g, ' ')} at ${hub} — agents are improvising on every case.`,
          signals: [
            `${dominantCount} ${dominantType.replace(/_/g, ' ')} incidents`,
            'SOP coverage: MISSING',
            `${rpaFailures} RPA failures`,
          ],
          causalChain: `Missing SOP → inconsistent agent response → repeat contacts → inflated incident volume`,
          action: `Go to Knowledge Observatory and generate a SOP draft from the existing ${dominantType.replace(/_/g, ' ')} case history.`,
          estimatedImpact: '~30% reduction in repeat contacts',
          timeframe: 'Act this week',
          confidence: 0.78,
          linkTo: '/knowledge',
        });
      }
    }

    return {
      folderId,
      folderLabel,
      isActionPlan: true,
      hub,
      dataSummary,
      actions: aiActions,
      records: [],
    };
  }

  const incidentMatch = getFolderMatch(folderId);
  const incidents = await Incident.find(incidentMatch)
    .select("title description rawInput type severity status location confidence customerEmail awbNumber sentimentScore holdForReview createdAt updatedAt resolvedAt source")
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .lean();

  return {
    folderId,
    folderLabel,
    records: incidents.map((incident) =>
      recordItem(
        "incident",
        `${incident.title || `INC-${String(incident._id).slice(-6).toUpperCase()}`}`,
        incident.description || incident.rawInput || "Incident record.",
        {
          type: incident.type,
          severity: incident.severity,
          status: incident.status,
          location: incident.location,
          confidence: round(Number(incident.confidence || 0) * 100, 1),
          customerEmail: incident.customerEmail,
          awbNumber: incident.awbNumber,
        },
        `/incidents/${incident._id}`,
        incident,
      ),
    ),
  };
}

async function buildEvidencePack({ query, folderId }) {
  const folderMatch = getFolderMatch(folderId);
  const queryMatch = inferQueryFilters(query);
  const baseMatch = mergeMatches(folderMatch, queryMatch);
  const searchMatch = addTextSearch(baseMatch, query);
  const fallbackMatch = Object.keys(baseMatch).length ? baseMatch : {};

  const incidents = await Incident.find(searchMatch)
    .select("title description rawInput type severity status location confidence customerEmail awbNumber sentimentScore sentimentLabel holdForReview createdAt updatedAt resolvedAt agentResults source sla")
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  const incidentFallback =
    incidents.length > 0
      ? incidents
      : await Incident.find(fallbackMatch)
          .select("title description rawInput type severity status location confidence customerEmail awbNumber sentimentScore sentimentLabel holdForReview createdAt updatedAt resolvedAt agentResults source sla")
          .sort({ createdAt: -1 })
          .limit(20)
          .lean();

  const compactIncidents = incidentFallback.map(compactIncident);
  const locationSet = [...new Set(compactIncidents.map((item) => item.location).filter(Boolean))].slice(0, 5);
  const typeSet = [...new Set(compactIncidents.map((item) => item.type).filter(Boolean))].slice(0, 5);

  const [statsByStatus, statsByType, statsByLocation, sops, drafts, rpaRuns, rpaItems, customers, auditLogs, feedback, pipelineEvents, proactiveSends, clusters, semantic] =
    await Promise.all([
      Incident.aggregate([
        { $match: fallbackMatch },
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Incident.aggregate([
        { $match: fallbackMatch },
        { $group: { _id: "$type", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Incident.aggregate([
        { $match: fallbackMatch },
        { $group: { _id: "$location", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 },
      ]),
      SopLibrary.find(typeSet.length ? { incidentType: { $in: typeSet } } : {})
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      SopDraft.find(typeSet.length ? { incidentType: { $in: typeSet }, status: { $ne: "rejected" } } : { status: { $ne: "rejected" } })
        .sort({ generatedAt: -1 })
        .limit(10)
        .lean(),
      RpaRun.find({}).sort({ createdAt: -1 }).limit(8).lean(),
      RpaRunItem.find({}).sort({ createdAt: -1 }).limit(12).lean(),
      CustomerProfile.find({
        $or: [
          { averageSentiment: { $lte: 0.45 } },
          { email: { $in: compactIncidents.map((item) => item.customerEmail).filter(Boolean) } },
        ],
      })
        .sort({ updatedAt: -1 })
        .limit(10)
        .lean(),
      AuditLog.find({}).sort({ timestamp: -1 }).limit(12).lean(),
      FeedbackDatasetEntry.find({}).sort({ createdAt: -1 }).limit(10).lean(),
      PipelineEvent.find({}).sort({ createdAt: -1 }).limit(12).lean(),
      ProactiveSend.find(locationSet.length ? { location: { $in: locationSet } } : {})
        .sort({ generatedAt: -1 })
        .limit(8)
        .lean(),
      getActiveClusters().catch(() => []),
      query ? searchEmbeddings(query, 5).catch(() => ({ candidates: [] })) : { candidates: [] },
    ]);

  const sopCodes = sops.map((sop) => sop.code).filter(Boolean);
  const sopResolutionStats = sopCodes.length
    ? await Incident.aggregate([
        { $match: { ...fallbackMatch, "agentResults.resolution.sopCode": { $in: sopCodes } } },
        {
          $group: {
            _id: "$agentResults.resolution.sopCode",
            total: { $sum: 1 },
            resolved: { $sum: { $cond: [{ $in: ["$status", ["RESOLVED", "CLOSED"]] }, 1, 0] } },
            breached: { $sum: { $cond: [{ $eq: ["$status", "BREACHED"] }, 1, 0] } },
            pending: { $sum: { $cond: [{ $eq: ["$status", "PENDING_REVIEW"] }, 1, 0] } },
          },
        },
      ])
    : [];
  const sopStatsByCode = new Map(sopResolutionStats.map((s) => [s._id, s]));

  const totalInScope = await Incident.countDocuments(fallbackMatch);
  const breached = compactIncidents.filter((item) => item.status === "BREACHED").length;
  const pendingReview = compactIncidents.filter((item) => item.status === "PENDING_REVIEW").length;
  const highCritical = compactIncidents.filter((item) => ["High", "Critical"].includes(item.severity)).length;
  const avgConfidence =
    compactIncidents.length > 0
      ? round(compactIncidents.reduce((sum, item) => sum + Number(item.confidence || 0), 0) / compactIncidents.length, 1)
      : 0;

  const evidence = [
    evidenceItem(
      "folder",
      getFolderLabel(folderId),
      `${totalInScope} historical incidents match this folder/query context.`,
      { folderId, totalInScope },
    ),
    ...compactIncidents.slice(0, 6).map((incident) =>
      evidenceItem(
        "incident",
        `${incident.ref} ${incident.type.replace(/_/g, " ")} at ${incident.location}`,
        incident.description || incident.title,
        {
          severity: incident.severity,
          status: incident.status,
          confidence: incident.confidence,
          customerEmail: incident.customerEmail,
          awbNumber: incident.awbNumber,
        },
        `/incidents/${incident.id}`,
      ),
    ),
    ...sops.slice(0, 3).map((sop) => {
      const stats = sopStatsByCode.get(sop.code);
      const total = stats?.total || 0;
      const rate = total > 0 ? pct(stats.resolved, total) : null;
      const detail = total > 0
        ? `${sop.code || "SOP"} covers ${sop.incidentType}. Used by ${total} incidents — ${stats.resolved} resolved, ${stats.breached} breached, ${stats.pending} pending. Resolution rate ${rate}%.`
        : `${sop.code || "SOP"} covers ${sop.incidentType}. No incidents have used this SOP yet.`;
      return evidenceItem("sop", sop.title || sop.code, detail, {
        code: sop.code,
        steps: sop.steps?.length || 0,
        usageCount: total,
        resolved: stats?.resolved || 0,
        breached: stats?.breached || 0,
        resolutionRate: rate,
      });
    }),
    ...clusters.slice(0, 3).map((cluster) =>
      evidenceItem(
        "cluster",
        `${cluster.location} ${cluster.type?.replace(/_/g, " ")} cluster`,
        `${cluster.count} incidents detected between ${new Date(cluster.firstSeen).toLocaleString()} and ${new Date(cluster.lastSeen).toLocaleString()}.`,
        { clusterId: cluster.clusterId, count: cluster.count },
      ),
    ),
  ].slice(0, 14);

  return {
    query,
    folderId,
    folderLabel: getFolderLabel(folderId),
    summary: {
      totalInScope,
      sampleSize: compactIncidents.length,
      breached,
      pendingReview,
      highCritical,
      avgConfidence,
      breachedRate: pct(breached, compactIncidents.length),
      reviewRate: pct(pendingReview, compactIncidents.length),
      highCriticalRate: pct(highCritical, compactIncidents.length),
      topStatuses: statsByStatus,
      topTypes: statsByType,
      topLocations: statsByLocation,
    },
    incidents: compactIncidents,
    sops: sops.map((sop) => {
      const stats = sopStatsByCode.get(sop.code);
      const total = stats?.total || 0;
      return {
        code: sop.code,
        title: sop.title,
        incidentType: sop.incidentType,
        stepCount: sop.steps?.length || 0,
        createdAt: sop.createdAt,
        usageCount: total,
        resolved: stats?.resolved || 0,
        breached: stats?.breached || 0,
        pending: stats?.pending || 0,
        resolutionRate: total > 0 ? pct(stats.resolved, total) : null,
      };
    }),
    drafts: drafts.map((draft) => ({
      id: String(draft._id),
      incidentType: draft.incidentType,
      location: draft.location,
      status: draft.status,
      title: draft.generatedContent?.title || "SOP draft",
    })),
    rpa: {
      runs: rpaRuns.map((run) => ({
        runId: run.runId,
        status: run.status,
        processedCount: run.processedCount || run.totalFiles || 0,
        failed: run.failed || 0,
        duplicates: run.duplicates || 0,
        createdAt: run.createdAt || run.completedAt,
      })),
      items: rpaItems.map((item) => ({
        filename: item.filename,
        outcome: item.outcome,
        severity: item.severity,
        location: item.location,
        incidentId: item.incidentId,
      })),
    },
    customers: customers.map((profile) => ({
      email: profile.email,
      averageSentiment: profile.averageSentiment,
      frustrationTrend: profile.frustrationTrend,
      caseCount: profile.cases?.length || 0,
      tags: profile.tags || [],
    })),
    aiDecisions: {
      auditLogs: auditLogs.map((log) => ({
        action: log.action,
        actorType: log.actorType,
        field: log.field,
        timestamp: log.timestamp,
      })),
      feedback: feedback.map((entry) => ({
        finalType: entry.finalType,
        finalSeverity: entry.finalSeverity,
        overrideOccurred: entry.overrideOccurred,
        correctedFields: entry.correctedFields,
      })),
      pipelineEvents: pipelineEvents.map((event) => ({
        eventType: event.eventType,
        timestamp: event.createdAt,
      })),
    },
    proactiveSends: proactiveSends.map((send) => ({
      id: String(send._id),
      incidentType: send.incidentType,
      location: send.location,
      status: send.status,
      estimatedComplaintsPrevented: send.estimatedComplaintsPrevented,
    })),
    clusters,
    semanticHits: semantic?.candidates || [],
    evidence,
  };
}

function inferActions(evidencePack) {
  const actions = [];
  const hasCluster = evidencePack.clusters?.length > 0;
  const hasPending = evidencePack.summary.pendingReview > 0;
  const hasSopGap = evidencePack.drafts.length === 0 && evidencePack.sops.length === 0 && evidencePack.summary.sampleSize >= 3;
  const hasBreached = evidencePack.summary.breached > 0;
  const topCluster = evidencePack.clusters?.[0] || null;
  const topType = topCluster?.type || evidencePack.summary.topTypes?.[0]?._id || evidencePack.incidents?.[0]?.type || "other";
  const topLocation = topCluster?.location || evidencePack.summary.topLocations?.[0]?._id || evidencePack.incidents?.[0]?.location || evidencePack.folderLabel;

  if (hasCluster) {
    actions.push({
      id: "create-proactive-alert",
      label: "Create Proactive Alert",
      description: "Prepare hub and customer communication for the active cluster.",
      target: "/proactive",
      priority: "high",
      operation: "generate_proactive",
      payload: {
        incidentType: topType,
        location: topLocation,
        clusterId: topCluster?.clusterId || null,
        clusterCount: topCluster?.count || evidencePack.summary.sampleSize || 3,
      },
    });
  }
  if (hasSopGap) {
    actions.push({
      id: "generate-sop",
      label: "Generate SOP Draft",
      description: "Use repeated historical cases to create a standard operating procedure.",
      target: "/knowledge",
      priority: "medium",
      operation: "generate_sop",
      payload: {
        incidentType: topType,
        location: topLocation,
        clusterId: topCluster?.clusterId || null,
      },
    });
  }
  if (hasPending || hasBreached) {
    actions.push({
      id: "open-review",
      label: "Open Review Queue",
      description: "Prioritize high-risk or breached incidents for human review.",
      target: "/review",
      priority: "high",
    });
  }
  actions.push({
    id: "open-board",
    label: "Open Incident Board",
    description: "Inspect the affected incidents in operational workflow view.",
    target: "/board",
    priority: "normal",
  });
  actions.push({
    id: "inspect-rpa",
    label: "Inspect RPA Intake",
    description: "Check whether incoming emails or duplicates are driving repeated work.",
    target: "/rpa",
    priority: "normal",
  });
  return actions.slice(0, 5);
}

function fallbackAnswer(evidencePack, actions) {
  const topLocation = evidencePack.summary.topLocations?.[0]?._id || evidencePack.folderLabel;
  const topType = evidencePack.summary.topTypes?.[0]?._id || "mixed incident types";
  const breachedRate = evidencePack.summary.breachedRate;
  const reviewRate = evidencePack.summary.reviewRate;

  return {
    answer:
      `Finding:\n${topLocation} is showing pressure mainly around ${String(topType).replace(/_/g, " ")}. ` +
      `The evidence pack contains ${evidencePack.summary.sampleSize} representative incidents from ${evidencePack.summary.totalInScope} historical records in scope.\n\n` +
      `Evidence:\n- ${evidencePack.summary.breached} sampled incidents are already BREACHED (${breachedRate}%).\n` +
      `- ${evidencePack.summary.pendingReview} sampled incidents are in PENDING_REVIEW (${reviewRate}%).\n` +
      `- ${evidencePack.sops.length} matching SOPs and ${evidencePack.drafts.length} SOP drafts were found.\n` +
      `- ${evidencePack.clusters.length} active clusters are visible in the current operations window.\n\n` +
      `Recommended actions:\n1. Prioritize breached and High/Critical cases into the review queue.\n` +
      `2. Generate or update SOP coverage for the dominant incident type.\n` +
      `3. Use proactive communications if the issue is clustered around a hub.\n` +
      `4. Check recent RPA batches for duplicate or repeated customer signals.`,
    summary: `${topLocation}: ${topType}, ${evidencePack.summary.totalInScope} records in scope`,
    confidence: 0.74,
    reasoningStages: [
      "planned query from folder and question",
      "retrieved MongoDB incident history",
      "checked SOP and draft coverage",
      "checked RPA, customer, cluster, and AI-decision evidence",
      "generated deterministic fallback recommendation",
    ],
    actions,
  };
}

async function runBrainReasoning(evidencePack) {
  const actions = inferActions(evidencePack);
  const fallback = fallbackAnswer(evidencePack, actions);

  try {
    const raw = await callAI({
      system: BRAIN_ANALYST_SYSTEM_PROMPT,
      user: JSON.stringify({
        query: evidencePack.query,
        selectedFolder: evidencePack.folderLabel,
        summary: evidencePack.summary,
        incidents: evidencePack.incidents.slice(0, 12),
        sops: evidencePack.sops.slice(0, 8),
        drafts: evidencePack.drafts.slice(0, 5),
        rpa: evidencePack.rpa,
        customers: evidencePack.customers.slice(0, 6),
        clusters: evidencePack.clusters.slice(0, 5),
        semanticHits: evidencePack.semanticHits.slice(0, 5),
        proposedActions: actions,
      }),
      maxTokens: 2500,
      json: true,
    });

    const parsed = JSON.parse(raw);
    const parsedActions = Array.isArray(parsed.actions)
      ? parsed.actions.filter((action) => action && (action.id || action.label || action.target))
      : [];
    return {
      headline: parsed.headline || null,
      answer: parsed.answer || fallback.answer,
      summary: parsed.summary || fallback.summary,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence || fallback.confidence))),
      reasoningStages: Array.isArray(parsed.reasoningStages) && parsed.reasoningStages.length
        ? parsed.reasoningStages.slice(0, 8)
        : fallback.reasoningStages,
      actions: parsedActions.length
        ? parsedActions.map((action, index) => {
            const base = actions.find((item) => item.id === action.id) || actions[index] || {};
            return {
              ...base,
              id: action.id || base.id || `action-${index + 1}`,
              label: action.label || base.label || "Review evidence",
              description: action.description || base.description || "Inspect supporting records.",
              target: action.target || base.target || "/board",
              priority: action.priority || base.priority || "normal",
              operation: action.operation || base.operation || null,
              payload: action.payload || base.payload || null,
            };
          }).slice(0, 5)
        : actions,
    };
  } catch (error) {
    console.error("[brain] reasoning fallback:", error.message);
    return fallback;
  }
}

router.get(
  "/folders",
  requireAuth,
  requireRole("admin", "reviewer"),
  async (_req, res, next) => {
    try {
      const payload = await buildFolderTree();
      return res.json(payload);
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  "/records",
  requireAuth,
  requireRole("admin", "reviewer"),
  async (req, res, next) => {
    try {
      const folderId = String(req.query.folderId || "root");
      const payload = await buildFolderRecords(folderId, req.query.limit);
      return res.json({
        ...payload,
        count: payload.records.length,
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  "/actions/execute",
  requireAuth,
  requireRole("admin", "reviewer"),
  async (req, res) => {
    try {
      const { operation, payload, query: originalQuery } = req.body || {};
      if (!operation || typeof operation !== "string") {
        return res.status(400).json({ error: "operation is required" });
      }

      const actor = req.user?.email || "admin";

      if (operation === "create_sop") {
        const code = String(payload?.code || "").trim();
        const title = String(payload?.title || "").trim();
        const incidentType = String(payload?.incidentType || "").trim();
        const location = String(payload?.location || "").trim();
        const steps = Array.isArray(payload?.steps) ? payload.steps.filter(Boolean) : [];

        if (!code || !title || !incidentType || !steps.length) {
          return res.status(400).json({ error: "create_sop requires code, title, incidentType, steps" });
        }

        const existing = await SopLibrary.findOne({ code });
        if (existing) {
          return res.json({ ok: true, alreadyExists: true, sop: existing });
        }

        const sop = await SopLibrary.create({
          code,
          title,
          incidentType,
          steps,
          source: "ai_generated",
          publishedBy: `brain-suggested:${actor}`,
          publishedAt: new Date(),
          statusHistory: [{
            status: "active",
            date: new Date(),
            by: `brain-suggested:${actor}`,
            note: payload.description
              ? `Created via Brain Execute — ${payload.description}`
              : `Created via Brain Execute in response to: "${originalQuery || "operator request"}"`,
          }],
        });

        AuditLog.create({
          actor,
          actorType: "human",
          action: "brain_execute_create_sop",
          newValue: { sopCode: sop.code, title: sop.title, incidentType, location },
          timestamp: new Date(),
        }).catch(() => {});

        return res.json({
          ok: true,
          operation,
          result: { sopId: sop._id, code: sop.code, title: sop.title, stepCount: steps.length },
          message: `SOP ${sop.code} created — ${steps.length} steps, active immediately.`,
        });
      }

      if (operation === "fire_proactive_notice") {
        const loc = String(payload?.location || "").trim();
        const type = String(payload?.incidentType || "other").trim();
        const summary = String(payload?.summary || "").trim();
        const stepsList = Array.isArray(payload?.recommendedSteps) ? payload.recommendedSteps.filter(Boolean) : [];
        if (!loc || !summary) {
          return res.status(400).json({ error: "fire_proactive_notice requires location and summary" });
        }

        const hubNotice =
          `BRAIN-INITIATED ALERT — ${loc}\n\n` +
          `${summary}\n\n` +
          `Recommended actions:\n` +
          stepsList.map((s, i) => `${i + 1}. ${s}`).join("\n");

        const send = await ProactiveSend.create({
          incidentType: type,
          location: loc,
          documents: { hubNotice },
          status: "sent",
          sentDocuments: ["hubNotice"],
          sentAt: new Date(),
          sentBy: `brain-execute:${actor}`,
          estimatedComplaintsPrevented: 3,
        });

        AuditLog.create({
          actor,
          actorType: "human",
          action: "brain_execute_fire_notice",
          newValue: { proactiveSendId: send._id, location: loc, type },
          timestamp: new Date(),
        }).catch(() => {});

        return res.json({
          ok: true,
          operation,
          result: { proactiveSendId: send._id, location: loc },
          message: `Proactive notice fired for ${loc}.`,
        });
      }

      if (operation === "flag_customer_account") {
        const email = String(payload?.email || "").trim().toLowerCase();
        const tags = Array.isArray(payload?.tags) ? payload.tags.filter(Boolean) : [];
        const reason = String(payload?.reason || "Flagged via Brain Execute").trim();
        if (!email) {
          return res.status(400).json({ error: "flag_customer_account requires email" });
        }

        const profile = await CustomerProfile.findOneAndUpdate(
          { email },
          { $addToSet: { tags: { $each: tags } }, $set: { lastSeenAt: new Date() } },
          { upsert: true, new: true },
        );

        AuditLog.create({
          actor,
          actorType: "human",
          action: "brain_execute_flag_account",
          newValue: { email, tags, reason },
          timestamp: new Date(),
        }).catch(() => {});

        return res.json({
          ok: true,
          operation,
          result: { profileId: profile._id, email: profile.email, tags: profile.tags },
          message: `Account ${email} flagged with ${tags.length} tag${tags.length === 1 ? "" : "s"}.`,
        });
      }

      return res.status(400).json({ error: `unknown operation: ${operation}` });
    } catch (error) {
      console.error("[brain/actions/execute]", error.message);
      return res.status(500).json({ error: "Execute failed", detail: error.message });
    }
  },
);

router.post(
  "/query",
  requireAuth,
  requireRole("admin", "reviewer"),
  async (req, res, next) => {
    try {
      const { query, folderId = "root", mode = "deep_analysis" } = req.body || {};
      if (!query || typeof query !== "string" || query.trim().length < 3) {
        return res.status(400).json({ error: "query must be at least 3 characters" });
      }

      const trimmedQuery = query.trim().slice(0, 800);
      const evidencePack = await buildEvidencePack({ query: trimmedQuery, folderId });
      const analysis = await runBrainReasoning(evidencePack);

      return res.json({
        query: trimmedQuery,
        mode,
        folderId,
        folderLabel: evidencePack.folderLabel,
        answer: analysis.answer,
        summary: analysis.summary,
        confidence: analysis.confidence,
        evidence: evidencePack.evidence,
        actions: analysis.actions,
        headline: analysis.headline,
        foldersUsed: [folderId, ...new Set(evidencePack.evidence.map((item) => item.type))],
        reasoningStages: analysis.reasoningStages,
        context: {
          summary: evidencePack.summary,
          incidents: evidencePack.incidents.slice(0, 8),
          semanticHits: evidencePack.semanticHits.slice(0, 5),
          clusters: evidencePack.clusters.slice(0, 5),
          sops: evidencePack.sops.slice(0, 6),
          rpa: evidencePack.rpa,
        },
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
