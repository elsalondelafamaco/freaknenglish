
# Plan de mejoras Freakn'

Alcance: pulir la app (hover/animaciones/SEO/limpieza de wordings técnicos), arreglar bugs de navegación y permisos por rol, y cerrar los huecos funcionales del flujo admin/profesor/encuesta NPS — todo conectado al backend Nest.

---

## 1. Hover, animaciones y accesibilidad global

Storefront (landing + portales).

- Añadir `transition-colors / transition-transform duration-200` y `hover-scale` a TODOS los botones/links que hoy no reaccionan: `Hero` CTAs, `Navbar` items, `Footer` links, `Pricing` cards, `Faq` triggers, `DarkPillButton`, `AuthShell` (Google button, submit), `NavItem` del sidebar, `Stat` cards del dashboard, badges del CRM.
- Estados `focus-visible` con anillo `ring-2 ring-brand-ink/40` en todo elemento interactivo (a, button, input, textarea). Necesario para accesibilidad por teclado.
- Reemplazar `<div onClick>` por `<button>` donde aplique (revisar `SatisfactionDialog`, sidebar móvil, tabs admin).
- `aria-label` en todos los botones icon-only (`Menu`, `X`, NPS scale `0-10`, cerrar dialog, "fill credentials" del login).
- Pasar `h-screen` → `h-dvh` donde haya layouts full-height en mobile.
- Animaciones de entrada por sección de la landing (`animate-fade-in` con stagger ligero) y `accordion-down/up` en `Faq`.
- `prefers-reduced-motion`: respetar en `styles.css`.

## 2. SEO técnico

- `src/routes/sitemap[.]xml.ts` dinámico con `BASE_URL = "https://interface-joy-flow.lovable.app"` y entries solo para rutas públicas indexables: `/`, `/login`, `/signup`. Excluir `/app/*`, `/teacher/*`, `/admin/*`, `/checkout/*`, `/auth/callback`, `/forgot-password`, `/reset-password`.
- `public/robots.txt`: `Allow: /` global, `Disallow: /app/`, `/teacher/`, `/admin/`, `/checkout/`, `/auth/`, `/forgot-password`, `/reset-password`. Directiva `Sitemap:`.
- Por ruta pública: `head()` con title <60c + meta description <160c + `og:title`/`og:description`/`og:url` + `<link rel=canonical>`. Cada ruta privada añade `<meta name=robots content="noindex,nofollow">`.
- `__root.tsx`: defaults sitewide (`og:type=website`, `og:site_name=Freakn'`, charset, viewport) y JSON-LD `Organization`.
- Home: JSON-LD `Course` + `FAQPage` derivado del array de FAQ.
- `<h1>` único por página, jerarquía de headings corregida en la landing.
- `alt` descriptivos en imágenes generadas; `alt=""` en decorativas.
- Lazy-loading (`loading="lazy"`) en imágenes bajo el fold.

## 3. Limpieza de wordings técnicos

Eliminar referencias a "Fase X", "mock", "Phase", "MockAuth", nombres de componentes, "automaciones (Fase 7)", etc. en UI visible:

- `/login`: quitar caja amarilla "Cuentas de prueba (mock)" — moverla a un toggle "Cuentas demo" más sutil o eliminarla del todo.
- Admin: header `"Freakn' Operations"` → `"Panel administrativo"`. Tab "Automaciones" se queda; quitar tooltips/textos sobre "Fase 7", "lazy trigger" etc.
- `/admin/users` footer "Datos en vivo del repositorio mock..." → eliminar.
- `/admin/content`: eliminar avisos de "CMS read-only" o moverlos a texto neutro.
- Quitar `// Trigger lazy de automaciones (Fase 7)` y similares de UI (comentarios de código pueden quedar).
- Revisar `Settings`, `Calendar`, `Checkpoint` por mensajes con "fase/mock/migration".

## 4. Footer

