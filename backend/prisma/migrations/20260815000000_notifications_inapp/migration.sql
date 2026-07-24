-- D6 in-app notifications: extend notifications table
ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS "title" TEXT,
  ADD COLUMN IF NOT EXISTS "body" TEXT,
  ADD COLUMN IF NOT EXISTS "link_url" TEXT,
  ADD COLUMN IF NOT EXISTS "read_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "notifications_user_id_read_at_created_at_idx"
  ON "notifications" ("user_id", "read_at", "created_at");