import mongoose from "mongoose";

const sentimentEntrySchema = new mongoose.Schema(
  {
    score: { type: Number, required: true, min: 0, max: 1 },
    label: {
      type: String,
      enum: ["positive", "neutral", "frustrated", "very_frustrated"],
      required: true,
    },
    incidentId: { type: mongoose.Schema.Types.ObjectId, ref: "Incident" },
    source: {
      type: String,
      enum: ["rpa", "chat", "email", "system"],
      default: "system",
    },
  },
  { timestamps: { createdAt: "recordedAt", updatedAt: false } },
);

const caseEntrySchema = new mongoose.Schema(
  {
    incidentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Incident",
    },
    type: String,
    severity: String,
    outcome: {
      type: String,
      enum: ["satisfied", "escalated", "no_response", "pending"],
      default: "pending",
    },
    resolvedAt: Date,
  },
  { timestamps: { createdAt: "openedAt", updatedAt: false } },
);

const customerProfileSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    name: { type: String, trim: true },
    preferredLanguage: { type: String, enum: ["en", "ms"], default: "en" },

    sentimentHistory: { type: [sentimentEntrySchema], default: [] },
    cases: { type: [caseEntrySchema], default: [] },

    averageSentiment: { type: Number, default: 0.5 },
    frustrationTrend: {
      type: String,
      enum: ["improving", "stable", "worsening"],
      default: "stable",
    },

    tags: [{ type: String }],

    totalCases: { type: Number, default: 0 },
    totalEscalations: { type: Number, default: 0 },
    totalSatisfied: { type: Number, default: 0 },

    chatBehavior: {
      averageResponseTone: { type: Number, default: 0.5 },
      escalationCount: { type: Number, default: 0 },
      totalMessages: { type: Number, default: 0 },
    },

    lastSeenAt: Date,
    firstSeenAt: Date,
  },
  { timestamps: true },
);

customerProfileSchema.index({ tags: 1 });
customerProfileSchema.index({ averageSentiment: 1 });
customerProfileSchema.index({ "cases.incidentId": 1 });

export default mongoose.model("CustomerProfile", customerProfileSchema);
