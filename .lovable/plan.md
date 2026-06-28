## Plan de implementación

Prioridad: destrabar primero `/admin/users/:id` e impersonación, luego conectar el resto de flujos al backend real.

### 1. Arreglar navegación CRM y perfil de usuario admin

- Corregir la causa principal: `admin.users.tsx` hoy es ruta padre con hijos pero no renderiza `<Outlet />`, por eso `/admin/users/:id` mantiene visible la tabla.
- Convertir `/admin/users` en layout con `<Outlet />` y mover la tabla a `/admin/users/` mediante una ruta index.
- Conectar la lista CRM y el perfil a endpoints reales:
  - `GET /api/v1/admin/users`
  - `GET /api/v1/admin/users/:id`
  - `PATCH /api/v1/admin/users/:id`
  - `PATCH /api/v1/admin/users/:id/status`
  - `PATCH /api/v1/admin/users/:id/delete`
  - `POST /api/v1/admin/users/:id/reset-password`
  - `PATCH /api/v1/admin/users/:id/assign-teacher`
  - `POST /api/v1/admin/users/:id/impersonate`
- Completar `storefront/src/lib/api/endpoints.ts` con todos los métodos admin que ya existen en backend y los faltantes.
- Arreglar queries rotas del backend en `AdminService.userDetail`:
  - Cambiar `scheduledAt` por `startsAt`.
  - Cambiar referencias incorrectas de notas (`authorId`/`author`) por las relaciones reales (`teacherId`/`teacher`).
  - Devolver perfiles completos de profesor y estudiante con datos normalizados para la UI.
- En perfil de profesor mostrar:
  - Datos básicos, estado, tarifa/agenda, clases, estudiantes asignados, pagos de nómina del periodo, notas hechas, disponibilidad semanal.
- En perfil de estudiante mostrar:
  - Datos básicos, documento, celular, profesor asignado, suscripción, pagos, clases, avance, NPS, notas privadas del profesor.
- Hacer que “Ver como este usuario” use el token del backend, actualice `accessToken`, rehidrate `/me` y muestre el banner de impersonación.
- Agregar botón de “Regresar a administrador” que restaure sesión admin limpiamente.

### 2. Usuarios, activación y creación desde admin

- Agregar/usar campos obligatorios de perfil:
  - `documentNumber`
  - `phone` en formato internacional, con label “Celular”.
- En registro público y creación admin exigir:
  - Nombre completo
  - Email
  - Documento
  - Celular
  - Nivel si es estudiante
- Mantener la regla: crear estudiante no activa suscripción; la activación ocurre con pago aprobado.
- Bloquear login si el usuario está desactivado o eliminado.
- Responder el flujo de contraseña así:
  - Admin no define contraseña final.
  - Backend genera token de configuración/reset.
  - En producción se envía por Resend.
  - En desarrollo se devuelve el link/token para pruebas.

### 3. CMS 100% backend y HTML aislado

- Reemplazar CRUD local del CMS por backend:
  - `GET /admin/content`
  - `POST /admin/content/modules`
  - `PATCH /admin/content/modules/:id`
  - `PATCH /admin/content/modules/:id/delete`
  - `POST /admin/content/lessons`
  - `PATCH /admin/content/lessons/:id`
  - `PATCH /admin/content/lessons/:id/delete`
- Agregar endpoints faltantes al cliente para módulos, lecciones, adjuntos y uploads.
- Ajustar adapters para no perder campos `kind`, `contentHtml`, `notes`, `attachments`.
- Permitir HTML completo en lecciones tipo `html`, incluyendo `<!doctype>`, `<html>`, `<head>`, `<style>` y `<script>`.
- Renderizar lecciones HTML al estudiante dentro de un `<iframe srcDoc={...}>` aislado del front principal.
- Usar `sandbox` en el iframe con permisos mínimos necesarios para que scripts del contenido funcionen sin contaminar la app.
- Conectar carga de archivos a MinIO/S3:
  - Pedir URL firmada a `POST /admin/uploads/sign`.
  - Subir con `PUT` directo a MinIO.
  - Registrar adjunto con `POST /admin/content/lessons/:id/attachments`.
  - Permitir eliminar adjuntos.
- Verificar `.env.example` con variables MinIO/S3 y documentar cómo correrlo en Railway/local.

### 4. NPS conectado al backend y nueva regla de aparición

- Reemplazar NPS local por backend:
  - `GET /surveys/pending`
  - `POST /surveys/nps`
  - `GET /admin/surveys`
  - Nuevo `POST /admin/users/:id/nps/reset`
- Cambiar regla de aparición:
  - Ya no cada 30 días.
  - Aparece al finalizar la última clase de la suscripción/periodo activo.
  - También aparece si admin reinicia/solicita encuesta para ese estudiante.
- Guardar la encuesta con relación a usuario y, si aplica, suscripción/periodo para evitar duplicados.
- En admin perfil de estudiante agregar acción “Reiniciar encuesta NPS”.
- Mantener privacidad: profesores no pueden ver NPS; sólo admin.
- La encuesta seguirá siendo obligatoria cuando esté pendiente.

### 5. Checkout, Wompi y flujo obligatorio de onboarding

