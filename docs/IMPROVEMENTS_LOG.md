## Round 5 — Checkout Wompi, Onboarding + horarios, Nómina real

## Round 8 — Board colaborativo B3+B4+B6+B7

- **B3 rich editor**: Tiptap con tablas redimensionables, imágenes (upload firmado a S3 vía `POST /boards/:id/uploads/sign`), links, alineación, subrayado, color de texto, resaltado, task lists.
- **B4 drawing**: Capa SVG superpuesta por página con `perfect-freehand`. Trazos persisten en `Y.Array('strokes')` (mismo Y.Doc que el editor → sincronía tiempo real por el mismo canal). Paleta flotante, tamaños, undo por autor, borrar todo.
- **B6 snapshots**: `BoardService.snapshotPage` colapsa `yjsState + ops` en un único update y purga ops persistidos cada 50 ops (async, no bloquea al usuario).
- **B7 invitaciones**: `POST /boards/:id/invite-by-email` + `InviteDialog` que resuelve email → userId y agrega miembro (editor/viewer). Solo owner.
- Backend: `StorageModule` importado en `BoardModule`; `yjs` agregado como dep server-side.
- Frontend: 14 nuevas extensiones Tiptap + `perfect-freehand`. Nuevos archivos: `components/board/DrawLayer.tsx`, `components/board/InviteDialog.tsx`, `lib/board/useDrawLayer.ts`.

### B8 (cierre board)
- Migración `board_page_versions` + modelo Prisma `BoardPageVersion`.
- `BoardService.saveVersion` (fuerza snapshot y persiste bytes Yjs), `listVersions`, `restoreVersion` (reemplaza `yjsState` y purga ops → próximos joins reciben el snapshot restaurado).
- Endpoints REST: `GET/POST /boards/pages/:pageId/versions`, `POST /boards/versions/:versionId/restore`.
- UI `VersionHistory` (guardar con etiqueta, listar, restaurar con confirmación + reload) y export/print en la toolbar del editor: descarga Markdown convertida desde HTML (`lib/board/exportPage.ts`) y `window.print()` para PDF nativo del navegador.


## Round 6 — NPS por reglas, Wompi Web Checkout real, TRM Superfinanciera

### D1 (hecho)
- **Logout robusto** (`AppShell.tsx`): `cancelQueries → clear → signOut →
  navigate('/login', replace) → router.invalidate()`.
- **NPS por reglas** (`surveys.controller.ts`): `GET /surveys/pending`
  ahora devuelve `{ pending, period, reason }` con `reason ∈
  {last_class, period_ended}`. Se dispara sólo si el estudiante tiene
  su última clase programada del periodo actual, o si la suscripción
  quedó `expired|past_due|canceled`. Ya no se apoya en
  `localStorage`. El dialog se monta desde `_authenticated.tsx` y se
  eliminó el trigger cliente en `app.index.tsx`.
- **Onboarding + suscripción**: usuarios sin suscripción activa son
  redirigidos a la nueva ruta interna `/app/subscribe` (catálogo real
  de planes con CTA a `/checkout/$planId`).
- **Historial de pagos**: `GET /me/payments` + `usersApi.payments()`.

### D2 (hecho)
- **Wompi Web Checkout real** (`checkout.service.ts`): `createIntent`
  devuelve además `checkoutUrl` construido con la URL prehosteada de
  Wompi (`https://checkout.wompi.co/p/?...`) firmando `reference +
  amount + currency + INTEGRITY_SECRET` (SHA-256). El frontend
  (`checkout.$planId.tsx`) redirige por `window.location.href` y se
  eliminaron el widget embebido, el botón "Simular pago aprobado" y el
  paso intermedio. `checkout/return` sigue haciendo polling contra
  `/checkout/status` porque la fuente de verdad es el webhook.
- **TRM (Superfinanciera)**: nuevo módulo `exchange/` con
  `GET /public/exchange/trm`. Consulta SODA
  (`https://www.datos.gov.co/resource/32sa-8pi3.json?$limit=1&$order=vigenciadesde%20DESC`),
  cachea en tabla `trm_rates` con TTL de 12h, fallback a la última fila
  o valor duro si el SODA falla.
