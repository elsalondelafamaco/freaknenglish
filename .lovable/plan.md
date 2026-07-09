## Correcciones Freakn — Round 6 (todo conectado al backend)

Se agrupan por área y todas eliminan cualquier mock/localStorage remanente.

---

### 1. Logout confiable en todos los roles
**Problema**: A veces queda en blanco tras cerrar sesión.
**Causa probable**: `signOut()` no invalida queries de React Query, no navega y depende de re-render vía `setUser(null)` mientras loaders/queries protegidos siguen corriendo → error boundary sin render.
**Fix**:
- En `AuthProvider.signOut`: `queryClient.cancelQueries()` → `queryClient.clear()` → `authService.signOut()` (server: revoca refresh cookie) → `setUser(null)` → `router.navigate({ to: '/login', replace: true })` → `router.invalidate()`.
- Exponer el logout desde un hook `useLogout()` que reciba `router`+`queryClient` (los componentes ya los tienen).
- Reemplazar todas las llamadas a `signOut()` (navbar, app shell, admin, teacher).

### 2. NPS conectado y disparado por reglas reales
**Reglas**: mostrar cuando el estudiante tiene programada su **última clase de la mensualidad** (o cuando la suscripción está `expired`/`past_due` y aún no respondió NPS de ese período). Nada de localStorage.
**Backend**:
- `GET /surveys/pending` → devuelve `{ required: boolean, period: 'YYYY-MM', reason: 'last_class'|'period_ended' }`.
  Lógica: calcula el período actual (basado en `subscription.currentPeriodEnd`). `required=true` sii:
   a) existe `Class` con `status='scheduled'` que es la **última** del período (mayor `startsAt` ≤ `currentPeriodEnd`) y no hay `SatisfactionSurvey` para ese `period`, **o**
   b) `subscription.status in ('expired','past_due','canceled')` y falta encuesta del último período con actividad.
- `POST /surveys` ya existe; asegurar `period` derivado en el servidor (no en el cliente).
**Frontend**:
- `AppShell` consulta `surveysApi.pending()` con React Query; muestra `<SatisfactionDialog>` bloqueante solo si `required`. Al enviar, invalida la query. Eliminar cualquier trigger por fecha/local.

### 3. Home → "Escoge tu horario" fluye correctamente
**Problema**: El CTA lleva directo a checkout sin plan.
**Fix**:
- Todos los CTAs de la home (`Hero`, `HowItWorks`, `Pricing`) anclan a `#precios`.
- En `Pricing`, cada plan tiene botón "Elegir plan" → `/checkout/$planId`.
- Si el usuario está autenticado y sin suscripción activa, el gate del onboarding continúa siendo: `elegir plan → datos (checkout form) → pago Wompi → return → onboarding/schedule`.
- Añadir breadcrumb visible de 4 pasos en `checkout.$planId` y `checkout.return` y `onboarding/schedule`.

### 4. Integración real con Wompi (widget/redirección real)
**Problema**: solo muestra "Simular pago aprobado".
**Fix backend**:
- `CheckoutService.createIntent` ya calcula `signature`. Añadir soporte a **Web Checkout redirect** (además del widget) devolviendo `checkoutUrl` = `https://checkout.wompi.co/p/?public-key=...&currency=COP&amount-in-cents=...&reference=...&signature:integrity=...&redirect-url=...&customer-data:...`.
- Endpoint `GET /checkout/status` ya existe → se sigue usando en la página de retorno.
- Webhook `/api/v1/public/wompi/webhook` valida HMAC (ya implementado). Confirmar que al recibir `APPROVED` marca `PaymentIntent.APPROVED`, activa `Subscription.status='active'`, setea `currentPeriodEnd = now + 30d` y crea/asocia el `User`.
**Fix frontend** (`checkout.$planId.tsx`):
- Botón principal: **"Pagar con Wompi"** → si `intent.checkoutUrl` existe, `window.location.href = intent.checkoutUrl` (redirect real).
- Solo si `WOMPI_PUBLIC_KEY` no está o el backend responde `demo=true`, se muestra el fallback "Simular pago (solo desarrollo)".
- Renombrar copy: "Pagar con Wompi" / "Ir a la pasarela segura".
- `checkout.return.tsx` mantiene polling `checkoutApi.status(reference)` y al `APPROVED` redirige a `/app` → el gate lleva a `/onboarding/schedule`.

