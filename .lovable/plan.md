# Plan: Freakn English 1-on-1

Plataforma integral de tutorías 1-on-1 según el plan estratégico. Arrancamos por la **landing pública pixel-perfect** (Home.pdf + Movil.pdf) usando el logo SVG entregado, y de ahí extendemos el sistema de diseño al resto.

Decisiones clave acordadas:
- **Wompi**: se integra con el **Widget de Checkout** embebido (sin tokenización propia ni API custom). El webhook lo conectarás tú después contra una Edge Function de Supabase.
- **Auth & DB**: capa **stub/mocked** (mock provider + datos en memoria/localStorage) que permita recorrer todos los flujos sin backend real. Interfaces claras (`AuthService`, repositorios) para enchufar luego Postgres + Node en Railway.
- **Resend**: sí se conecta de verdad (API key vía secret) para emails transaccionales clave.
- **Portabilidad**: pensado para migrar a **Next.js + Node + Postgres en Railway**. Todo lo "server" se aísla y documenta para facilitar el corte.

---

## Estrategia de portabilidad (Next.js + Node + Postgres + Railway)

Para que migrar sea barato:

1. **Repositorios y servicios desacoplados** en `src/lib/domain/` (TypeScript puro, sin imports de TanStack ni Supabase):
   - `AuthService`, `UsersRepository`, `ClassesRepository`, `ContentRepository`, `PayrollService`, `NotificationsService`, etc.
   - Implementación actual: `MockAuthService`, `InMemoryRepository` con seed JSON + persistencia opcional en `localStorage`.
   - Para migrar: crear `PostgresUsersRepository`, `JwtAuthService`, etc., implementando la misma interfaz.
2. **Server functions de TanStack** = capa fina que delega en los servicios. Cada `*.functions.ts` documenta en JSDoc el endpoint REST equivalente (`POST /api/v1/...`) para portarlo a una ruta Next.js `app/api/.../route.ts` o un controller Express.
3. **Schema de datos** documentado en `docs/data-model.md` como **DDL SQL portable** (Postgres-compatible, sin features exclusivas de Supabase). Incluye tablas, índices, FKs, enums y RLS-equivalentes descritos como "policies a aplicar a nivel app/middleware".
4. **"Edge functions"** futuras documentadas en `docs/backend-jobs.md`: una por archivo con propósito, trigger, payload, side effects, secrets requeridos. Migración 1:1 a Edge Function de Supabase **o** a un cron/worker Node en Railway.
5. **Variables de entorno** centralizadas en `src/lib/env.ts` con tipos. README de migración explica el mapeo `VITE_*` / `process.env.*` → `.env` de Next/Node.
6. **Email (Resend)** vía un único `EmailService` con plantillas en `src/lib/emails/templates/*.tsx`. Migra tal cual a Next.js.
7. **Frontend** ya es React 19 + Tailwind v4 + shadcn — portable a Next.js App Router con cambios mínimos (router y `head()` → `metadata`).

---

## Sistema de diseño (extraído de los PDFs + logo SVG)

- **Logo**: SVG "Freakn'" amarillo entregado por el usuario → subido a Lovable Assets, usado en navbar y footer.
- **Paleta**: amarillo crema hero `#FEF6C7`, amarillo acento marker `#EBD81A` (del SVG), negro `#0A0A0A` para CTAs/texto, gris suave `#F4F4F4`, verde check `#22C55E`.
- **Tipografía**: display sans-serif bold para titulares; sans neutra para body. Highlight "Real" con marker amarillo.
- **Componentes base**: botones pill negros con flecha, tarjetas con radio 2xl, FAQ acordeón con `+`/`×`, tarjeta de precio destacada con borde amarillo, mockups flotantes en hero.
- Tokens definidos en `src/styles.css` (`@theme`, Tailwind v4) y fuentes cargadas vía `<link>` en `__root.tsx`.

---

## Fases

### Fase 0 — Fundamentos (este turno)
- Subir logo SVG a Lovable Assets.
- Tokens en `src/styles.css` + fuentes.
- Componentes base: `Button` (dark-pill), `MarkerHighlight`, `Card`, `FAQItem`, `Navbar`, `Footer`, `PriceCard`.
- Carpeta `src/lib/domain/` con interfaces vacías y stubs en memoria.

