import mongoose from "mongoose";

const outboundEmailSchema = new mongoose.Schema(
  {
    incidentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Incident",
      required: true,
      index: true,
    },
    toEmail: { type: String, required: true, trim: true },
    subject: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    language: { type: String, enum: ["en", "ms"], default: "en" },
    // queued = waiting for RPA pickup; sent = RPA confirmed delivery; failed = RPA error
    status: {
      type: String,
      enum: ["queued", "sent", "failed"],
      default: "queued",
      index: true,
    },
    sentAt: { type: Date, default: null },
    error: { type: String, default: null },
    approvedBy: { type: String, default: null },
    retryCount: { type: Number, default: 0 },
    lastAttemptAt: { type: Date, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

outboundEmailSchema.index({ createdAt: -1 });

const OutboundEmail =
  mongoose.models.OutboundEmail ||
  mongoose.model("OutboundEmail", outboundEmailSchema);

export default OutboundEmail;
