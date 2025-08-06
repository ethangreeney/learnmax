#!/usr/bin/env bash
#
# This script provides a final, high-impact visual overhaul for the
# AI-generated explanations to ensure they are beautifully formatted and readable.
#
# It replaces the previous subtle styling with a more robust and professional
# set of CSS classes that create a strong visual hierarchy.
#

set -euo pipefail

# --- Configuration ---
LEARN_PAGE="src/app/learn/page.tsx"
EXPLAIN_API="src/app/api/explain/route.ts"

echo "Applying a professional formatting overhaul to the explanation content..."

# --- Step 1: Update the Explain API Prompt for Maximum Clarity ---
echo "Refining the AI prompt for even better structure..."
mkdir -p "$(dirname "$EXPLAIN_API")"
cat > "$EXPLAIN_API" << 'TS'
import { NextRequest, NextResponse } from 'next/server';
import { generateJSON } from '@/lib/ai';

export async function POST(req: NextRequest) {
  try {
    const { content, subtopicTitle } = await req.json();

    if (!content || !subtopicTitle) {
      return NextResponse.json({ error: 'Content or a subtopic title is required.' }, { status: 400 });
    }

    const prompt = `
      You are a world-class educator creating a study guide.
      Your task is to provide a detailed, in-depth explanation of the core concept of "${subtopicTitle}".

      **Formatting Rules:**
      - The output MUST be a JSON object with a single key: "explanation".
      - The "explanation" value MUST be a string containing well-structured Markdown.
      - Use '##' for main section titles. These are the most important headings.
      - Use '###' for sub-section titles.
      - Use bold text ('**term**') for all key terms and definitions.
      - Use bulleted or numbered lists for steps, components, or key points.
      - Use ample whitespace and structure to create a highly readable document.

      Use the full lecture text below for context.
      ---
      ${content}
      ---
    `;

    const aiResponse = await generateJSON(prompt);
    return NextResponse.json(aiResponse);

  } catch (error: any) {
    console.error("Error in explain API:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
TS

# --- Step 2: Replace the old prose classes with the new, enhanced ones ---
echo "Upgrading the frontend with a new set of professional CSS styles..."
# This `sed` command finds the 'prose' div and replaces its class string with a more comprehensive one.
sed -i.bak \
  's|className="prose prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-h2:text-2xl prose-h2:border-b prose-h2:border-neutral-700 prose-h2:pb-3 prose-h2:mb-4 prose-h3:text-xl prose-h3:mb-3 prose-p:leading-relaxed prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline prose-code:bg-neutral-800 prose-code:rounded prose-code:px-2 prose-code:py-1"|className="prose prose-invert max-w-none \
prose-headings:font-bold prose-headings:tracking-tight \
prose-h2:text-2xl prose-h2:mt-8 prose-h2:mb-4 prose-h2:pb-4 prose-h2:border-b prose-h2:border-neutral-800 \
prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-3 \
prose-p:leading-7 prose-p:text-neutral-300 \
prose-strong:text-neutral-100 \
prose-a:text-blue-400 prose-a:font-medium prose-a:no-underline hover:prose-a:underline \
prose-ul:list-disc prose-ul:pl-5 prose-li:my-2 \
prose-ol:list-decimal prose-ol:pl-5 \
prose-code:bg-neutral-800 prose-code:rounded prose-code:px-2 prose-code:py-1 prose-code:font-mono prose-code:text-sm"|' \
  "$LEARN_PAGE"

# Clean up the backup file created by sed
rm -f "$LEARN_PAGE.bak"

echo ""
echo "✅ Success! The explanation formatting has been significantly upgraded."
echo "The new styles create a much stronger and clearer visual hierarchy."
echo ""
echo "Please restart your development server ('npm run dev') to see the new formatting."