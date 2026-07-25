-- Solicitud explícita de NPS por el admin + link de Meet/Zoom del estudiante.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "nps_requested_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "meeting_url" TEXT;
