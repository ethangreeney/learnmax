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
