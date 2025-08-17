# LearnMax 🧠✨

**AI-powered mastery learning — from raw notes to real understanding.**

LearnMax is a full-stack Next.js app that turns any text or PDF into a focused learning path. It breaks content into bite-size subtopics, explains each one clearly, and checks your understanding with targeted quizzes so you only move on when you’re ready.

## Screenshots

<img width="1470" height="794" alt="image" src="https://github.com/user-attachments/assets/4bb6d3f8-1a7a-4ff6-93e5-abe3dffb42aa" />
<img width="1470" height="793" alt="image" src="https://github.com/user-attachments/assets/f6e3fdc5-7231-4443-8954-93373ce89713" />
<img width="1470" height="794" alt="image" src="https://github.com/user-attachments/assets/1b5c14e2-9339-41bf-9f65-4376e7d546e4" />
<img width="1470" height="794" alt="image" src="https://github.com/user-attachments/assets/0686f35e-9e6c-40a3-84a4-5f80ebf087fc" />
<img width="508" height="714" alt="image" src="https://github.com/user-attachments/assets/f9544554-fb27-4215-9ee6-0179e626fc5b" />

---

## 🚀 What it does

* **📚 Deconstruct any content**
  Paste text or upload a PDF. LearnMax analyzes it and builds a sequenced outline of the most important subtopics by difficulty and importance.

* **💡 Learn with clarity**
  Each subtopic gets a concise, grounded explanation (with math/markdown support) to reduce cognitive overload and help concepts stick.

* **🎯 Mastery before momentum**
  Move forward only after passing concept-specific checks. Questions are grounded in your material—not trivia.

* **💬 Built-in AI tutor**
  Ask targeted questions in a side panel that’s aware of your current lesson and source document.

* **📊 Progress that motivates**
  A personal dashboard tracks lectures, mastered subtopics, streaks, and a “Learning Elo” that climbs as you improve.

* **🔐 Simple, secure sign-in**
  NextAuth.js with Google keeps accounts and sessions safe.

---

## 🛠️ Tech stack

* **Framework:** Next.js 15 (App Router)
* **Language:** TypeScript
* **AI:** Google Gemini API
* **Database:** PostgreSQL + Prisma ORM
* **Auth:** NextAuth.js (Google OAuth)
* **Styling:** Tailwind CSS
* **State:** Zustand
* **Icons:** Lucide

---

## 🏁 Getting started

### Prerequisites

* Node.js v20+
* pnpm (`npm i -g pnpm`)
* A PostgreSQL instance

### 1) Clone & install

```bash
git clone https://github.com/ethangreeney/learnmax.git
cd learnmax
pnpm install
```

### 2) Configure environment

Create `.env.local` in the project root:

```env
# Google AI API Key (Gemini)
GOOGLE_API_KEY="your_google_api_key"

# PostgreSQL connection strings
POSTGRES_URL="postgresql://user:password@host:port/database"
POSTGRES_URL_NON_POOLING="postgresql://user:password@host:port/database"
POSTGRES_SHADOW_URL="postgresql://user:password@host:port/database_shadow"

# NextAuth
NEXTAUTH_SECRET="your_nextauth_secret"
GOOGLE_CLIENT_ID="your_google_client_id"
GOOGLE_CLIENT_SECRET="your_google_client_secret"
```

### 3) Migrate the database

```bash
pnpm prisma migrate dev
```

### 4) Run the app

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to get started.

---

## 📁 Project structure

* `prisma/` — Prisma schema & migrations
* `public/` — Static assets (SVGs, images)
* `src/app/` — App Router routes and API endpoints

  * `api/` — Server routes (lesson generation, quizzes, chat, etc.)
  * Pages like `/`, `/dashboard`, `/learn`, `/profile`, `/leaderboard`
* `src/components/` — Reusable UI components (chat, quiz, rank, etc.)
* `src/lib/` — Server/client utilities (AI, auth, Prisma, caching)
* `src/types/` — Shared TypeScript types

---

## License

Distributed under the MIT License. See `LICENSE` for details.
