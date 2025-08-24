-- Add share/import fields to Lecture
DO $$ BEGIN
  ALTER TABLE "public"."Lecture"
    ADD COLUMN IF NOT EXISTS "shareToken" TEXT,
    ADD COLUMN IF NOT EXISTS "sharedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "shareRevokedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "isDiscoverable" BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS "sourceLectureId" TEXT;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- Unique index on shareToken
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "Lecture_shareToken_key" ON "public"."Lecture"("shareToken");
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

-- Supporting indexes
CREATE INDEX IF NOT EXISTS "Lecture_isDiscoverable_idx" ON "public"."Lecture"("isDiscoverable");
CREATE INDEX IF NOT EXISTS "Lecture_sourceLectureId_idx" ON "public"."Lecture"("sourceLectureId");