- Eliminar enlaces "Nosotros" y "404".
- "FAQs" → ancla `/#faq` (TanStack `Link` con `hash="faq"`).
- "Testimonios" → `/#testimonios` con scroll suave.
- Implementar smooth scroll global: `html { scroll-behavior: smooth }` en `styles.css` + un pequeño handler que, si la ruta no es `/`, navegue a `/` y luego haga scroll al hash.
- Mismo tratamiento al `Navbar` (ya usa `#como-funciona`, `#testimonios`, `#precios`).

## 5. Encuesta NPS — privada, obligatoria, mensual, persistente

**Reglas de negocio**

- Solo estudiantes ven la encuesta.
- Frecuencia: cada 30 días desde la última respuesta (no por mes calendario).
- Obligatoria: no se puede cerrar (eliminar botón X y "Después", quitar `Esc`/click backdrop). Bloqueo de toda la navegación del portal estudiante hasta responder.
- Privada: aviso visible "Tus respuestas son privadas. Tu profesor no las verá. Las usamos solo para mejorar la calidad."
- Visible para admin, NO para profesor.

**Formulario (5 preguntas + nota)**

1. NPS 0-10 (recomendación general).
2. Likert 1-5: claridad de tu profesor.
3. Likert 1-5: calidad del material de aprendizaje.
4. Likert 1-5: plataforma (facilidad de uso, agenda, accesos).
5. Selección múltiple: "¿Qué te gustaría mejorar?" (opciones: ritmo, material, profesor, horarios, plataforma, otro).
6. Texto libre (opcional, max 500c): "Comentario adicional".

**Frontend**

- Reescribir `SatisfactionDialog`: sin cierre, layout en 1 pantalla con scroll interno, validación + envío al backend, aviso de privacidad destacado.
- Disparador: gate en `_authenticated` layout que, si `user.role==='student'` y `GET /surveys/pending` devuelve `{ pending: true }`, monta el dialog modal con `inert` sobre el resto de la app.

**Backend (Nest + Prisma)**

- Migrar `SatisfactionSurvey` a un schema más rico: además de `score` (NPS) y `comment`, agregar `teacherClarity`, `materialQuality`, `platformQuality` (Int 1-5), `improveAreas` (String[]).
- Cambiar la lógica de `period` por `nextDueAt = submittedAt + 30 días`.
- Endpoints:
  - `GET /api/v1/surveys/pending` → `{ pending, nextDueAt }`.
  - `POST /api/v1/surveys/nps` recibe el payload completo.
  - `GET /api/v1/admin/surveys?from=&to=&q=` — solo admin, listado paginado con join al usuario.
  - `GET /api/v1/admin/surveys/stats` — promedios + tendencia.
- Excluir surveys de cualquier endpoint de profesor.
- Sección nueva en `/admin`: tab "Satisfacción" con lista + drill-down + KPIs y filtro por mes.

## 6. Admin no ve dashboard de estudiante

- `_authenticated/app` (toda la rama `/app/*`) debe redirigir a `/admin` si el usuario es admin sin rol de estudiante; a `/teacher` si solo es profesor. Solo permitir si el usuario tiene rol `student`.
- En `_authenticated/app.tsx` (layout) añadir `beforeLoad` que valide rol y haga `redirect()`.
- Ajustar `login.tsx`: si el usuario es admin, ir directo a `/admin` (ya hace eso si tiene `teacher` antes — invertir orden: admin > teacher > student).

## 7. Sidebar "active" pegado

Bug: `pathname.startsWith(item.to + "/")` matchea `/admin` con `/admin/users` etc., y `/app` matchea todo `/app/*`. Resultado: la primera opción se queda activa.

Fix:

- Para items con `end: true` (raíces de sección como `/admin`, `/app`, `/teacher`), comparar igualdad exacta `pathname === item.to`.
- Marcar `end: true` en los NAV donde corresponda y derivar `active` con esa lógica.
- Verificar también el sub-nav de admin (`admin.tsx`) — usa la misma heurística.

