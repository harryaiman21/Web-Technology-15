import mongoose from "mongoose";

const embeddingSchema = new mongoose.Schema({
  incidentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Incident",
    required: true,
  },
  vector: {
    type: [Number],
    required: true,
  },
  incidentText: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 31536000, // 365 days — embeddings are the knowledge base, keep them long-term
  },
});

const Embedding =
  mongoose.models.Embedding || mongoose.model("Embedding", embeddingSchema);

export default Embedding;
