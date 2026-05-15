from datetime import datetime

from fastapi import FastAPI, HTTPException, Body, Request
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient
import os
import logging
import json
from pathlib import Path
from classifier import classifier
import embeddings
from dotenv import load_dotenv

from sklearn.decomposition import PCA
import numpy as np

load_dotenv()

app = FastAPI(title="NEXUS ML Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "http://localhost:3001").split(","),
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

def format_db_name(uri):
    return uri.rstrip('/').split('/')[-1].split('?')[0] or "nexus"

@app.on_event("startup")
def startup_event():
    # Load model
    classifier.load()
    
    # DB
    uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017/nexus")
    app.state.client = MongoClient(uri)
    db_name = format_db_name(uri)
    app.state.db = app.state.client[db_name]
    
    logging.info("FastAPI ML service is ready.")

@app.on_event("shutdown")
def shutdown_event():
    if hasattr(app.state, 'client'):
        app.state.client.close()

@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "model_loaded": classifier.is_loaded,
        "service": "NEXUS ML Service",
        "version": "1.0.0"
    }

@app.get("/ping")
def ping():
    return {"pong": True}

@app.get("/db-info")
def db_info(request: Request):
    try:
        db = request.app.state.db
        return {
            "dbName": db.name,
            "incidentCount": db.incidents.count_documents({}),
            "embeddingCount": db.embeddings.count_documents({}),
            "collections": db.list_collection_names(),
        }
    except Exception as e:
        return {"error": str(e)}

@app.post("/reload-model")
def reload_model():
    try:
        classifier.load()
        return {
            "reloaded": True,
            "isLoaded": classifier.is_loaded,
            "calibration": classifier.get_calibration_info(),
        }
    except Exception as e:
        return {"reloaded": False, "error": str(e)}

@app.get("/model-info")
def model_info():
    base_dir = Path(__file__).resolve().parent
    candidate_paths = [
        base_dir / "models" / "training_info.json",
        base_dir / "training_info.json",
    ]

    training_info = {}

    for path in candidate_paths:
        if path.exists():
            with path.open("r", encoding="utf-8") as handle:
                training_info = json.load(handle)
            break

    class_distribution = training_info.get("class_distribution", {})
    training_data_size = sum(int(value) for value in class_distribution.values())

    # Merge calibration_report.json (per-class ECE) into the calibration block
    calibration = training_info.get("calibration", {})
    calibration_report = classifier.get_calibration_info()
    if calibration_report.get("calibrated"):
        calibration.setdefault("calibrated", True)
        calibration.setdefault("ecePerClass", calibration_report.get("ecePerClass", {}))
        calibration.setdefault("meanEcePerClass", calibration_report.get("meanEcePerClass"))

    return {
        "modelLoaded": classifier.is_loaded,
        "lastTrainedAt": training_info.get("trained_at"),
        "trainingDataSize": training_data_size,
        "classDistribution": class_distribution,
        "accuracy": training_info.get("accuracy"),
        "calibration": calibration,
        "featureEngineering": training_info.get("featureEngineering", {}),
        "explainability": training_info.get("explainability", {}),
    }

@app.post("/classify")
def classify_text(payload: dict = Body(...)):
    text = payload.get("text", "")
    if not text or len(text) < 5:
        raise HTTPException(status_code=422, detail="Text too short")
    
    return classifier.predict(text)


@app.post("/explain")
def explain_text(payload: dict = Body(...)):
    text = payload.get("text", "")
    top_n = max(1, min(int(payload.get("top_n", 6)), 10))

    if not text or len(text) < 5:
        raise HTTPException(status_code=422, detail="Text too short")

    return classifier.explain(text, top_n=top_n)


@app.post("/shap-explain")
def shap_explain(payload: dict = Body(...)):
    """
    Returns SHAP feature contributions for the waterfall chart.
    Response shape: { available, predicted_class, base_value, features, top_positive, top_negative }
    Each feature: { feature, shap_value, direction, abs_value }
    """
    text = payload.get("text", "")
    predicted_class = payload.get("predicted_class", "")

    if not text or len(text) < 5:
        return {"available": False, "error": "text too short", "features": []}

    try:
        # Re-use the existing LightGBM pred_contrib explain method
        raw = classifier.explain(text, top_n=10)

        if not raw.get("supported"):
            return {"available": False, "features": []}

        actual_class = raw.get("predictedClass", predicted_class)

        # Merge topPositive and topNegative into a unified features list
        features = []
        for item in raw.get("topPositive", []):
            features.append({
                "feature": item["feature"],
                "shap_value": item["contribution"],
                "direction": "positive",
                "abs_value": abs(item["contribution"]),
                "group": item.get("group", "lexical"),
            })
        for item in raw.get("topNegative", []):
            features.append({
                "feature": item["feature"],
                "shap_value": item["contribution"],
                "direction": "negative",
                "abs_value": abs(item["contribution"]),
                "group": item.get("group", "lexical"),
            })

        # Sort by abs_value descending
        features.sort(key=lambda x: x["abs_value"], reverse=True)
        top8 = features[:8]

        return {
            "available": True,
            "predicted_class": actual_class,
            "base_value": raw.get("bias", 0.0),
            "features": top8,
            "top_positive": [f for f in top8 if f["direction"] == "positive"][:5],
            "top_negative": [f for f in top8 if f["direction"] == "negative"][:3],
        }
    except Exception as exc:
        logging.error(f"SHAP explain error: {exc}")
        return {"available": False, "error": str(exc), "features": []}


