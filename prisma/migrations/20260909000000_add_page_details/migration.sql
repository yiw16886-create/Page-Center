ALTER TABLE "AuthorizedPage"
ADD COLUMN "pageLink" TEXT,
ADD COLUMN "website" TEXT,
ADD COLUMN "phone" TEXT,
ADD COLUMN "emails" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN "address" TEXT;
