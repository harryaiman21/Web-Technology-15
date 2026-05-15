import PipelineEvent from "../models/PipelineEvent.model.js";
import PipelineJob from "../models/PipelineJob.model.js";

// ── Job lifecycle ────────────────────────────────────────────────────────────

/**
 * Create a new PipelineJob when a pipeline starts.
 * Returns the job document (use job._id as jobId for subsequent calls).
 */
export async function createJob(incidentId, { correlationId = null } = {}) {
  const job = await PipelineJob.create({
    incidentId,
    status: "running",
    startedAt: new Date(),
    correlationId,
  });
  console.log(`[pipelineJobs] job created ${job._id} for incident ${incidentId}`);
  return job;
}

/**
 * Write a stage transition — updates currentStage on the job.
 * Does not fail the caller on error (non-fatal).
 */
export async function advanceStage(jobId, stage) {
  try {
    await PipelineJob.findByIdAndUpdate(jobId, { currentStage: stage });
  } catch (err) {
    console.error(`[pipelineJobs] advanceStage failed: ${err.message}`);
  }
}

/**
 * Mark a job succeeded.
 */
export async function completeJob(jobId, { durationMs } = {}) {
  try {
    await PipelineJob.findByIdAndUpdate(jobId, {
      status: "completed",
      currentStage: "finalise",
      completedAt: new Date(),
      lastError: null,
      ...(durationMs != null ? { durationMs } : {}),
    });
  } catch (err) {
    console.error(`[pipelineJobs] completeJob failed: ${err.message}`);
  }
}

/**
 * Mark a job failed.
 * If attempt >= maxAttempts, status becomes dead_letter.
 */
export async function failJob(jobId, errorMessage) {
  try {
    const job = await PipelineJob.findById(jobId);
    if (!job) return;
    const isDead = job.attempt >= job.maxAttempts;
    await PipelineJob.findByIdAndUpdate(jobId, {
      status: isDead ? "dead_letter" : "failed",
      completedAt: new Date(),
      lastError: String(errorMessage || "Unknown error").substring(0, 500),
    });
  } catch (err) {
    console.error(`[pipelineJobs] failJob failed: ${err.message}`);
  }
}

/**
 * Get the most recent job for an incident.
 */
export async function getJobForIncident(incidentId) {
  return PipelineJob.findOne({ incidentId }).sort({ createdAt: -1 }).lean();
}

/**
 * Get all jobs for an incident (chronological).
 */
export async function getJobsForIncident(incidentId) {
  return PipelineJob.find({ incidentId }).sort({ createdAt: 1 }).lean();
}

// ── Event persistence ────────────────────────────────────────────────────────

// In-memory sequence counter per job — avoids a DB read on every emit.
// Resets on server restart (sequence integrity is per-run, not global).
const _sequences = new Map(); // jobId (string) → number

function nextSeq(jobId) {
  const key = String(jobId);
  const seq = (_sequences.get(key) ?? 0) + 1;
  _sequences.set(key, seq);
  return seq;
}

/**
 * Persist a pipeline event (non-fatal — never throws to caller).
 */
export async function persistEvent(jobId, incidentId, payload) {
  try {
    const eventType =
      payload?.type ||
      payload?.agentId ||
      payload?.event ||
      "unknown";

    await PipelineEvent.create({
      incidentId,
      jobId,
      eventType,
      payload,
      sequence: nextSeq(jobId),
    });
  } catch (err) {
    console.error(`[pipelineJobs] persistEvent failed: ${err.message}`);
  }
}

/**
 * Replay all events for an incident, in emission order.
 */
export async function getEventsForIncident(incidentId) {
  return PipelineEvent.find({ incidentId })
    .sort({ sequence: 1, createdAt: 1 })
    .lean();
}

/**
 * Replay events for a specific job.
 */
export async function getEventsForJob(jobId) {
  return PipelineEvent.find({ jobId })
    .sort({ sequence: 1 })
    .lean();
}
