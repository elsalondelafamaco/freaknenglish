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

- Fase 2: `users`, `user_roles`, `sessions`, `password_resets`. ✅ DDL abajo.
- Fase 3: `plans`, `subscriptions`, `payment_intents`, `payment_events`.
- Fase 4: `classes`, `class_attendance`, `modules`, `lessons`,
  `lesson_progress`, `checkpoints`, `satisfaction_surveys`.
- Fase 5: `teacher_availability`, `teacher_absences`, `class_validations`.
- Fase 6: `payroll_runs`, `payroll_items`, `content_assets`.

## Fase 2 — Auth & perfiles

> Pensado para Postgres puro. **No** usa `auth.users` de Supabase ni RLS;
> la autorización vive en la capa de servicio (`has_role` en TS).

```sql
-- Roles
create type app_role as enum ('student', 'teacher', 'admin', 'moderator');
create type english_level as enum ('beginner', 'intermediate', 'advanced');

-- Usuarios (fuente de verdad)
create table users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  full_name     text not null,
  avatar_url    text,
  password_hash text,                       -- bcrypt; null para usuarios solo-OAuth
  level         english_level,
  onboarded_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index users_email_idx on users (lower(email));

-- Roles (1-N, NUNCA mezclar con users)
create table user_roles (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  role    app_role not null,
  unique (user_id, role)
);
create index user_roles_user_idx on user_roles (user_id);

-- Sesiones (JWT opaco + refresh)
create table sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  token_hash  text not null unique,         -- SHA-256 del token entregado al cliente
  user_agent  text,
  ip          inet,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index sessions_user_idx on sessions (user_id);

-- Reset de contraseña
create table password_resets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  used_at     timestamptz
);

-- Cuentas OAuth (Google) opcional
create table oauth_accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  provider        text not null,             -- 'google', 'apple', ...
  provider_uid    text not null,
  created_at      timestamptz not null default now(),
  unique (provider, provider_uid)
);
```

### Equivalencias en el mock actual

| Tabla SQL          | Storage mock                                  |
| ------------------ | --------------------------------------------- |
| `users`            | `freakn.db.v1 → users{id:User}`               |
| `user_roles`       | embebido en `User.roles[]`                    |
| `sessions`         | `freakn.session.v1` (única sesión activa)     |
| `password_resets`  | `freakn.db.v1 → meta.resets{token:email}`     |
| `password_hash`    | `freakn.db.v1 → meta.passwordsByEmail` (plano, solo dev) |
| `oauth_accounts`   | TBD — el mock no persiste identidad de provider |

## Fase 4 — Portal estudiante (clases + aprendizaje)

```sql
create type class_status as enum ('scheduled', 'completed', 'canceled', 'missed');
create type lesson_kind  as enum ('video', 'pdf', 'slides', 'download');

-- Clases 1-on-1 agendadas. Una clase = un slot de 50 min.
create table classes (
  id                    uuid primary key default gen_random_uuid(),
  student_id            uuid not null references users(id) on delete cascade,
  teacher_id            uuid not null references users(id) on delete restrict,
  starts_at             timestamptz not null,
  duration_min          int  not null default 50,
  status                class_status not null default 'scheduled',
  topic                 text,
  meeting_url           text,
  student_confirmed_at  timestamptz,           -- "sí, tomé mi clase"
  teacher_validated_at  timestamptz,           -- cross-check del profe
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index classes_student_starts_idx on classes (student_id, starts_at);
create index classes_teacher_starts_idx on classes (teacher_id, starts_at);

-- Catálogo CMS (lo administra Fase 6). Por ahora se sirve estático en código.
create table modules (
  id             uuid primary key default gen_random_uuid(),
  level          english_level not null,
  ord            int  not null,
  title          text not null,
  summary        text not null,
  cover_emoji    text,
  checkpoint_id  uuid,                          -- FK definido más abajo
  created_at     timestamptz not null default now()
);

create table lessons (
  id          uuid primary key default gen_random_uuid(),
  module_id   uuid not null references modules(id) on delete cascade,
  ord         int  not null,
  title       text not null,
  kind        lesson_kind not null,
  url         text not null,
  est_minutes int  not null default 0
);
create index lessons_module_idx on lessons (module_id, ord);

-- Progreso por usuario.
create table lesson_progress (
  user_id      uuid not null references users(id) on delete cascade,
  lesson_id    uuid not null references lessons(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

-- Checkpoints (exámenes de nivel). Las preguntas viven en JSON por simplicidad.
create table checkpoints (
  id             uuid primary key default gen_random_uuid(),
  level          english_level not null,
  unlocks_level  english_level not null,
  title          text not null,
  pass_score     int  not null,
  questions      jsonb not null   -- [{id, prompt, options[], correct_index}]
);
alter table modules
  add constraint modules_checkpoint_fk
  foreign key (checkpoint_id) references checkpoints(id) on delete set null;

create table checkpoint_attempts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(id) on delete cascade,
  checkpoint_id  uuid not null references checkpoints(id) on delete cascade,
  score          int not null,
  passed         boolean not null,
  taken_at       timestamptz not null default now()
);
create index checkpoint_attempts_user_idx on checkpoint_attempts (user_id, checkpoint_id);

-- Encuesta de satisfacción mensual (NPS 0-10).
create table satisfaction_surveys (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  month_key    text not null,                 -- 'YYYY-MM'
  nps          smallint not null check (nps between 0 and 10),
  comment      text,
  submitted_at timestamptz not null default now(),
  unique (user_id, month_key)
);
```

