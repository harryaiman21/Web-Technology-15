import mongoose from "mongoose";

const sopDraftSchema = new mongoose.Schema({
  incidentType: { type: String, required: true, trim: true },
  location: { type: String, required: true, trim: true },
  clusterId: { type: String, default: null },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  },
  generatedContent: {
    title: String,
    whenToApply: String,
    rootCause: String,
    recommendedAction: String,
    expectedOutcome: String,
    estimatedResolutionTime: String,
    evidenceCount: Number,
  },
  evidenceIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Incident" }],
  generatedAt: { type: Date, default: Date.now },
  reviewedAt: { type: Date, default: null },
  reviewedBy: { type: String, default: null },
  publishedSopCode: { type: String, default: null },
});

sopDraftSchema.index({ incidentType: 1, location: 1, generatedAt: -1 });

const SopDraft =
  mongoose.models.SopDraft || mongoose.model("SopDraft", sopDraftSchema);

export default SopDraft;
