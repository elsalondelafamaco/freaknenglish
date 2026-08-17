-- La posición pasa a texto: hay lecciones que navegan por índice ("8") y otras
-- por id de slide ("slide-game"). Columna nueva en vez de cambiar el tipo, para
-- que el arranque de producción (prisma db push) no tenga que borrar datos.
ALTER TABLE "lesson_progress" ADD COLUMN "last_slide_ref" TEXT;
