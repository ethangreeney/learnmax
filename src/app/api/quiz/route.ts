import { NextRequest, NextResponse } from 'next/server';
import { generateJSON } from '@/lib/ai';

export async function POST(req: NextRequest) {
  try {
    const { subtopics } = await req.json();

    if (!subtopics || !Array.isArray(subtopics) || subtopics.length === 0) {
      return NextResponse.json({ error: 'A list of subtopics is required.' }, { status: 400 });
    }

    // This prompt instructs the AI to create a mastery check quiz based on the subtopics.
    const prompt = `
      You are an expert in creating educational assessments. Your task is to generate a quiz based on the provided list of subtopics.

      **CRITICAL INSTRUCTIONS:**
      1. Your entire response MUST be a single, raw JSON object. Do not include any text, commentary, or markdown formatting like \`\`\`json before or after the JSON object.
      2. The root of the JSON object must be a key named "questions", which is an array of question objects.
      3. For each subtopic provided, create exactly one multiple-choice question.

      **Each question object in the "questions" array must have these exact keys:**
      - "prompt": The question text.
      - "options": An array of 4 strings representing the possible answers.
      - "answerIndex": The 0-based index of the correct answer in the "options" array.
      - "explanation": A brief explanation of why the correct answer is right.
      - "subtopicTitle": The title of the subtopic this question relates to.

      **Subtopics to use:**
      ---
      ${JSON.stringify(subtopics, null, 2)}
      ---
    `;

    const aiResponse = await generateJSON(prompt);
    return NextResponse.json(aiResponse);

  } catch (error: any)    {
    console.error("Error in quiz API:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
