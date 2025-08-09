-- Add optional profile fields
ALTER TABLE "public"."User" ADD COLUMN IF NOT EXISTS "username" TEXT;
ALTER TABLE "public"."User" ADD COLUMN IF NOT EXISTS "bio" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'User_username_key'
  ) THEN
    CREATE UNIQUE INDEX "User_username_key" ON "public"."User"("username");
  END IF;
END $$;

-- Add QuizAttempt table
CREATE TABLE IF NOT EXISTS "public"."QuizAttempt" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedIndex" INTEGER NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    CONSTRAINT "QuizAttempt_pkey" PRIMARY KEY ("id")
);

-- FKs
DO $$ BEGIN
  ALTER TABLE "public"."QuizAttempt"
    ADD CONSTRAINT "QuizAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "public"."QuizAttempt"
    ADD CONSTRAINT "QuizAttempt_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "public"."QuizQuestion"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "QuizAttempt_userId_createdAt_idx" ON "public"."QuizAttempt"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "QuizAttempt_userId_isCorrect_createdAt_idx" ON "public"."QuizAttempt"("userId", "isCorrect", "createdAt");


