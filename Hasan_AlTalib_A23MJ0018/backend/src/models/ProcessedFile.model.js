import mongoose from "mongoose";

const processedFileSchema = new mongoose.Schema({
  fileHash: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  filename: {
    type: String,
    trim: true,
  },
  source: {
    type: String,
    enum: ["manual", "rpa"],
  },
  rpaRunId: {
    type: String,
    trim: true,
  },
  processedAt: {
    type: Date,
    default: Date.now,
    expires: 1209600,
  },
});

const ProcessedFile =
  mongoose.models.ProcessedFile ||
  mongoose.model("ProcessedFile", processedFileSchema);

export default ProcessedFile;
