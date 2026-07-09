-- Onboarding de horario: preferencias del estudiante + estado de asignación
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "schedule_preferences" JSONB,
  ADD COLUMN IF NOT EXISTS "schedule_assignment_status" TEXT;

CREATE INDEX IF NOT EXISTS "users_schedule_assignment_status_idx"
  ON "users" ("schedule_assignment_status");