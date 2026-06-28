# Plan — Bloque 3 de mejoras

## Respuesta rápida: ¿con qué contraseña entra un usuario creado por admin?

Hoy en el mock, al crearlo se guarda `Freakn123!` en `meta.passwordsByEmail` — esa es la contraseña temporal. En backend (NestJS) el flujo correcto, que dejo cableado, es:

1. Admin crea el usuario sin contraseña.
2. Backend genera un `setPasswordToken` (TTL 7 días) y lo guarda en `password_resets`.
3. Resend envía un email "Configura tu contraseña" con link a `/reset-password?token=...`.
4. El usuario abre el link y define su contraseña. Recién ahí puede iniciar sesión.
5. Para estudiantes: la cuenta queda creada pero **sin suscripción**. La suscripción solo se activa con un pago Wompi aprobado (webhook).

Lo voy a exponer también en la UI del CRM: al crear el usuario muestro un toast con el link de "set password" copiable, para poder probarlo sin tener Resend conectado.

---

## 1. CRM admin completo y funcional

### 1.1 Arreglar "Ver como este usuario" (impersonación)
Hoy `startImpersonation` cambia `localStorage` pero `authService.getCurrentUser()` cachea el usuario en memoria, así que `refresh()` no recarga. Cambios:

- `storefront/src/lib/domain/auth.ts`: exponer `reloadCurrentUser()` que relee desde `localStorage` y descarta cache.
- `AuthProvider.refresh()`: llamar `reloadCurrentUser()` antes de `setUser`.
- `admin-actions.ts`: tras `startImpersonation`, disparar un `window.dispatchEvent(new StorageEvent("storage", { key: "freakn.me.v2" }))` para que el banner reaccione.
- `ImpersonationBanner`: ya existe sticky; añadir botón "Volver a mi cuenta" más visible y polling cada vez que cambia `state`.
- `_authenticated.tsx`: respetar el rol del impersonado al redirigir.

### 1.2 Perfil de usuario con todos los datos
Reescribo `admin.users.$id.tsx` con secciones diferenciadas por rol.

**Cabecera (común):**
- Avatar, nombre, email, teléfono, rol(es), estado (activo/inactivo), fecha alta, último login.
- Acciones: Editar, Activar/Desactivar, Resetear contraseña (genera nuevo set-password link), Eliminar (soft delete), Ver como.

**Si es estudiante:**
- Suscripción: plan, estado, días/semana, próximo cobro, fecha inicio, método de pago, botón "Cancelar suscripción".
- Historial de pagos: tabla con fecha, referencia Wompi, plan, monto, estado, link al evento.
- Profesor asignado (selector) + horario semanal.
- Clases: próximas, completadas, no-shows, canceladas, tasa de asistencia.
- Nivel actual + progreso de módulos (% lecciones completadas por nivel) + checkpoints aprobados.
- NPS personal: histórico de encuestas (NPS, profesor, contenido, plataforma, comentario, fecha) — solo visible para admin.
- Notas del profesor (feedback histórico).

**Si es profesor:**
- Disponibilidad semanal y ausencias.
- Estudiantes asignados (lista clickable).
- Clases dictadas este mes / histórico / validadas / no-show.
- NPS agregado de sus estudiantes (promedio de `teacherScore`).
- Pagos: total mes en curso + histórico de payroll runs.

### 1.3 CRUD de usuarios
Acciones nuevas en `admin.users.tsx` y detalle:

| Acción | Mock (storefront) | Backend |
|---|---|---|
| Crear | `createUserByAdmin` (ya existe) | `POST /admin/users` (ya existe) |
| Editar (nombre, tel, nivel, rol) | nueva `updateUser()` | nuevo `PATCH /admin/users/:id` |
| Activar / Desactivar | nueva `setUserActive()` con flag `disabledAt` | `POST /admin/users/:id/disable` y `/enable` |
| Reset password | regenera token y muestra link | `POST /admin/users/:id/reset-password` |
| Eliminar (soft) | nueva `softDeleteUser()` | `DELETE /admin/users/:id` |
| Asignar profesor | ya existe | ya existe |
| Impersonar | arreglo | ya existe |