- **Planes con USD**: migración `20260812000000_plan_usd_and_trm`
  añade `plans.price_usd` + tabla `trm_rates`. `GET /plans` ahora
  devuelve `{ trm, plans: [{ id, name, daysPerWeek, priceCop,
  priceUsd, features }] }`.
- **Landing Pricing** (`components/site/Pricing.tsx`) consume
  `plansApi.list()` con TanStack Query, muestra el precio USD real,
  el equivalente en COP y la TRM referencia. Cae al catálogo local
  (`PLANS`) si el backend no responde.

### D3 (hecho)
- **Admin NPS real** (`admin.surveys.tsx`): eliminado `readDb` /
  `listAllSurveys`. Ahora consume `adminApi.surveys(filter)` con
  TanStack Query. El backend ya expone `GET /api/v1/admin/surveys` con
  KPIs (`nps`, `promoters`, `detractors`, `count`) calculados server-side.
- **Módulos filtrados por nivel del estudiante**
  (`learning.controller.ts` + `learning.service.ts`): si no se pasa
  `?level`, el servicio resuelve el nivel desde `user.englishLevel`
  (sólo estudiantes; admin/teacher ven todos). Nuevo método
  `listModulesForUser(userId, level?)`.
- Pendiente para D4: drag & drop en `admin.content.tsx` con `@dnd-kit`
  y rewrite del portal `/app/learning` para consumir `learningApi` en
  vez de `listAllModules` local.

### Iteración A — Checkout + Wompi end-to-end
- Backend: `POST /checkout/intents` (documento + teléfono obligatorios),
  `GET /checkout/status?reference=` para polling, `express.raw` sólo en
  `/api/v1/public/wompi/webhook` para validar firma HMAC.
- Wompi: si `APPROVED` sin `userId`, se busca por email; si no existe se crea
  estudiante con `setPasswordToken` (7 días) y luego se activa la suscripción.
- Storefront: `/checkout/$planId` monta el widget Wompi con firma del server;
  `/checkout/return` hace polling contra `/checkout/status`. CTAs de la home
  llevan a `/#precios` para forzar selección de plan.

### Iteración B — Onboarding gate + horarios
- Backend: nuevo módulo `scheduling/` con `GET /schedule/availability-grid`,
  `GET /schedule/mine`, `POST /schedule/preferences` (auto-asigna profesor
  si hay disponibilidad para TODOS los bloques, si no `manual_pending`),
  `GET /admin/schedule/requests`, `POST /admin/schedule/requests/:id/assign`,
  `GET/POST /admin/teachers/:id/availability`.
- Migración `20260810000000_schedule_preferences` para `schedule_preferences`
  y `schedule_assignment_status` en `users`.
- Storefront: gate en `_authenticated.tsx` redirige estudiantes según
  perfil / suscripción / horario; nuevas páginas
  `/onboarding/profile`, `/onboarding/schedule`, `/admin/schedule`.

### Iteración C — Nómina real, limpieza mocks, docs
- `AdminService.payroll`: calcula duración real desde `startsAt`/`endsAt` de
  cada `Class` con `status=validated`; tarifa por hora de `app_settings`.
- `admin.payroll.tsx`: 100 % contra backend (`adminApi.payroll`,
  `payrollSettings`, `payrollCsv`); se eliminó dependencia de mocks
  `computePayroll` / `getHourlyRate`.
- `saveModule`: corregido para usar `description` (nombre real en Prisma)
  en lugar del alias `summary`.

## Round 4 — CRM completo, CMS funcional, Nómina por horas

### Storefront
- `admin.users.$id.tsx`: vista con tabs (Overview, Subscription, Payments, Classes, Learning, NPS, Notes, Students). Acciones: editar, desactivar/activar, soft delete, resetear contraseña.
- Impersonación corregida: `startImpersonation` ahora invalida la cache en memoria de `auth.ts` (`reloadCurrentUser`) antes de navegar; los route guards síncronos ya leen el usuario destino.
- `admin.payroll.tsx`: tarifa por hora editable (persistida en `app_settings`), tabla con `hours`, `hourlyRateCop`, `amountCop`. CSV regenerado.
- `admin.content.tsx`: CMS CRUD para módulos / lecciones (video, pdf, slides, html, download) con notas internas y adjuntos.

