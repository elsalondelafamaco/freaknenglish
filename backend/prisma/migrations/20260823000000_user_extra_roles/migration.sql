-- Multi-rol: roles ADICIONALES al principal (`role`).
-- Caso real: un admin que además dicta clases queda con
-- role='admin' y extra_roles='{teacher}' en vez de tener dos cuentas.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "extra_roles" "AppRole"[] NOT NULL DEFAULT '{}';
