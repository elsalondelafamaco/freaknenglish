-- Protección del contenido editado desde el CMS. Hasta ahora, CADA arranque del
-- backend pisaba `content_html` con el archivo del repositorio, así que lo que
-- un admin editaba en plataforma se perdía en el siguiente reinicio (no solo en
-- el deploy). Guardando el hash del archivo al sincronizar se puede saber si la
-- fila fue editada por fuera y respetarla.
ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "content_source_hash" TEXT;

-- Denominador de la barra de progreso por lección: cuántos slides tiene y sus
-- identificadores en orden (la posición guardada del alumno es un índice en
-- unas lecciones y un id de slide en otras).
ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "slide_count" INTEGER;
ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "slide_refs" JSONB;
