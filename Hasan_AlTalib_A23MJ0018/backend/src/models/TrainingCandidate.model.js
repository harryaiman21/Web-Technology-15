import mongoose from "mongoose";

const trainingCandidateSchema = new mongoose.Schema({
  incidentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Incident",
  },
  field: {
    type: String,
    trim: true,
  },
  aiValue: {
    type: mongoose.Schema.Types.Mixed,
  },
  humanValue: {
    type: mongoose.Schema.Types.Mixed,
  },
  reviewerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

const TrainingCandidate =
  mongoose.models.TrainingCandidate ||
  mongoose.model("TrainingCandidate", trainingCandidateSchema);

export default TrainingCandidate;
