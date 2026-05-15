import mongoose from "mongoose";

import User from "../models/User.model.js";
import { MONGODB_URI } from "./env.js";

async function seedDemoUsers() {
  const userCount = await User.countDocuments();

  if (userCount > 0) {
    return;
  }

  await User.create([
    {
      name: "Ahmad Reporter",
      email: "reporter@nexus.com",
      passwordHash: "nexus123",
      role: "reporter",
    },
    {
      name: "Sara Reviewer",
      email: "reviewer@nexus.com",
      passwordHash: "nexus123",
      role: "reviewer",
    },
    {
      name: "Admin User",
      email: "admin@nexus.com",
      passwordHash: "nexus123",
      role: "admin",
    },
  ]);

  console.log("Demo users seeded");
}

export async function connectDB() {
  try {
    const connection = await mongoose.connect(MONGODB_URI);

    console.log(`MongoDB connected: ${connection.connection.host}`);

    await seedDemoUsers();
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
}