### 5. Gate global de onboarding + bloqueo de módulos
**Regla**: usuario registrado sin pago no puede acceder a learning/board.
**Backend**:
- Endpoint `GET /me/state` → `{ hasProfile, hasSubscription, subscriptionStatus, hasSchedule, pendingSurvey }`.
- Middleware `RequireActiveSubscriptionGuard` aplicado a rutas de learning/board/classes: si no hay suscripción `active`, responde `402`. Aplicar en:
  - `learning.controller` (todos los GET de módulos/lessons/checkpoints).
  - `classes.controller` (GET student).
  - `board.controller` / `board.gateway`.
- `SatisfactionInterceptor`: para estudiantes con `pendingSurvey`, bloquea (403) todas las rutas no-encuesta hasta que responda.
**Frontend** (`_authenticated.tsx`):
- Redirige en orden: `profile` → `plan (#precios)` → `checkout` → `schedule` → `dashboard`.
- Si `pendingSurvey.required` → renderiza `<SatisfactionDialog>` bloqueante sobre cualquier ruta.
- Si backend responde 402 (por race condition) → redirige a `#precios`.

### 6. Admin NPS conectado
**Backend**: `GET /admin/surveys` con filtros `?period=YYYY-MM&level=&teacherId=` → devuelve agregados (NPS promedio, distribución promotores/pasivos/detractores, teacherScore, contentScore, platformScore) + lista paginada.
**Frontend**: `admin.surveys.tsx` reemplaza mocks por `useQuery(['admin','surveys',filters])`. Muestra KPIs, tabla y CSV export vía `/admin/surveys/csv`.

### 7. Precio con TRM del día
**Backend**:
- Nuevo módulo `exchange`:
  - `ExchangeService.getUsdCopTrm()`: fetch a la API oficial (Superfinanciera SODA: `https://www.datos.gov.co/resource/32sa-8pi3.json`) con cache in-memory de 6h y fallback estático (`env.FALLBACK_TRM_COP=4200`).
  - `GET /public/exchange/trm` → `{ trm, source, fetchedAt }`.
- `Plan.priceUsd` (nuevo campo) o computado desde `priceCop / trm`. Se agrega `priceUsd` al schema y migración.
- `PlansController` devuelve `{ id, name, daysPerWeek, priceCop, priceUsd, priceCopDisplay, priceUsdDisplay, trm }` recalculando `priceCop = round(priceUsd * trm)` en el momento y devolviendo ambos.
- `CheckoutService.createIntent` re-consulta la TRM y crea `PaymentIntent.amountInCents` con el COP calculado en ese instante.
**Frontend**: `Pricing` y `checkout.$planId` consumen precios del backend (sin `plans.ts` hardcoded).

### 8. Admin Content: backend + drag & drop
**Backend**:
- Ya existen módulos/lessons en Prisma. Añadir:
  - `PATCH /admin/modules/reorder` body `[{id, position}]`.
  - `PATCH /admin/lessons/reorder` body `[{id, moduleId, position}]` (soporta mover entre módulos).
  - CRUD `POST/PATCH/DELETE /admin/modules` y `/admin/lessons`.
  - Uploads de attachments vía `storage` module (ya existe).
**Frontend** (`admin.content.tsx`):
- Reemplazar el orden numérico por drag & drop con `@dnd-kit/core` + `@dnd-kit/sortable` (ya en el stack o `bun add`).
- Persistencia optimista: al drop, ejecuta `reorder` mutation → invalida `useQuery(['admin','content'])`.
- Editor de lección conectado a `PATCH /admin/lessons/:id` (título, tipo, video/pdf/html/attachments).

### 9. Contenido filtrado por nivel del estudiante
**Backend**:
- `GET /learning/modules` devuelve solo módulos con `level <= user.englishLevel` (beginner→[beginner], intermediate→[beginner,intermediate], advanced→[all]).
- `LessonProgress` determina desbloqueo secuencial: la primera lección del primer módulo del nivel actual está desbloqueada; las siguientes se desbloquean al completar la anterior o pasar el `Checkpoint`.
- `GET /learning/modules/:id` devuelve lecciones con `unlocked: boolean` y `completed: boolean`.
**Frontend** (`app.learning.tsx` y `app.learning.$moduleId.tsx`):
- Consumir el flag `unlocked` del backend, no lógica local.
- Detalle de lección muestra video/PDF/HTML/attachments reales; marca `LessonProgress` al ver ≥90% o al pulsar "Marcar como vista".

