# SDD — Scheduling v2: horario pre-pago, calendarios y auto-asignación

Estado: **APROBADO** (Q1–Q3, Q8 decididas por el cliente; Q4–Q7 con default salvo veto)
Alcance: storefront + backend (rama `feat/pdf-compliance`)
Zona horaria: America/Bogota (UTC-5 fijo, sin DST) — convención existente.

---

## 1. Objetivo

El estudiante elige su **horario semanal antes de pagar** (después de elegir plan).
El sistema decide de forma invisible si puede **auto-asignar profesor** (arranque
automático tras el pago) o si entra en **flujo manual** (el equipo lo contacta),
sin exponer jamás información de profesores. Profesores y admin gestionan las
clases en **calendarios tipo Google Calendar** (drag & drop, vista semanal).

## 2. Glosario

- **Franja (slot)**: bloque recurrente semanal `(weekday, hour)` → clase de 50 min `HH:00–HH:50`.
- **Ventana global**: días y horas permitidos para clases (config admin).
- **Slot recurrente (`ScheduleSlot`)**: compromiso semanal profesor↔estudiante en una franja. Fuente de verdad de ocupación.
- **Hold**: retención del slot de un estudiante vencido por 5 días hábiles.
- **Auto-asignable**: existe UN MISMO profesor con TODAS las franjas seleccionadas libres.

## 3. Configuración global (admin, sin deploy)

`app_settings` (nuevas claves, editables en Admin → Planes, tarjeta "Agenda"):

| Clave | Default | Significado |
|---|---|---|
| `schedule.days` | `[1,2,3,4,5]` (L–V) | Días permitidos (0=Dom…6=Sáb) |
| `schedule.startHour` | `7` | Primera franja: 7:00–7:50 |
| `schedule.endHour` | `18` | Última franja: 18:00–18:50 |
| `schedule.maxPerDay` | `1` | Máx clases por día por estudiante |

Duración fija: 50 min. Total semanal = `plan.daysPerWeek` (3/4/5), independiente de `maxPerDay`.

Endpoints: `GET /public/schedule/config` (público) · `GET/PATCH /admin/settings/schedule`.

## 4. Modelo de datos

### 4.1 Nuevo `ScheduleSlot`
```prisma
model ScheduleSlot {
  id            String    @id @default(uuid())
  teacherId     String
  studentId     String
  weekday       Int       // 0..6
  hour          Int       // hora local Bogotá
  status        String    @default("active") // pending | active | held
  holdExpiresAt DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  @@unique([teacherId, weekday, hour]) // un estudiante por franja-profe
  @@index([studentId])
}
```
- `pending` (reserva de pago, 20 min), `active` y `held` **ocupan** la franja (bloquean matching).
- Reemplaza a `User.schedulePreferences` como fuente de verdad (queda como espejo de lectura durante la transición).
- El generador de clases y el matching leen SOLO de aquí.

### 4.2 Cambios en modelos existentes
- `PaymentIntent`: `+ scheduleJson Json?` (franjas elegidas), `+ assignmentMode String?` (`auto|manual`).
- `Class`: `+ autoValidated Boolean @default(false)` (auditoría de auto-tomada).
- `TeacherAvailability`: sin cambios de modelo (editor nuevo solo en UI).

## 5. Flujo de compra

**Orden: plan → horario → datos + pago → Wompi → return.**

### 5.1 Picker de horario (`/checkout/$planId/schedule`, público)
- Grid semanal: columnas = `schedule.days`, filas = horas `startHour..endHour`, celdas de 50 min.
- Selección obligatoria: exactamente `plan.daysPerWeek` franjas, máx `maxPerDay` por día.
- **Hints**: franjas con auto-asignación posible se destacan (ej. "⚡ inicio inmediato"); el resto se ve normal y ES seleccionable (nunca rojo/bloqueado) — solo cambia el flujo interno.
- Al (de)seleccionar, los hints se recalculan para mostrar solo combinaciones compatibles con un mismo profesor.
- Usuario logueado (renovación): franjas anteriores preseleccionadas si siguen disponibles para él (§7). Si el plan nuevo tiene otra cantidad de días, ajusta la selección.

