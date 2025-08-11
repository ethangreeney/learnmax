// src/lib/ai.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

/**
 * Primary/default model, preferring explicitly configured OpenAI model
 * if present, otherwise falling back to configured Gemini model, and then
 * a sensible Gemini default. This value is only used when a caller doesn't
 * pass an explicit preferredModel.
 */
export const PRIMARY_MODEL =
  process.env.OPENAI_MODEL?.trim() ||
  process.env.GEMINI_MODEL?.trim() ||
  'gemini-2.5-flash';

// Global per-call AI timeout (each provider request)
const AI_MODEL_TIMEOUT_MS: number =
  Number(process.env.AI_MODEL_TIMEOUT_MS || '') || 15000;

function withTimeout<T>(p: Promise<T>, ms: number, label?: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error((label ? label + ' ' : '') + 'timeout')),
        ms
      )
    ),
  ]);
}

// Lazy-init clients so we don't require both providers to be configured.
let googleClient: GoogleGenerativeAI | null = null;
let openaiClient: OpenAI | null = null;

function getGoogleClient(): GoogleGenerativeAI {
  if (!googleClient) {
    const key = process.env.GOOGLE_API_KEY;
    if (!key)
      throw new Error('GOOGLE_API_KEY is not set. Add it to .env.local.');
    googleClient = new GoogleGenerativeAI(key);
  }
  return googleClient;
}

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const key = process.env.OPENAI_API_KEY;
    if (!key)
      throw new Error('OPENAI_API_KEY is not set. Add it to .env.local.');
    openaiClient = new OpenAI({ apiKey: key });
  }
  return openaiClient;
}

function isOpenAIModel(name: string | undefined): boolean {
  if (!name) return false;
  const n = name.trim().toLowerCase();
  return n.startsWith('gpt-') || n.startsWith('openai:');
}

function normalizeModelId(name: string): string {
  // Allow an explicit provider prefix like "openai:gpt-5"
  const idx = name.indexOf(':');
  return idx > -1 ? name.slice(idx + 1) : name;
}

function replaceDeprecatedModelName(name: string): string {
  const raw = name.trim();
  const normalized = normalizeModelId(raw).toLowerCase();
  if (normalized.startsWith('gpt-5-mini')) {
    return raw.replace(/^(?:openai:)?gpt-5-mini/i, 'gpt-5');
  }
  return raw;
}

// All current models should support streaming; remove special-cases
// No special-case model handling needed

function tryParseJson(s: string): any | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function extractFromCodeFence(text: string): string | null {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return m ? m[1].trim() : null;
}

function extractFirstJSONObject(text: string): string | null {
  let depth = 0,
    start = -1,
    inString = false,
    esc = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === '\\') {
        esc = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
      continue;
    }
    if (ch === '}') {
      if (depth > 0 && --depth === 0 && start >= 0)
        return text.slice(start, i + 1);
    }
  }
  return null;
}

const L = process.env.LOG_AI === '1';
const log = (...a: any[]) => {
  if (L) console.log('[ai]', ...a);
};

function buildFallbackList(preferredModel?: string): string[] {
  const list: string[] = [];
  const base = replaceDeprecatedModelName(
    preferredModel?.trim() || PRIMARY_MODEL
  );
  list.push(base);
  const hasOpenAI = Boolean(
    process.env.OPENAI_API_KEY && String(process.env.OPENAI_API_KEY).trim()
  );
  const hasGemini = Boolean(
    process.env.GOOGLE_API_KEY && String(process.env.GOOGLE_API_KEY).trim()
  );
  if (isOpenAIModel(base) && hasOpenAI) {
    // Prefer OpenAI; no mini fallback
    // Always include Gemini fallbacks to ensure graceful degradation when OpenAI is unavailable
    if (hasGemini) {
      list.push('gemini-2.5-flash-lite');
      list.push('gemini-2.0-flash');
      list.push('gemini-2.5-pro');
      list.push('gemini-2.0-pro');
    }
  } else {
    // Gemini fallbacks
    // Prefer lower-latency Flash variants first
    if (hasGemini) {
      list.push('gemini-2.5-flash-lite');
      list.push('gemini-2.0-flash');
    }
    // Keep Pro variants last as a strict fallback
    if (hasGemini) {
      list.push('gemini-2.5-pro');
      list.push('gemini-2.0-pro');
    }
    // If OpenAI is configured but base isn't OpenAI, skip mini cross-provider fallback
  }
  return Array.from(new Set(list));
}

async function generateTextWithGemini(
  prompt: string,
  modelName: string
): Promise<string> {
  const client = getGoogleClient();
  const model = client.getGenerativeModel({ model: modelName });
  const result = await withTimeout(
    model.generateContent(prompt),
    AI_MODEL_TIMEOUT_MS,
    `gemini:${modelName}`
  );
  const text = result.response?.text?.();
  if (text && text.trim()) return text;
  const parts: string[] = [];
  const candidates = (result.response as any)?.candidates ?? [];
  for (const c of candidates) {
    const p = c?.content?.parts ?? [];
    for (const part of p)
      if (typeof part?.text === 'string' && part.text.trim())
        parts.push(part.text.trim());
  }
  if (parts.length) return parts.join('\n\n');
  throw new Error(`Empty response from ${modelName}`);
}

