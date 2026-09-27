CREATE TABLE IF NOT EXISTS "HealthConnection" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "profileId" TEXT NOT NULL UNIQUE REFERENCES "Profile"("id") ON DELETE CASCADE,
  "provider" TEXT NOT NULL DEFAULT 'google_health',
  "accessTokenEncrypted" TEXT NOT NULL,
  "refreshTokenEncrypted" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "scopes" TEXT NOT NULL,
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