### 5.2 Algoritmo de hints (sin exponer profesores)
```
W  = ventana global
A(t) = franjas declaradas del profe t (TeacherAvailability)
O(t) = franjas con ScheduleSlot active|held del profe t
F(t) = A(t) − O(t)                       // libres reales
C(S) = { t : S ⊆ F(t) }                  // profes compatibles con la selección S
auto(d,h) = existe t en C(S) con (d,h) en F(t)   // hint por franja
assignable(S) = C(S) no vacío
```
- `POST /public/schedule/availability { planId, slots } → { assignable, hints[] }` — **solo booleanos**, jamás ids/nombres/conteos de profesores.
- **Las ausencias (`TeacherAbsence`) NO participan** en este cálculo (son puntuales; se resuelven con reemplazos/reprogramación).

### 5.3 Aviso pre-pago (flujo manual)
Si `assignable=false` al continuar, ANTES de pagar se muestra (tono cálido, sin fricción):
> "Ese horario está muy solicitado 💛. Completa tu compra con total tranquilidad: nuestro equipo te contacta en menos de 24 h hábiles para coordinar tu profesor y el inicio de tus clases. Tu cupo queda garantizado."

### 5.4 Intent y materialización al aprobar el pago
- `createIntent` recibe `slots[]`; el server calcula y guarda `assignmentMode` (el candidato NO viaja al cliente).
- En `finalizeTransaction` (webhook o poll, idempotente):
  - **auto**: revalidar `C(S)`; elegir profe con menos slots ocupados (desempate por id). Crear `ScheduleSlot`s, `assignedTeacherId`, `scheduleAssignmentStatus='auto_assigned'`, generar clases, aula (board), notificaciones. Todo automático.
  - **carrera perdida** (franja tomada durante el pago): intentar otro profe compatible; si no hay → degradar a manual (sin error para el usuario, notificación interna a admins).
  - **manual**: `scheduleAssignmentStatus='manual_pending'`, guardar franjas deseadas, notificar admins (in-app + email) y al estudiante ("te contactamos…").
- **Reserva de 20 min durante el pago** (decisión Q3): al crear el intent en modo auto se
  crean `ScheduleSlot`s `status='pending'` con `holdExpiresAt = now + 20 min` para el profe
  elegido, y la URL de Wompi incluye `expiration-time = now + 20 min` → el link de pago vence
  junto con la reserva.
  - Conflicto al reservar (carrera en el instante de crear el intent): se intenta otro profe
    compatible; si no hay → modo manual (sin reserva).
  - `APPROVED` ⇒ `pending→active`. Si el pending ya fue limpiado (pago tardío), se revalida y
    recrea con fallback (otro profe → manual).
  - `DECLINED/VOIDED/ERROR` ⇒ liberar pendings del intent.
  - Job (tick 5 min) limpia `pending` con `holdExpiresAt` vencido.
- Renovación con slots `held` propios: se reactivan (`held→active`), mismo profe, clases regeneradas.

### 5.5 Asignación manual (admin)
En la cola de solicitudes existente, el admin ve las franjas deseadas y qué profesores tienen conflicto por franja. Al asignar: se crean los `ScheduleSlot`s (validando libres), clases, aula y notificaciones — igual que el flujo auto.

## 6. Post-pago / gate de la app

- Auto: usuario entra a `/app` con calendario listo (auto-redirect del return existente).
- Manual: entra a `/app`; el dashboard muestra "Estamos coordinando tu profesor" (sin bloquear el módulo de aprendizaje). El gate ya NO redirige a `/onboarding/schedule` (paso obsoleto para compras nuevas).

## 7. Vencimiento, hold de 5 días hábiles y renovación

1. Job diario marca `active→expired` (existente).
2. Al expirar: sus `ScheduleSlot`s pasan a `held` con `holdExpiresAt = +5 días hábiles (L–V)` contados desde `currentPeriodEnd`.
3. `held` sigue ocupando la franja (no comprable por otros). Clases futuras ya generadas se conservan visibles con badge "Sin pago" para el profe (él decide dictarlas o no).
4. Job diario libera holds vencidos: borra los slots y **cancela** las clases `scheduled` futuras de ese estudiante. La franja queda comprable automáticamente.
5. Renovación:
   - Dentro del hold → mismas franjas y profe, `held→active`, clases regeneradas.
   - Después del hold y franja tomada → UI: "Tu horario anterior ya no está disponible" → paso de selección de horario → flujo normal.

