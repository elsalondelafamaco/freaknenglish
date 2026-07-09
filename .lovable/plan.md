
# Plan — Board colaborativo en tiempo real

## Contexto de lo ya hecho vs. faltante

Backend ya tiene los cimientos: modelos `Board`, `BoardMember`, `BoardOp`, `BoardService` (append idempotente por `clientOpId`, secuencia monotónica, catch-up `/ops?since=`), `BoardController` (list/create/get/ops/invite) y `BoardGateway` de Socket.IO (`/board` namespace, `board:join/op/cursor/presence`). Falta: modelo de páginas, permisos por clase, UI completa (editor rico, dibujo, páginas, presencia, invitación), cliente WS en el storefront, e integración con la clase asignada estudiante↔profesor.

Del resto del backlog **sí quedan pendientes** además del board:
- **D6** — Notificaciones (email Resend + in-app) para: pago exitoso, clase reservada, recordatorio 24h/1h, reasignación de profesor, NPS. Templates ya existen; falta cablear disparadores y el listado in-app.
- **D7** — Métricas admin: KPIs de retención, asistencia, MRR/ARR desde datos reales (hoy `admin.index.tsx` usa mocks parciales).
- **D8** — Descarga de facturas/recibos Wompi (PDF) desde `app.settings.tsx`.
- **D9** — PWA offline básica para el catálogo de learning.

Este plan cubre **solo el Board** (el más grande). Al terminarlo confirmamos si sigo con D6→D9.

## Alcance funcional del Board

Un espacio colaborativo por clase (o standalone) donde estudiante y profesor entran en tiempo real. Compuesto por:

1. **Páginas** dentro de un board: crear, renombrar, reordenar, duplicar, eliminar, jerarquía plana con orden por `position`.
2. **Editor rico por página** (tipo Notion/Docs): H1/H2/H3, párrafo, listas, checklist, quote, code block, divider, imagen (subida a storage), tabla con filas/columnas editables, negrita/cursiva/subrayado/tachado, color de texto/resaltado, alineación, familia y tamaño de fuente, enlaces, embebidos (YouTube/Loom).
3. **Capa de dibujo** por página (pizarra): lápiz, borrador, colores, grosor, formas básicas (línea, rect, elipse, flecha), texto libre, undo/redo, borrar página. Coexiste con el texto (overlay o modo "canvas").
4. **Tiempo real**: cambios se propagan <200 ms; cursores/selecciones de otros usuarios visibles con nombre y color; indicador de "escribiendo"; presencia (avatares) por página.
5. **Persistencia y reconexión**: snapshot + op-log; al reconectar se pide `since=lastSeq` y se reproducen operaciones perdidas; conflictos resueltos por CRDT (Yjs).
6. **Permisos**: `owner` (profesor por defecto), `editor` (estudiante asignado), `viewer` (invitado). Solo owner invita/expulsa/borra board. Board de una clase auto-crea membresías con `assignedTeacherId` + `userId` del estudiante.
7. **Exportación**: cada página exportable a PDF (impresión nativa) y Markdown; board completo a ZIP de MD + PNG de dibujos.
8. **Historial**: lista de versiones (snapshots cada N ops o manual "Guardar versión") con vista previa y restauración.

## Arquitectura técnica

### Backend (NestJS + Prisma + Socket.IO)

Nueva migración `20260813000000_board_pages_yjs`:

```text
board_pages
  id, board_id (FK cascade), title, position, kind ('doc'|'canvas'|'mixed'),
  yjs_state Bytea (snapshot binario Yjs), created_at, updated_at
  unique(board_id, position)

board_page_ops   (reemplaza uso genérico de board_ops para páginas)
  id, page_id (FK cascade), user_id, client_op_id, update Bytea (Yjs update),
  seq int, created_at
  unique(page_id, seq)  unique(page_id, client_op_id)

board_versions
  id, board_id, label, snapshot Json, created_at, created_by
```

Cambios en `BoardService`:
- CRUD páginas (`createPage`, `renamePage`, `reorderPages`, `duplicatePage`, `deletePage`).
- `appendPageOp({ pageId, userId, update, clientOpId })` con seq por página.
- `getPage(pageId)` → snapshot + `lastSeq`.
- `opsSincePage(pageId, since)` para catch-up.
- `snapshotPage(pageId)`: cada 50 ops o cada 5 min, condensa updates en `yjs_state` con `Y.encodeStateAsUpdate`.
- Auto-crear board al confirmar reserva de clase (hook en `ClassesService.book`): owner=profesor, member=estudiante.
- Endpoint `POST /boards/:id/versions` (checkpoint manual) y `POST /boards/:id/versions/:vid/restore`.

Ampliar `BoardGateway`:
- `page:join { pageId }` → room `page:${id}`, envía `snapshot + lastSeq`.
- `page:update { pageId, update, clientOpId }` → persiste + broadcast `page:update` a la room.
- `page:awareness { pageId, state }` (cursor Yjs + selección + color) → broadcast efímero.
- `page:presence` con avatares por página.
- Throttle server-side (bucket por socket, 60 ops/s).

Autorización: cada handler valida `ensureMember(boardId)` y que la página pertenezca al board.

### Frontend (React + TanStack)

