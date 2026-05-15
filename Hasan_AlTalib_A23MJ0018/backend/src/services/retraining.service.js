import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import axios from 'axios';

import Incident from '../models/Incident.model.js';
import TrainingCandidate from '../models/TrainingCandidate.model.js';
import RetrainRun from '../models/RetrainRun.model.js';
import { broadcast } from './liveStream.service.js';

const FASTAPI_URL = process.env.FASTAPI_URL || 'http://localhost:8000';

function parseTrainMetrics(log) {
  const out = {};
  const accMatch = log.match(/Accuracy:\s*([\d.]+)/i);
  if (accMatch) out.accuracy = parseFloat(accMatch[1]);
  const eceMatch = log.match(/Overall\s*ECE[:\s]*([\d.]+)/i);
  if (eceMatch) out.ece = parseFloat(eceMatch[1]);
  const meanEce = log.match(/Mean\s+per-class\s+ECE[:\s]*([\d.]+)/i);
  if (meanEce) out.meanPerClassEce = parseFloat(meanEce[1]);
  return out;
}

function readCalibrationReport() {
  try {
    const reportPath = path.join(ML_SERVICE_DIR, 'models', 'calibration_report.json');
    if (!fs.existsSync(reportPath)) return null;
    return JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
  } catch {
    return null;
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ML_SERVICE_DIR = path.resolve(__dirname, '..', '..', '..', 'ml-service');
const DATA_DIR = path.join(ML_SERVICE_DIR, 'data');
const BASE_CSV = path.join(DATA_DIR, 'training_base.csv');
const REAL_CSV = path.join(DATA_DIR, 'training_real.csv');
const TRAINING_CSV = path.join(DATA_DIR, 'training.csv');

export const VALID_LABELS = [
  'late_delivery', 'damaged_parcel', 'missing_parcel',
  'address_error', 'system_error', 'wrong_item', 'other',
];

// Global job state — single training job at a time
let retrainJob = { status: 'idle', startedAt: null, finishedAt: null, log: '', realRowsAdded: 0 };

export function getRetrainJob() {
  return { ...retrainJob };
}

function escapeCsvField(value) {
  return '"' + String(value || '').replace(/"/g, '""').replace(/\r?\n/g, ' ').trim() + '"';
}

// Parse CSV content from an uploaded buffer — handles quoted fields
export function parseCsvBuffer(content) {
  const lines = content.split('\n');
  const rows = [];

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line) continue;

    const fields = [];
    let cur = '';
    let inQ = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else { inQ = !inQ; }
      } else if (ch === ',' && !inQ) {
        fields.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    fields.push(cur.trim());
    rows.push(fields);
  }

  return rows;
}

// Build training_real.csv from resolved incidents + human corrections
export async function buildRealWorldCsv() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const [incidents, corrections] = await Promise.all([
    Incident.find({
      status: { $in: ['RESOLVED', 'CLOSED'] },
      type: { $in: VALID_LABELS },
    }).select('_id type rawInput description').lean(),

    TrainingCandidate.find({ field: 'type' })
      .populate('incidentId', 'rawInput description')
      .lean(),
  ]);

  // Human corrections override AI labels — highest quality signal
  const correctionMap = new Map();
  for (const c of corrections) {
    if (!c.incidentId || !VALID_LABELS.includes(c.humanValue)) continue;
    const text = (c.incidentId.rawInput || c.incidentId.description || '').trim();
    if (text) correctionMap.set(c.incidentId._id.toString(), { label: c.humanValue, text });
  }

  const rows = [];
  const seen = new Set();

  // Corrections first
  for (const { label, text } of correctionMap.values()) {
    const key = `${label}::${text.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ description: text, label });
  }

  // Resolved incidents (skip if already covered by a correction)
  for (const inc of incidents) {
    if (correctionMap.has(inc._id.toString())) continue;
    const text = (inc.rawInput || inc.description || '').trim();
    if (!text) continue;
    const key = `${inc.type}::${text.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ description: text, label: inc.type });
  }

  const lines = [
    'description,label',
    ...rows.map((r) => `${escapeCsvField(r.description)},${r.label}`),
  ];
  fs.writeFileSync(REAL_CSV, lines.join('\n'), 'utf-8');

  return rows.length;
}

// Append externally-uploaded rows to training_real.csv
export function appendRealRows(rows) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const newLines = rows.map((r) => `${escapeCsvField(r.description)},${r.label}`);

  if (fs.existsSync(REAL_CSV)) {
    // Skip header if file already has one, just append data lines
    fs.appendFileSync(REAL_CSV, '\n' + newLines.join('\n'), 'utf-8');
  } else {
    fs.writeFileSync(REAL_CSV, ['description,label', ...newLines].join('\n'), 'utf-8');
  }
}

