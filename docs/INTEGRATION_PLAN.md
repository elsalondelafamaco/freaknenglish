# Plan de Integración Storefront ↔ Backend

> Este documento es el **mapa completo** para conectar el storefront (TanStack Start)
> al backend NestJS. Está estructurado por **fases ejecutables** — cada fase deja la
> app más funcional sin romper lo anterior.

## 0. Estado actual (lo que ya quedó listo este commit)

- ✅ `storefront/src/lib/api/client.ts` — fetch wrapper con JWT en memoria, refresh
  automático vía cookie httpOnly, retry en 401.
- ✅ `storefront/src/lib/api/endpoints.ts` — wrappers tipados para **todos** los
  módulos del backend (auth, users, plans, checkout, subscriptions, classes,
  learning, teachers, admin, surveys, boards).
- ✅ `storefront/src/lib/api/bootstrap.ts` — `hydrateFromBackend()` que adapta la
  respuesta del backend (Prisma shape) al shape histórico de `readDb()` para que
  las rutas existentes funcionen sin reescribirse.
- ✅ `storefront/src/lib/domain/auth.ts` — reemplazado el `MockAuthService` por
  un `BackendAuthService` con la misma interfaz pública. Añade
  `tryRestoreSession()` y `finishOAuthLogin()`.
- ✅ `storefront/src/lib/auth/AuthProvider.tsx` — al montar intenta refresh
  (cookie httpOnly) y rehidrata.
- ✅ `storefront/src/routes/auth.callback.tsx` — callback de Google OAuth.
- ✅ Backend gaps cubiertos:
  `/classes/upcoming`, `/classes/today`, `/teacher/schedule?status=`,
  `/subscriptions/resume`, `/surveys/pending`, `/learning/progress`,
  `/learning/checkpoints/:id`, `/admin/content`, `/admin/notifications`,
  `/admin/notifications/run`, `/admin/payroll/export.csv`.

## 1. Variables de entorno

### `storefront/.env.local`
```
VITE_API_URL=http://localhost:3000/api/v1
VITE_WOMPI_PUBLIC_KEY=pub_test_...
VITE_STOREFRONT_URL=http://localhost:5173
```

### `backend/.env`
```
# Server
PORT=3000
API_PREFIX=api/v1
CORS_ORIGINS=http://localhost:5173,https://app.freakn.dev

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/freakn

# Auth
JWT_ACCESS_SECRET=<openssl rand -hex 32>
JWT_REFRESH_SECRET=<openssl rand -hex 32>
JWT_ACCESS_TTL=900            # 15 min
JWT_REFRESH_TTL=2592000       # 30 días
REFRESH_COOKIE_NAME=freakn_rt
REFRESH_COOKIE_DOMAIN=.freakn.dev   # vacío en dev

# OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=http://localhost:3000/api/v1/auth/google/callback
STOREFRONT_OAUTH_REDIRECT=http://localhost:5173/auth/callback

# Wompi
WOMPI_PUBLIC_KEY=pub_test_...
WOMPI_PRIVATE_KEY=prv_test_...
WOMPI_INTEGRITY_SECRET=...
WOMPI_EVENTS_SECRET=...

# Resend
RESEND_API_KEY=re_...
RESEND_FROM="Freakn <hola@freakn.dev>"

# Redis (BullMQ + Socket.IO adapter)
REDIS_URL=redis://localhost:6379
```

## 2. Fases pendientes (orden de implementación)

### Fase A — Login y rutas de auth (1-2h)
Estado: **conectado**. QA manual:
1. `pnpm dev` en backend + storefront.
2. `/signup` → debe llamar `POST /auth/signup`, recibir accessToken y cookie.
3. `/login` → ídem con `POST /auth/login`.
4. Recargar la página → `tryRestoreSession()` debe loguear sin pedir credenciales.
5. `/forgot-password` → `POST /auth/forgot` (Resend envía email real).
6. Google OAuth → redirige al backend y vuelve a `/auth/callback`.

**TODO en el backend si no está**: endpoint `GET /auth/google` que redirige a
Google, y `GET /auth/google/callback` que tras validar redirige a
`${STOREFRONT_OAUTH_REDIRECT}?accessToken=...`.

### Fase B — Checkout (Wompi widget)
Reemplazar en `routes/checkout/$planId.tsx` la creación local de `PaymentIntent`
por:
```ts
const { reference, amountInCents, signature, publicKey, redirectUrl }
  = await checkoutApi.createIntent({ planId, customerEmail, customerName });
```
y pasar esos campos al widget de Wompi (`data-integrity`, `data-reference`,
`data-amount-in-cents`, `data-currency`, `data-public-key`, `data-redirect-url`).

El backend ya calcula la firma de integridad — el front nunca toca el secret.

Webhook (`POST /checkout/wompi/webhook`) ya está en NestJS; al recibir
`transaction.updated` con `status=APPROVED` crea/activa la subscription.
`/checkout/return` del storefront ya queda solo como vista de éxito que llama a
`subscriptionsApi.mine()` para mostrar el plan activo.

