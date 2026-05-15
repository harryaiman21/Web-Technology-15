import { Router } from "express";

import { requireRpaAuth } from "../middleware/rpaAuth.middleware.js";
import ProcessedFile from "../models/ProcessedFile.model.js";

const router = Router();
const TTL_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

router.get("/check", requireRpaAuth, async (req, res, next) => {
  try {
    const hash = typeof req.query.hash === "string" ? req.query.hash.trim() : "";

    if (!hash) {
      return res.status(400).json({ error: 'Query parameter "hash" is required' });
    }

    const cutoff = new Date(Date.now() - TTL_WINDOW_MS);
    const exists = await ProcessedFile.exists({
      fileHash: hash,
      processedAt: { $gte: cutoff },
    });

    return res.status(200).json({ exists: Boolean(exists) });
  } catch (error) {
    return next(error);
  }
});

router.post("/", requireRpaAuth, async (req, res, next) => {
  try {
    const fileHash = typeof req.body?.fileHash === "string" ? req.body.fileHash.trim() : "";
    const filename =
      typeof req.body?.filename === "string" ? req.body.filename.trim() : undefined;
    const rpaRunId =
      typeof req.body?.rpaRunId === "string" ? req.body.rpaRunId.trim() : undefined;

    if (!fileHash) {
      return res.status(400).json({ error: "fileHash is required" });
    }

    const processedFile = await ProcessedFile.create({
      fileHash,
      filename,
      source: "rpa",
      rpaRunId,
      processedAt: new Date(),
    });

    return res.status(201).json({ id: processedFile._id.toString() });
  } catch (error) {
    return next(error);
  }
});

export default router;
