#!/usr/bin/env bash
# Update src/lib/ai.ts to resilient Gemini 2.5 helpers and remove *.bak files.
# Usage: ./scripts/update-ai.sh

set -euo pipefail

TARGET="src/lib/ai.ts"
TMP="$(mktemp -t ai.ts.XXXXXX)"

echo "🔄 Writing new AI helpers to temp file…"

cat > "$TMP" <<'TS'
// src/lib/ai.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) throw new Error('GOOGLE_API_KEY is not set. Add it to .env.local.');

const client = new GoogleGenerativeAI(apiKey);

/** Simple JSON parse try */
function tryParseJson(s: string): any | null { try { return JSON.parse(s); } catch { return null; } }
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

/** Treat “not found/unsupported/unavailable” as availability so we keep falling back */
function isModelAvailabilityError(err: any): boolean {
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    msg.includes('404') ||
    msg.includes('not found') ||
    msg.includes('not supported') ||
    msg.includes('unavailable')
  );
}

/** Resilient JSON generation with empty-response fallback + model cascade */
export async function generateJSON(prompt: string): Promise<any> {
  const modelNames = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];
  let lastErr: any;

  for (const name of modelNames) {
    try {
      const model = client.getGenerativeModel({
        model: name,
        generationConfig: { responseMimeType: 'application/json' },
      });

      const result = await model.generateContent(prompt);

      // Prefer response.text()
      const text = result.response?.text?.();
      if (text && text.trim()) {
        const direct = tryParseJson(text);
        if (direct !== null) return direct;

        const fenced = extractFromCodeFence(text);
        if (fenced) {
          const parsedFenced = tryParseJson(fenced);
          if (parsedFenced !== null) return parsedFenced;
        }

        const firstObj = extractFirstJSONObject(text);
        if (firstObj) {
          const parsedBalanced = tryParseJson(firstObj);
          if (parsedBalanced !== null) return parsedBalanced;
        }
      }

      // Fallback: scan candidate parts
      const parts: string[] = [];
      const candidates = (result.response as any)?.candidates ?? [];
      for (const c of candidates) {
        const p = c?.content?.parts ?? [];
        for (const part of p) if (typeof part?.text === 'string' && part.text.trim()) parts.push(part.text.trim());
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

      // Nothing usable — continue to next model
      lastErr = new Error(\`Empty/invalid JSON from \${name}\`);
      continue;
    } catch (e) {
      if (isModelAvailabilityError(e)) { lastErr = e; continue; }
      lastErr = e;
      continue;
    }
  }

  throw new Error('The AI failed to generate a valid JSON response. ' + (lastErr?.message || ''));
}

/** Resilient text generation with empty-response fallback + model cascade */
export async function generateText(prompt: string): Promise<string> {
  const modelNames = ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];
  let lastErr: any;

  for (const name of modelNames) {
    try {
      const model = client.getGenerativeModel({ model: name });
      const result = await model.generateContent(prompt);

      // Prefer response.text()
      const text = result.response?.text?.();
      if (text && text.trim()) return text;

      // Fallback: scan candidate parts
      const parts: string[] = [];
      const candidates = (result.response as any)?.candidates ?? [];
      for (const c of candidates) {
        const p = c?.content?.parts ?? [];
        for (const part of p) if (typeof part?.text === 'string' && part.text.trim()) parts.push(part.text.trim());
      }
      if (parts.length) return parts.join('\n\n');

      // No content — try next model
      lastErr = new Error(\`Empty response from \${name}\`);
      continue;
    } catch (e) {
      if (isModelAvailabilityError(e)) { lastErr = e; continue; }
      lastErr = e;
      continue;
    }
  }

  throw new Error('The AI failed to generate a text response. ' + (lastErr?.message || ''));
}
TS

# Ensure target dir exists
mkdir -p "$(dirname "$TARGET")"

# Atomic replace
echo "📦 Installing to $TARGET"
mv "$TMP" "$TARGET"

# Remove backups
echo "🧹 Removing .bak* files…"
find . -type f \( -name '*.bak' -o -name '*.bak-*' -o -name '*.bak2' -o -name '*.bak.*' \) -print -delete || true

echo "✅ Done."
