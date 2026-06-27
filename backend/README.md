# Freakn Backend — NestJS 10 + Prisma + Socket.IO

Backend monorepo package for **Freakn English 1-on-1**. Designed to deploy as a
single Docker container on **Railway** with managed **Postgres** + **Redis**.

## Layout

```
backend/
├── prisma/
│   ├── schema.prisma     # 1:1 with docs/data-model.md
│   └── seed.ts           # demo users (estudiante / profe / admin)
├── src/
│   ├── main.ts           # bootstrap (Swagger, CORS, Redis IO adapter)
│   ├── app.module.ts     # composes all modules
│   ├── config/env.ts     # zod-validated env vars
│   ├── prisma/           # PrismaService (global)
│   ├── common/           # guards (jwt, roles) + decorators
│   └── modules/
│       ├── auth/         # signup / login / refresh / google / forgot / reset
│       ├── users/        # /me
│       ├── plans/        # public plan catalog
│       ├── subscriptions/
│       ├── checkout/     # creates PaymentIntent + Wompi signature
│       ├── wompi/        # HMAC-verified webhook
│       ├── classes/      # student + teacher class actions (12h rule)
│       ├── learning/     # modules, lessons, progress, checkpoints
│       ├── teachers/     # students list, notes
│       ├── admin/        # analytics, users (CRM), payroll
│       ├── surveys/      # monthly NPS
│       ├── notifications/# Resend transport + templates
│       ├── board/        # 🔴 realtime board (Socket.IO + Redis adapter)
│       ├── jobs/         # BullMQ queues for cron automations
│       └── health/       # /health (used by Railway healthcheck)
├── Dockerfile
├── railway.json
├── docker-compose.yml    # local Postgres + Redis
└── .env.example
```

## Local development

```bash
cd backend
cp .env.example .env       # fill in JWT secrets at minimum
docker compose up -d       # Postgres + Redis
bun install                # or: npm install
bun run prisma:migrate     # creates schema
bun run prisma:seed        # demo users
bun run dev                # nest start --watch
```

Swagger UI: <http://localhost:3000/api/docs>.

## Demo credentials (same as storefront mock)

| Role     | Email                    | Password    |
| -------- | ------------------------ | ----------- |
| student  | estudiante@freakn.dev    | Freakn123!  |
| teacher  | profe@freakn.dev         | Freakn123!  |
| admin    | admin@freakn.dev         | Freakn123!  |

## Deploy to Railway

1. **Create services** in your Railway project:
   - **Postgres** plugin → exposes `DATABASE_URL`.
   - **Redis** plugin → exposes `REDIS_URL`.
   - **Backend service** pointing to this `backend/` directory.
2. Railway detects `railway.json` and builds via the Dockerfile.
3. Set environment variables from `.env.example` (Railway Variables tab).
   `DATABASE_URL` and `REDIS_URL` are auto-injected when you reference the plugins.
4. The container's `CMD` runs `prisma migrate deploy` before `node dist/main.js`,
   so the schema is always in sync.
5. **Wompi webhook URL**: `https://<your-railway-domain>/api/v1/public/wompi/webhook`
   — configure this in the Wompi merchant dashboard (Eventos).

## Realtime board contract

See `src/modules/board/board.gateway.ts` header comment. Client connects to
`/board` namespace with JWT in `auth.token`, joins via `board:join`, emits
`board:op` and `board:cursor`. Server fan-outs via Redis adapter so multiple
Nest replicas stay in sync. After reconnect, clients should call
`GET /api/v1/boards/:id/ops?since=N` to catch up missed ops.

## Notes for the future Next.js migration

- All route handlers are thin controllers calling typed services — the
  services can be lifted into Next.js Route Handlers (`app/api/.../route.ts`)
  unchanged.
- Auth is JWT-based (no Nest-specific sessions), so NextAuth on the
  storefront can share the same secret to validate access tokens.
- Prisma schema and the BullMQ queues are framework-agnostic.
