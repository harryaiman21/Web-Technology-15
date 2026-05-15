import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

import { connectDB } from "./src/config/db.js";
import { errorHandler } from "./src/middleware/errorHandler.middleware.js";
import adminRoutes from "./src/routes/admin.routes.js";
import authRoutes from "./src/routes/auth.routes.js";
import brainRoutes from "./src/routes/brain.routes.js";
import chatRoutes from "./src/routes/chat.routes.js";
import incidentsRoutes from "./src/routes/incidents.routes.js";
import knowledgeRoutes from "./src/routes/knowledge.routes.js";
import opsRoutes from "./src/routes/ops.routes.js";
import processedFilesRoutes from "./src/routes/processedFiles.routes.js";
import rpaRunsRoutes from "./src/routes/Rparuns.routes.js";
import rpaRoutes from "./src/routes/rpa.routes.js";
import demoRoutes from "./src/routes/demo.routes.js";
import resolutionsRoutes from "./src/routes/resolutions.routes.js";
import Incident from "./src/models/Incident.model.js";
import { updateBreachProbability, checkAndMarkBreached } from "./src/services/slaPrediction.service.js";
import { processFollowUps } from "./src/services/followUp.service.js";
import { processOutboundQueue } from "./src/services/email.service.js";
import { startSopMonitor } from "./src/services/sopMonitor.service.js";
import { startProactiveAutoGen } from "./src/services/proactiveAutoGen.service.js";
import { sendMorningBriefing } from "./src/services/morningBriefing.service.js";
import { startStuckIncidentMonitor } from "./src/services/stuckIncidentMonitor.service.js";
import { startEmbedderMonitor } from "./src/services/embedderMonitor.service.js";


const PORT = Number(process.env.PORT) || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const ALLOWED_ORIGINS = Array.from(new Set([
  FRONTEND_URL,
  "http://localhost:5173",
  "https://nexus-dhl.vercel.app",
]));

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  }),
);

const isDev = process.env.NODE_ENV !== 'production';
const skipInDev = () => isDev;

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInDev,
  message: { error: 'Too many admin requests, please try again later.' },
});

const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInDev,
  message: { error: 'Too many chat requests, please try again later.' },
});

const incidentsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInDev,
  message: { error: 'Too many incident requests, please try again later.' },
});

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInDev,
});

// Apply specific limiters FIRST
app.use('/api/v1/admin', adminLimiter);
app.use('/api/v1/brain', adminLimiter);
app.use('/api/v1/chat', chatLimiter);
app.use('/api/v1/incidents', incidentsLimiter);
app.use('/api/v1/knowledge', adminLimiter);
app.use('/api/v1/ops', adminLimiter); // RPA polling — generous budget
app.use('/api/v1/rpa', adminLimiter);
app.use(globalLimiter);
app.use(express.json());
app.use(cookieParser());

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/brain", brainRoutes);
app.use("/api/v1/chat", chatRoutes);
app.use("/api/v1/incidents", incidentsRoutes);
app.use("/api/v1/knowledge", knowledgeRoutes);
app.use("/api/v1/ops", opsRoutes);
app.use("/api/v1/resolutions", resolutionsRoutes);
app.use("/api/v1/processed-files", processedFilesRoutes);
app.use("/api/v1/rpa-runs", rpaRunsRoutes);
app.use("/api/v1/rpa", rpaRoutes);
app.use("/api/v1/demo", demoRoutes);

app.use(errorHandler);

process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});

// ── Feature 2: SLA Breach Monitor (runs every 5 minutes) ─────────────────────
// Finds all active incidents with a deadline set and updates breach probability.
// Also marks any past-deadline incidents as BREACHED.
// Never crashes the server — per-incident errors are caught individually.
function startSlaMonitor() {
  const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  setInterval(async () => {
    try {
      const activeIncidents = await Incident.find({
        status:          { $nin: ["RESOLVED", "BREACHED", "CLOSED"] },
        "sla.deadlineAt": { $exists: true },
      }).lean();

      if (activeIncidents.length === 0) return;

      console.log(`[slaMonitor] checking ${activeIncidents.length} active incidents`);

      for (const incident of activeIncidents) {
        try {
          await updateBreachProbability(incident);
          await checkAndMarkBreached(incident);
        } catch (incidentError) {
          // Per-incident failure must never stop the loop
          console.error(`[slaMonitor] error on ${incident._id}:`, incidentError.message);
        }
      }
    } catch (loopError) {
      console.error("[slaMonitor] interval error:", loopError.message);
    }
  }, INTERVAL_MS);

  console.log("[slaMonitor] started — breach probability updates every 5 minutes");
}

// ── Feature D: Follow-up Outcome Monitor (runs every 5 minutes) ──────────────
// Finds resolved incidents whose 24h follow-up window has elapsed and records
// the outcome (satisfied / escalated / no_response) based on available signals.
function startFollowUpMonitor() {
  const INTERVAL_MS = 5 * 60 * 1000;

  setInterval(async () => {
    try {
      await processFollowUps();
    } catch (err) {
      console.error("[followUpMonitor] interval error:", err.message);
    }
  }, INTERVAL_MS);

  console.log("[followUpMonitor] started — outcome checks every 5 minutes");
}

// ── Email Auto-Flush (runs every 60 seconds) ──────────────────────────────────
// Drains the outbound email queue automatically — no RPA polling needed.
function startEmailFlusher() {
  const INTERVAL_MS = 60 * 1000;

  setInterval(async () => {
    try {
      const result = await processOutboundQueue();
      if (result.sent > 0) {
        console.log(`[emailFlusher] sent ${result.sent}/${result.processed} queued emails`);
      }
    } catch (err) {
      console.error("[emailFlusher] interval error:", err.message);
    }
  }, INTERVAL_MS);

  console.log("[emailFlusher] started — queue drained every 60 seconds");
}

function startMorningBriefingScheduler() {
  const MYT_OFFSET_MS = 8 * 60 * 60 * 1000;
  const BRIEF_HOUR_MYT = parseInt(process.env.BRIEFING_HOUR_MYT || '7', 10);
  const RECIPIENT = process.env.BRIEFING_EMAIL || 'admin@nexus.com';

  function msUntilNextBriefingMYT() {
    const mytNow = new Date(Date.now() + MYT_OFFSET_MS);
    let secsUntil = (BRIEF_HOUR_MYT * 3600)
      - (mytNow.getUTCHours() * 3600 + mytNow.getUTCMinutes() * 60 + mytNow.getUTCSeconds());
    if (secsUntil <= 60) secsUntil += 24 * 3600;
    return secsUntil * 1000;
  }

  function schedule() {
    const delay = msUntilNextBriefingMYT();
    setTimeout(async () => {
      try {
        const result = await sendMorningBriefing(RECIPIENT);
        console.log(`[morningBriefing] sent=${result.sent} — ${result.subject}`);
      } catch (err) {
        console.error('[morningBriefing] send failed:', err.message);
      }
      schedule();
    }, delay);
  }
  schedule();
  console.log(`[morningBriefing] scheduler started — fires daily at ${BRIEF_HOUR_MYT}:00 MYT`);
}

async function startServer() {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`NEXUS backend running on port ${PORT}`);
  });

  // Start monitors after DB is connected
  startSlaMonitor();
  startFollowUpMonitor();
  startEmailFlusher();
  startSopMonitor();
  startProactiveAutoGen();
  startMorningBriefingScheduler();
  startStuckIncidentMonitor();
  startEmbedderMonitor();
}

startServer().catch((error) => {
  console.error("Failed to start backend:", error);
  process.exit(1);
});
