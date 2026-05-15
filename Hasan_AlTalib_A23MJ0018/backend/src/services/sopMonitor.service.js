// backend/src/services/sopMonitor.service.js
//
// Autonomous SOP Generation Monitor
// ───────────────────────────────────
// Runs every 30 minutes. Scans resolved incidents for type+location combos
// that have accumulated >= 3 resolved cases but no pending SOP draft in the
// last 7 days. For each qualifying combo it calls Claude (same prompt as the
// manual POST /admin/generate-sop endpoint) and creates a SopDraft with
// status "pending" — ready for reviewer approval.
//
// This makes the Knowledge Observatory truly autonomous: SOPs surface
// themselves as evidence accumulates, without any human triggering.

import { callAI } from '../config/callAI.js';
import AuditLog from '../models/AuditLog.model.js';
import Incident from '../models/Incident.model.js';
import SopDraft from '../models/SopDraft.model.js';
import { embedResolvedIncident } from './autoEmbed.service.js';
import { broadcast } from './liveStream.service.js';

const INTERVAL_MS     = 30 * 60 * 1000; // 30 minutes
const WARMUP_MS       = 2  * 60 * 1000; // 2-minute startup delay
const MIN_EVIDENCE    = 3;               // minimum resolved incidents to generate
const MAX_PER_RUN     = 3;               // cap Claude calls per cycle
const DRAFT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // skip if draft exists in last 7 days

// ── Core generation logic (mirrors POST /admin/generate-sop) ─────────────────

