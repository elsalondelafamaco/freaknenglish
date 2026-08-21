-- Nivel del material extra de profesores. NULO = sirve para los tres niveles,
-- que es lo que queda para todo el material ya cargado.
ALTER TABLE "teacher_resources" ADD COLUMN IF NOT EXISTS "level" "EnglishLevel";

DROP INDEX IF EXISTS "teacher_resources_category_position_idx";
CREATE INDEX IF NOT EXISTS "teacher_resources_level_category_position_idx"
  ON "teacher_resources"("level", "category", "position");

-- Material que el profesor le deja a un estudiante concreto (link o archivo).
CREATE TABLE IF NOT EXISTS "student_resources" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT NOT NULL,
    "storage_key" TEXT,
    "content_type" TEXT,
    "size_bytes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_resources_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "student_resources_student_id_created_at_idx"
  ON "student_resources"("student_id", "created_at");

ALTER TABLE "student_resources"
  ADD CONSTRAINT "student_resources_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "student_resources"
  ADD CONSTRAINT "student_resources_teacher_id_fkey"
  FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reportes de progreso que el profesor le escribe al estudiante.
CREATE TABLE IF NOT EXISTS "student_reports" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,
    "period_label" TEXT NOT NULL,
    "level" "EnglishLevel",
    "classes_taken" INTEGER,
    "classes_total" INTEGER,
    "strengths" TEXT,
    "improvements" TEXT,
    "recommendation" TEXT,
    "comment" TEXT,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "student_reports_student_id_created_at_idx"
  ON "student_reports"("student_id", "created_at");

ALTER TABLE "student_reports"
  ADD CONSTRAINT "student_reports_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "student_reports"
  ADD CONSTRAINT "student_reports_teacher_id_fkey"
  FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
