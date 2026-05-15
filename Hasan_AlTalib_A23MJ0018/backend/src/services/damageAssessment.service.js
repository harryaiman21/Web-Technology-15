// damageAssessment.service.js
// Intentionally hardwired to Anthropic — vision requires Claude.
// Do NOT change this to use callAI() or the DeepSeek toggle.

import Anthropic from "@anthropic-ai/sdk";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const client = ANTHROPIC_KEY ? new Anthropic({ apiKey: ANTHROPIC_KEY }) : null;

// ── Photo analysis prompt (Claude Vision only) ────────────────────────────────
const PHOTO_PROMPT = `You are a DHL damage assessment specialist. Analyze this logistics parcel damage photo.

Return ONLY valid JSON with this exact structure (no markdown fences, no extra text):
{
  "damageType": "one of: crushed|torn|wet|missing_contents|surface_scratch|dented|broken|other",
  "severityScore": <number 1.0-5.0>,
  "affectedAreas": ["list of affected areas, e.g. corner, side, top"],
  "packagingCondition": "one of: intact|compromised|destroyed",
  "confidence": <number 0.0-1.0>
}

Severity scale: 1=minimal cosmetic, 2=minor damage, 3=moderate damage, 4=significant damage, 5=completely destroyed.
Be objective and precise.`;

// ── Text severity extraction (deterministic — no AI needed) ───────────────────
const SEVERITY_KEYWORDS = [
  { score: 5, words: ["destroyed", "completely damaged", "totally destroyed", "crushed completely", "beyond repair"] },
  { score: 4, words: ["heavily damaged", "broken", "smashed", "shattered", "severely damaged", "crushed", "collapsed"] },
  { score: 3, words: ["damaged", "dented", "bent", "torn", "wet", "soaked", "compromised"] },
  { score: 2, words: ["scratched", "minor damage", "slight damage", "slightly", "small dent", "small tear"] },
  { score: 1, words: ["small scratch", "minimal", "barely", "minor scratch", "almost intact", "cosmetic"] },
];

export function extractTextSeverity(text) {
  if (!text || typeof text !== "string") {
    return { claimedSeverity: 3, keywords: [] };
  }

  const lower = text.toLowerCase();
  const foundKeywords = [];
  let highestScore = 0;

  for (const { score, words } of SEVERITY_KEYWORDS) {
    for (const word of words) {
      if (lower.includes(word)) {
        foundKeywords.push(word);
        if (score > highestScore) {
          highestScore = score;
        }
      }
    }
  }

  return {
    claimedSeverity: highestScore || 3, // default to 3 if no keywords found
    keywords: [...new Set(foundKeywords)].slice(0, 8),
  };
}

// ── Consistency check (deterministic formula) ────────────────────────────────
function buildConsistencyCheck(photoSeverity, textSeverity) {
  const diff = Math.abs(photoSeverity - textSeverity);
  // score = 5 − diff, clamped [1, 5]
  const score = Math.min(5, Math.max(1, Math.round((5 - diff) * 10) / 10));
  const discrepancyDetected = diff >= 1.5;

  let discrepancyReason = "";
  let recommendation = "Photo and text descriptions are broadly consistent.";

  if (discrepancyDetected) {
    const direction = photoSeverity > textSeverity ? "understates" : "overstates";
    discrepancyReason = `Photo shows severity ${photoSeverity.toFixed(1)} but text implies severity ${textSeverity.toFixed(1)} — text ${direction} actual damage.`;
    recommendation =
      diff >= 2.5
        ? "Escalate for manual review — significant mismatch between photo evidence and text description."
        : "Flag for reviewer attention — moderate discrepancy detected between photo and text.";
  }

  return {
    score,
    discrepancyDetected,
    discrepancyReason,
    recommendation,
  };
}

// ── JSON parser / sanitiser ───────────────────────────────────────────────────
function parseJson(text) {
  const cleaned = String(text || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  return JSON.parse(cleaned);
}

function sanitizePhotoAnalysis(raw) {
  const severityScore = Math.max(1.0, Math.min(5.0, Number(raw?.severityScore || 3)));
  const confidence    = Math.max(0.0, Math.min(1.0, Number(raw?.confidence || 0.7)));
  const affectedAreas = Array.isArray(raw?.affectedAreas) ? raw.affectedAreas.map(String) : [];

  return {
    damageType:          raw?.damageType || "other",
    severityScore:       Math.round(severityScore * 10) / 10,
    affectedAreas,
    packagingCondition:  raw?.packagingCondition || "compromised",
    confidence:          Math.round(confidence * 100) / 100,
  };
}

// ── Claude Vision call ────────────────────────────────────────────────────────
async function callClaudeVision({ buffer, mimetype, description }) {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `${PHOTO_PROMPT}\n\nIncident description for context:\n${description || "(none provided)"}`,
          },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mimetype,
              data: buffer.toString("base64"),
            },
          },
        ],
      },
    ],
  });

  return sanitizePhotoAnalysis(parseJson(response.content?.[0]?.text || "{}"));
}

// ── Main exported function ────────────────────────────────────────────────────
/**
 * assessDamagePhoto({ buffer, mimetype, description })
 *
 * Returns structured damage assessment with three sections:
 *   - photoAnalysis  (from Claude Vision)
 *   - textAnalysis   (deterministic keyword extraction)
 *   - consistencyCheck (deterministic formula)
 *
 * Returns null if no photo provided or if Claude times out.
 * Never throws — always fails soft.
 */
export async function assessDamagePhoto({ buffer, mimetype, description }) {
  if (!buffer || !mimetype) {
    return null;
  }

  if (!client) {
    throw new Error("Vision analysis requires an ANTHROPIC_API_KEY — set it in your environment variables.");
  }

  try {
    // Run photo analysis with a 10-second timeout
    const photoAnalysis = await Promise.race([
      callClaudeVision({ buffer, mimetype, description }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Damage assessment timeout")), 30000),
      ),
    ]);

    // Text analysis is deterministic — always runs, never fails
    const textAnalysis = extractTextSeverity(description);

    // Consistency check — deterministic formula
    const consistencyCheck = buildConsistencyCheck(
      photoAnalysis.severityScore,
      textAnalysis.claimedSeverity,
    );

    return {
      photoAnalysis,
      textAnalysis,
      consistencyCheck,
      assessedAt: new Date(),
    };
  } catch (error) {
    console.error("[damageAssessment]", error.message);
    return null;
  }
}
