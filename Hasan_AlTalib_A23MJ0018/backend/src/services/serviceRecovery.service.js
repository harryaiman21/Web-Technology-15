// backend/src/services/serviceRecovery.service.js
//
// Service Recovery Paradox Agent
// ──────────────────────────────
// Evaluates whether a completed incident warrants proactive customer outreach.
// Proactive recovery = reaching the customer BEFORE they complain.
// Research shows customers who receive a well-handled proactive recovery
// show higher loyalty than customers who never had a problem.
//
// Decision logic:
//   Triggered when incident type is late_delivery | damaged_parcel | missing_parcel
//   AND at least one of: mlConfidence < 0.75 | severity High/Critical | sla breach prob > 0.6
//
// Output: { triggered, message, status, language }
// Mutates: incident.recoveryMessage written directly to MongoDB

import Incident from "../models/Incident.model.js";
import AuditLog from "../models/AuditLog.model.js";
import { callAI } from "../config/callAI.js";

// ── Incident types that warrant proactive outreach ────────────────────────────
const RECOVERY_ELIGIBLE_TYPES = new Set([
  "late_delivery",
  "damaged_parcel",
  "missing_parcel",
]);

// ── Malay keywords for language detection ─────────────────────────────────────
const MALAY_KEYWORDS = [
  "parsel", "barang", "rosak", "lambat", "tidak sampai",
  "hilang", "belum sampai", "tolong", "hantar", "terima",
  "pakej", "penghantaran", "lewat", "alamat", "salah",
];

// ── SLA hours by severity (mirrors Incident.model.js slaDeadline virtual) ────
const SLA_HOURS = {
  Critical: 2,
  High:     4,
  Medium:   8,
  Low:      24,
};

/**
 * Detect whether the incident description is in Bahasa Malaysia.
 * Returns 'ms' if ≥1 Malay keyword found, otherwise 'en'.
 */
function detectLanguage(description) {
  const lower = (description || "").toLowerCase();
  const found = MALAY_KEYWORDS.some((kw) => lower.includes(kw));
  return found ? "ms" : "en";
}

/**
 * Extract customer email from incident description.
 * Looks for "From: name <email@>" or "From: email@" patterns.
 * Returns null if not found — graceful skip, not an error.
 */
function extractCustomerEmail(description) {
  if (!description) return null;

  const lines = description.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim().toLowerCase().startsWith("from:")) continue;

    const value = line.slice(5).trim();
    // Try <email> format: "Name <email@example.com>"
    const angleMatch = value.match(/<([^>]+@[^>]+)>/);
    if (angleMatch) return angleMatch[1].trim();

    // Try bare email
    const bareMatch = value.match(/[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/);
    if (bareMatch) return bareMatch[0].trim();
  }

  return null;
}

/**
 * Calculate a simple SLA breach probability.
 * Returns a 0-1 float based on how far into the SLA window we already are.
 * This is a heuristic — the ML service does not supply this directly.
 */
function estimateSlaProbability(incident) {
  const severity = incident.severity || "Medium";
  const slaHours = SLA_HOURS[severity] ?? 8;
  const createdAt = incident.createdAt ? new Date(incident.createdAt) : new Date();
  const elapsed = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60); // hours elapsed
  // If elapsed >= slaHours, probability = 1 (already breached)
  return Math.min(1, elapsed / slaHours);
}

/**
 * Build a concise incident summary for the AI prompt.
 * Never includes PII beyond what the agent already sees.
 */
function buildIncidentSummary(incident) {
  const type = (incident.type || "incident").replace(/_/g, " ");
  const severity = incident.severity || "Medium";
  const location =
    incident.location ||
    incident.agentResults?.intake?.fields?.location?.value ||
    incident.agentResults?.request?.location ||
    "DHL facility";
  const description = (incident.description || incident.rawInput || "").substring(0, 300);

  return `Type: ${type} | Severity: ${severity} | Location: ${location}\nDescription: ${description}`;
}

/**
 * Calculate the revised ETA (createdAt + SLA hours + 20% buffer).
 * Returns a human-readable string.
 */
function calculateRevisedEta(incident) {
  const severity = incident.severity || "Medium";
  const slaHours = SLA_HOURS[severity] ?? 8;
  const buffer   = Math.ceil(slaHours * 0.2);
  const createdAt = incident.createdAt ? new Date(incident.createdAt) : new Date();
  const eta = new Date(createdAt.getTime() + (slaHours + buffer) * 60 * 60 * 1000);
  return eta.toLocaleDateString("en-MY", {
    weekday: "long",
    year:    "numeric",
    month:   "long",
    day:     "numeric",
    hour:    "2-digit",
    minute:  "2-digit",
    hour12:  true,
  });
}

/**
 * Derive the RPA-compatible incident ID reference (INC-XXXXXX format).
 */
function toReference(id) {
  return `INC-${String(id).slice(-6).toUpperCase()}`;
}

/**
 * Generate the recovery message via callAI().
 * All AI calls go through the callAI wrapper — never Anthropic SDK directly.
 */