### Backend
- `prisma/schema.prisma`: `User.disabledAt|deletedAt|lastLoginAt|setPasswordToken`, `Lesson.contentHtml|notes|kind`, modelo `LessonAttachment`.
- Migración SQL: `20260801000000_cms_storage_user_states`.
- `AdminController` + `AdminService`: endpoints CRM (`GET /admin/users/:id`, `PATCH /admin/users/:id`, `PATCH /admin/users/:id/status`, `PATCH /admin/users/:id/delete`, `POST /admin/users/:id/reset-password`), nómina (`GET|PATCH /admin/settings/payroll`), CMS (`POST/PATCH /admin/content/modules|lessons`, `POST /admin/uploads/sign`, `POST /admin/content/lessons/:id/attachments`).
- `StorageModule` (`storage.service.ts`): cliente S3 v3 con presigned PUT. Funciona con MinIO local y S3/MinIO en Railway sin cambios.
- `docker-compose.yml`: servicios `minio` (S3 :9000 + consola :9001) y `minio-bootstrap` que crea el bucket `freakn-cms` automáticamente.
- `.env.example`: bloque `S3_*` documentado.
- `package.json`: dependencias `@aws-sdk/client-s3` y `@aws-sdk/s3-request-presigner`.

### Contraseña al crear usuario
- Al crear desde admin **no se asigna contraseña**: se persiste un `setPasswordToken` (TTL 24h) y se envía email vía Resend (`/reset-password?token=…`). El usuario fija su contraseña en el primer ingreso.
- En dev el endpoint devuelve el link en el response para poder probar sin SMTP.
- Estudiantes creados así quedan **sin suscripción activa**: deben completar pago Wompi para entrar al portal.
# Mejoras aplicadas (turno actual)

## ✅ Hecho

### 1. Visual / hovers / animaciones
- `styles.css`: `scroll-behavior: smooth`, soporte `prefers-reduced-motion`,
  anillo de foco accesible global (`:focus-visible`).
- Botón "Seleccionar plan" en `Pricing`: hover con elevación + sombra.
- FAQ items: hover con borde resaltado.
- Sidebar (`AppShell`): hover con `translate-x`, item activo con sombra.
- Botones admin (notificaciones): hover con elevación.

### 2. SEO / accesibilidad
- `public/robots.txt` con disallow de `/app`, `/teacher`, `/admin`, `/checkout`, `/auth`.
- `src/routes/sitemap[.]xml.ts` con server handler que devuelve XML
  cacheable (rutas públicas: `/`, `/login`, `/signup`).
- `__root.tsx`:
  - JSON-LD `EducationalOrganization`.
  - `og:url`, `og:site_name`, `og:locale`.
  - `<link rel="canonical">`.
  - Viewport con `viewport-fit=cover` (notch iOS).
- `index.tsx`: JSON-LD `FAQPage` con las 4 preguntas reales.
- `_authenticated.tsx`: `<meta name="robots" content="noindex, nofollow">`.
- Hash anchors `#faq #testimonios #precios #como-funciona` con `scroll-mt-24`.
- NotFound (404) re-estilizado en español con la marca.

### 3. Wordings
- Login: caja amarilla "mock" → toggle discreto "Ver cuentas de prueba".
- Admin > Notificaciones: removido "Fase 7", `LogTransport`, `docs/...`.
- Admin > Contenido: removida nota técnica de tablas y archivos fuente.
- Admin > Nómina: nota reescrita sin `<code>`.
- Admin > nav: "Analytics"→"Analítica", "CRM"→"Usuarios", "CMS"→"Contenido",
  "Automaciones"→"Notificaciones".
- Sidebar estudiante: "Dashboard" → "Inicio".

### 4. Footer
- Removidos enlaces "Nosotros" y "404".
- FAQs ahora apunta a `/#faq` con smooth scroll.
- Columnas reorganizadas: Servicios (Cómo funciona, Testimonios, Precios, FAQ),
  Legal (Privacidad, Términos), Síguenos.

