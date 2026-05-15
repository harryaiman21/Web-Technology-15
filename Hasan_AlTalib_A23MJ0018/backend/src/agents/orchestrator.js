// backend/src/agents/orchestrator.js
import * as intakeAgent from "./intake.agent.js";
import * as classifierAgent from "./classifier.agent.js";
import * as dedupAgent from "./dedup.agent.js";
import * as resolutionAgent from "./resolution.agent.js";
import * as sseService from "../services/sse.service.js";
import { callAI } from "../config/callAI.js";
import * as fastapiService from "../services/fastapi.service.js";
import { explainShap } from "../services/fastapi.service.js";
import {
  createJob,
  advanceStage,
  completeJob,
  failJob,
  persistEvent,
} from "../services/pipelineJobs.service.js";
import Incident from "../models/Incident.model.js";
import AuditLog from "../models/AuditLog.model.js";
import OutboundEmail from "../models/OutboundEmail.model.js";
import SopLibrary from "../models/SopLibrary.model.js";
import SopDraft from "../models/SopDraft.model.js";
import ProactiveSend from "../models/ProactiveSend.model.js";
import { findClusterForIncident, getActiveClusters } from "../services/clusterDetection.service.js";
import { sendMorningBriefing } from "../services/morningBriefing.service.js";
import { getSimilarResolvedIncidents } from "../services/caseMemory.service.js";
import { computeUncertainty } from "../services/uncertainty.service.js";
import { evaluateServiceRecovery } from "../services/serviceRecovery.service.js";
import { calculateSlaDeadline, updateBreachProbability } from "../services/slaPrediction.service.js";
import { generateChatToken, sendAcknowledgement, sendEmail } from "../services/email.service.js";
import { notifyClusterCustomers } from "../services/clusterNotify.service.js";
import SystemConfig from "../models/SystemConfig.model.js";
import { quickSentimentScore, sentimentLabel as deriveSentimentLabel } from "../utils/sentiment.js";
import { broadcast as broadcastLive, broadcastIncidentUpdate } from "../services/liveStream.service.js";
import { embedResolvedIncident, embedIncidentAfterPipeline } from "../services/autoEmbed.service.js";
import { getProfileSummaryForAgent } from "../services/customerProfile.service.js";
import CustomerProfile from "../models/CustomerProfile.model.js";

const OPS_EMAIL = process.env.OPS_EMAIL || process.env.SMTP_USER || '';

// In-memory cooldown so a cluster surge doesn't send duplicate briefings.
// Keyed by "<type>:<location>", TTL 30 min per entry.
const BRIEFING_COOLDOWN_MS = 30 * 60 * 1000;
const briefingCooldowns = new Map();

/* ── Autonomous action rate limiter (in-memory sliding window) ────────────── */
const AUTO_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const AUTO_RATE_MAX = 50; // max autonomous escalations per hour
const autoActionTimestamps = [];

function isAutoRateLimited() {
  const now = Date.now();
  // Prune expired entries
  while (autoActionTimestamps.length && autoActionTimestamps[0] < now - AUTO_RATE_WINDOW_MS) {
    autoActionTimestamps.shift();
  }
  return autoActionTimestamps.length >= AUTO_RATE_MAX;
}

function recordAutoAction() {
  autoActionTimestamps.push(Date.now());
}

function normalizeFieldValue(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim();
}

function buildClassifierText(fields, rawText) {
  const description = normalizeFieldValue(fields?.description?.value);
  const location = normalizeFieldValue(fields?.location?.value);
  const date = normalizeFieldValue(fields?.date?.value);

  if (description.length >= 25) {
    return description;
  }

  const parts = [description, location && `Location: ${location}`, date && `Date: ${date}`].filter(
    Boolean,
  );

  return parts.join(". ") || rawText;
}

function buildDedupText(fields, rawText) {
  const description = normalizeFieldValue(fields?.description?.value);
  const location = normalizeFieldValue(fields?.location?.value);
  const date = normalizeFieldValue(fields?.date?.value);

  const parts = [description, location && `Location: ${location}`, date && `Date: ${date}`].filter(
    Boolean,
  );

  return parts.join(". ") || buildClassifierText(fields, rawText);
}

