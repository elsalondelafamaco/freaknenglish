-- Pausa de plan a nivel de suscripción (solo admin).
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'paused';

ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "paused_at" TIMESTAMP(3);
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "pause_reason" TEXT;

-- Material extra para profesores (HTML servido desde la base, no desde S3:
-- el bucket es de lectura pública y esto es material interno).
CREATE TABLE IF NOT EXISTS "teacher_resources" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "content_html" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_resources_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "teacher_resources_category_position_idx" ON "teacher_resources"("category", "position");
