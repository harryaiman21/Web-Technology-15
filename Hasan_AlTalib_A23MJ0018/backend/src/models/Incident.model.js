import mongoose from "mongoose";

const INCIDENT_TYPES = [
  "late_delivery",
  "damaged_parcel",
  "missing_parcel",
  "address_error",
  "system_error",
  "wrong_item",
  "other",
];

const INCIDENT_SEVERITIES = ["Low", "Medium", "High", "Critical"];
const INCIDENT_STATUSES = [
  "DRAFT",
  "PENDING_REVIEW",
  "UNDER_REVIEW",
  "ASSIGNED",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
  "BREACHED",  // Feature 2: SLA breach — set when deadline passes unresolved
];

const incidentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    rawInput: {
      type: String,
    },
    type: {
      type: String,
      enum: INCIDENT_TYPES,
    },
    severity: {
      type: String,
      enum: INCIDENT_SEVERITIES,
    },
    status: {
      type: String,
      enum: INCIDENT_STATUSES,
      default: "DRAFT",
    },
    department: {
      type: String,
      trim: true,
    },
    // P0-1 FIX: top-level location field for maps, cluster detection, HITL brief.
    // The orchestrator writes this from agentResults.intake.fields.location.value
    // during the finalize step so it is always populated after pipeline completion.
    location: {
      type: String,
      trim: true,
    },
    clusterGroup: {
      type: String,
      trim: true,
    },
    customerEmail: {
      type: String,
      trim: true,
    },
    source: {
      type: String,
      enum: ["manual", "rpa"],
      default: "manual",
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1,
    },
    mlFallback: {
      type: Boolean,
      default: false,
    },
    dedup_hash: {
      type: String,
      trim: true,
    },
    holdForReview: {
      type: Boolean,
      default: false,
    },
    rejectionReason: {
      type: String,
      trim: true,
    },
    pipelineError: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    tags: {
      type: [String],
      default: [],
    },
    // ── Feature 1: Service Recovery Paradox ─────────────────────────────────
    recoveryMessage: {
      text:        { type: String },
      language:    { type: String, enum: ["en", "ms"], default: "en" },
      generatedAt: { type: Date },
      status: {
        type: String,
        enum: ["pending_send", "auto_sent", "hitl_required", "approved", "rejected"],
        default: "pending_send",
      },
      approvedBy:  { type: String },
      approvedAt:  { type: Date },
    },
    // ── Feature 2: Calibrated SLA Breach Predictor ──────────────────────
    sla: {
      deadlineAt:                  { type: Date },
      breachProbability:           { type: Number, min: 0, max: 1 },
      breachProbabilityUpdatedAt:  { type: Date },
      breachedAt:                  { type: Date },
      hoursRemaining:              { type: Number },
      brierScore:                  { type: Number },
      // topFactors stored as plain array for UI consumption
      topFactors:                  { type: mongoose.Schema.Types.Mixed },
    },
    // ── Feature 4: Multimodal Damage Assessment ──────────────────────────
    damageAssessment: {
      photoAnalysis: {
        damageType:          { type: String },
        severityScore:       { type: Number, min: 1, max: 5 },
        affectedAreas:       { type: [String], default: undefined },
        packagingCondition:  { type: String },
        confidence:          { type: Number, min: 0, max: 1 },
      },
      textAnalysis: {
        claimedSeverity: { type: Number, min: 1, max: 5 },
        keywords:        { type: [String], default: undefined },
      },
      consistencyCheck: {
        score:               { type: Number, min: 1, max: 5 },
        discrepancyDetected: { type: Boolean },
        discrepancyReason:   { type: String },
        recommendation:      { type: String },
      },
      assessedAt: { type: Date },
      photoUrl:   { type: String },
    },
    resolutionNote: { type: String, trim: true },
    agentResults: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    // ── Feature D: Resolution Outcome Loop ─────────────────────────────────
    followUp: {
      scheduledFor: { type: Date },
      outcome: {
        type: String,
        enum: ['satisfied', 'escalated', 'no_response'],
      },
      checkedAt: { type: Date },
    },

    // ── RPA Intelligence Metadata (v3.0) ────────────────────────
    awbNumber:           { type: String, trim: true },
    detectedLanguage:    { type: String, enum: ["en", "ms"], default: "en" },
    sentimentScore:      { type: Number, min: 0, max: 1 },
    sentimentLabel:      {
      type: String,
      enum: ["positive", "neutral", "frustrated", "very_frustrated"],
    },
    customerHistoryCount: { type: Number, default: 0 },
    isRepeatCustomer:     { type: Boolean, default: false },
    lastCaseType:         { type: String, trim: true },

    // ── Chat escalation tracking ────────────────────────────────────────────
    chatEscalatedAt:      { type: Date },
    chatEscalationReason: { type: String },
    customerSatisfaction: {
      satisfied:    { type: Boolean, default: null },
      comment:      { type: String, trim: true },
      submittedAt:  { type: Date },
    },

    // ── Agent ↔ Customer conversation thread ──────────────────────────────
    conversationThread: [
      {
        role:    { type: String, enum: ['customer', 'agent', 'ai'], default: 'agent' },
        text:    { type: String, required: true },
        sentBy:  { type: String },
        channel: { type: String, enum: ['email', 'chat'], default: 'email' },
        ts:      { type: Date, default: Date.now },
        sentimentScore: { type: Number, min: 0, max: 1 },
        sentimentLabel: { type: String, enum: ['positive', 'neutral', 'frustrated', 'very_frustrated'] },
      },
    ],

    confidenceHistory: [
      {
        stage:              { type: String },
        stageLabel:         { type: String },
        confidence:         { type: Number, min: 0, max: 1 },
        classificationType: { type: String },
        minutesElapsed:     { type: Number },
        note:               { type: String },
        isAutoResolved:     { type: Boolean, default: false },
        recordedAt:         { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

incidentSchema.virtual("slaDeadline").get(function getSlaDeadline() {
  const hoursBySeverity = {
    Critical: 2,
    High: 4,
    Medium: 8,
    Low: 24,
  };

  const hours = hoursBySeverity[this.severity] || 8;

  if (!this.createdAt) {
    return null;
  }

  return new Date(this.createdAt.getTime() + hours * 60 * 60 * 1000);
});

incidentSchema.index({ title: "text", description: "text" });
incidentSchema.index({ dedup_hash: 1 }, { unique: true, sparse: true });
incidentSchema.index({ status: 1, severity: 1, createdAt: -1 });
incidentSchema.index({ type: 1, department: 1 });
incidentSchema.index({ createdBy: 1 });
incidentSchema.index({ "recoveryMessage.status": 1 });

const Incident =
  mongoose.models.Incident || mongoose.model("Incident", incidentSchema);

export default Incident;