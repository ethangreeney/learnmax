// src/lib/ai.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

export const PRIMARY_MODEL =
  process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';

const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) throw new Error('GOOGLE_API_KEY is not set. Add it to .env.local.');

const client = new GoogleGenerativeAI(apiKey);

function tryParseJson(s: string): any | null { try { return JSON.parse(s); } catch { return null; } }

function extractFromCodeFence(text: string): string | null {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return m ? m[1].trim() : null;
}

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

const L = process.env.LOG_AI === '1';
const log = (...a: any[]) => { if (L) console.log('[ai]', ...a); };

export async function generateText(prompt: string): Promise<string> {
  const names = [
    PRIMARY_MODEL,
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
  ];
  let lastErr: any;

  for (const name of names) {
    try {
      const model = client.getGenerativeModel({ model: name });
      const result = await model.generateContent(prompt);

      const text = result.response?.text?.();
      if (text && text.trim()) { log('ok', name, text.length); return text; }

      const parts: string[] = [];
      const candidates = (result.response as any)?.candidates ?? [];
      for (const c of candidates) {
        const p = c?.content?.parts ?? [];
        for (const part of p) if (typeof part?.text === 'string' && part.text.trim()) parts.push(part.text.trim());
      }
      if (parts.length) { log('parts', name, parts.length); return parts.join('\n\n'); }

      lastErr = new Error(`Empty response from ${name}`);
    } catch (e: any) {
      lastErr = e;
      continue;
    }
  }
  throw new Error('The AI returned an empty response. ' + (lastErr?.message || ''));
}

export async function generateJSON(prompt: string): Promise<any> {
  const names = [PRIMARY_MODEL, 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];
  let lastErr: any;

  for (const name of names) {
    try {
      const model = client.getGenerativeModel({
        model: name,
        generationConfig: { responseMimeType: 'application/json' },
      });
      const result = await model.generateContent(prompt);

      const text = result.response?.text?.();
      if (text && text.trim()) {
        const direct = tryParseJson(text); if (direct !== null) return direct;
        const fenced = extractFromCodeFence(text); if (fenced) {
          const p = tryParseJson(fenced); if (p !== null) return p;
        }
        const obj = extractFirstJSONObject(text); if (obj) {
          const p = tryParseJson(obj); if (p !== null) return p;
        }
      }
      const parts: string[] = [];
      const candidates = (result.response as any)?.candidates ?? [];
      for (const c of candidates) {
        const p = c?.content?.parts ?? [];
        for (const part of p) if (typeof part?.text === 'string' && part.text.trim()) parts.push(part.text.trim());
      }
      for (const p of parts) {
        const direct = tryParseJson(p); if (direct !== null) return direct;
        const fenced = extractFromCodeFence(p); if (fenced) {
          const pf = tryParseJson(fenced); if (pf !== null) return pf;
        }
        const obj = extractFirstJSONObject(p); if (obj) {
          const pb = tryParseJson(obj); if (pb !== null) return pb;
        }
      }
      lastErr = new Error(`Empty/invalid JSON from ${name}`);
    } catch (e: any) {
      lastErr = e;
      continue;
    }
  }
  throw new Error('The AI failed to generate JSON. ' + (lastErr?.message || ''));
}
