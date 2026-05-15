import Anthropic from '@anthropic-ai/sdk';

// ── Vision provider abstraction ─────────────────────────────────────────────
//
// Default provider: Anthropic Claude (uses the same ANTHROPIC_API_KEY the rest
// of NEXUS already uses — no new billing). Claude 3.5 Haiku is cheapest with
// vision; default model falls back to whatever is set in env, then to a known
// vision-capable Claude model.
//
// Opt-in alternatives (set VISION_PROVIDER=<name>):
//   - "gemini"  → Google Gemini 2.0 Flash (needs GEMINI_API_KEY + paid quota)
//   - "openai"  → OpenAI GPT-4o-mini    (needs OPENAI_API_KEY)
//
// Every provider returns the SAME shape — `{ text, fields, raw, model }` —
// so callers don't care which model produced the output.

const PROVIDER       = (process.env.VISION_PROVIDER || 'claude').toLowerCase();
// Defaults to the same Claude model the main NEXUS pipeline uses — guaranteed
// to be available in the current account. Override with ANTHROPIC_VISION_MODEL
// to switch to a cheaper Haiku tier (e.g. claude-haiku-4-5) if available.
const CLAUDE_MODEL   = process.env.ANTHROPIC_VISION_MODEL || 'claude-sonnet-4-6';
const GEMINI_MODEL   = process.env.GEMINI_VISION_MODEL    || 'gemini-2.0-flash';
const OPENAI_MODEL   = process.env.OPENAI_VISION_MODEL    || 'gpt-4o-mini';

// ── Prompt — DHL parcel-label / damage-photo extraction ────────────────────
const SYSTEM_PROMPT = `You are a DHL Malaysia shipping document and damage-photo OCR specialist.

Extract every piece of useful information from the image. Focus on:
  - AWB / tracking number (typical formats: JD1234567890, MY12345, raw 10-12 digit numbers)
  - Sender / recipient names and addresses
  - Hub names (Shah Alam, KLIA, Penang, JB, Subang)
  - Weight in kg, declared value
  - Service type (Express, Economy, Same Day, etc.)
  - Visible damage description (crushed, torn, water damage, etc.) if a damage photo
  - Any other visible text

Return STRICT JSON in this exact shape — no markdown, no code fences, no commentary:
{
  "awb": "string or null",
  "recipient": "string or null",
  "sender": "string or null",
  "recipientAddress": "string or null",
  "hub": "string or null",
  "weight": "string or null",
  "declaredValue": "string or null",
  "serviceType": "string or null",
  "damageVisible": "string or null",
  "rawText": "all visible text concatenated (one paragraph)"
}`;

// ── Helpers ─────────────────────────────────────────────────────────────────
function safeParseJson(text) {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

function buildFlatText(fields) {
  if (!fields) return '';
  const lines = [];
  if (fields.awb)              lines.push(`AWB: ${fields.awb}`);
  if (fields.recipient)        lines.push(`Recipient: ${fields.recipient}`);
  if (fields.sender)           lines.push(`Sender: ${fields.sender}`);
  if (fields.recipientAddress) lines.push(`Recipient address: ${fields.recipientAddress}`);
  if (fields.hub)              lines.push(`Hub: ${fields.hub}`);
  if (fields.weight)           lines.push(`Weight: ${fields.weight}`);
  if (fields.declaredValue)    lines.push(`Declared value: ${fields.declaredValue}`);
  if (fields.serviceType)      lines.push(`Service: ${fields.serviceType}`);
  if (fields.damageVisible)    lines.push(`Damage observed: ${fields.damageVisible}`);
  if (fields.rawText)          lines.push(`\nFull OCR text: ${fields.rawText}`);
  return lines.join('\n');
}

function normaliseInput(input) {
  if (!input) return '';
  if (Buffer.isBuffer(input)) return input.toString('base64');
  if (typeof input === 'string') return input.replace(/^data:image\/[a-z]+;base64,/, '');
  return '';
}

function normaliseMime(mimeType) {
  const valid = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
  const lower = String(mimeType || 'image/jpeg').toLowerCase();
  if (!valid.includes(lower)) return 'image/jpeg';
  return lower === 'image/jpg' ? 'image/jpeg' : lower;
}

// ── Provider: Claude (default) ──────────────────────────────────────────────
async function extractWithClaude(base64, mimeType, filename) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw Object.assign(new Error('ANTHROPIC_API_KEY not configured'), { code: 'NO_KEY' });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 800,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
        { type: 'text',  text: `Extract structured fields from this DHL shipping image (${filename}). Return strict JSON only.` },
      ],
    }],
  });

  return {
    raw: response.content?.[0]?.text || '',
    model: `claude:${CLAUDE_MODEL}`,
  };
}

