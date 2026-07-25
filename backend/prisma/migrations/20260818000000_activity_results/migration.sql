-- Resultados de actividades interactivas de lecciones HTML (bridge FreaknActivity).
CREATE TABLE IF NOT EXISTS "activity_results" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "lesson_id" TEXT NOT NULL,
  "activity_id" TEXT NOT NULL,
  "title" TEXT,
  "score" INTEGER,
  "max_score" INTEGER,
  "answers" JSONB NOT NULL DEFAULT '[]',
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "activity_results_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "activity_results_user_id_lesson_id_activity_id_key"
  ON "activity_results"("user_id", "lesson_id", "activity_id");
CREATE INDEX IF NOT EXISTS "activity_results_lesson_id_idx" ON "activity_results"("lesson_id");

ALTER TABLE "activity_results"
  ADD CONSTRAINT "activity_results_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity_results"
  ADD CONSTRAINT "activity_results_lesson_id_fkey"
  FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