async function generateTextWithOpenAI(
  prompt: string,
  modelName: string
): Promise<string> {
  const openai = getOpenAIClient();
  const model = normalizeModelId(modelName);
  const params: any = {
    model,
    messages: [{ role: 'user', content: prompt }],
  };
  params.temperature = 0.2;
  const completion = await withTimeout(
    openai.chat.completions.create(params),
    AI_MODEL_TIMEOUT_MS,
    `openai:${model}`
  );
  const content = completion.choices?.[0]?.message?.content || '';
  if (content && content.trim()) return content;
  throw new Error(`Empty response from ${model}`);
}

export async function generateText(
  prompt: string,
  preferredModel?: string
): Promise<string> {
  const names = buildFallbackList(preferredModel);
  let lastErr: any;
  for (const name of names) {
    try {
      const t = isOpenAIModel(name)
        ? await generateTextWithOpenAI(prompt, name)
        : await generateTextWithGemini(prompt, name);
      log('ok', name, t.length);
      return t;
    } catch (e: any) {
      lastErr = e;
      continue;
    }
  }
  throw new Error(
    'The AI returned an empty response. ' + (lastErr?.message || '')
  );
}

export async function generateJSON(
  prompt: string,
  preferredModel?: string
): Promise<any> {
  const names = buildFallbackList(preferredModel);
  let lastErr: any;
  for (const name of names) {
    try {
      if (isOpenAIModel(name)) {
        const openai = getOpenAIClient();
        const model = normalizeModelId(name);
        const params: any = {
          model,
          messages: [{ role: 'user', content: prompt }],
        };
        params.temperature = 0;
        params.response_format = { type: 'json_object' };
        const completion = await withTimeout(
          openai.chat.completions.create(params),
          AI_MODEL_TIMEOUT_MS,
          `openai:${model}`
        );
        const text = completion.choices?.[0]?.message?.content || '';
        if (text && text.trim()) {
          const parsed = tryParseJson(text);
          if (parsed !== null) return parsed;
        }
        lastErr = new Error(`Empty/invalid JSON from ${model}`);
        continue;
      } else {
        const client = getGoogleClient();
        const model = client.getGenerativeModel({
          model: name,
          generationConfig: { responseMimeType: 'application/json' },
        });
        const result = await withTimeout(
          model.generateContent(prompt),
          AI_MODEL_TIMEOUT_MS,
          `gemini:${name}`
        );
        const text = result.response?.text?.();
        if (text && text.trim()) {
          const direct = tryParseJson(text);
          if (direct !== null) return direct;
          const fenced = extractFromCodeFence(text);
          if (fenced) {
            const p = tryParseJson(fenced);
            if (p !== null) return p;
          }
          const obj = extractFirstJSONObject(text);
          if (obj) {
            const p = tryParseJson(obj);
            if (p !== null) return p;
          }
        }
        const parts: string[] = [];
        const candidates = (result.response as any)?.candidates ?? [];
        for (const c of candidates) {
          const p = c?.content?.parts ?? [];
          for (const part of p)
            if (typeof part?.text === 'string' && part.text.trim())
              parts.push(part.text.trim());
        }
        for (const p of parts) {
          const direct = tryParseJson(p);
          if (direct !== null) return direct;
          const fenced = extractFromCodeFence(p);
          if (fenced) {
            const pf = tryParseJson(fenced);
            if (pf !== null) return pf;
          }
          const obj = extractFirstJSONObject(p);
          if (obj) {
            const pb = tryParseJson(obj);
            if (pb !== null) return pb;
          }
        }
        lastErr = new Error(`Empty/invalid JSON from ${name}`);
        continue;
      }
    } catch (e: any) {
      lastErr = e;
      continue;
    }
  }
  throw new Error(
    'The AI failed to generate JSON. ' + (lastErr?.message || '')
  );
}

/**
 * Stream text chunks from the model as they are generated.
 * Yields incremental text segments (may be partial tokens or sentences).
 */
export async function* streamTextChunks(
  prompt: string,
  preferredModel?: string
): AsyncGenerator<string, void, void> {
  const names = buildFallbackList(preferredModel);
  let lastErr: any;

  for (const name of names) {
    try {
      if (isOpenAIModel(name)) {
        const openai = getOpenAIClient();
        const model = normalizeModelId(name);
        // All OpenAI models: request streamed chat completions
        const params: any = {
          model,
          messages: [{ role: 'user', content: prompt }],
          stream: true,
        };
        params.temperature = 0.2;
        const stream: any = await openai.chat.completions.create(params);
        let yielded = false;
        for await (const part of stream) {
          const delta: string | undefined = part?.choices?.[0]?.delta?.content;
          if (delta && delta.trim()) {
            yield delta;
            yielded = true;
          }
        }
        if (!yielded) {
          // Fallback to non-streaming single shot
          const text = await generateText(prompt, name);
          if (text) {
            yield text;
          }
        }
        return;
      } else {
        const client = getGoogleClient();
        const model = client.getGenerativeModel({ model: name });
        const result: any = await (model as any).generateContentStream(prompt);
        if (
          !result?.stream ||
          typeof result.stream[Symbol.asyncIterator] !== 'function'
        ) {
          const text = await generateText(prompt, name);
          if (text) {
            yield text;
            return;
          }
          continue;
        }
        for await (const chunk of result.stream) {
          try {
            const textPart =
              typeof chunk?.text === 'function' ? chunk.text() : '';
            if (textPart && textPart.trim()) {
              yield textPart;
            }
          } catch {}
        }
        return;
      }
    } catch (e: any) {
      lastErr = e;
      continue;
    }
  }
  throw new Error(
    'The AI failed to stream a response. ' + (lastErr?.message || '')
  );
}
