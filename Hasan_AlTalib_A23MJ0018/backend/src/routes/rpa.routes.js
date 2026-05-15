import { createReadStream, existsSync, readFileSync, statSync } from 'fs';
import { join, basename } from 'path';
import { spawn } from 'child_process';
import { Router } from 'express';

import Anthropic from '@anthropic-ai/sdk';

import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { requireRpaAuth } from '../middleware/rpaAuth.middleware.js';
import RpaRun from '../models/RpaRun.model.js';
import RpaRunItem from '../models/RpaRunItem.model.js';
import Incident from '../models/Incident.model.js';
import { broadcast } from '../services/liveStream.service.js';
import { extractFromImage } from '../services/vision.service.js';
import {
  isOrchestratorConfigured,
  startDispatcherJob,
  getJobStatus,
} from '../services/uipathOrchestrator.service.js';

const router = Router();

const LOG_FOLDER = process.env.NEXUS_WATCH_FOLDER
  ? join(process.env.NEXUS_WATCH_FOLDER, 'logs')
  : 'C:\\NEXUS_Watch\\logs';

// Module-level job tracker — single process, no external store needed.
let activeJob = null;

function readRuntimeEnvValue(key) {
  const candidates = [join(process.cwd(), '.env'), join(process.cwd(), 'backend', '.env')];

  for (const envPath of candidates) {
    try {
      if (!existsSync(envPath)) continue;
      const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
      const line = lines.find((entry) => entry.trim().startsWith(`${key}=`));
      if (!line) continue;
      return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
    } catch {
      // Keep launcher resilient; fall back to process.env below.
    }
  }

  return undefined;
}

function getRpaRuntimeConfig() {
  return {
    robotPath: readRuntimeEnvValue('UIPATH_ROBOT_PATH') || process.env.UIPATH_ROBOT_PATH,
    projectPath: readRuntimeEnvValue('UIPATH_PROJECT_PATH') || process.env.UIPATH_PROJECT_PATH,
  };
}

