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