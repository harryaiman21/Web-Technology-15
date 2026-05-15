import mongoose from 'mongoose';

import Incident from '../models/Incident.model.js';
import { embedIncidentAfterPipeline } from './autoEmbed.service.js';

const TICK_MS = 30_000;
const BATCH_SIZE = 20;

let timer = null;

async function findUnembeddedIncidents() {
  const db = mongoose.connection.db;
  if (!db) return [];

  const embeddedIds = await db
    .collection('embeddings')
    .find({}, { projection: { incidentId: 1 } })
    .toArray();
  const embeddedSet = new Set(embeddedIds.map((e) => String(e.incidentId)));

  const candidates = await Incident.find({
    $or: [
      { description: { $exists: true, $ne: '' } },
      { rawInput: { $exists: true, $ne: '' } },
    ],
  })
    .select('_id description rawInput type severity location department agentResults resolutionNote status')
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();

  return candidates.filter((c) => !embeddedSet.has(String(c._id))).slice(0, BATCH_SIZE);
}

async function tick() {
  try {
    const unembedded = await findUnembeddedIncidents();
    if (unembedded.length === 0) return;

    let success = 0;
    for (const inc of unembedded) {
      try {
        await embedIncidentAfterPipeline(inc._id, inc);
        success += 1;
      } catch (err) {
        console.warn(`[embedderMonitor] failed for ${inc._id}: ${err.message}`);
      }
    }
    if (success > 0) {
      console.log(`[embedderMonitor] embedded ${success}/${unembedded.length} incidents`);
    }
  } catch (err) {
    console.error('[embedderMonitor] tick error:', err.message);
  }
}

export function startEmbedderMonitor() {
  if (timer) return;
  console.log(`[embedderMonitor] started — sweeping every ${TICK_MS / 1000}s for unembedded incidents`);
  timer = setInterval(tick, TICK_MS);
  setTimeout(tick, 5_000);
}

export function stopEmbedderMonitor() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
