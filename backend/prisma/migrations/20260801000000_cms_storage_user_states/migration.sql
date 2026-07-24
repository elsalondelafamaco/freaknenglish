-- User lifecycle / management columns ----------------------------------
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "disabled_at"      timestamptz,
  ADD COLUMN IF NOT EXISTS "deleted_at"       timestamptz,
  ADD COLUMN IF NOT EXISTS "last_login_at"    timestamptz,
  ADD COLUMN IF NOT EXISTS "set_password_token" text,
  ADD COLUMN IF NOT EXISTS "set_password_token_expires_at" timestamptz;

-- CMS lesson columns ----------------------------------------------------
ALTER TABLE "lessons"
  ADD COLUMN IF NOT EXISTS "content_html" text,
  ADD COLUMN IF NOT EXISTS "notes" text,
  ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'video';

-- Attachments stored in MinIO / S3 -------------------------------------
CREATE TABLE IF NOT EXISTS "lesson_attachments" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "lesson_id"    text NOT NULL REFERENCES "lessons"("id") ON DELETE CASCADE,
  "name"         text NOT NULL,
  "storage_key"  text NOT NULL,
  "url"          text NOT NULL,
  "content_type" text,
  "size_bytes"   integer,
  "created_at"   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "lesson_attachments_lesson_id_idx" ON "lesson_attachments"("lesson_id");