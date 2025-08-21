-- Create ShortAnswerPrompt table for globally persisted short-answer prompts
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS "public"."ShortAnswerPrompt" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lectureId" TEXT NOT NULL,
    "subtopicId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "modelAnswer" TEXT NOT NULL,
    CONSTRAINT "ShortAnswerPrompt_pkey" PRIMARY KEY ("id")
  );
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

-- Uniqueness on (lectureId, subtopicId)
CREATE UNIQUE INDEX IF NOT EXISTS "ShortAnswerPrompt_lectureId_subtopicId_key"
  ON "public"."ShortAnswerPrompt"("lectureId", "subtopicId");

-- Lookup by lectureId
CREATE INDEX IF NOT EXISTS "ShortAnswerPrompt_lectureId_idx"
  ON "public"."ShortAnswerPrompt"("lectureId");