### Reglas de negocio Fase 4

- **Cancelar/reprogramar** requiere ≥ `RESCHEDULE_LOCK_HOURS` (12h por defecto)
  antes de `starts_at`. Constante en `src/lib/domain/classes.ts`; en backend
  debe vivir en `class_policies` o variable de entorno.
- **Asistencia**: `student_confirmed_at` lo setea el estudiante (botón
  "Sí, tomé mi clase hoy"). `teacher_validated_at` lo setea el profe en
  Fase 5. Si las dos coinciden → cuenta para nómina del profesor.
- **Desbloqueo de nivel**: requiere `checkpoint_attempts.passed = true` para
  el `checkpoint` del nivel actual. El siguiente nivel se desbloquea
  automáticamente (consulta `bestCheckpointAttempt`).
- **Encuesta mensual**: si no existe row en `satisfaction_surveys` con
  `month_key = to_char(now(),'YYYY-MM')` para ese usuario, el cliente abre
  el popup al entrar a `/app`. En backend, un cron diario marca usuarios
  pendientes y envía recordatorio por Resend (ver `docs/backend-jobs.md`).

### Equivalencias en el mock actual

| Tabla SQL               | Storage mock                                       |
| ----------------------- | -------------------------------------------------- |
| `classes`               | `freakn.db.v1 → classes{id:ClassSession}`          |
| `modules` + `lessons`   | constante `MODULES` en `src/lib/domain/learning.ts`|
| `lesson_progress`       | `freakn.db.v1 → lessonProgress{userId:lessonId}`   |
| `checkpoints`           | constante `CHECKPOINTS` en `learning.ts`           |
| `checkpoint_attempts`   | `freakn.db.v1 → checkpointAttempts{id:Attempt}`    |
| `satisfaction_surveys`  | `freakn.db.v1 → satisfactionSurveys{id:Survey}`    |
## Fase 5 — Portal Profesor

```sql
-- Notas privadas del profesor sobre una clase / estudiante.
create table class_notes (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null references users(id) on delete cascade,
  student_id   uuid not null references users(id) on delete cascade,
  class_id     uuid references classes(id) on delete set null,
  body         text not null,
  rating       smallint check (rating between 1 and 5),
  created_at   timestamptz not null default now()
);
create index on class_notes (teacher_id, student_id, created_at desc);

-- La validación cruzada del profesor reusa columnas en `classes`:
--   teacher_validated_at  timestamptz
--   status                'completed' | 'missed' | 'scheduled' | 'canceled'
-- (ya declaradas en Fase 4)

-- Disponibilidad / ausencias del profesor (para asignación automática).
create table teacher_availability (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null references users(id) on delete cascade,
  weekday      smallint not null check (weekday between 0 and 6),
  start_time   time not null,
  end_time     time not null
);

create table teacher_absences (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null references users(id) on delete cascade,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  reason       text
);
```

**Reglas de negocio** (Fase 5):
- El profesor valida asistencia con `teacher_validate_attendance(class_id, attended)`; setea `status` y `teacher_validated_at`.
- Una clase con `student_confirmed_at` pero sin `teacher_validated_at` aparece en el filtro "Pendientes".
- Las notas son **privadas** del profesor; sólo el autor y admins las leen.

## Fase 6 — Panel Admin

Esta fase **no** crea tablas nuevas; agrega vistas/consultas y configuración
sobre las tablas existentes.

```sql
-- Configuración global (pago por clase, recordatorios, etc.).
create table app_settings (
  key          text primary key,
  value        jsonb not null,
  updated_at   timestamptz not null default now()
);
-- Seed inicial:
insert into app_settings (key, value) values
  ('teacher_payrate_cop', '18000'::jsonb),
  ('reschedule_lock_hours', '12'::jsonb);

-- Histórico de nóminas generadas (PDF / CSV exportado).
create table payroll_runs (
  id           uuid primary key default gen_random_uuid(),
  month_key    text not null,         -- 'YYYY-MM'
  total_cop    bigint not null,
  generated_by uuid references users(id),
  generated_at timestamptz not null default now(),
  payload      jsonb not null         -- detalle por profesor (snapshot)
);
create index on payroll_runs (month_key);
```

**Reglas de negocio** (Fase 6):
- KPIs (MRR, NPS, asistencia) son funciones puras sobre `subscriptions`,
  `classes` y `satisfaction_surveys` — no requieren cache mientras el
  volumen sea bajo. Para escala mayor, materializar en vistas Postgres.
- Nómina: sólo clases con `status='completed' AND teacher_validated_at IS NOT NULL`
  cuentan para el pago. `teacher_payrate_cop` vive en `app_settings`.
- El CMS edita `modules`/`lessons`/`checkpoints` con guardado optimista; el
  contenido es estático en el mock (Fase 6 sólo lo expone en modo lectura).
