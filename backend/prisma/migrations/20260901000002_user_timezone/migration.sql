-- Zona horaria IANA del estudiante. Nullable sin default: `null` distingue
-- "nunca se capturó" de "está en Bogotá", que es lo que dispara la captura
-- automática. Aditiva e idempotente.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "timezone" TEXT;
