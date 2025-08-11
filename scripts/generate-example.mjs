#!/usr/bin/env node
/*
  Generates a complete demo lesson using Gemini 2.5 Pro and writes it to
  src/app/example/generated.ts so the example page can import static data
  without runtime generation.

  Requirements:
  - env GOOGLE_API_KEY must be set
  - pnpm i (dependencies already present in package.json)
*/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..');
const PROJECT = path.resolve(__dirname, '..');
const OUT_TS = path.resolve(PROJECT, 'src/app/example/generated.ts');

const API_KEY = process.env.GOOGLE_API_KEY || '';
if (!API_KEY) {
  console.error(
    'ERROR: GOOGLE_API_KEY is not set. Export GOOGLE_API_KEY and retry.'
  );
  process.exit(1);
}

const client = new GoogleGenerativeAI(API_KEY);
const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-pro';

function parseJsonLoose(text) {
  const t = String(text || '').trim();
  try {
    return JSON.parse(t);
  } catch {}
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) {
    try {
      return JSON.parse(fenced);
    } catch {}
  }
  // last resort: try to extract the first JSON object
  let depth = 0,
    start = -1,
    inStr = false,
    esc = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inStr) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === '\\') {
        esc = true;
        continue;
      }
      if (ch === '"') {
        inStr = false;
      }
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
      continue;
    }
    if (ch === '}') {
      if (depth > 0 && --depth === 0 && start >= 0) {
        const obj = t.slice(start, i + 1);
        try {
          return JSON.parse(obj);
        } catch {}
      }
    }
  }
  return null;
}

function clip(s, max = 10000) {
  const t = String(s || '').trim();
  return t.length > max ? t.slice(0, max) : t;
}

function slugify(title, fallback, index) {
  const base =
    String(title || fallback || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || `section-${index + 1}`;
  return base.length > 48 ? base.slice(0, 48) : base;
}

function sanitizeDbText(s) {
  return String(s || '').replace(/\u0000/g, '');
}

async function main() {
  const system = `You are an expert instructional designer. Create a complete, self-contained demo lesson about research-based optimized learning methods.

Return ONLY JSON with the following exact shape:
{
  "title": string,
  "subtopics": [
    {
      "title": string,
      "importance": "high"|"medium"|"low",
      "difficulty": 1|2|3,
      "overview": string,
      "explanation": string,  // 250–450 words, clean Markdown, no leading H1
      "questions": [
        { "prompt": string, "options": [string, string, string, string], "answerIndex": 0|1|2|3, "explanation": string },
        { "prompt": string, "options": [string, string, string, string], "answerIndex": 0|1|2|3, "explanation": string }
      ]
    }
  ]
}

Constraints:
- Topic: "Research-Based Optimized Learning Methods" (spacing, retrieval practice, interleaving, elaboration, metacognitive calibration, etc.)
- 12–14 subtopics total.
- Keep explanations grounded in mainstream cognitive science. Avoid speculative claims.
- Questions must be grounded in the subtopic explanation (not trivia), with exactly one correct option.
- No code fences, no extra commentary—JSON only.`;

  const gen = client.getGenerativeModel({ model: modelName });
  const res = await gen.generateContent({
    contents: [{ role: 'user', parts: [{ text: system }] }],
  });
  const raw = res?.response?.text?.() || '';
  const json = parseJsonLoose(raw);
  if (!json || !Array.isArray(json.subtopics) || !json.subtopics.length) {
    console.error(
      'Model did not return a valid JSON structure. Raw output:\n',
      clip(raw, 2000)
    );
    process.exit(2);
  }

  const title = String(
    json.title || 'Research-Based Optimized Learning Methods'
  );
  const subtopics = json.subtopics.slice(0, 14);
  const normalized = subtopics
    .map((s, idx) => {
      const stTitle = String(s?.title || '').trim() || `Section ${idx + 1}`;
      const imp = String(s?.importance || 'medium').toLowerCase();
      const difficulty = Number(s?.difficulty || 2);
      const overview = String(s?.overview || '').trim();
      const explanation = sanitizeDbText(String(s?.explanation || '').trim());
      const qs = Array.isArray(s?.questions) ? s.questions.slice(0, 2) : [];
      const questions = qs
        .map((q, j) => ({
          id: `${slugify(stTitle, '', idx)}-q${j + 1}`,
          prompt: String(q?.prompt || '').trim(),
          options: Array.isArray(q?.options)
            ? q.options.map((o) => String(o || '').trim()).slice(0, 4)
            : [],
          answerIndex: Number(q?.answerIndex ?? -1),
          explanation: String(q?.explanation || '').trim(),
        }))
        .filter(
          (q) =>
            q.prompt &&
            q.options.length === 4 &&
            q.answerIndex >= 0 &&
            q.answerIndex < 4
        );
      return {
        id: `ex-${idx + 1}-${slugify(stTitle, 'section', idx)}`,
        order: idx,
        title: stTitle,
        importance: imp.charAt(0).toUpperCase() + imp.slice(1),
        difficulty: difficulty < 1 ? 1 : difficulty > 3 ? 3 : difficulty,
        overview,
        explanation,
        mastered: false,
        questions,
      };
    })
    .filter((s) => s.title && s.explanation && Array.isArray(s.questions));

  if (normalized.length < 12) {
    console.error('Generated too few subtopics. Got', normalized.length);
    process.exit(3);
  }

  const obj = {
    id: 'example-lesson',
    title,
    originalContent:
      'Autogenerated by Gemini 2.5 Pro for demo purposes. All content is preloaded to avoid runtime generation.',
    subtopics: normalized,
  };

  const out =
    `// Auto-generated by scripts/generate-example.mjs\n` +
    `import type { LearnLecture } from '@/lib/shared/learn-types';\n` +
    `export const exampleLesson: LearnLecture = ${JSON.stringify(obj, null, 2)};\n`;

  fs.mkdirSync(path.dirname(OUT_TS), { recursive: true });
  fs.writeFileSync(OUT_TS, out, 'utf8');
  console.log('Wrote', path.relative(PROJECT, OUT_TS));
}

main().catch((e) => {
  console.error('Failed to generate example:', e?.message || e);
  process.exit(1);
});
