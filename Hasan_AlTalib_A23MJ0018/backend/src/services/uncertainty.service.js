function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function round(value, decimals = 3) {
  if (!Number.isFinite(Number(value))) {
    return 0;
  }

  const factor = 10 ** decimals;
  return Math.round(Number(value) * factor) / factor;
}

function pushReason(reasons, reason) {
  if (!reasons.includes(reason)) {
    reasons.push(reason);
  }
}

function levelFromScore(score) {
  if (score >= 0.6) return "high";
  if (score >= 0.3) return "medium";
  return "low";
}

export function computeUncertainty({
  mlResult,
  classifierResult,
  dedupResult,
  severity,
  similarCases = [],
  mlFallback = false,
  holdForReview = false,
  includeRetrievalSignals = true,
}) {
  const reasons = [];
  let score = 0;

  const mlConfidence = Number(mlResult?.confidence || 0);
  const classifierConfidence = Number(
    classifierResult?.fields?.type?.confidence || classifierResult?.confidence || 0
  );
  const dedupConfidence = Number(dedupResult?.confidence || 0);
  const topSimilarCase = Array.isArray(similarCases) && similarCases.length ? similarCases[0] : null;
  const topSimilarity = Number(topSimilarCase?.similarity || 0);
  const cragUsed = Boolean(similarCases?.some((candidate) => candidate?.cragUsed));
  const mlAgreement =
    classifierResult?.mlAgreement !== undefined
      ? classifierResult.mlAgreement
      : mlResult?.type && classifierResult?.decision
        ? mlResult.type === classifierResult.decision
        : true;

  if (mlFallback) {
    score += 0.35;
    pushReason(reasons, "ML fallback used");
  }

  if (mlConfidence < 0.75) {
    score += 0.25;
    pushReason(reasons, "Low ML confidence");
  } else if (mlConfidence < 0.85) {
    score += 0.12;
  }

  if (mlAgreement === false) {
    score += 0.2;
    pushReason(reasons, "Classifier disagrees with ML");
  }

  if (dedupConfidence >= 0.7 && dedupConfidence < 0.9) {
    score += 0.14;
    pushReason(reasons, "Borderline duplicate match");
  }

  if (severity === "Critical") {
    score += 0.2;
    pushReason(reasons, "High severity escalation");
  } else if (severity === "High") {
    score += 0.12;
    pushReason(reasons, "High severity escalation");
  }

  if (includeRetrievalSignals) {
    if (!topSimilarCase) {
      score += 0.18;
      pushReason(reasons, "Weak similar-case evidence");
    } else if (topSimilarity < 0.6) {
      score += 0.18;
      pushReason(reasons, "Weak similar-case evidence");
    } else if (topSimilarity < 0.75) {
      score += 0.08;
    }

    if (cragUsed) {
      score += 0.15;
      pushReason(reasons, "Case memory reformulated query");
    }
  }

  if (holdForReview && !reasons.includes("High severity escalation") && mlConfidence < 0.75) {
    pushReason(reasons, "Low ML confidence");
  }

  const normalizedScore = clamp(round(score, 3));

  return {
    score: normalizedScore,
    level: levelFromScore(normalizedScore),
    reasons,
    signals: {
      mlConfidence: round(mlConfidence, 3),
      classifierConfidence: round(classifierConfidence, 3),
      mlAgreement,
      dedupConfidence: round(dedupConfidence, 3),
      isDuplicate: Boolean(dedupResult?.isDuplicate),
      severity: severity || "Medium",
      retrievalCount: Array.isArray(similarCases) ? similarCases.length : 0,
      topSimilarity: round(topSimilarity, 3),
      cragUsed,
      mlFallback: Boolean(mlFallback),
      holdForReview: Boolean(holdForReview),
    },
  };
}

export function deriveUncertaintyFromIncident(incident) {
  if (incident?.agentResults?.uncertainty) {
    return incident.agentResults.uncertainty;
  }

  return computeUncertainty({
    mlResult: incident?.agentResults?.mlService,
    classifierResult: incident?.agentResults?.classifier,
    dedupResult: incident?.agentResults?.dedup,
    severity:
      incident?.severity || incident?.agentResults?.classifier?.fields?.severity?.value || "Medium",
    similarCases: [],
    mlFallback: incident?.mlFallback || false,
    holdForReview: incident?.holdForReview || false,
    includeRetrievalSignals: false,
  });
}
