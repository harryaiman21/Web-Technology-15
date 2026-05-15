from bson import ObjectId
import datetime
import numpy as np
from rank_bm25 import BM25Okapi

_model = None

def _get_model():
    global _model
    if _model is None:
        from fastembed import TextEmbedding
        _model = TextEmbedding("sentence-transformers/all-MiniLM-L6-v2")
    return _model

def _encode(text: str) -> list:
    return list(_get_model().embed([text]))[0].tolist()

def build_context_string(incident: dict) -> str:
    parts = []
    agent_results = incident.get('agentResults') or {}
    request = agent_results.get('request') or {}
    intake = agent_results.get('intake') or {}
    intake_fields = intake.get('fields') or {}
    classifier = agent_results.get('classifier') or {}
    classifier_fields = classifier.get('fields') or {}
    resolution = agent_results.get('resolution') or {}

    t = incident.get('type', '')
    if t:
        parts.append(f"Incident type: {t.replace('_', ' ')}")

    location = (
        incident.get('location') or
        request.get('location') or
        (intake_fields.get('location') or {}).get('value')
    )
    if location:
        parts.append(f"Location: {location}")

    severity = (
        incident.get('severity') or
        (classifier_fields.get('severity') or {}).get('value')
    )
    if severity:
        parts.append(f"Severity: {severity}")

    department = (
        incident.get('department') or
        (classifier_fields.get('department') or {}).get('value')
    )
    if department:
        parts.append(f"Department: {department}")

    status = incident.get('status', '')
    if status:
        parts.append(f"Status: {status}")

    resolution_note = incident.get('resolutionNote')
    if not resolution_note:
        steps = resolution.get('steps') or []
        if steps:
            resolution_note = ' '.join(f"{i+1}. {s}" for i, s in enumerate(steps))
    if resolution_note:
        parts.append(f"Resolution: {resolution_note}")

    description = (
        incident.get('description') or
        incident.get('rawInput') or
        incident.get('text') or ''
    )
    if description:
        parts.append(f"Description: {description}")

    return '. '.join(parts)

def _load_incident_for_embedding(db, incident_id: str):
    if not incident_id:
        return None

    try:
        return db.incidents.find_one({"_id": ObjectId(str(incident_id))})
    except Exception:
        return None

def _upsert_embedding(db, incident_id: str | None, text: str, vector: list) -> None:
    lookup_id = str(incident_id) if incident_id else None
    filter_doc = {"incidentId": lookup_id} if lookup_id else {"incidentText": text[:50]}

    db.embeddings.update_one(
        filter_doc,
        {
            "$set": {
                "incidentId": lookup_id,
                "vector": vector,
                "incidentText": text,
                "updatedAt": datetime.datetime.utcnow(),
            },
            "$setOnInsert": {
                "createdAt": datetime.datetime.utcnow(),
            },
        },
        upsert=True,
    )

def embed(text: str, incident_id: str, db) -> list:
    incident = _load_incident_for_embedding(db, incident_id)
    embedding_text = build_context_string(incident) if incident else text
    vector = _encode(embedding_text)

    _upsert_embedding(db, incident_id, embedding_text, vector)
    return vector

def backfill_resolved_embeddings(db) -> int:
    incidents = list(
        db.incidents.find(
            {
                "status": "RESOLVED",
                "$or": [
                    {"description": {"$exists": True, "$ne": ""}},
                    {"rawInput": {"$exists": True, "$ne": ""}},
                ],
            },
        )
    )

    if not incidents:
        return 0

    existing_ids = {
        str(row.get("incidentId"))
        for row in db.embeddings.find(
            {"incidentId": {"$in": [str(incident["_id"]) for incident in incidents]}},
            {"incidentId": 1},
        )
    }

    inserted = 0
    for incident in incidents:
        incident_id = str(incident["_id"])
        if incident_id in existing_ids:
            continue

        embedding_text = build_context_string(incident)
        if not embedding_text:
            continue

        vector = _encode(embedding_text)
        _upsert_embedding(db, incident_id, embedding_text, vector)
        inserted += 1

    return inserted

def reindex_all_embeddings(db) -> int:
    incidents = list(db.incidents.find({}))

    current_ids = [str(incident["_id"]) for incident in incidents]

    if current_ids:
        db.embeddings.delete_many(
            {
                "incidentId": {
                    "$exists": True,
                    "$nin": current_ids,
                }
            }
        )

    reindexed = 0
    for incident in incidents:
        incident_id = str(incident["_id"])
        embedding_text = build_context_string(incident)

        if not embedding_text:
            continue

        vector = _encode(embedding_text)
        _upsert_embedding(db, incident_id, embedding_text, vector)
        reindexed += 1

    return reindexed

def get_recent_embeddings(db) -> list:
    cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=14)
    cursor = db.embeddings.find({"createdAt": {"$gt": cutoff}})

    results = []
    for row in cursor:
        results.append({
            "incidentId": row.get("incidentId"),
            "vector": row.get("vector"),
            "incidentText": row.get("incidentText", "")
        })
    return results

def cosine_similarity(v1: list, v2: list) -> float:
    arr1 = np.array(v1)
    arr2 = np.array(v2)
    dot = np.dot(arr1, arr2)
    norm1 = np.linalg.norm(arr1)
    norm2 = np.linalg.norm(arr2)
    if norm1 == 0 or norm2 == 0:
        return 0.0
    return round(float(dot / (norm1 * norm2)), 4)

def hybrid_search(db, query: str, top_k: int = 3, alpha: float = 0.7) -> list:
    all_docs = list(db.embeddings.find({}))
    if not all_docs:
        return []

    texts = [doc.get("incidentText", "") or "" for doc in all_docs]
    ids = [str(doc.get("incidentId", doc.get("_id", ""))) for doc in all_docs]

    tokenized = [text.lower().split() for text in texts]
    bm25 = BM25Okapi(tokenized)
    bm25_scores = bm25.get_scores(query.lower().split())

    query_vector = _encode(query)
    vector_scores = []
    for doc in all_docs:
        stored_vector = doc.get("vector") or []
        score = cosine_similarity(query_vector, stored_vector) if stored_vector else 0.0
        vector_scores.append(score)

    k = 60
    bm25_ranked = sorted(
        range(len(bm25_scores)),
        key=lambda index: bm25_scores[index],
        reverse=True,
    )
    vector_ranked = sorted(
        range(len(vector_scores)),
        key=lambda index: vector_scores[index],
        reverse=True,
    )

    rrf_scores = {}
    vector_weight = max(0.0, min(float(alpha), 1.0))
    bm25_weight = 1.0 - vector_weight

    for rank, index in enumerate(bm25_ranked):
        rrf_scores[index] = rrf_scores.get(index, 0.0) + bm25_weight / (k + rank + 1)

    for rank, index in enumerate(vector_ranked):
        rrf_scores[index] = rrf_scores.get(index, 0.0) + vector_weight / (k + rank + 1)

    top_indices = sorted(
        rrf_scores.keys(),
        key=lambda index: rrf_scores[index],
        reverse=True,
    )[:top_k]

    return [
        {
            "incidentId": ids[index],
            "similarity": round(float(vector_scores[index]), 4),
            "bm25Score": round(float(bm25_scores[index]), 4),
            "rrfScore": round(float(rrf_scores[index]), 6),
            "incidentText": texts[index],
        }
        for index in top_indices
    ]
