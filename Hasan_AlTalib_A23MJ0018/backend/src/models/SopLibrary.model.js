import mongoose from "mongoose";

const sopLibrarySchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  incidentType: {
    type: String,
    required: true,
    trim: true,
  },
  steps: {
    type: [String],
    required: true,
  },
  keywords: {
    type: [String],
    default: [],
  },
  source: {
    type: String,
    enum: ['ai_generated', 'manual', 'imported'],
    default: 'ai_generated',
  },
  publishedBy: { type: String, default: 'NEXUS AI' },
  publishedAt: { type: Date, default: Date.now },
  reviewedBy: { type: String, default: null },
  reviewedAt: { type: Date, default: null },
  statusHistory: {
    type: [
      {
        status: { type: String, required: true },
        date: { type: Date, required: true },
        by: { type: String, default: 'NEXUS AI' },
        note: { type: String, default: '' },
      },
    ],
    default: [],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const SopLibrary =
  mongoose.models.SopLibrary || mongoose.model("SopLibrary", sopLibrarySchema);

export default SopLibrary;
