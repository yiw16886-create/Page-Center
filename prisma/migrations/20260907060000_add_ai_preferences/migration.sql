-- Two small account-level preferences only; generated content and images remain ephemeral.
ALTER TABLE "User"
ADD COLUMN "aiTextModel" TEXT NOT NULL DEFAULT 'openai/gpt-5-mini',
ADD COLUMN "aiImageModel" TEXT NOT NULL DEFAULT 'bfl/flux-2-pro';
