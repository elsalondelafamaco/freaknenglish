## Objetivo

Conectar el `storefront/` al backend Nest reemplazando los mocks de `src/lib/domain/*` por un cliente HTTP tipado, manteniendo el contrato actual de hooks/funciones para no reescribir las pantallas. Cerrar los gaps de endpoints que detecté contra los call sites del front.

## Gaps detectados (endpoints o lógica que faltan en backend)

Comparando los controllers actuales contra lo que el storefront ya consume:

1. **Auth** — falta `GET /auth/me` ergonómico (hoy `GET /me`, está bien, solo documentar); falta `POST /auth/google/token` para intercambiar `id_token` del botón Google en el front sin pasar por redirect del backend (opcional, podemos usar solo el flujo redirect).
2. **Classes** — falta `GET /classes/upcoming` (próxima clase del dashboard) y `GET /classes/today` (profesor). Hoy el front filtra en cliente; mejor exponerlo.
3. **Teachers** — falta `GET /teacher/schedule?status=` con filtros (upcoming/past/pending) que ya usa `teacher.schedule.tsx`.
4. **Admin** — falta `GET /admin/content` (CMS read-only de módulos/lecciones) y `GET /admin/notifications` + `POST /admin/notifications/run` (panel de automatizaciones) y `GET /admin/payroll/export.csv`.
5. **Subscriptions** — falta `POST /subscriptions/resume` y exponer `currentPeriodEnd` en `GET /subscriptions/mine` (ya está, verificar shape).
6. **Surveys** — falta `GET /surveys/pending` para que el dashboard sepa si mostrar el dialog NPS del mes.
7. **Learning** — falta `GET /learning/progress` (resumen por nivel para el dashboard) y `GET /learning/checkpoints/:id` (cargar el examen).
8. **Plans** — `GET /plans` está ✓.
9. **Board** — endpoints ya existen; falta solo el handshake JWT en el gateway (verificar `board.gateway.ts`).
10. **Health** — `GET /health` ✓.

## Arquitectura de integración en el storefront

```text
src/lib/
  api/
    client.ts         ← fetch wrapper con baseURL, JWT, refresh automático en 401
    auth.ts           ← login/signup/refresh/logout/google
    plans.ts          ← getPlans()
    checkout.ts       ← createIntent()
    subscriptions.ts  ← getMine, cancel, resume
    classes.ts        ← list, confirm, validate, reschedule, cancel
    learning.ts       ← modules, lesson progress, checkpoints
    teachers.ts       ← students, schedule, notes
    admin.ts          ← analytics, users, payroll, content, notifications
    surveys.ts        ← submitNps, getPending
    board.ts          ← list, create, opsSince + socket factory
  domain/             ← se mantiene SOLO para tipos compartidos y helpers puros
                        (los repositorios mock se borran)
  auth/
    AuthProvider.tsx  ← migra a JWT real (access in memory + refresh in httpOnly… o localStorage por ahora)
    tokenStore.ts     ← guarda access/refresh, expone listener
  realtime/
    useBoardSocket.ts ← hook Socket.IO con auto-reconnect + opsSince catch-up
  query/
    queryClient.ts    ← TanStack Query client + queryKeys
```

### Cliente HTTP (`src/lib/api/client.ts`)

- `fetch` wrapper con `VITE_API_URL` como base, JSON in/out, `Authorization: Bearer <access>`.
- Cola de requests durante refresh: ante un 401 llama `POST /auth/refresh` una sola vez y reintenta.
- Errores tipados (`ApiError` con `status`, `code`, `message`).
- Soporta `AbortSignal` para cancelación de TanStack Query.

### Auth real

- `AuthProvider` mantiene `user` y `accessToken` en memoria; `refreshToken` en `localStorage` (decisión documentada como punto a endurecer a httpOnly cookie cuando se migre a Next).
- Al montar: si hay refresh → `POST /auth/refresh` → setea user con `/me`.
- `signIn/signUp` llaman backend; el formulario de login mantiene el helper "rellenar credenciales" apuntando a los seeds (`estudiante@freakn.dev` / `profe@freakn.dev` / `admin@freakn.dev`).
- Google: botón redirige a `${VITE_API_URL}/auth/google` (el backend ya devuelve al storefront con tokens en query → handler `/auth/callback` los persiste y navega).

### TanStack Query

Adoptar el patrón canónico TanStack: `ensureQueryData` en loaders + `useSuspenseQuery` en componentes. Migración por ruta sin tocar UI:

