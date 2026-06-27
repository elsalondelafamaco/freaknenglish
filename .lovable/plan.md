
# Reestructura a monorepo: `storefront/` + `backend/`

## 1. Layout del repo

```text
freakn/
├── storefront/                  # todo el front actual (lo que hoy está en /)
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── vite.config.ts
│   └── .env.example             # VITE_API_URL, VITE_WS_URL, VITE_WOMPI_PUBLIC_KEY...
├── backend/                     # NestJS nuevo
│   ├── src/
│   ├── prisma/
│   ├── test/
│   ├── Dockerfile
│   ├── railway.json
│   ├── package.json
│   ├── tsconfig.json
│   ├── nest-cli.json
│   └── .env.example
├── docs/                        # los docs existentes se quedan a raíz
│   ├── AGENT_CONTEXT.md
│   ├── migration.md             # se actualiza: "migración completada parcialmente"
│   ├── data-model.md
│   ├── backend-jobs.md
│   ├── pwa-and-stores.md
│   └── deploy-railway.md        # NUEVO
├── package.json                 # workspace raíz (bun workspaces) opcional
├── .gitignore
└── README.md                    # NUEVO: explica monorepo y cómo correr cada parte
```

Lovable seguirá corriendo **solo `storefront/`** (se ajusta `.lovable/project.json` o el root del dev server). Tú trabajas `backend/` localmente.

---

## 2. Storefront (mover, no reescribir)

- Mover `src/`, `public/`, `vite.config.ts`, `tsconfig.json`, `components.json`, `bunfig.toml`, `eslint.config.js`, `.prettierrc` → `storefront/`.
- Crear `storefront/.env.example` con:
  ```text
  VITE_API_URL=http://localhost:3000
  VITE_WS_URL=ws://localhost:3000
  VITE_WOMPI_PUBLIC_KEY=
  VITE_PUBLIC_SITE_URL=http://localhost:5173
  ```
- Crear `storefront/src/lib/api/client.ts` — wrapper fetch que apunta a `VITE_API_URL` con bearer JWT desde `localStorage` (sustituirá progresivamente al mock).
- Crear `storefront/src/lib/realtime/socket.ts` — cliente `socket.io-client` para el board en tiempo real (sin conectarse aún; queda el módulo listo).
- **No se eliminan los mocks** (`src/lib/domain/*`). Quedan como fallback para que la UI siga funcionando hasta que conectes Nest. Documentado en `storefront/README.md`.
- Ajustar `.lovable/project.json` para que el dev server arranque en `storefront/`.

---

## 3. Backend (NestJS scaffold completo)

### 3.1 Stack

- **NestJS 10** (TS, decoradores).
- **Prisma** como ORM (schema portable, migraciones nativas, tipos auto-generados).
- **PostgreSQL 16** (Railway add-on).
- **Redis** (Railway add-on) — para BullMQ y adapter de Socket.IO.
- **Socket.IO** vía `@nestjs/websockets` con `@socket.io/redis-adapter` para escalado horizontal.
- **BullMQ** vía `@nestjs/bullmq` para cron y jobs (reminders, abandoned cart, NPS, renovación).
- **JWT** vía `@nestjs/jwt` + `passport-jwt`. Auth propia (no Supabase). Google OAuth con `passport-google-oauth20`.
- **Resend** vía SDK oficial.
- **Wompi** webhook con verificación HMAC.
- **Zod** para validación de DTOs (con `nestjs-zod`) — mismos schemas que el front podrá importar luego si se quiere monorepo de tipos.
- **Pino** para logs estructurados.
- **Swagger** (`@nestjs/swagger`) → `GET /api/docs`.

### 3.2 Estructura de módulos

