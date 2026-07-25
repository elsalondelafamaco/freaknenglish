-- Configuración por checkpoint (reintentos, shuffle, mostrar respuestas, etc.)
ALTER TABLE "checkpoints" ADD COLUMN IF NOT EXISTS "settings" JSONB NOT NULL DEFAULT '{}';