async function generateSopDraft(incidentType, location, resolvedIncidents) {
  const caseLines = resolvedIncidents
    .map((inc, i) => {
      const text = (inc.rawInput || inc.description || '').trim();
      return text.length > 10 ? `Case ${i + 1}: "${text}"` : null;
    })
    .filter(Boolean)
    .join('\n');

  const typeLabel = incidentType.replace(/_/g, ' ');

  const system = `You are a senior DHL operations manager with 15 years of experience at the Malaysia Parcel Care Centre. You write Standard Operating Procedures for the NEXUS incident management system. Your procedures are specific, actionable, and grounded in real incident data. You write for PCC agents who need to handle incidents confidently and independently. Do not produce generic advice — every sentence should be specific to the incident type and hub location provided.`;

  const user = `Write a Standard Operating Procedure based on ${resolvedIncidents.length} resolved "${typeLabel}" incidents at ${location}.

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

  const raw = await callAI({ system, user, maxTokens: 900 });
  const cleaned = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const content = JSON.parse(cleaned);

  return content;
}

// ── One monitor cycle ─────────────────────────────────────────────────────────

export async function runSopMonitorCycle() {
  // Step 1: Find all type+location combos with enough resolved evidence
  const groups = await Incident.aggregate([
    {
      $match: {
        status: { $in: ['RESOLVED', 'CLOSED'] },
        type:     { $nin: [null, ''] },
        location: { $nin: [null, ''] },
      },
    },
    {
      $group: {
        _id:         { type: '$type', location: '$location' },
        count:       { $sum: 1 },
        incidentIds: { $push: '$_id' },
      },
    },
    { $match: { count: { $gte: MIN_EVIDENCE } } },
    { $sort:  { count: -1 } },
    { $limit: 20 },
  ]);

  if (groups.length === 0) {
    console.log('[sopMonitor] no qualifying type+location combos yet');
    return { checked: 0, generated: 0 };
  }

  const cutoff = new Date(Date.now() - DRAFT_WINDOW_MS);
  let generated = 0;

  for (const group of groups) {
    if (generated >= MAX_PER_RUN) break;

    const { type: incidentType, location } = group._id;

    // Step 2: Skip if a pending draft already exists for this combo in last 7 days
    const existingDraft = await SopDraft.findOne({
      incidentType,
      location,
      status: 'pending',
      generatedAt: { $gte: cutoff },
    }).lean();

    if (existingDraft) continue;

    // Step 3: Fetch the actual incident texts (need rawInput/description)
    const resolvedIncidents = await Incident.find({
      type:     incidentType,
      status:   { $in: ['RESOLVED', 'CLOSED'] },
      location: location,
    })
      .select('_id rawInput description')
      .sort({ createdAt: -1 })
      .limit(8)
      .lean();

    if (resolvedIncidents.length < MIN_EVIDENCE) continue;

    try {
      const content = await generateSopDraft(incidentType, location, resolvedIncidents);

      const draft = await SopDraft.create({
        incidentType,
        location,
        clusterId: null,
        status: 'pending',
        generatedContent: {
          title:                    content.title || `${location} - ${incidentType.replace(/_/g, ' ')} Protocol`,
          whenToApply:              content.whenToApply || '',
          rootCause:                content.rootCause || '',
          recommendedAction:        content.recommendedAction || '',
          expectedOutcome:          content.expectedOutcome || '',
          estimatedResolutionTime:  content.estimatedResolutionTime || 'TBD',
          evidenceCount:            resolvedIncidents.length,
        },
        evidenceIds: resolvedIncidents.map((inc) => inc._id),
      });

      generated += 1;
      console.log(`[sopMonitor] auto-generated SOP: ${incidentType} @ ${location} (${resolvedIncidents.length} evidence)`);

      broadcast({
        type:         'sop_generated',
        action:       'auto_drafted',
        incidentType,
        location,
        draftId:      draft._id.toString(),
        evidenceCount: resolvedIncidents.length,
        message:      `Auto-SOP drafted: ${incidentType.replace(/_/g, ' ')} at ${location} (${resolvedIncidents.length} resolved cases)`,
      });
    } catch (err) {
      console.error(`[sopMonitor] failed for ${incidentType} @ ${location}:`, err.message);
      // Non-fatal — continue to next combo
    }
  }

  console.log(`[sopMonitor] cycle complete — checked ${groups.length} combos, generated ${generated} drafts`);
  return { checked: groups.length, generated };
}

// ── Backfill: resolve stuck incidents that already meet auto-resolve criteria ─

const BACKFILL_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

export async function backfillAutoResolve() {
  // Tiered auto-resolve for already-stuck incidents.
  // Higher severity requires higher confidence before NEXUS acts without human approval.
  // Critical cases are always kept for human review.
  const stuck = await Incident.find({
    status: { $in: ['PENDING_REVIEW', 'ASSIGNED'] },
    severity: { $in: ['Low', 'Medium', 'High'] },
    type: { $nin: [null, ''] },
    $or: [
      { severity: 'Low',    confidence: { $gte: 0.75 } },
      { severity: 'Medium', confidence: { $gte: 0.85 } },
      { severity: 'High',   confidence: { $gte: 0.92 } },
    ],
  })
    .select('_id type severity status location department description rawInput agentResults confidence')
    .lean();

  if (stuck.length === 0) return { resolved: 0 };

  let resolved = 0;

  for (const inc of stuck) {
    try {
      const steps = inc.agentResults?.resolution?.steps || [];
      const note = steps.length > 0
        ? `Auto-resolved by NEXUS AI. SOP applied: ${steps.slice(0, 2).join(' → ')}.`
        : `Auto-resolved by NEXUS AI (confidence ${Math.round((inc.confidence || 0) * 100)}%, Low severity).`;

      await Incident.findByIdAndUpdate(inc._id, {
        status: 'RESOLVED',
        resolutionNote: note,
      });

      await AuditLog.create({
        incidentId: inc._id,
        actor: 'nexus-ai',
        actorType: 'agent',
        action: 'auto_resolved',
        field: 'status',
        oldValue: inc.status,
        newValue: 'RESOLVED',
        confidence: inc.confidence,
        timestamp: new Date(),
      });

      embedResolvedIncident(inc._id, inc).catch(() => {});

      broadcast({
        type: 'autonomous_actions',
        actions: [{
          action: 'auto_resolved',
          incidentId: inc._id.toString(),
          incidentType: inc.type,
          confidence: inc.confidence,
          message: `NEXUS auto-resolved stuck ${(inc.type || '').replace(/_/g, ' ')} case (${Math.round((inc.confidence || 0) * 100)}% confidence)`,
          timestamp: new Date().toISOString(),
        }],
      });

      resolved += 1;
      console.log(`[backfill] auto-resolved ${inc._id} — ${inc.type} (conf=${inc.confidence})`);
    } catch (err) {
      console.error(`[backfill] failed for ${inc._id}:`, err.message);
    }
  }

  if (resolved > 0) {
    console.log(`[backfill] resolved ${resolved} stuck incident(s)`);
  }
  return { resolved };
}

// ── Start the background monitor ─────────────────────────────────────────────

export function startSopMonitor() {
  setTimeout(() => {
    // Run both immediately after warmup
    runSopMonitorCycle().catch((err) =>
      console.error('[sopMonitor] initial run error:', err.message)
    );
    backfillAutoResolve().catch((err) =>
      console.error('[backfill] initial run error:', err.message)
    );

    setInterval(() => {
      runSopMonitorCycle().catch((err) =>
        console.error('[sopMonitor] interval error:', err.message)
      );
    }, INTERVAL_MS);

    setInterval(() => {
      backfillAutoResolve().catch((err) =>
        console.error('[backfill] interval error:', err.message)
      );
    }, BACKFILL_INTERVAL_MS);
  }, WARMUP_MS);

  console.log('[sopMonitor] started — auto-SOP every 30 min, backfill sweep every 15 min (first run in 2 min)');
}
