-- Add lastOpenedAt to Lecture for ordering by recent activity
ALTER TABLE "public"."Lecture" ADD COLUMN IF NOT EXISTS "lastOpenedAt" TIMESTAMP(3);

-- Backfill lastOpenedAt to createdAt for existing rows to preserve sensible ordering
UPDATE "public"."Lecture" SET "lastOpenedAt" = "createdAt" WHERE "lastOpenedAt" IS NULL;

-- Create a composite index to support queries ordering by starred then lastOpenedAt then createdAt
CREATE INDEX IF NOT EXISTS "Lecture_userId_starred_lastOpened_createdAt_idx"
ON "public"."Lecture"("userId", "starred", "lastOpenedAt", "createdAt");