## 8. Calendario del profesor (`/teacher/calendar`)

Librería propuesta: **FullCalendar** (React, plugins timeGrid + interaction; licencia MIT) con estilo de marca (ver Q8).

- Vista semanal con TODAS sus clases (todos sus estudiantes).
- Cada evento: estudiante, estado, y **badge "Sin pago"** si la suscripción del estudiante no está activa (solo booleano, sin montos).
- Ausencias propias como bloques de fondo (solo lectura).
- **Drag & drop** de una clase → modal: **"¿Solo esta semana o siempre?"**
  - **Solo esta semana**: mueve únicamente esa clase (`Class.startsAt/endsAt`). NO toca `ScheduleSlot` ⇒ no afecta su disponibilidad para matching. Estudiante notificado.
  - **Siempre**: mueve el `ScheduleSlot` a la nueva franja (validando: dentro de la ventana global y franja libre del profe) + reprograma TODAS las clases futuras de ese patrón. La franja vieja queda libre para matching; la nueva, ocupada. Estudiante notificado.
  - No permite soltar sobre franja ocupada (otra clase esa semana / otro slot recurrente).
- **"No tomada"** desde el evento: permitido desde el inicio de la clase hasta 48 h después del fin (revierte la auto-tomada si ya ocurrió).

### 8.1 Editor de disponibilidad (`/teacher/availability`, rediseño)
Grid semanal tipo calendario: pintar/despintar celdas con click o arrastre; guardar
persiste en `TeacherAvailability` (rangos fusionados) y refresca el matching al instante.
Nota: reducir disponibilidad NO desaloja estudiantes existentes (los `ScheduleSlot`s priman); solo afecta asignaciones nuevas.

## 9. Calendario del admin (`/admin/calendar`)

- Vista semanal con las clases de TODOS los profesores.
- Chips de filtro por profesor (activar/desactivar), **color distinto por profe** (paleta hash estable).
- Solo lectura en v1 (ediciones: vía profe o impersonación).

## 10. Auto-tomada de clases

- Job (tick 5 min): `Class` con `status='scheduled'` y `endsAt < now` → `validated`, `autoValidated=true`, `validatedAt=endsAt` (decisión Q2: inmediato).
- El profe puede marcar **no tomada** desde el inicio de la clase y hasta **48 h después del fin** (revierte la auto-tomada).
- Nómina: cuenta `validated` (auto o manual); `no_show` no suma.
- La confirmación del estudiante ("sí tomé mi clase") pasa a ser **informativa** (no bloquea nada) — ver Q7.

## 11. Restricciones del estudiante

- NO puede reprogramar ni cancelar clases. `app.calendar` quita esos botones y muestra: "¿Necesitas mover una clase? Coordínalo con tu profesor" (el profe evalúa y la mueve desde su calendario).

## 12. Resumen de API

| Endpoint | Auth | Descripción |
|---|---|---|
| `GET /public/schedule/config` | — | Ventana global |
| `POST /public/schedule/availability` | — | `{assignable, hints[]}` (solo booleanos) |
| `POST /checkout/intents` | — | + `slots[]`; responde `assignmentMode` |
| `GET /me/schedule` | ✔ | Slots propios + disponibilidad para renovación |
| `GET /teacher/calendar?from&to` | teacher | Clases + `paymentActive` por estudiante |
| `POST /teacher/classes/:id/reschedule` | teacher | `{startsAt, scope:'once'|'forever'}` |
| `POST /teacher/classes/:id/no-show` | teacher | Ventana: inicio → +7 días |
| `GET /admin/calendar?from&to` | admin | Todas las clases + profe |
| `GET/PATCH /admin/settings/schedule` | admin | Config ventana |

## 13. Criterios de aceptación

**Config**
- AC-1: Admin edita días/horas/máx-por-día y el picker público lo refleja sin deploy.
- AC-2: Defaults L–V, 7:00→18:00 (última 18:00–18:50), 1/día, 50 min.

