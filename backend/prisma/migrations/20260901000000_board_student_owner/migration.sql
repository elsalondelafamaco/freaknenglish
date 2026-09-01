-- De quién es el aula, para poder reutilizarla en vez de crear una segunda al
-- reasignar profesor. Aditiva e idempotente: producción aplica el esquema con
-- `prisma db push`, así que esta migración solo corre en local.
ALTER TABLE "boards" ADD COLUMN IF NOT EXISTS "student_id" TEXT;
CREATE INDEX IF NOT EXISTS "boards_student_id_idx" ON "boards" ("student_id");