## 8. Admin impersona profesores (y estudiantes)

- Backend: endpoint `POST /api/v1/admin/impersonate/:userId` (solo admin) que devuelve un nuevo `accessToken` + `refreshToken` con claims `{ sub: <userId>, role: <userRole>, impersonatedBy: <adminId> }` y vida corta (30 min). Refresh token marcado como `impersonation` (no rota al original).
- Endpoint `POST /api/v1/admin/impersonate/stop` que revoca y reemite el token del admin original (guardado en cookie httpOnly aparte: `sb-impersonator`).
- Frontend:
  - Botón "Ver como" en `/admin/users` por fila + en perfil del usuario.
  - `AuthProvider` guarda `originalUser` en memoria; al impersonar, cambia tokens, redirige a `/teacher` o `/app` según rol.
  - Banner global persistente: "Estás viendo la app como <Nombre> · Volver a mi cuenta" con botón que invoca `stop`.
- Logging: cada inicio/fin de impersonation en tabla `AuditLog` (admin actor + target).

## 9. Admin crea profesores y estudiantes

- Backend:
  - `POST /api/v1/admin/users` body `{ fullName, email, role: 'teacher'|'student', sendInvite?: boolean, level? }`. Crea user con password aleatorio, NO crea suscripción. Si `sendInvite=true`, dispara email Resend con link de set-password (token corto en `password_resets`).
  - `PATCH /api/v1/admin/users/:id` actualiza nombre/level/role.
  - `POST /api/v1/admin/users/:id/disable` y `/enable`.
  - `POST /api/v1/admin/users/:id/assign-teacher` body `{ teacherId }` → setea la relación `assignedTeacherId` en el estudiante (campo nuevo en `User`) o entrada en tabla pivote `StudentTeacher`.
- Suscripciones de estudiantes siguen activándose vía Wompi widget → webhook (`/api/public/wompi/webhook`). Admin nunca activa manualmente la suscripción excepto por el endpoint nuevo `POST /api/v1/admin/users/:id/grant-subscription` (uso operativo, con motivo) — opcional.

## 10. Cierre funcional admin/profesor (release-blocker)

Funcionalidades del documento original que faltaban:

**Admin (nuevo en CRM):**

- Vista detalle de usuario `/admin/users/:id`:
  - Datos personales + plan + estado de suscripción + historial de pagos.
  - Clases tomadas/canceladas/pendientes.
  - Progreso de aprendizaje (módulos + checkpoints).
  - Respuestas NPS históricas.
  - Profesor asignado (con selector para reasignar).
  - Botón "Ver como" (impersonate).
- En vista profesor `/admin/users/:teacherId`: además de lo anterior, lista de estudiantes asignados con métricas (clases dictadas, validadas, nota promedio de profesor).
- Endpoint `GET /api/v1/admin/users/:id` que devuelva el agregado.

**Admin asignación profesor↔estudiante:**

- `/admin/assignments`: tabla cruzada con drag-handle o selector simple por fila: "Estudiante → Profesor". Botón "Auto-asignar" que distribuya estudiantes sin profesor entre profes con capacidad.
- Backend: campo `assignedTeacherId` en `User` (estudiante) + endpoint `GET /api/v1/admin/assignments` y `POST /api/v1/admin/assignments`.
- Cuando se crea una clase para un estudiante, por defecto se le asigna su `assignedTeacherId`.

**Profesor:**

- `/teacher/students/:studentId` ya existe — añadir: progreso de módulos (read-only), historial completo de clases (con paginación), botón para crear próxima clase con ese estudiante.
- `/teacher/availability`: editor de slots semanales recurrentes + ausencias puntuales. Backend ya tiene tablas `teacher_availability` y `teacher_absences`; agregar endpoints `GET/PUT /api/v1/teacher/availability` y `POST/DELETE /api/v1/teacher/absences`.