// ─────────────────────────────────────────────────────────
// POST /api/v1/rpa/trigger
// ─────────────────────────────────────────────────────────
router.post(
  '/trigger',
  requireAuth,
  requireRole('admin', 'reviewer'),
  async (req, res, next) => {
    try {
      if (activeJob !== null) {
        return res.status(409).json({ error: 'Robot already running', jobId: activeJob });
      }

      const demo = req.body.demo === true || req.body.demo === 'true';
      const { robotPath, projectPath } = getRpaRuntimeConfig();

      if (demo || !robotPath) {
        const jobId = `demo-${Date.now()}`;
        return res.json({ jobId, mode: 'demo' });
      }

      const jobId = `rpa-${Date.now()}`;
      activeJob = jobId;
      const launchedAt = new Date();

      broadcast({
        type: 'rpa_robot_started',
        jobId,
        message: 'UiPath robot launched from NEXUS Mission Control',
      });

      const resolvedPath =
        existsSync(projectPath) && statSync(projectPath).isDirectory()
          ? join(projectPath, 'Main.xaml')
          : projectPath;

      broadcast({
        type: 'rpa_robot_launch_config',
        jobId,
        robotPath,
        projectPath,
        resolvedPath,
        message: `Launching UiPath package: ${basename(resolvedPath)}`,
      });

      const robot = spawn(robotPath, ['execute', '--file', resolvedPath], {
        shell: false,
        windowsHide: true,
      });

      robot.stdout.on('data', (chunk) => {
        const line = chunk.toString().trim();
        if (line) broadcast({ type: 'rpa_stdout', jobId, line });
      });

      robot.stderr.on('data', (chunk) => {
        const line = chunk.toString().trim();
        if (line) broadcast({ type: 'rpa_stderr', jobId, line });
      });

      robot.on('close', async (code) => {
        activeJob = null;
        const run = await RpaRun.findOne({
          $or: [
            { startTime: { $gte: new Date(launchedAt.getTime() - 10_000) } },
            { createdAt: { $gte: new Date(launchedAt.getTime() - 10_000) } },
          ],
        })
          .sort({ startTime: -1, createdAt: -1 })
          .lean()
          .catch(() => null);

        const filesProcessed = run?.processedCount ?? run?.totalFiles ?? null;
        const duplicatesSkipped = run?.skipped ?? run?.duplicates ?? null;
        const errors = run?.failed ?? null;
        const noRunRecord = !run;

        broadcast({
          type: 'rpa_robot_complete',
          jobId,
          exitCode: code,
          success: code === 0,
          filesProcessed,
          duplicatesSkipped,
          errors,
          runId: run?.runId,
          narrative: run?.narrative,
          noRunRecord,
          message: noRunRecord
            ? 'Robot process exited but no NEXUS RPA run record was created'
            : code === 0
              ? `Robot completed successfully - ${filesProcessed ?? 0} file(s) processed`
              : `Robot exited with code ${code}`,
        });
      });

      robot.on('error', (err) => {
        activeJob = null;
        broadcast({ type: 'rpa_robot_error', jobId, error: err.message });
      });

      return res.json({ jobId, mode: 'live', pid: robot.pid });
    } catch (err) {
      return next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────
// GET /api/v1/rpa/status
// ─────────────────────────────────────────────────────────
router.get('/status', requireAuth, (req, res) => {
  res.json({ running: activeJob !== null, jobId: activeJob });
});

router.post(
  '/trigger-cloud-run',
  requireAuth,
  requireRole('admin', 'reviewer'),
  async (req, res) => {
    if (!isOrchestratorConfigured()) {
      return res.status(503).json({
        error: 'UiPath Orchestrator is not configured on this deployment',
        code: 'UIPATH_NOT_CONFIGURED',
      });
    }

    try {
      const job = await startDispatcherJob();

      broadcast({
        type: 'rpa_cloud_run_started',
        jobKey: job.jobKey,
        state: job.state,
        message: 'UiPath Cloud dispatcher launched',
      });

      return res.json({
        ok: true,
        mode: 'cloud',
        jobKey: job.jobKey,
        state: job.state,
        releaseName: job.releaseName,
        startTime: job.startTime,
      });
    } catch (err) {
      const status = err.response?.status || 500;
      const detail = err.response?.data || err.message;
      console.error('[rpa][cloud-trigger]', detail);
      return res.status(status).json({
        error: 'Failed to start cloud dispatcher job',
        detail: typeof detail === 'string' ? detail : JSON.stringify(detail),
      });
    }
  },
);

router.get(
  '/cloud-job/:jobKey',
  requireAuth,
  requireRole('admin', 'reviewer'),
  async (req, res) => {
    if (!isOrchestratorConfigured()) {
      return res.status(503).json({ error: 'UiPath Orchestrator not configured' });
    }
    try {
      const status = await getJobStatus(req.params.jobKey);
      if (!status) return res.status(404).json({ error: 'Job not found' });
      return res.json(status);
    } catch (err) {
      console.error('[rpa][cloud-status]', err.message);
      return res.status(500).json({ error: 'Failed to fetch job status' });
    }
  },
);

// ─────────────────────────────────────────────────────────
// GET /api/v1/rpa/stats
// ─────────────────────────────────────────────────────────
router.get(
  '/stats',
  requireAuth,
  requireRole('admin', 'reviewer'),
  async (req, res, next) => {
    try {
      const [agg, lastRun] = await Promise.all([
        RpaRun.aggregate([
          {
            $group: {
              _id: null,
              totalRuns: { $sum: 1 },
              totalFiles: { $sum: '$totalFiles' },
              totalDuplicates: { $sum: '$duplicates' },
              totalFailed: { $sum: '$failed' },
              completedRuns: {
                $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
              },
              lastRunAt: { $max: '$completedAt' },
            },
          },
        ]),
        RpaRun.findOne().sort({ completedAt: -1 }).lean(),
      ]);

      const stats = agg[0] ?? {
        totalRuns: 0,
        totalFiles: 0,
        totalDuplicates: 0,
        totalFailed: 0,
        completedRuns: 0,
        lastRunAt: null,
      };

      const successRate =
        stats.totalRuns > 0
          ? Math.round((stats.completedRuns / stats.totalRuns) * 100)
          : 0;

      return res.json({
        totalRuns: stats.totalRuns,
        totalFiles: stats.totalFiles,
        totalDuplicates: stats.totalDuplicates,
        totalFailed: stats.totalFailed,
        successRate,
        lastRunAt: stats.lastRunAt,
        lastRun,
      });
    } catch (err) {
      return next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────
// GET /api/v1/rpa/screenshot/:filename
// Serves error screenshots captured by the robot.
// ─────────────────────────────────────────────────────────
router.get('/screenshot/:filename', requireAuth, (req, res) => {
  const filename = basename(req.params.filename);
  if (!filename.endsWith('.png') || filename.includes('..')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const filePath = join(LOG_FOLDER, filename);
  if (!existsSync(filePath)) {
    return res.status(404).json({ error: 'Screenshot not found' });
  }
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  createReadStream(filePath).pipe(res);
});

// ─────────────────────────────────────────────────────────
// POST /api/v1/rpa/ocr
// Receives base64 image from UiPath, calls Claude Vision,
// returns extracted text + structured shipping fields.
// ─────────────────────────────────────────────────────────
router.post(
  '/ocr',
  requireRpaAuth,
  async (req, res, next) => {
    try {
      const { imageBase64, filename, mimeType = 'image/png' } = req.body;
      if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });

      // ── Primary: Gemini 2.0 Flash (multimodal, structured JSON, fast) ────
      const result = await extractFromImage(imageBase64, {
        mimeType,
        filename: filename || 'image',
      });

      // If Gemini returned structured fields, prefer those. Otherwise fall
      // back to plain regex on the rawText for AWB/weight (mirrors the legacy
      // Claude path so callers don't see a behavior change).
      const extractedText = result.text || '';
      const awbMatch = extractedText.match(/\b([A-Z]{2}\d{8,12}|\d{10,12})\b/);
      const weightMatch = extractedText.match(/(\d+\.?\d*)\s*kg/i);

      broadcast({
        type: 'rpa_ocr_complete',
        filename,
        chars: extractedText.length,
        hasAwb: !!(result.fields?.awb || awbMatch),
        model: result.model,
      });

      return res.json({
        extractedText,
        fields: {
          awb: result.fields?.awb || awbMatch?.[1] || null,
          weight: result.fields?.weight || weightMatch?.[1] || null,
          recipient: result.fields?.recipient || null,
          recipientAddress: result.fields?.recipientAddress || null,
          hub: result.fields?.hub || null,
          declaredValue: result.fields?.declaredValue || null,
          damageVisible: result.fields?.damageVisible || null,
        },
        model: result.model,
        ...(result.error ? { warning: result.error } : {}),
      });
    } catch (err) {
      return next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────
// POST /api/v1/rpa/webhook
// UiPath Orchestrator webhook receiver — verifies and broadcasts.
// ─────────────────────────────────────────────────────────
router.post('/webhook', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.headers['authorization'];
    if (apiKey !== process.env.RPA_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const payload = req.body;
    broadcast({ type: 'orchestrator_event', ...payload, source: 'orchestrator' });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/v1/rpa/escalations
// Ingested by nexus_rpa.cs WriteEscalationFlag via HTTP POST.
// Accepts both robot API key and browser session auth.
// Sets incident status to PENDING_REVIEW and broadcasts SSE.
// ─────────────────────────────────────────────────────────
router.post(
  '/escalations',
  (req, res, next) => {
    const apiKey = req.get('X-API-Key');
    if (apiKey) return requireRpaAuth(req, res, next);
    return requireAuth(req, res, next);
  },
  async (req, res, next) => {
    try {
      const { incidentId, severity, sentimentScore, sentimentLabel } = req.body;

      if (!incidentId) return res.status(400).json({ error: 'incidentId required' });

      await Incident.findOneAndUpdate(
        { _id: incidentId },
        { $set: { status: 'PENDING_REVIEW' } },
      );

      broadcast({
        type: 'escalation_required',
        incidentId,
        severity,
        sentimentScore,
        sentimentLabel,
        reviewUrl: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/review`,
      });

      return res.json({ ok: true, incidentId });
    } catch (err) {
      return next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────
// GET /api/v1/rpa/runs/:runId/cases
// Returns per-file case details for a completed RPA run,
// enriched with incident pipeline results.
// ─────────────────────────────────────────────────────────
router.get(
  '/runs/:runId/cases',
  requireAuth,
  requireRole('admin', 'reviewer'),
  async (req, res, next) => {
    try {
      const { runId } = req.params;

      const run = await RpaRun.findOne({ runId }).lean();
      if (!run) return res.status(404).json({ error: 'RPA run not found' });

      const items = await RpaRunItem.find({ rpaRunId: runId }).lean();

      // Collect all valid incidentIds so we can batch-fetch incidents.
      const incidentIds = items
        .map((item) => item.incidentId)
        .filter(Boolean);

      // Fetch all relevant incidents in one query.
      const incidentMap = new Map();
      if (incidentIds.length > 0) {
        const incidents = await Incident.find(
          { _id: { $in: incidentIds } },
          {
            agentResults: 1,
            type: 1,
            severity: 1,
            status: 1,
            sentimentScore: 1,
            sentimentLabel: 1,
            confidence: 1,
            holdForReview: 1,
            location: 1,
            customerEmail: 1,
          },
        ).lean();

        for (const inc of incidents) {
          incidentMap.set(String(inc._id), inc);
        }
      }

      const cases = items.map((item) => {
        const inc = item.incidentId ? incidentMap.get(String(item.incidentId)) : null;

        return {
          filename: item.filename,
          outcome: item.outcome,
          skipReason: item.skipReason || null,
          incidentId: item.incidentId || null,
          severity: inc?.severity || item.severity || null,
          location: inc?.location || item.location || null,
          type: inc?.type || null,
          mlConfidence: inc?.agentResults?.classifier?.mlConfidence ?? inc?.confidence ?? null,
          llmConfidence: inc?.agentResults?.classifier?.confidence ?? null,
          shapFeatures: inc?.agentResults?.shap?.features ?? [],
          shapAvailable: inc?.agentResults?.shap?.available ?? false,
          customerSentiment: {
            score: inc?.sentimentScore ?? null,
            label: inc?.sentimentLabel ?? null,
          },
          dedupResult: {
            isDuplicate: inc?.agentResults?.dedup?.isDuplicate ?? false,
            matchedId: inc?.agentResults?.dedup?.matchedIncidentId ?? null,
            confidence: inc?.agentResults?.dedup?.confidence ?? null,
          },
          hitlRouted: inc?.holdForReview ?? false,
          autoResolved: !(inc?.holdForReview ?? false),
          resolutionSteps: inc?.agentResults?.resolution?.steps ?? [],
          sopCode: inc?.agentResults?.resolution?.sopCode ?? null,
          sopTitle: inc?.agentResults?.resolution?.sopTitle ?? null,
          resolutionTone: inc?.agentResults?.resolution?.communicationTone ?? null,
          status: inc?.status ?? null,
        };
      });

      return res.json({ run, cases });
    } catch (err) {
      return next(err);
    }
  },
);

export default router;
