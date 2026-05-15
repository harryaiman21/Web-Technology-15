// backend/src/models/RpaRunItem.model.js
// Per-item lineage record — one document per file processed in a batch run.
// Enables the Admin Command Center to show exactly what happened to each file.

import mongoose from "mongoose";

const RpaRunItemSchema = new mongoose.Schema(
  {
    rpaRunId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    filename: {
      type: String,
      required: true,
      trim: true,
    },
    fileHash: {
      type: String,
      trim: true,
    },
    incidentId: {
      type: String,
      index: true,
      trim: true,
    },
    outcome: {
      type: String,
      enum: ["created", "duplicate", "reply_threaded", "spam", "failed", "enquiry"],
      required: true,
    },
    skipReason: {
      type: String,
      trim: true,
    },
    severity: {
      type: String,
      trim: true,
    },
    location: {
      type: String,
      trim: true,
    },
    errorMessage: {
      type: String,
      trim: true,
    },
    processedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

const RpaRunItem = mongoose.models.RpaRunItem || mongoose.model("RpaRunItem", RpaRunItemSchema);

export default RpaRunItem;
