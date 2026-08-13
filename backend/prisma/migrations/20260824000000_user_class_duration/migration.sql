-- Duración de clase por estudiante (minutos). El schema ya la declaraba pero
-- no existía migración que la creara: en local (que usa `migrate deploy`) la
-- columna faltaba y CUALQUIER lectura de `users` reventaba, incluido el login.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "class_duration_min" INTEGER;
