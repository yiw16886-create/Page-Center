CREATE TABLE "User" (
  "id" SERIAL NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "MetaOAuthState" (
  "id" TEXT NOT NULL,
  "stateHash" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MetaOAuthState_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MetaOAuthState_stateHash_key" ON "MetaOAuthState"("stateHash");
CREATE INDEX "MetaOAuthState_userId_createdAt_idx" ON "MetaOAuthState"("userId", "createdAt");
CREATE INDEX "MetaOAuthState_expiresAt_idx" ON "MetaOAuthState"("expiresAt");

CREATE TABLE "MetaAuthorization" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "facebookUserId" TEXT NOT NULL,
  "facebookUserName" TEXT,
  "userTokenCiphertext" TEXT NOT NULL,
  "grantedScopes" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "tokenExpiresAt" TIMESTAMP(3),
  "authorizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastVerifiedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MetaAuthorization_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MetaAuthorization_userId_key" ON "MetaAuthorization"("userId");

CREATE TABLE "AuthorizedPage" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "pageId" TEXT NOT NULL,
  "pageName" TEXT NOT NULL,
  "category" TEXT,
  "tasks" TEXT NOT NULL,
  "pageTokenCiphertext" TEXT NOT NULL,
  "canRead" BOOLEAN NOT NULL DEFAULT false,
  "canPublish" BOOLEAN NOT NULL DEFAULT false,
  "canManageComments" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "authorizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastVerifiedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuthorizedPage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AuthorizedPage_userId_pageId_key" ON "AuthorizedPage"("userId", "pageId");
CREATE INDEX "AuthorizedPage_userId_status_idx" ON "AuthorizedPage"("userId", "status");

CREATE TABLE "ActionReceipt" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "resultJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActionReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ActionReceipt_userId_action_key_key" ON "ActionReceipt"("userId", "action", "key");
CREATE INDEX "ActionReceipt_userId_createdAt_idx" ON "ActionReceipt"("userId", "createdAt");

CREATE TABLE "ActionLog" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "pageId" TEXT,
  "status" TEXT NOT NULL,
  "requestJson" JSONB,
  "resultJson" JSONB,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActionLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ActionLog_userId_createdAt_idx" ON "ActionLog"("userId", "createdAt");

ALTER TABLE "MetaAuthorization" ADD CONSTRAINT "MetaAuthorization_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuthorizedPage" ADD CONSTRAINT "AuthorizedPage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActionReceipt" ADD CONSTRAINT "ActionReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActionLog" ADD CONSTRAINT "ActionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
