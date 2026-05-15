import mongoose from 'mongoose';

const systemConfigSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    updatedBy: { type: String, default: 'system' },
  },
  { timestamps: true },
);

/**
 * Read a config value with an in-memory fallback.
 * Non-throwing - returns defaultVal on any error.
 */
systemConfigSchema.statics.getValue = async function (key, defaultVal = null) {
  try {
    const doc = await this.findOne({ key }).lean();
    return doc ? doc.value : defaultVal;
  } catch {
    return defaultVal;
  }
};

/**
 * Upsert a config value.
 */
systemConfigSchema.statics.setValue = async function (key, value, actor = 'system') {
  return this.findOneAndUpdate(
    { key },
    { value, updatedBy: actor },
    { upsert: true, new: true, runValidators: true },
  );
};

export default mongoose.model('SystemConfig', systemConfigSchema);
