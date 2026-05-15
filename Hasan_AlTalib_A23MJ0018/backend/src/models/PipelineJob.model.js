import mongoose from "mongoose";

const PIPELINE_JOB_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed",
  "dead_letter",
];

const PIPELINE_STAGES = [
  "intake",
  "ml_classify",
  "classifier",
  "dedup",
  "resolution",
  "finalise",
];

const pipelineJobSchema = new mongoose.Schema(
  {
    incidentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Incident",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: PIPELINE_JOB_STATUSES,
      default: "queued",
      required: true,
    },
    currentStage: {
      type: String,
      enum: PIPELINE_STAGES,
      default: null,
    },
    attempt: {
      type: Number,
      default: 1,
      min: 1,
    },
    maxAttempts: {
      type: Number,
      default: 3,
    },
    lastError: {
      type: String,
      trim: true,
      default: null,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    // Allows linking multiple pipeline runs to the same logical request
    correlationId: {
      type: String,
      trim: true,
      default: null,
    },
    // Duration in ms — set on completion
    durationMs: {
      type: Number,
      default: null,
    },
  },
  { timestamps: true },
);

pipelineJobSchema.index({ status: 1, createdAt: -1 });
pipelineJobSchema.index({ correlationId: 1 }, { sparse: true });

const PipelineJob =
  mongoose.models.PipelineJob ||
  mongoose.model("PipelineJob", pipelineJobSchema);

export default PipelineJob;