**Conexión backend en todas las vistas:**

- Reemplazar los `readDb()` y `writeDb()` actuales por llamadas API + TanStack Query en: dashboard estudiante, calendario, learning, checkpoint, settings, todas las vistas de profesor y todas las vistas de admin.
- Hidratación inicial (login → `apiBootstrap()`) ya existe; el siguiente paso es que los componentes lean directo de la API y dejen de depender del store local. El store mock se queda solo como fallback offline (flag `VITE_USE_MOCK`).
- Crear hooks `useMe`, `useUpcomingClasses`, `useTeacherSchedule`, `useAdminAnalytics`, etc. con queryKeys consistentes.

## Detalles técnicos

```
storefront/
  src/styles.css                              # scroll-behavior:smooth, prefers-reduced-motion, focus-visible utility
  src/routes/__root.tsx                       # JSON-LD Organization, og defaults, manifest, theme-color
  src/routes/sitemap[.]xml.ts                 # NUEVO
  public/robots.txt                           # NUEVO
  src/components/site/Footer.tsx              # quitar Nosotros/404, hash links
  src/components/site/Navbar.tsx              # focus-visible + hover refinado
  src/components/site/{Hero,Faq,Pricing,...}  # animaciones entrada + JSON-LD FAQ
  src/components/app/AppShell.tsx             # fix active matching (end-flag)
  src/components/app/SatisfactionDialog.tsx   # 5 preguntas + privacidad + bloqueante
  src/components/app/ImpersonationBanner.tsx  # NUEVO
  src/routes/_authenticated.tsx               # gate NPS obligatorio + role redirects
  src/routes/_authenticated/app.tsx           # beforeLoad: solo students
  src/routes/_authenticated/admin.users.$id.tsx  # NUEVO detalle
  src/routes/_authenticated/admin.assignments.tsx # NUEVO
  src/routes/_authenticated/admin.surveys.tsx # NUEVO
  src/routes/_authenticated/admin.users.new.tsx  # NUEVO (create teacher/student)
  src/routes/_authenticated/teacher.availability.tsx # NUEVO
  src/lib/api/endpoints.ts                    # endpoints nuevos
  src/lib/auth/AuthProvider.tsx               # impersonation state
  src/lib/hooks/use-*.ts                      # TanStack Query hooks por dominio

backend/
  prisma/schema.prisma                        # SatisfactionSurvey enriquecida, assignedTeacherId, AuditLog, password_resets
  prisma/migrations/<timestamp>_phase2/...    # NUEVO migration
  src/modules/admin/admin.controller.ts       # +users CRUD, impersonate, surveys, assignments
  src/modules/admin/admin.service.ts
  src/modules/surveys/surveys.controller.ts   # payload extendido
  src/modules/teachers/teachers.controller.ts # availability/absences endpoints
  src/modules/auth/auth.service.ts            # tokens de impersonation
```

```text
Flujo impersonate
  Admin ─POST /admin/impersonate/:id─▶ Nest emite tokens scoped al target
        ◀── cookie sb-impersonator (guarda admin original)
        ── front cambia AuthProvider, redirige, muestra banner
  Banner ─POST /admin/impersonate/stop──▶ Nest restaura tokens admin
```

## Orden de ejecución

1. SEO + accesibilidad + hovers + smooth scroll + footer + wordings (visual, sin backend).
2. Fix sidebar active + redirect por rol + admin no ve `/app`.
3. Encuesta NPS (schema + backend + dialog bloqueante + admin tab).
4. Admin: crear usuarios + asignaciones profesor↔estudiante + detalle de usuario.
5. Impersonation.
6. Teacher availability + reemplazo final de mocks por API en todas las vistas.

Pregunta única antes de implementar: ¿avanzo en este orden o priorizas alguna sección (p. ej. la NPS o la impersonation) primero?
