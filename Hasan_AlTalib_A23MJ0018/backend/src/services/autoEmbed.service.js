import Incident from '../models/Incident.model.js';
import { embed } from './fastapi.service.js';
import { broadcast } from './liveStream.service.js';
import { triggerRetrain } from './retraining.service.js';

const RETRAIN_EVERY = 20;

function buildEmbedText(incident) {
  const steps = incident.agentResults?.resolution?.steps || [];
  const resolutionText = steps.length > 0
    ? steps.map((s, i) => `${i + 1}. ${s}`).join(' ')
    : incident.resolutionNote || null;

  const parts = [
    incident.type ? `Incident type: ${incident.type.replace(/_/g, ' ')}` : null,
    incident.location ? `Location: ${incident.location}` : null,
    incident.severity ? `Severity: ${incident.severity}` : null,
    incident.department ? `Department: ${incident.department}` : null,
    incident.description || incident.rawInput || null,
    resolutionText ? `Resolution: ${resolutionText}` : null,
  ].filter(Boolean);

  return parts.join('. ');
}

export async function embedResolvedIncident(incidentId, incident) {
  const text = buildEmbedText(incident);
  if (!text || text.length < 10) return;

  await embed(text, String(incidentId));

  await checkAndTriggerRetrain();
}

export async function embedIncidentAfterPipeline(incidentId, incident) {
  const text = buildEmbedText(incident);
  if (!text || text.length < 10) return;
  try {
    await embed(text, String(incidentId));
  } catch (err) {
    console.warn('[autoEmbed] inline embed failed:', err.message);
  }
}

export async function checkAndTriggerRetrain() {
  try {
    const resolvedCount = await Incident.countDocuments({
      status: { $in: ['RESOLVED', 'CLOSED'] },
    });

    if (resolvedCount > 0 && resolvedCount % RETRAIN_EVERY === 0) {
      const result = await triggerRetrain();
      if (!result.alreadyRunning) {
        console.log(`[auto-retrain] triggered at ${resolvedCount} resolved incidents`);
        broadcast({
          type: 'learning_event',
          action: 'retrain_started',
          resolvedCount,
          message: `Auto-retrain triggered at ${resolvedCount} resolved incidents`,
        });
      }
    }
  } catch (err) {
    console.error('[auto-retrain] check failed (non-fatal):', err.message);
  }
}
