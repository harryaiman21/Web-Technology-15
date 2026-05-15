import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const BCRYPT_ROUNDS = 12;
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$.{53}$/;
const USER_ROLES = ["reporter", "reviewer", "admin", "service_account"];

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  passwordHash: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: USER_ROLES,
    default: "reporter",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

userSchema.pre("save", async function hashPassword() {
  if (!this.isModified("passwordHash")) {
    return;
  }

  if (BCRYPT_HASH_PATTERN.test(this.passwordHash)) {
    return;
  }

  this.passwordHash = await bcrypt.hash(this.passwordHash, BCRYPT_ROUNDS);
});

userSchema.methods.comparePassword = async function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.passwordHash);
};

const User = mongoose.models.User || mongoose.model("User", userSchema);

export default User;
