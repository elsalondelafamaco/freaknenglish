-- Validación cruzada de asistencia (anti-fraude): separa la confirmación del
-- estudiante de la validación del profesor. Una clase solo cuenta para nómina
-- (status='validated' + validated_at) cuando AMBAS existen.
ALTER TABLE "classes"
  ADD COLUMN IF NOT EXISTS "student_confirmed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "teacher_validated_at" TIMESTAMP(3);
