const FRUSTRATION_KEYWORDS = [
  "angry", "furious", "terrible", "horrible", "worst", "unacceptable",
  "ridiculous", "disgusting", "outrageous", "incompetent", "useless",
  "pathetic", "awful", "appalling", "frustrated", "disappointed",
  "teruk", "bodoh", "marah", "geram", "tak guna", "tipu", "penipu", "sampah",
  "kecewa", "hancur", "benci", "sial", "celaka",
];

const NEGATION_TOKENS = [
  "no", "not", "n't", "without", "zero", "never", "tak", "tiada", "bukan",
];
const POSITIVE_TOKENS = [
  "happy", "satisfied", "thanks", "thank you", "appreciate", "great", "good",
  "excellent", "kind", "patient", "calm", "polite", "no problem", "no worries",
  "no frustration", "no rush", "no hurry", "genuinely",
];

function isNegated(textBefore) {
  const tail = textBefore.toLowerCase().split(/[^a-zA-Z']+/).slice(-4);
  return NEGATION_TOKENS.some((n) => tail.includes(n));
}

export function quickSentimentScore(text) {
  const lower = text.toLowerCase();

  let keywordHits = 0;
  for (const kw of FRUSTRATION_KEYWORDS) {
    let searchFrom = 0;
    while (true) {
      const idx = lower.indexOf(kw, searchFrom);
      if (idx === -1) break;
      const negated = isNegated(lower.slice(Math.max(0, idx - 40), idx));
      if (!negated) keywordHits++;
      searchFrom = idx + kw.length;
    }
  }

  let positiveHits = 0;
  for (const pos of POSITIVE_TOKENS) {
    if (lower.includes(pos)) positiveHits++;
  }

  const exclamationCount = (text.match(/!/g) || []).length;
  const capsWords = (text.match(/\b[A-Z]{2,}\b/g) || []).length;
  const alphaOnly = text.replace(/[^a-zA-Z]/g, '');
  const capsRatio = alphaOnly.length > 0
    ? text.replace(/[^A-Z]/g, '').length / alphaOnly.length
    : 0;
  const repeatedPunct = (text.match(/[!?]{2,}/g) || []).length;

  let score = 0.55;
  score -= keywordHits * 0.15;
  score += positiveHits * 0.06;
  score -= capsWords * 0.06;
  if (capsRatio > 0.3) score -= 0.12;
  if (capsRatio > 0.5) score -= 0.08;
  score -= Math.min(exclamationCount, 5) * 0.04;
  score -= repeatedPunct * 0.06;
  if (keywordHits > 0 && capsWords > 0) score -= 0.08;

  return Math.max(0, Math.min(1, score));
}

export function sentimentLabel(score) {
  if (score >= 0.7) return 'positive';
  if (score >= 0.45) return 'neutral';
  if (score >= 0.25) return 'frustrated';
  return 'very_frustrated';
}
