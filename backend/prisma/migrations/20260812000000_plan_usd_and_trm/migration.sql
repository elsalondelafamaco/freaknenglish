-- Adds USD reference price on plans and a TRM cache table.
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "price_usd" INTEGER;

UPDATE "plans" SET "price_usd" = CASE id
  WHEN '3-dias' THEN 155
  WHEN '4-dias' THEN 190
  WHEN '5-dias' THEN 225
  ELSE "price_usd"
END WHERE "price_usd" IS NULL;

CREATE TABLE IF NOT EXISTS "trm_rates" (
  "id" TEXT PRIMARY KEY,
  "valid_from" TIMESTAMPTZ NOT NULL,
  "value_cop" NUMERIC(12,4) NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'superfinanciera',
  "fetched_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "trm_rates_valid_from_idx" ON "trm_rates" ("valid_from" DESC);