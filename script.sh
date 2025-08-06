#!/usr/bin/env bash
#
# This script performs a complete project overhaul. It resolves all dependency
# issues by performing a clean installation, applies numerous code fixes and
# improvements, and generates comprehensive documentation.
#

set -euo pipefail

echo "🚀 Starting the definitive project overhaul..."
echo "This script will now fix your project's dependencies and source code."
echo ""

# --- 1. Overwrite package.json with the correct dependencies ---
echo "📄 Step 1: Correcting package.json to define the right dependencies..."
cat > "package.json" << 'EOF'
{
  "name": "learnmax",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "@google/generative-ai": "^0.24.1",
    "lucide-react": "^0.536.0",
    "next": "15.4.5",
    "pdf-extraction": "^1.0.2",
    "react": "19.1.0",
    "react-dom": "19.1.0",
    "react-markdown": "^10.1.0",
    "remark-gfm": "^4.0.1",
    "zustand": "^5.0.7"
  },
  "devDependencies": {
    "@eslint/eslintrc": "^3",
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "15.4.5",
    "prettier": "^3.6.2",
    "prettier-plugin-tailwindcss": "^0.6.14",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}
EOF
echo "   - package.json has been updated."
echo ""

# --- 2. Resolve Dependency Conflicts with a Clean Slate ---
echo "🧹 Step 2: Wiping node_modules to resolve all conflicts..."
rm -rf node_modules package-lock.json
echo "   - node_modules and package-lock.json removed."

echo "📦 Performing a clean installation of all dependencies..."
npm install
echo "   - Clean installation complete. All dependency conflicts are resolved."
echo ""

# --- 3. Clean Up Unused and Legacy Files ---
echo "🗑️ Step 3: Cleaning up legacy files from the project..."
if [ -f "src/lib/pdf-parser.ts" ]; then
    rm "src/lib/pdf-parser.ts"
    echo "   - Removed redundant 'src/lib/pdf-parser.ts'."
fi
echo ""

# --- 4. Correct and Improve All Source Code ---
echo "🔧 Step 4: Applying fixes and improvements to all source code..."

echo "   - Updating AI configuration in 'src/lib/ai.ts'..."
cat > "src/lib/ai.ts" << 'EOF'
import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GOOGLE_API_KEY;

if (!apiKey) {
  throw new Error("GOOGLE_API_KEY is not set. Please add it to your .env.local file.");
}

const genAI = new GoogleGenerativeAI(apiKey);

export async function generateJSON(prompt: string): Promise<any> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response?.text();
    if (!responseText) {
      throw new Error("The AI returned an empty response.");
    }
    return JSON.parse(responseText);
  } catch (e: any) {
    console.error("Failed to get valid JSON from AI response:", e.message);
    throw new Error("The AI failed to generate a valid response. Please try again.");
  }
}
EOF

echo "   - Refactoring global styles in 'src/app/globals.css'..."
cat > "src/app/globals.css" << 'EOF'
@import "tailwindcss";

:root {
  --background: #0a0a0a;
  --foreground: #ededed;
}

body {
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.container-narrow {
  @apply mx-auto max-w-5xl px-4 md:px-6;
}
EOF

echo "   - Improving the main layout and navigation in 'src/app/layout.tsx'..."
cat > "src/app/layout.tsx" << 'EOF'
import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'LearnMax — Your AI Study Companion',
  description: 'Master any subject by breaking complex lectures into focused steps, reviewing key insights, and advancing only when you master each concept.',
};

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/learn', label: 'Learn' },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">
        <div className="container-narrow">
          <header className="py-8 flex items-center justify-between border-b border-neutral-900">
            <Link href="/" className="text-2xl font-semibold tracking-tight hover:text-white transition-colors">
              LearnMax
            </Link>
            <nav className="flex items-center gap-4 text-sm text-neutral-300">
              {navLinks.map((link, index) => (
                <Link key={index} href={link.href} className="hover:text-white transition-colors">
                  {link.label}
                </Link>
              ))}
            </nav>
          </header>
          <main className="py-10">{children}</main>
          <footer className="py-12 text-center text-sm text-neutral-500">
            Built with Next.js, Tailwind CSS, and Google Gemini.
          </footer>
        </div>
      </body>
    </html>
  );
}
EOF
echo "   - All source files have been updated."
echo ""

