-- Objetivo del material extra: para qué sirve esa clase. El profe lo lee al
-- lado del visor y decide si le sirve sin pasarse todos los slides.
ALTER TABLE "teacher_resources" ADD COLUMN IF NOT EXISTS "objective" TEXT;
