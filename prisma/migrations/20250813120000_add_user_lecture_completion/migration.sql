-- Create "UserLectureCompletion" table if missing
CREATE TABLE IF NOT EXISTS "public"."UserLectureCompletion" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId" TEXT NOT NULL,
  "lectureId" TEXT NOT NULL,
  CONSTRAINT "UserLectureCompletion_pkey" PRIMARY KEY ("id")
);

-- Foreign keys (idempotent)
DO $$ BEGIN
  ALTER TABLE "public"."UserLectureCompletion"
    ADD CONSTRAINT "UserLectureCompletion_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "public"."UserLectureCompletion"
    ADD CONSTRAINT "UserLectureCompletion_lectureId_fkey"
    FOREIGN KEY ("lectureId") REFERENCES "public"."Lecture"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Unique and indexes (idempotent)
DO $$ BEGIN
  CREATE UNIQUE INDEX "UserLectureCompletion_userId_lectureId_key" ON "public"."UserLectureCompletion"("userId", "lectureId");
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "UserLectureCompletion_userId_createdAt_idx"
  ON "public"."UserLectureCompletion"("userId", "createdAt");