### Fase C — Clases (estudiante)
Reemplazar en `routes/_authenticated/app/calendar.tsx` y `app/index.tsx`:
| Mock actual                                | API a usar                          |
| ------------------------------------------ | ----------------------------------- |
| `getUpcomingClasses(userId)`               | `classesApi.list()` (ya hidratado)  |
| `getNextClass(userId)`                     | `classesApi.upcoming()`             |
| `confirmAttendance(classId)`               | `classesApi.confirm(id)`            |
| `rescheduleClass(id, date)`                | `classesApi.reschedule(id, s, e)`   |
| `cancelClass(id)`                          | `classesApi.cancel(id, reason)`     |

La regla de 12h ya está duplicada en backend (`ClassesService.canMutate`) — el
front solo muestra el botón disabled; el backend rechaza con 422 si llega tarde.

### Fase D — Learning (estudiante)
| Mock                                       | API                                  |
| ------------------------------------------ | ------------------------------------ |
| `getModulesForLevel(level)`                | `learningApi.modules(level)`         |
| `getLessonProgress(userId, lessonId)`      | `learningApi.progress()` (agregado)  |
| `markLessonComplete(...)`                  | `learningApi.saveLessonProgress(...)`|
| `getCheckpoint(id)`                        | `learningApi.checkpoint(id)`         |
| `submitCheckpoint(id, answers)`            | `learningApi.submitCheckpoint(...)`  |

Los módulos se hidrataron en `readDb.meta.modules` para que `learning.ts` siga
sirviendo lecturas sin red. Para la migración limpia: hacer que los routes
lean directo con `useQuery(['module', id], () => learningApi.module(id))`.

### Fase E — Profesor
| Vista                       | API                                       |
| --------------------------- | ----------------------------------------- |
| `/teacher` (hoy)            | `classesApi.todayForTeacher()`            |
| `/teacher/schedule`         | `teachersApi.schedule('upcoming'|'past')` |
| `/teacher/students`         | `teachersApi.students()`                  |
| `/teacher/students/$id`     | `teachersApi.studentDetail(id)`           |
| Validar asistencia          | `classesApi.validate(id)`                 |
| Notas privadas              | `teachersApi.addNote(classId, rating, n)` |

### Fase F — Admin
| Vista                       | API                                       |
| --------------------------- | ----------------------------------------- |
| `/admin` (analytics)        | `adminApi.analytics()`                    |
| `/admin/users`              | `adminApi.users(q)`                       |
| `/admin/content`            | `adminApi.content()`                      |
| `/admin/payroll`            | `adminApi.payroll(period)` + `payrollCsv` |
| `/admin/notifications`      | `adminApi.notifications(status)`          |
| Botón "Ejecutar ahora"      | `adminApi.runAutomations()`               |

### Fase G — Realtime Board (Socket.IO)
Crear `storefront/src/lib/realtime/useBoardSocket.ts`:
```ts
import { io, Socket } from "socket.io-client";
import { getAccessToken, API_URL } from "@/lib/api/client";

export function useBoardSocket(boardId: string) {
  const socketRef = useRef<Socket | null>(null);
  useEffect(() => {
    const url = API_URL.replace(/\/api\/v1$/, "");
    const s = io(`${url}/boards`, {
      auth: { token: getAccessToken() },
      transports: ["websocket"],
    });
    s.emit("board:join", { boardId });
    s.on("board:op", handleRemoteOp);
    s.on("board:cursor", handleRemoteCursor);
    socketRef.current = s;
    return () => { s.disconnect(); };
  }, [boardId]);
  // ...
}
```

Contrato backend (ya implementado en `BoardGateway`):
- `board:join` → `{ boardId }`
- `board:op` → `{ boardId, op: { type, payload, lamport } }`
- `board:cursor` → `{ boardId, x, y }`
- broadcast: mismos eventos con `userId` añadido.
- REST: `GET /boards/:id/ops?since=<lamport>` para sync inicial.

### Fase H — Realtime extras
- **Notificaciones in-app**: subscribir a `notifications:new` por user.
- **Presence en clase**: cuando el estudiante abre el meeting URL, el teacher ve
  un dot verde (`class:presence`).

## 3. Mapa exhaustivo de endpoints

