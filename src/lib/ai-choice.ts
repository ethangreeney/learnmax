// src/lib/ai-choice.ts
/**
 * Centralized model selection: two modes only
 * - Quality -> GPT-5 (text). For vision/PDF, map to Gemini 2.5 Pro
 * - Speed   -> Gemini 2.5 Flash
 *
 * Persisted as a cookie `ai_model` with the underlying model id value
 * ("gpt-5" or "gemini-2.5-flash-lite").
 */

const NODE_ENV = process.env.NODE_ENV || 'development';

export const QUALITY_TEXT_MODEL = 'gemini-2.5-flash-lite';
export const SPEED_TEXT_MODEL = 'gemini-2.5-flash-lite';
export const QUALITY_VISION_MODEL = 'gemini-2.5-flash-lite';
export const SPEED_VISION_MODEL = 'gemini-2.5-flash-lite';

function parseCookieHeader(headerValue: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headerValue) return out;
  const parts = headerValue.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

function readCookie(name: string, input?: unknown): string | undefined {
  try {
    // NextRequest
    const anyReq = input as any;
    if (anyReq && anyReq.cookies && typeof anyReq.cookies.get === 'function') {
      const v = anyReq.cookies.get(name);
      if (v && typeof v === 'object' && typeof v.value === 'string') return v.value;
      if (typeof v === 'string') return v;
    }
  } catch {}
  try {
    // Request
    const req = input as Request;
    if (req && req.headers && typeof req.headers.get === 'function') {
      const raw = req.headers.get('cookie') || '';
      return parseCookieHeader(raw)[name];
    }
  } catch {}
  try {
    // Headers
    const headers = input as Headers;
    if (headers && typeof headers.get === 'function') {
      const raw = headers.get('cookie') || '';
      return parseCookieHeader(raw)[name];
    }
  } catch {}
  return undefined;
}

function isOpenAI(name: string | undefined): boolean {
  if (!name) return false;
  const n = name.trim().toLowerCase();
  return n.startsWith('gpt-') || n.startsWith('openai:');
}

/**
 * Resolve the selected model id from request cookies.
 * Falls back to sensible defaults by environment when missing.
 *
 * When opts.forVision is true, maps any OpenAI selection to a suitable Gemini
 * model (Pro for quality, Flash for speed), since vision/PDF is Gemini-only here.
 */
export function getSelectedModelFromRequest(
  reqOrHeaders?: unknown,
  opts?: { forVision?: boolean }
): string {
  // Ignore cookies and environment; hardcode single model
  return 'gemini-2.5-flash-lite';
}