### 5. Encuesta NPS obligatoria (estudiantes, cada 30 días)
- `src/lib/domain/survey.ts`: `isSurveyDue` con ventana de 30 días, tipo
  `SurveyAnswers` con NPS + 3 escalas 1–5 + comentario.
- `SatisfactionDialog`: rediseño con 5 preguntas, sin botón X ni "Después",
  aviso de privacidad explícito ("Tu profesor no podrá verlas").
- `app.index.tsx`: usa `isSurveyDue`, sólo dispara para `role=student`.
- Admin > Encuestas (`/admin/surveys`): nueva vista con KPIs (NPS,
  respuestas, promedios), filtro promotores/detractores y tabla detallada
  con comentarios. Sólo visible para admin (los profesores no tienen el
  link y la ruta está bajo `_authenticated/admin` con gate por rol).

### 6. Backend — encuesta
- `prisma/schema.prisma`: `teacher_score`, `content_score`, `platform_score`
  añadidos a `SatisfactionSurvey`.
- `prisma/migrations/20260720000000_survey_scores/migration.sql`.
- `surveys.controller.ts` (`POST /surveys/nps`, `GET /surveys/pending`):
  acepta los 3 scores nuevos con validación 1–5, regla de pendiente cambió
  a "≥ 30 días desde la última respuesta".
- `admin.controller.ts` + `admin.service.ts`: nuevo endpoint
  `GET /admin/surveys?filter=` con KPIs agregados (sólo admin).

### 7. Sidebar pegado en "Inicio" (bug)
- `AppShell.tsx`: `NavItem` ahora respeta `end: true` para items índice;
  ya no usan `startsWith` con la ruta padre.

### 8. Rol-routing al entrar
- `_authenticated.tsx`: si un admin entra a `/app`, lo manda a `/admin`;
  si un estudiante intenta entrar a `/admin` o `/teacher`, lo redirige a `/app`.
- `login.tsx`: prioridad admin > teacher > student al elegir destino.

## ✅ Completado en este turno

### 9. Impersonación admin → cualquier usuario
- `lib/domain/admin-actions.ts`: `startImpersonation` / `stopImpersonation` /
  `getImpersonation` con persistencia en `localStorage` (mock).
- `components/app/ImpersonationBanner.tsx`: banner sticky amarillo con
  "Salir de impersonación", incluido en `AppShell` para todas las rutas
  autenticadas.
- Backend stub: `POST /admin/users/:id/impersonate` firma JWT con
  `actAs` + `impersonatorId` (30 min). Auditoría en tabla
  `impersonation_logs` (nueva en `schema.prisma` + migración).

### 10. Crear usuarios desde admin (sin activar suscripción)
- `createUserByAdmin()` en `admin-actions.ts` con validación de email único.
- `CreateUserDialog` integrado en `/admin/users` (botón "+ Crear usuario").
  Tabs Estudiante/Profesor, campo nivel para estudiantes, nota explícita
  "Crear un estudiante no activa la suscripción — eso ocurre tras un pago
  Wompi".
- Backend stub: `POST /admin/users` crea la fila y devuelve un
  `setPasswordToken` para que Resend envíe el email "Configura tu contraseña".

### 11. Vista detalle `/admin/users/$id` + asignación estudiante↔profesor
- Nueva ruta con secciones: cabecera (rol, email, nivel), suscripción
  (estudiantes), profesor asignado con `<select>` para reasignar,
  actividad (totales/completadas/próximas), estudiantes asignados (para
  profesores), feedback reciente del profesor (para estudiantes).
- Botón "Ver como este usuario" → impersonación con confirm + redirect
  al portal correspondiente (`/app`, `/teacher` o `/admin`).
- Schema: `User.assignedTeacherId` añadido en `types.ts` + en
  `prisma/schema.prisma` con FK auto-referencial + índice.
- Migración: `20260721000000_admin_assign_impersonate/migration.sql`
  (columna + tabla `impersonation_logs`).
