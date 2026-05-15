import json
import logging
from pathlib import Path

import joblib
import numpy as np

from feature_pipeline import (
    build_feature_matrix,
    build_focus_text,
    get_feature_names,
    normalize_text,
    score_rule_candidate,
)


def rebalance_probabilities(base_probs: dict, predicted_label: str, confidence: float) -> dict:
    labels = list(base_probs.keys())
    if predicted_label not in labels:
        return base_probs

    remaining = max(0.0, 1.0 - confidence)
    other_labels = [label for label in labels if label != predicted_label]
    other_total = sum(base_probs[label] for label in other_labels)

    rebalanced = {predicted_label: round(confidence, 4)}

    if other_total <= 0:
        share = round(remaining / max(len(other_labels), 1), 4)
        for label in other_labels:
            rebalanced[label] = share
        return rebalanced

    for label in other_labels:
        weight = base_probs[label] / other_total
        rebalanced[label] = round(remaining * weight, 4)

    return rebalanced


class NexusClassifier:
    def __init__(self):
        self.model = None
        self.vectoriser = None
        self.label_encoder = None
        self.calibrator = None
        self.feature_names = []
        self.is_loaded = False

    def load(self):
        base_dir = Path(__file__).resolve().parent
        models_dir = base_dir / "models"
        classifier_path = models_dir / "classifier.pkl"
        vectoriser_path = models_dir / "vectoriser.pkl"
        label_encoder_path = models_dir / "label_encoder.pkl"
        calibrator_path = models_dir / "calibrator.pkl"

        try:
            self.model = joblib.load(classifier_path)
            self.vectoriser = joblib.load(vectoriser_path)
            self.label_encoder = joblib.load(label_encoder_path)
            self.calibrator = joblib.load(calibrator_path) if calibrator_path.exists() else None
            self.feature_names = get_feature_names(self.vectoriser)
            self.is_loaded = True
            logging.info("Model, vectoriser, label encoder, and calibrator loaded successfully.")
        except FileNotFoundError:
            logging.warning(
                "Model artifacts not found in ml-service/models. Run train.py first."
            )
            self.is_loaded = False

    def get_calibration_info(self) -> dict:
        """Load and return models/calibration_report.json if it exists."""
        try:
            report_path = Path(__file__).resolve().parent / "models" / "calibration_report.json"
            with report_path.open("r", encoding="utf-8") as fh:
                return json.load(fh)
        except Exception:
            return {"calibrated": bool(self.calibrator), "method": "isotonic_top_class"}

    def _transform(self, text: str):
        return build_feature_matrix(self.vectoriser, [text])

    def _calibrate_confidence(self, confidence: float) -> float:
        if self.calibrator is None:
            return round(float(confidence), 4)

        calibrated = float(self.calibrator.predict([confidence])[0])
        return round(max(0.0, min(1.0, calibrated)), 4)

    def _predict_single(self, text: str) -> tuple[str, float, float, dict]:
        vec = self._transform(text)
        encoded_pred = int(self.model.predict(vec)[0])
        probs = self.model.predict_proba(vec)[0]
        raw_confidence = float(probs.max())
        confidence = self._calibrate_confidence(raw_confidence)
        labels = [str(label) for label in self.label_encoder.classes_]
        pred = self.label_encoder.inverse_transform([encoded_pred])[0]
        prob_dict = {
            str(cls): round(float(p), 4)
            for cls, p in zip(labels, probs)
        }
        return str(pred), confidence, round(raw_confidence, 4), prob_dict

    def explain(self, text: str, top_n: int = 6) -> dict:
        if not self.is_loaded:
            return {
                "supported": False,
                "reason": "Model not loaded",
                "predictedClass": None,
                "confidence": 0.0,
                "topPositive": [],
                "topNegative": [],
            }

        normalized = normalize_text(text)
        features = self._transform(normalized)
        probs = self.model.predict_proba(features)[0]
        predicted_index = int(np.argmax(probs))
        predicted_class = str(self.label_encoder.inverse_transform([predicted_index])[0])
        confidence = self._calibrate_confidence(float(np.max(probs)))

        contrib = self.model.booster_.predict(features, pred_contrib=True)

        if isinstance(contrib, list):
            class_contrib = np.asarray(contrib[predicted_index].toarray()[0])
        else:
            contrib_array = np.asarray(contrib)
            if contrib_array.ndim == 1:
                contrib_array = contrib_array.reshape(1, -1)

            class_count = len(self.label_encoder.classes_)
            per_class_width = len(self.feature_names) + 1
            class_contrib = contrib_array.reshape(class_count, per_class_width)[predicted_index]

        shap_values = class_contrib[:-1]
        bias = float(class_contrib[-1])
        dense_values = np.asarray(features.toarray()[0])

        ranked_indices = np.argsort(np.abs(shap_values))[::-1]
        top_positive = []
        top_negative = []

        for index in ranked_indices:
            contribution = float(shap_values[index])
            feature_name = self.feature_names[index]
            feature_value = float(dense_values[index])
            row = {
                "feature": feature_name,
                "contribution": round(contribution, 4),
                "value": round(feature_value, 4),
                "group": "engineered" if feature_name.startswith("eng__") else "lexical",
            }

            if contribution >= 0 and len(top_positive) < top_n:
                top_positive.append(row)
            elif contribution < 0 and len(top_negative) < top_n:
                top_negative.append(row)

            if len(top_positive) >= top_n and len(top_negative) >= top_n:
                break

        return {
            "supported": True,
            "predictedClass": predicted_class,
            "confidence": confidence,
            "bias": round(bias, 4),
            "topPositive": top_positive,
            "topNegative": top_negative,
        }

    def predict(self, text: str) -> dict:
        if not self.is_loaded:
            return {
                "type": None,
                "predicted_class": None,
                "confidence": 0.0,
                "raw_confidence": 0.0,
                "probabilities": {},
                "fallback": True,
            }

        normalized = normalize_text(text)
        primary_pred, primary_confidence, primary_raw_confidence, primary_probs = self._predict_single(
            normalized
        )

        focus_text = build_focus_text(normalized)
        focus_pred, focus_confidence, focus_raw_confidence, _focus_probs = self._predict_single(
            focus_text
        )
        rule_pred, rule_confidence = score_rule_candidate(focus_text)

        final_pred = primary_pred
        final_confidence = primary_confidence
        final_raw_confidence = primary_raw_confidence
        final_probs = primary_probs

        should_promote_focus = (
            focus_pred != "other"
            and focus_confidence >= 0.78
            and (primary_pred == "other" or focus_confidence >= primary_confidence + 0.04)
        )

        if should_promote_focus:
            final_pred = focus_pred
            final_confidence = focus_confidence
            final_raw_confidence = focus_raw_confidence
            final_probs = rebalance_probabilities(primary_probs, focus_pred, focus_confidence)

        should_promote_rules = (
            rule_pred is not None
            and rule_confidence >= 0.84
            and primary_pred == "other"
            and final_pred != rule_pred
        )

        if should_promote_rules:
            final_pred = rule_pred
            final_confidence = rule_confidence
            final_raw_confidence = final_confidence
            final_probs = rebalance_probabilities(primary_probs, rule_pred, rule_confidence)

        return {
            "type": final_pred,
            "predicted_class": final_pred,
            "confidence": final_confidence,
            "raw_confidence": final_raw_confidence,
            "calibrated": self.calibrator is not None,
            "calibration_applied": self.calibrator is not None,
            "probabilities": final_probs,
            "focus_text": focus_text if focus_text != normalized else None,
            "rule_adjusted": should_promote_rules,
            "feature_engineering": True,
        }


classifier = NexusClassifier()
