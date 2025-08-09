-- Create Rank table if it doesn't exist (manual fix)
CREATE TABLE IF NOT EXISTS "Rank" (
  "slug" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "minElo" INTEGER NOT NULL,
  "iconUrl" TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS "Rank_minElo_key" ON "Rank" ("minElo");
