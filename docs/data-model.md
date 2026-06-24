# Modelo de datos (Postgres portable)

Este archivo es la fuente de verdad del schema. DDL pensado para Postgres
estándar (Railway, Supabase, Neon, RDS) — sin features exclusivas de
Supabase. Se va completando con cada fase. La Fase 1 (landing) no requiere
tablas; las siguientes fases agregan sus secciones aquí.

## Convenciones

- Todas las tablas tienen `id uuid primary key default gen_random_uuid()`.
- Timestamps `created_at`, `updated_at` `timestamptz` con default `now()`.
- FKs con `on delete cascade` para datos dependientes, `on delete set null`
  para referencias débiles.
- Enums declarados con `create type` (portables a cualquier Postgres).
- Índices explícitos en columnas filtradas o ordenadas.

## Roles

```sql
create type app_role as enum ('student', 'teacher', 'admin', 'moderator');
```

Pendiente de definir en Fase 2 (auth + onboarding).

## Tablas previstas (se llenan por fase)

- Fase 2: `users`, `user_roles`, `sessions`, `password_resets`.
- Fase 3: `plans`, `subscriptions`, `payment_intents`, `payment_events`.
- Fase 4: `classes`, `class_attendance`, `modules`, `lessons`,
  `lesson_progress`, `checkpoints`, `satisfaction_surveys`.
- Fase 5: `teacher_availability`, `teacher_absences`, `class_validations`.
- Fase 6: `payroll_runs`, `payroll_items`, `content_assets`.