- `/app` (dashboard): `classes.upcoming`, `subscriptions.mine`, `surveys.pending`, `learning.progress`.
- `/app/calendar`: `classes.list`.
- `/app/learning` + `/app/learning/$moduleId`: `learning.modules`, `learning.module(id)`.
- `/app/checkpoint/$id`: `learning.checkpoint(id)` + mutation `submit`.
- `/app/settings`: `users.me`, `subscriptions.mine`.
- `/teacher`, `/teacher/schedule`, `/teacher/students`, `/teacher/students/$id`: endpoints `teacher/*`.
- `/admin/*`: endpoints `admin/*`.
- `/checkout/$planId` y `/checkout/return`: `plans.get`, `checkout.createIntent`, `subscriptions.mine`.

### Realtime board

- Nueva ruta `/_authenticated/app.board.$boardId.tsx` (sólo si quieres surface ya en UI; mínimo: deja el hook listo).
- `useBoardSocket(boardId)`: conecta a `VITE_WS_URL/boards` con `auth: { token }`, hace `join`, escucha `op`, `presence`, `version`, y al reconectar llama `GET /boards/:id/ops?since=<lastSeq>` para catch-up.
- Tipos compartidos `BoardOp`, `BoardPresence` en `src/lib/domain/board.ts`.

## Cambios en backend (gaps de la sección anterior)

Agregar en los módulos existentes:

- `classes.controller.ts`: `GET /classes/upcoming`, `GET /classes/today`.
- `teachers.controller.ts`: `GET /teacher/schedule?status=`.
- `admin.controller.ts`: `GET /admin/content`, `GET /admin/notifications`, `POST /admin/notifications/run`, `GET /admin/payroll/export.csv`.
- `subscriptions.controller.ts`: `POST /subscriptions/resume`.
- `surveys.controller.ts`: `GET /surveys/pending`.
- `learning.controller.ts`: `GET /learning/progress`, `GET /learning/checkpoints/:id`.
- `board.gateway.ts`: verificar handshake JWT (`socket.handshake.auth.token` → `JwtService.verify`).
- Seed: agregar módulos/lecciones/checkpoints demo y un board demo para `estudiante@freakn.dev` (hoy `prisma/seed.ts` solo trae users/plans/sub).

## Variables de entorno

Confirmar/agregar a `storefront/.env.example`:

```env
VITE_API_URL=http://localhost:3000/api/v1
VITE_WS_URL=http://localhost:3000
VITE_WOMPI_PUBLIC_KEY=pub_test_xxx
VITE_PUBLIC_SITE_URL=http://localhost:5173
```

Backend ya tiene `.env.example` completo; añadir `FRONTEND_URL` para el callback de Google.

## Orden de implementación

1. **Infra cliente**: `api/client.ts`, `tokenStore.ts`, `queryClient.ts`, tipos.
2. **Auth real** + `AuthProvider` + rutas `login/signup/forgot/reset/auth-callback`.
3. **Plans + Checkout + Subscriptions** end-to-end (incluye `return` page leyendo el `payment_intent` real del backend).
4. **Student** (dashboard, calendar, learning, checkpoint, settings, NPS).
5. **Teacher** (today, schedule, students, notes).
6. **Admin** (analytics, users, content, payroll, notifications).
7. **Backend gaps** (en paralelo a 4–6 según se necesiten).
8. **Realtime board** (hook + ruta mínima de prueba).
9. **Limpieza**: borrar `src/lib/domain/repository.ts`, `seed.ts` (mock), `notifications.ts` (mock transport) y los servicios mock. Mantener `types.ts`, `plans.ts` (catálogo display), `notification-templates.ts` (solo si lo usa el admin para preview).
10. **Docs**: actualizar `docs/migration.md` y `docs/AGENT_CONTEXT.md` con el contrato HTTP final y borrar referencias al mock.

## Notas técnicas

- TanStack Start corre en Worker. Los `fetch` van del browser al backend Nest en `localhost:3000` (dev) o Railway (prod). No usamos server functions para proxy — el cliente habla directo al Nest (CORS ya configurado en `main.ts`).
- Rutas `_authenticated/*` siguen con el gate del router; la diferencia es que `context.auth.isAuthenticated` ahora se hidrata desde el refresh real.
- Loaders de rutas protegidas solo corren tras el gate, así que pueden usar `ensureQueryData` sin miedo.
- Mantengo el botón "Simular pago aprobado" en `/checkout/$planId` SOLO si `VITE_WOMPI_PUBLIC_KEY === "pub_test_placeholder"`; con key real desaparece.

## Entregable

Storefront 100% conectado al backend (sin mocks de datos), endpoints faltantes implementados en Nest, board realtime funcional con catch-up, seeds ricos para demo, y `.env.example` listo. La app queda lista para `bun run dev` (storefront) + `bun run backend:dev` (nest + postgres + redis vía docker-compose).
