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

## ⏳ Pendiente para el próximo turno

Los siguientes 4 puntos requieren cambios más profundos en backend (modelo
de datos, endpoints, sesiones secundarias) + UI nueva. Se documentan aquí
para retomar:

1. **Impersonación admin → profesor** (punto 7 del usuario).
   - Endpoint `POST /admin/users/:id/impersonate` que firma un JWT con
     `actAs` + cookie `admin_original_session`.
   - Banner persistente "Estás viendo como X · Salir de impersonación".
   - Auditoría: tabla `impersonation_logs` (admin_id, target_id, started_at).

2. **Crear usuarios desde admin** (punto 8).
   - `POST /admin/users` con `role`, `email`, `fullName`.
   - Envío de email "set password" (Resend) — crea cuenta SIN suscripción.
   - UI: dialog en `/admin/users` con tabs Estudiante / Profesor.

3. **Asignación estudiante ↔ profesor** (punto 9).
   - Campo `assigned_teacher_id` en `User` (Prisma migration).
   - Endpoint `PATCH /admin/users/:studentId/assign-teacher`.
   - Vista `/admin/users/$id` con pestañas (perfil, clases, progreso,
     asignación) tanto para estudiantes como profesores.
   - Vista `/teacher/students` ya existe — agregar filtro por
     `assigned_teacher_id` cuando esté listo.

4. **Reemplazo de mocks por TanStack Query** (todo el portal).
   - Hooks por dominio (`useClasses`, `useAdminAnalytics`, etc.).
   - Limpiar `bootstrap.ts` y `readDb()` para que sólo se use como
     fallback en modo demo offline.