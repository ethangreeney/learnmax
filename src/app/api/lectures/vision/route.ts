import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import prisma from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { isSessionWithUser } from '@/lib/session-utils';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!isSessionWithUser(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Upload a PDF via multipart/form-data' }, { status: 415 });
    }
    const form = await req.formData();
    const file = form.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Invalid file type. Only PDF files are accepted.' }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'GOOGLE_API_KEY not set' }, { status: 500 });
    const client = new GoogleGenerativeAI(apiKey);
    const files = new GoogleAIFileManager(apiKey);

    // Upload PDF to Gemini File API
    const arrayBuffer = await file.arrayBuffer();
    const uploaded = await files.uploadFile(
      Buffer.from(arrayBuffer),
      { mimeType: 'application/pdf', displayName: file.name }
    );

    // Poll until ACTIVE
    let fileRec = uploaded.file as any;
    const tStart = Date.now();
    while (fileRec.state !== 'ACTIVE') {
      if (Date.now() - tStart > 45000) {
        return NextResponse.json({ error: 'Timed out waiting for file processing' }, { status: 504 });
      }
      await new Promise((r) => setTimeout(r, 1200));
      fileRec = await files.getFile(fileRec.name);
    }

    // Ask Gemini to analyze full PDF (text + images)
    const preferred = (form.get('model') as string | null)?.trim();
    const modelName = preferred || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const model = client.getGenerativeModel({ model: modelName });

    const prompt = [
      'Analyze this PDF end-to-end (text and images).',
      'Return a compact JSON object with:',
      '{ "topic": string, "subtopics": [ { "title": string, "importance": "high"|"medium"|"low", "difficulty": 1|2|3, "overview": string } ] }',
      'Ensure valid JSON only. No additional prose.',
    ].join('\n');

    const res = await model.generateContent([
      { fileData: { fileUri: (fileRec as any).uri, mimeType: 'application/pdf' } },
      { text: prompt },
    ]);
    const text = res.response.text?.() || '';
    let json: any = {};
    try { json = JSON.parse(text); } catch { return NextResponse.json({ error: 'Invalid JSON from model', raw: text }, { status: 502 }); }

    // Persist minimal lecture from JSON
    const topic = typeof json?.topic === 'string' && json.topic.trim() ? json.topic.trim() : 'Untitled';
    const subs = Array.isArray(json?.subtopics) ? json.subtopics : [];

    const lecture = await prisma.lecture.create({ data: { title: topic, originalContent: 'PDF (vision) upload', userId } });
    if (subs.length) {
      await prisma.subtopic.createMany({
        data: subs.map((s: any, idx: number) => ({
          order: idx,
          title: String(s?.title || `Section ${idx + 1}`),
          importance: String(s?.importance || 'medium'),
          difficulty: Number(s?.difficulty || 2),
          overview: String(s?.overview || ''),
          lectureId: lecture.id,
        })),
      });
    }

    return NextResponse.json({ lectureId: lecture.id });
  } catch (e: any) {
    console.error('VISION_UPLOAD_ERROR', e);
    return NextResponse.json({ error: e?.message || 'server error' }, { status: 500 });
  }
}


