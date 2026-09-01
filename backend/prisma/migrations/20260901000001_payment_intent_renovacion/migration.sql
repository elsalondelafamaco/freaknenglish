-- Marca de renovación en el intento de pago. Aditiva con default, así que las
-- filas existentes quedan en `false` sin necesidad de backfill.
ALTER TABLE "payment_intents" ADD COLUMN IF NOT EXISTS "es_renovacion" BOOLEAN NOT NULL DEFAULT false;
