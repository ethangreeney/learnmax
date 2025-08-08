-- Safely add the column only if it does not already exist
ALTER TABLE "public"."Lecture" ADD COLUMN IF NOT EXISTS "starred" BOOLEAN NOT NULL DEFAULT false;


