-- Ajustes manuales sobre el valor final y trazabilidad del pago.
ALTER TABLE "payroll_runs" ADD COLUMN IF NOT EXISTS "adjustment_cop" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payroll_runs" ADD COLUMN IF NOT EXISTS "adjustment_note" TEXT;
ALTER TABLE "payroll_runs" ADD COLUMN IF NOT EXISTS "paid_method" TEXT;
ALTER TABLE "payroll_runs" ADD COLUMN IF NOT EXISTS "payout_ref" TEXT;
ALTER TABLE "payroll_runs" ADD COLUMN IF NOT EXISTS "payout_error" TEXT;

-- Datos bancarios del profesor para la dispersión (sin esto → pago manual).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "payout_account" JSONB;
