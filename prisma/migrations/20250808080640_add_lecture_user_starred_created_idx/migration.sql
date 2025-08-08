-- Ensure the required column exists before creating the index
ALTER TABLE "public"."Lecture" ADD COLUMN IF NOT EXISTS "starred" BOOLEAN NOT NULL DEFAULT false;

-- Create the composite index if it does not already exist
CREATE INDEX IF NOT EXISTS "Lecture_userId_starred_createdAt_idx" ON "public"."Lecture"("userId", "starred", "createdAt");
