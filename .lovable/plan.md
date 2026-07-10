## Estado actual (hecho ✅)

- **Board colaborativo B1–B8**: páginas, Yjs en tiempo real, presencia, editor rico (tablas, imágenes, listas, colores, resaltado), capa de dibujo, snapshots, invitaciones por email, historial de versiones y export Markdown/PDF.
- **D6 — Notificaciones**: emails con branding por env (`BRAND_*`, `RESEND_FROM`, `RESEND_REPLY_TO`), template de ejemplo completo (`payment_success`), inbox in-app con campana, badge y ruta `/notifications`, triggers en Wompi / clases / asignación de profesor.
- Nota: el `dist-check` que reportaste ya pasa limpio al reejecutar tanto `build` como `build:dev` en storefront y `build` en backend. Era un artefacto de la corrida asíncrona anterior — no requiere fix.

## Pendiente por implementar

### D7 — Métricas admin reales (`/admin`)
Hoy `admin.index.tsx` usa mocks parciales. Cablear KPIs desde datos reales:
- **Retención**: cohortes mensuales de estudiantes activos (con clase validada en el mes).
- **Asistencia**: % clases `validated` vs `scheduled` por semana/mes, por profesor.
- **MRR / ARR**: suma de `Subscription.plan.priceCop` activas × frecuencia (COP y USD con TRM).
- **Churn**: cancelaciones / activos al inicio del período.
- **Top profesores**: horas dictadas, NPS promedio.
- **Ingresos**: `PaymentIntent APPROVED` por día (últimos 30/90 días).
- Endpoint `GET /admin/metrics?range=30d|90d|ytd` en backend + cards y sparklines en frontend.

### D8 — Facturas / recibos Wompi en PDF
Desde `app.settings.tsx` → pestaña de pagos, botón "Descargar recibo" por transacción `APPROVED`:
- Endpoint `GET /me/payments/:intentId/receipt.pdf` (auth por dueño).
- Render server-side con `pdfkit` o `@react-pdf/renderer` (Node) con branding del env D6.
- Datos: referencia Wompi, monto, plan, IVA implícito, fecha aprobación, datos del cliente.
- Cache del PDF generado en storage (`billing/receipts/{intentId}.pdf`) para no regenerar.

### D9 — PWA offline básica del catálogo Learning
- `manifest.webmanifest` + iconos + `theme_color` alineado al brand.
- Service worker (Workbox o vanilla) con:
  - Precache del shell (rutas `/app/learning*`).
  - Runtime cache stale-while-revalidate para `GET /learning/*` (módulos y lecciones).
  - Cache de imágenes de lecciones con LRU.
- Botón "Instalar app" en `AppShell` cuando `beforeinstallprompt` esté disponible.
- Página de "Sin conexión" mínima.

### B9 — Comentarios/anotaciones en el board (opcional, quedó fuera de B1–B8)
Hilos de comentarios anclados a una selección de texto en Tiptap (tipo Google Docs):
- Nuevo modelo `BoardComment` (pageId, threadId, userId, body, resolved).
- Marca en el editor con `Mark` custom que apunta al `threadId`.
- Panel lateral con hilos, responder y resolver.
- Broadcast por el mismo gateway con evento `page:comment`.

### Pequeñas mejoras transversales (nice-to-have)
- **Rate limit** por usuario en endpoints sensibles (`/checkout`, `/notifications/read-all`).
- **Salud pública**: `/health/full` que verifique DB + Redis + Resend + Wompi ping.
- **Auditoría admin**: tabla `AdminAction` que registre impersonaciones, asignaciones manuales, cambios de payroll.
- **SEO**: `sitemap.xml` y `robots.txt` en el storefront (hoy sólo hay metadatos por ruta).
- **i18n mínimo**: el landing está en español fijo; extraer strings del shell para un futuro switch EN/ES.

## Orden sugerido

1. **D7** (mayor impacto para admin — usa datos que ya existen).
2. **D8** (feature que suele pedir el negocio para contabilidad).
3. **D9** (nice pero rápido y visible para estudiantes).
4. **B9** solo si quieres cerrar el board 100 % estilo Docs.
5. Mejoras transversales al final o intercaladas.

## Preguntas

- ¿Sigo con D7 primero, o priorizas otra?
- ¿Los recibos D8 deben tener número consecutivo tipo factura fiscal (DIAN) o basta con "recibo interno"? Asumo recibo interno para no meternos con facturación electrónica.
- ¿PWA la quieres solo para Learning o también para el Board (offline con IndexedDB para Yjs)? Asumo solo Learning en D9.