Librerías nuevas:
- `yjs` + `y-protocols` (CRDT + awareness).
- `@tiptap/react` + extensiones: `starter-kit`, `table`, `link`, `image`, `underline`, `text-style`, `color`, `highlight`, `font-family`, `task-list`, `placeholder`, `collaboration`, `collaboration-cursor`.
- `perfect-freehand` + `<canvas>` propio (evitamos tldraw por tamaño); dibujo se serializa como shapes JSON en un `Y.Array` compartido para colaboración.
- `socket.io-client`.
- `jspdf` + `html2canvas` para exportar PDF por página.

Nuevos archivos:

```text
storefront/src/lib/board/
  yProvider.ts           // SocketIOProvider custom (join/update/awareness)
  useBoardPage.ts        // hook: conecta Yjs doc + tiptap + awareness
  useBoardDrawing.ts     // shapes Y.Array + input handlers
  colors.ts              // paleta consistente para cursores

storefront/src/components/board/
  BoardShell.tsx         // sidebar páginas + toolbar + área central
  PageList.tsx           // CRUD páginas, drag-reorder
  Editor.tsx             // Tiptap con toolbar completa
  Toolbar.tsx            // headings, fuente, tamaño, color, tabla, imagen, etc.
  DrawLayer.tsx          // overlay canvas con herramientas de dibujo
  PresenceBar.tsx        // avatares + colores por usuario activo
  CursorOverlay.tsx      // cursores remotos (nombre + color)
  VersionHistory.tsx     // lista + restaurar
  InviteDialog.tsx       // buscar usuario y asignar rol

storefront/src/routes/_authenticated/
  boards.index.tsx       // lista mis boards + crear
  boards.$boardId.tsx    // layout con <Outlet/> para páginas
  boards.$boardId.pages.$pageId.tsx  // vista de página activa
```

Endpoints añadidos en `endpoints.ts`: `pages.list/create/rename/reorder/duplicate/delete`, `versions.list/create/restore`.

Navegación: link "Board" en `AppShell` para estudiante y profesor, visible cuando exista al menos un board. Desde `teacher.students.$studentId` y `app.calendar` se enlaza al board de la clase.

### Modelo de datos en tiempo real

- Un `Y.Doc` **por página** (no por board) para minimizar tráfico.
- Dentro del doc: `Y.XmlFragment('prosemirror')` para Tiptap + `Y.Array('shapes')` para dibujo + `Y.Map('meta')` para settings.
- Awareness lleva `{ userId, name, color, cursor, tool }`.
- Cliente asigna `clientOpId = crypto.randomUUID()` por update; servidor descarta duplicados.
- Reconexión: al `connect` el cliente envía `since=lastSeqLocal`; server responde con updates faltantes → aplicados con `Y.applyUpdate`.

### Seguridad

- Todo pasa por `JwtAuthGuard` (REST) y verificación JWT en el handshake del socket.
- RLS lógica en `ensureMember`.
- Límite tamaño update: 256 KB; tamaño snapshot: 5 MB; imágenes subidas al bucket `board-uploads` con firma.

## Entregables por iteración

**B1 — Datos y páginas (backend)**: migración, CRUD páginas, endpoints REST, snapshot Yjs vacío al crear.
**B2 — Provider Yjs + editor mínimo (frontend)**: rutas `boards.*`, lista, crear, abrir, editor Tiptap básico (párrafo/heading/negrita) sincronizado.
**B3 — Toolbar completa + tablas + imágenes** (upload a storage existente).
**B4 — Capa de dibujo** con Y.Array de shapes, herramientas y undo/redo.
**B5 — Presencia + cursores + awareness colorizada**.
**B6 — Reconexión robusta, snapshotting periódico, versiones manuales y restauración**.
**B7 — Auto-provisioning**: crear board al reservar clase, invitaciones y roles desde UI.
**B8 — Exportar PDF/Markdown y pulido UI/responsive móvil**.

Cada iteración cierra con build + typecheck backend/storefront verdes.

## Consideraciones y trade-offs

- **Yjs vs. OT propio**: Yjs elimina conflictos gratis y tiene binding oficial de Tiptap; el costo es ~40 KB gz.
- **tldraw descartado**: pesa >500 KB y su licencia comercial requiere atención; canvas propio con `perfect-freehand` es más liviano y suficiente para pizarra de clase.
- **Socket.IO ya montado** en backend: reutilizamos el mismo namespace, no añadimos Redis por ahora (single-instance Railway). Si escala, se enchufa `RedisIoAdapter` que ya existe.
- **Mobile**: dibujo con touch usando pointer events; toolbar colapsable.
- **Sin OT server-side**: el server solo persiste y reenvía updates opacos de Yjs; la resolución vive en el cliente.

## Preguntas abiertas (asumo defaults si no respondes)

1. ¿El board por clase debe permitir también invitar a un tercer usuario (ej. otro profesor observador)? **Default: sí, solo owner puede invitar como `viewer`.**
2. ¿Guardar historial de versiones automático cada N minutos o solo manual? **Default: snapshot cada 50 ops + botón manual "Guardar versión".**
3. ¿Necesitas comentarios/anotaciones tipo Google Docs (hilos por selección)? **Default: fuera de alcance en esta ronda; se puede agregar como B9.**