- Endpoints en storefront/api: `adminApi.createUser`, `assignTeacher`,
  `impersonate`.
- CRM `/admin/users`: filas ahora son links a `/admin/users/$id`.

## ⏳ Próximo turno (opcional)

- **Reemplazo de mocks por TanStack Query** (todo el portal). Hoy la
  capa `readDb`/`writeDb` + `bootstrap.ts` mantiene compatibilidad; el
  cambio sólo aplica cuando el backend esté corriendo localmente. Hooks
  sugeridos: `useClasses`, `useAdminAnalytics`, `useUsers`, etc.
- **Filtrar `/teacher/students` por `assignedTeacherId`** una vez la
  asignación viva en backend (hoy `classes.ts:listStudentsOfTeacher`
  filtra por clases, lo cual sigue siendo válido como fallback).
## Iteración D4 — CMS al backend + mensaje 48h

- `admin.content.tsx` reescrito para consumir `adminApi.content` /
  `createModule` / `updateModule` / `deleteModule` / `createLesson` /
  `updateLesson` / `deleteLesson` mediante TanStack Query. Se eliminaron
  las llamadas al mock local `lib/domain/learning.ts`.
- Reordenamiento de módulos y lecciones con botones ↑/↓ (intercambia
  `position` con el vecino). Diálogo de lección con campos por tipo
  (`video/pdf/slides/download/html`) y notas.
- `onboarding.schedule.tsx`: cuando no hay profesor disponible para los
  bloques elegidos, el toast informa explícitamente “nos coordinaremos
  contigo en las próximas 48 horas para iniciar con las clases”.

## Iteración D5 — Disponibilidad self-service del profesor + reasignación auto

- Backend: `GET/POST /api/v1/teacher/availability` (self). Al guardar,
  `SchedulingService.reassignPendingForTeacher` recorre a los estudiantes
  con `scheduleAssignmentStatus='manual_pending'` y si el nuevo horario del
  profesor cubre TODAS sus preferencias, los deja `auto_assigned` con
  `assignedTeacherId = teacher`.
- `TeachersModule` importa `SchedulingModule` (exportado).
- Storefront: nueva ruta `/teacher/availability` con grid 7×15 (07:00–21:00);
  al guardar informa cuántos estudiantes se asignaron automáticamente.
- Nav del portal profesor incluye el ítem "Disponibilidad".

## Iteración D10 — Board colaborativo en tiempo real (B1 + B2 + B5)

- **Backend:** migración `20260813000000_board_pages` con tablas
  `board_pages` y `board_page_ops` (Yjs binary state + op log per página).
  Prisma models `BoardPage` y `BoardPageOp` con relación cascada al board.
- `BoardService`: CRUD páginas (`listPages`, `createPage`, `renamePage`,
  `reorderPage`, `deletePage`), snapshot + catch-up (`getPageState`,
  `appendPageOp` idempotente por `clientOpId`, `pageOpsSince`).
- `BoardController`: nuevos endpoints REST `GET/POST /boards/:id/pages`,
  `PATCH/DELETE /boards/pages/:pageId`, `GET /boards/pages/:pageId/state`,
  `GET /boards/pages/:pageId/ops?since=N`.
- `BoardGateway`: eventos WS `page:join`, `page:leave`, `page:update`
  (Yjs update en base64, límite 256 KB, broadcast a peers), `page:awareness`
  (cursor + selección), y presencia por página. Autorización vía
  `ensureMember(boardId)` en cada handler.
- **Frontend:** dependencias `yjs`, `y-protocols`, `socket.io-client`,
  `@tiptap/react` + starter-kit/collaboration/collaboration-cursor/
  placeholder.
- `src/lib/board/yProvider.ts`: `createPageProvider` conecta un `Y.Doc` +
  `Awareness` al socket `/board`, bootstrapea con snapshot REST, aplica ops
  faltantes, reintenta join en reconexión y expone estado + presencia.
