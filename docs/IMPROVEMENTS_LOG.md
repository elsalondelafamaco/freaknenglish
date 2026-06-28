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