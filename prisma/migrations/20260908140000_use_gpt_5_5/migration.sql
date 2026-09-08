-- Replace legacy free-form model values with a supported dropdown default.
UPDATE "User"
SET "aiTextModel" = 'gpt-5.5'
WHERE "aiTextModel" NOT IN (
  'gpt-5.5',
  'gpt-5.6-luna',
  'gpt-5.6-terra',
  'gpt-5.6-sol',
  'gpt-6-astra'
);

ALTER TABLE "User"
ALTER COLUMN "aiTextModel" SET DEFAULT 'gpt-5.5';
