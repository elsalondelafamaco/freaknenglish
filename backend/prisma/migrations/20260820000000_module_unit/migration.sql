-- Agrupación de módulos por unidad dentro de cada nivel.
ALTER TABLE "modules" ADD COLUMN IF NOT EXISTS "unit" INTEGER;
CREATE INDEX IF NOT EXISTS "modules_level_unit_position_idx" ON "modules"("level", "unit", "position");
