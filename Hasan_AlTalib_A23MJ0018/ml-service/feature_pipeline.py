import re

import numpy as np
from scipy.sparse import csr_matrix, hstack

FOCUS_PATTERNS = {
    "damaged_parcel": re.compile(
        r"\b(damaged|damage|broken|shattered|wet contents|wet|crushed|dented|"
        r"torn|tear|smashed|pecah|rosak|koyak)\b"
    ),
    "late_delivery": re.compile(
        r"\b(late|delay|delayed|not arrived|not delivered|belum sampai|tak sampai|still waiting)\b"
    ),
    "address_error": re.compile(
        r"\b(address|alamat|wrong location|wrong postcode|incorrect address|bad address)\b"
    ),
    "system_error": re.compile(
        r"\b(system|portal|app|website|scan|scanner|tracking update|tracking not updating|api|server)\b"
    ),
    "missing_parcel": re.compile(
        r"\b(missing|lost parcel|lost|not received|never received|stolen|disappeared|parcel missing)\b"
    ),
    "wrong_item": re.compile(
        r"\b(wrong item|wrong parcel|incorrect item|different item|mismatched item)\b"
    ),
}

ENGINEERED_FEATURE_NAMES = [
    "eng__char_length",
    "eng__word_count",
    "eng__sentence_count",
    "eng__exclamation_count",
    "eng__question_count",
    "eng__digit_count",
    "eng__tracking_keyword",
    "eng__location_keyword",
    "eng__batch_keyword",
    "eng__damaged_parcel_hits",
    "eng__late_delivery_hits",
    "eng__address_error_hits",
    "eng__system_error_hits",
    "eng__missing_parcel_hits",
    "eng__wrong_item_hits",
]


def normalize_text(text: str) -> str:
    normalized = (text or "").lower()
    normalized = normalized.replace("_", " ")
    normalized = re.sub(r"[\r\n]+", ". ", normalized)
    normalized = re.sub(r"\b(reporter|location|date)\s*:\s*", " ", normalized)
    normalized = re.sub(r"\bawb\s*[:#-]?\s*[a-z0-9-]+\b", " tracking ", normalized)
    normalized = re.sub(r"\brm\s?\d[\d,]*(?:\.\d+)?\b", " amount ", normalized)
    normalized = re.sub(r"\b\d{1,2}:\d{2}\s*(?:am|pm)?\b", " time ", normalized)
    normalized = re.sub(r"\b\d{1,2}\s+[a-z]+\s+\d{4}\b", " date ", normalized)
    normalized = re.sub(r"\b\d+\b", " ", normalized)
    normalized = re.sub(r"[^a-z\s\.\-]", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip()


def build_focus_text(text: str) -> str:
    sentences = [
        sentence.strip()
        for sentence in re.split(r"[.!?]+", text)
        if sentence and sentence.strip()
    ]
    focused = []

    for sentence in sentences:
        if any(pattern.search(sentence) for pattern in FOCUS_PATTERNS.values()):
            focused.append(sentence)

    if not focused:
        return text

    return ". ".join(dict.fromkeys(focused))


def score_rule_candidate(text: str) -> tuple[str | None, float]:
    scores = {}

    for label, pattern in FOCUS_PATTERNS.items():
        matches = pattern.findall(text)
        if matches:
            scores[label] = len(matches)

    if not scores:
        return None, 0.0

    label = max(scores, key=scores.get)
    score = scores[label]

    if score < 1:
        return None, 0.0

    confidence = min(0.82 + (score * 0.06), 0.94)
    return label, round(confidence, 4)


def extract_engineered_features(text: str) -> np.ndarray:
    raw_text = text or ""
    normalized = normalize_text(raw_text)
    words = normalized.split()
    sentences = [segment for segment in re.split(r"[.!?]+", raw_text) if segment.strip()]

    counts = {
        "tracking": len(re.findall(r"\b(tracking|awb|consignment)\b", normalized)),
        "location": len(re.findall(r"\b(hub|cargo|depot|distribution|branch)\b", normalized)),
        "batch": len(re.findall(r"\b(batch|pallet|carton|shipment)\b", normalized)),
    }

    pattern_hits = [len(pattern.findall(normalized)) for pattern in FOCUS_PATTERNS.values()]

    values = [
        float(len(raw_text)),
        float(len(words)),
        float(len(sentences) or 1),
        float(raw_text.count("!")),
        float(raw_text.count("?")),
        float(sum(character.isdigit() for character in raw_text)),
        float(counts["tracking"]),
        float(counts["location"]),
        float(counts["batch"]),
        *[float(hit) for hit in pattern_hits],
    ]

    return np.array(values, dtype=np.float32)


def build_feature_matrix(vectoriser, texts):
    vectorised = vectoriser.transform(texts)
    engineered = np.vstack([extract_engineered_features(text) for text in texts])
    return hstack([vectorised, csr_matrix(engineered)], format="csr")


def get_feature_names(vectoriser):
    return list(vectoriser.get_feature_names_out()) + ENGINEERED_FEATURE_NAMES
