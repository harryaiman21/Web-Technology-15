// backend/src/services/slaPrediction.service.js
//
// Feature 2: Calibrated SLA Breach Predictor
// ──────────────────────────────────────────
// Three exports:
//   calculateSlaDeadline(incident)   → Date
//   updateBreachProbability(incident) → { breachProbability, hoursRemaining, brierScore }
//   checkAndMarkBreached(incident)   → Boolean (true if newly breached this call)
//
// Never throws: all errors are caught and logged. Callers need not wrap in try/catch.

import Incident from '../models/Incident.model.js';
import AuditLog from '../models/AuditLog.model.js';
import { predictBreach } from './fastapi.service.js';

// ── SLA windows (must mirror ml-service/main.py and Incident.model.js virtual) ─
const SLA_HOURS = { Critical: 2, High: 4, Medium: 8, Low: 24 };

/**
 * calculateSlaDeadline(incident) → Date
 *
 * Returns the SLA deadline Date using the incident's severity and createdAt.
 * Falls back to 8 hours (Medium) if severity is unknown.
 */
export function calculateSlaDeadline(incident) {
  const severity  = incident.severity || 'Medium';
  const hours     = SLA_HOURS[severity] ?? 8;
  const createdAt = incident.createdAt ? new Date(incident.createdAt) : new Date();
  return new Date(createdAt.getTime() + hours * 60 * 60 * 1000);
}

/**
 * updateBreachProbability(incident) → { breachProbability, hoursRemaining, brierScore, topFactors }
 *
 * Calls the ML service /predict-breach (with JS fallback) and writes the result
 * back to incident.sla in MongoDB. Safe to call on any incident — skips silently
 * if the incident is already RESOLVED or BREACHED.
 */
export async function updateBreachProbability(incident) {
  try {
    const resolved  = ['RESOLVED', 'BREACHED', 'CLOSED'];
    if (resolved.includes(incident.status)) {
      return { skipped: true, reason: `status is ${incident.status}` };
    }

    const severity  = incident.severity || 'Medium';
    const createdAt = incident.createdAt ? new Date(incident.createdAt) : new Date();
    const now       = new Date();

    const hoursElapsed   = (now - createdAt) / (1000 * 60 * 60);
    const deadlineAt     = incident.sla?.deadlineAt
      ? new Date(incident.sla.deadlineAt)
      : calculateSlaDeadline(incident);
    const hoursRemaining = (deadlineAt - now) / (1000 * 60 * 60);

    // Count active incidents for queue depth signal
    let queueDepth = 0;
    try {
      queueDepth = await Incident.countDocuments({
        _id:    { $ne: incident._id },
        status: { $nin: ['RESOLVED', 'BREACHED', 'CLOSED', 'DRAFT'] },
      });
    } catch {
      // non-fatal — leave at 0
    }

    const prediction = await predictBreach({
      incidentType:   incident.type   || 'other',
      severity,
      hoursElapsed:   Math.max(0, hoursElapsed),
      hoursRemaining,
      location:       incident.location || '',
      queueDepth,
    });

    const slaUpdate = {
      'sla.deadlineAt':               deadlineAt,
      'sla.breachProbability':         prediction.breachProbability,
      'sla.breachProbabilityUpdatedAt': now,
      'sla.hoursRemaining':            Math.round(hoursRemaining * 100) / 100,
      'sla.brierScore':                prediction.brierScore,
      'sla.topFactors':                prediction.topFactors || [],
    };

    await Incident.findByIdAndUpdate(incident._id, { $set: slaUpdate });

    return {
      breachProbability: prediction.breachProbability,
      hoursRemaining:    Math.round(hoursRemaining * 100) / 100,
      brierScore:        prediction.brierScore,
      topFactors:        prediction.topFactors || [],
      fallback:          prediction.fallback || false,
    };
  } catch (error) {
    console.error('[slaPrediction][updateBreachProbability]', error.message);
    return { error: error.message };
  }
}

/**
 * checkAndMarkBreached(incident) → Boolean
 *
 * If the SLA deadline has passed AND the incident is not yet resolved:
 *   - Sets status to BREACHED
 *   - Sets sla.breachedAt to now
 *   - Writes an audit log entry
 *   - Returns true
 *
 * Otherwise returns false. Safe to call repeatedly — idempotent after first breach.
 */
export async function checkAndMarkBreached(incident) {
  try {
    const unbreachable = ['RESOLVED', 'BREACHED', 'CLOSED'];
    if (unbreachable.includes(incident.status)) {
      return false;
    }

    const deadlineAt = incident.sla?.deadlineAt
      ? new Date(incident.sla.deadlineAt)
      : calculateSlaDeadline(incident);

    if (Date.now() < deadlineAt.getTime()) {
      return false; // still within SLA window
    }

    const now = new Date();

    await Incident.findByIdAndUpdate(incident._id, {
      $set: {
        status:          'BREACHED',
        'sla.breachedAt': now,
        'sla.hoursRemaining': -1 * Math.abs(
          (now - deadlineAt) / (1000 * 60 * 60)
        ),
      },
    });

    await AuditLog.create({
      incidentId: incident._id,
      actor:      'sla-monitor',
      actorType:  'system',
      action:     'sla_breached',
      newValue: {
        severity:    incident.severity,
        deadlineAt:  deadlineAt.toISOString(),
        breachedAt:  now.toISOString(),
      },
      timestamp: now,
    });

    console.log(`[slaPrediction] SLA BREACHED: ${incident._id} (${incident.severity})`);
    return true;
  } catch (error) {
    console.error('[slaPrediction][checkAndMarkBreached]', error.message);
    return false;
  }
}
