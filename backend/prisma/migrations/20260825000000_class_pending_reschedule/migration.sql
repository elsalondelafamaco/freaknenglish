-- Congelar una clase a la espera de nueva fecha.
--
-- Sin esto, una clase que el profe tenía que mover pero sin fecha definida se
-- auto-validaba al pasar la hora (el job `tick-5m` la daba por tomada) y
-- entraba a nómina. `pending_reschedule` la deja fuera de esa regla hasta que
-- se defina el nuevo horario.
ALTER TYPE "ClassStatus" ADD VALUE IF NOT EXISTS 'pending_reschedule';

ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "frozen_at" TIMESTAMP(3);
ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "freeze_reason" TEXT;
