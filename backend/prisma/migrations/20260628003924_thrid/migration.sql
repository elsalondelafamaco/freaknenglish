/*
  Warnings:

  - The primary key for the `lesson_attachments` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- DropForeignKey
ALTER TABLE "impersonation_logs" DROP CONSTRAINT "impersonation_logs_admin_fk";

-- DropForeignKey
ALTER TABLE "impersonation_logs" DROP CONSTRAINT "impersonation_logs_target_fk";

-- DropForeignKey
ALTER TABLE "lesson_attachments" DROP CONSTRAINT "lesson_attachments_lesson_id_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_assigned_teacher_fk";

-- DropIndex
DROP INDEX "users_assigned_teacher_id_idx";

-- AlterTable
ALTER TABLE "lesson_attachments" DROP CONSTRAINT "lesson_attachments_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "lesson_attachments_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "disabled_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "deleted_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "last_login_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "set_password_token_expires_at" SET DATA TYPE TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_assigned_teacher_id_fkey" FOREIGN KEY ("assigned_teacher_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_attachments" ADD CONSTRAINT "lesson_attachments_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impersonation_logs" ADD CONSTRAINT "impersonation_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impersonation_logs" ADD CONSTRAINT "impersonation_logs_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "impersonation_logs_admin_started_idx" RENAME TO "impersonation_logs_admin_id_started_at_idx";

-- RenameIndex
ALTER INDEX "impersonation_logs_target_started_idx" RENAME TO "impersonation_logs_target_id_started_at_idx";
