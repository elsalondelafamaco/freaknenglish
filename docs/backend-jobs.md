# Backend jobs, webhooks y "edge functions"

Cada job/handler que debería correr fuera del cliente se documenta aquí
para que migrar a Edge Functions de Supabase o a workers Node en Railway
sea 1:1.

## Plantilla

```
### <slug>
- Tipo: webhook | cron | trigger
- Propósito:
- Trigger:
- Payload / input:
- Side effects:
- Secrets requeridos:
- Notas de migración:
```

## Webhooks

### wompi-payment-events
- Tipo: webhook (HTTP POST)
- Propósito: recibir eventos `transaction.updated` del Widget de Wompi y
  activar/pausar suscripciones del estudiante.
- Trigger: Wompi llama al endpoint configurado en su panel cuando una
  transacción cambia de estado.
- Payload: JSON con `event`, `data.transaction.{id,status,reference,amount_in_cents,customer_email}`,
  y `signature.checksum`.
- Side effects:
  - Verificar firma con `WOMPI_EVENTS_KEY` (HMAC SHA-256 sobre
    `reference + status + amount_in_cents + timestamp + secret`).
  - Si `APPROVED` → crear/activar `subscriptions`, enviar email de
    bienvenida vía Resend.
  - Si `DECLINED` / `VOIDED` → marcar `payment_intents` y notificar.
- Secrets requeridos: `WOMPI_EVENTS_KEY`, `RESEND_API_KEY`.
- Notas de migración: el usuario conectará este webhook a una Edge Function
  de Supabase **en el corto plazo**; en Railway será una ruta
  `app/api/wompi/webhook/route.ts` en Next.js. El contrato no cambia.

## Cron jobs (Fase 7)

### class-reminder-1h
- Tipo: cron
- Propósito: enviar "Tu clase es en 1 hora" por email y WhatsApp.
- Trigger: cron cada 5 min (`*/5 * * * *`), busca clases que empiecen en
  55–65 min sin recordatorio enviado.
- Side effects: insertar en `notifications_log`, llamar a Resend
  (email) y Twilio/WhatsApp Cloud API (mensaje).
- Secrets: `RESEND_API_KEY`, `WHATSAPP_API_TOKEN` (TBD).

### monthly-satisfaction-survey
- Tipo: cron
- Trigger: 1er día de cada mes a las 09:00 UTC-5.
- Side effects: marcar `survey_due_at` en estudiantes activos para que el
  popup se muestre la próxima vez que entren.

### monthly-payroll-calc
- Tipo: cron
- Trigger: día 1 de cada mes 06:00.
- Side effects: calcular `payroll_runs` por profesor sumando
  `class_attendance` validadas en el mes anterior.

### abandoned-cart-recover
- Tipo: cron
- Propósito: enviar email "te quedó pendiente tu plan" a leads con
  `payment_intents.status = 'PENDING'` y antigüedad entre 30 min y 7 días.
- Trigger: cron `*/15 * * * *`.
- Side effects: insertar fila en `notifications` con `dedupe_key =
  'abandoned:' || reference` y llamar Resend.
- Secrets: `RESEND_API_KEY`.

### subscription-renewal-reminder
- Tipo: cron
- Propósito: avisar 3 días antes de la renovación automática Wompi.
- Trigger: cron diario 09:00.
- Side effects: `notifications` (`dedupe_key = 'renewal:'||sub_id||':'||period_end`).

### nps-monthly-trigger
- Tipo: cron
- Trigger: día 1 de cada mes 10:00.
- Side effects: encola in_app "responde NPS" (`dedupe_key = 'nps:'||user_id||':'||YYYY-MM`).

## Notas de implementación — transport intercambiable

En el mock actual, `src/lib/domain/notifications.ts` expone:
- `runAutomations()` — el cuerpo de los crons listados arriba, ejecutable
  desde el panel admin (`/admin/notifications`) o lazy al entrar al portal.
- `Transport` interface con dos implementaciones:
    - `LogTransport` (default) → no envía, solo registra.
    - `ResendTransport` (placeholder) → cuando migremos a Railway/Next.js,
      su `send()` hará `POST /api/notifications/send` y el endpoint
      Node llamará a Resend con `RESEND_API_KEY`. El payload (`to`,
      `subject`, `html`) ya está en el formato final.
- `enqueueNotification()` usa `dedupeKey` → idempotente. La tabla
  `notifications` (ver `docs/data-model.md`) lo replica con UNIQUE.

Cuando se enchufe Resend real:
1. Crear endpoint server-side que valide auth y haga `fetch` a Resend.
2. Reemplazar `setTransport(ResendTransport)` en bootstrap.
3. Mover `runAutomations()` a cron jobs (los listados arriba) en lugar
   de invocarlo lazy desde el frontend.
## Internal triggers

(se llenan cuando aparezcan)