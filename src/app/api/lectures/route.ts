import { NextRequest, NextResponse } from 'next/server';
import pdf from 'pdf-extraction';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { generateJSON, generateText } from '@/lib/ai';
import { isSessionWithUser } from '@/lib/session-utils';

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export const runtime = 'nodejs';
export const maxDuration = 60;

type BreakdownSubtopic = {
  title: string;
  importance: string;   // 'high' | 'medium' | 'low'
  difficulty: number;   // 1..3
  overview?: string;
};
type Breakdown = {
  topic: string;
  subtopics: BreakdownSubtopic[];
};

type QuizQuestion = {
  prompt: string;
  options: string[];
  answerIndex: number;
  explanation: string;
  subtopicTitle?: string;
};
type QuizOut = { questions: QuizQuestion[] };

// --- Helpers: shape guards & fallbacks --------------------------------------

function sanitizeDbText(s: string): string {
  // Postgres TEXT cannot contain NUL (0x00). Remove any null bytes.
  return (s || '').replace(/\u0000/g, '');
}

function normalizeExtractedText(s: string): string {
  const collapsed = (s || '').replace(/\s{2,}/g, ' ').trim();
  return sanitizeDbText(collapsed);
}

function normImportance(v: unknown): 'high'|'medium'|'low' {
  const s = String(v || '').toLowerCase();
  return s === 'high' || s === 'low' ? (s as any) : 'medium';
}
function clampDifficulty(v: unknown): 1|2|3 {
  const n = Number(v);
  if (n <= 1) return 1;
  if (n >= 3) return 3;
  return 2;
}
function clip(s: string, max = 240): string {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

function sanitizeBreakdown(raw: any, text: string): Breakdown {
  const topic =
    typeof raw?.topic === 'string' && raw.topic.trim()
      ? raw.topic.trim()
      : 'Untitled';

  let subs: BreakdownSubtopic[] = [];
  if (Array.isArray(raw?.subtopics)) {
    subs = raw.subtopics
      .map((s: any) => {
        const title =
          typeof s?.title === 'string' && s.title.trim()
            ? s.title.trim()
            : '';
        if (!title) return null;
        return {
          title,
          importance: normImportance(s?.importance),
          difficulty: clampDifficulty(s?.difficulty),
          overview:
            typeof s?.overview === 'string' && s.overview.trim()
              ? clip(s.overview, 500)
              : undefined,
        } as BreakdownSubtopic;
      })
      .filter(Boolean) as BreakdownSubtopic[];
  }

  // Fallback: at least one subtopic
  if (subs.length === 0) {
    const firstChunk = clip(text, 500);
    subs = [
      {
        title: topic !== 'Untitled' ? `${topic} — Overview` : 'Overview',
        importance: 'high',
        difficulty: 1,
        overview: firstChunk || 'Overview of the provided content.',
      },
    ];
  }

  return { topic, subtopics: subs };
}

function isGoodQuestion(q: any): q is QuizQuestion {
  return (
    q &&
    typeof q.prompt === 'string' &&
    Array.isArray(q.options) &&
    q.options.length === 4 &&
    typeof q.answerIndex === 'number' &&
    q.answerIndex >= 0 &&
    q.answerIndex < 4 &&
    typeof q.explanation === 'string'
  );
}

function fallbackQuestions(subtopics: BreakdownSubtopic[]): QuizQuestion[] {
  // Cheap, deterministic questions that still tie to the breakdown.
  // One per subtopic.
  return subtopics.map((s) => {
    const correct = String(s.difficulty);
    const opts = ['1', '2', '3', 'Not specified'];
    const answerIndex =
      correct === '1' ? 0 : correct === '2' ? 1 : correct === '3' ? 2 : 3;
    return {
      prompt: `What difficulty was assigned to "${s.title}"?`,
      options: opts,
      answerIndex,
      explanation: `The breakdown labeled "${s.title}" with difficulty ${s.difficulty}.`,
      subtopicTitle: s.title,
    };
  });
}

function fallbackPairForSubtopic(s: BreakdownSubtopic): [QuizQuestion, QuizQuestion] {
  // Q1: difficulty (existing logic)
  const dCorrect = String(s.difficulty);
  const dOpts = ['1', '2', '3', 'Not specified'];
  const dIdx = dCorrect === '1' ? 0 : dCorrect === '2' ? 1 : dCorrect === '3' ? 2 : 3;
  const q1: QuizQuestion = {
    prompt: `What difficulty was assigned to "${s.title}"?`,
    options: dOpts,
    answerIndex: dIdx,
    explanation: `The breakdown labeled "${s.title}" with difficulty ${s.difficulty}.`,
    subtopicTitle: s.title,
  };
  // Q2: importance
  const imp = (s.importance || 'medium').toLowerCase();
  const iOpts = ['high', 'medium', 'low', 'Not specified'];
  const iIdx = imp === 'high' ? 0 : imp === 'medium' ? 1 : imp === 'low' ? 2 : 3;
  const q2: QuizQuestion = {
    prompt: `What is the importance label for "${s.title}"?`,
    options: iOpts,
    answerIndex: iIdx,
    explanation: `The breakdown marked "${s.title}" with importance "${s.importance}".`,
    subtopicTitle: s.title,
  };
  return [q1, q2];
}

function sanitizeQuiz(raw: any, subtopics: BreakdownSubtopic[]): QuizOut {
  let items: QuizQuestion[] = [];
  if (Array.isArray(raw?.questions)) {
    items = raw.questions.filter(isGoodQuestion);
  }
  if (items.length === 0) {
    items = fallbackQuestions(subtopics);
  }
  return { questions: items };
}

async function selectTopSubtopics(
  subtopics: BreakdownSubtopic[],
  preferredModel: string | undefined,
  maxCount: number,
): Promise<BreakdownSubtopic[]> {
  if (subtopics.length <= maxCount) return subtopics;
  const payload = subtopics.map((s, idx) => ({ index: idx, title: s.title, overview: s.overview || '' }));
  const prompt = `
You are helping design a concise lecture from a larger document.

Below is an ORDERED list of candidate subtopics extracted from the ENTIRE document (from start to end). Choose exactly ${maxCount} indices that:
- Maximize total coverage of the entire document (include early, middle, and late content)
- Favor information-dense and foundational concepts
- Avoid redundancy; aim for diverse topics that together cover the most material

Return ONLY JSON of the form: { "indices": [i0, i1, ...] }
Use 0-based indices, all unique, length exactly ${maxCount}.

CANDIDATES:
${JSON.stringify(payload, null, 2)}
`;
  try {
    const out = await generateJSON(prompt, preferredModel);
    const indices: number[] = Array.isArray(out?.indices) ? out.indices.map((n: any) => Number(n)).filter((n: any) => Number.isInteger(n) && n >= 0 && n < subtopics.length) : [];
    const uniq = Array.from(new Set(indices)).slice(0, maxCount);
    if (uniq.length === 0) throw new Error('no indices');
    // Preserve original document order by sorting selected indices ascending
    uniq.sort((a, b) => a - b);
    return uniq.map(i => subtopics[i]);
  } catch {
    // Fallback: spread picks across the array for coverage
    const step = subtopics.length / maxCount;
    const picks: number[] = [];
    for (let k = 0; k < maxCount; k++) picks.push(Math.floor(k * step));
    const uniq = Array.from(new Set(picks)).slice(0, maxCount);
    return uniq.map(i => subtopics[i]).filter(Boolean);
  }
}

async function generateSectionMarkdowns(
  lectureTitle: string,
  allText: string,
  subtopics: BreakdownSubtopic[],
  preferredModel?: string,
): Promise<Record<string, string>> {
  const clip = (s: string, max = 10000) => {
    const t = (s || '').trim();
    return t.length > max ? t.slice(0, max) : t;
  };
  // Lightweight relevancy selection to shrink context per subtopic
  const STOP = new Set(
    'the,be,to,of,and,a,in,that,have,i,it,for,not,on,with,he,as,you,do,at,by,from,or,an,are,is,was,were,which,one,all,this,can,will,if,about,into,than,then,there,also,other,more,most,each'.split(',')
  );
  const tokenize = (s: string) => (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w && w.length >= 3 && !STOP.has(w));
  const paragraphs = (allText || '')
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean);
  const selectRelevantContext = (title: string, overview: string, maxChars = 4000): string => {
    if (!paragraphs.length) return clip(allText, maxChars);
    const queryTerms = new Set([...tokenize(title), ...tokenize(overview)]);
    if (queryTerms.size === 0) return clip(allText, maxChars);
    const scores: Array<{ idx: number; score: number; text: string }> = [];
    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i];
      const toks = tokenize(p);
      let sc = 0;
      for (const t of toks) if (queryTerms.has(t)) sc++;
      // small bonus for adjacency to previous relevant paragraph
      if (sc && i > 0) {
        const prevToks = tokenize(paragraphs[i - 1]);
        for (const t of prevToks) if (queryTerms.has(t)) { sc += 0.3; break; }
      }
      if (sc > 0) scores.push({ idx: i, score: sc, text: p });
    }
    if (!scores.length) return clip(allText, maxChars);
    scores.sort((a, b) => b.score - a.score);
    const picked: string[] = [];
    const used = new Set<number>();
    let total = 0;
    for (const s of scores) {
      if (used.has(s.idx)) continue;
      const chunkParts: string[] = [];
      // include prev, current, next for continuity
      for (const j of [s.idx - 1, s.idx, s.idx + 1]) {
        if (j >= 0 && j < paragraphs.length && !used.has(j)) {
          const part = paragraphs[j];
          const addLen = part.length + 2;
          if (total + addLen > maxChars && picked.length) break;
          used.add(j);
          chunkParts.push(part);
          total += addLen;
        }
      }
      if (chunkParts.length) picked.push(chunkParts.join('\n\n'));
      if (total >= maxChars) break;
    }
    return picked.join('\n\n\n');
  };
  // Run all subtopics in parallel (limit equals number of subtopics)
  const limit = Math.max(1, subtopics.length);
  let inFlight = 0;
  const queue: Array<() => Promise<void>> = [];
  const result: Record<string, string> = {};

  const runNext = async (): Promise<void> => {
    if (!queue.length) return;
    if (inFlight >= limit) return;
    const task = queue.shift()!;
    inFlight++;
    try { await task(); } finally { inFlight--; await runNext(); }
  };

  const tasks = subtopics.map((s) => async () => {
    const title = s.title;
    const overview = s.overview || '';
    const prompt = [
      `You are writing ONE section of a lecture. Ground it in the document.`,
      `Lecture: "${lectureTitle}"`,
      `Subtopic: "${title}"`,
      `Overview: ${overview}`,
      `Write 180–320 words of clean Markdown.`,
      `Use short paragraphs and bullet lists where helpful.`,
      `Start directly with content. No preamble. No H1.`,
      `Focus on definitions, theorems, algorithms, and examples that appear in the document; avoid generic use cases unless present.`,
      `---`,
      `DOCUMENT EXCERPTS (relevant slices only):`,
      selectRelevantContext(title, overview, 3000),
    ].join('\n');
    const mdRaw = await generateText(prompt, preferredModel);
    result[title.trim().toLowerCase()] = sanitizeDbText(mdRaw);
  });

  // Enqueue tasks and run with concurrency
  for (const t of tasks) {
    queue.push(t);
    void runNext();
  }
  // Wait for all to finish
  while (queue.length || inFlight) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 25));
  }
  return result;
}