// ── Provider: Gemini (opt-in) ───────────────────────────────────────────────
async function extractWithGemini(base64, mimeType, filename) {
  if (!process.env.GEMINI_API_KEY) {
    throw Object.assign(new Error('GEMINI_API_KEY not configured'), { code: 'NO_KEY' });
  }
  // Lazy import — only loads if user actually opts in.
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model  = client.getGenerativeModel({ model: GEMINI_MODEL, systemInstruction: SYSTEM_PROMPT });
  const result = await model.generateContent([
    { inlineData: { data: base64, mimeType } },
    `Extract structured fields from this DHL shipping image (${filename}). Return strict JSON only.`,
  ]);
  return {
    raw: result.response?.text?.() || '',
    model: `gemini:${GEMINI_MODEL}`,
  };
}

// ── Provider: OpenAI (opt-in) ───────────────────────────────────────────────
async function extractWithOpenAI(base64, mimeType, filename) {
  if (!process.env.OPENAI_API_KEY) {
    throw Object.assign(new Error('OPENAI_API_KEY not configured'), { code: 'NO_KEY' });
  }
  // Lazy import via dynamic require — same pattern as the rest of the codebase.
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: OPENAI_MODEL,
    max_tokens: 800,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: [
          { type: 'text',      text: `Extract structured fields from this DHL shipping image (${filename}). Return strict JSON only.` },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
        ],
      },
    ],
  });
  return {
    raw: response.choices?.[0]?.message?.content || '',
    model: `openai:${OPENAI_MODEL}`,
  };
}

// ── Public API ──────────────────────────────────────────────────────────────
export function isVisionEnabled() {
  if (PROVIDER === 'gemini') return !!process.env.GEMINI_API_KEY;
  if (PROVIDER === 'openai') return !!process.env.OPENAI_API_KEY;
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * Extract structured shipping/damage fields from an image.
 *
 * @param {Buffer | string} input  Raw image bytes or base64 string.
 * @param {object} [options]
 * @param {string} [options.mimeType='image/jpeg']
 * @param {string} [options.filename]
 * @returns {Promise<{ text: string, fields: object|null, raw: string, model: string, error?: string }>}
 */
export async function extractFromImage(input, options = {}) {
  const { filename = 'image' } = options;
  const mimeType = normaliseMime(options.mimeType);
  const base64   = normaliseInput(input);

  if (!base64) {
    return {
      text: `[Image "${filename}" — empty image data]`,
      fields: null, raw: '', model: 'none', error: 'empty image data',
    };
  }
  if (!isVisionEnabled()) {
    return {
      text: `[Image "${filename}" uploaded — vision provider "${PROVIDER}" not configured]`,
      fields: null, raw: '', model: 'none',
      error: `${PROVIDER} key missing`,
    };
  }

  try {
    let result;
    if (PROVIDER === 'gemini')      result = await extractWithGemini(base64, mimeType, filename);
    else if (PROVIDER === 'openai') result = await extractWithOpenAI(base64, mimeType, filename);
    else                            result = await extractWithClaude(base64, mimeType, filename);

    const fields = safeParseJson(result.raw);
    const text   = fields ? buildFlatText(fields) : result.raw;
    return { text: text || result.raw, fields, raw: result.raw, model: result.model };
  } catch (error) {
    console.error(`[vision.service:${PROVIDER}] extraction error:`, error.message);
    return {
      text: `[Image "${filename}" — vision extraction failed: ${error.message}]`,
      fields: null, raw: '', model: PROVIDER, error: error.message,
    };
  }
}
