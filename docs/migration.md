# Plan de migración a Next.js + Node + Postgres + Railway

Este documento es el contrato para portar Freakn English desde el stack actual
(TanStack Start + Lovable Cloud) a **Next.js (App Router) + Node + Postgres
desplegado en Railway**. Toda decisión de arquitectura en este repo se toma
pensando en esta migración.

## Estado actual (resumen)

- **Frontend**: React 19 + TanStack Router + Tailwind v4 + shadcn/ui.
- **Server**: `createServerFn` de TanStack Start (compatible con edge).
- **Auth & datos**: capa **mock** en `src/lib/domain/` con `localStorage` para
  permitir recorrer flujos sin backend real. **Aún no implementada**, se
  introduce en la Fase 2.
- **Pagos**: Wompi vía Widget de Checkout embebido (sin API server-side).
- **Email**: Resend (real) vía secret `RESEND_API_KEY` (Fase 6).

## Mapa de migración

| Pieza actual                                     | Reemplazo en Railway                            |
| ------------------------------------------------ | ----------------------------------------------- |
| TanStack file routes (`src/routes/*`)            | Next.js App Router (`app/*`)                     |
| `createServerFn` (`*.functions.ts`)              | Server actions o `app/api/.../route.ts`         |
| Mock repos (`src/lib/domain/*`)                  | Implementación Postgres con Prisma o Drizzle    |
| Mock `AuthService`                               | NextAuth.js v5 (credentials + Google) + JWT     |
| Lovable Cloud secrets                            | Variables de entorno en Railway                  |
| Webhook Wompi → Edge Function de Supabase (tú)   | Ruta `app/api/wompi/webhook/route.ts` en Next    |
| Cron jobs documentados en `docs/backend-jobs.md` | Railway Cron / BullMQ / pg_cron                  |

## Convenciones que facilitan el corte

1. **Repositorios y servicios desacoplados** en `src/lib/domain/` —
   TypeScript puro, sin imports de TanStack ni Supabase. Cada servicio define
   una interfaz; la implementación actual es mock (`InMemory*`), la futura
   será `Postgres*`.
2. **Server functions = capa fina**. Cada `*.functions.ts` lleva un JSDoc con
   el endpoint REST equivalente, por ejemplo:
   ```ts
   /** @endpoint POST /api/v1/classes/attendance */
   ```
   Esto permite portarlo 1:1 a `app/api/v1/classes/attendance/route.ts` o un
   controller Express.
3. **Schema de datos** en `docs/data-model.md` como DDL SQL portable
   (Postgres). No depende de RLS, GoTrue ni `auth.users`. Las "policies"
   equivalentes se aplican a nivel de servicio.
4. **Edge functions futuras** en `docs/backend-jobs.md`: una por job con
   propósito, trigger, payload, side effects y secrets. Migración 1:1 a
   Edge Function de Supabase **o** worker Node en Railway.
5. **Env vars** centralizadas en `src/lib/env.ts` con tipos y comentario del
   mapeo `VITE_*` / `process.env.*` ↔ `.env` de Next.
6. **Email** vía un único `EmailService` (Resend). El cliente Resend funciona
   tal cual en Node — no hay nada que migrar.
7. **Frontend** ya es React + Tailwind + shadcn. Para portar:
   - `createFileRoute` → segmentos `app/` de Next.
   - `head()` → `export const metadata`.
   - `Link` → `next/link`.
   - `useNavigate` → `useRouter` de `next/navigation`.

## Checklist de portabilidad por feature

Cada feature nueva debe verificar:

- [ ] Lógica de negocio en `src/lib/domain/`, no dentro de un componente o
      ruta.
- [ ] Schema documentado en `docs/data-model.md` si toca persistencia.
- [ ] Jobs/webhooks documentados en `docs/backend-jobs.md`.
- [ ] Secrets nuevos listados en `src/lib/env.ts`.
- [ ] Nada que dependa de APIs exclusivas de Supabase (Realtime, RLS, GoTrue,
      `auth.users`) — usar abstracciones propias.

## Lo que **NO** se debe usar

- `auth.users` ni triggers de Supabase como fuente de verdad — usar tabla
  `users` propia.
- RLS — la autorización vive en la capa de servicio (`has_role` en TS).
- `supabase.functions.invoke` desde el cliente — llamar siempre vía la capa
  de servicios.
- Realtime de Supabase — si se necesita realtime, dejarlo abstraído tras una
  interfaz para enchufar luego Pusher / WebSockets nativos.