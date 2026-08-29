/**
 * API-level input validation and rate limiting.
 * Defense in depth: route handlers validate inputs in addition to per-tool checks.
 */

const MAX_PROMPT_LENGTH = 4000;
const MAX_TTS_LENGTH = 5000;
const MAX_VOICE_ID_LENGTH = 64;

// In-memory rate limiter: per-IP, per-endpoint sliding window
type RateBucket = { timestamps: number[] };
const rateBuckets = new Map<string, RateBucket>();

export interface RateLimitResult {
  ok: boolean;
  retryAfterMs?: number;
}

export function rateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const bucket = rateBuckets.get(key) || { timestamps: [] };
  const recent = bucket.timestamps.filter(t => now - t < windowMs);

  if (recent.length >= maxRequests) {
    const oldest = recent[0];
    rateBuckets.set(key, { timestamps: recent });
    return { ok: false, retryAfterMs: windowMs - (now - oldest) };
  }

  recent.push(now);
  rateBuckets.set(key, { timestamps: recent });
  return { ok: true };
}

export interface StringValidationResult {
  ok: boolean;
  value?: string;
  error?: string;
}

export function validateString(
  input: unknown,
  fieldName: string,
  options: { required?: boolean; maxLength?: number; minLength?: number } = {}
): StringValidationResult {
  if (input === undefined || input === null || input === '') {
    if (options.required) return { ok: false, error: `${fieldName} is required` };
    return { ok: true };
  }
  if (typeof input !== 'string') {
    return { ok: false, error: `${fieldName} must be a string` };
  }
  const trimmed = input.trim();
  if (options.minLength && trimmed.length < options.minLength) {
    return { ok: false, error: `${fieldName} must be at least ${options.minLength} characters` };
  }
  if (options.maxLength && trimmed.length > options.maxLength) {
    return { ok: false, error: `${fieldName} exceeds maximum length of ${options.maxLength}` };
  }
  return { ok: true, value: trimmed };
}

export const LIMITS = {
  MAX_PROMPT_LENGTH,
  MAX_TTS_LENGTH,
  MAX_VOICE_ID_LENGTH,
};