**Picker**
- AC-3: Selección de exactamente `daysPerWeek` franjas, máx `maxPerDay` por día; no continúa con selección incompleta.
- AC-4: Franjas auto-asignables se destacan; las demás son seleccionables sin marcarse como error.
- AC-5: Hints recalculados en cada cambio de selección: siempre compatibles con UN mismo profesor.
- AC-6: Ninguna respuesta pública contiene id, nombre ni conteo de profesores.
- AC-7: Selección no auto-asignable ⇒ aviso amable pre-pago y el flujo continúa.
- AC-8: Ausencias de profesores no alteran hints ni asignación.

**Pago/asignación**
- AC-9: Pago aprobado + auto ⇒ slots creados, profe asignado, clases + aula generadas, cero intervención manual.
- AC-10: Pago aprobado + manual ⇒ `manual_pending`, admins notificados con franjas deseadas, estudiante ve "coordinando profesor" y no queda bloqueado del aprendizaje.
- AC-11: Reserva de 20 min creada al iniciar el pago; el link de Wompi vence a los 20 min; pago tardío o carrera ⇒ revalidación con fallback (otro profe → manual), nunca error al usuario; doble activación imposible.

**Hold / renovación**
- AC-12: Expira suscripción ⇒ slots `held`, invisibles para nuevos compradores.
- AC-13: +5 días hábiles (L–V) ⇒ liberación automática + cancelación de clases futuras del vencido.
- AC-14: Renueva dentro del hold ⇒ mismo horario y profe, clases regeneradas.
- AC-15: Renueva después y franja tomada ⇒ aviso UI + redirección al picker.

**Calendario profe**
- AC-16: Semana con todas sus clases; badge "Sin pago" cuando aplica.
- AC-17: Drag&drop siempre pregunta "¿Solo esta semana o siempre?".
- AC-18: "Solo esta semana" no altera el matching de disponibilidad.
- AC-19: "Siempre" mueve slot + clases futuras y actualiza matching y calendario del estudiante.
- AC-20: Imposible soltar sobre franja ocupada.
- AC-21: "No tomada" disponible desde el inicio de la clase hasta 48 h después del fin.
- AC-22: Editor de disponibilidad por pintado; guardado impacta matching de inmediato.

**Auto-tomada**
- AC-23: `scheduled` pasa a tomada apenas termina (≤5 min) si nadie la marcó no tomada; corrección posible por 48 h.
- AC-24: Nómina = tomadas (auto o manual).

**Estudiante / Admin**
- AC-25: Estudiante sin botones de reprogramar/cancelar; mensaje de coordinar con el profe.
- AC-26: `/admin/calendar` semanal, color por profe, filtros on/off.

## 14. Decisiones

| # | Tema | Decisión |
|---|---|---|
| Q1 | Días hábiles del hold | **L–V sin festivos** (v1) |
| Q2 | Auto-tomada / corrección | **Inmediata al terminar / profe corrige hasta 48 h** |
| Q3 | Reserva durante el pago | **Reserva de 20 min + `expiration-time` de Wompi a 20 min** |
| Q8 | Calendarios | **FullCalendar (MIT)** |

Asumidos con default (avisar si algo no cuadra):
- **Q4**: el admin define solo el máximo por día; el total semanal sigue siendo el del plan.
- **Q5**: el profe puede mover "para siempre" a cualquier hora de la ventana global aunque no esté en su disponibilidad pintada (la franja queda ocupada igual).
- **Q6**: los horarios actuales de estudiantes activos se migran automáticamente a `ScheduleSlot`s con su profe actual.
- **Q7**: la confirmación del estudiante queda informativa; mandan la auto-tomada y el no-show del profe.

## 15. Fuera de alcance v1

Festivos, cobro recurrente automático, reasignación masiva al reducir disponibilidad,
edición drag&drop en el calendario del admin, (la reserva de cupos SÍ entra: 20 min).

## 16. Fases de implementación (tras aprobar §14)

1. **F1 Backend core**: `ScheduleSlot` + config + hints + intent/finalize + holds + auto-tomada + jobs + migración.
2. **F2 Checkout**: picker + aviso manual + renovación + gate.
3. **F3 Profesor**: calendario drag&drop + no-show + badge pago + editor disponibilidad.
4. **F4 Admin**: calendario global + asignación manual mejorada + config agenda.
5. **F5 Pulido**: restricciones estudiante, textos, QA de ACs.
