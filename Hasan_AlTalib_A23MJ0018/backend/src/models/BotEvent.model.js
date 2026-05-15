import mongoose from "mongoose";

const botEventSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "bot_started", "bot_idle", "email_scan", "classified",
        "response_sent", "sentiment_detected", "escalated",
        "cluster_detected", "cascade_alert", "bot_summary",
        "notification_sent", "reply_threaded", "customer_alert",
        "sop_gap_detected", "response_queue_start", "error",
        "rpa_file_timeline", "rpa_batch_intelligence",
      ],
      required: true,
    },
    message: { type: String, required: true },
    meta:    { type: mongoose.Schema.Types.Mixed, default: {} },
    source:  { type: String, enum: ["uipath", "demo", "system"], default: "system" },
  },
  { timestamps: true },
);

botEventSchema.index({ createdAt: -1 });
botEventSchema.index({ type: 1, source: 1 });

export default mongoose.model("BotEvent", botEventSchema);
