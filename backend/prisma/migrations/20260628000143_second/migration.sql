-- Make this migration safe on fresh/shadow databases where admin tables/columns
-- may not exist yet because this migration was created out of sequence.
ALTER TABLE IF EXISTS "impersonation_logs" DROP CONSTRAINT IF EXISTS "impersonation_logs_admin_fk";
ALTER TABLE IF EXISTS "impersonation_logs" DROP CONSTRAINT IF EXISTS "impersonation_logs_target_fk";
ALTER TABLE IF EXISTS "users" DROP CONSTRAINT IF EXISTS "users_assigned_teacher_fk";
DROP INDEX IF EXISTS "users_assigned_teacher_id_idx";

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_name = 'users' AND column_name = 'assigned_teacher_id'
	) THEN
		ALTER TABLE "users"
			ADD CONSTRAINT "users_assigned_teacher_id_fkey"
			FOREIGN KEY ("assigned_teacher_id") REFERENCES "users"("id")
			ON DELETE SET NULL ON UPDATE CASCADE;
	END IF;
END $$;

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'impersonation_logs') THEN
		ALTER TABLE "impersonation_logs"
			ADD CONSTRAINT "impersonation_logs_admin_id_fkey"
			FOREIGN KEY ("admin_id") REFERENCES "users"("id")
			ON DELETE RESTRICT ON UPDATE CASCADE;
	END IF;
EXCEPTION WHEN duplicate_object THEN
	NULL;
END $$;

DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'impersonation_logs') THEN
		ALTER TABLE "impersonation_logs"
			ADD CONSTRAINT "impersonation_logs_target_id_fkey"
			FOREIGN KEY ("target_id") REFERENCES "users"("id")
			ON DELETE RESTRICT ON UPDATE CASCADE;
	END IF;
EXCEPTION WHEN duplicate_object THEN
	NULL;
END $$;

ALTER INDEX IF EXISTS "impersonation_logs_admin_started_idx" RENAME TO "impersonation_logs_admin_id_started_at_idx";
ALTER INDEX IF EXISTS "impersonation_logs_target_started_idx" RENAME TO "impersonation_logs_target_id_started_at_idx";
