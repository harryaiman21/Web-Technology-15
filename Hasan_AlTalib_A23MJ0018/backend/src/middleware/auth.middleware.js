import jwt from "jsonwebtoken";

import { JWT_SECRET } from "../config/env.js";

const DEFAULT_COOKIE_NAME = "nexus_token";

export function requireAuth(req, res, next) {
  const cookieName = process.env.COOKIE_NAME || DEFAULT_COOKIE_NAME;
  const token = req.cookies?.[cookieName];

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    req.user = {
      id: payload.id,
      email: payload.email,
      role: payload.role,
    };

    return next();
  } catch (error) {
    return res.status(401).json({ error: "Authentication required" });
  }
}

export function requireRole(...roles) {
  return function authorizeRole(req, res, next) {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    return next();
  };
}
