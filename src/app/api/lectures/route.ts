import { NextRequest, NextResponse } from 'next/server';
import pdf from 'pdf-extraction';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { generateJSON } from '@/lib/ai';
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
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const data = await pdf(buffer);
      text = (data.text || '').replace(/\s{2,}/g, ' ').trim();
      // If OCR failed or is too thin, keep a vision candidate
      if (!text || text.length < 200) {
        visionCandidate = file as File;
      }
    } else if (contentType.includes('application/json')) {
      const body = await req.json();
      text = (body?.content || '').toString();
      if (typeof body?.model === 'string' && body.model.trim()) preferredModel = body.model.trim();
      if (!text.trim()) {
        return NextResponse.json({ error: 'Content is required.' }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: 'Unsupported content type.' }, { status: 415 });
    }

    // Optional: vision path when OCR is thin
    if (!text && visionCandidate) {
      try {
        const apiKey = process.env.GOOGLE_API_KEY;
        if (!apiKey) throw new Error('GOOGLE_API_KEY not set');
        const client = new GoogleGenerativeAI(apiKey);
        const files = new GoogleAIFileManager(apiKey);
        const buf = Buffer.from(await visionCandidate.arrayBuffer());
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
          'Analyze this PDF (text + images). Return ONLY JSON with:',
          '{ "topic": string, "subtopics": [ { "title": string, "importance": "high"|"medium"|"low", "difficulty": 1|2|3, "overview": string } ] }'
        ].join('\n');
        const res = await model.generateContent([
          { fileData: { fileUri: fileRec.uri, mimeType: 'application/pdf' } },
          { text: visionPrompt },
        ]);
        const out = res.response.text?.() || '';
        const parsed = JSON.parse(out);
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
        // Fall through using bdFromVision instead of AI breakdown
        // 3) Persist directly
        const lecture = await prisma.lecture.create({ data: { title: bdFromVision.topic || 'Untitled', originalContent: 'PDF (vision) upload', userId } });
        if (bdFromVision.subtopics.length) {
          await prisma.subtopic.createMany({
            data: bdFromVision.subtopics.map((s, idx) => ({
              order: idx,
              title: s.title || `Section ${idx + 1}`,
              importance: s.importance,
              difficulty: s.difficulty,
              overview: s.overview || '',
              lectureId: lecture.id,
            })),
          });
        }
        return NextResponse.json({ lectureId: lecture.id, debug: { model: preferredModel || process.env.GEMINI_MODEL || 'gemini-2.5-flash', usedVision: true } }, { status: 201 });
      } catch (e) {
        // If vision fails, continue to text-only path
      }
    }

    // 1) Breakdown (robust)
    const breakdownPrompt = `
      As an expert instructional designer, analyze the following text and break it down into a structured learning path.

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

      ---
      ${text}
    `;
    const t0 = Date.now();
    const bdRaw = await generateJSON(breakdownPrompt, preferredModel);
    const bd = sanitizeBreakdown(bdRaw, text);

    // 2) Quiz (robust)
    const quizPrompt = `
You are an expert assessment writer. Create exactly ONE multiple-choice question per subtopic, grounded ONLY in the DOCUMENT CONTENT below.

DOMAIN: computer science / graph theory data structures.
STRICTLY DO NOT write about plants/botany (no fruit, flowers, trunks, leaves, shrubs, tropical, etc.).

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

Rules:
- The explanation MUST include one short DIRECT quote (6–12 words) from the document in "double quotes".
- Exactly four options, no letter/number prefixes.
- Each "subtopicTitle" must EXACTLY match a title below.
- No facts beyond the document.

DOCUMENT CONTENT (truncated for safety):
${clip(text, 5000)}

SUBTOPICS (use each overview to focus the question):
${JSON.stringify(bd.subtopics.map(s => ({ title: s.title, overview: s.overview })), null, 2)}
`.trim();
    const mid = Date.now();
    const qzRaw = await generateJSON(quizPrompt, preferredModel);
    const msBreakdown = mid - t0;
    const msQuiz = Date.now() - mid;
    const qz = sanitizeQuiz(qzRaw, bd.subtopics);

    // 3) Persist (non-interactive writes to avoid long-lived transaction issues)
    const lecture = await prisma.lecture.create({
      data: { title: bd.topic || 'Untitled', originalContent: text, userId },
    });

    // Insert subtopics
    await prisma.subtopic.createMany({
      data: bd.subtopics.map((s, idx) => ({
        order: idx,
        title: s.title,
        importance: s.importance,
        difficulty: s.difficulty,
        overview: s.overview || '',
        lectureId: lecture.id,
      })),
    });

    // Fetch inserted subtopics to build title→id map
    const subtopics = await prisma.subtopic.findMany({
      where: { lectureId: lecture.id },
      orderBy: { order: 'asc' },
      select: { id: true, title: true },
    });
    const byTitle = new Map<string, string>();
    for (const st of subtopics) byTitle.set(st.title.trim().toLowerCase(), st.id);

    // Prepare quiz inserts
    const quizData = qz.questions
      .map((q) => {
        const matchTitle = (q.subtopicTitle || '').trim().toLowerCase();
        const subtopicId = byTitle.get(matchTitle) ?? subtopics[0]?.id;
        if (!subtopicId) return null;
        return {
          prompt: q.prompt,
          options: q.options as unknown as any,
          answerIndex: q.answerIndex,
          explanation: q.explanation,
          subtopicId,
        };
      })
      .filter(Boolean) as Array<{
        prompt: string;
        options: any;
        answerIndex: number;
        explanation: string;
        subtopicId: string;
      }>;
    if (quizData.length) {
      await prisma.quizQuestion.createMany({ data: quizData });
    }

    return NextResponse.json({ lectureId: lecture.id, debug: { model: preferredModel || process.env.GEMINI_MODEL || 'default', msBreakdown, msQuiz } }, { status: 201 });
  } catch (e: any) {
    console.error('LECTURES_API_ERROR:', e?.stack || e?.message || e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: e?.status || 500 });
  }
}
