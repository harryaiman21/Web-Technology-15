import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema({
  incidentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Incident",
    required: true,
  },
  actor: {
    type: String,
    required: true,
    trim: true,
  },
  actorType: {
    type: String,
    enum: ["human", "agent", "system"],
    required: true,
  },
  action: {
    type: String,
    required: true,
    trim: true,
  },
  field: {
    type: String,
    trim: true,
  },
  oldValue: {
    type: mongoose.Schema.Types.Mixed,
  },
  newValue: {
    type: mongoose.Schema.Types.Mixed,
  },
  confidence: {
    type: Number,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

auditLogSchema.index({ incidentId: 1, timestamp: 1 });

const AuditLog =
  mongoose.models.AuditLog || mongoose.model("AuditLog", auditLogSchema);

export default AuditLog;
