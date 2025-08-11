-- Add leaderboard opt-out flag
ALTER TABLE "public"."User"
  ADD COLUMN IF NOT EXISTS "leaderboardOptOut" BOOLEAN NOT NULL DEFAULT false;

-- Create Follow table
CREATE TABLE IF NOT EXISTS "public"."Follow" (
  "followerId" TEXT NOT NULL,
  "followingId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Follow_pkey" PRIMARY KEY ("followerId", "followingId"),
  CONSTRAINT "Follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "public"."User"("id") ON DELETE CASCADE,
  CONSTRAINT "Follow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "public"."User"("id") ON DELETE CASCADE
);

-- Indexes to speed up friends queries
CREATE INDEX IF NOT EXISTS "Follow_followerId_idx" ON "public"."Follow"("followerId");
CREATE INDEX IF NOT EXISTS "Follow_followingId_idx" ON "public"."Follow"("followingId");

