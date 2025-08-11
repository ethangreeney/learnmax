# LearnMax 🧠✨

**The Science of Learning, Perfected by AI.**

LearnMax is a full-stack web application built with Next.js that revolutionizes studying. Stop wasting hours on inefficient rereading. LearnMax applies proven cognitive science principles, powered by the Google Gemini API, to deconstruct complex materials, generate focused learning modules, and verify your understanding every step of the way.

 <img width="1470" height="787" alt="image" src="https://github.com/user-attachments/assets/7a9cf5ec-03a4-4bb6-a700-34deed0735b1" />
<img width="1470" height="789" alt="image" src="https://github.com/user-attachments/assets/5af0e37a-c1bb-4262-bf60-757bd4c7cfcc" />
<img width="725" height="575" alt="image" src="https://github.com/user-attachments/assets/8b784b6d-8fa2-4a49-a4d8-12aec793ef46" />

---

## 🚀 About The Project

This application is designed to create a hyper-efficient study path from any text-based content, like lecture notes or PDF slides. It breaks down the material, explains each part, and quizzes you to ensure you've mastered the concept before moving on.

### Core Features

- **📚 AI Content Deconstruction**: Upload a PDF or paste raw text. The AI analyzes the material and structures it into a logical learning path of subtopics, ordered by importance and difficulty.
- **💡 Guided Mastery Learning**: Tackle one core concept at a time. The app provides AI-generated explanations in various styles (simplified, detailed, or with examples) to prevent cognitive overload and embed knowledge effectively.
- **🎯 Verified Comprehension**: Before advancing, pass a targeted, AI-generated quiz to prove you've mastered the current concept. This guarantees a rock-solid foundation for lasting knowledge.
- **💬 Interactive AI Tutor**: Have a question? An AI tutor is available in a side panel, ready to answer questions about the source material or related general knowledge topics.
- **📊 Personalized Dashboard**: Keep track of your learning journey. View stats like your total lectures, mastered subtopics, and even a "Learning Elo" score that reflects your progress.
- **🔐 Secure Authentication**: User accounts and sessions are securely managed using NextAuth.js with Google as an OAuth provider.

---

## 🛠️ Built With

This project leverages a modern, powerful tech stack:

- **Framework**: [Next.js](https://nextjs.org/) (v15) with App Router
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **AI**: [Google Gemini API](https://ai.google.dev/)
- **Database**: [PostgreSQL](https://www.postgresql.org/)
- **ORM**: [Prisma](https://www.prisma.io/)
- **Authentication**: [NextAuth.js](https://next-auth.js.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Client-side State**: [Zustand](https://github.com/pmndrs/zustand)
- **Icons**: [Lucide React](https://lucide.dev/)

---

## 🏁 Getting Started

To get a local copy up and running, follow these simple steps.

### Prerequisites

- **Node.js**: v20.x or higher
- **pnpm**: `npm install -g pnpm`
- **PostgreSQL**: A running instance of PostgreSQL.

### Installation & Setup

1.  **Clone the repository:**

    ```sh
    git clone https://github.com/your-username/learnmax.git
    cd learnmax
    ```

2.  **Install dependencies:**

    ```sh
    pnpm install
    ```

3.  **Set up environment variables:**
    Create a `.env.local` file in the root of your project and add the following variables.

    ```env
    # Google AI API Key (for Gemini)
    GOOGLE_API_KEY="your_google_api_key"

    # PostgreSQL Connection URLs (get from your provider)
    # Used by Prisma for migrations and the app
    POSTGRES_URL="postgresql://user:password@host:port/database"
    # Direct connection for Prisma Migrate/Studio
    POSTGRES_URL_NON_POOLING="postgresql://user:password@host:port/database"
    # Shadow database for development migrations
    POSTGRES_SHADOW_URL="postgresql://user:password@host:port/database_shadow"

    # NextAuth.js Configuration
    # Generate a secret with: openssl rand -base64 32
    NEXTAUTH_SECRET="your_nextauth_secret"
    # Google OAuth credentials
    GOOGLE_CLIENT_ID="your_google_client_id"
    GOOGLE_CLIENT_SECRET="your_google_client_secret"
    ```

4.  **Run database migrations:**
    This will sync the Prisma schema with your PostgreSQL database.

    ```sh
    pnpm prisma migrate dev
    ```

5.  **Run the development server:**
    ```sh
    pnpm dev
    ```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result!

---

## 📁 Project Structure

The codebase is organized to be clean and maintainable:

- `prisma/`: Contains the database `schema.prisma` and migration files.
- `public/`: Static assets like images and SVGs.
- `src/app/`: The core of the Next.js application, using the App Router.
  - `(pages)/`: Main routes like `/`, `/dashboard`, and `/learn`.
  - `api/`: All backend API endpoints, organized by resource.
- `src/components/`: Shared, reusable React components used across the application.
- `src/lib/`: Essential logic and utilities.
  - `ai.ts`: Functions for interacting with the Google Gemini API.
  - `auth.ts`: NextAuth.js configuration.
  - `prisma.ts`: Prisma client instance.
  - `client/`: Client-side specific helpers and state stores (Zustand).
- `src/types/`: TypeScript type definitions.

---

## License

Distributed under the MIT License. See `LICENSE` for more information.
