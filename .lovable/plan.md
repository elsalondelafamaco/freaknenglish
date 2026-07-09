## Continuación de la implementación

Ya está entregado:
- Paso 1-2: CRM, perfil admin, impersonación con JWT, activar/desactivar, editar, reset password.
- Paso 3: CMS conectado al backend (módulos y lecciones), HTML aislado en iframe.
- Paso 4: NPS conectado al backend + reinicio desde admin.

Falta ejecutar el resto (pasos 5-9). Propongo hacerlo en 3 iteraciones enfocadas para no romper builds:

---

### Iteración A — Checkout + Wompi end-to-end

Backend:
- `checkout.service.ts`: aceptar `customerDocument` y `customerPhone` obligatorios (ya está el campo, sólo validar).
- `wompi.service.ts`: cuando `APPROVED` y no hay `userId`, buscar por email; si no existe, crear usuario estudiante con `customerName/Email/Phone/Document` y token de set-password. Luego activar suscripción.
- Nuevo endpoint `GET /checkout/status?reference=...` para que el `/checkout/return` sepa si aprobó.
- `main.ts`: registrar `express.raw` sólo para `/api/v1/public/wompi/webhook` para validar firma sobre el raw body.

Storefront:
- `/checkout/$planId.tsx`: pedir `documentNumber` y `phone` obligatorios; llamar `POST /checkout/intents`; montar widget de Wompi con `publicKey`, `reference`, `amountInCents`, `signature`, `redirectUrl`.
- `/checkout/return.tsx`: hacer polling a `/checkout/status` para mostrar aprobado/rechazado.
- Home CTA: llevar a `/pricing` (o selector 3/4/5), no directo a plan de 4.

### Iteración B — Onboarding gate estudiante + horarios

Backend:
- Migración Prisma:
  - `StudentSchedulePreference { userId, dayOfWeek, startHour, ... }`
  - `ScheduleRequest { userId, status: auto_assigned | manual_pending, teacherId? }`
- Endpoints:
  - `GET /schedule/availability-grid` — devuelve grilla de horas con al menos un profesor disponible.
  - `POST /schedule/preferences` — recibe N bloques (N = plan.daysPerWeek), busca profesor con disponibilidad para TODOS, si encuentra: asigna + crea clases del periodo; si no: crea `ScheduleRequest manual_pending`.
  - `GET /admin/schedule/requests` + `POST /admin/schedule/requests/:id/assign`.
  - `GET/PUT /admin/schedule/teachers/:id/availability`.

Storefront:
- `_authenticated` layout: si rol `student`:
  - falta doc/phone → redirigir a `/onboarding/profile`
  - sin suscripción activa → redirigir a `/pricing`
  - con suscripción y sin horario → redirigir a `/onboarding/schedule`
- `/onboarding/schedule.tsx`: calendario semanal día×hora, forzar exactamente N bloques, POST → si `auto_assigned` va a `/app`, si `manual_pending` muestra mensaje "te contactaremos".
- Admin perfil profesor: editar disponibilidad semanal.
- Nueva página `/admin/schedule` con solicitudes pendientes.

### Iteración C — Nómina real + limpieza mocks + docs

- `AdminService.payroll`: usar `ClassSession` con `status=validated`, `duration`, `teacher.hourlyRateCop` real; permitir editar tarifa en perfil profesor.
- Botón CSV export ya conectado.
- `storefront/.env.example` y `backend/.env.example`: variables MinIO/S3 completas + Wompi + Resend.
- `docs/IMPROVEMENTS_LOG.md` y `docs/data-model.md` actualizados.
- Eliminar rutas de mock/localStorage críticas en `admin.ts`, `learning.ts`, `admin-actions.ts` que ya no se usan.

---

### Confirmación necesaria

Cada iteración toca 8-15 archivos y agrega ≥1 migración. Prefiero ejecutarlas una por una (A → B → C) para poder typechequear entre medias y no romperte el preview. **¿Voy con la Iteración A (Checkout + Wompi) directamente o prefieres que arranque por otra?**
