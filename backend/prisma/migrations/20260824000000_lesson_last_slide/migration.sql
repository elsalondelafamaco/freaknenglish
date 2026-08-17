-- Slide donde quedó el estudiante en una lección interactiva.
-- Nullable: las filas existentes quedan sin valor y el cliente arranca en 0.
ALTER TABLE "lesson_progress" ADD COLUMN "last_slide" INTEGER;
