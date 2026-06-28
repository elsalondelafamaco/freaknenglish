-- DropForeignKey
ALTER TABLE "impersonation_logs" DROP CONSTRAINT "impersonation_logs_admin_fk";

-- DropForeignKey
ALTER TABLE "impersonation_logs" DROP CONSTRAINT "impersonation_logs_target_fk";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_assigned_teacher_fk";

-- DropIndex
DROP INDEX "users_assigned_teacher_id_idx";

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_assigned_teacher_id_fkey" FOREIGN KEY ("assigned_teacher_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impersonation_logs" ADD CONSTRAINT "impersonation_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impersonation_logs" ADD CONSTRAINT "impersonation_logs_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "impersonation_logs_admin_started_idx" RENAME TO "impersonation_logs_admin_id_started_at_idx";

-- RenameIndex
ALTER INDEX "impersonation_logs_target_started_idx" RENAME TO "impersonation_logs_target_id_started_at_idx";
