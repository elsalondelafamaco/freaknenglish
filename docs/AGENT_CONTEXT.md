# Contexto para agente de migración (Opus) — Freakn English

Este archivo es el **briefing único** para un agente que va a migrar el
proyecto desde TanStack Start + capa mock a **Next.js 15 + NestJS + Postgres
en Railway**, con un board en tiempo real.

## 1. Qué es el producto

Plataforma SaaS de clases de inglés **1 a 1** en vivo. Tres portales:

- **Estudiante** (`/app`): dashboard con próxima clase, confirmación de
  asistencia, calendario con regla de 12h para cancelar/reagendar, módulos
  de aprendizaje por nivel (Beginner / Intermediate / Advanced) con video,
  PDF y slides, checkpoints (exámenes) para subir de nivel, NPS mensual,
  settings.
- **Profesor** (`/teacher`): clases del día con validación de asistencia,
  agenda filtrable, listado de estudiantes asignados, notas privadas + rating
  por clase.
- **Admin** (`/admin`): analytics (MRR, NPS, asistencia, suscripciones),
  CRM de usuarios, CMS read-only del catálogo, nómina mensual de profes con
  export CSV, panel de automatizaciones (emails).

Cobros mensuales recurrentes vía **Wompi (Widget de Checkout)**. Emails
transaccionales vía **Resend**.

## 2. Stack actual (a reemplazar)

- **Frontend**: React 19 + TanStack Router (file-based en `src/routes/`) +
  Tailwind v4 + shadcn/ui + Bricolage Grotesque / Plus Jakarta Sans.
- **Server**: `createServerFn` de TanStack Start (no se está usando en
  serio todavía — la capa real es mock).
- **Persistencia**: mock en memoria + `localStorage`, ver
  `src/lib/domain/repository.ts`. **Nada toca Supabase ni una DB real
  todavía** (decisión del producto para no rehacer).
- **Auth**: mock (`src/lib/domain/auth.ts`) con seed de 3 usuarios.
- **Pagos**: Widget Wompi embebido en `/checkout/$planId`, retorno en
  `/checkout/return`. Webhook **no** implementado.
- **PWA**: manifest + íconos listos, sin service worker. Ver
  `docs/pwa-and-stores.md`.

## 3. Stack objetivo (recomendado)

| Capa            | Tecnología                                        | Por qué                                                                 |
| --------------- | ------------------------------------------------- | ----------------------------------------------------------------------- |
| Frontend        | **Next.js 15 (App Router) + React 19**            | Server components, streaming, mismo `tailwind v4` + shadcn ya en uso.   |
| Backend API     | **NestJS 11** (modular, DI, guards)               | CRM/admin/payroll/teacher justifican estructura; mejor que Express puro. Si el equipo prefiere algo más liviano: Fastify + tRPC. |
| Realtime        | **Socket.IO gateway de Nest** + Redis adapter     | El board en vivo necesita rooms, reconnect, fallback. Railway soporta WS y tiene Redis plugin. |
| ORM             | **Prisma**                                        | Tipos compartidos con el front, migraciones simples, funciona en Railway out of the box. |
| DB              | **Postgres 16 gestionado en Railway**             | Sin Docker en producción. Docker sólo local con `docker-compose` para paridad. |
| Cache / pubsub  | **Redis (Railway plugin)**                        | Socket.IO multi-instancia + colas BullMQ.                                |
| Jobs            | **BullMQ** (Redis) corriendo en un worker Nest    | Reminders 24h/1h, abandoned cart, NPS, renewal — ver `backend-jobs.md`. |
| Auth            | **Auth.js (NextAuth v5)** en Next + **JWT firmado** consumido por Nest vía `JwtStrategy` (Passport) | Una sola sesión httpOnly cookie en el navegador; Nest valida el JWT en cada request y en el handshake del socket. |
| Pagos           | Wompi Widget (sin cambios) + webhook en `POST /api/v1/wompi/webhook` (Nest) | El Widget no cambia; sólo se mueve la verificación de firma del webhook a Nest. |
| Emails          | Resend                                            | Ya integrado, mismo SDK funciona en Node.                                |
| Storage         | Cloudflare R2 o Railway Volumes para PDFs/slides  | Evitar Supabase Storage.                                                |
| Deploy          | Railway: 3 servicios (web Next, api Nest, worker Nest) + Postgres + Redis | Un solo proyecto Railway, mismo private networking.                     |

### Por qué Nest y no Express puro
- Hay 3 dominios bien separados (student / teacher / admin) + jobs + sockets.
- Guards y `RolesGuard` resuelven el `has_role` actual sin reinventarlo.
- `@nestjs/schedule`, `@nestjs/bull`, `@nestjs/websockets` cubren cron, queues
  y realtime con la misma DI.
