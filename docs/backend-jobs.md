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

## Internal triggers

(se llenan cuando aparezcan)