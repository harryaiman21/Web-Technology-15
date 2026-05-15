// backend/src/services/followUp.service.js
// Resolution Outcome Loop — Feature D
//
// scheduleFollowUp  — called when incident transitions to RESOLVED.
//                     Writes followUp.scheduledFor = now + 24h.
//
// processFollowUps  — called by the 5-minute monitor in index.js.
//                     Finds overdue pending follow-ups and resolves them
//                     using available signals (no external contact needed).

import AuditLog from "../models/AuditLog.model.js";
import Incident from "../models/Incident.model.js";
import { updateCaseOutcome } from "./customerProfile.service.js";
import { broadcast as broadcastLive } from "./liveStream.service.js";

const FOLLOW_UP_DELAY_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Approach derivation ───────────────────────────────────────────────────────
// Deterministic — same logic used in the outcome-history endpoint so labels
// are consistent everywhere without needing a stored field.
export function deriveApproach(type) {
  if (['missing_parcel', 'damaged_parcel', 'wrong_item'].includes(type)) {
    return 'replacement_shipment';
  }
  if (type === 'late_delivery') return 'callback';
  if (type === 'address_error') return 'correction';
  if (type === 'system_error') return 'escalation';
  return 'standard_process';
}

export const APPROACH_LABELS = {
  replacement_shipment: 'Replacement Shipment',
  callback:             'Callback',
  correction:           'Address Correction',
  escalation:           'Escalation',
  standard_process:     'Standard Process',
};

// ── Outcome derivation ────────────────────────────────────────────────────────
// Uses available signals to determine whether the resolution held.
// Never contacts the customer — purely internal signal analysis.
async function deriveOutcome(incident) {
  // Hard escalation signals
  if (incident.status === 'BREACHED') return 'escalated';

  // Check audit log for a re-open (RESOLVED → PENDING_REVIEW)
  try {
    const reopenEntry = await AuditLog.findOne({
      incidentId: incident._id,
      action:     'status_change',
      oldValue:   'RESOLVED',
    }).lean();
    if (reopenEntry) return 'escalated';
  } catch {
    // Non-fatal — continue with other signals
  }

  if (incident.status === 'RESOLVED' || incident.status === 'CLOSED') {
    // Recovery message was explicitly sent — positive signal
    const rm = incident.recoveryMessage?.status;
    if (rm === 'auto_sent' || rm === 'approved') return 'satisfied';
    // Resolved and not re-opened — optimistic proxy
    return 'satisfied';
  }

  return 'no_response';
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function scheduleFollowUp(incidentId) {
  await Incident.findByIdAndUpdate(incidentId, {
    $set: {
      'followUp.scheduledFor': new Date(Date.now() + FOLLOW_UP_DELAY_MS),
      'followUp.outcome':      null,
      'followUp.checkedAt':    null,
    },
  });
}

export async function processFollowUps() {
  const now = new Date();

  // Find incidents whose follow-up window has elapsed and outcome not yet set
  const pending = await Incident.find({
    'followUp.scheduledFor': { $lte: now },
    'followUp.outcome':      null,
  })
    .select('_id status type severity recoveryMessage followUp')
    .lean();

  if (pending.length === 0) return;

  console.log(`[followUpMonitor] processing ${pending.length} pending follow-up(s)`);

  for (const incident of pending) {
    try {
      const outcome = await deriveOutcome(incident);
      await Incident.findByIdAndUpdate(incident._id, {
        $set: {
          'followUp.outcome':   outcome,
          'followUp.checkedAt': now,
        },
      });
      console.log(`[followUpMonitor] ${incident._id} → ${outcome}`);

      // Update customer profile KB with case outcome
      const fullIncident = await Incident.findById(incident._id)
        .select('customerEmail type')
        .lean();
      if (fullIncident?.customerEmail) {
        updateCaseOutcome(fullIncident.customerEmail, incident._id, outcome).catch((err) =>
          console.error(`[followUpMonitor][customer-profile] ${incident._id}:`, err.message),
        );
      }

      broadcastLive({
        type: 'learning_event',
        action: 'outcome_recorded',
        incidentId: incident._id.toString(),
        incidentType: incident.type || 'unknown',
        outcome,
        message: outcome === 'satisfied'
          ? `Customer satisfied - NEXUS updating knowledge base from case ${incident._id}`
          : `Follow-up outcome: ${outcome} for case ${incident._id}`,
      });
    } catch (err) {
      console.error(`[followUpMonitor] error on ${incident._id}:`, err.message);
    }
  }
}