async function generateRecoveryMessage(incident, language, revisedEta, customerProfile = null) {
  const caseRef = toReference(incident._id);
  const incidentSummary = buildIncidentSummary(incident);
  const langLabel = language === "ms" ? "Bahasa Malaysia" : "English";

  const toneDirectives = [];
  if (customerProfile) {
    if (customerProfile.frustrationTrend === "worsening" || customerProfile.averageSentiment < 0.3) {
      toneDirectives.push(
        "This customer is deeply frustrated (worsening trend). Use a deeply apologetic, empathetic tone.",
        "Explicitly acknowledge their frustration and past experience.",
      );
    }
    if (customerProfile.isRepeat) {
      toneDirectives.push(
        `This is a repeat customer with ${customerProfile.totalCases} prior cases.`,
        "Acknowledge their ongoing experience and demonstrate that we are aware of their history.",
      );
    }
    if (customerProfile.totalEscalations > 0) {
      toneDirectives.push("This customer has escalated before. Prioritize urgency and concrete action.");
    }
    if (customerProfile.tags?.includes("loyal")) {
      toneDirectives.push("This is a loyal customer. Express genuine appreciation for their patience.");
    }
  }

  const system = [
    "You are DHL Express Malaysia customer service.",
    "You write empathetic, professional customer recovery messages.",
    "Be concise. Never admit fault legally.",
    "Always offer a concrete next step.",
    "Never mention internal tools, AI, or NEXUS.",
    `Write in ${langLabel}.`,
    ...toneDirectives,
  ].join(" ");

  const user = [
    `Generate a proactive customer recovery message for this DHL incident.`,
    `Case reference: ${caseRef}`,
    `Incident: ${incidentSummary}`,
    `Revised resolution estimate: ${revisedEta}`,
    `Language: ${langLabel}`,
    ...(customerProfile ? [
      `Customer context: ${customerProfile.totalCases} prior cases, avg sentiment ${customerProfile.averageSentiment?.toFixed(2)}, trend: ${customerProfile.frustrationTrend}, tags: ${(customerProfile.tags || []).join(', ') || 'none'}`,
    ] : []),
    `Include: empathy statement, case reference, revised ETA, concrete next step.`,
    `Keep under 150 words.`,
    `Do NOT use placeholders like [NAME]. Start with "Dear Customer,".`,
  ].join("\n");

  const text = await callAI({ system, user, maxTokens: 250 });
  return typeof text === "string" ? text.trim() : "";
}

/**
 * Main export: evaluateServiceRecovery(incident)
 *
 * @param {Object} incident — a Mongoose document or lean object after pipeline completes
 * @returns {{ triggered: boolean, message?: string, status?: string, language?: string }}
 */
export async function evaluateServiceRecovery(incident, customerProfile = null) {
  try {
    // ── 1. Eligibility gate ────────────────────────────────────────────────────
    const type = incident.type || "";
    if (!RECOVERY_ELIGIBLE_TYPES.has(type)) {
      return { triggered: false };
    }

    const mlConfidence     = Number(incident.confidence || 0);
    const severity         = incident.severity || "Medium";
    const slaProbability   = estimateSlaProbability(incident);
    const isHighPriority   = ["High", "Critical"].includes(severity);
    const isLowConfidence  = mlConfidence < 0.75;
    const isSlaAtRisk      = slaProbability > 0.6;

    if (!isHighPriority && !isLowConfidence && !isSlaAtRisk) {
      return { triggered: false };
    }

    // ── 2. Language detection ─────────────────────────────────────────────────
    const rawText = incident.description || incident.rawInput || "";
    const language = detectLanguage(rawText);

    // ── 3. Customer email (best-effort — no crash if absent) ──────────────────
    const customerEmail = extractCustomerEmail(rawText);

    // ── 4. Generate recovery message via callAI() ────────────────────────────
    const revisedEta = calculateRevisedEta(incident);
    let messageText  = "";

    try {
      messageText = await Promise.race([
        generateRecoveryMessage(incident, language, revisedEta, customerProfile),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Recovery AI timeout")), 15000)
        ),
      ]);
    } catch (aiError) {
      console.error("[serviceRecovery] AI generation failed:", aiError.message);
      // Graceful fallback: store empty message, status stays pending_send
      messageText = "";
    }

    // ── 5. Determine status based on severity + confidence ────────────────────
    const requiresHITL = isHighPriority || mlConfidence < 0.75;
    const status = requiresHITL ? "hitl_required" : "auto_sent";

    // ── 6. Persist to incident document ───────────────────────────────────────
    const recoveryPayload = {
      "recoveryMessage.text":        messageText,
      "recoveryMessage.language":    language,
      "recoveryMessage.generatedAt": new Date(),
      "recoveryMessage.status":      status,
      // store customer email in agentResults so it's accessible
      // without adding a PII field to the top-level schema
      "agentResults.recovery": {
        customerEmail: customerEmail || null,
        revisedEta,
        slaProbability: Math.round(slaProbability * 1000) / 1000,
        mlConfidence,
        triggered:     true,
        triggeredAt:   new Date(),
      },
    };

    await Incident.findByIdAndUpdate(incident._id, { $set: recoveryPayload });

    // ── 7. Audit log ──────────────────────────────────────────────────────────
    const auditAction =
      status === "auto_sent"
        ? "recovery_auto_sent"
        : "recovery_hitl_required";

    await AuditLog.create({
      incidentId: incident._id,
      actor:      "service-recovery-agent",
      actorType:  "agent",
      action:     auditAction,
      newValue: {
        language,
        status,
        mlConfidence,
        severity,
        slaProbability,
        customerEmailFound: Boolean(customerEmail),
      },
      timestamp: new Date(),
    });

    console.log(
      `[serviceRecovery] triggered for ${incident._id} — ` +
      `status=${status}, lang=${language}, email=${customerEmail ? "found" : "missing"}`
    );

    return {
      triggered: true,
      message:   messageText,
      status,
      language,
      customerEmail: customerEmail || null,
      revisedEta,
    };
  } catch (error) {
    // Never crash the pipeline — recovery failure is always non-fatal
    console.error("[serviceRecovery] evaluation error (non-fatal):", error.message);
    return { triggered: false };
  }
}
