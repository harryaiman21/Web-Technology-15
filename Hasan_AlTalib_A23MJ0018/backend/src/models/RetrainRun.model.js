import mongoose from "mongoose";

const RetrainRunSchema = new mongoose.Schema(
  {
    startedAt:    { type: Date, default: Date.now, index: true },
    finishedAt:   Date,
    durationMs:   Number,
    status:       { type: String, enum: ["running", "done", "failed"], default: "running" },
    realRowsAdded: { type: Number, default: 0 },
    totalRows:    Number,
    metrics: {
      accuracy:         Number,
      rawBrier:         Number,
      calibratedBrier:  Number,
      rawEce:           Number,
      ece:              Number,
      calibratedEce:    Number,
      meanPerClassEce:  Number,
      ecePerClass:      { type: Object, default: undefined },
      calibrationMethod: String,
      calibratedAt:     Date,
    },
    previousMetrics: {
      accuracy:        Number,
      calibratedBrier: Number,
    },
    delta: {
      accuracy:        Number,
      calibratedBrier: Number,
    },
    error:    String,
    logTail:  String,
    triggeredBy: { type: String, default: "manual" },
  },
  { timestamps: true }
);

export default mongoose.models.RetrainRun || mongoose.model("RetrainRun", RetrainRunSchema);