// Merge base + real → training.csv, then run train.py
export async function triggerRetrain() {
  if (retrainJob.status === 'running') {
    return { alreadyRunning: true, startedAt: retrainJob.startedAt };
  }

  retrainJob = { status: 'running', startedAt: new Date().toISOString(), finishedAt: null, log: '', realRowsAdded: 0 };

  // ── Step 1: Snapshot synthetic base on first run ────────────────────────
  if (!fs.existsSync(BASE_CSV) && fs.existsSync(TRAINING_CSV)) {
    fs.copyFileSync(TRAINING_CSV, BASE_CSV);
    console.log('[retrain] training_base.csv snapshot created');
  }

  // ── Step 2: Build real-world rows from MongoDB ──────────────────────────
  let realRowCount = 0;
  try {
    realRowCount = await buildRealWorldCsv();
    retrainJob.realRowsAdded = realRowCount;
  } catch (err) {
    retrainJob.status = 'failed';
    retrainJob.log = `Failed to export real-world data: ${err.message}`;
    retrainJob.finishedAt = new Date().toISOString();
    return { error: retrainJob.log };
  }

  // ── Step 3: Merge base + real ───────────────────────────────────────────
  try {
    let base = '';
    if (fs.existsSync(BASE_CSV)) {
      base = fs.readFileSync(BASE_CSV, 'utf-8').trimEnd();
    } else if (fs.existsSync(TRAINING_CSV)) {
      base = fs.readFileSync(TRAINING_CSV, 'utf-8').trimEnd();
    }

    let realData = '';
    if (fs.existsSync(REAL_CSV)) {
      const realLines = fs.readFileSync(REAL_CSV, 'utf-8').trim().split('\n');
      realData = realLines.slice(1).join('\n'); // drop header
    }

    const merged = realData ? `${base}\n${realData}` : base;
    fs.writeFileSync(TRAINING_CSV, merged, 'utf-8');
    retrainJob.log += `Merged ${realRowCount} real-world rows into training.csv\n`;
  } catch (err) {
    retrainJob.status = 'failed';
    retrainJob.log += `Merge failed: ${err.message}`;
    retrainJob.finishedAt = new Date().toISOString();
    return { error: retrainJob.log };
  }

  // ── Step 4: Spawn python train.py ───────────────────────────────────────
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const child = spawn(python, ['train.py'], {
    cwd: ML_SERVICE_DIR,
    env: { ...process.env },
    shell: true,
  });

  child.stdout.on('data', (d) => { retrainJob.log += d.toString(); });
  child.stderr.on('data', (d) => { retrainJob.log += d.toString(); });

  child.on('close', async (code) => {
    retrainJob.status = code === 0 ? 'done' : 'failed';
    retrainJob.finishedAt = new Date().toISOString();
    retrainJob.log += `\nProcess exited with code ${code}`;
    console.log(`[retrain] train.py finished - code=${code} realRows=${realRowCount}`);

    let metrics = code === 0 ? parseTrainMetrics(retrainJob.log) : {};
    if (code === 0) {
      const report = readCalibrationReport();
      if (report) {
        metrics = {
          ...metrics,
          rawEce:            report.rawEce,
          calibratedEce:     report.calibratedEce,
          ece:               metrics.ece ?? report.calibratedEce,
          rawBrier:          report.rawBrier,
          calibratedBrier:   report.calibratedBrier,
          meanPerClassEce:   report.meanEcePerClass ?? metrics.meanPerClassEce,
          ecePerClass:       report.ecePerClass,
          calibrationMethod: report.method,
          calibratedAt:      report.calibratedAt ? new Date(report.calibratedAt) : undefined,
        };
      }
    }
    const startedAt = new Date(retrainJob.startedAt);
    const finishedAt = new Date(retrainJob.finishedAt);

    let prev = null;
    try {
      prev = await RetrainRun.findOne({ status: 'done' }).sort({ finishedAt: -1 }).lean();
    } catch {}

    const delta = {};
    if (prev?.metrics) {
      if (metrics.accuracy != null && prev.metrics.accuracy != null) {
        delta.accuracy = +(metrics.accuracy - prev.metrics.accuracy).toFixed(4);
      }
      if (metrics.calibratedBrier != null && prev.metrics.calibratedBrier != null) {
        delta.calibratedBrier = +(metrics.calibratedBrier - prev.metrics.calibratedBrier).toFixed(4);
      }
    }

    let reloadOk = false;
    if (code === 0) {
      try {
        const r = await axios.post(`${FASTAPI_URL}/reload-model`, {}, { timeout: 10_000 });
        reloadOk = !!r.data?.reloaded;
        retrainJob.log += `\nFastAPI reload: ${reloadOk ? 'OK' : 'failed'}`;
      } catch (err) {
        retrainJob.log += `\nFastAPI reload error: ${err.message}`;
      }
    }

    try {
      await RetrainRun.create({
        startedAt,
        finishedAt,
        durationMs: finishedAt - startedAt,
        status: code === 0 ? 'done' : 'failed',
        realRowsAdded: realRowCount,
        metrics: code === 0 ? metrics : undefined,
        previousMetrics: prev?.metrics
          ? { accuracy: prev.metrics.accuracy, calibratedBrier: prev.metrics.calibratedBrier }
          : undefined,
        delta: Object.keys(delta).length ? delta : undefined,
        error: code === 0 ? undefined : 'train.py exited non-zero',
        logTail: retrainJob.log.slice(-2000),
      });
    } catch (err) {
      console.error('[retrain] history save failed:', err.message);
    }

    broadcast({
      type: 'learning_event',
      action: code === 0 ? 'retrain_complete' : 'retrain_failed',
      realRowsAdded: realRowCount,
      metrics,
      delta,
      reloadOk,
      message: code === 0
        ? `Model retrained — ${realRowCount} new samples, accuracy ${metrics.accuracy ?? '?'}`
        : 'Model retrain failed - check logs',
    });
  });

  child.on('error', (err) => {
    retrainJob.status = 'failed';
    retrainJob.finishedAt = new Date().toISOString();
    retrainJob.log += `\nSpawn error: ${err.message}`;
    console.error('[retrain] spawn error:', err.message);
  });

  return { started: true, realRowsAdded: realRowCount, startedAt: retrainJob.startedAt };
}
