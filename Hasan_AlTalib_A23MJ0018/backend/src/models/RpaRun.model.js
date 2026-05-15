import mongoose from "mongoose";

const RpaRunSchema = new mongoose.Schema(
  {
    runId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["completed", "failed", "partial"],
      required: true,
    },
    processedCount: {
      type: Number,
      default: 0,
    },
    errors: {
      type: Array,
      default: [],
    },
    startedAt: {
      type: Date,
    },
    completedAt: {
      type: Date,
      default: Date.now,
    },
    source: {
      type: String,
      default: "uipath",
    },

    // Compatibility fields used by existing admin analytics and run-history UI.
    startTime: {
      type: Date,
    },
    endTime: {
      type: Date,
    },
    totalFiles: {
      type: Number,
      default: 0,
    },
    duplicates: {
      type: Number,
      default: 0,
    },
    failed: {
      type: Number,
      default: 0,
    },

    // CREATIVE-1: Open Box RPA — human-readable run narrative
    narrative: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true },
);

const RpaRun = mongoose.models.RpaRun || mongoose.model("RpaRun", RpaRunSchema);

export default RpaRun;