| Método | Path                                  | Auth   | Implementado |
| ------ | ------------------------------------- | ------ | ------------ |
| POST   | /auth/signup                          | none   | ✅           |
| POST   | /auth/login                           | none   | ✅           |
| POST   | /auth/refresh                         | cookie | ✅           |
| POST   | /auth/logout                          | jwt    | ✅           |
| POST   | /auth/forgot                          | none   | ✅           |
| POST   | /auth/reset                           | none   | ✅           |
| GET    | /auth/google                          | none   | ⚠️ verificar |
| GET    | /auth/google/callback                 | none   | ⚠️ verificar |
| GET    | /me                                   | jwt    | ✅           |
| PATCH  | /me                                   | jwt    | ✅           |
| GET    | /plans                                | none   | ✅           |
| POST   | /checkout/intents                     | none   | ✅           |
| POST   | /checkout/wompi/webhook               | sig    | ✅           |
| GET    | /subscriptions/mine                   | jwt    | ✅           |
| POST   | /subscriptions/cancel                 | jwt    | ✅           |
| POST   | /subscriptions/resume                 | jwt    | ✅           |
| GET    | /classes                              | jwt    | ✅           |
| GET    | /classes/upcoming                     | jwt    | ✅           |
| GET    | /classes/today                        | teacher| ✅           |
| POST   | /classes/:id/confirm                  | student| ✅           |
| POST   | /classes/:id/validate                 | teacher| ✅           |
| POST   | /classes/:id/reschedule               | jwt    | ✅           |
| POST   | /classes/:id/cancel                   | jwt    | ✅           |
| GET    | /learning/modules                     | jwt    | ✅           |
| GET    | /learning/modules/:id                 | jwt    | ✅           |
| GET    | /learning/progress                    | jwt    | ✅           |
| POST   | /learning/progress                    | jwt    | ✅           |
| GET    | /learning/checkpoints/:id             | jwt    | ✅           |
| POST   | /learning/checkpoints/:id/submit      | jwt    | ✅           |
| GET    | /teacher/students                     | teacher| ✅           |
| GET    | /teacher/students/:id                 | teacher| ✅           |
| GET    | /teacher/schedule                     | teacher| ✅           |
| POST   | /teacher/classes/:id/notes            | teacher| ✅           |
| GET    | /admin/analytics                      | admin  | ✅           |
| GET    | /admin/users                          | admin  | ✅           |
| GET    | /admin/content                        | admin  | ✅           |
| GET    | /admin/payroll                        | admin  | ✅           |
| GET    | /admin/payroll/export.csv             | admin  | ✅           |
| GET    | /admin/notifications                  | admin  | ✅           |
| POST   | /admin/notifications/run              | admin  | ✅           |
| GET    | /surveys/pending                      | jwt    | ✅           |
| POST   | /surveys/nps                          | jwt    | ✅           |
| GET    | /boards                               | jwt    | ✅           |
| POST   | /boards                               | jwt    | ✅           |
| GET    | /boards/:id                           | jwt    | ✅           |
| GET    | /boards/:id/ops?since=N               | jwt    | ✅           |
| POST   | /boards/:id/invite                    | owner  | ✅           |
| WS     | /boards (Socket.IO)                   | jwt    | ✅           |

## 4. Cómo correr todo localmente

```bash
# Postgres + Redis
docker compose -f backend/docker-compose.yml up -d

# Backend
cd backend
pnpm install
pnpm prisma migrate deploy
pnpm prisma db seed
pnpm dev   # arranca en :3000

# Storefront
cd ../storefront
pnpm install
pnpm dev   # arranca en :5173
```

## 5. Despliegue a Railway

1. Crear servicio **Postgres** en Railway → copiar `DATABASE_URL`.
2. Crear servicio **Redis** en Railway → copiar `REDIS_URL`.
3. Crear servicio **backend** apuntando a `backend/` (usa `Dockerfile`):
   - Set env vars del `.env.example`.
   - Build command: `pnpm install && pnpm prisma migrate deploy && pnpm build`.
   - Start command: `node dist/main.js`.
4. Crear servicio **storefront** apuntando a `storefront/`:
   - Build: `pnpm install && pnpm build`.
   - Start: `node .output/server/index.mjs`.
   - `VITE_API_URL=https://api.freakn.dev/api/v1`.
5. Configurar dominios y CORS_ORIGINS.
6. Subir webhook URL al panel de Wompi:
   `https://api.freakn.dev/api/v1/checkout/wompi/webhook`.

## 6. Checklist de "completamente funcional"

- [ ] Login con email/password real.
- [ ] Login con Google.
- [ ] Signup crea usuario en Postgres.
- [ ] Checkout completo con widget Wompi → webhook → suscripción activa.
- [ ] Dashboard estudiante muestra próxima clase (`/classes/upcoming`).
- [ ] Confirmar asistencia escribe en BD.
- [ ] Reagendar/cancelar respeta la regla de 12h server-side.
- [ ] Learning lista módulos por nivel desde BD.
- [ ] Checkpoint guarda intento y desbloquea siguiente nivel.
- [ ] Profesor ve sus clases del día.
- [ ] Profesor agrega nota privada a clase.
- [ ] Admin ve KPIs reales (MRR, NPS, attendance).
- [ ] Admin descarga CSV de nómina.
- [ ] Resend envía: bienvenida, recordatorio 24h, NPS mensual, carrito abandonado.
- [ ] Board colaborativo: 2 navegadores ven cambios en tiempo real.
- [ ] PWA instalable en móvil.

## 7. Notas de portabilidad (cuando migremos el storefront a Next)

Como el storefront ya habla HTTP puro con el backend, migrar a Next.js es:
1. Copiar `src/lib/api/*` tal cual (cambiar `import.meta.env` por `process.env`).
2. Reemplazar TanStack Router por App Router de Next.
3. Reemplazar `AuthProvider` por NextAuth si se quiere, o mantener el actual
   (el backend ya emite JWTs propios — NextAuth no es obligatorio).
4. SSR de páginas públicas: usar `fetch()` server-side directo al backend con
   `cache: 'no-store'` o `revalidate: 60`.