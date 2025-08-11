-- Add lifetime counters to User and backfill from existing data

-- Columns
ALTER TABLE "public"."User" ADD COLUMN IF NOT EXISTS "lifetimeLecturesCreated" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "public"."User" ADD COLUMN IF NOT EXISTS "lifetimeSubtopicsMastered" INTEGER NOT NULL DEFAULT 0;

-- Backfill from current tables
UPDATE "public"."User" u
SET "lifetimeLecturesCreated" = COALESCE((
  SELECT COUNT(1) FROM "public"."Lecture" l WHERE l."userId" = u."id"
), 0);

UPDATE "public"."User" u
SET "lifetimeSubtopicsMastered" = COALESCE((
  SELECT COUNT(1) FROM "public"."UserMastery" m WHERE m."userId" = u."id"
), 0);


