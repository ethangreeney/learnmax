import OpenAI from 'openai';

export const PRIMARY_MODEL = process.env.OPENAI_MODEL?.trim() || 'gpt-5.6-luna';

type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
const configuredEffort = process.env.OPENAI_REASONING_EFFORT?.trim();
export const REASONING_EFFORT: ReasoningEffort =
  configuredEffort === 'none' ||
  configuredEffort === 'low' ||
  configuredEffort === 'high' ||
  configuredEffort === 'xhigh' ||
  configuredEffort === 'max'
    ? configuredEffort
    : 'medium';

let client: OpenAI | null = null;

function openai(): OpenAI {
  if (client) return client;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set. Add it to .env.local.');
  }

  client = new OpenAI({ apiKey });
  return client;
}

function tryParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractFirstJsonObject(value: string): string | null {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < value.length; index++) {
    const char = value[index];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      if (depth === 0) start = index;
      depth++;
    } else if (char === '}' && depth > 0 && --depth === 0 && start >= 0) {
      return value.slice(start, index + 1);
    }
  }

  return null;
}

function parseJsonResponse(value: string): unknown {
  const direct = tryParseJson(value);
  if (direct !== null) return direct;

  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) {
    const parsed = tryParseJson(fenced);
    if (parsed !== null) return parsed;
  }

  const object = extractFirstJsonObject(value);
  if (object) {
    const parsed = tryParseJson(object);
    if (parsed !== null) return parsed;
  }

  throw new Error('AI returned an invalid JSON response.');
}

function baseRequest(system?: string) {
  return {
    model: PRIMARY_MODEL,
    reasoning: { effort: REASONING_EFFORT },
    store: false,
    ...(system ? { instructions: system } : {}),
  } as const;
}

export async function generateText(
  prompt: string,
  _preferredModel?: string,
  system?: string
): Promise<string> {
  const response = await openai().responses.create({
    ...baseRequest(system),
    input: prompt,
  });
  const text = response.output_text.trim();

  if (!text) throw new Error('AI returned an empty response.');
  return text;
}

export async function generateJSON(
  prompt: string,
  _preferredModel?: string,
  system?: string
): Promise<any> {
  const response = await openai().responses.create({
    ...baseRequest(system),
    input: prompt,
    text: { format: { type: 'json_object' } },
  });

  return parseJsonResponse(response.output_text);
}

export async function generateJSONFromPdf(
  pdf: Buffer | Uint8Array,
  filename: string,
  prompt: string,
  system?: string
): Promise<any> {
  const response = await openai().responses.create({
    ...baseRequest(system),
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_file',
            filename: filename || 'upload.pdf',
            file_data: `data:application/pdf;base64,${Buffer.from(pdf).toString('base64')}`,
          },
          { type: 'input_text', text: prompt },
        ],
      },
    ],
    text: { format: { type: 'json_object' } },
  });

  return parseJsonResponse(response.output_text);
}

export async function* streamTextChunks(
  prompt: string,
  _preferredModel?: string,
  system?: string
): AsyncGenerator<string> {
  const stream = await openai().responses.create({
    ...baseRequest(system),
    input: prompt,
    stream: true,
  });

  let buffer = '';
  let receivedText = false;
  const boundary = /(?<=\S[.!?])\s+(?=[A-Z0-9("\[])/;
  const listBoundary = /\n(?=\* |\d+\. )/;
  const paragraphBoundary = /\n{2,}/;
  const maxChunkLength = 600;

  function* drain(final = false): Generator<string> {
    while (true) {
      let splitAt = -1;

      for (const pattern of [paragraphBoundary, listBoundary, boundary]) {
        const match = buffer.match(pattern);
        if (match) {
          splitAt = match.index! + match[0].length;
          break;
        }
      }

      if (splitAt < 0 && buffer.length >= maxChunkLength && !final) {
        const lastSpace = buffer.lastIndexOf(' ', maxChunkLength);
        splitAt = lastSpace > 0 ? lastSpace + 1 : maxChunkLength;
      }

      if (splitAt < 0) break;

      const output = buffer.slice(0, splitAt);
      buffer = buffer.slice(splitAt);
      if (output.trim()) yield output;
    }

    if (final && buffer.trim()) {
      const output = buffer;
      buffer = '';
      yield output;
    }
  }

  for await (const event of stream) {
    if (event.type !== 'response.output_text.delta' || !event.delta) continue;

    receivedText = true;
    buffer += event.delta;
    yield* drain();
  }

  yield* drain(true);
  if (!receivedText) throw new Error('AI returned an empty response.');
}
