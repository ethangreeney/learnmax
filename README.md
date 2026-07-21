# LearnMax

LearnMax is a full-stack study app that turns notes and PDFs into structured, mastery-based lessons. Learners study one concept at a time, pass grounded knowledge checks, ask a context-aware tutor for help, and track progress across their library.

[View the live project](https://www.learnmax.net)

<img width="1470" alt="LearnMax lesson view" src="https://github.com/user-attachments/assets/1b5c14e2-9339-41bf-9f65-4376e7d546e4" />

## Product

The core flow is deliberately simple: import source material, review the generated learning path, study each explanation, pass its quiz, and revisit weaker concepts through revision mode. The dashboard records mastery, study streaks, and a learning Elo score. Lessons can also be shared through public read-only links.

## Engineering

| Area           | Implementation                                           |
| -------------- | -------------------------------------------------------- |
| Application    | Next.js 15, React 19, TypeScript                         |
| AI             | OpenAI Responses API, GPT-5.6 Luna with medium reasoning |
| Data           | PostgreSQL, Prisma                                       |
| Authentication | NextAuth with Google OAuth                               |
| UI             | Tailwind CSS, responsive server and client components    |
| Files          | PDF text extraction, visual PDF analysis, Vercel Blob    |

AI generation is grounded in the learner's uploaded material. Longer operations stream progress to the interface, generated quizzes are validated before storage, and usage is recorded by route and model.

## Local development

Use Node.js 20 or newer and pnpm 10.

```bash
git clone https://github.com/ethangreeney/learnmax.git
cd learnmax
pnpm install
```

Create `.env.local` with the required credentials.

```env
OPENAI_API_KEY="your_openai_api_key"
OPENAI_MODEL="gpt-5.6-luna"
OPENAI_REASONING_EFFORT="medium"

POSTGRES_URL="postgresql://user:password@host:5432/learnmax"
POSTGRES_URL_NON_POOLING="postgresql://user:password@host:5432/learnmax"
POSTGRES_SHADOW_URL="postgresql://user:password@host:5432/learnmax_shadow"

NEXTAUTH_SECRET="your_nextauth_secret"
NEXTAUTH_URL="http://localhost:3000"
GOOGLE_CLIENT_ID="your_google_client_id"
GOOGLE_CLIENT_SECRET="your_google_client_secret"
```

Apply the database migrations and start the app.

```bash
pnpm prisma migrate dev
pnpm dev
```

The development server runs at [http://localhost:3000](http://localhost:3000).

## Quality checks

```bash
pnpm check
pnpm build:vercel
```
