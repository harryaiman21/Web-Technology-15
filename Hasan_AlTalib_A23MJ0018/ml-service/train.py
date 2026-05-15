from pathlib import Path
import datetime
import json
import sys

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import accuracy_score, brier_score_loss
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder

from feature_pipeline import (
    ENGINEERED_FEATURE_NAMES,
    build_feature_matrix,
    get_feature_names,
)

LABELS = [
    "late_delivery",
    "damaged_parcel",
    "missing_parcel",
    "address_error",
    "system_error",
    "wrong_item",
    "other",
]

MIN_SAMPLES_PER_CLASS = 200
BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / "data" / "training.csv"
MODELS_DIR = BASE_DIR / "models"
CLASSIFIER_PATH = MODELS_DIR / "classifier.pkl"
LABEL_ENCODER_PATH = MODELS_DIR / "label_encoder.pkl"
VECTORIZER_PATH = MODELS_DIR / "vectoriser.pkl"
CALIBRATOR_PATH = MODELS_DIR / "calibrator.pkl"
CALIBRATION_REPORT_PATH = MODELS_DIR / "calibration_report.json"
INFO_PATH = BASE_DIR / "training_info.json"
MODELS_INFO_PATH = MODELS_DIR / "training_info.json"


def expected_calibration_error(confidences, correctness, bins=10) -> float:
    confidences = np.asarray(confidences, dtype=float)
    correctness = np.asarray(correctness, dtype=float)

    if confidences.size == 0:
        return 0.0

    edges = np.linspace(0.0, 1.0, bins + 1)
    ece = 0.0

    for start, end in zip(edges[:-1], edges[1:]):
        mask = (confidences >= start) & (confidences < end if end < 1 else confidences <= end)
        if not np.any(mask):
            continue

        bucket_conf = confidences[mask].mean()
        bucket_acc = correctness[mask].mean()
        ece += abs(bucket_acc - bucket_conf) * (mask.sum() / confidences.size)

    return float(ece)


def load_training_data() -> pd.DataFrame:
    if not DATA_PATH.exists():
        print(f"Training data not found at {DATA_PATH}. Run generate_csv.py first.")
        sys.exit(1)

    dataframe = pd.read_csv(DATA_PATH)

    if "description" not in dataframe.columns or "label" not in dataframe.columns:
        print("Validation Error: training.csv must contain description,label columns")
        sys.exit(1)

    dataframe["description"] = dataframe["description"].fillna("").astype(str).str.strip()
    dataframe["label"] = dataframe["label"].fillna("").astype(str).str.strip()

    if (dataframe["description"] == "").any():
        print("Validation Error: Empty description found")
        sys.exit(1)

    counts = dataframe["label"].value_counts()
    labels_found = sorted(counts.index.tolist())
    expected_labels = sorted(LABELS)

    if labels_found != expected_labels:
        print(
            f"Validation Error: Expected labels {expected_labels}, got {labels_found}"
        )
        sys.exit(1)

    for label in LABELS:
        count = int(counts.get(label, 0))
        if count < MIN_SAMPLES_PER_CLASS:
            print(
                f"Validation Error: Expected at least {MIN_SAMPLES_PER_CLASS} rows for {label}, got {count}"
            )
            sys.exit(1)

    if len(dataframe) < MIN_SAMPLES_PER_CLASS * len(LABELS):
        print(
            f"Validation Error: Expected at least {MIN_SAMPLES_PER_CLASS * len(LABELS)} rows, got {len(dataframe)}"
        )
        sys.exit(1)

    return dataframe


