import mongoose from "mongoose";

// One document per SSE event emitted during a pipeline run.
// Enables replay of pipeline progress after server restart.
const pipelineEventSchema = new mongoose.Schema(
  {
    incidentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Incident",
      required: true,
      index: true,
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PipelineJob",
      required: true,
      index: true,
    },
    // Mirrors the `type` or `agentId` field of the SSE payload
    eventType: {
      type: String,
      required: true,
      trim: true,
    },
    // The full SSE event payload as emitted (JSON object)
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    // Monotonically increasing within a job — allows ordered replay
    sequence: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  {
    // Use createdAt for ordering; no updatedAt needed
    timestamps: { createdAt: true, updatedAt: false },
  },
);

pipelineEventSchema.index({ incidentId: 1, sequence: 1 });
pipelineEventSchema.index({ jobId: 1, sequence: 1 });

const PipelineEvent =
  mongoose.models.PipelineEvent ||
  mongoose.model("PipelineEvent", pipelineEventSchema);

export default PipelineEvent;
