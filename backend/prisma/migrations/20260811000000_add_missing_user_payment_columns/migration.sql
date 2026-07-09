-- Align DB with schema fields already used by services.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "document_number" text,
  ADD COLUMN IF NOT EXISTS "onboarded_at" timestamptz;

ALTER TABLE "payment_intents"
  ADD COLUMN IF NOT EXISTS "customer_document" text;
