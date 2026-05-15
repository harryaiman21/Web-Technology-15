// backend/src/services/fastapi.service.js
// Axios wrapper for the FastAPI ML microservice

import axios from 'axios';

const FASTAPI_URL = process.env.FASTAPI_URL || 'http://localhost:8000';
const TIMEOUT = 5000;

export async function classify(text) {
  try {
    const { data } = await axios.post(`${FASTAPI_URL}/classify`, { text }, { timeout: TIMEOUT });
    return data;
  } catch (error) {
    console.error('[FastAPI]', error.message);
    return { type: null, confidence: 0, probabilities: {}, fallback: true };
  }
}

export async function embed(text, incidentId) {
  try {
    const { data } = await axios.post(
      `${FASTAPI_URL}/embed`,
      { text, incident_id: incidentId },
      { timeout: TIMEOUT }
    );
    return data;
  } catch (error) {
    console.error('[FastAPI]', error.message);
    return { vector: null, dim: 0, fallback: true };
  }
}

export async function getSimilar(vector, incidentId) {
  try {
    const { data } = await axios.post(
      `${FASTAPI_URL}/similarity`,
      { vector, incident_id: incidentId },
      { timeout: TIMEOUT }
    );
    return data;
  } catch (error) {
    console.error('[FastAPI]', error.message);
    return { candidates: [] };
  }
}

export async function checkHealth() {
  try {
    const { data } = await axios.get(`${FASTAPI_URL}/health`, { timeout: TIMEOUT });
    return data?.status === 'ok';
  } catch (error) {
    console.error('[FastAPI]', error.message);
    return false;
  }
}

export async function searchEmbeddings(text, topK = 3) {
  try {
    const { data } = await axios.post(
      `${FASTAPI_URL}/embeddings/search`,
      { text, top_k: topK },
      { timeout: 3000 }
    );
    return data;
  } catch (error) {
    console.error('[FastAPI]', error.message);
    return { candidates: [] };
  }
}

export async function explainClassification(text, topN = 6) {
  try {
    const { data } = await axios.post(
      `${FASTAPI_URL}/explain`,
      { text, top_n: topN },
      { timeout: TIMEOUT }
    );
    return data;
  } catch (error) {
    console.error('[FastAPI]', error.message);
    return {
      supported: false,
      predictedClass: null,
      confidence: 0,
      topPositive: [],
      topNegative: [],
    };
  }
}

export async function explainShap(text, predictedClass) {
  try {
    const { data } = await axios.post(
      `${FASTAPI_URL}/shap-explain`,
      { text, predicted_class: predictedClass },
      { timeout: 8000 }
    );
    return data;
  } catch (error) {
    console.error('[FastAPI][SHAP]', error.message);
    return { available: false, error: error.message, features: [] };
  }
}


export async function getModelInfo() {
  try {
    const { data } = await axios.get(`${FASTAPI_URL}/model-info`, { timeout: TIMEOUT });
    return data;
  } catch (error) {
    console.error('[FastAPI]', error.message);
    return {
      modelLoaded: false,
      lastTrainedAt: null,
      trainingDataSize: 0,
      classDistribution: {},
      accuracy: 0,
      calibration: {},
      featureEngineering: {},
      explainability: {},
    };
  }
}

// ── Feature 2: SLA Breach Predictor ──────────────────────────────────────────
// Calls the calibrated /predict-breach endpoint on the ML service.
// Falls back to a safe heuristic if the ML service is unavailable.
export async function predictBreach({
  incidentType,
  severity,
  hoursElapsed,
  hoursRemaining,
  location = '',
  queueDepth = 0,
}) {
  // Inline heuristic fallback — mirrors the Python implementation
  function heuristicFallback() {
    const SLA_HOURS = { Critical: 2, High: 4, Medium: 8, Low: 24 };
    const SEV_MULT  = { Critical: 1.4, High: 1.2, Medium: 1.0, Low: 0.8 };
    const total     = SLA_HOURS[severity] ?? 8;
    const ratio     = Math.max(0, Math.min(1.5, hoursElapsed / total));
    const raw       = ratio * (SEV_MULT[severity] ?? 1.0);
    const logistic  = 1 / (1 + Math.exp(-5 * (raw - 0.5)));
    const prob      = Math.max(0.01, Math.min(0.99, logistic));
    return {
      breachProbability: Math.round(prob * 1000) / 1000,
      brierScore: 0.09,
      confidenceInterval: [
        Math.max(0.01, Math.round((prob - 0.1) * 1000) / 1000),
        Math.min(0.99, Math.round((prob + 0.1) * 1000) / 1000),
      ],
      topFactors: [
        { factor: 'Time elapsed ratio',       contribution: Math.round(ratio * 0.7 * 1000) / 1000 },
        { factor: `Severity (${severity})`,   contribution: Math.round(((SEV_MULT[severity] ?? 1) - 1) * prob * 0.5 * 1000) / 1000 },
        { factor: 'Queue depth',              contribution: Math.round(Math.min(0.1, queueDepth * 0.01) * prob * 1000) / 1000 },
      ],
      fallback: true,
    };
  }

  try {
    const { data } = await axios.post(
      `${FASTAPI_URL}/predict-breach`,
      { incidentType, severity, hoursElapsed, hoursRemaining, location, queueDepth },
      { timeout: 6000 }
    );
    return { ...data, fallback: false };
  } catch (error) {
    console.error('[FastAPI][breach]', error.message);
    return heuristicFallback();
  }
}
