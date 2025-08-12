-- Set default elo to 0 for new users
ALTER TABLE "public"."User" ALTER COLUMN "elo" SET DEFAULT 0;

