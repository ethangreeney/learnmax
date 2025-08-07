// src/lib/ai.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) {
  throw new Error("GOOGLE_API_KEY is not set. Please add it to your .env.local file.");
}

const client = new GoogleGenerativeAI(apiKey);

/** Simple JSON parse try */
function tryParseJson(s: string): any | null {
  try { return JSON.parse(s); } catch { return null; }
}

/** Grab ```json ... ``` */
function extractFromCodeFence(text: string): string | null {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return m ? m[1].trim() : null;
}

/** First balanced {...} */
function extractFirstJSONObject(text: string): string | null {
  let depth = 0, start = -1, inString = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') { inString = false; }
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') { if (depth === 0) start = i; depth++; continue; }
    if (ch === '}') { if (depth > 0 && --depth === 0 && start >= 0) return text.slice(start, i + 1); }
  }
  return null;
}

/** True if it's a "model not found/unsupported" kind of error */
function isModelAvailabilityError(err: any): boolean {
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('404') || msg.includes('not found') || msg.includes('not supported');
}

/**
 * Generates a JSON object with fallbacks & robust extraction.
 */
export async function generateJSON(prompt: string): Promise<any> {
  const modelNames = ['gemini-2.0-flash', 'gemini-1.5-flash'];
  let lastErr: any;

  for (const name of modelNames) {
    try {
      const model = client.getGenerativeModel({
        model: name,
        generationConfig: { responseMimeType: 'application/json' },
      });

      const result = await model.generateContent(prompt);
      const responseText = result.response?.text();

      if (responseText) {
        const direct = tryParseJson(responseText);
        if (direct !== null) return direct;

        const fenced = extractFromCodeFence(responseText);
        if (fenced) {
          const parsedFenced = tryParseJson(fenced);
          if (parsedFenced !== null) return parsedFenced;
        }

        const firstObj = extractFirstJSONObject(responseText);
        if (firstObj) {
          const parsedBalanced = tryParseJson(firstObj);
          if (parsedBalanced !== null) return parsedBalanced;
        }
      }

      // Scan candidate parts just in case
      const parts: string[] = [];
      const candidates = (result.response as any)?.candidates ?? [];
      for (const c of candidates) {
        const p = c?.content?.parts ?? [];
        for (const part of p) if (typeof part?.text === 'string') parts.push(part.text);
      }
      for (const p of parts) {
        const direct = tryParseJson(p); if (direct !== null) return direct;
        const fenced = extractFromCodeFence(p); if (fenced) {
          const parsedFenced = tryParseJson(fenced); if (parsedFenced !== null) return parsedFenced;
        }
        const firstObj = extractFirstJSONObject(p); if (firstObj) {
          const parsedBalanced = tryParseJson(firstObj); if (parsedBalanced !== null) return parsedBalanced;
        }
      }

      lastErr = new Error('Could not extract JSON from model response');
    } catch (e) {
      if (isModelAvailabilityError(e)) { lastErr = e; continue; }
      throw e;
    }
  }

  throw new Error("The AI failed to generate a valid JSON response. Please try again. " + (lastErr?.message || ''));
}

/**
 * Generates plain text. Falls back through a list of widely supported models.
 */
export async function generateText(prompt: string): Promise<string> {
  const modelNames = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
  let lastErr: any;

  for (const name of modelNames) {
    try {
      const model = client.getGenerativeModel({ model: name });
      const result = await model.generateContent(prompt);
      const responseText = result.response?.text();
      if (!responseText) throw new Error("The AI returned an empty response.");
      return responseText;
    } catch (e) {
      if (isModelAvailabilityError(e)) { lastErr = e; continue; }
      throw e;
    }
  }

  throw new Error("The AI failed to generate a text response with available models. " + (lastErr?.message || ''));
}
