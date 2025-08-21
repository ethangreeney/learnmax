-- Create ShortAnswerGrade table and supporting indexes
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS "public"."ShortAnswerGrade" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "lectureId" TEXT,
    "promptHash" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    CONSTRAINT "ShortAnswerGrade_pkey" PRIMARY KEY ("id")
  );
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "public"."ShortAnswerGrade"
    ADD CONSTRAINT "ShortAnswerGrade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "public"."ShortAnswerGrade"
    ADD CONSTRAINT "ShortAnswerGrade_lectureId_fkey" FOREIGN KEY ("lectureId") REFERENCES "public"."Lecture"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Unique constraint to avoid duplicates per user+promptHash
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "ShortAnswerGrade_userId_promptHash_key" ON "public"."ShortAnswerGrade"("userId", "promptHash");
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

-- Supporting index for queries
CREATE INDEX IF NOT EXISTS "ShortAnswerGrade_userId_createdAt_idx" ON "public"."ShortAnswerGrade"("userId", "createdAt");


