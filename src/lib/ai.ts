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
  'gemini-2.5-flash-lite';

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
  // Force a single, fixed model everywhere
  return ['gemini-2.5-flash-lite'];
}

async function generateTextWithGemini(
  prompt: string,
  modelName: string
): Promise<string> {
  const client = getGoogleClient();
  const gc: any = {};
  const temp = Number(process.env.AI_TEXT_TEMPERATURE || '0.2');
  if (Number.isFinite(temp)) gc.temperature = temp;
  const mx = Number(process.env.AI_TEXT_MAX_TOKENS || '800');
  if (Number.isFinite(mx) && mx > 0) gc.maxOutputTokens = mx;
  const topP = Number(process.env.AI_TOP_P || '');
  if (Number.isFinite(topP) && topP > 0) gc.topP = topP;
  const seed = Number(process.env.AI_SEED || '');
  if (Number.isFinite(seed) && seed > 0) gc.randomSeed = seed;
  const model = client.getGenerativeModel({ model: modelName, generationConfig: gc });
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
  modelName: string,
  system?: string
): Promise<string> {
  const openai = getOpenAIClient();
  const model = normalizeModelId(modelName);
  const messages: any[] = system
    ? [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ]
    : [{ role: 'user', content: prompt }];
  const params: any = { model, messages };
  params.temperature = Number(process.env.AI_TEXT_TEMPERATURE || '0.2');
  const mx = Number(process.env.AI_TEXT_MAX_TOKENS || '800');
  if (mx > 0) params.max_tokens = mx;
  const seed = Number(process.env.AI_SEED || '') || undefined;
  if (seed) params.seed = seed;
  const topP = Number(process.env.AI_TOP_P || '') || undefined;
  if (topP) params.top_p = topP;
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
  preferredModel?: string,
  system?: string
): Promise<string> {
  const names = buildFallbackList(preferredModel);
  let lastErr: any;
  for (const name of names) {
    try {
      const t = isOpenAIModel(name)
        ? await generateTextWithOpenAI(prompt, name, system)
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
  preferredModel?: string,
  system?: string
): Promise<any> {
  const names = buildFallbackList(preferredModel);
  let lastErr: any;
  for (const name of names) {
    try {
      if (isOpenAIModel(name)) {
        const openai = getOpenAIClient();
        const model = normalizeModelId(name);
        const messages: any[] = system
          ? [
              { role: 'system', content: system },
              { role: 'user', content: prompt },
            ]
          : [{ role: 'user', content: prompt }];
        const params: any = { model, messages };
        params.temperature = 0;
        const mx = Number(process.env.AI_JSON_MAX_TOKENS || '1500');
        if (mx > 0) params.max_tokens = mx;
        const seed = Number(process.env.AI_SEED || '') || undefined;
        if (seed) params.seed = seed;
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
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0,
          },
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
  preferredModel?: string,
  system?: string
): AsyncGenerator<string, void, void> {
  const names = buildFallbackList(preferredModel);
  let lastErr: any;

  for (const name of names) {
    try {
      if (isOpenAIModel(name)) {
        const openai = getOpenAIClient();
        const model = normalizeModelId(name);
        // All OpenAI models: request streamed chat completions
        const messages: any[] = system
          ? [
              { role: 'system', content: system },
              { role: 'user', content: prompt },
            ]
          : [{ role: 'user', content: prompt }];
        const params: any = { model, messages, stream: true };
        params.temperature = Number(
          process.env.AI_TEXT_TEMPERATURE || '0.2'
        );
        const mx = Number(process.env.AI_TEXT_MAX_TOKENS || '800');
        if (mx > 0) params.max_tokens = mx;
        const seed = Number(process.env.AI_SEED || '') || undefined;
        if (seed) params.seed = seed;
        const topP = Number(process.env.AI_TOP_P || '') || undefined;
        if (topP) params.top_p = topP;
        const stream: any = await openai.chat.completions.create(params);
        let yielded = false;
        for await (const part of stream) {
          const delta: string | undefined = part?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string') {
            yield delta;
            yielded = true;
          }
        }
        if (!yielded) {
          // Fallback to non-streaming single shot
          const text = await generateText(prompt, name, system);
          if (text) {
            yield text;
          }
        }
        return;
      } else {
        const client = getGoogleClient();
        const gc: any = {};
        const temp = Number(process.env.AI_TEXT_TEMPERATURE || '0.2');
        if (Number.isFinite(temp)) gc.temperature = temp;
        const mx = Number(process.env.AI_TEXT_MAX_TOKENS || '800');
        if (Number.isFinite(mx) && mx > 0) gc.maxOutputTokens = mx;
        const topP = Number(process.env.AI_TOP_P || '');
        if (Number.isFinite(topP) && topP > 0) gc.topP = topP;
        const seed = Number(process.env.AI_SEED || '');
        if (Number.isFinite(seed) && seed > 0) gc.randomSeed = seed;
        const model = client.getGenerativeModel({ model: name, generationConfig: gc });
        const result: any = await (model as any).generateContentStream(prompt);
        if (
          !result?.stream ||
          typeof result.stream[Symbol.asyncIterator] !== 'function'
        ) {
          const text = await generateText(prompt, name, system);
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
            if (typeof textPart === 'string') {
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
