import mongoose from "mongoose";

// One document per HITL review decision.
// Captures the final human-corrected ground truth for each incident
// so the feedback can be exported and used to retrain the ML classifier.
const feedbackDatasetEntrySchema = new mongoose.Schema(
  {
    incidentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Incident",
      required: true,
      index: true,
    },
    // The raw incident description as processed by the pipeline
    incidentText: {
      type: String,
      trim: true,
      required: true,
    },
    // Final human-corrected classification (post-override if any)
    finalType: {
      type: String,
      trim: true,
      required: true,
    },
    finalSeverity: {
      type: String,
      trim: true,
      required: true,
    },
    finalDepartment: {
      type: String,
      trim: true,
      required: true,
    },
    // What the pipeline originally predicted before human review
    aiType: {
      type: String,
      trim: true,
      default: null,
    },
    aiSeverity: {
      type: String,
      trim: true,
      default: null,
    },
    aiConfidence: {
      type: Number,
      default: null,
    },
    // Review outcome
    reviewAction: {
      type: String,
      enum: ["approve", "reject"],
      required: true,
    },
    reviewerNote: {
      type: String,
      trim: true,
      default: null,
    },
    reviewerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewerEmail: {
      type: String,
      trim: true,
      default: null,
    },
    // Metadata for training value scoring
    source: {
      type: String,
      enum: ["manual", "rpa", "unknown"],
      default: "unknown",
    },
    hitlFired: {
      type: Boolean,
      default: false,
    },
    // True when the human changed type, severity, or department from what the AI said
    overrideOccurred: {
      type: Boolean,
      default: false,
    },
    // Which fields were corrected — array of "type", "severity", "department"
    correctedFields: {
      type: [String],
      default: [],
    },
    // The final resolution outcome if known at time of review
    finalResolutionOutcome: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { timestamps: true },
);

feedbackDatasetEntrySchema.index({ reviewAction: 1, createdAt: -1 });
feedbackDatasetEntrySchema.index({ overrideOccurred: 1 });
feedbackDatasetEntrySchema.index({ finalType: 1 });

const FeedbackDatasetEntry =
  mongoose.models.FeedbackDatasetEntry ||
  mongoose.model("FeedbackDatasetEntry", feedbackDatasetEntrySchema);

export default FeedbackDatasetEntry;