### Fase 1 — Landing pública pixel-perfect (este turno)
Ruta `/` siguiendo Home.pdf (desktop) y Movil.pdf (mobile):
1. Navbar (logo, links, "Inicia Sesión", "Escríbenos Ahora", hamburguesa móvil).
2. Hero con titular "Speak English with Confidence, in *Real* Conversations." + mockup compuesto (avatar, tarjetas Progreso 82%, Clase en Vivo, Vocabulario "Adventure").
3. Barra de prueba social (+2000, +20 países, 1 a 1).
4. "¿Cómo Funciona?" — 3 tarjetas con thumbnail (carousel en móvil).
5. Testimonios — 4 tarjetas verticales con foto y quote (carousel en móvil).
6. Precios — 3 planes ($155 / $190 / $225) con el del medio destacado, CTA → `/checkout/:plan`.
7. FAQs — acordeón.
8. Footer con columnas Servicios / Legal / Socials.

Imágenes generadas con `imagegen` siguiendo el look cálido del PDF.

### Fase 2 — Auth stub + onboarding
- `MockAuthService`: login email/password y "Google" simulados, sesión en `localStorage`.
- Rutas `/login`, `/signup`, `/forgot-password`, `/reset-password` (UI completa).
- Layout `_authenticated/` que protege rutas leyendo el mock.
- Documentado: cómo reemplazar por NextAuth/Auth.js + Postgres.

### Fase 3 — Checkout con Widget de Wompi
- Página `/checkout/:plan` con resumen y formulario mínimo (nombre, email, doc).
- Crea una "intención de pago" local (mock) con `reference` único y monto.
- Embebe el **Widget de Checkout de Wompi** (`<form>` + `<script src="https://checkout.wompi.co/widget.js">`) con `data-public-key`, `data-amount-in-cents`, `data-currency=COP`, `data-reference`, `data-redirect-url=/checkout/return`.
- `/checkout/return` muestra estado (lee query params) y crea usuario+suscripción en el mock al recibir `APPROVED`.
- `WOMPI_PUBLIC_KEY` como secret (frontend env). Documentado el contrato del webhook que tú conectarás luego (`event`, `data.transaction`, firma `events_key`).

### Fase 4 — Portal Estudiante (`/app`)
- Dashboard (próxima clase, progreso, accesos).
- Calendario con reprogramación/cancelación (regla 12-24h).
- Módulos por nivel (Principiante/Intermedio/Avanzado): video, PDF, slides HTML, descargables.
- Checkpoints/exámenes que desbloquean nivel.
- Botón "Sí, tomé mi clase hoy" → marca asistencia en repo mock.
- Encuesta de satisfacción mensual (popup automatizado por fecha mock).

### Fase 5 — Portal Profesor (`/teacher`)
- Agenda con estudiantes asignados.
- Bloqueo de ausencias (vacaciones/médico) → notifica al admin (mock).
- Ficha de seguimiento por alumno.
- Validación cruzada de clase dictada.

### Fase 6 — Panel Admin (`/admin`)
- CRM de usuarios (estudiantes activos/inactivos/en riesgo + profesores) con invitación a profesores vía **Resend real**.
- CMS de contenidos (subida de videos como URL, edición de exámenes, módulos, PDFs).
- Dashboard analítico: MRR, suscripciones activas, pagos fallidos, NPS, ranking profesores, churn, módulos estancados (datos derivados del mock).
- Motor de nómina: cálculo mensual por profesor según clases validadas, filtros por periodo, export CSV (la dispersión real por Wompi queda como TODO documentado).

### Fase 7 — Automatizaciones
- Recordatorios "Tu clase es en 1 hora" — definidos como jobs cron en `docs/backend-jobs.md` (no se corren en frontend; documentados para el backend real).
- Email transaccional real (Resend): bienvenida, confirmación de compra, recuperación de pago fallido.
- WhatsApp/SMS: TODO documentado.

### Fase 8 — PWA + Tiendas
- Manifest + service worker (instalable).
- Empaquetado App Store / Google Play queda para después del MVP web.

---

## Entregable de este turno (si apruebas)

**Fase 0 + Fase 1 completas**: tokens + logo SVG + landing pública pixel-perfect (desktop y mobile) con imágenes generadas y rutas placeholder para login/signup/checkout. Documento inicial `docs/migration.md` con la estrategia de portabilidad.

Después continuamos con Auth stub, Wompi widget y los portales en turnos posteriores.

¿Procedo así?
