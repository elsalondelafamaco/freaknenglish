-- Admin: assignment student↔teacher + impersonation audit log

ALTER TABLE "users" ADD COLUMN "assigned_teacher_id" TEXT;
ALTER TABLE "users"
  ADD CONSTRAINT "users_assigned_teacher_fk"
  FOREIGN KEY ("assigned_teacher_id") REFERENCES "users"("id") ON DELETE SET NULL;
CREATE INDEX "users_assigned_teacher_id_idx" ON "users"("assigned_teacher_id");

CREATE TABLE "impersonation_logs" (
  "id"         TEXT NOT NULL,
  "admin_id"   TEXT NOT NULL,
  "target_id"  TEXT NOT NULL,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at"   TIMESTAMP(3),
  "ip"         TEXT,
  "user_agent" TEXT,

  CONSTRAINT "impersonation_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "impersonation_logs_admin_fk"  FOREIGN KEY ("admin_id")  REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "impersonation_logs_target_fk" FOREIGN KEY ("target_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE INDEX "impersonation_logs_admin_started_idx"  ON "impersonation_logs"("admin_id",  "started_at");
CREATE INDEX "impersonation_logs_target_started_idx" ON "impersonation_logs"("target_id", "started_at");