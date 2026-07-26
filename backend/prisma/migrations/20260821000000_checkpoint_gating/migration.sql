-- Checkpoints como compuerta en la secuencia de contenido.
ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "is_checkpoint" BOOLEAN NOT NULL DEFAULT false;

-- Habilitación por estudiante: sin fila, el checkpoint está bloqueado.
CREATE TABLE IF NOT EXISTS "checkpoint_unlocks" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "lesson_id" TEXT NOT NULL,
  "unlocked_by_id" TEXT NOT NULL,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMP(3),
  CONSTRAINT "checkpoint_unlocks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "checkpoint_unlocks_user_id_lesson_id_key"
  ON "checkpoint_unlocks"("user_id", "lesson_id");
CREATE INDEX IF NOT EXISTS "checkpoint_unlocks_user_id_idx" ON "checkpoint_unlocks"("user_id");

ALTER TABLE "checkpoint_unlocks"
  ADD CONSTRAINT "checkpoint_unlocks_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "checkpoint_unlocks"
  ADD CONSTRAINT "checkpoint_unlocks_unlocked_by_id_fkey"
  FOREIGN KEY ("unlocked_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "checkpoint_unlocks"
  ADD CONSTRAINT "checkpoint_unlocks_lesson_id_fkey"
  FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- El contenido ya cargado marca sus checkpoints (carpetas u<N>-checkpoint).
UPDATE "lessons" SET "is_checkpoint" = true WHERE "id" LIKE 'beg-u%-checkpoint-quiz';
