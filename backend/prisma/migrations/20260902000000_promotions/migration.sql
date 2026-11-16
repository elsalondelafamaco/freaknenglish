-- Promociones configurables. Todo es aditivo e idempotente: tabla nueva y
-- columnas nuevas nulables en `payment_intents`, así que no hace falta backfill.
CREATE TABLE IF NOT EXISTS "promotions" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "starts_at" TIMESTAMP(3),
  "ends_at" TIMESTAMP(3),
  "discount_type" TEXT NOT NULL,
  "discount_value" INTEGER NOT NULL,
  "plan_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "applies_to_new" BOOLEAN NOT NULL DEFAULT true,
  "applies_to_renewals" BOOLEAN NOT NULL DEFAULT false,
  "audience" TEXT NOT NULL DEFAULT 'ALL',
  "code" TEXT,
  "utm_source" TEXT,
  "utm_medium" TEXT,
  "utm_campaign" TEXT,
  "show_banner" BOOLEAN NOT NULL DEFAULT false,
  "show_on_prices" BOOLEAN NOT NULL DEFAULT false,
  "banner_text" TEXT,
  "badge_text" TEXT,
  "checkout_label" TEXT,
  "bg_color" TEXT NOT NULL DEFAULT '#EBD81A',
  "text_color" TEXT NOT NULL DEFAULT '#111111',
  "show_countdown" BOOLEAN NOT NULL DEFAULT false,
  "max_redemptions" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "payment_intents" ADD COLUMN IF NOT EXISTS "promotion_id" TEXT;
ALTER TABLE "payment_intents" ADD COLUMN IF NOT EXISTS "list_amount_in_cents" INTEGER;
ALTER TABLE "payment_intents" ADD COLUMN IF NOT EXISTS "discount_in_cents" INTEGER;
ALTER TABLE "payment_intents" ADD COLUMN IF NOT EXISTS "atribucion" JSONB;

CREATE INDEX IF NOT EXISTS "payment_intents_promotion_id_idx" ON "payment_intents"("promotion_id");

DO $$ BEGIN
  ALTER TABLE "payment_intents"
    ADD CONSTRAINT "payment_intents_promotion_id_fkey"
    FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
