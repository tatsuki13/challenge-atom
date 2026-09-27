ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "emotionScores" JSONB;

CREATE TABLE IF NOT EXISTS "HealthSample" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "profileId" TEXT NOT NULL REFERENCES "Profile"("id") ON DELETE CASCADE,
  "date" TIMESTAMP(3) NOT NULL,
  "sleepMinutes" INTEGER,
  "steps" INTEGER,
  "restingHeartRate" INTEGER,
  "source" TEXT NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HealthSample_profileId_date_source_key" UNIQUE ("profileId", "date", "source")
);

CREATE INDEX IF NOT EXISTS "HealthSample_profileId_date_idx" ON "HealthSample"("profileId", "date");
