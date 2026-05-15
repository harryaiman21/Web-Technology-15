import mongoose from "mongoose";

const cascadeEventSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      enum: ["prediction", "alert"],
      required: true,
    },
    clusterId: String,
    sourceHub: { type: String, required: true },
    incidentType: String,
    clusterCount: Number,
    overallCascadeScore: Number,
    recommendation: String,
    downstream: [
      {
        hub: String,
        riskLevel: String,
        baseRisk: Number,
        delayHours: Number,
        estimatedImpactTime: Date,
      },
    ],
    alertId: String,
    triggeredBy: String,
    resolved: { type: Boolean, default: false },
    resolvedAt: Date,
  },
  { timestamps: true },
);

cascadeEventSchema.index({ eventType: 1, createdAt: -1 });
cascadeEventSchema.index({ sourceHub: 1 });

export default mongoose.model("CascadeEvent", cascadeEventSchema);