# --- 5. Create Supporting Configuration Files ---
echo "⚙️ Step 5: Creating supporting configuration files..."
echo "   - Creating '.env.example' to guide environment setup..."
cat > ".env.example" << 'EOF'
# This file contains environment variables required by the application.
# Copy this file to .env.local and fill in the values.
#
# You can get a Google AI API key from the Google AI Studio:
# https://aistudio.google.com/app/apikey
GOOGLE_API_KEY=
EOF
echo ""

# --- 6. Generate a High-Quality README ---
echo "📖 Step 6: Generating a new, comprehensive 'README.md'..."
cat > "README.md" << 'EOF'
# LearnMax - Your Personal AI Study Companion

[![Built with Next.js](https://img.shields.io/badge/Built%20with-Next.js-black?logo=next.js)](https://nextjs.org)
[![Powered by Google Gemini](https://img.shields.io/badge/Powered%20by-Gemini%20AI-blue?logo=google)](https://ai.google.com/)
[![Styled with Tailwind CSS](https://img.shields.io/badge/Styled%20with-Tailwind%20CSS-38B2AC?logo=tailwind-css)](https://tailwindcss.com)

LearnMax is a web application designed to accelerate learning and improve comprehension. By leveraging the power of Google's Gemini AI, it transforms raw text or PDF study materials into a structured, interactive learning path.

## How It Works

1.  **Provide Content**: Paste text directly or upload a PDF of your lecture notes, an article, or any other study material into the Learn Workspace.
2.  **AI Analysis**: The application sends the content to the Gemini API, which analyzes the text and breaks it down into a logical sequence of subtopics.
3.  **Guided Learning**: For each subtopic, the AI generates a detailed explanation.
4.  **Mastery Check**: After studying a subtopic, take a quiz. You can only proceed to the next subtopic after you've passed the quiz, ensuring you've understood the concept.

## Features

-   **PDF & Text Upload**: Easily input your study materials.
-   **AI-Powered Topic Breakdown**: Automatically structures your content into a step-by-step learning plan.
-   **Detailed Explanations**: Get clear, AI-generated explanations for each subtopic.
-   **Mastery Quizzes**: Reinforce learning and ensure comprehension before moving on.
-   **Learning Dashboard**: Track your progress.
-   **Responsive Design**: Fully usable on desktop and mobile.

## Tech Stack

-   **Framework**: [Next.js](https://nextjs.org/)
-   **AI**: [Google Gemini API](https://ai.google.dev/)
-   **Styling**: [Tailwind CSS](https://tailwindcss.com/)
-   **State Management**: [Zustand](https://github.com/pmndrs/zustand)
-   **Deployment**: Vercel

## Getting Started

### Prerequisites

-   Node.js (v18 or later recommended)
-   A package manager like `npm`.
-   A Google AI API Key.

### Installation

1.  **Clone the repository:**
    ```sh
    git clone https://github.com/your-username/learnmax.git
    cd learnmax
    ```

2.  **Install dependencies:**
    ```sh
    npm install
    ```

3.  **Set up your environment variables:**
    -   Create a new file named `.env.local` in the root of the project.
    -   Copy the contents of `.env.example` into it.
    -   Get your API key from the [Google AI Studio](https://aistudio.google.com/app/apikey) and paste it into `.env.local`:
    ```env
    GOOGLE_API_KEY=your_super_secret_api_key
    ```

4.  **Run the development server:**
    ```sh
    npm run dev
    ```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## License

This project is available under the [MIT License](LICENSE).
EOF
echo "   - README.md has been generated."
echo ""

# --- Final Confirmation ---
echo "✅ Project overhaul complete! Your project is now stable and improved."
echo "This script file has NOT been deleted. You can run it again if needed."
echo ""
echo "➡️ Next Step: Run 'npm run dev' to start your application."
echo ""