- Si el equipo es muy pequeño y el board realtime es lo único pesado, una
  alternativa válida es **Fastify + tRPC + ws** — más liviano pero menos
  estructura. Recomendación principal: **NestJS**.

### Por qué Postgres gestionado y no Docker en prod
- Railway Postgres es 1 click, tiene backups automáticos, métricas y URL
  privada (`DATABASE_URL`) inyectada como variable.
- Docker en prod sería para self-hosting; en Railway agrega fricción sin
  beneficio. **Sí** mantener `docker-compose.yml` local con Postgres + Redis
  para que cualquiera arranque el stack con un comando.

## 4. Mapa de carpetas objetivo

```
freakn/
├── apps/
│   ├── web/                  # Next.js 15 (App Router)
│   │   ├── app/
│   │   │   ├── (marketing)/  # landing pública
│   │   │   ├── (auth)/       # login/signup/forgot/reset
│   │   │   ├── checkout/[planId]/
│   │   │   ├── (app)/app/    # portal estudiante (auth required)
│   │   │   ├── (app)/teacher/
│   │   │   ├── (app)/admin/
│   │   │   └── api/wompi/webhook/route.ts  # opcional, también puede vivir en Nest
│   │   ├── components/       # copiar desde src/components
│   │   └── lib/
│   └── api/                  # NestJS
│       ├── src/
│       │   ├── auth/         # JwtStrategy, AuthController, RolesGuard
│       │   ├── users/
│       │   ├── classes/
│       │   ├── learning/
│       │   ├── subscriptions/
│       │   ├── payments/     # wompi webhook + reconciliación
│       │   ├── notifications/# Resend + BullMQ producers
│       │   ├── admin/        # analytics, payroll, CRM
│       │   ├── board/        # WebSocketGateway del board en vivo
│       │   └── jobs/         # BullMQ workers (reminders, abandoned cart)
│       └── prisma/schema.prisma
├── packages/
│   ├── shared/               # tipos compartidos (User, EnglishLevel, Plan...)
│   └── ui/                   # opcional, shadcn components
├── docker-compose.yml        # postgres + redis local
└── railway.json              # service config
```

Monorepo con **pnpm workspaces** + **Turborepo**. Build pipeline:
`shared → api → web`.

## 5. Realtime "board en vivo"

Requisito: durante la clase, profe y estudiante comparten un canvas /
pizarra colaborativo en tiempo real (cursors, texto, dibujo, opcional video
por Jitsi/Daily embebido).

- **Transporte**: Socket.IO sobre Nest WebSocketGateway. Rooms por
  `classId`. Auth en `handshake.auth.token` validado con el mismo JWT.
- **Modelo de datos**: eventos efímeros via Redis pub/sub (no se guardan).
  Estado canónico del board guardado cada N segundos en
  `board_snapshots(class_id, payload_jsonb, updated_at)` para reconectar.
- **CRDT opcional**: si el board necesita edición concurrente fuerte (varios
  estudiantes), usar **Yjs + y-websocket**. Para 1-on-1 con un solo "editor"
  a la vez, basta con broadcast de operaciones.
- **Escalado**: `@socket.io/redis-adapter` para que múltiples instancias del
  servicio API compartan rooms.
- **Schema sugerido**:
  ```sql
  create table board_snapshots (
    class_id uuid primary key references classes(id) on delete cascade,
    payload jsonb not null,
    updated_at timestamptz not null default now()
  );
  ```

## 6. Lo que YA está documentado en este repo (leer antes de migrar)

- `docs/data-model.md` — **DDL SQL completo y portable** de todas las
  tablas: `users`, `user_roles`, `sessions`, `subscriptions`,
  `payment_intents`, `classes`, `class_notes`, `teacher_availability`,
  `teacher_absences`, `modules`, `lessons`, `lesson_progress`,
  `checkpoints`, `satisfaction_surveys`, `app_settings`, `payroll_runs`,
  `notifications`. **No** usa RLS ni `auth.users` — listo para Postgres
  puro. Mapéalo directo a `schema.prisma`.
- `docs/backend-jobs.md` — contratos de **cron jobs y webhooks**: reminders
  24h/1h, abandoned cart 30min, NPS mensual, renewal 3 días, webhook Wompi.
  Cada uno con trigger, payload, side effects y secrets.
- `docs/migration.md` — mapa pieza por pieza del corte y convenciones.
- `docs/pwa-and-stores.md` — manifest + ruta a Play (Bubblewrap) / App
  Store (Capacitor).
