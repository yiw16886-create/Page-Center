CREATE TABLE "PluginAccessToken" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "tokenPrefix" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "PluginAccessToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PluginAccessToken_tokenHash_key" ON "PluginAccessToken"("tokenHash");
CREATE INDEX "PluginAccessToken_userId_status_idx" ON "PluginAccessToken"("userId", "status");

ALTER TABLE "PluginAccessToken" ADD CONSTRAINT "PluginAccessToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
