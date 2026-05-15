import { RPA_API_KEY } from "../config/env.js";

export function requireRpaAuth(req, res, next) {
  const apiKey = req.get("X-API-Key");

  if (!apiKey || apiKey !== RPA_API_KEY) {
    return res.status(401).json({ error: "Invalid API key" });
  }

  req.rpaAuth = true;

  return next();
}