// --- Route -------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!isSessionWithUser(session)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }
    const userId = session.user.id;

    const contentType = req.headers.get('content-type') || '';
    let text = '';
    // Keep a copy of the raw PDF bytes when available so we can extract text
    // as a reliable fallback (and to ground chat later).
    let pdfBuffer: Buffer | null = null;
    let approxPages = 0;

    let preferredModel: string | undefined = undefined;
    let visionCandidate: File | null = null;
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      const m = form.get('model');
      if (typeof m === 'string' && m.trim()) preferredModel = m.trim();
      if (!file || !(file instanceof File)) {
        return NextResponse.json({ error: 'No file provided. Please upload a single PDF.' }, { status: 400 });
      }
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        return NextResponse.json({ error: 'Invalid file type. Only PDF files are accepted.' }, { status: 400 });
      }
      // Prefer Vision first for PDFs; keep file for later
      visionCandidate = file as File;
      try {
        const arr = await (file as File).arrayBuffer();
        pdfBuffer = Buffer.from(arr);
      } catch {}
    } else if (contentType.includes('application/json')) {
      const body = await req.json();
      if (typeof body?.model === 'string' && body.model.trim()) preferredModel = body.model.trim();
      const blobUrl = String(body?.blobUrl || '').trim();
      const content = String(body?.content || '').trim();
      if (blobUrl) {
        // Stream PDF from Blob URL, prefer vision
        const resp = await fetch(blobUrl);
        if (!resp.ok) return NextResponse.json({ error: 'Could not fetch blob' }, { status: 400 });
        const arr = Buffer.from(await resp.arrayBuffer());
        pdfBuffer = arr;
        // Route to vision path via temp File shim
        visionCandidate = new File([arr], 'upload.pdf', { type: 'application/pdf' }) as any;
      } else {
        text = sanitizeDbText(content);
        if (!text) return NextResponse.json({ error: 'Content is required.' }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: 'Unsupported content type.' }, { status: 415 });
    }

    // Try to extract text from PDF first (preferred grounding for large PDFs)
    if (!text && pdfBuffer) {
      try {
        const data: any = await pdf(pdfBuffer);
        approxPages = Number(data?.numpages || 0) || 0;
        const extracted = normalizeExtractedText(data.text || '');
        if (extracted) text = extracted;
      } catch {}
    }

    // Optional: vision path when OCR/text extraction is thin
    if (!text && visionCandidate) {
      try {
        const apiKey = process.env.GOOGLE_API_KEY;
        if (!apiKey) throw new Error('GOOGLE_API_KEY not set');
        const client = new GoogleGenerativeAI(apiKey);
        const files = new GoogleAIFileManager(apiKey);
        const buf = pdfBuffer || Buffer.from(await visionCandidate.arrayBuffer());
        const uploaded = await files.uploadFile(buf, { mimeType: 'application/pdf', displayName: (visionCandidate as any).name || 'upload.pdf' });
        let fileRec: any = uploaded.file;
        const tStart = Date.now();
        while (fileRec.state !== 'ACTIVE') {
          if (Date.now() - tStart > 45000) throw new Error('vision timeout');
          await new Promise((r) => setTimeout(r, 1200));
          fileRec = await files.getFile(fileRec.name);
        }
        const model = client.getGenerativeModel({ model: preferredModel || process.env.GEMINI_MODEL || 'gemini-2.5-flash' });
        const visionPrompt = [
          'Analyze this PDF (text + images).',
          'Return ONLY JSON with exactly this shape (no extra prose):',
          '{ "topic": string, "subtopics": [ { "title": string, "importance": "high"|"medium"|"low", "difficulty": 1|2|3, "overview": string } ] }',
          'Base your response strictly on the PDF content; do not invent unrelated topics.',
        ].join('\n');
        const res = await model.generateContent([
          { fileData: { fileUri: fileRec.uri, mimeType: 'application/pdf' } },
          { text: visionPrompt },
        ]);
        const out = res.response.text?.() || '';
        // Be tolerant of models that wrap JSON in text/code fences
        let parsed: any;
        try {
          parsed = JSON.parse(out);
        } catch {
          const fenced = out.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
          if (fenced) {
            try { parsed = JSON.parse(fenced); } catch {}
          }
          if (!parsed) {
            const objMatch = (() => {
              let depth = 0, start = -1, inStr = false, esc = false;
              for (let i = 0; i < out.length; i++) {
                const ch = out[i];
                if (inStr) { if (esc) { esc = false; continue; } if (ch === '\\') { esc = true; continue; } if (ch === '"') { inStr = false; } continue; }
                if (ch === '"') { inStr = true; continue; }
                if (ch === '{') { if (depth === 0) start = i; depth++; continue; }
                if (ch === '}') { if (depth > 0 && --depth === 0 && start >= 0) return out.slice(start, i + 1); }
              }
              return null;
            })();
            if (objMatch) {
              try { parsed = JSON.parse(objMatch); } catch {}
            }
          }
        }
        if (!parsed) throw new Error('Invalid JSON from vision');
        // Use parsed results as breakdown
        const bdFromVision = {
          topic: String(parsed?.topic || 'Untitled'),
          subtopics: Array.isArray(parsed?.subtopics) ? parsed.subtopics.map((s: any) => ({
            title: String(s?.title || ''),
            importance: String(s?.importance || 'medium'),
            difficulty: Number(s?.difficulty || 2),
            overview: String(s?.overview || ''),
          })) : []
        } as Breakdown;
        // Extract raw text (best-effort) for grounding chat/originalContent
        let extracted = '';
        try {
          const data: any = await pdf(pdfBuffer || buf);
          approxPages = Number(data?.numpages || approxPages || 0) || approxPages;
          extracted = normalizeExtractedText(data.text || '');
        } catch {}
        // 3) Persist directly, storing extracted text when available
        const originalContent = extracted || 'PDF (vision) upload';
        const lecture = await prisma.lecture.create({ data: { title: bdFromVision.topic || 'Untitled', originalContent: sanitizeDbText(originalContent), userId } });
        if (bdFromVision.subtopics.length) {
          // Cap to avoid long generation
          const subcaps = bdFromVision.subtopics.length > 12
            ? await selectTopSubtopics(bdFromVision.subtopics, preferredModel, 12)
            : bdFromVision.subtopics;
          // Generate explanations for each subtopic and persist
          const sectionMap = await generateSectionMarkdowns(bdFromVision.topic || 'Untitled', extracted, subcaps, preferredModel);
          await prisma.subtopic.createMany({
            data: subcaps.map((s, idx) => ({
              order: idx,
              title: s.title || `Section ${idx + 1}`,
              importance: s.importance,
              difficulty: s.difficulty,
              overview: s.overview || '',
              explanation: sectionMap[(s.title || '').trim().toLowerCase()] || null,
              lectureId: lecture.id,
            })),
          });
          // After subtopics exist, create initial quiz questions grounded in extracted text
          const created = await prisma.subtopic.findMany({ where: { lectureId: lecture.id }, orderBy: { order: 'asc' }, select: { id: true, title: true, overview: true } });
          const quizPromptV = `
You are an expert assessment writer. Create exactly ONE multiple-choice question per subtopic, grounded ONLY in the DOCUMENT CONTENT below.

Constraints:
- Use only facts present in the document. Do not invent.
- Include a short DIRECT quote (6–12 words) from the document in the explanation, in "double quotes".
- Exactly four options ["A","B","C","D"]. No prefixes.
- Each "subtopicTitle" must EXACTLY match one below.

Return ONLY ONE JSON object:
{
  "questions": [
    { "prompt": "string", "options": ["A","B","C","D"], "answerIndex": 0, "explanation": "string", "subtopicTitle": "string" }
  ]
}

DOCUMENT CONTENT (truncated):
${(extracted || '').slice(0, 8000)}

SUBTOPICS:
${JSON.stringify(created.map(s => ({ title: s.title, overview: s.overview })), null, 2)}
`.trim();
          try {
            const qzRawV = await generateJSON(quizPromptV, preferredModel);
            const qList: QuizQuestion[] = Array.isArray(qzRawV?.questions) ? (qzRawV.questions as any[]).filter(isGoodQuestion) : [];
            const quizDataV: Array<{ prompt: string; options: any; answerIndex: number; explanation: string; subtopicId: string; }> = [];
            for (let i = 0; i < created.length; i++) {
              const st = created[i];
              const q1 = qList[2 * i];
              const q2 = qList[2 * i + 1];
              if (isGoodQuestion(q1) && isGoodQuestion(q2)) {
                quizDataV.push(
                  { prompt: q1.prompt, options: q1.options as any, answerIndex: q1.answerIndex, explanation: q1.explanation, subtopicId: st.id },
                  { prompt: q2.prompt, options: q2.options as any, answerIndex: q2.answerIndex, explanation: q2.explanation, subtopicId: st.id },
                );
              } else {
                const [f1, f2] = fallbackPairForSubtopic(subcaps[i]);
                quizDataV.push(
                  { prompt: f1.prompt, options: f1.options as any, answerIndex: f1.answerIndex, explanation: f1.explanation, subtopicId: st.id },
                  { prompt: f2.prompt, options: f2.options as any, answerIndex: f2.answerIndex, explanation: f2.explanation, subtopicId: st.id },
                );
              }
            }
            if (quizDataV.length) await prisma.quizQuestion.createMany({ data: quizDataV });
          } catch {}
        }
        return NextResponse.json({ lectureId: lecture.id, debug: { model: preferredModel || process.env.GEMINI_MODEL || 'gemini-2.5-flash', usedVision: true } }, { status: 201 });
      } catch (e) {
        // If vision fails, continue to text-only path
      }
    }

    // If we still have no text but we do have the PDF bytes, extract text now.
    if (!text && pdfBuffer) {
      try {
        const data: any = await pdf(pdfBuffer);
        approxPages = Number(data?.numpages || approxPages || 0) || approxPages;
        const extracted = normalizeExtractedText(data.text || '');
        text = extracted;
      } catch {}
    }
    if (!text) {
      return NextResponse.json({ error: 'Could not extract text from the PDF. The file may only contain images.' }, { status: 422 });
    }

    // 1) Breakdown (robust)
    // Heuristic target subtopic count for coverage across the whole document
    const charLen = text.length;
    const targetByChars = Math.max(8, Math.min(80, Math.round(charLen / 4000) * 5));
    const targetByPages = approxPages ? Math.max(8, Math.min(80, Math.round(approxPages * 0.6))) : 0;
    const targetSubtopics = targetByPages || targetByChars;

    const breakdownPrompt = `
      You are an expert instructional designer. Create an exhaustive, sequential breakdown of the entire document below.

      Goals:
      - Cover ALL major sections and distinct concepts. Do not merge unrelated topics.
      - Preserve the original document order from start to finish.
      - Be concise but complete: each subtopic should map to a coherent portion of the document.
      - Aim for approximately ${targetSubtopics} subtopics given document length (pages ~ ${approxPages || 'unknown'}, chars ~ ${charLen}). Use up to 80 if needed.

      Return ONLY a single JSON object with exactly these keys:
      {
        "topic": "string",
        "subtopics": [
          {
            "title": "string",
            "importance": "high" | "medium" | "low",
            "difficulty": 1 | 2 | 3,
            "overview": "string"
          }
        ]
      }

      Document:
      ---
      ${text}
    `;
    const t0 = Date.now();
    const bdRaw = await generateJSON(breakdownPrompt, preferredModel);
    let bd = sanitizeBreakdown(bdRaw, text);
    // Select coverage-maximizing subtopics up to cap
    const MAX_SUBTOPICS = 12;
    if (bd.subtopics.length > MAX_SUBTOPICS) {
      const picked = await selectTopSubtopics(bd.subtopics, preferredModel, MAX_SUBTOPICS);
      bd = { ...bd, subtopics: picked };
    }

    // 2) Quiz (robust)
    const quizPrompt = `
      You are an expert assessment writer. Create exactly TWO multiple-choice questions per subtopic, grounded ONLY in the DOCUMENT CONTENT below.

      Constraints:
      - Use only facts present in the document. Do not invent.
      - Each question should match the scope of its subtopic overview.
      - Include a short DIRECT quote (6–12 words) from the document in the explanation, in "double quotes".
      - Exactly four options ["A","B","C","D"]. No prefixes.
      - Each "subtopicTitle" must EXACTLY match one below.
      - Return questions in the same order as the subtopics, with TWO consecutive questions for each subtopic.

      Return ONLY ONE JSON object:
      {
        "questions": [
          {
            "prompt": "string",
            "options": ["A","B","C","D"],
            "answerIndex": 0,
            "explanation": "string",
            "subtopicTitle": "string"
          }
        ]
      }

      DOCUMENT CONTENT (truncated for safety):
      ${clip(text, 8000)}

      SUBTOPICS (use each overview to focus the question):
      ${JSON.stringify(bd.subtopics.map(s => ({ title: s.title, overview: s.overview })), null, 2)}
    `.trim();
    const mid = Date.now();
    const qzRaw = await generateJSON(quizPrompt, preferredModel);
    const msBreakdown = mid - t0;
    const msQuiz = Date.now() - mid;
    const rawQuestions: QuizQuestion[] = Array.isArray(qzRaw?.questions) ? (qzRaw.questions as any[]).filter(isGoodQuestion) : [];

    // 3) Persist (non-interactive writes to avoid long-lived transaction issues)
    const lecture = await prisma.lecture.create({
      data: { title: bd.topic || 'Untitled', originalContent: sanitizeDbText(text), userId },
    });

    // Generate persistent section markdown for each subtopic
    const titleForLecture = bd.topic || 'Untitled';
    const sectionMap = await generateSectionMarkdowns(titleForLecture, text, bd.subtopics, preferredModel);

    // Insert subtopics with explanation content persisted
    await prisma.subtopic.createMany({
      data: bd.subtopics.map((s, idx) => ({
        order: idx,
        title: s.title,
        importance: s.importance,
        difficulty: s.difficulty,
        overview: s.overview || '',
        explanation: sectionMap[s.title.trim().toLowerCase()] || null,
        lectureId: lecture.id,
      })),
    });

    // Fetch inserted subtopics (ordered) and align questions by index for stable mapping (2 per subtopic)
    const subtopics = await prisma.subtopic.findMany({
      where: { lectureId: lecture.id },
      orderBy: { order: 'asc' },
      select: { id: true, title: true },
    });
    const quizData: Array<{ prompt: string; options: any; answerIndex: number; explanation: string; subtopicId: string; }> = [];
    for (let i = 0; i < subtopics.length; i++) {
      const st = subtopics[i];
      const q1 = rawQuestions[2 * i];
      const q2 = rawQuestions[2 * i + 1];
      if (isGoodQuestion(q1) && isGoodQuestion(q2)) {
        quizData.push(
          { prompt: q1.prompt, options: q1.options as any, answerIndex: q1.answerIndex, explanation: q1.explanation, subtopicId: st.id },
          { prompt: q2.prompt, options: q2.options as any, answerIndex: q2.answerIndex, explanation: q2.explanation, subtopicId: st.id },
        );
      } else {
        const [f1, f2] = fallbackPairForSubtopic(bd.subtopics[i]);
        quizData.push(
          { prompt: f1.prompt, options: f1.options as any, answerIndex: f1.answerIndex, explanation: f1.explanation, subtopicId: st.id },
          { prompt: f2.prompt, options: f2.options as any, answerIndex: f2.answerIndex, explanation: f2.explanation, subtopicId: st.id },
        );
      }
    }
    if (quizData.length) {
      await prisma.quizQuestion.createMany({ data: quizData });
    }

    return NextResponse.json({ lectureId: lecture.id, debug: { model: preferredModel || process.env.GEMINI_MODEL || 'default', msBreakdown, msQuiz } }, { status: 201 });
  } catch (e: any) {
    console.error('LECTURES_API_ERROR:', e?.stack || e?.message || e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: e?.status || 500 });
  }
}
