import express from "express";
import jwt from "jsonwebtoken";

import { JWT_SECRET } from "../config/env.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import User from "../models/User.model.js";

const router = express.Router();
const DEFAULT_COOKIE_NAME = "nexus_token";
const DEFAULT_JWT_EXPIRES_IN = "72h";
const COOKIE_MAX_AGE_MS = 72 * 60 * 60 * 1000;

router.post("/login", async (req, res, next) => {
  try {
    const email = req.body?.email?.trim().toLowerCase();
    const password = req.body?.password;

    if (!email || !password) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
      },
      JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || DEFAULT_JWT_EXPIRES_IN,
      }
    );

    const cookieName = process.env.COOKIE_NAME || DEFAULT_COOKIE_NAME;
    const isProduction = process.env.NODE_ENV === "production";

    res.cookie(cookieName, token, {
      httpOnly: true,
      sameSite: isProduction ? "none" : "strict",
      secure: isProduction,
      maxAge: COOKIE_MAX_AGE_MS,
    });

    return res.status(200).json({
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/logout", (req, res) => {
  const cookieName = process.env.COOKIE_NAME || DEFAULT_COOKIE_NAME;
  const isProduction = process.env.NODE_ENV === "production";

  res.clearCookie(cookieName, {
    httpOnly: true,
    sameSite: isProduction ? "none" : "strict",
    secure: isProduction,
  });

  return res.status(200).json({ message: "Logged out" });
});

router.get("/me", requireAuth, (req, res) => {
  return res.status(200).json(req.user);
});

export default router;