export async function runPipeline(incidentId, rawText) {
  // ── W1: Create durable job record ────────────────────────────────────────
  let job = null;
  try {
    job = await createJob(incidentId, { correlationId: incidentId.toString() });
  } catch (jobErr) {
    console.error("[orchestrator] job creation failed (non-fatal):", jobErr.message);
  }
  const jobId = job?._id ?? null;

  // Helper: emit to per-incident SSE, persist job event, and broadcast to ops live stream
  function emitAndPersist(payload) {
    sseService.emit(incidentId, payload);
    if (jobId) persistEvent(jobId, incidentId, payload);
    if (payload.type !== 'agent_thinking') broadcastLive({ ...payload, incidentId: String(incidentId) });
  }

  const handleFailure = async (reason = "Agent unavailable after retry") => {
    await Incident.findByIdAndUpdate(incidentId, { status: "DRAFT", pipelineError: true });
    emitAndPersist({ type: "pipeline_error", reason });
    sseService.close(incidentId);
    if (jobId) await failJob(jobId, reason);
  };

  try {
    const existingIncident = await Incident.findById(incidentId).lean();
    const requestedSeverity = existingIncident?.agentResults?.request?.severity;
    const photoAssessment = existingIncident?.agentResults?.damageAssessment;
    const photoHold = existingIncident?.rejectionReason === "Photo-text inconsistency detected";

    const startTime = Date.now();
    const confidenceSnapshots = [];
    const startPayload = {
      agentId: "orchestrator",
      decision: "pipeline_started",
      confidence: 1.0,
    };
    emitAndPersist(startPayload);
    if (jobId) await advanceStage(jobId, "intake");

    const makeThinkingEmitter = (agentId) => (token) => {
      sseService.emit(incidentId, { type: 'agent_thinking', agentId, token });
    };

    const intakeResult = await intakeAgent.run({ rawText }, { onThinking: makeThinkingEmitter('intake') });
    emitAndPersist(intakeResult);
    await AuditLog.create({
      incidentId,
      actor: "intake-agent",
      actorType: "agent",
      action: "field_extraction",
      newValue: intakeResult.fields,
      confidence: intakeResult.confidence,
      timestamp: new Date(),
    });
    if (intakeResult.decision === "unavailable") {
      await handleFailure();
      return;
    }

    try {
      const snap = {
        stage: "intake", stageLabel: "Email received",
        confidence: 0.5, // intentionally low — raw text only, no classification yet
        classificationType: intakeResult.decision || null,
        minutesElapsed: 0, note: "Initial classification from raw input",
        recordedAt: new Date(),
      };
      sseService.emit(incidentId, { type: "confidence_snapshot", ...snap });
      confidenceSnapshots.push(snap);
    } catch (_) {}

    const description = normalizeFieldValue(intakeResult.fields?.description?.value) || rawText;
    const classifierText = buildClassifierText(intakeResult.fields, rawText);
    const dedupText = buildDedupText(intakeResult.fields, rawText);

    // ── Phase 4: Customer history lookup ─────────────────────────────────────
    const customerEmail = (
      intakeResult.fields?.email?.value ||
      intakeResult.fields?.customerEmail?.value ||
      intakeResult.fields?.reporterEmail?.value ||
      intakeResult.fields?.from?.value ||
      null
    )?.toLowerCase()?.trim() || null;

    let isRepeatCustomer = false;
    let customerHistoryCount = 0;
    if (customerEmail && customerEmail.includes("@")) {
      try {
        customerHistoryCount = await Incident.countDocuments({
          _id: { $ne: incidentId },
          customerEmail,
          status: { $in: ["RESOLVED", "CLOSED", "ASSIGNED", "IN_PROGRESS", "PENDING_REVIEW"] },
        });
        isRepeatCustomer = customerHistoryCount > 0;
      } catch { /* non-fatal */ }
    }

    if (jobId) await advanceStage(jobId, "ml_classify");
    const mlResult = await fastapiService.classify(classifierText);
    const mlPayload = {
      agentId: "ml-service",
      decision: mlResult.type || "unavailable",
      confidence: mlResult.confidence,
      reasoning: mlResult.fallback
        ? "ML service unavailable - using LLM only"
        : "LightGBM classification",
      probabilities: mlResult.probabilities,
    };
    emitAndPersist(mlPayload);
    if (jobId) await advanceStage(jobId, "classifier");

    const classifierResult = await classifierAgent.run(
      {
        description,
        mlSuggestion: {
          type: mlResult.type,
          confidence: mlResult.confidence,
          probabilities: mlResult.probabilities ?? null,
        },
      },
      { onThinking: makeThinkingEmitter('classifier') }
    );
    emitAndPersist(classifierResult);
    await AuditLog.create({
      incidentId,
      actor: "classifier-agent",
      actorType: "agent",
      action: "classification",
      newValue: classifierResult.fields,
      confidence: classifierResult.confidence,
      timestamp: new Date(),
    });
    if (classifierResult.decision === "unavailable") {
      await handleFailure();
      return;
    }

    try {
      const snap = {
        stage: "ml_classifier", stageLabel: "ML model scored",
        confidence: Number(mlResult.confidence || 0.5),
        classificationType: mlResult.type || classifierResult.decision || null,
        minutesElapsed: 2,
        note: `LightGBM confidence: ${Math.round(Number(mlResult.confidence || 0) * 100)}%`,
        recordedAt: new Date(),
      };
      sseService.emit(incidentId, { type: "confidence_snapshot", ...snap });
      confidenceSnapshots.push(snap);
    } catch (_) {}

    if (jobId) await advanceStage(jobId, "dedup");

    let dedupResult = {
      agentId: "dedup",
      isDuplicate: false,
      confidence: 0.35,
      reasoning: "Embedding unavailable; duplicate detection degraded",
    };

    const embeddingResult = await fastapiService.embed(dedupText, incidentId.toString());

    if (embeddingResult.vector && !embeddingResult.fallback) {
      const similarityResult = await fastapiService.getSimilar(
        embeddingResult.vector,
        incidentId.toString(),
      );
      const candidates = similarityResult.candidates || [];

      const autoMatch = candidates.find((candidate) => candidate.similarity >= 0.82);
      if (autoMatch) {
        dedupResult = {
          agentId: "dedup",
          isDuplicate: true,
          matchedIncidentId: autoMatch.incidentId,
          confidence: 0.95,
          reasoning: `Semantic similarity ${autoMatch.similarity.toFixed(3)} exceeds threshold 0.82`,
        };
        emitAndPersist(dedupResult);
      } else {
        const borderline = candidates.filter(
          (candidate) => candidate.similarity >= 0.7 && candidate.similarity < 0.82,
        );

        if (borderline.length > 0) {
          dedupResult = await dedupAgent.run(
            { description, candidates: borderline },
            { onThinking: makeThinkingEmitter('dedup') }
          );
          emitAndPersist(dedupResult);
        } else {
          dedupResult = {
            agentId: "dedup",
            isDuplicate: false,
            confidence: 0.88,
            reasoning: "No similar incidents found in last 14 days",
          };
          emitAndPersist(dedupResult);
        }
      }
    } else {
      emitAndPersist(dedupResult);
    }

    await AuditLog.create({
      incidentId,
      actor: "dedup-agent",
      actorType: "agent",
      action: "dedup_check",
      newValue: { isDuplicate: dedupResult.isDuplicate },
      confidence: dedupResult.confidence,
      timestamp: new Date(),
    });

    try {
      const baseConf = Number(mlResult.confidence || 0.5);
      const snap = {
        stage: "dedup", stageLabel: "Cluster analysis",
        confidence: dedupResult.isDuplicate ? Math.min(0.99, baseConf + 0.1) : baseConf,
        classificationType: classifierResult.decision || null,
        minutesElapsed: 5,
        note: dedupResult.isDuplicate
          ? "Cluster pattern detected — confidence increased"
          : "No cluster match",
        recordedAt: new Date(),
      };
      sseService.emit(incidentId, { type: "confidence_snapshot", ...snap });
      confidenceSnapshots.push(snap);
    } catch (_) {}

    const typeConf = classifierResult.fields?.type?.confidence || classifierResult.confidence || 0;
    const sevConf =
      classifierResult.fields?.severity?.confidence || classifierResult.confidence || 0;
    const dedupConf = dedupResult.confidence || 1.0;
    const overallConfidence = typeConf * 0.4 + sevConf * 0.3 + dedupConf * 0.3;
    const confidence = mlResult.confidence ?? typeConf;
    const severity = requestedSeverity || classifierResult.severity || "Medium";
    const needsHITL =
      photoHold ||
      confidence < 0.75 ||
      ["High", "Critical"].includes(severity);
    const hitlReason = photoHold
      ? "Photo-text inconsistency detected"
      : ["High", "Critical"].includes(severity)
        ? `High severity: ${severity}`
        : `Low confidence: ${Number(confidence || 0).toFixed(2)}`;
    const sourceLocation =
      existingIncident?.agentResults?.request?.location ||
      intakeResult.fields?.location?.value ||
      null;

    // ── Case Memory (runs BEFORE resolution so similar cases feed into SOP matching) ──
    if (jobId) await advanceStage(jobId, "case_memory");
    let similarCases = [];
    try {
      similarCases = await Promise.race([
        getSimilarResolvedIncidents({
          _id: incidentId,
          type: classifierResult.decision,
          severity,
          status: needsHITL ? "PENDING_REVIEW" : "ASSIGNED",
          description,
          rawInput: rawText,
          location: sourceLocation,
          agentResults: {
            request: { location: sourceLocation },
            intake: intakeResult,
            classifier: classifierResult,
          },
        }),
        new Promise((resolve) => setTimeout(() => resolve([]), 4000)),
      ]);
    } catch {
      similarCases = [];
    }

    emitAndPersist({
      agentId: "case-memory",
      type: "case_memory",
      decision: similarCases.length > 0 ? `${similarCases.length} similar case(s) found` : "No matching cases",
      confidence: similarCases.length > 0 ? 0.85 : 0.5,
      reasoning: similarCases.length > 0
        ? `Retrieved ${similarCases.length} resolved case(s) via CRAG pipeline${similarCases[0]?.cragUsed ? " with query reformulation" : ""}. ` +
          `Best match: ${(similarCases[0]?.type || "unknown").replace(/_/g, " ")} at ${similarCases[0]?.location || "unknown location"} ` +
          `(similarity ${((similarCases[0]?.similarity || 0) * 100).toFixed(0)}%).`
        : "No sufficiently similar resolved cases found in the last 14 days.",
      cases: similarCases.slice(0, 3).map(c => ({
        id: c._id ? String(c._id) : null,
        type: c.type || null,
        location: c.location || null,
        title: c.title || c.description?.substring(0, 80) || null,
        similarity: c.similarity || null,
        resolutionNote: c.resolutionNote || null,
        rrfScore: c.rrfScore || null,
      })),
      cragUsed: similarCases[0]?.cragUsed || false,
      reformulatedQuery: similarCases[0]?.reformulatedQuery || null,
    });

    try {
      const snap = {
        stage: "case_memory", stageLabel: "Similar cases found",
        confidence: Math.min(0.99, Number(mlResult.confidence || 0.5) + 0.05),
        classificationType: classifierResult.decision || null,
        minutesElapsed: 8, note: "Historical case memory consulted",
        recordedAt: new Date(),
      };
      sseService.emit(incidentId, { type: "confidence_snapshot", ...snap });
      confidenceSnapshots.push(snap);
    } catch (_) {}

    // ── Fetch customer profile for sentiment-aware resolution ──
    let customerProfileSummary = null;
    try {
      if (customerEmail) {
        customerProfileSummary = await getProfileSummaryForAgent(customerEmail);
      }
    } catch (_profileErr) {
      console.error("[orchestrator][customer-profile]", _profileErr.message);
    }

    // ── Resolution (receives similar cases + customer profile for tone-aware SOP) ──
    if (jobId) await advanceStage(jobId, "resolution");
    const sop = await SopLibrary.findOne({ incidentType: classifierResult.decision });
    const resolutionResult = await resolutionAgent.run(
      {
        type: classifierResult.decision,
        severity,
        description,
        sop: sop ? { code: sop.code, title: sop.title, steps: sop.steps } : null,
        similarCases: similarCases.slice(0, 3).map(c => ({
          type: c.type || null,
          location: c.location || null,
          resolutionNote: c.resolutionNote || null,
          similarity: c.similarity || null,
        })),
        customerProfile: customerProfileSummary,
      },
      { onThinking: makeThinkingEmitter('resolution') }
    );
    emitAndPersist(resolutionResult);

    // ── ReAct Self-Correction Loop: Reflect on draft, revise if needed ──
    let finalResolution = resolutionResult;
    try {
      const reflectionContext = [
        `Incident: ${classifierResult.decision?.replace(/_/g, ' ')} at ${sourceLocation || 'unknown'} (${severity})`,
        customerProfileSummary ? `Customer: ${customerProfileSummary.totalCases} prior cases, avg sentiment ${customerProfileSummary.averageSentiment?.toFixed(2)}, trend: ${customerProfileSummary.frustrationTrend}, tags: [${(customerProfileSummary.tags || []).join(', ')}]` : null,
        dedupResult.isDuplicate ? `Part of active cluster at ${sourceLocation}` : null,
        similarCases.length > 0 ? `${similarCases.length} similar resolved cases found` : 'No similar past cases',
      ].filter(Boolean).join('. ');

      const draftSteps = (resolutionResult.steps || []).map((s, i) => `${i + 1}. ${s}`).join('\n');

      const thinkEmitter = makeThinkingEmitter('react-reflect');
      thinkEmitter('Reviewing resolution draft against customer context and incident patterns...');

      const reflectionRaw = await Promise.race([
        callAI({
          system: `You are a quality reviewer for DHL incident resolutions. Review the draft and decide if it needs revision.
Consider: customer emotional state, cluster context, SOP alignment, tone appropriateness.
Return JSON only. No markdown fences.
{"verdict":"approve"|"revise","reason":"one sentence","revisedSteps":["step1","step2",...] or null,"revisedTone":"empathetic"|"professional"|"urgent" or null}`,
          user: `Context: ${reflectionContext}\n\nDraft resolution:\n${draftSteps}\n\nDraft tone: ${resolutionResult.communicationTone || 'professional'}`,
          maxTokens: 400,
          json: true,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Reflection timeout')), 8000)),
      ]);

      if (!reflectionRaw) throw new Error('Empty reflection response');
      const cleaned = reflectionRaw.replace(/```json|```/g, '').trim();
      const jsonStart = cleaned.indexOf('{');
      const reflection = JSON.parse(jsonStart >= 0 ? cleaned.slice(jsonStart) : cleaned);

      if (reflection.verdict === 'revise' && Array.isArray(reflection.revisedSteps) && reflection.revisedSteps.length > 0) {
        thinkEmitter(`Self-correction triggered: ${reflection.reason}. Revising resolution...`);

        finalResolution = {
          ...resolutionResult,
          steps: reflection.revisedSteps,
          communicationTone: reflection.revisedTone || resolutionResult.communicationTone || 'empathetic',
          reactRevised: true,
          reactReason: reflection.reason,
        };

        emitAndPersist({
          agentId: 'react-reflect',
          type: 'react_revision',
          decision: 'revised',
          reasoning: `ReAct self-correction: ${reflection.reason}. Resolution steps revised for better alignment with customer context.`,
          revisedStepCount: reflection.revisedSteps.length,
          originalTone: resolutionResult.communicationTone || 'professional',
          revisedTone: reflection.revisedTone || 'empathetic',
        });
      } else {
        thinkEmitter('Draft approved - resolution aligns with customer context and incident patterns.');

        emitAndPersist({
          agentId: 'react-reflect',
          type: 'react_revision',
          decision: 'approved',
          reasoning: 'ReAct review: draft resolution passed quality check. No revision needed.',
        });
      }
    } catch (reactErr) {
      // Non-fatal: keep original resolution if reflection fails
      console.error('[orchestrator][react]', reactErr.message);
    }

    await AuditLog.create({
      incidentId,
      actor: "resolution-agent",
      actorType: "agent",
      action: "resolution_suggestion",
      newValue: { sopCode: finalResolution.sopCode, reactRevised: finalResolution.reactRevised || false },
      confidence: finalResolution.confidence,
      timestamp: new Date(),
    });
    if (jobId) await advanceStage(jobId, "finalise");

    const uncertainty = computeUncertainty({
      mlResult,
      classifierResult,
      dedupResult,
      severity,
      similarCases,
      mlFallback: mlResult.fallback || false,
      holdForReview: needsHITL,
    });

    const title = (intakeResult.fields?.description?.value || rawText).substring(0, 80);

    // Run SHAP explanation in parallel with other post-classification work
    // Never let SHAP failure block the incident from being saved
    let shapResult = { available: false };
    try {
      shapResult = await Promise.race([
        explainShap(classifierText, mlResult.predicted_class || mlResult.type),
        new Promise((resolve) => setTimeout(() => resolve({ available: false }), 6000)),
      ]);
    } catch (shapError) {
      console.error('[orchestrator][SHAP]', shapError.message);
    }

    if (shapResult.available) {
      emitAndPersist({
        agentId: "shap",
        type: "shap_explain",
        decision: shapResult.predicted_class || mlResult.type || "unknown",
        confidence: mlResult.confidence || 0.5,
        reasoning: shapResult.top_positive?.length > 0
          ? `Top contributing feature: "${shapResult.top_positive[0].feature}" (+${shapResult.top_positive[0].shap_value?.toFixed(3) || "0.000"}). ` +
            `${shapResult.top_negative?.length > 0 ? `Strongest counter-signal: "${shapResult.top_negative[0].feature}" (${shapResult.top_negative[0].shap_value?.toFixed(3) || "0.000"}).` : ""}`
          : "SHAP feature attribution computed.",
        predictedClass: shapResult.predicted_class || null,
        baseValue: shapResult.base_value || 0,
        features: (shapResult.features || []).slice(0, 8),
        topPositive: (shapResult.top_positive || []).slice(0, 5),
        topNegative: (shapResult.top_negative || []).slice(0, 3),
      });
    }

    // Vision Analysis Stage: emits when incident has a damage photo assessment.
    // assessDamagePhoto runs in IntakeHub before the pipeline and is stored in
    // agentResults.damageAssessment. Re-emitted here so PipelineModal shows it
    // as a dedicated stage with Claude Vision attribution.
    if (photoAssessment?.photoAnalysis) {
      const pa = photoAssessment.photoAnalysis;
      emitAndPersist({
        agentId: 'vision',
        type: 'vision_analysis',
        damageType: pa.damageType || 'unknown',
        severityScore: pa.severityScore || 0,
        affectedAreas: pa.affectedAreas || [],
        packagingCondition: pa.packagingCondition || 'unknown',
        confidence: Math.min(1, (pa.confidence || 0.7)),
        consistencyMatch: photoAssessment.consistencyCheck?.consistent ?? true,
        consistencyNote: photoAssessment.consistencyCheck?.recommendation || '',
        reasoning: [
          `Damage type identified: ${(pa.damageType || 'unknown').replace(/_/g, ' ')}.`,
          pa.affectedAreas?.length ? `Affected areas: ${pa.affectedAreas.join(', ')}.` : '',
          `Packaging condition: ${pa.packagingCondition || 'unknown'}.`,
          photoAssessment.consistencyCheck?.recommendation || '',
        ].filter(Boolean).join(' '),
      });
    }

    const incidentSentimentScore = Math.round(quickSentimentScore(rawText) * 1000) / 1000;
    const incidentSentimentLabel = deriveSentimentLabel(incidentSentimentScore);

    await Incident.findByIdAndUpdate(incidentId, {
      title,
      description,
      type:       classifierResult.decision,
      severity,
      location:   sourceLocation || undefined,
      department: classifierResult.department || "Operations",
      confidence: Math.round(overallConfidence * 1000) / 1000,
      holdForReview: needsHITL,
      rejectionReason: needsHITL ? hitlReason : null,
      status:     needsHITL ? "PENDING_REVIEW" : "ASSIGNED",
      mlFallback: mlResult.fallback || false,
      sentimentScore: incidentSentimentScore,
      sentimentLabel: incidentSentimentLabel,
      ...(customerEmail ? { customerEmail } : {}),
      isRepeatCustomer,
      customerHistoryCount,
      // Feature 2: set SLA deadline immediately when severity is committed
      "sla.deadlineAt": calculateSlaDeadline({ severity, createdAt: existingIncident?.createdAt || new Date() }),
      agentResults: {
        ...(existingIncident?.agentResults || {}),
        intake:      intakeResult,
        mlService:   mlResult,
        classifier:  classifierResult,
        dedup:       dedupResult,
        resolution:  finalResolution,
        uncertainty,
        shap:        shapResult,
        ...(photoAssessment ? { damageAssessment: photoAssessment } : {}),
      },
    });

    // ── Sync CustomerProfile with classified type + severity ──────────────────
    if (customerEmail) {
      CustomerProfile.findOneAndUpdate(
        { email: customerEmail, 'cases.incidentId': incidentId.toString() },
        { $set: {
            'cases.$.type': classifierResult.decision,
            'cases.$.severity': severity,
          },
        },
      ).catch(() => {});
    }

    // ── Broadcast post-classification state for live Board updates ────────────
    // The Board listens for `incident_updated` and animates the card moving
    // from Incoming → Needs Decision (or Assigned).
    try {
      const fresh = await Incident.findById(incidentId).lean();
      if (fresh) broadcastIncidentUpdate(fresh, 'incident_updated');
    } catch { /* non-fatal */ }

    try {
      const finalConf = Math.round(overallConfidence * 1000) / 1000;
      const snap = {
        stage: "final", stageLabel: "Pipeline complete",
        confidence: finalConf,
        classificationType: classifierResult.decision || null,
        minutesElapsed: 10,
        isAutoResolved: finalConf >= 0.9 && severity === "Low",
        note: finalConf >= 0.9
          ? "Confidence threshold met — auto-resolved"
          : "HITL review required",
        recordedAt: new Date(),
      };
      sseService.emit(incidentId, { type: "confidence_snapshot", ...snap });
      confidenceSnapshots.push(snap);
      if (confidenceSnapshots.length) {
        await Incident.findByIdAndUpdate(incidentId, {
          $push: { confidenceHistory: { $each: confidenceSnapshots } },
        });
      }
    } catch (_snapErr) {
      console.error("[orchestrator][confidence_snapshot]", _snapErr.message);
    }

    // ── Autonomous Resolution Gate ────────────────────────────────────────────
    // For routine RPA cases that don't need human review:
    // high confidence + low severity + known type → auto-resolve end-to-end.
    // The AI pipeline already produced SOP steps + recovery draft; no human add-value.
    const finalConf = Math.round(overallConfidence * 1000) / 1000;
    const incidentType = classifierResult.decision;
    const isAutoResolvable =
      !photoHold &&
      finalConf >= 0.85 &&
      severity === "Low" &&
      incidentType &&
      incidentType !== "other";

    if (isAutoResolvable) {
      try {
        const sopSteps = finalResolution?.steps || [];
        const autoNote = sopSteps.length > 0
          ? `Auto-resolved by NEXUS AI. SOP applied: ${sopSteps.slice(0, 2).join(' → ')}.`
          : `Auto-resolved by NEXUS AI (confidence ${Math.round(finalConf * 100)}%, Low severity, SOP matched).`;

        await Incident.findByIdAndUpdate(incidentId, {
          status: "RESOLVED",
          holdForReview: false,
          rejectionReason: null,
          resolutionNote: autoNote,
          resolvedAt: new Date(),
        });

        await AuditLog.create({
          incidentId,
          actor: "nexus-ai",
          actorType: "agent",
          action: "auto_resolved",
          field: "status",
          oldValue: needsHITL ? "PENDING_REVIEW" : "ASSIGNED",
          newValue: "RESOLVED",
          confidence: finalConf,
          timestamp: new Date(),
        });

        broadcastLive({
          type: "autonomous_actions",
          actions: [{
            action: "auto_resolved",
            incidentId: incidentId.toString(),
            incidentType,
            confidence: finalConf,
            message: `NEXUS auto-resolved ${incidentType.replace(/_/g, " ")} case (${Math.round(finalConf * 100)}% confidence)`,
            timestamp: new Date().toISOString(),
          }],
        });

        sseService.emit(incidentId, {
          type: "auto_resolved",
          agentId: "nexus-ai",
          confidence: finalConf,
          resolutionNote: autoNote,
          message: autoNote,
        });

        // Embed into learning corpus immediately
        embedResolvedIncident(incidentId, {
          _id: incidentId,
          type: incidentType,
          severity,
          location: sourceLocation,
          department: classifierResult.department || "Operations",
          description,
          rawInput: rawText,
          resolutionNote: autoNote,
          agentResults: { resolution: finalResolution },
        }).catch(() => {});

        console.log(`[orchestrator][auto-resolve] ${incidentId} — ${incidentType} @ ${sourceLocation || "unknown"} (conf=${finalConf})`);
      } catch (autoErr) {
        console.error("[orchestrator][auto-resolve] non-fatal:", autoErr.message);
      }
    }

    {
      const cluster = await findClusterForIncident(incidentId.toString());

      if (cluster) {
        await Incident.findByIdAndUpdate(incidentId, {
          clusterGroup: cluster.clusterId,
        });

        // ── Phase 5: Auto-generate Hub Alert ───────────────────────────────
        try {
          if (sourceLocation) {
            const existing = await ProactiveSend.findOne({ clusterId: cluster.clusterId });
            if (!existing) {
              const typeName = (classifierResult.decision || "incident").replace(/_/g, " ");
              const hubNotice =
                `CLUSTER ALERT — ${sourceLocation}\n\n` +
                `A cluster of "${typeName}" complaints has been automatically detected at your hub by NEXUS AI.\n\n` +
                `Cluster ID: ${cluster.clusterId}\n` +
                `Case Type: ${typeName.charAt(0).toUpperCase() + typeName.slice(1)}\n` +
                `Severity: ${severity}\n\n` +
                `Recommended Actions:\n` +
                `1. Review current shipment handling procedures at ${sourceLocation}\n` +
                `2. Brief frontline staff on complaint patterns\n` +
                `3. Escalate to Operations Manager if cluster exceeds 5 cases\n\n` +
                `This alert was auto-generated. Acknowledge once reviewed.`;

              await ProactiveSend.create({
                incidentType: classifierResult.decision || "other",
                location:     sourceLocation,
                clusterId:    cluster.clusterId,
                documents:    { hubNotice },
                status:       "sent",
                sentDocuments: ["hubNotice"],
                sentAt:       new Date(),
                sentBy:       "NEXUS AI System",
                estimatedComplaintsPrevented: cluster.count || 3,
              });

              // Notify all affected customers in this cluster automatically
              notifyClusterCustomers(cluster).then((notifyResult) => {
                if (notifyResult.notified > 0) {
                  broadcastLive({
                    type:      "cluster_customers_notified",
                    clusterId: cluster.clusterId,
                    location:  sourceLocation,
                    notified:  notifyResult.notified,
                    message:   `NEXUS auto-notified ${notifyResult.notified} affected customer${notifyResult.notified > 1 ? 's' : ''} at ${sourceLocation}`,
                  });
                }
              }).catch(() => {});

              // Auto-draft a SOP if none exists for this incident type
              SopLibrary.findOne({ incidentType: classifierResult.decision }).then((existingSop) => {
                if (!existingSop) {
                  const typeName = (classifierResult.decision || 'other').replace(/_/g, ' ');
                  SopDraft.create({
                    incidentType: classifierResult.decision || 'other',
                    location: sourceLocation,
                    clusterId: cluster.clusterId,
                    status: 'pending',
                    generatedContent: {
                      title: `${sourceLocation} — ${typeName.charAt(0).toUpperCase() + typeName.slice(1)} Protocol`,
                      whenToApply: `When multiple ${typeName} incidents cluster at ${sourceLocation}`,
                      rootCause: `Auto-detected cluster of ${cluster.count} incidents at ${sourceLocation}`,
                      recommendedAction: `1. Investigate root cause at ${sourceLocation}\n2. Apply standard DHL recovery procedures for ${typeName}\n3. Brief frontline staff on complaint patterns\n4. Escalate to Operations Manager if cluster exceeds 5 cases\n5. Monitor resolution rate for 24h post-intervention`,
                      estimatedResolutionTime: '4-8 hours',
                      evidenceCount: cluster.count || 3,
                    },
                    evidenceIds: [],
                    generatedAt: new Date(),
                  }).then(() => {
                    broadcastLive({ type: 'learning_event', action: 'sop_draft_created', message: `Auto-drafted SOP for ${typeName} cluster at ${sourceLocation}` });
                  }).catch(() => {});
                }
              }).catch(() => {});

              sseService.emit(incidentId, {
                type:      "hub_alert_generated",
                location:  sourceLocation,
                clusterId: cluster.clusterId,
              });
            }
          }
        } catch (alertErr) {
          console.error("[orchestrator][hub_alert]", alertErr.message);
        }
      }
    }

    sseService.emit(incidentId, {
      event: "hitl_decision",
      type: "hitl_decision",
      incidentId: incidentId.toString(),
      status: needsHITL ? "PENDING_REVIEW" : "ASSIGNED",
      confidence: Math.round(Number(confidence || 0) * 1000) / 1000,
      severity,
      holdForReview: needsHITL,
      hitlReason,
    });
    if (jobId) persistEvent(jobId, incidentId, { type: "hitl_decision", status: needsHITL ? "PENDING_REVIEW" : "ASSIGNED", severity, holdForReview: needsHITL });

    sseService.emit(incidentId, {
      event: "uncertainty_signal",
      agentId: "uncertainty",
      type: "uncertainty_signal",
      incidentId: incidentId.toString(),
      decision: uncertainty.level,
      reasoning:
        uncertainty.reasons.length > 0
          ? uncertainty.reasons.join(" | ")
          : "Signals aligned with low uncertainty",
      score: uncertainty.score,
      reasons: uncertainty.reasons,
      signals: uncertainty.signals,
    });
    if (jobId) persistEvent(jobId, incidentId, { type: "uncertainty_signal", level: uncertainty.level, score: uncertainty.score });

    const duration = Date.now() - startTime;
    const completePayload = {
      type: "pipeline_complete",
      incidentId: incidentId.toString(),
      status: needsHITL ? "PENDING_REVIEW" : "ASSIGNED",
      overallConfidence: Math.round(overallConfidence * 1000) / 1000,
      holdForReview: needsHITL,
      hitlReason,
      duration_ms: duration,
    };
    emitAndPersist(completePayload);

    // ── Feature 1: Service Recovery Paradox Agent ──────────────────────────
    // Run after pipeline_complete is emitted so the SSE stream captures it.
    // This is fire-and-await but wrapped so failure never blocks SSE close.
    try {
      const freshIncident = await Incident.findById(incidentId).lean();
      if (freshIncident) {
        const recoveryResult = await evaluateServiceRecovery(freshIncident, customerProfileSummary);
        if (recoveryResult.triggered) {
          const recovStatus = recoveryResult.status;
          const customerEmail = freshIncident.agentResults?.recovery?.customerEmail
            || freshIncident.customerEmail;
          const recovText = recoveryResult.message || freshIncident.recoveryMessage?.text || "";

          const FRONTEND = process.env.FRONTEND_URL || "http://localhost:5173";
          const chatToken = generateChatToken(freshIncident);
          const chatUrl = `${FRONTEND}/chat/${chatToken}`;

          // Build the enterprise-styled HTML body for both auto-sent and HITL
          // paths. The CTA button replaces the inline JWT URL — customers click
          // a button instead of being shown a 1KB token in the body.
          const caseRef = `INC-${String(freshIncident._id).slice(-6).toUpperCase()}`;
          const { buildRecoveryCustomerEmail } = await import("../services/proactiveEmail.service.js");
          const fullBody = buildRecoveryCustomerEmail({
            recoveryText: recovText,
            caseRef,
            incidentType: freshIncident.type,
            chatUrl,
            language:     freshIncident.detectedLanguage || "en",
          });

          // auto_sent: queue for audit trail + retry, then attempt immediate send
          if (recovStatus === "auto_sent" && customerEmail && recovText) {
            const subject = freshIncident.detectedLanguage === "ms"
              ? `Makluman DHL — ${caseRef}`
              : `DHL Service Update — ${caseRef}`;
            OutboundEmail.create({
              incidentId,
              toEmail: customerEmail,
              subject,
              body: fullBody,
              language: freshIncident.detectedLanguage || "en",
              status: "queued",
              approvedBy: "NEXUS AI (auto)",
              metadata: { trigger: "recovery_auto_sent" },
            }).then((emailDoc) => {
              sendEmail(customerEmail, subject, fullBody)
                .then(() => OutboundEmail.findByIdAndUpdate(emailDoc._id, { status: "sent", sentAt: new Date() }).catch(() => {}))
                .catch((e) => {
                  console.error("[orchestrator][recovery-send]", e.message);
                  OutboundEmail.findByIdAndUpdate(emailDoc._id, { $inc: { retryCount: 1 } }).catch(() => {});
                });
            }).catch((e) => console.error("[orchestrator][recovery-queue]", e.message));
          }

          // hitl_required: queue it so reviewer can approve + send
          if (recovStatus === "hitl_required" && customerEmail && recovText) {
            const subject = freshIncident.detectedLanguage === "ms"
              ? `Makluman DHL — ${caseRef}`
              : `DHL Service Update — ${caseRef}`;
            OutboundEmail.create({
              incidentId,
              toEmail: customerEmail,
              subject,
              body: fullBody,
              language: freshIncident.detectedLanguage || "en",
              status: "queued",
              approvedBy: null,
              metadata: { trigger: "recovery_hitl_required" },
            }).catch(() => {});
          }

          sseService.emit(incidentId, {
            type:       "recovery_evaluated",
            agentId:    "service-recovery-agent",
            incidentId: incidentId.toString(),
            status:     recovStatus,
            language:   recoveryResult.language,
            triggered:  true,
            emailQueued: recovStatus === "hitl_required" && !!customerEmail,
            emailSent:   recovStatus === "auto_sent" && !!customerEmail,
          });
          if (jobId) persistEvent(jobId, incidentId, { type: "recovery_evaluated", status: recovStatus });
        }
      }
    } catch (recoveryError) {
      // Non-fatal: log and continue to SSE close
      console.error("[orchestrator][recovery]", recoveryError.message);
    }

    // ── Feature 2: First breach probability update ──────────────────────────
    // Run after recovery so all incident fields are committed to MongoDB.
    try {
      const incidentForSla = await Incident.findById(incidentId).lean();
      if (incidentForSla) {
        await updateBreachProbability(incidentForSla);
      }
    } catch (slaError) {
      // Non-fatal
      console.error("[orchestrator][sla]", slaError.message);
    }

    // ── Auto-acknowledgement email to customer ──────────────────────────
    try {
      const ackResult = await sendAcknowledgement(incidentId);
      if (ackResult.sent) {
        sseService.emit(incidentId, {
          type: "acknowledgement_sent",
          toEmail: ackResult.toEmail,
          chatUrl: ackResult.chatUrl,
        });
      }
      if (jobId) persistEvent(jobId, incidentId, { type: "acknowledgement", ...ackResult });
    } catch (ackError) {
      console.error("[orchestrator][acknowledgement]", ackError.message);
    }

    // ── Autonomous Action Loop: Auto-escalation + cascade summary ──────
    const autonomousActions = [];
    try {
      // Kill switch: skip all autonomous actions if disabled by admin
      const autoEnabled = await SystemConfig.getValue("autonomous_actions_enabled", true);
      if (!autoEnabled) {
        autonomousActions.push({
          action: "kill_switch",
          label: "Autonomous actions paused",
          detail: "Admin has disabled autonomous actions",
          timestamp: new Date().toISOString(),
        });
        // Still emit so the UI shows the paused state, then skip the rest
        sseService.emit(incidentId, {
          type: "autonomous_actions",
          actions: autonomousActions,
          totalActions: 0,
          incidentId: incidentId.toString(),
          paused: true,
        });
        if (jobId) persistEvent(jobId, incidentId, { type: "autonomous_actions", count: 0, paused: true });
        sseService.close(incidentId);
        if (jobId) await completeJob(jobId, { durationMs: duration });
        return;
      }

      const finalIncident = await Incident.findById(incidentId).lean();
      if (!finalIncident) throw new Error("Incident vanished");

      // Auto-escalation for high/critical severity (non-HITL only)
      if (!needsHITL && ["Critical", "High"].includes(severity)) {
        // Rate cap: prevent runaway autonomous escalations
        if (isAutoRateLimited()) {
          autonomousActions.push({
            action: "rate_limited",
            label: "Escalation rate-capped",
            detail: `Hourly cap (${AUTO_RATE_MAX}) reached - escalation queued for manual review`,
            timestamp: new Date().toISOString(),
          });
        } else {
          recordAutoAction();
          const dept = finalIncident.department || "Operations";
          await Incident.findByIdAndUpdate(incidentId, {
            status: "ASSIGNED",
            assignedDepartment: dept,
            escalatedAt: new Date(),
            escalationReason: `Auto-escalated: ${severity} severity incident`,
          });
          autonomousActions.push({
            action: "auto_escalate",
            label: `Escalated to ${dept}`,
            detail: `${severity} severity - auto-routed to ${dept} team`,
            timestamp: new Date().toISOString(),
          });
          await AuditLog.create({
            incidentId, actor: "nexus-autonomous", actorType: "system",
            action: "auto_escalate",
            newValue: { department: dept, severity, reason: "autonomous_loop" },
            timestamp: new Date(),
          });

          // Email ops manager with full escalation context
          if (OPS_EMAIL) {
            const incTitle = finalIncident.title || finalIncident.description?.slice(0, 80) || "Incident";
            const awb = finalIncident.awbNumber ? `\nAWB: ${finalIncident.awbNumber}` : "";
            const loc = finalIncident.location ? `\nLocation: ${finalIncident.location}` : "";
            const sopCode = finalIncident.agentResults?.resolution?.sopCode
              || finalIncident.agentResults?.sop?.match || "";
            const steps = (finalIncident.agentResults?.resolution?.steps || [])
              .map((s, i) => `  ${i + 1}. ${s}`).join("\n");
            const escalationBody =
              `NEXUS AI — Auto-Escalation Notice\n\n` +
              `Incident: ${incTitle}\n` +
              `Severity: ${severity}\n` +
              `Department: ${dept}\n` +
              `Confidence: ${Math.round(Number(finalIncident.confidence || 0) * 100)}%` +
              awb + loc + `\n\n` +
              (sopCode ? `Matched SOP: ${sopCode}\n` : "") +
              (steps ? `Recommended Steps:\n${steps}\n\n` : "") +
              `View incident: ${process.env.FRONTEND_URL || "http://localhost:5173"}/incidents/${String(incidentId)}\n\n` +
              `This escalation was triggered automatically by NEXUS AI.\n— NEXUS Autonomous Loop`;
            sendEmail(
              OPS_EMAIL,
              `[NEXUS ESCALATION] ${severity} — ${incTitle.slice(0, 60)}`,
              escalationBody,
            ).catch((e) => console.error("[orchestrator][escalation-email]", e.message));
          }
        }
      }

      // Record acknowledgement action
      const ackEmail = finalIncident.customerEmail ||
        finalIncident.agentResults?.intake?.fields?.reporterEmail?.value;
      if (ackEmail) {
        autonomousActions.push({
          action: "auto_acknowledge",
          label: "Customer notified",
          detail: `Acknowledgement sent to ${ackEmail}`,
          timestamp: new Date().toISOString(),
        });
      }

      // Record service recovery action
      if (finalIncident.recoveryMessage?.status) {
        const recStatus = finalIncident.recoveryMessage.status;
        autonomousActions.push({
          action: "service_recovery",
          label: recStatus === "auto_sent" ? "Recovery sent" : "Recovery drafted",
          detail: `Service recovery message ${recStatus === "auto_sent" ? "auto-sent" : "awaiting approval"}`,
          timestamp: new Date().toISOString(),
        });
      }

      // Record SLA monitoring
      autonomousActions.push({
        action: "sla_monitor",
        label: "SLA tracking active",
        detail: `Breach monitoring started for ${severity} priority`,
        timestamp: new Date().toISOString(),
      });

      // Emit consolidated autonomous actions event
      if (autonomousActions.length > 0) {
        sseService.emit(incidentId, {
          type: "autonomous_actions",
          actions: autonomousActions,
          totalActions: autonomousActions.length,
          incidentId: incidentId.toString(),
        });
        if (jobId) persistEvent(jobId, incidentId, { type: "autonomous_actions", count: autonomousActions.length });
      }
    } catch (autoErr) {
      console.error("[orchestrator][autonomous-loop]", autoErr.message);
    }

    // Cluster-triggered morning briefing: fires if this incident pushed a cluster
    // to size >= 3. A 30-min per-cluster cooldown prevents duplicate sends.
    try {
      const clusterInc = await Incident.findById(incidentId).select('location type').lean();
      if (clusterInc?.location && clusterInc?.type) {
        const allClusters = await getActiveClusters();
        const formed = allClusters.find(
          (c) => c.location === clusterInc.location && c.type === clusterInc.type && c.count >= 3,
        );
        if (formed) {
          const cooldownKey = `${clusterInc.type}:${clusterInc.location}`;
          const lastSent = briefingCooldowns.get(cooldownKey) || 0;
          if (Date.now() - lastSent > BRIEFING_COOLDOWN_MS) {
            briefingCooldowns.set(cooldownKey, Date.now());
            const recipient = process.env.BRIEFING_EMAIL || 'admin@nexus.com';
            sendMorningBriefing(recipient).then((r) => {
              console.log(`[orchestrator] cluster briefing sent=${r.sent} → ${recipient} (${cooldownKey})`);
            }).catch((e) => {
              console.error('[orchestrator][cluster-briefing]', e.message);
            });
          }
        }
      }
    } catch (briefingErr) {
      console.error('[orchestrator][cluster-briefing]', briefingErr.message);
    }

    try {
      const freshForEmbed = await Incident.findById(incidentId).lean();
      if (freshForEmbed) {
        embedIncidentAfterPipeline(incidentId, freshForEmbed).catch((err) =>
          console.warn('[orchestrator][autoEmbed]', err.message)
        );
      }
    } catch (embedErr) {
      console.warn('[orchestrator][autoEmbed-prep]', embedErr.message);
    }

    sseService.close(incidentId);
    if (jobId) await completeJob(jobId, { durationMs: duration });
  } catch (error) {
    console.error("[orchestrator]", error.message);
    await Incident.findByIdAndUpdate(incidentId, { status: "DRAFT", pipelineError: true });
    const errPayload = { type: "pipeline_error", reason: error.message };
    sseService.emit(incidentId, errPayload);
    if (jobId) persistEvent(jobId, incidentId, errPayload);
    sseService.close(incidentId);
    if (jobId) await failJob(jobId, error.message);
  }
}
