-- Create TokenUsage table and indexes
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS "public"."TokenUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "tokensInput" INTEGER NOT NULL DEFAULT 0,
    "tokensOutput" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TokenUsage_pkey" PRIMARY KEY ("id")
  );
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

-- Foreign key
DO $$ BEGIN
  ALTER TABLE "public"."TokenUsage"
    ADD CONSTRAINT "TokenUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "TokenUsage_createdAt_idx" ON "public"."TokenUsage"("createdAt");
CREATE INDEX IF NOT EXISTS "TokenUsage_userId_createdAt_idx" ON "public"."TokenUsage"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "TokenUsage_totalTokens_desc_idx" ON "public"."TokenUsage"("totalTokens" DESC);
CREATE INDEX IF NOT EXISTS "TokenUsage_route_idx" ON "public"."TokenUsage"("route");
CREATE INDEX IF NOT EXISTS "TokenUsage_model_idx" ON "public"."TokenUsage"("model");