def main() -> None:
    dataframe = load_training_data()

    X_train_full, X_test, y_train_full_raw, y_test_raw = train_test_split(
        dataframe["description"],
        dataframe["label"],
        test_size=0.2,
        stratify=dataframe["label"],
        random_state=42,
    )
    X_train, X_val, y_train_raw, y_val_raw = train_test_split(
        X_train_full,
        y_train_full_raw,
        test_size=0.25,
        stratify=y_train_full_raw,
        random_state=42,
    )

    vectoriser = TfidfVectorizer(max_features=6000, ngram_range=(1, 2))
    vectoriser.fit(X_train)

    label_encoder = LabelEncoder()
    label_encoder.fit(LABELS)
    y_train = label_encoder.transform(y_train_raw)
    y_val = label_encoder.transform(y_val_raw)
    y_test = label_encoder.transform(y_test_raw)

    X_train_vec = build_feature_matrix(vectoriser, X_train.tolist())
    X_val_vec = build_feature_matrix(vectoriser, X_val.tolist())
    X_test_vec = build_feature_matrix(vectoriser, X_test.tolist())

    model = lgb.LGBMClassifier(
        objective="multiclass",
        num_class=len(LABELS),
        learning_rate=0.08,
        n_estimators=250,
        num_leaves=31,
        class_weight="balanced",
        random_state=42,
        verbose=-1,
    )
    model.fit(X_train_vec, y_train)

    calibrator = IsotonicRegression(out_of_bounds="clip")
    val_probs = model.predict_proba(X_val_vec)
    val_raw_confidences = val_probs.max(axis=1)
    val_correctness = (val_probs.argmax(axis=1) == y_val).astype(int)
    calibrator.fit(val_raw_confidences, val_correctness)

    encoded_predictions = model.predict(X_test_vec)
    predictions = label_encoder.inverse_transform(encoded_predictions)
    accuracy = float(accuracy_score(y_test_raw, predictions))
    test_probs = model.predict_proba(X_test_vec)
    raw_confidences = test_probs.max(axis=1)
    calibrated_confidences = calibrator.predict(raw_confidences)
    test_correctness = (encoded_predictions == y_test).astype(int)

    raw_brier = float(brier_score_loss(test_correctness, raw_confidences))
    calibrated_brier = float(brier_score_loss(test_correctness, calibrated_confidences))
    raw_ece = expected_calibration_error(raw_confidences, test_correctness)
    calibrated_ece = expected_calibration_error(calibrated_confidences, test_correctness)

    # Per-class Expected Calibration Error (one-vs-rest on raw probabilities)
    # We use raw probabilities per class because isotonic calibration operates on top-class
    # confidence only; per-class ECE shows how well each class probability is individually calibrated
    ece_per_class = {}
    for class_idx, class_name in enumerate(label_encoder.classes_):
        y_true_binary = (y_test == class_idx).astype(int)
        y_prob_class = test_probs[:, class_idx]
        edges = np.linspace(0.0, 1.0, 11)
        ece_class = 0.0
        for start, end in zip(edges[:-1], edges[1:]):
            mask = (y_prob_class >= start) & (y_prob_class < (end if end < 1.0 else end + 1e-9))
            if not np.any(mask):
                continue
            bin_acc = float(y_true_binary[mask].mean())
            bin_conf = float(y_prob_class[mask].mean())
            ece_class += abs(bin_acc - bin_conf) * (mask.sum() / len(y_prob_class))
        ece_per_class[str(class_name)] = round(float(ece_class), 4)

    mean_ece_per_class = round(float(np.mean(list(ece_per_class.values()))), 4)

    calibration_report = {
        "method": "isotonic_top_class",
        "calibrated": True,
        "rawEce": round(raw_ece, 4),
        "calibratedEce": round(calibrated_ece, 4),
        "rawBrier": round(raw_brier, 4),
        "calibratedBrier": round(calibrated_brier, 4),
        "ecePerClass": ece_per_class,
        "meanEcePerClass": mean_ece_per_class,
        "calibratedAt": datetime.datetime.now(datetime.UTC).isoformat(),
    }

    feature_names = get_feature_names(vectoriser)
    feature_importances = model.feature_importances_
    top_feature_importances = sorted(
        [
            {"feature": feature_names[index], "importance": int(importance)}
            for index, importance in enumerate(feature_importances)
            if importance > 0
        ],
        key=lambda row: row["importance"],
        reverse=True,
    )[:15]

    engineered_importances = [
        row for row in top_feature_importances if row["feature"].startswith("eng__")
    ]

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, CLASSIFIER_PATH)
    joblib.dump(label_encoder, LABEL_ENCODER_PATH)
    joblib.dump(vectoriser, VECTORIZER_PATH)
    joblib.dump(calibrator, CALIBRATOR_PATH)

    with CALIBRATION_REPORT_PATH.open("w", encoding="utf-8") as fh:
        json.dump(calibration_report, fh, indent=2)

    training_info = {
        "labels": LABELS,
        "accuracy": accuracy,
        "train_size": int(len(X_train)),
        "validation_size": int(len(X_val)),
        "test_size": int(len(X_test)),
        "class_distribution": {
            str(label): int(count)
            for label, count in dataframe["label"].value_counts().sort_index().items()
        },
        "trained_at": datetime.datetime.now(datetime.UTC).isoformat(),
        "data_path": str(DATA_PATH),
        "classifier_path": str(CLASSIFIER_PATH),
        "label_encoder_path": str(LABEL_ENCODER_PATH),
        "vectoriser_path": str(VECTORIZER_PATH),
        "calibrator_path": str(CALIBRATOR_PATH),
        "generator": "generate_csv.py",
        "calibration": {
            "enabled": True,
            "method": "isotonic_top_class",
            "calibrated": True,
            "rawEce": round(raw_ece, 4),
            "calibratedEce": round(calibrated_ece, 4),
            "rawBrier": round(raw_brier, 4),
            "calibratedBrier": round(calibrated_brier, 4),
            "ecePerClass": ece_per_class,
            "meanEcePerClass": mean_ece_per_class,
        },
        "featureEngineering": {
            "enabled": True,
            "engineeredFeatureCount": len(ENGINEERED_FEATURE_NAMES),
            "engineeredFeatureNames": ENGINEERED_FEATURE_NAMES,
            "topSignals": top_feature_importances,
            "topEngineeredSignals": engineered_importances[:10],
        },
        "explainability": {
            "enabled": True,
            "mode": "lightgbm_pred_contrib",
        },
    }

    with INFO_PATH.open("w", encoding="utf-8") as file_handle:
        json.dump(training_info, file_handle, indent=2)
    with MODELS_INFO_PATH.open("w", encoding="utf-8") as file_handle:
        json.dump(training_info, file_handle, indent=2)

    print(f"Accuracy: {accuracy:.4f}")
    print(f"Calibration complete. Method: isotonic_top_class | Overall ECE: {calibrated_ece:.4f} | Mean per-class ECE: {mean_ece_per_class:.4f}")
    print(f"Saved calibration_report.json to {CALIBRATION_REPORT_PATH}")
    print(f"Saved classifier to {CLASSIFIER_PATH}")
    print(f"Saved label encoder to {LABEL_ENCODER_PATH}")
    print(f"Saved vectoriser to {VECTORIZER_PATH}")
    print("Training complete. Model saved.")


if __name__ == "__main__":
    main()