### 10. Gate NO redirige a home; membresía visible + historial
**Problema**: hoy redirige a `/#precios` (fuera de la app).
**Fix**:
- Nueva ruta `_authenticated/subscribe.tsx` — vista dentro del portal que muestra planes y CTA a `/checkout/$planId`. El gate redirige aquí en lugar de `/#precios`.
- `app.settings.tsx`: sección "Mi membresía" con estado (`active/pending/past_due/canceled/expired`), próximo cobro, plan, botón "Cambiar plan" y "Cancelar".
- Historial de pagos: `GET /me/payments` → tabla con fecha, monto COP, referencia, estado, comprobante Wompi.

### 11. Panel Profesor: estudiantes asignados + calendario + bloqueos
**Backend**:
- `GET /teacher/students` (ya existe pero devuelve vacío): corregir para que use `assignedTeacherId = req.user.id` en `User`.
- `GET /teacher/calendar?from=&to=` → devuelve `Class[]` + `TeacherAvailability[]` + `TeacherAbsence[]` del profesor.
- `POST /teacher/absences` `{ startsAt, endsAt, reason }` → crea bloqueo (el matcher del scheduling debe respetarlo).
- `PATCH /teacher/availability` → actualizar horario recurrente.
- `SchedulingService.autoAssign` (Item 12) debe excluir profesores con `TeacherAbsence` que solape.
**Frontend**:
- `teacher.students.tsx`: `useQuery(teacherApi.students())`, tabla con nivel, próxima clase, notas.
- `teacher.schedule.tsx`: calendario semanal (react-big-calendar o grid propio) siempre visible; permite crear ausencias/bloqueos (drag-select) y editar disponibilidad.

### 12. Auto-asignación con mensaje de coordinación 48h
**Backend** (`SchedulingService.savePreferences`):
- Para cada bloque preferido, busca profesores con `TeacherAvailability` que cubra el slot y sin `TeacherAbsence` solapando y sin clase ya programada.
- **Toma el primero disponible**, setea `user.assignedTeacherId`, crea `Class` recurrente para las próximas 4 semanas (`ClassStatus.scheduled`) y devuelve `{ status: 'assigned', teacher }`.
- Si NINGÚN bloque encuentra profe, `user.scheduleAssignmentStatus='manual_pending'` y devuelve `{ status: 'manual_pending' }`.
**Frontend** (`onboarding/schedule.tsx`):
- Tras guardar: si `assigned` → toast "¡Listo! Tu profe es X. Primera clase: ...".
- Si `manual_pending` → pantalla amigable: *"Estamos coordinando con un profesor. Te contactaremos en las próximas 48 h para iniciar tus clases. Recibirás un email de confirmación."* + botón "Ir al dashboard" (dashboard entra en modo "esperando profesor" hasta que admin asigne).

---

## Detalles técnicos transversales

**Migraciones nuevas**:
1. `20260812000000_plan_usd_and_trm`: agrega `plans.price_usd` (INT), `plans.price_display` (TEXT), settings key para TRM cache.
2. `20260813000000_module_reorder_positions`: índice único (`level`, `position`) para consistencia.
3. `20260814000000_teacher_students_index`: índice `users(assigned_teacher_id)`.

**Nuevos endpoints** (resumen):
- `GET /me/state`, `GET /me/payments`
- `GET /surveys/pending`
- `GET /admin/surveys`, `GET /admin/surveys/csv`
- `PATCH /admin/modules/reorder`, `PATCH /admin/lessons/reorder`, CRUD módulos/lecciones
- `GET /public/exchange/trm`
- `GET /teacher/students`, `GET /teacher/calendar`, `POST /teacher/absences`, `PATCH /teacher/availability`
- Wompi: `intent.checkoutUrl` en respuesta

**Guards backend**:
- `RequireActiveSubscriptionGuard` (learning/classes/board)
- `RequirePendingSurveyCleared` (interceptor global para estudiantes)

**Dependencias nuevas frontend**: `@dnd-kit/core`, `@dnd-kit/sortable` para admin content.

**Orden de implementación sugerido** (4 sub-iteraciones):
- **D1**: Items 1, 2, 5, 10 (auth/gate/NPS/subscribe view) — base para el resto.
- **D2**: Items 3, 4, 7 (checkout real + TRM + fluid CTA).
- **D3**: Items 8, 9, 6 (content admin + learning filtered + admin NPS).
- **D4**: Items 11, 12 (teacher + auto-assign + coordinación 48h).

Al final: eliminación completa de `plans.ts` hardcoded, `learning` mock, cualquier `localStorage.getItem("freakn.survey…")`, y update de `docs/IMPROVEMENTS_LOG.md` con Round 6.
