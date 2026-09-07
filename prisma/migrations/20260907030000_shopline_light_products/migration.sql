CREATE TABLE "StoreConnection" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'SHOPLINE',
  "name" TEXT NOT NULL,
  "handle" TEXT NOT NULL,
  "publicStoreUrl" TEXT NOT NULL,
  "accessTokenCiphertext" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "lastSyncedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StoreConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductLink" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "storeConnectionId" TEXT NOT NULL,
  "productKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "productUrl" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "sales7d" INTEGER NOT NULL DEFAULT 0,
  "salesPrevious7d" INTEGER NOT NULL DEFAULT 0,
  "growthRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "hotScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "lastSeenAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StoreConnection_userId_handle_key" ON "StoreConnection"("userId", "handle");
CREATE INDEX "StoreConnection_userId_status_idx" ON "StoreConnection"("userId", "status");
CREATE UNIQUE INDEX "ProductLink_storeConnectionId_productKey_key" ON "ProductLink"("storeConnectionId", "productKey");
CREATE INDEX "ProductLink_userId_status_hotScore_idx" ON "ProductLink"("userId", "status", "hotScore");
CREATE INDEX "ProductLink_storeConnectionId_status_hotScore_idx" ON "ProductLink"("storeConnectionId", "status", "hotScore");

ALTER TABLE "StoreConnection" ADD CONSTRAINT "StoreConnection_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductLink" ADD CONSTRAINT "ProductLink_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductLink" ADD CONSTRAINT "ProductLink_storeConnectionId_fkey"
  FOREIGN KEY ("storeConnectionId") REFERENCES "StoreConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