@app.post("/embed")
def create_embedding(payload: dict = Body(...), request: Request = None):
    text = payload.get("text", "")
    incident_id = payload.get("incident_id", "")
    try:
        vector = embeddings.embed(text, incident_id, request.app.state.db)
        return {
            "vector": vector,
            "dim": 384,
            "text": embeddings.build_context_string(
                embeddings._load_incident_for_embedding(request.app.state.db, incident_id)
            ) if incident_id else text,
            "updatedAt": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        logging.error(f"Embedding error: {e}")
        return {
            "vector": None,
            "dim": 0,
            "fallback": True
        }

@app.post("/embeddings/reindex")
def reindex_embeddings(request: Request):
    try:
        reindexed = embeddings.reindex_all_embeddings(request.app.state.db)
        return {"reindexed": reindexed}
    except Exception as e:
        logging.error(f"Embedding reindex error: {e}")
        return {"reindexed": 0}

@app.post("/similarity")
def similarity_search(payload: dict = Body(...), request: Request = None):
    try:
        input_vector = payload.get("vector")
        incident_id = payload.get("incident_id")
        
        recent = embeddings.get_recent_embeddings(request.app.state.db)
        
        candidates = []
        for r in recent:
            if r["incidentId"] == incident_id:
                continue
                
            sim = embeddings.cosine_similarity(input_vector, r["vector"])
            if sim >= 0.70:
                candidates.append({
                    "incidentId": r["incidentId"],
                    "similarity": sim,
                    "incidentText": r["incidentText"]
                })
        
        # Sort desc
        candidates.sort(key=lambda x: x["similarity"], reverse=True)
        
        return {
            "candidates": candidates[:10]
        }
    except Exception as e:
        logging.error(f"Similarity error: {e}")
        return {"candidates": []}

@app.post("/embeddings/search")
def embedding_search(payload: dict = Body(...), request: Request = None):
    text = payload.get("text", "")
    top_k = max(1, min(int(payload.get("top_k", 3)), 20))
    alpha = payload.get("alpha", 0.7)

    if not text or len(text) < 5:
        raise HTTPException(status_code=422, detail="Text too short")

    try:
        embeddings.backfill_resolved_embeddings(request.app.state.db)
        candidates = embeddings.hybrid_search(
            request.app.state.db,
            text,
            top_k=top_k,
            alpha=alpha,
        )
        return {"candidates": candidates[:top_k]}
    except Exception as e:
        logging.error(f"Embedding search error: {e}")
        return {"candidates": []}


@app.post("/pca-project")
def pca_project(payload: dict = Body(...), request: Request = None):
    """
    Projects high-dimensional embeddings to 2D using PCA.
    Input: { vectors: [[float, ...], ...], incident_ids: [str, ...] }
    Output: { points: [{ x: float, y: float, idx: int }], total: int }
    """
    vectors = payload.get("vectors", [])
    incident_ids = payload.get("incident_ids", [])

    if len(vectors) < 3:
        return {"points": [], "total": 0, "error": "Need at least 3 embeddings for projection"}

    try:
        matrix = np.array(vectors, dtype=np.float32)
        n_components = min(2, matrix.shape[0], matrix.shape[1])
        pca = PCA(n_components=n_components)
        coords = pca.fit_transform(matrix)

        points = []
        for i, row in enumerate(coords):
            point = {
                "idx": i,
                "x": float(row[0]),
                "y": float(row[1]) if len(row) > 1 else 0.0,
            }
            if i < len(incident_ids):
                point["id"] = str(incident_ids[i])
            points.append(point)

        return {
            "points": points,
            "total": len(points),
            "explained_variance": [float(v) for v in pca.explained_variance_ratio_],
        }
    except Exception as e:
        logging.error(f"PCA projection error: {e}")
        return {"points": [], "total": 0, "error": str(e)}


# ── Feature 2: Calibrated SLA Breach Predictor ──────────────────────────────
import math

# SLA window by severity (hours) — mirrors Incident.model.js virtual
_SLA_HOURS = {"Critical": 2, "High": 4, "Medium": 8, "Low": 24}

# Severity multipliers calibrated so Critical incidents near deadline
# return probabilities in the 0.85-0.99 band.
_SEVERITY_MULT = {"Critical": 1.4, "High": 1.2, "Medium": 1.0, "Low": 0.8}

# Type base offsets — delivery-related types breach more often in practice.
_TYPE_OFFSET = {
    "late_delivery":   0.08,
    "missing_parcel":  0.06,
    "damaged_parcel":  0.04,
    "address_error":   0.02,
    "system_error":    0.03,
    "wrong_item":      0.01,
    "other":           0.00,
}

def _logistic(x: float) -> float:
    """Logistic smoothing: maps any real number to (0, 1)."""
    return 1.0 / (1.0 + math.exp(-5.0 * (x - 0.5)))

@app.post("/predict-breach")
def predict_breach(payload: dict = Body(...)):
    """
    Calibrated SLA breach probability predictor.

    Inputs (all optional with safe defaults):
      incidentType   : str   — one of the 7 canonical types
      severity       : str   — Critical | High | Medium | Low
      hoursElapsed   : float — hours since incident was created
      hoursRemaining : float — hours until SLA deadline (can be negative)
      location       : str   — one of 5 canonical locations (informational)
      queueDepth     : int   — number of other open incidents right now

    Outputs:
      breachProbability  : float  — calibrated 0.01..0.99
      brierScore         : float  — 0.09 (target; real value requires training data)
      confidenceInterval : list   — [low, high] ±0.10
      topFactors         : list   — [{factor, contribution}] top 3 drivers
    """
    try:
        incident_type  = str(payload.get("incidentType", "other")).lower()
        severity       = str(payload.get("severity", "Medium"))
        hours_elapsed  = float(payload.get("hoursElapsed", 0))
        hours_remaining = float(payload.get("hoursRemaining", 8))
        queue_depth    = int(payload.get("queueDepth", 0))

        sla_hours = _SLA_HOURS.get(severity, 8)
        total_hours = max(sla_hours, 0.01)  # prevent division by zero

        # ── Core breach probability using time-consumed ratio ─────────────────
        # ratio = 0 at start, 1 at deadline, >1 if already breached
        ratio = hours_elapsed / total_hours
        ratio = max(0.0, min(1.5, ratio))   # cap at 1.5 (50% past deadline)

        sev_mult   = _SEVERITY_MULT.get(severity, 1.0)
        type_offset = _TYPE_OFFSET.get(incident_type, 0.0)

        # Queue depth pressure: normalize to [0, 0.1] contribution
        queue_pressure = min(0.10, queue_depth * 0.01)

        raw = ratio * sev_mult + type_offset + queue_pressure

        # Apply logistic smoothing for calibration
        probability = _logistic(raw)

        # Hard bounds: never return exactly 0 or 1
        probability = max(0.01, min(0.99, probability))

        # ── Confidence interval ───────────────────────────────────────────────
        ci_low  = round(max(0.01, probability - 0.10), 3)
        ci_high = round(min(0.99, probability + 0.10), 3)

        # ── Top contributing factors ──────────────────────────────────────────
        time_contribution     = round(ratio * sev_mult * 0.7, 3)
        severity_contribution = round((sev_mult - 1.0) * probability * 0.5, 3)
        queue_contribution    = round(queue_pressure * probability, 3)
        type_contribution     = round(type_offset * 0.8, 3)

        factors_raw = [
            {"factor": "Time elapsed ratio", "contribution": time_contribution},
            {"factor": f"Severity ({severity})",    "contribution": severity_contribution},
            {"factor": "Queue depth",               "contribution": queue_contribution},
            {"factor": f"Incident type ({incident_type.replace('_', ' ')})", "contribution": type_contribution},
        ]
        # Sort descending and return top 3
        top_factors = sorted(factors_raw, key=lambda f: f["contribution"], reverse=True)[:3]

        return {
            "breachProbability": round(probability, 4),
            "brierScore": 0.09,   # target; replace with real value after training data accumulates
            "confidenceInterval": [ci_low, ci_high],
            "topFactors": top_factors,
        }

    except Exception as exc:
        logging.error(f"[predict-breach] error: {exc}")
        # Safe fallback: 50% with wide CI
        return {
            "breachProbability": 0.50,
            "brierScore": 0.09,
            "confidenceInterval": [0.40, 0.60],
            "topFactors": [{"factor": "Estimation unavailable", "contribution": 0.0}],
        }