```text
backend/src/
├── main.ts
├── app.module.ts
├── config/                      # ConfigModule, validación con Zod
├── prisma/
│   └── prisma.service.ts
├── common/                      # filters, guards globales, interceptors, pipes
│   ├── guards/jwt-auth.guard.ts
│   ├── guards/roles.guard.ts
│   ├── decorators/roles.decorator.ts
│   └── decorators/current-user.decorator.ts
├── modules/
│   ├── auth/                    # signup, login, refresh, google, forgot/reset
│   ├── users/
│   ├── plans/                   # catálogo (mismo que storefront/plans.ts)
│   ├── subscriptions/           # estado, periodo, cancel
│   ├── checkout/                # crea PaymentIntent, devuelve datos para widget Wompi
│   ├── wompi/                   # webhook /api/public/wompi/webhook (HMAC)
│   ├── classes/                 # CRUD, attendance, reschedule (regla 12h)
│   ├── learning/                # modules, lessons, progress, checkpoints
│   ├── teachers/                # availability, students, notes, rating
│   ├── admin/                   # analytics (MRR, NPS), payroll, users mgmt
│   ├── notifications/           # NotificationService + ResendTransport
│   ├── surveys/                 # NPS / satisfaction
│   ├── board/                   # ★ realtime board (Socket.IO Gateway)
│   └── jobs/                    # BullMQ producers/consumers
└── jobs/processors/             # reminder-24h, reminder-1h, abandoned-cart, nps-monthly, renewal-3d
```

### 3.3 Endpoints (REST + WS)

REST espejo de los `src/lib/domain/*` actuales del storefront. Todos prefijados `/api/v1`. Públicos en `/api/v1/public/*`:

- `POST /api/v1/auth/signup | /login | /refresh | /logout | /forgot | /reset`
- `GET  /api/v1/auth/google` / `GET /api/v1/auth/google/callback`
- `GET  /api/v1/me`, `PATCH /api/v1/me`
- `GET  /api/v1/plans` (público)
- `POST /api/v1/checkout/intents` → `{ reference, amountInCents, signature }` para widget
- `POST /api/v1/public/wompi/webhook` (HMAC verify, idempotente por `event.id`)
- `GET/POST /api/v1/classes`, `POST /api/v1/classes/:id/attendance`, `POST /api/v1/classes/:id/reschedule`
- `GET /api/v1/learning/modules`, `GET .../:id`, `POST .../progress`, `POST /api/v1/checkpoints/:id/submit`
- `GET/POST /api/v1/teacher/...`, `GET /api/v1/teacher/students/:id/notes`
- `GET /api/v1/admin/analytics`, `GET /api/v1/admin/payroll`, `GET /api/v1/admin/users`
- `POST /api/v1/surveys/nps`

WebSocket namespace `/board` (JWT en handshake):
- `board:join { boardId }`
- `board:cursor`, `board:stroke`, `board:object:add|update|delete`
- Broadcast a la sala con Redis adapter.

Todos los controllers llevan JSDoc del endpoint, DTO con Zod, guard de rol y `@ApiOperation` para Swagger.

### 3.4 Prisma schema (desde `docs/data-model.md`)

Traducir 1:1 las tablas ya documentadas a `prisma/schema.prisma`:
- `users`, `user_roles` (enum `AppRole`)
- `subscriptions`, `plans` (seed)
- `payment_intents`, `payment_events`
- `classes`, `class_notes`, `teacher_availability`, `teacher_absences`
- `modules`, `lessons`, `lesson_progress`, `checkpoints`, `checkpoint_attempts`
- `satisfaction_surveys`
- `notifications` (con `dedupe_key` único)
- `app_settings`, `payroll_runs`
- `boards`, `board_objects`, `board_snapshots` ★ (nuevo, para el realtime board)

Migración inicial: `prisma migrate dev --name init`. Seeds en `prisma/seed.ts` replicando `src/lib/domain/seed.ts` (los 3 usuarios demo).

### 3.5 Jobs (BullMQ)

Cron declarados en `JobsModule` siguiendo `docs/backend-jobs.md`:
- `reminder-24h` cada hora
- `reminder-1h` cada 5 min
- `abandoned-cart` cada 15 min
- `nps-monthly` diario 09:00
- `renewal-3d` diario 08:00

Cada uno usa `NotificationService` → `ResendTransport` (real) con `dedupe_key` para idempotencia.

### 3.6 Wompi

- `WompiService.createIntent(planId, userId)` → genera `reference`, calcula `amountInCents`, firma con `WOMPI_INTEGRITY_SECRET` y devuelve payload listo para el widget.
- `POST /api/v1/public/wompi/webhook`: verifica firma HMAC, upsert de `payment_event`, si `APPROVED` activa subscription + dispara welcome email. Idempotente por `event.id`.

