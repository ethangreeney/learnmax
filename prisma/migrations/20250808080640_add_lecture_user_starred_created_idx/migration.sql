-- CreateIndex
CREATE INDEX "Lecture_userId_starred_createdAt_idx" ON "public"."Lecture"("userId", "starred", "createdAt");