- Confirmación: el backend ya tiene ruta base para webhook Wompi:
  - `POST /api/v1/public/wompi/webhook`
- Ajustarla para que sea testeable end-to-end:
  - Validar firma.
  - Registrar evento idempotente.
  - Marcar `PaymentIntent`.
  - Si pago es aprobado y no existe usuario, crear/actualizar usuario estudiante con datos del checkout.
  - Activar suscripción.
  - Encolar email de bienvenida.
- Conectar checkout del frontend a backend:
  - `POST /checkout/intents`
  - Usar `publicKey`, `reference`, `amountInCents`, `currency`, `signature`, `redirectUrl` devueltos por backend.
  - Incluir firma de integridad en widget Wompi.
- Agregar endpoint para consultar estado al volver del redirect:
  - `GET /checkout/status?reference=...` o `?wompiId=...`
- Cambiar home/landing:
  - El CTA principal no debe saltar directo al plan de 4 días.
  - Debe llevar a selección de plan para escoger entre 3, 4 o 5 días.
- Quitar “opcional” de documento y celular en checkout; ambos obligatorios e internacionales.
- Registro (`/signup`) también debe pedir Documento y Celular obligatorios.

### 6. Gate de usuario estudiante según estado real

Crear un flujo obligatorio posterior a login/pago:

```text
Login / pago aprobado
  ├─ falta Documento o Celular → completar datos
  ├─ no tiene suscripción activa → seleccionar plan
  ├─ tiene suscripción activa pero no tiene horario → seleccionar horario
  └─ todo completo → portal estudiante
```

- Si estudiante no tiene suscripción activa:
  - No debe poder usar aprendizaje, calendario ni dashboard completo.
  - Verá estado visual claro y CTA a seleccionar plan.
- Si tiene pago activo pero no horario:
  - Sólo verá selección de horario.
- Admin y profesor no pasan por este gate.

### 7. Horarios configurables y asignación automática de profesor

Backend:
- Aprovechar `TeacherAvailability` existente y agregar lo faltante:
  - `StudentSchedulePreference` o equivalente para guardar selección del estudiante.
  - `ScheduleRequest` para estado `auto_assigned` / `manual_pending`.
- Endpoints nuevos:
  - `GET /schedule/availability-grid` para que estudiante vea semana/horas disponibles.
  - `POST /schedule/preferences` para enviar selección.
  - `GET /admin/schedule/teachers/:id/availability`.
  - `PUT /admin/schedule/teachers/:id/availability`.
  - `GET /admin/schedule/requests` para casos sin profesor compatible.
  - `POST /admin/schedule/requests/:id/assign` para resolución manual.
- Reglas:
  - El plan define cuántos bloques semanales debe escoger: 3, 4 o 5.
  - El estudiante escoge día + hora en calendario semanal.
  - Backend busca profesor con disponibilidad para todos esos bloques, sin choques con clases ni ausencias.
  - Si encuentra profesor: asigna profesor, guarda preferencias y genera clases del periodo activo.
  - Si no encuentra: guarda solicitud manual y muestra mensaje de que el equipo lo contactará.

Frontend:
- Crear selector semanal tipo calendario con días y horas.
- Limitar selección al número de días del plan.
- Admin podrá configurar disponibilidad de profesores desde perfil de profesor o nuevo módulo “Horarios”.
- Admin podrá ver solicitudes pendientes y asignar profesor manualmente.

### 8. Sustituir mocks críticos por API real

- Mantener los helpers antiguos sólo como adapters temporales donde sea necesario, pero las acciones críticas deben pegar al backend:
  - CRM
  - Impersonación
  - CMS
  - NPS
  - Checkout
  - Horarios
  - Asignación profesor-estudiante
  - Progreso de lecciones
- Donde el backend no esté disponible, mostrar error de conexión claro, no guardar cambios falsos en localStorage.

### 9. Migraciones y documentación

- Crear migración Prisma para:
  - Documento del usuario.
  - Campos de checkout/customer document si faltan.
  - Relación de NPS a suscripción/solicitud.
  - Preferencias de horario del estudiante.
  - Solicitudes de horario manual.
- Actualizar:
  - `backend/.env.example`
  - `storefront/.env.example`
  - `docs/data-model.md`
  - `docs/INTEGRATION_PLAN.md`
  - `docs/IMPROVEMENTS_LOG.md`
- Dejar explícito cómo probar local:
  - Levantar backend.
  - Correr migraciones/seed.
  - Configurar `VITE_API_URL`.
  - Probar webhook Wompi sandbox con `POST /api/v1/public/wompi/webhook`.

### Orden de ejecución recomendado

1. Arreglar `/admin/users/:id` y conectar perfil/acciones admin al backend.
2. Corregir `AdminService.userDetail` y endpoints faltantes.
3. Conectar impersonación real con JWT del backend.
4. Conectar CMS al backend + iframe HTML.
5. Conectar NPS + reset + nueva regla de última clase.
6. Conectar checkout/Wompi completo.
7. Implementar gate de onboarding estudiante.
8. Implementar calendario semanal + disponibilidad admin + auto-asignación.
9. Documentar y dejar variables/migraciones listas para Railway.