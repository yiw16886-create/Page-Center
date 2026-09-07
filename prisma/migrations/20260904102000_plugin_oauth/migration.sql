CREATE TABLE "OAuthAuthorizationCode" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "codeHash" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "redirectUri" TEXT NOT NULL,
  "codeChallenge" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "scopes" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OAuthAuthorizationCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OAuthAccessToken" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "clientId" TEXT NOT NULL,
  "accessTokenHash" TEXT NOT NULL,
  "refreshTokenHash" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "scopes" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "refreshExpiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OAuthAccessToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OAuthAuthorizationCode_codeHash_key" ON "OAuthAuthorizationCode"("codeHash");
CREATE INDEX "OAuthAuthorizationCode_userId_createdAt_idx" ON "OAuthAuthorizationCode"("userId", "createdAt");
CREATE INDEX "OAuthAuthorizationCode_expiresAt_idx" ON "OAuthAuthorizationCode"("expiresAt");
CREATE UNIQUE INDEX "OAuthAccessToken_accessTokenHash_key" ON "OAuthAccessToken"("accessTokenHash");
CREATE UNIQUE INDEX "OAuthAccessToken_refreshTokenHash_key" ON "OAuthAccessToken"("refreshTokenHash");
CREATE INDEX "OAuthAccessToken_userId_revokedAt_idx" ON "OAuthAccessToken"("userId", "revokedAt");
CREATE INDEX "OAuthAccessToken_expiresAt_idx" ON "OAuthAccessToken"("expiresAt");
CREATE INDEX "OAuthAccessToken_refreshExpiresAt_idx" ON "OAuthAccessToken"("refreshExpiresAt");
ALTER TABLE "OAuthAuthorizationCode" ADD CONSTRAINT "OAuthAuthorizationCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OAuthAccessToken" ADD CONSTRAINT "OAuthAccessToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