- `src/lib/domain/*.ts` — **lógica de negocio aislada** en TypeScript puro,
  sin dependencias de framework. Cada archivo es 1:1 con un módulo Nest:
  - `auth.ts` → `AuthModule`
  - `plans.ts` → catálogo estático, mover a `subscriptions/plans.ts`
  - `subscriptions.ts` → `SubscriptionsModule`
  - `classes.ts` → `ClassesModule`
  - `learning.ts` → `LearningModule`
  - `survey.ts` → `NotificationsModule` (NPS)
  - `admin.ts` → `AdminModule` (analytics, payroll)
  - `notifications.ts` + `notification-templates.ts` → `NotificationsModule`
    + BullMQ workers. **El adapter pattern (`Transport`) ya está hecho**:
    `LogTransport` (dev) y `ResendTransport` placeholder — sólo hay que
    completar este último.
- `src/lib/domain/types.ts` — tipos canónicos. Mover a `packages/shared`.

## 7. Reglas de negocio críticas (no perder en la migración)

1. **Regla de 12h**: cancelar/reagendar bloqueado si faltan <12h para la
   clase (`classes.ts → canCancelClass`).
2. **Checkpoints gated**: subir de nivel requiere aprobar el examen del
   nivel actual (`learning.ts`).
3. **Roles**: `student | teacher | admin`. Tabla separada `user_roles`
   (nunca en `users.role`). Función `has_role(user_id, role)` → `RolesGuard`.
4. **Asistencia**: profe valida con botones "Validó / No asistió". La
   nómina sólo paga clases con `attendance_status = 'validated'`.
5. **NPS**: una sola encuesta por usuario por mes (`dedupe_key` con
   `YYYY-MM`).
6. **Notificaciones idempotentes**: tabla `notifications` con `dedupe_key`
   único — no re-enviar.
7. **Wompi**: el **webhook** es la única fuente de verdad para activar
   suscripción. El retorno del navegador es sólo UX, nunca activa nada solo.

## 8. Credenciales seed (mantener en migración para QA)

| Email                 | Password    | Rol     | Notas                                |
| --------------------- | ----------- | ------- | ------------------------------------ |
| estudiante@freakn.dev | Freakn123!  | student | Tiene suscripción `active` al 4-días |
| profe@freakn.dev      | Freakn123!  | teacher | Asignado al estudiante demo          |
| admin@freakn.dev      | Freakn123!  | admin   |                                      |

Implementar como **seed Prisma** (`prisma/seed.ts`) replicando
`src/lib/domain/seed.ts`.

## 9. Variables de entorno objetivo

```
# apps/web (Next)
NEXT_PUBLIC_API_URL=https://api.freakn.app
NEXT_PUBLIC_WOMPI_PUBLIC_KEY=pub_prod_xxx
AUTH_SECRET=...                 # NextAuth
AUTH_URL=https://app.freakn.app
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# apps/api (Nest)
DATABASE_URL=postgresql://...   # inyectado por Railway
REDIS_URL=redis://...           # inyectado por Railway
JWT_SECRET=...                  # mismo que firma NextAuth
WOMPI_EVENTS_SECRET=...         # para verificar firma del webhook
WOMPI_PRIVATE_KEY=prv_prod_xxx
RESEND_API_KEY=...
APP_URL=https://app.freakn.app  # para links en emails
TEACHER_PAYRATE_COP=15000       # default; override en app_settings
```

## 10. Deploy en Railway (paso a paso resumido)

1. Crear proyecto Railway, agregar plugins **Postgres** y **Redis**.
2. Servicio `api` (NestJS) → `Dockerfile` o build pack Node. `start: node dist/main.js`. Auto-inyecta `DATABASE_URL`, `REDIS_URL`.
3. Servicio `worker` (mismo repo, distinto comando: `node dist/jobs/main.js`).
4. Servicio `web` (Next) → variables `NEXT_PUBLIC_API_URL` apuntando al dominio interno del `api`.
5. Dominios públicos: `app.freakn.app` → web, `api.freakn.app` → api.
6. Migraciones: `prisma migrate deploy` como **deploy command** del servicio `api`.
7. Seed inicial: ejecutar `prisma db seed` una sola vez via Railway shell.

## 11. Cosas que NO se deben portar

- Mock `localStorage` repos — reemplazar 100% por Prisma.
- `src/lib/domain/repository.ts` (estado en memoria).
- `seed.ts` del lado cliente — re-implementar como `prisma/seed.ts`.
- TanStack Router config, `routeTree.gen.ts`, `__root.tsx`.
- Cualquier mención a Lovable Cloud / Supabase.

## 12. Cosas que SÍ se portan tal cual

- Todos los componentes UI de `src/components/`.
- Design tokens en `src/styles.css` (Tailwind v4 `@theme`).
- Assets en `src/assets/` y `public/`.
- Lógica pura en `src/lib/domain/` (sin los imports de mock).
- Plantillas de email (`notification-templates.ts`).
- Contrato del Widget Wompi en checkout.
- DDL de `docs/data-model.md` → `prisma/schema.prisma`.