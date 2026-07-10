
# Objetivo

Hacer la app 100% funcional contra el backend Nest. Cero `localStorage`, cero
`readDb/writeDb`, cero servicios mock (`@/lib/domain/*` como fuente de verdad).
Cada pantalla lee/escribe vía `endpoints.ts` con TanStack Query, y las
mutaciones invalidan sus queries.

# Diagnóstico

Hoy la arquitectura es híbrida:
- `endpoints.ts` ya cubre todos los módulos del backend (auth, users,
  scheduling, plans, checkout, subscriptions, classes, learning, teachers,
  admin, surveys, notifications, boards, receipts).
- Pero en login se corre `hydrateFromBackend()` que **copia todo** al store
  local (`lib/domain/repository.ts`, persistido en `localStorage`), y ~20
  rutas + 10 servicios (`lib/domain/*.ts`) siguen leyendo de ese store.
- Efectos: datos rancios entre pestañas, mutaciones que solo tocan el mock
  (no llegan al server), cambios que "no se ven" hasta re-login, y todo el
  estado sensible viviendo en `localStorage`.

Archivos con dependencia de `readDb/writeDb` o `lib/domain/*`:
- Servicios mock: `auth.ts`, `classes.ts`, `learning.ts`, `subscriptions.ts`,
  `admin.ts`, `admin-actions.ts`, `notifications.ts`, `survey.ts`,
  `app-settings.ts`, `repository.ts`, `seed.ts`.
- Rutas: `_authenticated/{app.index, app.calendar, app.learning,
  app.learning.$moduleId, app.checkpoint.$checkpointId, app.settings,
  app.subscribe, teacher.index, teacher.schedule, teacher.students,
  teacher.students.$studentId, admin.index, admin.users.index,
  admin.users.$id, admin.notifications}.tsx`.
- Otros: `AuthProvider.tsx`, `ImpersonationBanner.tsx`, `Pricing.tsx`,
  `checkout.$planId.tsx`, `login/forgot/reset/auth.callback`,
  `bootstrap.ts`.

# Plan de migración (por fases, cada una construye y typecheckea aislada)

## Fase 1 · Cimientos (auth + query)
- `AuthProvider`: dejar de cachear el usuario en `readDb`. Usar `usersApi.me()`
  con `useQuery(['me'])`, refresh silencioso y `queryClient.clear()` en logout.
- Borrar `hydrateFromBackend` (ya no necesario) y `clearLocalState`.
- `login/signup/forgot/reset/auth.callback`: usar `authApi` directo.
- Configurar `queryClient` con `staleTime` razonable y `refetchOnWindowFocus`.

## Fase 2 · Rutas de estudiante
- `app.index` → `classesApi.upcoming` + `learningApi.progress` + `surveysApi.pending`.
- `app.calendar` → `classesApi.list` + mutaciones `confirm/reschedule/cancel`.
- `app.learning` + `app.learning.$moduleId` → `learningApi.modules/module/progress`
  con `saveLessonProgress` como mutation.
- `app.checkpoint.$checkpointId` → `learningApi.checkpoint/submitCheckpoint`.
- `app.subscribe` + `app.settings` + `checkout.$planId` → `plansApi.list`,
  `subscriptionsApi.mine/cancel/resume`, `checkoutApi`, `usersApi.payments`,
  `receiptsApi`.

## Fase 3 · Rutas de profesor
- `teacher.index/schedule/students/students.$id` → `teachersApi.*` con
  mutaciones para `addNote`, `myAvailability`, `validate`.

## Fase 4 · Admin (y endpoints backend faltantes)
- `admin.index` → `adminApi.metrics` (ya existe).
- `admin.users.index/$id` → `adminApi.users/userDetail/createUser/updateUser/
  setUserStatus/softDeleteUser/resetPassword/assignTeacher/impersonate`.
- `admin.notifications` → `adminApi.notifications/runAutomations`.
- Añadir en el backend los que faltan (si aparece alguno al migrar):
  detalle histórico de progreso por lección, notas por alumno para admin,
  audit log de impersonation.

## Fase 5 · Impersonation sin localStorage
- Mover el estado de impersonation a una cookie httpOnly firmada por el
  backend (o al mismo access token con claim `imp: <targetId>`), leído por
  `usersApi.me()`. `ImpersonationBanner` consume `me()`; `startImpersonation/
  stopImpersonation` son endpoints ya existentes.

## Fase 6 · Limpieza final
- Borrar `lib/domain/repository.ts`, `seed.ts`, `notifications.ts`,
  `survey.ts`, `admin.ts`, `admin-actions.ts`, `classes.ts` (mock),
  `learning.ts` (mock), `subscriptions.ts` (mock), `app-settings.ts`,
  `notification-templates.ts` (queda solo en el backend), `auth.ts` (mock).
- Mantener SOLO `lib/domain/types.ts` (contratos compartidos) y
  `lib/domain/plans.ts` si tiene helpers puros (`formatCop`).
- Borrar `lib/api/bootstrap.ts` y todos los adapters.
- Grep final: `rg "readDb|writeDb|localStorage|lib/domain/(repository|seed|notifications|survey|admin|admin-actions|classes|learning|subscriptions|app-settings|auth)"` → 0 resultados.
- Verificación: build + typecheck de storefront y backend, y smoke E2E con
  Playwright (login → dashboard → clase → learning → checkpoint → admin).

# Detalles técnicos

- Toda query define `queryKey` estable y `queryFn` que llama a `endpoints.ts`.
  Ej.: `['classes', 'upcoming']`, `['learning', 'module', id]`,
  `['admin', 'users', q]`. Cada mutación invalida su(s) key(s) padre.
- Errores: `ApiError` de `client.ts` se muestra en toasts (`use-toast`).
- Loading: `Skeleton` de shadcn en cada `isPending`.
- SSR: los loaders siguen ligeros; usamos `ensureQueryData` cuando la ruta
  necesita datos antes de pintar (login-gated → ya está bajo `_authenticated`,
  seguro para llamar).
- Cookies: el refresh token ya vive en cookie httpOnly, el access token en
  memoria. No queda nada persistido en cliente.

# Alcance / preguntas

Es un refactor grande (~35 archivos tocados, ~10 borrados). Puedo hacerlo
todo de una sola tirada o entregarlo por fases con build verde en cada una.
Si prefieres, arranco por Fase 1+2 (auth + estudiante) que es lo que más ve
el usuario final, y sigo con profesor/admin después.
