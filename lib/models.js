import { query } from "./db";

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

let _cache = { models: null, default: null, enhancement: null, ts: 0 };

// Last-resort fallbacks if DB is unreachable
const FALLBACK_DEFAULT_MODEL = "claude-sonnet-4-6";
const FALLBACK_ENHANCEMENT_MODEL = "claude-haiku-4-5-20251001";
const FALLBACK_PRICING = {
  "claude-opus-4-6": { input: 5.0, output: 25.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5-20251001": { input: 1.0, output: 5.0 },
  "claude-sonnet-4-5-20250929": { input: 3.0, output: 15.0 },
};

async function refresh() {
  if (_cache.ts && Date.now() - _cache.ts < CACHE_TTL) return;
  try {
    const rows = await query(
      "SELECT * FROM models WHERE is_active = true ORDER BY sort_order"
    );
    _cache.models = rows;
    _cache.default = rows.find((m) => m.is_default) || rows[0];
    _cache.enhancement = rows.find((m) => m.is_enhancement) || rows[0];
    _cache.ts = Date.now();
  } catch (err) {
    console.error("Failed to refresh model cache:", err.message);
    // Keep stale cache if available
  }
}

export async function getActiveModels() {
  await refresh();
  return _cache.models || [];
}

export async function getDefaultModel() {
  await refresh();
  return _cache.default?.id || FALLBACK_DEFAULT_MODEL;
}

export async function getEnhancementModel() {
  await refresh();
  return _cache.enhancement?.id || FALLBACK_ENHANCEMENT_MODEL;
}

export function calcCost(modelId, tokensIn, tokensOut) {
  const model = _cache.models?.find((m) => m.id === modelId);
  const pricing = model
    ? { input: Number(model.input_price), output: Number(model.output_price) }
    : FALLBACK_PRICING[modelId] || { input: 3.0, output: 15.0 };

  return (
    (tokensIn / 1_000_000) * pricing.input +
    (tokensOut / 1_000_000) * pricing.output
  );
}

export function getPricing(modelId) {
  const model = _cache.models?.find((m) => m.id === modelId);
  if (model) {
    return { input: Number(model.input_price), output: Number(model.output_price) };
  }
  return FALLBACK_PRICING[modelId] || { input: 3.0, output: 15.0 };
}
