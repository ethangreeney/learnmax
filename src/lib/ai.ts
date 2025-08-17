// src/lib/ai.ts — Gemini-only, buffered streaming to avoid mid-word junk
import { GoogleGenerativeAI } from '@google/generative-ai';

export const PRIMARY_MODEL = 'gemini-2.5-flash';

let _gg: GoogleGenerativeAI | null = null;
function gg(): GoogleGenerativeAI {
  if (_gg) return _gg;
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new Error('GOOGLE_API_KEY is not set. Add it to .env.local.');
  _gg = new GoogleGenerativeAI(key);
  return _gg;
}

/* ------------------------- helpers for loose JSON ------------------------- */
function tryParseJson(s: string): any | null { try { return JSON.parse(s); } catch { return null; } }
function extractFromCodeFence(text: string): string | null {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return m ? m[1].trim() : null;
}
function extractFirstJSONObject(text: string): string | null {
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') { if (depth === 0) start = i; depth++; continue; }
    if (ch === '}') { if (depth > 0 && --depth === 0 && start >= 0) return text.slice(start, i + 1); }
  }
  return null;
}

/* ------------------------------ text (single) ----------------------------- */
export async function generateText(prompt: string, _preferredModel?: string, system?: string): Promise<string> {
  const model = gg().getGenerativeModel({ model: PRIMARY_MODEL, ...(system ? { systemInstruction: system } : {}) });
  const res = await model.generateContent(prompt);
  return (res.response?.text?.() || '').trim();
}

/* ------------------------------ json (single) ----------------------------- */
export async function generateJSON(prompt: string, _preferredModel?: string, system?: string): Promise<any> {
  const model = gg().getGenerativeModel({
    model: PRIMARY_MODEL,
    ...(system ? { systemInstruction: system } : {}),
    generationConfig: { responseMimeType: 'application/json' },
  });
  const res = await model.generateContent(prompt);
  const txt = res.response?.text?.() || '';

  const direct = tryParseJson(txt); if (direct) return direct;
  const fenced = extractFromCodeFence(txt); if (fenced) { const j = tryParseJson(fenced); if (j) return j; }
  const balanced = extractFirstJSONObject(txt); if (balanced) { const j = tryParseJson(balanced); if (j) return j; }

  throw new Error('AI returned non-JSON payload');
}

/* ------------------------------- streaming -------------------------------- */
/**
 * Streams text but buffers until a safe boundary so we never cut words.
 * - Works with Gemini's cumulative or delta-ish events.
 * - Emits on sentence end (., !, ?), double newline, or bullet/numeric list.
 * - Size fallback ensures progress even in long sentences.
 * - Final flush guarantees at least one event.
 */
export async function* streamTextChunks(
  prompt: string,
  _preferredModel?: string,
  system?: string
): AsyncGenerator<string> {
  const model = gg().getGenerativeModel({ model: PRIMARY_MODEL, ...(system ? { systemInstruction: system } : {}) });
  // @ts-ignore SDK versions vary
  const stream = await model.generateContentStream({ contents: [{ role: 'user', parts: [{ text: prompt }]}] });

  let seen = '';   // tracks cumulative text if events are cumulative
  let carry = '';  // buffer until we hit a safe boundary
  let emitted = false;

  const boundary = /(?<=\S[.!?])\s+(?=[A-Z0-9("\[])/; // sentence-ish
  const listBoundary = /\n(?=\* |\d+\. )/;            // bullets / numbered lists
  const paraBoundary = /\n{2,}/;                      // blank line
  const MAX_CHUNK = 600;                              // size fallback (~2–3 sentences)

  function* drain(append: string, final = false): Generator<string> {
    carry += append;
    while (true) {
      let idx = -1;
      // Prefer paragraph break, then bullets, then sentence end
      for (const re of [paraBoundary, listBoundary, boundary]) {
        const m = carry.match(re);
        if (m) { idx = (m.index! + m[0].length); break; }
      }
      // Fallback: if too big, break at last space before MAX_CHUNK
      if (idx < 0 && carry.length >= MAX_CHUNK && !final) {
        const cut = carry.lastIndexOf(' ', MAX_CHUNK);
        idx = cut > 0 ? cut + 1 : MAX_CHUNK;
      }
      if (idx < 0) break;
      const out = carry.slice(0, idx);
      carry = carry.slice(idx);
      if (out.trim()) yield out;
    }
    if (final && carry.trim()) { const out = carry; carry = ''; yield out; }
  }

  // @ts-ignore tolerate SDK iter surface
  for await (const ev of (stream.stream ?? stream)) {
    // Try official .text(); otherwise stitch parts
    // @ts-ignore
    const t = typeof ev.text === 'function'
      // @ts-ignore
      ? String(ev.text() || '')
      // @ts-ignore
      : String(ev?.candidates?.[0]?.content?.parts?.map((p:any)=>p?.text).filter(Boolean).join('') || '');

    if (!t) continue;

    // Detect cumulative vs delta: if current starts with 'seen', it's cumulative
    let delta: string;
    if (t.length >= seen.length && t.slice(0, seen.length) === seen) {
      delta = t.slice(seen.length);
      seen = t;
    } else {
      // Treat as delta event
      delta = t;
      seen += t;
    }

    for (const seg of drain(delta)) {
      emitted = true;
      yield seg;
    }
  }

  // Final flush
  for (const seg of drain('', true)) {
    emitted = true;
    yield seg;
  }

  if (!emitted) {
    const full = await generateText(prompt, PRIMARY_MODEL, system);
    if (full) yield full;
  }
}