Schema:
- Añadir `disabledAt DateTime?` y `deletedAt DateTime?` en `User` (Prisma) → nueva migración `20260722000000_user_lifecycle`.
- En el `AuthGuard`, rechazar login si `disabledAt != null` o `deletedAt != null`.
- En el mock, `authService.signIn` valida los mismos flags.

UI: cada acción detrás de un menú "⋯" con confirmación, toasts y refetch.

---

## 2. CMS 100% funcional + MinIO

Hoy `MODULES`/`CHECKPOINTS` son constantes hardcodeadas. Lo convierto en CRUD persistido contra backend (con fallback al mock) y soporte de archivos vía MinIO/S3.

### 2.1 Backend: módulo Learning Admin
- `backend/src/modules/learning/learning-admin.controller.ts` (guard `admin`):
  - `GET/POST/PATCH/DELETE /admin/modules`
  - `GET/POST/PATCH/DELETE /admin/modules/:id/lessons`
  - `POST /admin/lessons/:id/notes` (notas internas del módulo)
  - `GET/POST/PATCH/DELETE /admin/checkpoints` y `/admin/checkpoints/:id/questions`
  - `POST /admin/uploads/sign` → presigned PUT URL contra MinIO/S3 (devuelve `uploadUrl` + `publicUrl`).
- Schema Prisma:
  - Ampliar `Lesson` con `contentHtml String? @db.Text`, `kind`, `notes`, `attachments Json`.
  - Nueva tabla `LessonAttachment` (id, lessonId, name, url, sizeBytes, mimeType).
  - Migración `20260722010000_cms_attachments`.
- Servicio de storage: `backend/src/modules/storage/minio.service.ts` usando `@aws-sdk/s3-presigner` (compatible con MinIO y S3 puro). Lee `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_PUBLIC_URL`, `S3_FORCE_PATH_STYLE`.
- `backend/.env.example`: bloque MinIO + Wompi/Resend ya existente:
  ```
  # S3-compatible storage (MinIO local; Railway MinIO plugin en prod)
  S3_ENDPOINT=http://localhost:9000
  S3_REGION=us-east-1
  S3_ACCESS_KEY=minioadmin
  S3_SECRET_KEY=minioadmin
  S3_BUCKET=freakn-content
  S3_PUBLIC_URL=http://localhost:9000/freakn-content
  S3_FORCE_PATH_STYLE=true
  ```
- `backend/docker-compose.yml`: agregar servicio `minio` (puertos 9000/9001) + un servicio `createbuckets` que ejecuta `mc mb` para que el bucket exista al arrancar. Documentado en `backend/README.md`.

### 2.2 Storefront: editor CMS
- `storefront/src/routes/_authenticated/admin.content.tsx` rehecha:
  - Lista de niveles → módulos (drag ordenable, crear, editar, eliminar).
  - Detalle de módulo en `admin.content.$moduleId.tsx`: editar título/descripción, gestionar lecciones, adjuntos, notas, checkpoint asociado.
- `admin.content.lessons.$lessonId.tsx` con:
  - Campos básicos (título, tipo, duración).
  - Editor HTML (`<textarea>` con preview, sin libs pesadas; opcional aceptar pegado tal cual).
  - Adjuntos: input `<input type=file>` → pide presigned URL al backend → `PUT` directo al MinIO → guarda metadata.
  - Notas internas.
- `lib/api/endpoints.ts`: nuevo `cmsApi` con todos los endpoints + `cmsApi.signUpload(file)`.
- Migración del mock: `lib/domain/learning.ts` queda como fallback con `localStorage` para que la app siga funcional sin backend.

### 2.3 Documentación
- `docs/migration.md`: sección "Storage" explicando que `MINIO_*` se traduce 1:1 a credenciales S3 en Railway y que las URLs públicas dependen del bucket policy.
- `backend/README.md`: pasos para `docker compose up minio`, crear bucket, configurar `.env`.

---

## 3. Nómina funcional conectada al backend