### 3.7 Deploy a Railway

- `backend/Dockerfile` multi-stage (build → distroless/node:20-alpine).
- `backend/railway.json` con `startCommand: "npx prisma migrate deploy && node dist/main.js"`.
- Servicios en Railway: **Postgres**, **Redis**, **backend (Nest)**. Storefront se queda en Lovable (o se mueve a Vercel/Railway luego).
- Variables (template en `backend/.env.example`):
  ```text
  NODE_ENV=production
  PORT=3000
  DATABASE_URL=                  # Railway lo inyecta
  REDIS_URL=                     # Railway lo inyecta
  JWT_SECRET=
  JWT_REFRESH_SECRET=
  JWT_EXPIRES_IN=15m
  JWT_REFRESH_EXPIRES_IN=30d
  GOOGLE_CLIENT_ID=
  GOOGLE_CLIENT_SECRET=
  GOOGLE_CALLBACK_URL=
  RESEND_API_KEY=
  RESEND_FROM="Freakn <hola@freakn.com>"
  WOMPI_PUBLIC_KEY=
  WOMPI_PRIVATE_KEY=
  WOMPI_INTEGRITY_SECRET=
  WOMPI_EVENTS_SECRET=
  PUBLIC_SITE_URL=https://freakn.com
  CORS_ORIGINS=https://freakn.com,http://localhost:5173
  TEACHER_PAYRATE_COP=15000
  ```

### 3.8 DX local

- `backend/docker-compose.yml` opcional con Postgres + Redis para que tú levantes todo con `docker compose up -d` y luego `bun run start:dev` (sin meter Nest en Docker — más rápido en dev).
- Scripts: `dev`, `build`, `start:prod`, `prisma:migrate`, `prisma:seed`, `test`, `test:e2e`.
- `backend/README.md` con: requisitos, comandos, cómo correr migraciones, cómo apuntar el storefront a `http://localhost:3000`.

---

## 4. Documentación

- **`README.md`** (raíz, nuevo): explica monorepo, "Lovable corre storefront", cómo bajar y correr backend localmente, link a `docs/deploy-railway.md`.
- **`docs/deploy-railway.md`** (nuevo): paso a paso — crear proyecto Railway, agregar Postgres, agregar Redis, crear servicio backend desde el repo (root `backend/`), pegar env vars, configurar Google OAuth callback, configurar webhook Wompi apuntando a `https://<railway-domain>/api/v1/public/wompi/webhook`, dominio custom, logs.
- **`docs/migration.md`**: actualizar — Fase de migración a Nest **completada en código**, queda conectar el storefront.
- **`docs/AGENT_CONTEXT.md`**: actualizar sección de stack y mapa de carpetas.

---

## 5. Lo que **no** se hace en este paso

- No se borran los mocks del storefront (queda como fallback).
- No se cambia ninguna UI.
- No se conecta el storefront al backend todavía (sería un PR siguiente, cuando tú ya tengas Nest corriendo en Railway o local).
- No se intenta correr `nest start` en el sandbox (no soportado).

---

## 6. Detalles técnicos clave (resumen)

- **Auth**: JWT access (15m) + refresh (30d) httpOnly cookie + access en `Authorization: Bearer`. `RolesGuard` lee `role` del JWT (sin tabla `user_roles` separada — se simplifica vs el patrón Supabase, todo dentro de Nest).
- **Realtime board**: Gateway con `@WebSocketGateway({ namespace: '/board', cors: { origin: CORS_ORIGINS } })`, autenticación en `handleConnection` validando JWT del query/handshake, persistencia incremental cada N operaciones a `board_snapshots` (jsonb) para reconectar rápido.
- **Idempotencia**: webhooks Wompi + envíos de email usan unique keys (`event_id`, `dedupe_key`).
- **CORS**: lista blanca desde env, no `*`.
- **Migración futura a otro hosting**: Prisma + Postgres puro + Redis estándar = portable a Fly, Render, AWS sin tocar código.

¿Procedo así o quieres ajustar algo (ej. cambiar Prisma por Drizzle, omitir BullMQ, agregar tests e2e, etc.) antes de pasar a build?