- Rutas nuevas: `/boards` (lista + crear), `/boards/$boardId` (sidebar de
  páginas: crear/renombrar/eliminar) con auto-navegación a la primera
  página, y `/boards/$boardId/pages/$pageId` (editor Tiptap colaborativo
  con toolbar completa: bold/italic/strike/H1-H3/lista/ordered/tasks/quote/
  code + undo/redo, cursores remotos con color por usuario, avatares de
  presencia y píldora de estado conectando/en vivo/offline).
- Endpoints storefront (`boardsApi.listPages/createPage/renamePage/
  reorderPage/deletePage/pageState/pageOpsSince`).
- `AppShell`: entrada "Boards" en la nav de estudiante y profesor.
- Pendiente en iteraciones B3–B8: tablas, imágenes con upload, capa de
  dibujo, historial de versiones, auto-provisioning al reservar clase,
  exportar PDF/Markdown y pulido móvil.

## 2026-08-15 — D6 Notificaciones (email + in-app)

- Migración `20260815000000_notifications_inapp`: agrega `type`, `title`,
  `body`, `link_url`, `read_at` + índice `(user_id, read_at, created_at)`.
- Templates de email 100 % configurables por env: `BRAND_NAME`, `BRAND_COLOR`,
  `BRAND_INK`, `BRAND_ACCENT`, `BRAND_LOGO_URL`, `BRAND_TAGLINE`,
  `BRAND_SUPPORT_EMAIL`, `PUBLIC_SITE_URL`, `RESEND_FROM`, `RESEND_REPLY_TO`.
  Cabecera del archivo `templates.ts` documenta el bloque de `.env` de ejemplo.
- Nuevos templates: `payment_success` (ejemplo completo con preheader, CTA,
  tabla de montos y money formatter), `class_rescheduled`, `class_cancelled`,
  `teacher_assigned`. Los existentes reformateados con CTA y branding.
- `NotificationsService.enqueue` acepta `type/title/body/linkUrl/inAppOnly`
  para alimentar el inbox in-app.
- Nuevo `NotificationsController` (usuario): `GET /notifications`,
  `GET /notifications/unread-count`, `POST /notifications/:id/read`,
  `POST /notifications/read-all`.
- Triggers cableados: Wompi APPROVED → `payment_success` + `welcome`;
  Classes `reschedule` → notifica a estudiante y profesor; `cancel` →
  notifica al profesor; Scheduling `submitPreferences`, `assignRequest` y
  `reassignPendingForTeacher` → `teacher_assigned` al estudiante.
- Frontend: `notificationsApi` + `<NotificationsBell/>` con badge y
  dropdown en `AppShell` (desktop y mobile), ruta
  `/_authenticated/notifications` con inbox completo y "marcar todas".

## 2026-08-16 — D7 Métricas admin, D8 recibos PDF, D9 PWA offline

- **D7**: `GET /api/v1/admin/metrics?range=30|90|365` con MRR/ARR, churn,
  asistencia, NPS, ingresos por día, clases validadas por día, top profesores
  y cohortes de retención (últimos 6 meses). `admin.index.tsx` reemplaza
  mocks con `useQuery(adminApi.metrics)` + sparklines SVG y tabla de cohortes
  heatmap.
- **D8**: nuevo `ReceiptsService` con `pdfkit` y endpoint
  `GET /api/v1/me/payments/:intentId/receipt.pdf` (auth por dueño). Branding
  desde env (`BRAND_NAME`, `BRAND_INK`, `BRAND_ACCENT`, `BRAND_SUPPORT_EMAIL`,
  `PUBLIC_SITE_URL`). Sección "Historial de pagos" en `app.settings.tsx`
  con botón "Recibo PDF" para intents `APPROVED`. Nuevo helper
  `apiGetBlob` en el cliente para descargas binarias autenticadas.
- **D9**: `vite-plugin-pwa` (`generateSW`, `sw.js`, `NetworkFirst` para
  navegaciones, SWR para `/api/v1/learning/*`, `CacheFirst` para imágenes).
  Registro guardado en `src/lib/pwa/register.ts` (nunca dev/iframe/preview
  de Lovable; soporta kill switch `?sw=off`). Botón "Instalar app"
  (`beforeinstallprompt`) en el sidebar del `AppShell`. Manifest e icons
  ya existían.