### 3.1 Backend
- `backend/src/modules/admin/admin.service.ts`:
  - `getPayrollRate()` y `setPayrollRate(rateCop)` usando tabla `AppSetting` (`key="teacher_payrate_cop"`); reemplaza la constante `env.TEACHER_PAYRATE_COP` con fallback inicial.
  - `payroll(period)` ya cuenta clases validadas; lo extiendo para incluir todos los profesores (con 0 clases) cuando el query lo pida (`?includeEmpty=1`).
  - `markPayrollPaid(period, teacherId)` que crea/actualiza `PayrollRun` con `status="paid"`.
- `backend/src/modules/admin/admin.controller.ts`:
  - `GET /admin/payroll/rate` y `PUT /admin/payroll/rate`.
  - `POST /admin/payroll/:period/:teacherId/pay`.
- Verificar que `ClassesService.validate()` setea `status="validated"` y `validatedAt` (es la fuente de verdad para nómina). Si no lo hace, lo añado.

### 3.2 Storefront
- `admin.payroll.tsx`:
  - Pasa de cálculo local (`computePayroll`) a fetch contra `adminApi.getPayroll(period)` y `adminApi.getPayrollRate()`.
  - Input editable "Tarifa por clase validada" con botón Guardar.
  - Tabla incluye **todos los profesores** activos del periodo (incluso con 0).
  - Botón "Marcar pagado" por fila.
  - Exportar CSV ya consume el endpoint `GET /admin/payroll/export.csv`.
- `lib/api/endpoints.ts`: añadir `getPayroll`, `getPayrollRate`, `setPayrollRate`, `markPayrollPaid`.

---

## Detalles técnicos resumidos

```
storefront/
  src/lib/api/endpoints.ts        + adminApi.{updateUser, disable, enable, resetPassword, deleteUser, getPayroll, getPayrollRate, setPayrollRate, markPaid}
                                  + cmsApi.{listModules, createModule, …, signUpload}
  src/lib/domain/auth.ts          + reloadCurrentUser(), respect disabledAt/deletedAt
  src/lib/domain/admin-actions.ts + updateUser, setUserActive, softDeleteUser, resetUserPassword
  src/routes/_authenticated/
    admin.users.tsx               actions menu + filtros (rol/estado)
    admin.users.$id.tsx           reescrito con tabs (Perfil, Suscripción, Pagos, Clases, Aprendizaje, NPS, Notas)
    admin.content.tsx             listado CRUD
    admin.content.$moduleId.tsx   editor módulo
    admin.content.lessons.$id.tsx editor lección + uploads
    admin.payroll.tsx             conectado a backend, tarifa editable
  src/components/admin/UserActionsMenu.tsx, ConfirmDialog.tsx (nuevos)

backend/
  prisma/schema.prisma            + User.disabledAt, deletedAt; Lesson.contentHtml/notes; LessonAttachment; AppSetting usado para rate
  prisma/migrations/20260722000000_user_lifecycle/
  prisma/migrations/20260722010000_cms_attachments/
  src/modules/admin/              + endpoints CRUD, payroll rate, mark paid
  src/modules/learning/learning-admin.controller.ts (+ service)
  src/modules/storage/minio.module.ts, minio.service.ts
  src/config/env.ts               + S3_* vars
  docker-compose.yml              + minio + createbuckets
  .env.example                    + bloque S3_*
docs/
  IMPROVEMENTS_LOG.md             actualizado
  migration.md                    sección storage
```

## Notas / supuestos

- El editor HTML será un `<textarea>` con preview HTML sanitizado vía DOMPurify (ligero, mantiene portabilidad a Next.js sin refactor).
- "Activar/Desactivar" es soft (no se borra el row), bloquea login y no aparece en listas por defecto (toggle "Mostrar inactivos").
- En el mock storefront, los uploads MinIO se simulan guardando el `File` como `URL.createObjectURL` y la metadata en `localStorage`; la documentación deja claro que en backend real va contra MinIO.
- No toco la landing pública, el portal del profesor ni el del estudiante salvo lo necesario para reflejar `disabledAt`.
